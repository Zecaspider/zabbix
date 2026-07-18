"""Aplica as seccoes APROVADAS 7 (tags ausentes), 8 (reintegrar dominio 03)
e 9 (grupos de servico) do plano-correcao.json. Aprovacao: utilizador,
2026-07-17 ("aprova seccoes 7, 8 e 9 e aplica com backup").

Sequencia:
  1. BACKUP  — snapshot completo (tags, grupos, macros, templates, interfaces)
               de todos os hosts afetados -> backup-plano789-<ts>.json
  2. APLICAR — 7: host.update com tags FUNDIDAS (novas + existentes; nunca
                  substitui um valor ja presente);
               8: hostgroup.massadd para o grupo 03 (aditivo);
               9: hostgroup.create dos grupos novos + massadd de membros.
  3. VERIFICAR — releitura e contagem; log -> aplicacao-plano789-<ts>.json

Uso: python aplicar_plano_789.py [--dry-run]
"""
import datetime
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
PLANO = json.load(open(os.path.join(HERE, "plano-correcao.json"), encoding="utf-8"))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

GRUPO_03 = {"name": "BPC/DOMINIO/03 Servidores Virtuais", "groupid": "609"}


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
    log = {"executado_em": TS, "dry_run": DRY, "acoes": [], "erros": []}

    # ---------- alvo: hostids afetados ----------
    tags_por_host = defaultdict(dict)       # hostid -> {tag: valor}
    for x in PLANO["7_tags_ausentes"]:
        tags_por_host[x["hostid"]][x["tag"]] = str(x["valor_proposto"])
    hosts_g03 = [x["hostid"] for x in PLANO["8_grupos_reintegrar_03"]]
    grupos_servico = PLANO["9_grupos_servico"]
    hosts_g9 = {h["hostid"] for g in grupos_servico for h in g["hosts"]}

    afetados = sorted(set(tags_por_host) | set(hosts_g03) | hosts_g9)
    print(f"hosts afetados: {len(afetados)}")

    # ---------- 1. BACKUP ----------
    backup = call("host.get", {
        "hostids": afetados,
        "output": ["hostid", "host", "name", "status"],
        "selectTags": "extend", "selectHostGroups": "extend",
        "selectParentTemplates": ["templateid", "name"],
        "selectInterfaces": "extend", "selectMacros": "extend"}, tok)
    bfile = os.path.join(HERE, f"backup-plano789-{TS}.json")
    json.dump({"criado_em": TS, "motivo": "pre-aplicacao seccoes 7/8/9",
               "hosts": backup}, open(bfile, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"backup: {len(backup)} hosts -> {bfile}")
    assert len(backup) == len(afetados), "backup incompleto — abortado"
    cur_by_id = {h["hostid"]: h for h in backup}

    # ---------- 2a. Seccao 7: tags fundidas ----------
    for hostid, novas in sorted(tags_por_host.items()):
        cur = cur_by_id.get(hostid)
        if not cur:
            log["erros"].append({"hostid": hostid, "erro": "host nao encontrado no backup"})
            continue
        atuais = {t["tag"]: t["value"] for t in cur.get("tags", [])}
        aplicar = {k: v for k, v in novas.items() if k not in atuais}
        if not aplicar:
            log["acoes"].append({"seccao": 7, "hostid": hostid, "host": cur["name"],
                                 "resultado": "nada a fazer (tags ja existem)"})
            continue
        merged = [{"tag": k, "value": v} for k, v in {**atuais, **aplicar}.items()]
        if not DRY:
            call("host.update", {"hostid": hostid, "tags": merged}, tok)
        log["acoes"].append({"seccao": 7, "hostid": hostid, "host": cur["name"],
                             "tags_adicionadas": aplicar})

    # ---------- 2b. Seccao 8: reintegrar grupo 03 (aditivo) ----------
    ja_no_03 = {h["hostid"] for h in backup
                if any(g["name"] == GRUPO_03["name"] for g in h.get("hostgroups", []))}
    alvo_03 = [hid for hid in hosts_g03 if hid not in ja_no_03]
    if alvo_03 and not DRY:
        call("hostgroup.massadd", {"groups": [{"groupid": GRUPO_03["groupid"]}],
                                   "hosts": [{"hostid": h} for h in alvo_03]}, tok)
    log["acoes"].append({"seccao": 8, "grupo": GRUPO_03["name"],
                         "hosts_adicionados": len(alvo_03),
                         "ja_estavam": len(hosts_g03) - len(alvo_03)})

    # ---------- 2c. Seccao 9: grupos de servico ----------
    existentes = {g["name"]: g["groupid"] for g in
                  call("hostgroup.get", {"output": ["groupid", "name"]}, tok)}
    for g in grupos_servico:
        nome = g["grupo"]
        gid = existentes.get(nome)
        criado = False
        if not gid:
            if DRY:
                gid = "DRY"
            else:
                gid = call("hostgroup.create", {"name": nome}, tok)["groupids"][0]
            criado = True
        membros = [h["hostid"] for h in g["hosts"]]
        # aditivo: so quem ainda nao esta no grupo
        falta = [hid for hid in membros if not any(
            gg["name"] == nome for gg in cur_by_id.get(hid, {}).get("hostgroups", []))]
        if falta and not DRY:
            call("hostgroup.massadd", {"groups": [{"groupid": gid}],
                                       "hosts": [{"hostid": h} for h in falta]}, tok)
        log["acoes"].append({"seccao": 9, "grupo": nome, "criado": criado,
                             "hosts_adicionados": len(falta),
                             "ja_estavam": len(membros) - len(falta)})

    # ---------- 3. VERIFICACAO ----------
    verif = call("host.get", {"hostids": afetados, "output": ["hostid", "name"],
                              "selectTags": "extend", "selectHostGroups": ["name"]}, tok)
    v_by_id = {h["hostid"]: h for h in verif}
    falhas = []
    for hostid, novas in tags_por_host.items():
        got = {t["tag"]: t["value"] for t in v_by_id.get(hostid, {}).get("tags", [])}
        for k, v in novas.items():
            if k not in got:
                falhas.append({"hostid": hostid, "check": f"tag {k} em falta"})
    for hid in hosts_g03:
        if not any(g["name"] == GRUPO_03["name"]
                   for g in v_by_id.get(hid, {}).get("hostgroups", [])):
            falhas.append({"hostid": hid, "check": "grupo 03 em falta"})
    for g in grupos_servico:
        for h in g["hosts"]:
            if not any(gg["name"] == g["grupo"]
                       for gg in v_by_id.get(h["hostid"], {}).get("hostgroups", [])):
                falhas.append({"hostid": h["hostid"], "check": f"grupo {g['grupo']} em falta"})

    log["verificacao"] = {"falhas": falhas, "ok": not falhas}
    lfile = os.path.join(HERE, f"aplicacao-plano789-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    n7 = sum(1 for a in log["acoes"] if a["seccao"] == 7 and a.get("tags_adicionadas"))
    a8 = next(a for a in log["acoes"] if a["seccao"] == 8)
    g9 = [a for a in log["acoes"] if a["seccao"] == 9]
    print(f"\n{'[DRY-RUN] ' if DRY else ''}resultado:")
    print(f"  7: tags adicionadas em {n7} hosts")
    print(f"  8: grupo 03 adicionado a {a8['hosts_adicionados']} hosts ({a8['ja_estavam']} ja estavam)")
    print(f"  9: {sum(1 for a in g9 if a['criado'])} grupos criados; "
          f"{sum(a['hosts_adicionados'] for a in g9)} adicoes de hosts; "
          f"{sum(a['ja_estavam'] for a in g9)} ja estavam")
    print(f"  verificacao: {'OK — 0 falhas' if not falhas else f'{len(falhas)} FALHAS (ver log)'}")
    print(f"  log: {lfile}")


if __name__ == "__main__":
    main()
