"""Verifica EMPIRICAMENTE que tipo de UUID o Zabbix espera na macro
{$VMWARE.VM.UUID}, cruzando (so leitura):
  1. o valor da macro de cada host classificado por namespace:
     instance_uuid (50xx, do vCenter live) vs bios_uuid (42xx) vs desconhecido
  2. o estado real dos itens vmware.vm.* desse host (coletando? unsupported?)
Se os hosts com macro=instance coletam e os com macro=bios nao (ou vice
versa), temos o veredicto com dados — nao com suposicao.

Saida: verificacao-uuid.json
"""
import json
import os
import re
import urllib.request
from collections import Counter, defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(json.dumps(out["error"]))
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
    inv = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))
    live = [v for v in inv["vms"] if v["fonte"].startswith("live")]
    inst = {(v.get("instance_uuid") or "").lower(): v["name"] for v in live} - \
        {""} if False else {(v.get("instance_uuid") or "").lower(): v["name"]
                            for v in live if v.get("instance_uuid")}
    bios = {(v.get("bios_uuid") or "").lower(): v["name"]
            for v in live if v.get("bios_uuid")}
    snap_uuid = {(v.get("instance_uuid") or "").lower(): v["name"]
                 for v in inv["vms"] if not v["fonte"].startswith("live")
                 and v.get("instance_uuid")}  # coluna UUID do Excel (=BIOS)

    macros = call("usermacro.get", {"output": ["hostid", "macro", "value"],
                                    "filter": {"macro": "{$VMWARE.VM.UUID}"}}, tok)
    hosts = call("host.get", {"output": ["hostid", "host", "name"],
                              "hostids": [m["hostid"] for m in macros]}, tok)
    hname = {h["hostid"]: h["name"] for h in hosts}

    # itens vmware.vm.* por host: estado 0=normal, 1=not supported
    items = call("item.get", {
        "hostids": [m["hostid"] for m in macros],
        "search": {"key_": "vmware.vm"},
        "output": ["hostid", "key_", "state", "error", "lastclock"]}, tok)
    per_host = defaultdict(lambda: {"ok": 0, "unsup": 0, "com_dado": 0})
    for it in items:
        s = per_host[it["hostid"]]
        if it["state"] == "1":
            s["unsup"] += 1
        else:
            s["ok"] += 1
            if int(it.get("lastclock") or 0) > 0:
                s["com_dado"] += 1

    res = []
    for m in macros:
        v = (m["value"] or "").lower()
        if v in inst:
            ns = "instance(50xx-live)"
        elif v in bios:
            ns = "bios(42xx-live)"
        elif v in snap_uuid:
            ns = "bios(42xx-snapshot/PowerFlex)"
        elif v.startswith("50"):
            ns = "parece-instance(nao-verificavel)"
        elif v.startswith(("42", "56", "42")):
            ns = "parece-bios(nao-verificavel)"
        else:
            ns = "desconhecido"
        st = per_host.get(m["hostid"], {"ok": 0, "unsup": 0, "com_dado": 0})
        saude = ("coleta" if st["com_dado"] > 0 and st["unsup"] == 0 else
                 "parcial" if st["com_dado"] > 0 else
                 "sem-itens-vmware" if st["ok"] + st["unsup"] == 0 else
                 "NAO-coleta")
        res.append({"hostid": m["hostid"], "host": hname.get(m["hostid"]),
                    "uuid": m["value"], "namespace": ns, "itens": st,
                    "saude_vmware": saude})

    tab = Counter((r["namespace"], r["saude_vmware"]) for r in res)
    out = {"cruzamento_namespace_x_saude": {f"{k[0]} | {k[1]}": c for k, c in sorted(tab.items())},
           "hosts": res}
    json.dump(out, open(os.path.join(HERE, "verificacao-uuid.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)
    print("namespace da macro  x  saude dos itens vmware.vm.* :")
    for k, c in sorted(tab.items()):
        print(f"  {k[0]:38} {k[1]:16} {c:4}")
    print(f"\n-> verificacao-uuid.json ({len(res)} hosts com macro)")


if __name__ == "__main__":
    main()
