"""Levantamento (so leitura) de templates e saude do agente nas VMs de
PRODUCAO, separado por SO (Windows/Linux), usando as tags ja normalizadas
(ambiente, so) da rodada anterior.

Para cada host do grupo 03 com ambiente=Producao (ou "Produ��o"):
  - templates atuais (nomes)
  - interface principal: tipo (1=agent,2=SNMP,3=IPMI,4=JMX), useip, ip/dns
  - saude do agente: item agent.ping (ou similar) com dado recente (<=1h)
    -> "ok"; existe mas sem dado recente -> "sem-dados"; nao existe -> "sem-item"
  - classificacao de gap: sem template de agente do SO certo, template do
    SO errado ainda presente, ou sem nenhum template de agente.

Saida: levantamento-templates-agentes.json
"""
import datetime
import json
import os
import re
import urllib.request
from collections import Counter, defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
AGORA = int(datetime.datetime.now().timestamp())

TPL_WIN_ATIVO = "Windows by Zabbix agent active"
TPL_WIN_PASSIVO = "Windows by Zabbix agent"
TPL_LNX_ATIVO = "Linux by Zabbix agent active"
TPL_LNX_PASSIVO = "Linux by Zabbix agent"


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
    hosts = call("host.get", {
        "output": ["hostid", "host", "name", "status"],
        "selectGroups": ["name"], "selectHostGroups": ["name"],
        "selectTags": "extend", "selectInterfaces": "extend",
        "selectParentTemplates": ["templateid", "name"]}, tok)

    def grupos(h):
        return [g["name"] for g in h.get("hostgroups", h.get("groups", []))]

    prod = []
    for h in hosts:
        if h["status"] != "0":
            continue
        if not any("03 Servidores Virtuais" in g for g in grupos(h)):
            continue
        tags = {t["tag"]: t["value"] for t in h.get("tags", [])}
        amb = tags.get("ambiente", "")
        if "produ" not in amb.lower() and amb.lower() != "producao":
            continue
        prod.append(h)

    hostids = [h["hostid"] for h in prod]
    # itens de agente (ping/version) para saude
    items = call("item.get", {
        "hostids": hostids,
        "search": {"key_": "agent.ping"},
        "output": ["hostid", "key_", "lastclock", "state"]}, tok)
    agent_health = defaultdict(list)
    for it in items:
        agent_health[it["hostid"]].append(it)

    resultado = []
    for h in prod:
        tags = {t["tag"]: t["value"] for t in h.get("tags", [])}
        so_raw = (tags.get("so") or "").strip()
        so = so_raw.capitalize() if so_raw.lower() in ("windows", "linux") else so_raw
        tpls = {t["name"] for t in h.get("parentTemplates", [])}
        mif = next((i for i in h.get("interfaces", []) if i.get("main") == "1"), None)
        ah = agent_health.get(h["hostid"], [])
        if not ah:
            saude = "sem-item-agent.ping"
        else:
            last = max(int(a.get("lastclock") or 0) for a in ah)
            if last == 0:
                saude = "sem-dado"
            elif AGORA - last <= 3600:
                saude = "ok(<=1h)"
            elif AGORA - last <= 86400:
                saude = "atrasado(<=24h)"
            else:
                saude = f"parado({(AGORA-last)//86400}d)"

        alvo_ativo = TPL_WIN_ATIVO if so == "Windows" else TPL_LNX_ATIVO if so == "Linux" else None
        errado = TPL_LNX_ATIVO if so == "Windows" else TPL_WIN_ATIVO if so == "Linux" else None
        gap = []
        if not so:
            gap.append("sem-tag-so")
        elif alvo_ativo not in tpls and (TPL_WIN_PASSIVO not in tpls and TPL_LNX_PASSIVO not in tpls):
            gap.append(f"sem-template-agente-{so}")
        if errado and errado in tpls:
            gap.append(f"template-{errado}-presente-mas-so={so}")
        if mif and mif.get("type") == "1" and saude.startswith(("sem-", "parado")):
            gap.append("agente-declarado-mas-sem-dados")
        if not mif or not (mif.get("ip") or mif.get("dns")):
            gap.append("sem-interface-utilizavel")

        resultado.append({
            "hostid": h["hostid"], "host": h["name"], "so": so or None,
            "templates": sorted(tpls),
            "interface_tipo": mif.get("type") if mif else None,
            "interface_endereco": (mif.get("ip") if mif and mif.get("useip") == "1" else
                                   mif.get("dns") if mif else None),
            "saude_agente": saude, "gaps": gap,
            "servico": tags.get("servico"), "departamento": tags.get("departamento"),
        })

    por_so = Counter(r["so"] for r in resultado)
    saude_por_so = defaultdict(Counter)
    gaps_por_so = defaultdict(Counter)
    for r in resultado:
        saude_por_so[r["so"] or "?"][r["saude_agente"]] += 1
        for g in r["gaps"]:
            gaps_por_so[r["so"] or "?"][g] += 1

    out = {
        "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "total_producao": len(resultado),
        "por_so": dict(por_so),
        "saude_agente_por_so": {k: dict(v) for k, v in saude_por_so.items()},
        "gaps_por_so": {k: dict(v) for k, v in gaps_por_so.items()},
        "hosts": resultado,
    }
    json.dump(out, open(os.path.join(HERE, "levantamento-templates-agentes.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != "hosts"}, ensure_ascii=False, indent=1))
    print(f"\n-> levantamento-templates-agentes.json ({len(resultado)} hosts producao)")


if __name__ == "__main__":
    main()
