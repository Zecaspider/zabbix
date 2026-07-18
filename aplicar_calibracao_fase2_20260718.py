"""Calibracao — FASE 2 (pos-verificacao do lote C1-C6 de 2026-07-18).

Corrige os 2 achados da verificacao pos-apply:

  F2a (Infra)   O canario de egress com www.google.com le 0 ate DE DIA —
                a saida do server e whitelist por destino, google nunca passa.
                Redesenho: 2 items para destinos de negocio independentes
                (www.bpc.ao + mundial.rtcom.pt, hosters/paises diferentes) e
                trigger = AMBOS em falha 5m (padrao de correlacao do DNS).
                So dispara em bloqueio de egress; a queda real de 1 site
                continua a alarmar pelo proprio app-*.
                O item google e desactivado (fica de prova da whitelist).
  F2b (Infra)   Fechar os 12 problemas ICMP orfaos dos nos OCP/OKD:
                manual_close=1 na trigger-mae do template BPC Ping ->
                event.acknowledge close -> manual_close=0 de volta
                (comportamento da frota volta ao original).
  F2c (Network) Fechar os 2 problemas 'Temperature too low' orfaos:
                manual_close=1 nas 2 triggers locais (ja desactivadas) ->
                close. manual_close fica a 1 (inocuo em trigger desactivada).

DRY-RUN por omissao; --apply para escrever. --only f2a|f2b|f2c disponivel.
Backup em documentacao/backup-calibracao-fase2-<ts>.json.
"""
import datetime
import json
import os
import re
import sys
import urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
INFRA_URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
NET_URL = "http://10.10.233.140/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
ONLY = sys.argv[sys.argv.index("--only") + 1].lower() if "--only" in sys.argv else None
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

CANARY_HOSTID = "14753"
CANARY_HOST = "BPC Egress Canary"
CANARY_TRIGGER = "173794"
OLD_KEY = "net.tcp.service[https,www.google.com,443]"
KEY_A = "net.tcp.service[https,www.bpc.ao,443]"
KEY_B = "net.tcp.service[https,mundial.rtcom.pt,443]"
TPL_PING_TRIG = "124568"          # 'Unavailable by ICMP ping' no template BPC Ping
HOSTS_OCP = ["ibm-cp-storage-01", "ibm-cp-storage-02", "ibm-cp-storage-03",
             "ibm-cp-worker-01", "ibm-cp-worker-02", "ibm-cp-worker-03",
             "ibm-cp-worker-04", "ibm-cp-worker-05", "ibm-cp-worker-06",
             "VS8000982", "VS8000983", "VS8000984"]
NET_TRIGS = ["30170", "63701"]


def load_tokens():
    raw = open(TOKEN_FILE, encoding="utf-8-sig").read()
    toks, label = {}, None
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        if re.match(r"^[A-Za-z0-9]{64}$", s):
            if label:
                toks[label] = s
            label = None
        else:
            label = s.lower()
    return toks


TOKS = load_tokens()


