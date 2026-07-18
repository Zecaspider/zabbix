"""Aplica as seccoes 1 (IPs de interface) e 5 (templates de SO) do plano,
com VALIDACAO PREVIA por host — um item so e aplicado se a validacao passar:

Seccao 1 (hostinterface.update):
  - valida: ping + TCP 10050 ao IP NOVO (e ao antigo, para contexto) +
    estado available/error da interface no Zabbix.
  - regra: IP novo tem de responder (ping OU tcp10050) a partir desta
    maquina; caso contrario o item fica RETIDO (validar manualmente).

Seccao 5 (troca de template Windows<->Linux):
  - valida: os itens herdados do template ERRADO nao podem ter historico
    (lastclock==0 em todos). Se algum coletou, RETIDO (evidencia contradiz).
  - aplica: host.update com templates_clear=[errado] (unlink+clear — seguro
    porque foi provado que nao ha dados) e templates=[atuais - errado + certo].

Backups + verificacao por releitura. Logs: aplicacao-seccoes15-<ts>.json
Uso: python aplicar_seccoes_1_5.py [--dry-run]
"""
import datetime
import json
import os
import re
import socket
import subprocess
import sys
import urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=90) as r:
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


def ping(ip):
    try:
        r = subprocess.run(["ping", "-n", "2", "-w", "1000", ip],
                           capture_output=True, text=True, timeout=10)
        return "TTL=" in r.stdout
    except Exception:
        return False


def tcp10050(ip):
    try:
        with socket.create_connection((ip, 10050), timeout=2):
            return True
    except Exception:
        return False


