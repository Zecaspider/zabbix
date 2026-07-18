"""Comparacao CAMPO-A-CAMPO: inventario-consolidado.json (Excel/vCenter,
fonte de verdade) x hosts Zabbix Infra. So leitura no Zabbix.

Diferencas face ao reconciliar.py (que so cruza existencia/estado):
  - compara visible name, IP, SO, tags (servico/ambiente/departamento/
    cod_ambiente/cluster/esxi_host/vcenter/so) e hostgroups por par matched;
  - toda divergencia carrega o valor BRUTO dos dois lados (evidencia);
  - VMs com nome_reutilizado (mesmo nome, UUIDs distintos no vCenter) so
    podem casar por UUID — matching por nome nelas e ambiguo por definicao;
  - contabilidade fechada: matched + sem_par + ignorados == totais (assert);
  - relatorio de completude por campo dos DOIS lados, para que gaps de
    extracao/etiquetagem sejam visiveis em vez de silenciosos.

Saida: comparacao-campos.json
"""
import json
import os
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
INV = os.path.join(HERE, "inventario-consolidado.json")
OUT = os.path.join(HERE, "comparacao-campos.json")

NOT_REAL_WORKLOAD = re.compile(r"^(vCLS-|TE?L?MPLATE[_ ]|TEMPLATE$|.*_TEMPLATE$)", re.IGNORECASE)
VMID_RE = re.compile(r"\b(V[SD]\d{6,7})\b", re.IGNORECASE)


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


def norm_soft(s):
    """normalizacao para comparar VALORES (tags vs excel): minusculas, sem
    acentos, espacos colapsados — mas mantem espacos/segmentacao."""
    return re.sub(r"\s+", " ", deaccent(s or "").lower()).strip()


def vmid(s):
    m = VMID_RE.search(s or "")
    return m.group(1).upper() if m else None


def so_class(txt):
    t = (txt or "").lower()
    if "windows" in t:
        return "windows"
    if any(k in t for k in ("linux", "rhel", "red hat", "centos", "ubuntu",
                            "debian", "suse", "photon", "freebsd", "other 3.x",
                            "other 4.x", "other 5.x")):
        return "linux"
    return None


