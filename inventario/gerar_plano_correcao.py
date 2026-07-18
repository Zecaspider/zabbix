"""Gera o PLANO DE CORRECAO host-a-host a partir das comparacoes ja feitas.
NAO APLICA NADA — so leitura no Zabbix. Saidas:
  plano-correcao.json  (acionavel: cada item tem api_method+params prontos,
                        evidencia, risco e requer_aprovacao)
  plano-correcao.md    (revisao humana, por seccao, com checkboxes)

Regras herdadas das licoes do projeto:
  - NUNCA propor apagar hosts — so desativar (licao VS8000223: host "lixo"
    era VM real com IP errado).
  - IP so e proposto quando o live traz IPv4 routavel (fe80/169.254 nunca
    substituem nada).
  - Macro UUID: instance_uuid live = confianca alta; BIOS UUID de snapshot =
    item adiado (aguardar Z.8/PowerFlex live).
"""
import datetime
import json
import os
import re
import unicodedata
import urllib.request
from collections import defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))

CMP = json.load(open(os.path.join(HERE, "comparacao-campos.json"), encoding="utf-8"))
TRI = json.load(open(os.path.join(HERE, "comparacao-3vias.json"), encoding="utf-8"))
MAPA = json.load(open(os.path.join(HERE, "mapa-servicos.json"), encoding="utf-8"))
INV = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))

VM_BY_NAME = {v["name"]: v for v in INV["vms"]}
PAIR_BY_HOSTID = {p["hostid"]: p for p in CMP["matched_pairs"]}
PAIR_BY_VM = {p["vm"]: p for p in CMP["matched_pairs"]}


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


def ipv4_routavel(ip):
    return bool(ip) and ":" not in ip and not ip.startswith("169.254.")


