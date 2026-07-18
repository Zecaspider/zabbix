"""Classifica os servicos das VMs (fonte: Anotacao do Excel/vCenter) e propoe
o reagrupamento em hostgroups Zabbix. SO GERA PROPOSTAS (mapa-servicos.json)
— nada e aplicado ao Zabbix; aplicacao e um passo separado com aprovacao.

Regras de classificacao (dominio alvo):
  suporte    -> BPC/DOMINIO/10 Servicos de Suporte
  seguranca  -> BPC/DOMINIO/05 Seguranca
  plataforma -> BPC/DOMINIO/07 APIs e Servicos de Negocio (integracao/OCP)
  negocio    -> hostgroup proprio "BPC/SERVICO/<NOME>" quando >= MIN_VMS_GRUPO
Toda VM continua tambem no dominio 03 (Servidores Virtuais) — grupo de
inventario; o dominio funcional e adicional, nunca substituto (achado: 52
hosts foram movidos para o 10 PERDENDO o 03).
"""
import json
import os
import re
import unicodedata
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
INV = os.path.join(HERE, "inventario-consolidado.json")
CMP = os.path.join(HERE, "comparacao-campos.json")
OUT = os.path.join(HERE, "mapa-servicos.json")

MIN_VMS_GRUPO = 4  # servicos de negocio com menos VMs ficam so com tag

# aliases: variantes/typos -> chave canonica (aplicado sobre a forma normalizada)
ALIASES = {
    "vproxyr": "vproxy", "elastic search": "elasticsearch",
    "elasticsearch": "elasticsearch", "digiwave": "digiwave",
    "dhcp server": "dhcp", "kea dhcp": "dhcp", "dns externo": "dns",
    "aplicacoes internas": "aplicacoes internas",
    "sftp pmsi": "sftp",
    "veeam software appliance": "veeam",
    "emc networker vproxy": "vproxy",
    "vmware vcenter server appliance": "vcenter",
    "stork agent (dhcp)": "dhcp", "stork db (dhcp)": "dhcp",
    "stork server (dhcp)": "dhcp",
}

# classificacao por chave canonica (norm). Fonte: anotacoes do Excel +
# identificacao-servicos-suporte.md da sessao anterior.
SUPORTE = {
    "vproxy", "backup", "networker", "veeam", "zabbix", "graylog", "prtg",
    "observer", "tenable", "lpar2rrd", "orion", "solarwinds", "stork",
    "domain controller", "mim", "azure ad connet", "azure ad connect", "rms",
    "tacacs", "dns", "dhcp", "ntp", "exchange", "sophos", "wsus", "sccm",
    "system center", "scsm", "jump server", "sftp", "ftp", "file server",
    "ansible", "netbox", "vcenter", "vmware vcenter server appliance",
    "nginx", "support server", "desenvolvimento", "posto de trabalho",
}
# nota: PSI (processamento de salarios), EXCEL REPORT (relatorios
# contabilisticos) e ETL sao NEGOCIO apesar do nome tecnico — nao listar acima.
SEGURANCA = {"securesphere", "securesphere gateway cluster", "imperva", "waf",
             "checkpoint", "firewall", "sonda", "cyberark"}
PLATAFORMA = {"integrador", "compute nodes", "ocp", "okd", "eai", "middleware",
              "ibm cp", "kubernetes", "openshift"}

# inferencia por nome para VMs SEM anotacao util (confianca baixa)
NOME_KEYWORDS = [
    ("nginx", "nginx"), ("kea", "dhcp"), ("dhcp", "dhcp"), ("netbox", "netbox"),
    ("zabbix", "zabbix"), ("graylog", "graylog"), ("prtg", "prtg"),
    ("vproxy", "vproxy"), ("networker", "vproxy"), ("jump", "jump server"),
    ("bastion", "jump server"), ("vcenter", "vcenter"), ("lpar2rrd", "lpar2rrd"),
    ("ibm-cp-", "ibm cp"), ("observer", "observer"), ("tape", "backup"),
    ("swift", "swift"), ("dc0", "domain controller"), ("dns", "dns"),
]


