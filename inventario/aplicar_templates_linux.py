"""Aplica o unico gap resolvivel por API nesta rodada: 44 hosts Linux de
producao com so=Linux confirmado (tag da rodada anterior, derivada do SO
real do vCenter) mas NENHUM template de agente OS-level (so tinham VMware
Guest + BPC Ping). Adiciona 'Linux by Zabbix agent active' — aditivo, nao
remove nada.

NOTA: isto prepara a configuracao (os itens passam a existir); NAO faz o
agente Zabbix arrancar na VM se nao estiver instalado/a correr — essa parte
e responsabilidade operacional (ver levantamento-templates-agentes.json /
relatorio de investigacao para quem tem de agir na VM).

Backup + dry-run + verificacao. Log: aplicacao-templates-linux-<ts>.json
"""
import datetime
import json
import os
import re
import sys
import urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
TPL_LNX_ATIVO = "Linux by Zabbix agent active"


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


def main():
    tok = load_token()
    d = json.load(open(os.path.join(HERE, "levantamento-templates-agentes.json"), encoding="utf-8"))
    alvo = [h for h in d["hosts"] if f"sem-template-agente-{h['so']}" in h["gaps"]
           and h["so"] == "Linux"]

    hostids = [h["hostid"] for h in alvo]
    backup = call("host.get", {"hostids": hostids, "output": ["hostid", "name"],
                               "selectParentTemplates": ["templateid", "name"]}, tok)
    bfile = os.path.join(HERE, f"backup-templates-linux-{TS}.json")
    json.dump({"criado_em": TS, "hosts_pre": backup}, open(bfile, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    tid = call("template.get", {"output": ["templateid", "name"],
               "filter": {"name": [TPL_LNX_ATIVO]}}, tok)[0]["templateid"]
    b_by_id = {h["hostid"]: h for h in backup}

    log = {"executado_em": TS, "dry_run": DRY, "aplicados": [], "pulados": [], "erros": []}
    for h in alvo:
        cur = b_by_id.get(h["hostid"])
        cur_tpls = {t["name"]: t["templateid"] for t in cur.get("parentTemplates", [])}
        if TPL_LNX_ATIVO in cur_tpls:
            log["pulados"].append({"hostid": h["hostid"], "motivo": "ja tem o template"})
            continue
        novos = [{"templateid": tidv} for tidv in cur_tpls.values()] + [{"templateid": tid}]
        if not DRY:
            call("host.update", {"hostid": h["hostid"], "templates": novos}, tok)
        log["aplicados"].append({"hostid": h["hostid"], "host": cur["name"],
                                 "ping": h.get("ping"), "tcp10050": h.get("tcp10050")})

    falhas = []
    if not DRY:
        pos = call("host.get", {"hostids": [a["hostid"] for a in log["aplicados"]] or ["0"],
                                "output": ["hostid"], "selectParentTemplates": ["name"]}, tok)
        pt = {h["hostid"]: {t["name"] for t in h["parentTemplates"]} for h in pos}
        for a in log["aplicados"]:
            if TPL_LNX_ATIVO not in pt.get(a["hostid"], set()):
                falhas.append({"hostid": a["hostid"], "check": "template nao confere"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}

    lfile = os.path.join(HERE, f"aplicacao-templates-linux-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{'[DRY-RUN] ' if DRY else ''}aplicados: {len(log['aplicados'])} | "
          f"pulados: {len(log['pulados'])} | verif: {'OK' if not falhas else f'{len(falhas)} FALHAS'}")
    ja_ok = sum(1 for a in log["aplicados"] if a.get("tcp10050"))
    print(f"  destes, {ja_ok} ja respondem no 10050 agora (deviam comecar a coletar em breve);"
          f" os restantes precisam do agente ser instalado/ligado na VM")
    print(f"backup: {bfile}\nlog: {lfile}")


if __name__ == "__main__":
    main()
