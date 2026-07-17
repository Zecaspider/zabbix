"""Cruza inventario-consolidado.json (vCenter) contra os hosts do Zabbix Infra.

Matching em cascata (nunca por IP sozinho — foi a causa raiz dos UUIDs
trocados documentada no CLAUDE.md):
  1. instance_uuid (vCenter) == {$VMWARE.VM.UUID} (macro do host Zabbix)
  2. nome da VM (vCenter) == host tecnico OU visible name (Zabbix)
  3. guest_hostname (vCenter) == host tecnico (Zabbix)
  4. IP (vCenter) == IP da interface principal (Zabbix) — so como desempate,
     nunca como primeiro criterio.

Saidas (JSON, so leitura no Zabbix):
  reconciliacao-diffs.json — 4 relatorios:
    a) zabbix_sem_par           -> candidatos a desativar (evidencia objetiva)
    b) vcenter_sem_par          -> gaps de cobertura Zabbix
    c) divergencias             -> nome/estado inconsistente entre as fontes
    d) propostas_servico        -> tipo/servico sugerido por VM, com evidencia
       e nivel de confianca, a validar por humano (nunca aplicado sem revisao)
"""
import json
import os
import re
import urllib.request
from collections import defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
INV = os.path.join(HERE, "inventario-consolidado.json")
OUT = os.path.join(HERE, "reconciliacao-diffs.json")

# keywords -> (tipo, servico) para a proposta de classificacao (M1, mesmo
# esquema de identificacao-servicos-suporte.md, agora aplicado ao universo
# inteiro via nome + anotacao do vCenter)
KEYWORDS = [
    (("zabbix",), "monitorizacao", "Zabbix"),
    (("graylog",), "monitorizacao", "Graylog"),
    (("prtg",), "monitorizacao", "PRTG"),
    (("observer", "observe"), "monitorizacao", "Observer"),
    (("dhcp", "kea"), "dhcp", "DHCP"),
    (("domain controller", " dc ", "active directory"), "ad", "Domain Controller"),
    (("dns",), "dns", "DNS"),
    (("exchange",), "email", "Exchange"),
    (("sophos",), "email/seguranca", "Sophos"),
    (("wsus", "sccm", "system center"), "updates", "WSUS/SCCM"),
    (("veeam", "networker", "backup", "vproxy"), "backup", "Backup"),
    (("jump", "bastion",), "acesso", "Jump Server"),
    (("tacacs",), "iam", "TACACS"),
    (("file server", "fileserver", "ftp", "sftp", "tftp"), "ficheiros", "File/FTP"),
    (("imperva", "waf", "firewall", "checkpoint", "check point"), "seguranca", "Seguranca perimetral"),
    (("vcenter", "vproxy"), "virtualizacao-mgmt", "vCenter/vProxy"),
]


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=60) as r:
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


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


VMID_RE = re.compile(r"\b(V[SD]\d{6,7})\b", re.IGNORECASE)


def vmid(s):
    """Extrai o codigo VS/VD###### de um nome (ex.: 'VS8000101_vProxy-EMC
    Networker' -> 'VS8000101'). Usado como criterio de match mais forte que
    normalizar a string toda, que quebra com sufixos descritivos."""
    m = VMID_RE.search(s or "")
    return m.group(1).upper() if m else None


NOT_REAL_WORKLOAD = re.compile(r"^(vCLS-|TEMPLATE[_ ]|.*_TEMPLATE$)", re.IGNORECASE)


def propose(name, anotacao, existing_servico):
    if existing_servico:
        return None  # ja classificado, nao propor
    hay = f"{name} {anotacao or ''}".lower()
    for kws, tipo, servico in KEYWORDS:
        if any(k in hay for k in kws):
            return {"tipo": tipo, "servico": servico, "evidencia": f"nome/anotacao contem '{kws[0]}'"}
    return None