def deaccent(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def canon(s):
    n = re.sub(r"\s+", " ", deaccent(s or "").lower()).strip()
    return ALIASES.get(n, n)


def classifica(chave):
    if chave in SUPORTE:
        return "suporte"
    if chave in SEGURANCA:
        return "seguranca"
    if chave in PLATAFORMA or chave.startswith(("integrador", "ocp", "okd", "ibm cp")):
        return "plataforma"
    return "negocio"


def main():
    inv = json.load(open(INV, encoding="utf-8"))
    cmpd = json.load(open(CMP, encoding="utf-8"))
    pares = {(p["vm"], p.get("uuid")): p for p in cmpd["matched_pairs"]}

    servicos = defaultdict(lambda: {"vms": [], "confiancas": set(), "displays": set()})
    sem_servico = []

    for vm in inv["vms"]:
        if re.match(r"^(vCLS-|TE?L?MPLATE[_ ])", vm["name"], re.I):
            continue
        chave, conf, origem = None, None, None
        if vm.get("servico_anotacao"):
            chave, conf, origem = canon(vm["servico_anotacao"]), "alta", "anotacao"
        else:
            hay = deaccent(f"{vm['name']} {vm.get('anotacao') or ''}").lower()
            for kw, alvo in NOME_KEYWORDS:
                if kw in hay:
                    chave, conf, origem = canon(alvo), "baixa", f"nome contem '{kw}'"
                    break
        par = pares.get((vm["name"], vm.get("instance_uuid")))
        if not chave and par:
            # Excel mudo mas o Zabbix ja conhece o servico (tag de sessao
            # anterior): usar como fallback de GAP — nunca sobrepoe o Excel.
            tz = par["tags"].get("servico")
            if tz and canon(tz) not in ("sem-anotacao", "sem-classificacao"):
                chave, conf, origem = canon(tz), "media", "tag servico Zabbix (Excel sem anotacao)"
        vminfo = {
            "vm": vm["name"], "anotacao": vm.get("anotacao"),
            "ambiente": vm.get("ambiente"), "departamento": vm.get("departamento"),
            "cluster": vm.get("cluster"), "power_state": vm.get("power_state"),
            "confianca": conf, "origem_classificacao": origem,
            "zabbix_hostid": par["hostid"] if par else None,
            "zabbix_host": par["zabbix_name"] if par else None,
            "zabbix_grupos": par["grupos"] if par else None,
            "zabbix_tag_servico": (par["tags"].get("servico") if par else None),
        }
        if not chave:
            sem_servico.append(vminfo)
            continue
        s = servicos[chave]
        s["vms"].append(vminfo)
        s["confiancas"].add(conf)
        s["displays"].add(vm.get("servico_anotacao") or chave)

    # monta propostas
    mapa = {}
    DOM = {"suporte": "BPC/DOMINIO/10 Servicos de Suporte",
           "seguranca": "BPC/DOMINIO/05 Seguranca",
           "plataforma": "BPC/DOMINIO/07 APIs e Servicos de Negocio"}
    for chave, s in sorted(servicos.items(), key=lambda kv: -len(kv[1]["vms"])):
        classe = classifica(chave)
        n = len(s["vms"])
        if classe in DOM:
            grupo = DOM[classe]
        elif n >= MIN_VMS_GRUPO:
            grupo = f"BPC/SERVICO/{sorted(s['displays'])[0].upper()}"
        else:
            grupo = None  # so tag servico
        # estado atual: quantos hosts ja estao no grupo proposto / tem tag
        casados = [v for v in s["vms"] if v["zabbix_hostid"]]
        ja_no_grupo = sum(1 for v in casados
                          if grupo and any(grupo == g for g in (v["zabbix_grupos"] or [])))
        com_tag = sum(1 for v in casados if v["zabbix_tag_servico"]
                      and v["zabbix_tag_servico"] != "SEM-ANOTACAO")
        mapa[chave] = {
            "display": sorted(s["displays"])[0],
            "variantes_grafia": sorted(s["displays"]),
            "classe": classe,
            "n_vms": n,
            "n_casados_zabbix": len(casados),
            "grupo_proposto": grupo,
            "hosts_ja_no_grupo_proposto": ja_no_grupo,
            "hosts_com_tag_servico": com_tag,
            "confianca": "alta" if s["confiancas"] == {"alta"} else
                         ("baixa" if s["confiancas"] == {"baixa"} else "mista"),
            "vms": s["vms"],
        }

    resumo = {
        "servicos_distintos": len(mapa),
        "por_classe": {c: sum(1 for m in mapa.values() if m["classe"] == c)
                       for c in ("suporte", "seguranca", "plataforma", "negocio")},
        "vms_por_classe": {c: sum(m["n_vms"] for m in mapa.values() if m["classe"] == c)
                           for c in ("suporte", "seguranca", "plataforma", "negocio")},
        "novos_grupos_negocio_propostos": sorted(
            m["grupo_proposto"] for m in mapa.values()
            if m["classe"] == "negocio" and m["grupo_proposto"]),
        "vms_sem_servico_identificavel": len(sem_servico),
    }
    json.dump({"resumo": resumo, "servicos": mapa, "sem_servico": sem_servico},
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(json.dumps(resumo, ensure_ascii=False, indent=1))
    print("\n== servicos de SUPORTE fora do dominio 10 (hosts casados) ==")
    for chave, m in mapa.items():
        if m["classe"] == "suporte" and m["n_casados_zabbix"] > m["hosts_ja_no_grupo_proposto"]:
            print(f"  {m['display']:30} vms={m['n_vms']:3} casados={m['n_casados_zabbix']:3} "
                  f"ja_no_10={m['hosts_ja_no_grupo_proposto']:3}")
    print("\n== grupos de NEGOCIO propostos (>= %d VMs) ==" % MIN_VMS_GRUPO)
    for chave, m in mapa.items():
        if m["classe"] == "negocio" and m["grupo_proposto"]:
            print(f"  {m['grupo_proposto']:40} vms={m['n_vms']:3} casados={m['n_casados_zabbix']:3}")
    print(f"\n-> {OUT}")


if __name__ == "__main__":
    main()