def main():
    tok = load_token()
    plano = defaultdict(list)

    # dados frescos para interfaceids e macros
    hostids = sorted({p["hostid"] for p in CMP["matched_pairs"]})
    ifaces = call("hostinterface.get", {"output": ["interfaceid", "hostid", "ip", "main", "type"],
                                        "hostids": hostids}, tok)
    if_by_host = defaultdict(list)
    for i in ifaces:
        if_by_host[i["hostid"]].append(i)
    macros = call("usermacro.get", {"output": ["hostid", "macro", "value"],
                                    "filter": {"macro": "{$VMWARE.VM.UUID}"}}, tok)
    macro_hosts = {m["hostid"] for m in macros}

    # ---------- 0. NAO MEXER (correcoes a propostas anteriores) ----------
    for vmname in ("VS8000126", "VS8000127", "VS8000128"):
        vm = VM_BY_NAME.get(vmname)
        p = PAIR_BY_VM.get(vmname)
        if vm and p:
            plano["0_nao_mexer"].append({
                "hostid": p["hostid"], "zabbix_host": p["zabbix_name"],
                "acao": "NENHUMA — manter ativo",
                "evidencia": f"live 2026-07-17: {vmname} POWERED_ON em {vm.get('cluster')} "
                             f"ip={vm.get('guest_ip')}; as copias '_Migrada_Nao_Ligar' do "
                             "Cluster Swift foram apagadas do vCenter desde maio",
                "nota": "REVOGA a proposta da 1a rodada de desativar estes 3 hosts"})

    # ---------- 1. IPs de interface divergentes ----------
    for d in CMP["divergencias"].get("ip", []):
        vm = VM_BY_NAME.get(d["vm"], {})
        live = vm.get("fonte", "").startswith("live")
        ip_novo = d["excel"]
        if not ipv4_routavel(ip_novo):
            continue
        main_if = next((i for i in if_by_host.get(d["hostid"], [])
                        if i["main"] == "1" and i["type"] == "1"), None)
        item = {
            "hostid": d["hostid"], "zabbix_host": d["zabbix_host"],
            "ip_atual_zabbix": d["zabbix"], "ip_proposto": ip_novo,
            "fonte_ip": "vCenter live 2026-07-17" if live else "snapshot 2026-05-04",
            "confianca": "alta" if live else "media (confirmar quando PowerFlex live)",
            "api_method": "hostinterface.update",
            "params": {"interfaceid": main_if["interfaceid"] if main_if else None,
                       "ip": ip_novo},
            "risco": "se o agente Zabbix so responde no IP antigo, itens por agente "
                     "param — validar ping/agente no IP novo antes",
            "requer_aprovacao": True,
        }
        # caso especial: live devolve rede isolada (192.168.x) — pode ser NIC
        # secundaria; nao e erro do Zabbix
        if ip_novo.startswith("192.168."):
            item["confianca"] = "baixa — IP live em rede isolada; possivel NIC secundaria (verificar antes)"
        plano["1_ip_interface"].append(item)

    # ---------- 2. Backfill da macro {$VMWARE.VM.UUID} ----------
    for p in CMP["matched_pairs"]:
        if p["hostid"] in macro_hosts:
            continue
        vm = VM_BY_NAME.get(p["vm"], {})
        uuid = vm.get("instance_uuid")
        live = vm.get("fonte", "").startswith("live")
        if not uuid:
            continue
        plano["2_uuid_macro"].append({
            "hostid": p["hostid"], "zabbix_host": p["zabbix_name"], "vm": p["vm"],
            "uuid_proposto": uuid,
            "tipo_uuid": "instance_uuid (live)" if live else "BIOS UUID (snapshot)",
            "confianca": "alta" if live else "adiar — BIOS UUID pode nao ser o que o "
                                             "template VMware espera; aguardar Z.8",
            "api_method": "usermacro.create",
            "params": {"hostid": p["hostid"], "macro": "{$VMWARE.VM.UUID}", "value": uuid},
            "risco": "baixo (macro nova; nada a substituir)",
            "requer_aprovacao": True})

    # ---------- 3. Hosts do grupo 03 sem VM em nenhuma fonte ----------
    for h in CMP["zabbix_grupo03_sem_par"]:
        plano["3_hosts_sem_vm"].append({
            "hostid": h["hostid"], "zabbix_host": h["name"],
            "ips": h["ips"], "status_atual": "ativo" if h["status"] == "0" else "desativado",
            "evidencia": "sem par no snapshot 2026-05-04 NEM no vCenter PRD live "
                         "2026-07-17; sem macro UUID",
            "acao_proposta": "investigar → desativar (NUNCA apagar)",
            "api_method": "host.update",
            "params": {"hostid": h["hostid"], "status": 1},
            "risco": "se a VM existir no PowerFlex (unica fonte nao verificavel live), "
                     "desativar seria erro — validar dono/ping antes; Z.8 resolve",
            "requer_aprovacao": True})

    # ---------- 4. Onboarding: VMs sem cobertura Zabbix (2 fontes) ----------
    onboard = TRI.get("D_sem_cobertura_zabbix_confirmado_2_fontes", []) + \
        TRI.get("B_gap_excel_herdado_zabbix", [])
    for x in onboard:
        vm = VM_BY_NAME.get(x["vm"], {})
        serv = vm.get("servico_anotacao")
        item = {
            "vm": x["vm"], "cluster": x["cluster"], "power_state": x["power_state"],
            "ip": x.get("guest_ip"), "uuid": vm.get("instance_uuid"),
            "anotacao": vm.get("anotacao"), "servico": serv,
            "acao_proposta": ("criar host (grupos 03 + dominio funcional; templates "
                              "VMware Guest + BPC Ping; macro UUID)")
            if x["power_state"] == "POWERED_ON" else
            "VM desligada — decidir se cria desativado ou ignora",
            "requer_aprovacao": True,
        }
        if not x.get("guest_ip"):
            item["pendencia"] = "sem IP conhecido (tools off) — levantar IP antes de criar"
        plano["4_onboarding"].append(item)

    # ---------- 5. Templates de SO errados ----------
    for d in CMP["divergencias"].get("so", []):
        exc = d["excel"]
        zbx = d["zabbix"]
        alvo = "Linux by Zabbix agent active" if "linux" in json.dumps(exc).lower() \
            else "Windows by Zabbix agent active"
        errado = "Windows by Zabbix agent active" if alvo.startswith("Linux") \
            else "Linux by Zabbix agent active"
        plano["5_templates_so"].append({
            "hostid": d["hostid"], "zabbix_host": d["zabbix_host"], "vm": d["vm"],
            "so_vcenter": exc, "templates_atuais": zbx.get("templates"),
            "acao_proposta": f"trocar '{errado}' por '{alvo}'",
            "risco": "historico de itens do template errado fica orfao; agente pode "
                     "nem estar instalado — validar que o agente responde",
            "requer_aprovacao": True})

    # ---------- 6. Tags: divergencias e ausencias ----------
    for campo, chave in (("tag_ambiente", "ambiente"), ("tag_servico", "servico"),
                         ("tag_departamento", "departamento")):
        for d in CMP["divergencias"].get(campo, []):
            plano["6_tags_conflito"].append({
                "hostid": d["hostid"], "zabbix_host": d["zabbix_host"], "vm": d["vm"],
                "tag": chave, "valor_excel": d["excel"], "valor_zabbix": d["zabbix"],
                "nota": d.get("nota"),
                "acao_proposta": "DECISAO HUMANA: qual valor vence? (Excel e fonte de "
                                 "verdade, mas o valor Zabbix pode ser curadoria valida)",
                "requer_aprovacao": True})
    for campo, chave in (("tag_servico_ausente", "servico"),
                         ("tag_ambiente_ausente", "ambiente"),
                         ("tag_departamento_ausente", "departamento"),
                         ("tag_cluster_ausente", "vcenter_cluster")):
        for d in CMP["divergencias"].get(campo, []):
            plano["7_tags_ausentes"].append({
                "hostid": d["hostid"], "zabbix_host": d["zabbix_host"], "vm": d["vm"],
                "tag": chave, "valor_proposto": d["excel"],
                "evidencia": d.get("nota") or "campo do inventario consolidado",
                "api_method": "host.update(tags: adicionar preservando existentes)",
                "risco": "baixo", "requer_aprovacao": True})

    # ---------- 8. Grupos: reintegrar dominio 03 + dominio funcional ----------
    for d in CMP["divergencias"].get("grupo_03_ausente", []):
        plano["8_grupos_reintegrar_03"].append({
            "hostid": d["hostid"], "zabbix_host": d["zabbix_host"], "vm": d["vm"],
            "grupos_atuais": d["zabbix"],
            "acao_proposta": "ADICIONAR 'BPC/DOMINIO/03 Servidores Virtuais' "
                             "(sem remover os atuais)",
            "risco": "baixo", "requer_aprovacao": True})

    novos_grupos = MAPA["resumo"]["novos_grupos_negocio_propostos"]
    membros = defaultdict(list)
    for chave, m in MAPA["servicos"].items():
        g = m.get("grupo_proposto")
        if not g:
            continue
        for v in m["vms"]:
            if v.get("zabbix_hostid"):
                membros[g].append({"hostid": v["zabbix_hostid"], "vm": v["vm"],
                                   "confianca": v.get("confianca")})
    for g in sorted(membros):
        plano["9_grupos_servico"].append({
            "grupo": g,
            "novo": g in novos_grupos,
            "n_hosts": len(membros[g]),
            "hosts": membros[g],
            "acao_proposta": ("criar hostgroup + " if g in novos_grupos else "")
                             + "adicionar hosts (aditivo)",
            "requer_aprovacao": True})

    # ---------- 10. Politica (nao host-a-host, mas decide-se junto) ----------
    plano["10_politicas"] = [
        {"tema": "tag esxi_host", "achado": "98 hosts com valor obsoleto (DRS/vMotion)",
         "opcoes": ["remover a tag", "automatizar via VMware discovery", "manter e aceitar drift"]},
        {"tema": "vocabulario ambiente", "achado": "Zabbix usa QA/Producao; anotacoes usam P/Q",
         "opcoes": ["padronizar QA/PRD", "padronizar Qualidade/Producao"]},
        {"tema": "12+2 divergencias Qualidade vs Producao",
         "achado": "inclui vProxy LQI — anotacao do vCenter parece errada nesses",
         "opcoes": ["corrigir tag Zabbix", "corrigir anotacao no vCenter (fora do Zabbix)"]},
    ]

    doc = {"gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
           "totais_por_seccao": {k: len(v) for k, v in sorted(plano.items())},
           **{k: v for k, v in sorted(plano.items())}}
    out = os.path.join(HERE, "plano-correcao.json")
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(doc["totais_por_seccao"], ensure_ascii=False, indent=1))
    print(f"-> {out}")


if __name__ == "__main__":
    main()
