"""Comparacao de 3 VIAS: vCenter PRD live x Excel (snapshot 2026-05-04) x
Zabbix — restrita aos clusters que o vCenter PRD gere (Cluster Swift,
CS9000001, CS9000002). Objetivo: perceber se o Excel tem gaps e se o Zabbix
os herdou. So leitura em todos os sistemas.

Categorias por VM live:
  A) live+excel+zabbix  -> ok; diffs de campo (IP maio vs hoje, power, nome)
  B) live SEM excel SEM zabbix -> GAP DO EXCEL HERDADO PELO ZABBIX (alvo)
  C) live SEM excel COM zabbix -> gap do Excel nao herdado (Zabbix sabia)
  D) live+excel SEM zabbix -> gap de cobertura Zabbix confirmado por 2 fontes
E, no sentido inverso:
  E) excel SEM live -> VM removida/movida desde maio (se host Zabbix ativo,
     candidato a rever/desativar)

Matching live<->excel: bios_uuid (o "UUID" do Excel e BIOS UUID 42xx);
fallback nome normalizado. live<->zabbix: macro {$VMWARE.VM.UUID} contra
instance_uuid E bios_uuid; depois cascata de nomes.

Saida: comparacao-3vias.json
"""
import glob
import json
import os
import re
import unicodedata
import urllib.request
from collections import defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
INV = os.path.join(HERE, "inventario-consolidado.json")
OUT = os.path.join(HERE, "comparacao-3vias.json")

NOT_REAL = re.compile(r"^(vCLS-|TE?L?MPLATE[_ ]|.*_TEMPLATE$)", re.IGNORECASE)


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=90) as r:
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


