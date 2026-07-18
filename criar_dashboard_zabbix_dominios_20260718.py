"""Cria um dashboard NATIVO no Zabbix Infra: 'BPC - Triggers por Dominio'.

Ao contrario do [169] 'Infraestrutura - Visao Geral' (pre-migracao: grupos
antigos 602/603/609 e so widgets problemsbysv = contagens agregadas), este
espelha o modelo actual de 9 dominios BPC/DOMINIO/* e mostra DETALHE:
  - 1 widget 'problemsbysv' no topo (matriz de severidade por dominio, resumo)
  - 9 widgets 'problems' (1 por dominio) com a lista detalhada: host, problema,
    severidade, idade, ack, tags — severidade minima Aviso (2-5).

Grelha Zabbix = 72 colunas. Layout: resumo full-width (h5), depois 9 widgets
problems em 2 colunas (w36, h8). Groupids resolvidos por nome (vivo).

Escrita no Zabbix bloqueada na sessao Claude -> correr --apply no terminal.
DRY-RUN por omissao. So cria (nao apaga nada). Idempotente: se ja existir um
dashboard com o mesmo nome, avisa e nao duplica (a menos de --force).
"""
import json, os, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
APPLY = "--apply" in sys.argv
FORCE = "--force" in sys.argv
NAME = "BPC - Triggers por Dominio"

# ordem = igual aos cards do Grafana (camadas)
DOMINIOS = [
    ("08", "Datacenter Fisico"),
    ("01", "Virtualizacao"),
    ("03", "Servidores Virtuais"),
    ("02", "Armazenamento"),
    ("06", "Bases de Dados"),
    ("09", "Integracao e APIs"),
    ("07", "Servicos de Negocio"),
    ("10", "Servicos de Suporte"),
    ("05", "Seguranca"),
]


def load_token():
    raw = open(TOKEN_FILE, encoding="utf-8-sig").read()
    label = None
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if re.fullmatch(r"[A-Za-z0-9]{64}", s):
            if label == "infra":
                return s
            label = None
            continue
        label = "infra" if ("infra" in s.lower() or "ifnra" in s.lower()) else None


TOK = load_token()


def call(method, params):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    hdr = {"Content-Type": "application/json-rpc", "Authorization": "Bearer " + TOK}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(f"{method}: {json.dumps(out['error'])}")
    return out["result"]


def ref(i):
    """referencia unica de 5 chars por widget (exigida pelo Zabbix 7.x)."""
    return ("BPCD" + "0123456789ABCDEFGHI"[i])[:5]


def build():
    groups = call("hostgroup.get", {"search": {"name": "BPC/DOMINIO"}, "output": ["groupid", "name"]})
    gid = {}
    for g in groups:
        m = re.match(r"BPC/DOMINIO/(\d\d)\s", g["name"])
        if m:
            gid[m.group(1)] = (g["groupid"], g["name"])

    widgets = []
    # 1) resumo por severidade de todos os dominios (problemsbysv), full-width
    resumo_fields = [{"type": 0, "name": "show_type", "value": 0}]  # 0 = totais por grupo
    for j, (pref, _) in enumerate(DOMINIOS):
        if pref in gid:
            resumo_fields.append({"type": 2, "name": f"groupids.{j}", "value": gid[pref][0]})
    for sev in (2, 3, 4, 5):
        resumo_fields.append({"type": 0, "name": "severities", "value": sev})
    resumo_fields.append({"type": 1, "name": "reference", "value": "BPCDR"})
    widgets.append({
        "type": "problemsbysv", "name": "Resumo por dominio (severidade)",
        "x": 0, "y": 0, "width": 72, "height": 5, "view_mode": 0, "fields": resumo_fields,
    })

    # 2) um widget 'problems' (detalhe) por dominio, 2 colunas
    missing = []
    for i, (pref, nome) in enumerate(DOMINIOS):
        if pref not in gid:
            missing.append(pref); continue
        col = i % 2
        row = i // 2
        fields = [
            {"type": 2, "name": "groupids.0", "value": gid[pref][0]},
            {"type": 0, "name": "show", "value": 3},       # 3 = History/actuais
            {"type": 0, "name": "show_tags", "value": 1},
            {"type": 0, "name": "show_opdata", "value": 1},
            {"type": 1, "name": "reference", "value": ref(i)},
        ]
        for sev in (2, 3, 4, 5):
            fields.append({"type": 0, "name": "severities", "value": sev})
        widgets.append({
            "type": "problems", "name": f"{pref} {nome}",
            "x": col * 36, "y": 5 + row * 8, "width": 36, "height": 8,
            "view_mode": 0, "fields": fields,
        })
    return widgets, gid, missing


def main():
    widgets, gid, missing = build()
    existing = call("dashboard.get", {"filter": {"name": NAME}, "output": ["dashboardid"]})

    print("== APPLY ==" if APPLY else "== DRY-RUN (nada escrito; --apply no terminal) ==")
    print(f"\nDashboard: '{NAME}'  ({'JA EXISTE id ' + existing[0]['dashboardid'] if existing else 'novo'})")
    print(f"Grupos resolvidos: {len(gid)}/9 dominios")
    if missing:
        print(f"  AVISO: dominios sem grupo resolvido: {missing}")
    print(f"Widgets: 1 resumo (problemsbysv) + {len(widgets)-1} detalhe (problems)")
    for w in widgets:
        print(f"  {w['type']:12} x={w['x']:2} y={w['y']:2} w={w['width']} h={w['height']}  '{w['name']}'")

    if not APPLY:
        print("\n[DRY-RUN] revisto? correr:  python criar_dashboard_zabbix_dominios_20260718.py --apply")
        return
    if existing and not FORCE:
        print(f"\n[APPLY] '{NAME}' ja existe (id {existing[0]['dashboardid']}). Use --force para recriar. Nada feito.")
        return
    if existing and FORCE:
        call("dashboard.delete", {"dashboardids": [existing[0]["dashboardid"]]})  # noqa
        print(f"[APPLY] dashboard antigo apagado (--force)")
    res = call("dashboard.create", {
        "name": NAME, "display_period": 30, "auto_start": 1,
        "pages": [{"name": "Por Dominio", "widgets": widgets}],
    })
    print(f"[APPLY] criado: dashboardid {res['dashboardids'][0]}")
    print(f"   http://10.10.126.22/zabbix/zabbix.php?action=dashboard.view&dashboardid={res['dashboardids'][0]}")


if __name__ == "__main__":
    main()
