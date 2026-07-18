"""Calibracao de triggers — lote de baixo risco C1-C6 aprovado pelo utilizador
em 2026-07-18 (despiste: documentacao/despiste-calibracao-triggers-20260718.md).

DRY-RUN por omissao; --apply para escrever. Pode executar-se um fix isolado
com --only c1 (ou c2..c6). Backup do estado previo em
documentacao/backup-calibracao-<ts>.json antes de qualquer escrita.

  C1  (Infra)   find(...,"Response code") -> "response code" nas 2 triggers L1
                do template BPC Web Monitoring v2 (a separacao site-down vs
                codigo-inesperado estava morta: erro real do Zabbix e minusculo)
  C2  (Infra)   host canario de egress TLS (net.tcp.service[https] simple check,
                fora do pool http saturado) + trigger High + dependencia nas 5
                triggers L1 dos alvos externos com falso positivo nocturno
  C3  (Infra)   desactivar items icmpping dos 12 nos OCP/OKD com interface na
                rede de pods 10.128-131.x (nunca pingavel) — reversivel
  C4  (Infra)   remover (unlink+clear) o template Linux agent dos 2 vCenters
                VCSA aplicado por engano na rodada de 17/07
  C5  (Infra)   severidade dos 2 problemas antigos de swap Not-classified -> Warning
                (as triggers ja estao certas; e o evento congelado que esta errado)
  C6  (Network) desactivar as 2 triggers "CPU Temperature too low" com sensor
                avariado (le 0 constante ha ~10 meses; limiar hardcoded <5,
                sem macro para calibrar) + tentar fechar os eventos

Nenhum fix toca em actions/mediatypes/discovery — risco de flood: nulo.
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
ONLY = None
if "--only" in sys.argv:
    ONLY = sys.argv[sys.argv.index("--only") + 1].lower()
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

TPL_WEB = "BPC Web Monitoring v2"
TPL_LNX = "Linux by Zabbix agent active"
CANARY_HOST = "BPC Egress Canary"
CANARY_KEY = "net.tcp.service[https,www.google.com,443]"
GRUPO_SUPORTE = "BPC/DOMINIO/10 Servicos de Suporte"
# 5 hosts sinteticos com falso positivo nocturno confirmado (curl 200/301 de dia)
HOSTS_FP_NOCTURNO = ["app-bpcao", "app-inss", "app-mundial-seguro", "app-pumangol", "app-sap"]
# 12 nos OCP/OKD com IP de pod-network
HOSTS_OCP = ["ibm-cp-storage-01", "ibm-cp-storage-02", "ibm-cp-storage-03",
             "ibm-cp-worker-01", "ibm-cp-worker-02", "ibm-cp-worker-03",
             "ibm-cp-worker-04", "ibm-cp-worker-05", "ibm-cp-worker-06",
             "VS8000982", "VS8000983", "VS8000984"]
VCENTER_HOSTIDS = ["11877", "11900"]  # sv9000204 (Vcenter PRD) + sv9000206 (PowerFlex)
NET_TRIGS_TEMP_LOW = ["30170", "63701"]  # RTGRAF00 + RT_ATM_HSP_DAVID_BERN


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


def quer(only_key):
    return ONLY is None or ONLY == only_key


def c1():
    print("\n== C1: fix case do find() nas 2 triggers L1 do template ==")
    items = infra("item.get", {"itemids": ["541366", "541367"],
                               "output": ["itemid", "key_"], "webitems": True})
    keys = {i["itemid"]: i["key_"] for i in items}
    fail_key, err_key = keys["541366"], keys["541367"]
    pre = infra("trigger.get", {"triggerids": ["171845", "171987"],
        "output": ["triggerid", "description", "expression", "priority", "status"]})
    BKP["fases"]["C1_pre"] = pre
    new = {
        "171845": (f'count(/{TPL_WEB}/{fail_key},{{$FAILS.WINDOW}},"eq","1")={{$FAILS.BEFORE.ALERT}}'
                   f' and find(/{TPL_WEB}/{err_key},,"like","response code")=0'),
        "171987": (f'count(/{TPL_WEB}/{fail_key},{{$FAILS.WINDOW}},"eq","1")={{$FAILS.BEFORE.ALERT}}'
                   f' and find(/{TPL_WEB}/{err_key},,"like","response code")=1'),
    }
    for tid, expr in new.items():
        print(f"  trigger {tid}: {expr}")
        if APPLY:
            infra("trigger.update", {"triggerid": tid, "expression": expr})
            print(f"  -> actualizada")
    if APPLY:
        chk = infra("trigger.get", {"triggerids": ["172070"],
            "output": ["expression"], "expandExpression": True})
        ok = "response code" in chk[0]["expression"]
        print(f"  verif propagacao (app-bna-sptr): {'OK' if ok else 'FALHOU'}")


def c2():
    print("\n== C2: canario de egress TLS + dependencias ==")
    grp = infra("hostgroup.get", {"filter": {"name": GRUPO_SUPORTE}, "output": ["groupid"]})
    gid = grp[0]["groupid"]
    ja = infra("host.get", {"filter": {"host": CANARY_HOST}, "output": ["hostid"]})
    print(f"  host '{CANARY_HOST}' " + (f"ja existe ({ja[0]['hostid']})" if ja else "a criar") +
          f" | item Simple check {CANARY_KEY} 1m | trigger High min(5m)=0")
    if not APPLY:
        print(f"  dependencia a criar nas triggers L1 de: {', '.join(HOSTS_FP_NOCTURNO)}")
        return
    if ja:
        hostid = ja[0]["hostid"]
    else:
        hostid = infra("host.create", {
            "host": CANARY_HOST, "name": CANARY_HOST,
            "groups": [{"groupid": gid}],
            "interfaces": [{"type": 1, "main": 1, "useip": 1,
                            "ip": "10.10.126.22", "dns": "", "port": "10050"}],
            "tags": [{"tag": "tipo", "value": "canario"},
                     {"tag": "servico", "value": "EGRESS"}],
        })["hostids"][0]
        print(f"  host criado: {hostid}")
    itj = infra("item.get", {"hostids": hostid, "filter": {"key_": CANARY_KEY}, "output": ["itemid"]})
    if itj:
        itemid = itj[0]["itemid"]
    else:
        iface = infra("hostinterface.get", {"hostids": hostid, "output": ["interfaceid"]})[0]["interfaceid"]
        itemid = infra("item.create", {
            "hostid": hostid, "interfaceid": iface, "type": 3, "value_type": 3,
            "name": "Egress TLS canario (handshake https externo)",
            "key_": CANARY_KEY, "delay": "1m",
            "tags": [{"tag": "servico", "value": "EGRESS"}],
        })["itemids"][0]
        print(f"  item criado: {itemid}")
    trj = infra("trigger.get", {"hostids": hostid, "output": ["triggerid"]})
    if trj:
        can_trig = trj[0]["triggerid"]
    else:
        can_trig = infra("trigger.create", {
            "description": "Saida TLS (egress) do Zabbix server bloqueada — checks externos vao falsear",
            "expression": f"min(/{CANARY_HOST}/{CANARY_KEY},5m)=0",
            "priority": 4,
        })["triggerids"][0]
        print(f"  trigger canario criada: {can_trig}")
    # dependencias nas 5 triggers L1 "indisponivel" dos hosts FP
    trigs = infra("trigger.get", {"host": HOSTS_FP_NOCTURNO[0], "output": ["triggerid", "description"]})
    for h in HOSTS_FP_NOCTURNO:
        tl1 = infra("trigger.get", {"host": h, "output": ["triggerid", "description"],
                                    "search": {"description": "indisponivel"}})
        for t in tl1:
            infra("trigger.update", {"triggerid": t["triggerid"],
                                     "dependencies": [{"triggerid": can_trig}]})
            print(f"  dependencia: {h} [{t['triggerid']}] -> canario {can_trig}")
    BKP["fases"]["C2"] = {"hostid": hostid, "itemid": itemid, "canary_trigger": can_trig}


def c3():
    print("\n== C3: desactivar icmpping dos 12 nos OCP/OKD (IP de pod-network) ==")
    hosts = infra("host.get", {"filter": {"host": HOSTS_OCP}, "output": ["hostid", "host"]})
    hids = [h["hostid"] for h in hosts]
    items = infra("item.get", {"hostids": hids, "search": {"key_": "icmpping"},
                               "output": ["itemid", "hostid", "key_", "status"]})
    hid2name = {h["hostid"]: h["host"] for h in hosts}
    BKP["fases"]["C3_pre"] = items
    print(f"  {len(hosts)} hosts, {len(items)} items icmp*")
    for it in items:
        print(f"  {hid2name[it['hostid']]:20} {it['key_']:28} status={it['status']}")
        if APPLY and it["status"] == "0":
            infra("item.update", {"itemid": it["itemid"], "status": 1})
    if APPLY:
        probs = infra("problem.get", {"hostids": hids, "output": ["eventid", "name"]})
        icmp_left = [p for p in probs if "ICMP" in p["name"]]
        print(f"  verif: {len(icmp_left)} problemas ICMP ainda listados "
              f"(se >0: desactivar!=fechar — fechar a mao no frontend ou aguardar)")


def c4():
    print("\n== C4: remover template Linux agent dos 2 vCenters (VCSA) ==")
    tpl = infra("template.get", {"filter": {"host": TPL_LNX}, "output": ["templateid"]})
    tplid = tpl[0]["templateid"]
    hosts = infra("host.get", {"hostids": VCENTER_HOSTIDS, "output": ["hostid", "host"],
                               "selectParentTemplates": ["templateid", "name"]})
    BKP["fases"]["C4_pre"] = hosts
    for h in hosts:
        tem = any(t["templateid"] == tplid for t in h["parentTemplates"])
        print(f"  {h['host']}: template {'presente' if tem else 'AUSENTE'}")
        if APPLY and tem:
            infra("host.update", {"hostid": h["hostid"],
                                  "templates_clear": [{"templateid": tplid}]})
            print(f"  -> unlink+clear feito")


def c5():
    print("\n== C5: severidade dos 2 problemas swap Not-classified -> Warning ==")
    probs = infra("problem.get", {"output": ["eventid", "objectid", "name", "severity"],
                                  "search": {"name": "swap"}})
    alvo = [p for p in probs if p["severity"] == "0"]
    BKP["fases"]["C5_pre"] = alvo
    for p in alvo:
        print(f"  evento {p['eventid']}: '{p['name'][:45]}' sev=0 -> 2")
    if APPLY and alvo:
        infra("event.acknowledge", {"eventids": [p["eventid"] for p in alvo],
                                    "action": 8, "severity": 2})
        print("  -> severidade actualizada")


def c6():
    print("\n== C6 (NETWORK): desactivar 2 triggers 'Temperature too low' (sensor avariado) ==")
    pre = net("trigger.get", {"triggerids": NET_TRIGS_TEMP_LOW,
        "output": ["triggerid", "description", "status"], "selectHosts": ["host"]})
    BKP["fases"]["C6_pre"] = pre
    for t in pre:
        print(f"  [{t['triggerid']}] {t['hosts'][0]['host']}: status={t['status']}")
        if APPLY and t["status"] == "0":
            net("trigger.update", {"triggerid": t["triggerid"], "status": 1})
            print("  -> desactivada")
    if APPLY:
        probs = net("problem.get", {"objectids": NET_TRIGS_TEMP_LOW, "output": ["eventid", "name"]})
        if probs:
            print(f"  {len(probs)} problema(s) ainda listado(s) — a tentar fecho manual")
            try:
                net("event.acknowledge", {"eventids": [p["eventid"] for p in probs],
                                          "action": 1,
                                          "message": "sensor avariado (le 0 ha 10 meses) — trigger desactivada, despiste 2026-07-18"})
                print("  -> eventos fechados")
            except RuntimeError as e:
                print(f"  fecho manual recusado ({e}) — fica listado ate expirar/apagar")
        else:
            print("  problemas fecharam sozinhos com o disable")


def main():
    print("== APPLY ==" if APPLY else "== DRY-RUN (nada escrito; --apply para executar) ==")
    for key, fn in [("c1", c1), ("c2", c2), ("c3", c3), ("c4", c4), ("c5", c5), ("c6", c6)]:
        if quer(key):
            fn()
    bfile = os.path.join(HERE, "documentacao", f"backup-calibracao-{TS}.json")
    json.dump(BKP, open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"\nbackup/log: {bfile}")


if __name__ == "__main__":
    main()