def deaccent(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def norm(s):
    return re.sub(r"[^a-z0-9]", "", deaccent(s).lower())


def main():
    lives = sorted(glob.glob(os.path.join(HERE, "fontes", "vcenter-prd-live-*.json")))
    live_doc = json.load(open(lives[-1], encoding="utf-8"))
    live = [v for v in live_doc["vms"] if not NOT_REAL.match(v["name"])]
    clusters_prd = {v.get("cluster") for v in live} - {None}

    inv = json.load(open(INV, encoding="utf-8"))
    excel = [v for v in inv["vms"]
             if v.get("cluster") in clusters_prd and not NOT_REAL.match(v["name"])]

    tok = load_token()
    zbx = call("host.get", {
        "output": ["hostid", "host", "name", "status"],
        "selectInterfaces": ["ip"], "selectTags": "extend",
        "selectHostGroups": ["name"]}, tok)
    macros = call("usermacro.get", {
        "output": ["hostid", "macro", "value"],
        "filter": {"macro": "{$VMWARE.VM.UUID}"}}, tok)
    uuid_by_host = {m["hostid"]: (m.get("value") or "").lower() for m in macros}
    zbx_by_uuid, zbx_by_name = {}, {}
    for h in zbx:
        h["_ips"] = [i["ip"] for i in h.get("interfaces", []) if i.get("ip")]
        h["_groups"] = [g["name"] for g in h.get("hostgroups", [])]
        u = uuid_by_host.get(h["hostid"])
        if u:
            zbx_by_uuid[u] = h
        zbx_by_name.setdefault(norm(h["host"]), h)
        zbx_by_name.setdefault(norm(h["name"]), h)

    exc_by_bios = {(v.get("instance_uuid") or "").lower(): v for v in excel
                   if v.get("instance_uuid")}  # coluna UUID do Excel = BIOS UUID
    exc_by_name = {norm(v["name"]): v for v in excel}

    def find_zbx(vm):
        for u in ((vm.get("instance_uuid") or "").lower(),
                  (vm.get("bios_uuid") or "").lower()):
            if u and u in zbx_by_uuid:
                return zbx_by_uuid[u], "uuid"
        for k in (norm(vm["name"]), norm(vm.get("guest_hostname") or "")):
            if k and k in zbx_by_name:
                return zbx_by_name[k], "nome"
        return None, None

    cat = defaultdict(list)
    matched_excel_ids = set()

    for vm in live:
        bios = (vm.get("bios_uuid") or "").lower()
        e = exc_by_bios.get(bios)
        crit_e = "bios_uuid" if e else None
        if not e:
            e = exc_by_name.get(norm(vm["name"]))
            crit_e = "nome" if e else None
        if e:
            matched_excel_ids.add(id(e))
        z, crit_z = find_zbx(vm)

        base = {"vm": vm["name"], "cluster": vm.get("cluster"),
                "power_state": vm.get("power_state"),
                "guest_ip": vm.get("guest_ip"),
                "bios_uuid": vm.get("bios_uuid"),
                "zabbix_host": z["name"] if z else None,
                "criterio_excel": crit_e, "criterio_zabbix": crit_z}

        if e and z:
            difs = {}
            if e.get("guest_ip") and vm.get("guest_ip") and e["guest_ip"] != vm["guest_ip"]:
                difs["ip_excel_vs_live"] = {"excel(maio)": e["guest_ip"], "live(hoje)": vm["guest_ip"]}
            zips = [i for i in z["_ips"] if i != "127.0.0.1"]
            if vm.get("guest_ip") and zips and vm["guest_ip"] not in zips:
                difs["ip_zabbix_vs_live"] = {"zabbix": zips, "live(hoje)": vm["guest_ip"]}
            if vm.get("power_state") == "POWERED_OFF" and z["status"] == "0":
                difs["power"] = "vCenter OFF hoje, host Zabbix ativo"
            if norm(e["name"]) != norm(vm["name"]):
                difs["nome_excel_vs_live"] = {"excel": e["name"], "live": vm["name"]}
            entry = dict(base)
            if difs:
                entry["difs"] = difs
            cat["A_nas_3_fontes" if not difs else "A_nas_3_fontes_com_difs"].append(entry)
        elif not e and not z:
            cat["B_gap_excel_herdado_zabbix"].append(base)
        elif not e and z:
            cat["C_gap_excel_nao_herdado"].append(base)
        elif e and not z:
            cat["D_sem_cobertura_zabbix_confirmado_2_fontes"].append(base)

    for e in excel:
        if id(e) in matched_excel_ids:
            continue
        z, crit_z = find_zbx(e)
        cat["E_no_excel_mas_ja_nao_no_vcenter"].append({
            "vm": e["name"], "cluster": e.get("cluster"),
            "power_state_maio": e.get("power_state"),
            "anotacao": e.get("anotacao"),
            "zabbix_host": z["name"] if z else None,
            "zabbix_status": (("ativo" if z["status"] == "0" else "desativado") if z else None),
            "nota": "VM removida/renomeada/movida de cluster desde 2026-05-04"})

    total_live = len(live)
    soma = sum(len(v) for k, v in cat.items() if k.startswith(("A_", "B_", "C_", "D_")))
    assert soma == total_live, f"contabilidade nao fecha: {soma} != {total_live}"

    resumo = {
        "fonte_live": live_doc["extraido_em"],
        "clusters_prd": sorted(clusters_prd),
        "vms_live": total_live,
        "vms_excel_nestes_clusters": len(excel),
        "categorias": {k: len(v) for k, v in sorted(cat.items())},
    }
    json.dump({"resumo": resumo, **{k: v for k, v in sorted(cat.items())}},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    for k in ("B_gap_excel_herdado_zabbix", "C_gap_excel_nao_herdado",
              "D_sem_cobertura_zabbix_confirmado_2_fontes"):
        if cat[k]:
            print(f"\n== {k} ==")
            for x in cat[k]:
                print(f"  {x['vm']:40.40} {x['cluster']:14} {x['power_state']:11} "
                      f"ip={x.get('guest_ip')!s:16} zbx={x.get('zabbix_host') or '—'}")
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