def main():
    tok = load_token()
    inv = json.load(open(INV, encoding="utf-8"))
    vms = inv["vms"]

    zbx_hosts = call("host.get", {
        "output": ["hostid", "host", "name", "status"],
        "selectInterfaces": ["ip"], "selectTags": "extend",
        "selectGroups": ["name"]}, tok)
    zbx_macros = call("usermacro.get", {
        "output": ["hostid", "macro", "value"],
        "filter": {"macro": "{$VMWARE.VM.UUID}"}}, tok)
    uuid_by_host = {m["hostid"]: (m.get("value") or "").lower() for m in zbx_macros}

    # indices
    by_uuid, by_techname, by_visname, by_ip = {}, {}, {}, defaultdict(list)
    by_vmid = defaultdict(list)
    for h in zbx_hosts:
        u = uuid_by_host.get(h["hostid"])
        if u:
            by_uuid[u] = h
        by_techname[norm(h["host"])] = h
        by_visname[norm(h["name"])] = h
        vid = vmid(h["host"]) or vmid(h["name"])
        if vid:
            by_vmid[vid].append(h)
        for i in h.get("interfaces", []):
            if i.get("ip"):
                by_ip[i["ip"]].append(h)

    matched_zbx_ids = set()
    divergencias = []
    propostas = []

    for vm in vms:
        h = None
        crit = None
        vu = (vm.get("instance_uuid") or "").lower()
        if vu and vu in by_uuid:
            h, crit = by_uuid[vu], "uuid"
        if not h:
            n = norm(vm["name"])
            if n in by_techname:
                h, crit = by_techname[n], "nome-tecnico"
            elif n in by_visname:
                h, crit = by_visname[n], "nome-visivel"
        if not h:
            gh = norm(vm.get("guest_hostname") or "")
            if gh and gh in by_techname:
                h, crit = by_techname[gh], "guest-hostname"
        if not h:
            vid = vmid(vm["name"])
            cands = by_vmid.get(vid) if vid else None
            if cands and len(cands) == 1:
                h, crit = cands[0], "vmid-substring"
        if not h and vm.get("guest_ip"):
            cands = by_ip.get(vm["guest_ip"])
            if cands and len(cands) == 1:
                h, crit = cands[0], "ip(desempate)"

        if h:
            matched_zbx_ids.add(h["hostid"])
            # divergencias: powered_off no vCenter mas host ativo no Zabbix
            zbx_status_on = h["status"] == "0"
            vc_on = vm.get("power_state") == "POWERED_ON"
            if zbx_status_on and not vc_on:
                divergencias.append({
                    "vm": vm["name"], "zabbix_hostid": h["hostid"], "zabbix_host": h["name"],
                    "criterio_match": crit,
                    "problema": f"Zabbix ATIVO mas vCenter diz power_state={vm.get('power_state')}",
                })
            tags = {t["tag"] for t in h.get("tags", [])}
            if "servico" not in tags:
                prop = propose(vm["name"], vm.get("anotacao"), None)
                if prop:
                    prop.update({"zabbix_hostid": h["hostid"], "zabbix_host": h["name"],
                                "vm_vcenter": vm["name"], "criterio_match": crit})
                    propostas.append(prop)

    # uma vm esta "sem par" sse nao bateu em nenhum criterio do loop principal;
    # repetimos a mesma logica aqui (sem side-effects) sobre os mesmos indices.
    def has_match(vm):
        vu = (vm.get("instance_uuid") or "").lower()
        if vu and vu in by_uuid:
            return True
        n = norm(vm["name"])
        if n in by_techname or n in by_visname:
            return True
        gh = norm(vm.get("guest_hostname") or "")
        if gh and gh in by_techname:
            return True
        vid = vmid(vm["name"])
        if vid and len(by_vmid.get(vid, [])) == 1:
            return True
        if vm.get("guest_ip") and len(by_ip.get(vm["guest_ip"], [])) == 1:
            return True
        return False

    vcenter_sem_par_bruto = [vm for vm in vms if not has_match(vm)]
    vcenter_sistema = [vm["name"] for vm in vcenter_sem_par_bruto if NOT_REAL_WORKLOAD.match(vm["name"])]
    vcenter_sem_par = [{"vm": vm["name"], "power_state": vm.get("power_state"),
                        "cluster": vm.get("cluster"), "esxi_host": vm.get("esxi_host"),
                        "fonte": vm.get("fonte")}
                       for vm in vcenter_sem_par_bruto if not NOT_REAL_WORKLOAD.match(vm["name"])]

    zabbix_sem_par = [{"hostid": h["hostid"], "host": h["name"], "status": h["status"],
                       "grupos": [g["name"] for g in h.get("groups", [])]}
                      for h in zbx_hosts if h["hostid"] not in matched_zbx_ids
                      and any("Servidores Virtuais" in g["name"] for g in h.get("groups", []))]

    out = {
        "total_vms_vcenter": len(vms),
        "total_hosts_zabbix": len(zbx_hosts),
        "matched": len(matched_zbx_ids),
        "vcenter_sistema_ignorado": vcenter_sistema,
        "zabbix_sem_par_vcenter": zabbix_sem_par,
        "vcenter_sem_par_zabbix": vcenter_sem_par,
        "divergencias_estado": divergencias,
        "propostas_servico": propostas,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"VMs no vCenter (inventario): {len(vms)}")
    print(f"Hosts no Zabbix Infra: {len(zbx_hosts)}")
    print(f"Correspondencias encontradas: {len(matched_zbx_ids)}")
    print(f"Zabbix (grupo 03) sem par no vCenter: {len(zabbix_sem_par)}")
    print(f"vCenter sem par no Zabbix (real, exclui vCLS/TEMPLATE): {len(vcenter_sem_par)}")
    print(f"  (ignorados por serem vCLS/TEMPLATE, nao workload real: {len(vcenter_sistema)})")
    print(f"Divergencias de estado (Zabbix ON, vCenter OFF): {len(divergencias)}")
    print(f"Propostas de servico/tipo (hosts ainda sem tag servico): {len(propostas)}")
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
