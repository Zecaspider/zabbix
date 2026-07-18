"""Remove a tag esxi_host de todos os hosts (aprovado pelo utilizador
2026-07-17). Motivo: DRS/vMotion torna a tag volatil — mente ao proximo
movimento. A informacao fresca esta sempre no item vmware.vm.hv.name do
template VMware Guest. Mantem vcenter_cluster (estavel).
Backup + dry-run + verificacao. Log: aplicacao-rm-esxihost-<ts>.json
"""
import datetime, json, os, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(f"{method}: {json.dumps(out['error'])}")
    return out["result"]


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


def main():
    tok = load_token()
    hosts = call("host.get", {"output": ["hostid", "name"], "selectTags": "extend",
                              "tags": [{"tag": "esxi_host", "operator": 0, "value": ""}]}, tok)
    # operator 0 = "contains"; value "" apanha qualquer valor -> filtra abaixo
    alvo = [h for h in hosts if any(t["tag"] == "esxi_host" for t in h.get("tags", []))]
    bfile = os.path.join(HERE, f"backup-rm-esxihost-{TS}.json")
    json.dump({"criado_em": TS, "hosts_pre": alvo}, open(bfile, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    log = {"executado_em": TS, "dry_run": DRY, "removidos": [], "erros": []}
    for h in alvo:
        novas = [{"tag": t["tag"], "value": t["value"]}
                 for t in h.get("tags", []) if t["tag"] != "esxi_host"]
        if not DRY:
            call("host.update", {"hostid": h["hostid"], "tags": novas}, tok)
        log["removidos"].append({"hostid": h["hostid"], "host": h["name"]})

    falhas = []
    if not DRY:
        pos = call("host.get", {"hostids": [r["hostid"] for r in log["removidos"]] or ["0"],
                                "output": ["hostid"], "selectTags": "extend"}, tok)
        for h in pos:
            if any(t["tag"] == "esxi_host" for t in h.get("tags", [])):
                falhas.append({"hostid": h["hostid"], "check": "tag ainda presente"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}
    lfile = os.path.join(HERE, f"aplicacao-rm-esxihost-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{'[DRY-RUN] ' if DRY else ''}esxi_host removido de {len(log['removidos'])} hosts | "
          f"verif: {'OK' if not falhas else f'{len(falhas)} FALHAS'}")
    print(f"backup: {bfile}\nlog: {lfile}")


if __name__ == "__main__":
    main()