def main():
    tok = load_token()
    plano = json.load(open(os.path.join(HERE, "plano-correcao.json"), encoding="utf-8"))
    log = {"executado_em": TS, "dry_run": DRY,
           "s1_aplicados": [], "s1_retidos": [],
           "s5_aplicados": [], "s5_retidos": [], "erros": []}

    # ================== SECCAO 1: IPs ==================
    s1 = plano["1_ip_interface"]
    hostids1 = [x["hostid"] for x in s1]
    ifaces = call("hostinterface.get", {"hostids": hostids1, "output": "extend"}, tok)
    if_by_id = {i["interfaceid"]: i for i in ifaces}

    for x in s1:
        novo, atual = x["ip_proposto"], x["ip_atual_zabbix"]
        atual0 = atual[0] if isinstance(atual, list) else atual
        iid = x["params"]["interfaceid"]
        iface = if_by_id.get(str(iid)) if iid else None
        val = {
            "ping_novo": ping(novo), "tcp10050_novo": tcp10050(novo),
            "ping_antigo": ping(atual0), "tcp10050_antigo": tcp10050(atual0),
            "iface_available": iface.get("available") if iface else None,
            "iface_error": (iface.get("error") or "")[:120] if iface else None,
        }
        item = {"hostid": x["hostid"], "host": x["zabbix_host"],
                "ip_antigo": atual0, "ip_novo": novo, "validacao": val}
        if not iid:
            item["motivo"] = "sem interfaceid principal identificado"
            log["s1_retidos"].append(item)
            continue
        if not (val["ping_novo"] or val["tcp10050_novo"]):
            item["motivo"] = "IP novo nao responde (ping/10050) a partir desta maquina — validar manualmente"
            log["s1_retidos"].append(item)
            continue
        if not DRY:
            call("hostinterface.update", {"interfaceid": iid, "ip": novo,
                                          "useip": 1}, tok)
        item["motivo"] = "validado: IP novo responde"
        log["s1_aplicados"].append(item)

    # ================== SECCAO 5: templates ==================
    s5 = plano["5_templates_so"]
    tpl = call("template.get", {"output": ["templateid", "name"],
               "filter": {"name": ["Windows by Zabbix agent active",
                                   "Linux by Zabbix agent active"]}}, tok)
    tplid = {t["name"]: t["templateid"] for t in tpl}
    hosts5 = call("host.get", {"hostids": [x["hostid"] for x in s5],
                               "output": ["hostid", "name"],
                               "selectParentTemplates": ["templateid", "name"]}, tok)
    h5 = {h["hostid"]: h for h in hosts5}

    # chaves de item de cada template (para achar os itens herdados no host)
    tpl_keys = {}
    for name, tid in tplid.items():
        its = call("item.get", {"templateids": tid, "output": ["key_"]}, tok)
        tpl_keys[name] = {i["key_"] for i in its}

    for x in s5:
        m = re.match(r"trocar '(.+)' por '(.+)'", x["acao_proposta"])
        errado, certo = m.group(1), m.group(2)
        cur = h5.get(x["hostid"])
        cur_tpls = {t["name"]: t["templateid"] for t in cur.get("parentTemplates", [])}
        item = {"hostid": x["hostid"], "host": x["zabbix_host"], "vm": x["vm"],
                "de": errado, "para": certo}
        if errado not in cur_tpls:
            item["motivo"] = "template errado ja nao esta no host — nada a fazer"
            log["s5_retidos"].append(item)
            continue
        # validacao: itens herdados do template errado com dados?
        host_items = call("item.get", {"hostids": x["hostid"],
                                       "output": ["key_", "lastclock", "state"]}, tok)
        com_dado = [i["key_"] for i in host_items
                    if i["key_"] in tpl_keys[errado] and int(i.get("lastclock") or 0) > 0]
        if com_dado:
            item["motivo"] = (f"RETIDO: {len(com_dado)} itens do template '{errado}' "
                              f"TEM historico (ex. {com_dado[:3]}) — evidencia contradiz a troca")
            log["s5_retidos"].append(item)
            continue
        novos = [{"templateid": tid} for name, tid in cur_tpls.items() if name != errado]
        if certo in tplid and certo not in cur_tpls:
            novos.append({"templateid": tplid[certo]})
        if not DRY:
            call("host.update", {"hostid": x["hostid"], "templates": novos,
                                 "templates_clear": [{"templateid": cur_tpls[errado]}]}, tok)
        item["motivo"] = "validado: 0 itens do template errado com historico — unlink+clear seguro"
        log["s5_aplicados"].append(item)

    # ================== backup + verificacao ==================
    # (backup dos estados pre-mudanca ja esta em: ifaces + hosts5 acima)
    bfile = os.path.join(HERE, f"backup-seccoes15-{TS}.json")
    json.dump({"criado_em": TS, "interfaces_pre": ifaces, "hosts_templates_pre": hosts5},
              open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    falhas = []
    if not DRY:
        pos_if = call("hostinterface.get", {"hostids": hostids1, "output": "extend"}, tok)
        pos_by_id = {i["interfaceid"]: i for i in pos_if}
        for a in log["s1_aplicados"]:
            iid = next(x["params"]["interfaceid"] for x in s1 if x["hostid"] == a["hostid"])
            if pos_by_id.get(str(iid), {}).get("ip") != a["ip_novo"]:
                falhas.append({"hostid": a["hostid"], "check": "IP nao confere"})
        pos_h = call("host.get", {"hostids": [a["hostid"] for a in log["s5_aplicados"]] or ["0"],
                                  "output": ["hostid"],
                                  "selectParentTemplates": ["name"]}, tok)
        pos_tpl = {h["hostid"]: {t["name"] for t in h["parentTemplates"]} for h in pos_h}
        for a in log["s5_aplicados"]:
            got = pos_tpl.get(a["hostid"], set())
            if a["de"] in got or a["para"] not in got:
                falhas.append({"hostid": a["hostid"], "check": "templates nao conferem"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}

    lfile = os.path.join(HERE, f"aplicacao-seccoes15-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{'[DRY-RUN] ' if DRY else ''}S1: {len(log['s1_aplicados'])} aplicados, "
          f"{len(log['s1_retidos'])} retidos | S5: {len(log['s5_aplicados'])} aplicados, "
          f"{len(log['s5_retidos'])} retidos | verificacao: "
          f"{'OK' if not falhas else f'{len(falhas)} FALHAS'}")
    for a in log["s1_aplicados"]:
        print(f"  S1 OK  {a['host'][:45]:45} {a['ip_antigo']} -> {a['ip_novo']}")
    for r in log["s1_retidos"]:
        print(f"  S1 RET {r['host'][:45]:45} {r['ip_antigo']} -> {r['ip_novo']} :: {r['motivo'][:60]}")
    for a in log["s5_aplicados"]:
        print(f"  S5 OK  {a['host'][:45]:45} {a['de'][:20]} -> {a['para'][:20]}")
    for r in log["s5_retidos"]:
        print(f"  S5 RET {r['host'][:45]:45} :: {r['motivo'][:80]}")
    print(f"backup: {bfile}\nlog: {lfile}")


if __name__ == "__main__":
    main()