def call(url, tok, method, params):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    hdr = {"Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok}
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(f"{method}: {json.dumps(out['error'])}")
    return out["result"]


def infra(method, params):
    return call(INFRA_URL, TOKS["zabbix ifnra"], method, params)


def net(method, params):
    return call(NET_URL, TOKS["zabbix de network"], method, params)


BKP = {"executado_em": TS, "apply": APPLY, "fases": {}}


def f2a():
    print("\n== F2a: redesenho do canario (par de destinos de negocio) ==")
    items = infra("item.get", {"hostids": CANARY_HOSTID,
                               "output": ["itemid", "key_", "status", "lastvalue"]})
    BKP["fases"]["F2a_pre_items"] = items
    by_key = {i["key_"]: i for i in items}
    iface = infra("hostinterface.get", {"hostids": CANARY_HOSTID,
                                        "output": ["interfaceid"]})[0]["interfaceid"]
    print(f"  items actuais: {[(i['key_'], i['lastvalue']) for i in items]}")
    plano = [
        (KEY_A, "Egress TLS canario A (www.bpc.ao)"),
        (KEY_B, "Egress TLS canario B (mundial.rtcom.pt)"),
    ]
    for key, name in plano:
        if key in by_key:
            print(f"  item ja existe: {key}")
        else:
            print(f"  criar item: {key}")
            if APPLY:
                infra("item.create", {"hostid": CANARY_HOSTID, "interfaceid": iface,
                                      "type": 3, "value_type": 3, "name": name,
                                      "key_": key, "delay": "1m",
                                      "tags": [{"tag": "servico", "value": "EGRESS"}]})
    new_expr = (f"min(/{CANARY_HOST}/{KEY_A},5m)=0 and "
                f"min(/{CANARY_HOST}/{KEY_B},5m)=0")
    print(f"  trigger {CANARY_TRIGGER} nova expressao: {new_expr}")
    if APPLY:
        infra("trigger.update", {"triggerid": CANARY_TRIGGER, "expression": new_expr})
        if OLD_KEY in by_key and by_key[OLD_KEY]["status"] == "0":
            infra("item.update", {"itemid": by_key[OLD_KEY]["itemid"], "status": 1})
            print(f"  item google desactivado (prova da whitelist, nao apagado)")


def f2b():
    print("\n== F2b: fechar os 12 problemas ICMP orfaos (OCP/OKD) ==")
    pre = infra("trigger.get", {"triggerids": TPL_PING_TRIG,
                                "output": ["triggerid", "manual_close"]})
    BKP["fases"]["F2b_pre"] = pre
    hosts = infra("host.get", {"filter": {"host": HOSTS_OCP}, "output": ["hostid"]})
    hids = [h["hostid"] for h in hosts]
    probs = infra("problem.get", {"hostids": hids, "output": ["eventid", "name"]})
    icmp = [p for p in probs if "ICMP" in p["name"]]
    print(f"  manual_close actual da trigger-mae: {pre[0]['manual_close']}"
          f" | {len(icmp)} eventos a fechar")
    if not APPLY:
        return
    infra("trigger.update", {"triggerid": TPL_PING_TRIG, "manual_close": 1})
    try:
        infra("event.acknowledge", {"eventids": [p["eventid"] for p in icmp],
            "action": 1,
            "message": "IP de interface = rede de pods OpenShift (nunca pingavel); items icmp desactivados no despiste 2026-07-18"})
        print(f"  {len(icmp)} eventos fechados")
    finally:
        infra("trigger.update", {"triggerid": TPL_PING_TRIG, "manual_close": 0})
        print("  manual_close da trigger-mae reposto a 0 (frota inalterada)")
    left = infra("problem.get", {"hostids": hids, "output": ["eventid", "name"]})
    print(f"  verif: {sum(1 for p in left if 'ICMP' in p['name'])} problemas ICMP restantes")


def f2c():
    print("\n== F2c (Network): fechar os 2 problemas de temperatura orfaos ==")
    probs = net("problem.get", {"objectids": NET_TRIGS, "output": ["eventid", "name"]})
    BKP["fases"]["F2c_pre"] = probs
    print(f"  {len(probs)} eventos a fechar")
    if not APPLY or not probs:
        return
    for tid in NET_TRIGS:
        net("trigger.update", {"triggerid": tid, "manual_close": 1})
    net("event.acknowledge", {"eventids": [p["eventid"] for p in probs],
        "action": 1,
        "message": "sensor avariado (le 0 ha ~10 meses, limiar hardcoded <5) — trigger desactivada no despiste 2026-07-18"})
    left = net("problem.get", {"objectids": NET_TRIGS, "output": ["eventid"]})
    print(f"  verif: {len(left)} restantes")


def main():
    print("== APPLY ==" if APPLY else "== DRY-RUN (nada escrito; --apply para executar) ==")
    for key, fn in [("f2a", f2a), ("f2b", f2b), ("f2c", f2c)]:
        if ONLY is None or ONLY == key:
            fn()
    bfile = os.path.join(HERE, "documentacao", f"backup-calibracao-fase2-{TS}.json")
    json.dump(BKP, open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nbackup/log: {bfile}")


if __name__ == "__main__":
    main()
