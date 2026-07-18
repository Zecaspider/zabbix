"""Aplica a seccao 2 do plano (macros {$VMWARE.VM.UUID}) com a regra
validada empiricamente em verificacao-uuid.json: SO instance UUID (50xx,
extraido live do vCenter) entra na macro — hosts que coletam usam instance;
nenhum host com BIOS UUID (42xx) coleta. Por isso:
  2a. CRIAR macro nos hosts do plano com confianca alta (18, live)
  2b. CORRIGIR macros existentes com BIOS UUID de VMs live (o "engano buuid"
      da sessao antiga) quando temos o instance UUID correspondente
  --  ADIADO: itens do plano com so BIOS UUID de snapshot (15) e macros BIOS
      de VMs PowerFlex (18) — sem live do PowerFlex (Z.8) nao ha instance
      UUID para elas; escrever BIOS seria repetir o erro.
Backup antes; verificacao por releitura depois. Log: aplicacao-seccao2-<ts>.json
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
    plano = json.load(open(os.path.join(HERE, "plano-correcao.json"), encoding="utf-8"))
    verif = json.load(open(os.path.join(HERE, "verificacao-uuid.json"), encoding="utf-8"))
    inv = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))
    live_by_bios = {(v.get("bios_uuid") or "").lower(): v
                    for v in inv["vms"] if v["fonte"].startswith("live") and v.get("bios_uuid")}

    log = {"executado_em": TS, "dry_run": DRY, "criadas": [], "corrigidas": [],
           "adiadas": [], "erros": []}

    # 2a: criacoes de confianca alta
    criar = [x for x in plano["2_uuid_macro"] if x["confianca"] == "alta"]
    adiar = [x for x in plano["2_uuid_macro"] if x["confianca"] != "alta"]
    for x in adiar:
        log["adiadas"].append({"hostid": x["hostid"], "host": x["zabbix_host"],
                               "motivo": "so BIOS UUID (snapshot) — aguardar Z.8"})

    # 2b: macros existentes com BIOS UUID de VM live -> corrigir p/ instance
    corrigir = []
    for h in verif["hosts"]:
        if h["namespace"] != "bios(42xx-live)":
            continue
        vm = live_by_bios.get((h["uuid"] or "").lower())
        if vm and vm.get("instance_uuid"):
            corrigir.append({"hostid": h["hostid"], "host": h["host"],
                             "uuid_errado": h["uuid"],
                             "uuid_correto": vm["instance_uuid"], "vm": vm["name"]})

    afetados = sorted({x["hostid"] for x in criar} | {c["hostid"] for c in corrigir})
    backup = call("usermacro.get", {"hostids": afetados, "output": "extend"}, tok)
    bfile = os.path.join(HERE, f"backup-seccao2-{TS}.json")
    json.dump({"criado_em": TS, "macros": backup}, open(bfile, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"backup de macros de {len(afetados)} hosts -> {bfile}")

    macroid_by_host = {m["hostid"]: m["hostmacroid"] for m in backup
                       if m["macro"] == "{$VMWARE.VM.UUID}"}

    for x in criar:
        if x["hostid"] in macroid_by_host:
            log["erros"].append({"hostid": x["hostid"], "erro": "macro ja existe — pulado"})
            continue
        if not DRY:
            call("usermacro.create", {"hostid": x["hostid"],
                                      "macro": "{$VMWARE.VM.UUID}",
                                      "value": x["uuid_proposto"]}, tok)
        log["criadas"].append({"hostid": x["hostid"], "host": x["zabbix_host"],
                               "vm": x["vm"], "uuid": x["uuid_proposto"]})

    for c in corrigir:
        mid = macroid_by_host.get(c["hostid"])
        if not mid:
            log["erros"].append({"hostid": c["hostid"], "erro": "macroid nao encontrado"})
            continue
        if not DRY:
            call("usermacro.update", {"hostmacroid": mid, "value": c["uuid_correto"]}, tok)
        log["corrigidas"].append(c)

    # verificacao
    depois = call("usermacro.get", {"hostids": afetados,
                                    "filter": {"macro": "{$VMWARE.VM.UUID}"},
                                    "output": ["hostid", "value"]}, tok)
    got = {m["hostid"]: (m["value"] or "").lower() for m in depois}
    falhas = []
    for x in log["criadas"]:
        if got.get(x["hostid"]) != x["uuid"].lower():
            falhas.append({"hostid": x["hostid"], "check": "macro criada nao confere"})
    for c in log["corrigidas"]:
        if got.get(c["hostid"]) != c["uuid_correto"].lower():
            falhas.append({"hostid": c["hostid"], "check": "macro corrigida nao confere"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}

    lfile = os.path.join(HERE, f"aplicacao-seccao2-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{'[DRY-RUN] ' if DRY else ''}criadas: {len(log['criadas'])} | "
          f"corrigidas (buuid->instance): {len(log['corrigidas'])} | "
          f"adiadas (BIOS/snapshot, aguardam Z.8): {len(log['adiadas'])} | "
          f"erros: {len(log['erros'])}")
    print(f"verificacao: {'OK — 0 falhas' if not falhas else f'{len(falhas)} FALHAS'}")
    for c in log["corrigidas"]:
        print(f"  corrigido {c['host'][:50]}: {c['uuid_errado'][:13]}… -> {c['uuid_correto'][:13]}… (VM {c['vm']})")
    print(f"log: {lfile}")


if __name__ == "__main__":
    main()
