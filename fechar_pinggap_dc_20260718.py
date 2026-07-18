"""Fecha o gap de disponibilidade do Datacenter Fisico (dominio 08, grupo 665).

Achado (2026-07-18): 23 dos 30 hosts fisicos tinham 0 items monitorizados —
22 porque estao DESACTIVADOS no Zabbix (status=1), 1 activo mas sem template.
Incluem IBM Power E980/720/770 (suspeitos de core bancario), HMC, e 14 nos
PowerFlex. Ninguem sabe se estao de pe.

Accao (decisao do utilizador: fechar o ping-gap primeiro):
  - adicionar template 'BPC Ping' (14074) aos 23 (ICMP: icmpping/loss/sec +
    trigger 'Unavailable by ICMP ping' High)
  - activar (status=0) os 22 desactivados

Risco de flood: NULO. O mediatype Email esta OFF e nenhuma action dispara
(confirmado nas auditorias). BPC Ping e so ICMP (nao e discovery rule que
descobre centenas de items). Hosts que o servidor nao alcancar mostrarao
'Unavailable by ICMP ping' — isso e o SINAL pretendido (expor o gap), nao ruido.

Backup do estado previo (status + templates) em documentacao/. Reversivel:
para reverter, repor status=1 e remover o template dos hosts do backup.

DRY-RUN por omissao; --apply escreve.
"""
import datetime, json, os, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
GID_DC = "665"
TPL_PING = "14074"  # BPC Ping


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


def main():
    hosts = call("host.get", {"groupids": [GID_DC],
        "output": ["hostid", "host", "name", "status"],
        "selectParentTemplates": ["templateid", "name"]})
    alvo = []
    for h in hosts:
        n = call("item.get", {"hostids": [h["hostid"]], "monitored": True, "countOutput": True})
        if int(n) == 0:
            alvo.append(h)

    bkp = {"ts": TS, "hosts": [{"hostid": h["hostid"], "host": h["host"],
            "status_antes": h["status"],
            "templates_antes": [t["templateid"] for t in h.get("parentTemplates", [])]} for h in alvo]}
    json.dump(bkp, open(os.path.join(HERE, "documentacao", f"backup-pinggap-dc-{TS}.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)

    a_activar = [h for h in alvo if h["status"] == "1"]
    print("== APPLY ==" if APPLY else "== DRY-RUN (nada escrito; --apply) ==")
    print(f"\n{len(alvo)} hosts alvo (grupo 665, 0 items):")
    print(f"  a activar (status 1->0): {len(a_activar)}")
    print(f"  a adicionar template BPC Ping: {len(alvo)}")
    for h in alvo:
        temtpl = any(t["templateid"] == TPL_PING for t in h.get("parentTemplates", []))
        acts = []
        if h["status"] == "1":
            acts.append("ACTIVAR")
        if not temtpl:
            acts.append("+BPC Ping")
        print(f"   {h['name'][:40]:40} {', '.join(acts) or '(nada)'}")

    if not APPLY:
        print(f"\n[DRY-RUN] backup do estado -> documentacao/backup-pinggap-dc-{TS}.json")
        return

    ok_ping = ok_enable = ja_icmp = 0
    for h in alvo:
        cur = [t["templateid"] for t in h.get("parentTemplates", [])]
        # ja tem template que fornece icmpping (ex. Cisco UCS)? entao so activa.
        ja_ucs = any("Cisco UCS" in t["name"] for t in h.get("parentTemplates", []))
        want_ping = TPL_PING not in cur and not ja_ucs
        params = {"hostid": h["hostid"]}
        if want_ping:
            params["templates"] = [{"templateid": t} for t in cur] + [{"templateid": TPL_PING}]
        if h["status"] == "1":
            params["status"] = 0
        if len(params) == 1:
            continue
        try:
            call("host.update", params)
            if want_ping:
                ok_ping += 1
            if h["status"] == "1":
                ok_enable += 1
        except RuntimeError as e:
            if "already inherited" in str(e):
                # colisao de icmpping — activar sem adicionar o template
                if h["status"] == "1":
                    call("host.update", {"hostid": h["hostid"], "status": 0})
                    ok_enable += 1
                ja_icmp += 1
            else:
                raise
    print(f"\n[APPLY] {ok_enable} hosts activados, {ok_ping} com BPC Ping adicionado, "
          f"{ja_icmp} ja tinham icmpping (so activados). A aguardar polling ICMP (~1-2 min).")
    print(f"[APPLY] backup: documentacao/backup-pinggap-dc-{TS}.json")


if __name__ == "__main__":
    main()
