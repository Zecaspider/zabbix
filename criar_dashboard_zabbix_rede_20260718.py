"""Cria o dashboard NATIVO gemeo no Zabbix NETWORK (10.10.233.140, 7.0):
'BPC - Triggers por Segmento (Rede)'.

Analogo do 'BPC - Triggers por Dominio' (Infra, id 170), para a instancia
Network. Segrega a Rede nos seus 3 segmentos reais, cada um = routers+switches:
  - resumo problemsbysv (os 6 grupos HG_) no topo
  - 3 widgets 'problems' (detalhe), 1 por segmento, full-width:
      Agencias (24+25) · Edificios (28+29) · Datacenter Fabric/Borda (26+27)

Escrita bloqueada na sessao Claude via classificador (destravada caso a caso
com confirmacao do utilizador). DRY-RUN por omissao; --apply cria.
Idempotente: nao duplica se ja existir (--force para recriar).
"""
import json, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.233.140/zabbix/api_jsonrpc.php"
APPLY = "--apply" in sys.argv
FORCE = "--force" in sys.argv
NAME = "BPC - Triggers por Segmento (Rede)"

# (nome do segmento, [grupos])  — grupos confirmados ao vivo
SEGMENTOS = [
    ("Agencias (routers + switches)",  ["HG_AGENCIAS_ROUTERS", "HG_AGENCIAS_SWITCHES"]),
    ("Edificios (routers + switches)", ["HG_EDIFICIOS_ROUTERS", "HG_EDIFICIOS_SWITCHES"]),
    ("Datacenter (fabric + borda)",    ["HG_DC_SWITCHES", "HG_DC_ROUTERS"]),
]
TODOS_HG = ["HG_AGENCIAS_ROUTERS", "HG_AGENCIAS_SWITCHES", "HG_EDIFICIOS_ROUTERS",
            "HG_EDIFICIOS_SWITCHES", "HG_DC_SWITCHES", "HG_DC_ROUTERS"]


def load_token():
    raw = open(TOKEN_FILE, encoding="utf-8-sig").read()
    label = None
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if re.fullmatch(r"[A-Za-z0-9]{64}", s):
            # 1o token que aparece a seguir a um rotulo com 'network'
            if label == "network":
                return s
            label = None
            continue
        low = s.lower()
        label = "network" if ("network" in low and "network2" not in low) else None


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


def main():
    groups = call("hostgroup.get", {"filter": {"name": TODOS_HG}, "output": ["groupid", "name"]})
    gid = {g["name"]: g["groupid"] for g in groups}
    faltam = [n for n in TODOS_HG if n not in gid]
    if faltam:
        raise SystemExit(f"grupos nao encontrados: {faltam}")

    widgets = []
    # resumo problemsbysv com os 6 grupos
    rf = [{"type": 0, "name": "show_type", "value": 0}]
    for j, n in enumerate(TODOS_HG):
        rf.append({"type": 2, "name": f"groupids.{j}", "value": gid[n]})
    for sev in (2, 3, 4, 5):
        rf.append({"type": 0, "name": "severities", "value": sev})
    rf.append({"type": 1, "name": "reference", "value": "BPCNR"})
    widgets.append({"type": "problemsbysv", "name": "Resumo por segmento (severidade)",
                    "x": 0, "y": 0, "width": 72, "height": 5, "view_mode": 0, "fields": rf})

    # 3 widgets problems full-width, 1 por segmento
    for i, (nome, grps) in enumerate(SEGMENTOS):
        f = []
        for j, n in enumerate(grps):
            f.append({"type": 2, "name": f"groupids.{j}", "value": gid[n]})
        f += [{"type": 0, "name": "show", "value": 3},
              {"type": 0, "name": "show_tags", "value": 1},
              {"type": 1, "name": "reference", "value": "BPCN" + str(i)}]
        for sev in (2, 3, 4, 5):
            f.append({"type": 0, "name": "severities", "value": sev})
        widgets.append({"type": "problems", "name": nome,
                        "x": 0, "y": 5 + i * 9, "width": 72, "height": 9,
                        "view_mode": 0, "fields": f})

    existing = call("dashboard.get", {"filter": {"name": NAME}, "output": ["dashboardid"]})
    print("== APPLY ==" if APPLY else "== DRY-RUN ==")
    print(f"Dashboard: '{NAME}' ({'JA EXISTE ' + existing[0]['dashboardid'] if existing else 'novo'})")
    for w in widgets:
        gids = [gg["value"] for gg in w["fields"] if gg["name"].startswith("groupids")]
        print(f"  {w['type']:12} y={w['y']:2} '{w['name']:34}' grupos={gids}")
    if not APPLY:
        print("\n[DRY-RUN] correr com --apply")
        return
    if existing and not FORCE:
        print(f"\n[APPLY] ja existe (id {existing[0]['dashboardid']}); --force para recriar. Nada feito.")
        return
    if existing and FORCE:
        call("dashboard.delete", {"dashboardids": [existing[0]["dashboardid"]]})
    res = call("dashboard.create", {"name": NAME, "display_period": 30, "auto_start": 1,
                                    "pages": [{"name": "Por Segmento", "widgets": widgets}]})
    did = res["dashboardids"][0]
    print(f"[APPLY] criado: dashboardid {did}")
    print(f"   http://10.10.233.140/zabbix/zabbix.php?action=dashboard.view&dashboardid={did}")


if __name__ == "__main__":
    main()