def main():
    tok = load_token()
    inv = json.load(open(INV, encoding="utf-8"))
    vms = inv["vms"]

    zbx_hosts = call("host.get", {
        "output": ["hostid", "host", "name", "status"],
        "selectInterfaces": ["ip", "dns"],
        "selectTags": "extend",
        "selectHostGroups": ["name"],
        "selectParentTemplates": ["name"],
        "selectInventory": ["os", "os_full", "os_short"]}, tok)
    zbx_macros = call("usermacro.get", {
        "output": ["hostid", "macro", "value"],
        "filter": {"macro": "{$VMWARE.VM.UUID}"}}, tok)
    uuid_by_host = {m["hostid"]: (m.get("value") or "").lower() for m in zbx_macros}

    # ---- indices Zabbix ----
    by_uuid, by_techname, by_visname = {}, {}, {}
    by_vmid, by_ip = defaultdict(list), defaultdict(list)
    for h in zbx_hosts:
        h["_tags"] = {t["tag"]: t["value"] for t in h.get("tags", [])}
        h["_groups"] = [g["name"] for g in h.get("hostgroups", h.get("groups", []))]
        h["_ips"] = [i["ip"] for i in h.get("interfaces", []) if i.get("ip")]
        h["_dns"] = [i["dns"] for i in h.get("interfaces", []) if i.get("dns")]
        h["_templates"] = [t["name"] for t in h.get("parentTemplates", [])]
        u = uuid_by_host.get(h["hostid"])
        if u:
            by_uuid[u] = h
        by_techname.setdefault(norm(h["host"]), h)
        by_visname.setdefault(norm(h["name"]), h)
        vid = vmid(h["host"]) or vmid(h["name"])
        if vid:
            by_vmid[vid].append(h)
        for ip in h["_ips"]:
            by_ip[ip].append(h)

    # ---- matching (cascata; nome_reutilizado exige UUID ou servico) ----
    matched = []            # (vm, host, criterio)
    matched_zbx = set()
    vcenter_sem_par, vcenter_ignorado, ambiguos = [], [], []

    # VMs ligadas primeiro: numa colisao (2 VMs -> 1 host, ex. copia
    # _Migrada_Nao_Ligar desligada + copia nova ligada) ganha a ligada.
    ordem = sorted(vms, key=lambda v: v.get("power_state") != "POWERED_ON")
    for vm in ordem:
        if NOT_REAL_WORKLOAD.match(vm["name"]):
            vcenter_ignorado.append(vm["name"])
            continue
        h = crit = None
        vu = (vm.get("instance_uuid") or "").lower()
        if vu and vu in by_uuid:
            h, crit = by_uuid[vu], "uuid"
        elif vm.get("nome_reutilizado"):
            # nome partilhado por UUIDs distintos: casar por nome ligaria
            # possivelmente a VM errada (erro da rodada anterior). Nota: o
            # Excel traz BIOS UUID (42xx) e varias macros Zabbix tem instance
            # UUID (50xx) — igualdade direta nem sempre e possivel. Fallback:
            # host cujo nome contem o VMID *e* cujo visible name / tag servico
            # contem o servico da anotacao (desambiguacao semantica).
            vid = vmid(vm["name"])
            serv = norm(vm.get("servico_anotacao") or "")
            cands = []
            if vid and serv:
                for hh in by_vmid.get(vid, []):
                    alvo = norm(hh["name"]) + norm(hh["_tags"].get("servico", ""))
                    if serv and serv in alvo:
                        cands.append(hh)
            if len(cands) == 1:
                h, crit = cands[0], "vmid+servico(desambiguado)"
            else:
                ambiguos.append({
                    "vm": vm["name"], "uuid": vu, "cluster": vm.get("cluster"),
                    "anotacao": vm.get("anotacao"),
                    "motivo": "nome reutilizado no vCenter; sem UUID igual no "
                              "Zabbix e desambiguacao por servico "
                              f"devolveu {len(cands)} candidatos"})
                continue
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
            if h["hostid"] in matched_zbx:
                ambiguos.append({
                    "vm": vm["name"], "uuid": vu,
                    "motivo": f"host Zabbix {h['name']} ja casado com outra VM "
                              f"— colisao de matching (criterio {crit})"})
                continue
            matched_zbx.add(h["hostid"])
            matched.append((vm, h, crit))
        else:
            vcenter_sem_par.append({
                "vm": vm["name"], "power_state": vm.get("power_state"),
                "cluster": vm.get("cluster"), "guest_ip": vm.get("guest_ip"),
                "anotacao": vm.get("anotacao"), "fonte": vm.get("fonte")})

    # contabilidade fechada do lado vCenter
    assert len(matched) + len(vcenter_sem_par) + len(vcenter_ignorado) + len(ambiguos) == len(vms), \
        "contabilidade vCenter nao fecha"

    # ---- comparacao campo-a-campo por par ----
    difs = defaultdict(list)

    def add(campo, vm, h, crit, excel, zabbix, nota=None):
        d = {"vm": vm["name"], "zabbix_host": h["name"], "hostid": h["hostid"],
             "criterio_match": crit, "excel": excel, "zabbix": zabbix}
        if nota:
            d["nota"] = nota
        difs[campo].append(d)

    for vm, h, crit in matched:
        # 1. visible name
        if norm(vm["name"]) != norm(h["name"]) and norm(vm["name"]) != norm(h["host"]):
            add("visible_name", vm, h, crit, vm["name"], {"host": h["host"], "name": h["name"]})

        # 2. IP
        gip = vm.get("guest_ip")
        zips = [ip for ip in h["_ips"] if ip and ip != "127.0.0.1"]
        if gip and ":" not in gip:  # ignora IPv6 do excel
            if not zips:
                add("ip", vm, h, crit, gip, h["_ips"], "host Zabbix sem interface IP util")
            elif gip not in zips:
                add("ip", vm, h, crit, gip, zips)
        elif not gip and zips:
            difs["ip_so_no_zabbix"].append({
                "vm": vm["name"], "zabbix_host": h["name"], "hostid": h["hostid"],
                "zabbix": zips, "nota": "Excel sem IP (tools off?); Zabbix tem — nao verificavel pela fonte"})

        # 3. SO — classe (windows/linux) via 3 sinais Zabbix vs 2 sinais Excel
        exc_so = so_class(vm.get("so")) or (vm.get("so_hint") or "").lower() or None
        invd = h.get("inventory") or {}
        z_sig = " ".join([invd.get("os") or "", invd.get("os_full") or "",
                          invd.get("os_short") or "", h["_tags"].get("so", ""),
                          " ".join(h["_templates"])])
        zbx_so = so_class(z_sig)
        if exc_so and zbx_so and exc_so != zbx_so:
            add("so", vm, h, crit, {"so": vm.get("so"), "so_hint": vm.get("so_hint")},
                {"inventory_os": invd.get("os_full") or invd.get("os"),
                 "tag_so": h["_tags"].get("so"), "templates": h["_templates"]})
        # consistencia interna do Excel (hint da anotacao vs guest tools)
        if vm.get("so_hint") and so_class(vm.get("so")) and \
                vm["so_hint"].lower() != so_class(vm.get("so")):
            difs["excel_so_inconsistente"].append({
                "vm": vm["name"], "so_hint(anotacao)": vm["so_hint"],
                "so(guest_tools/config)": vm.get("so"),
                "anotacao": vm.get("anotacao"),
                "nota": "a propria fonte diverge — decidir humano"})

        t = h["_tags"]
        # 4. tag servico vs servico da anotacao
        exc_serv = vm.get("servico_anotacao")
        if exc_serv:
            if "servico" not in t:
                add("tag_servico_ausente", vm, h, crit, exc_serv, None,
                    f"anotacao='{vm.get('anotacao')}'")
            elif norm_soft(t["servico"]) == "sem-anotacao" or \
                    (norm(t["servico"]) != norm(exc_serv)
                     and norm(t["servico"]) not in norm(exc_serv)
                     and norm(exc_serv) not in norm(t["servico"])):
                add("tag_servico", vm, h, crit, exc_serv, t["servico"],
                    f"anotacao='{vm.get('anotacao')}'")
        elif t.get("servico") in (None, "", "SEM-ANOTACAO"):
            difs["servico_desconhecido_ambos"].append({
                "vm": vm["name"], "zabbix_host": h["name"], "hostid": h["hostid"],
                "anotacao": vm.get("anotacao"),
                "nota": "nem Excel nem Zabbix conhecem o servico — investigar"})

        # 5. tag ambiente vs ambiente derivado do codigo. Vocabularios
        # equivalentes (QA==Qualidade, PRD==Producao) nao sao divergencia.
        AMB_EQ = {"qa": "qualidade", "prd": "producao", "producao": "producao",
                  "qualidade": "qualidade", "teste": "teste", "dev": "dev"}
        if vm.get("ambiente"):
            if "ambiente" not in t:
                add("tag_ambiente_ausente", vm, h, crit, vm["ambiente"], None)
            elif AMB_EQ.get(norm_soft(t["ambiente"]), norm_soft(t["ambiente"])) != \
                    AMB_EQ.get(norm_soft(vm["ambiente"]), norm_soft(vm["ambiente"])):
                add("tag_ambiente", vm, h, crit, vm["ambiente"], t["ambiente"],
                    f"codigo anotacao={vm.get('codigo')}")

        # 6. tag departamento
        if vm.get("departamento"):
            if "departamento" not in t:
                add("tag_departamento_ausente", vm, h, crit, vm["departamento"], None)
            elif norm_soft(t["departamento"]) != norm_soft(vm["departamento"]):
                add("tag_departamento", vm, h, crit, vm["departamento"], t["departamento"])

        # 7. cod_ambiente vs codigo da anotacao
        if vm.get("codigo") and t.get("cod_ambiente") and \
                t["cod_ambiente"].upper() != vm["codigo"]:
            add("tag_cod_ambiente", vm, h, crit, vm["codigo"], t["cod_ambiente"])

        # 8. cluster / esxi_host / vcenter
        for tag, campo_vm in (("vcenter_cluster", "cluster"), ("cluster", "cluster"),
                              ("esxi_host", "esxi_host")):
            ev = vm.get(campo_vm)
            if ev and t.get(tag) and norm(t[tag]) != norm(ev) and \
                    norm(ev) not in norm(t[tag]) and norm(t[tag]) not in norm(ev):
                add(f"tag_{tag}", vm, h, crit, ev, t[tag])
        if vm.get("cluster") and "vcenter_cluster" not in t and "cluster" not in t:
            add("tag_cluster_ausente", vm, h, crit, vm["cluster"], None)

        # 9. hostgroups: toda VM deveria estar no dominio 03
        if not any("03 Servidores Virtuais" in g for g in h["_groups"]):
            add("grupo_03_ausente", vm, h, crit, "BPC/DOMINIO/03 Servidores Virtuais",
                h["_groups"])

    # ---- lado Zabbix sem par (so grupo 03, que deveria espelhar vCenter) ----
    zabbix_sem_par = [
        {"hostid": h["hostid"], "host": h["host"], "name": h["name"],
         "status": h["status"], "grupos": h["_groups"], "ips": h["_ips"],
         "uuid_macro": uuid_by_host.get(h["hostid"])}
        for h in zbx_hosts if h["hostid"] not in matched_zbx
        and any("03 Servidores Virtuais" in g for g in h["_groups"])]

    # ---- completude de etiquetagem lado Zabbix (grupo 03) ----
    g03 = [h for h in zbx_hosts if any("03 Servidores Virtuais" in g for g in h["_groups"])]
    tagcov = {tag: sum(1 for h in g03 if tag in h["_tags"])
              for tag in ("servico", "ambiente", "departamento", "cod_ambiente",
                          "vcenter_cluster", "esxi_host", "vcenter", "so", "tipo")}

    resumo = {
        "totais": {
            "vms_inventario": len(vms),
            "hosts_zabbix": len(zbx_hosts),
            "hosts_zabbix_grupo03": len(g03),
            "matched": len(matched),
            "matched_por_criterio": dict(Counter(c for _, _, c in matched)),
            "vcenter_sem_par": len(vcenter_sem_par),
            "vcenter_ignorado_nao_workload": len(vcenter_ignorado),
            "ambiguos_nao_casaveis": len(ambiguos),
            "zabbix_grupo03_sem_par": len(zabbix_sem_par),
        },
        "cobertura_tags_grupo03": tagcov,
        "divergencias_por_campo": {k: len(v) for k, v in sorted(difs.items())},
    }

    out = {
        "resumo": resumo,
        "matched_pairs": [
            {"vm": vm["name"], "uuid": vm.get("instance_uuid"),
             "hostid": h["hostid"], "zabbix_host": h["host"],
             "zabbix_name": h["name"], "criterio": crit,
             "grupos": h["_groups"], "tags": h["_tags"]}
            for vm, h, crit in matched],
        "divergencias": {k: v for k, v in sorted(difs.items())},
        "ambiguos_nao_casaveis": ambiguos,
        "vcenter_sem_par": vcenter_sem_par,
        "vcenter_ignorado": vcenter_ignorado,
        "zabbix_grupo03_sem_par": zabbix_sem_par,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
