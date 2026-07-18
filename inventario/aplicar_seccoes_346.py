"""Aplica as seccoes 6, 3 e 4 do plano com as regras decididas pelo
utilizador (2026-07-17):

S6 (conflitos de tag): vence o vCenter (anotacao) PARA VMS CONFIRMADAS LIVE.
   Excecoes: (a) VM so no snapshot/PowerFlex (sem credencial p/ confrontar)
   -> mantem Zabbix ate Z.8; (b) anotacao suspeita (vProxyr/typos) -> vai
   para a proposta da seccao 10, nao se aplica valor duvidoso.
   Vocabulario ao escrever ambiente: o ja usado no Zabbix (Producao->
   "Produção", Qualidade->"QA").

S3 (hosts grupo 03 sem VM): validacao = ping a cada IP + ultimo dado
   coletado (item.get lastclock) + disponibilidade da interface. Qualquer
   sinal de vida -> RETIDO (investigar). Sem sinais -> DESATIVAR (status=1;
   nunca apagar).

S4 (onboarding): so VMs POWERED_ON. IP: guest_ip live ou resolucao DNS
   <tech>.bpc.intranet. Host: grupos 03 + funcional (mapa-servicos) ou
   A-CLASSIFICAR; templates VMware Guest (+ BPC Ping se ha IP); macros
   {$VMWARE.URL} do PRD e {$VMWARE.VM.UUID}=instance uuid live; tags da
   anotacao. Interface: IP se conhecido, senao DNS (falha visivel, nunca
   IP inventado — licao VS8000223).

Backups + verificacao. Log: aplicacao-seccoes346-<ts>.json
Uso: python aplicar_seccoes_346.py [--dry-run]
"""
import datetime
import json
import os
import re
import socket
import subprocess
import sys
import unicodedata
import urllib.request
from collections import defaultdict

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
AGORA = int(datetime.datetime.now().timestamp())

VMWARE_URL_PRD = "https://10.10.101.9/sdk"


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


def deaccent(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def main():
    tok = load_token()
    plano = json.load(open(os.path.join(HERE, "plano-correcao.json"), encoding="utf-8"))
    inv = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))
    mapa = json.load(open(os.path.join(HERE, "mapa-servicos.json"), encoding="utf-8"))
    vm_by_name = {v["name"]: v for v in inv["vms"]}
    log = {"executado_em": TS, "dry_run": DRY,
           "s6_aplicados": [], "s6_excecao_powerflex": [], "s6_para_seccao10": [],
           "s3_desativados": [], "s3_retidos": [],
           "s4_criados": [], "s4_pulados": [], "erros": []}

    # ============ S6: conflitos de tag ============
    conflitos = plano["6_tags_conflito"]
    # criterio de match por (hostid, tag, vm) — para excluir matches fracos
    cmp_ = json.load(open(os.path.join(HERE, "comparacao-campos.json"), encoding="utf-8"))
    crit_idx = {}
    for campo, tag in (("tag_ambiente", "ambiente"), ("tag_servico", "servico"),
                       ("tag_departamento", "departamento")):
        for d in cmp_["divergencias"].get(campo, []):
            crit_idx[(d["hostid"], tag, d["vm"])] = d["criterio_match"]
    VMID_RE = re.compile(r"\b(V[SD]\d{6,7})\b", re.IGNORECASE)

    hostids6 = sorted({x["hostid"] for x in conflitos})
    hosts6 = call("host.get", {"hostids": hostids6, "output": ["hostid", "host", "name"],
                               "selectTags": "extend"}, tok)
    h6 = {h["hostid"]: h for h in hosts6}
    VOCAB_AMB = {"producao": "Produção", "qualidade": "QA"}

    novos_por_host = defaultdict(dict)
    for x in conflitos:
        vm = vm_by_name.get(x["vm"], {})
        fonte_live = vm.get("fonte", "").startswith("live")
        hay = deaccent(f"{x['vm']} {x['valor_excel']}").lower()
        crit = crit_idx.get((x["hostid"], x["tag"], x["vm"]))
        m_vm = VMID_RE.search(x["vm"] or "")
        hh = h6.get(x["hostid"], {})
        m_h = VMID_RE.search(f"{hh.get('host','')} {hh.get('name','')}")
        if "vproxy" in hay:
            log["s6_para_seccao10"].append({**x, "motivo": "anotacao suspeita (vProxyr/LQI em appliance de backup de producao)"})
            continue
        if crit == "ip(desempate)":
            log["s6_para_seccao10"].append({**x, "motivo": "match apenas por IP de desempate — fraco demais para reetiquetar"})
            continue
        if m_vm and m_h and m_vm.group(1).upper() != m_h.group(1).upper():
            log["s6_para_seccao10"].append({**x, "motivo": f"IDENTIDADE CRUZADA: VM {m_vm.group(1)} vs host {m_h.group(1)} — macro/IP do host apontam para outra VM; cirurgia manual (seccao 10)"})
            continue
        if not fonte_live:
            log["s6_excecao_powerflex"].append({**x, "motivo": "VM so no snapshot — sem vCenter live para confrontar (Z.8)"})
            continue
        val = str(x["valor_excel"]).strip()
        if x["tag"] == "ambiente":
            val = VOCAB_AMB.get(deaccent(val).lower(), val)
        elif x["tag"] == "departamento":
            val = val.upper()
        novos_por_host[x["hostid"]][x["tag"]] = {"novo": val, "antigo": x["valor_zabbix"], "vm": x["vm"]}

    for hostid, mud in sorted(novos_por_host.items()):
        cur = h6.get(hostid)
        atuais = {t["tag"]: t["value"] for t in cur.get("tags", [])}
        for tag, m in mud.items():
            atuais[tag] = m["novo"]
        if not DRY:
            call("host.update", {"hostid": hostid,
                                 "tags": [{"tag": k, "value": v} for k, v in atuais.items()]}, tok)
        log["s6_aplicados"].append({"hostid": hostid, "host": cur["name"], "mudancas": mud})

    # ============ S3: hosts sem VM — validar e desativar ============
    s3 = plano["3_hosts_sem_vm"]
    backup3 = call("host.get", {"hostids": [x["hostid"] for x in s3],
                                "output": ["hostid", "host", "name", "status"],
                                "selectInterfaces": "extend", "selectTags": "extend",
                                "selectHostGroups": ["name"]}, tok)
    b3 = {h["hostid"]: h for h in backup3}
    for x in s3:
        h = b3.get(x["hostid"])
        sinais = {"ping": [], "dado_recente": None, "iface_available": []}
        vivo = False
        for i in h.get("interfaces", []):
            ip = i.get("ip")
            if ip and ip != "127.0.0.1":
                ok = ping(ip)
                sinais["ping"].append({ip: ok})
                vivo = vivo or ok
            sinais["iface_available"].append(i.get("available"))
            if i.get("available") == "1":
                vivo = True
        its = call("item.get", {"hostids": x["hostid"], "output": ["lastclock"]}, tok)
        last = max((int(i.get("lastclock") or 0) for i in its), default=0)
        sinais["dado_recente"] = (f"{(AGORA-last)//86400}d atras" if last else "nunca")
        if last and AGORA - last < 7 * 86400:
            vivo = True
        item = {"hostid": x["hostid"], "host": h["name"], "sinais": sinais}
        if vivo:
            item["motivo"] = "SINAL DE VIDA (ping/agente/dados recentes) — investigar antes de desativar"
            log["s3_retidos"].append(item)
        else:
            if not DRY:
                call("host.update", {"hostid": x["hostid"], "status": 1}, tok)
            item["motivo"] = "sem ping, sem agente, sem dados recentes + sem VM em 2 fontes — desativado"
            log["s3_desativados"].append(item)

    # ============ S4: onboarding ============
    gid = {g["name"]: g["groupid"] for g in call("hostgroup.get", {"output": ["groupid", "name"]}, tok)}
    tid = {t["name"]: t["templateid"] for t in call(
        "template.get", {"output": ["templateid", "name"],
                         "filter": {"name": ["VMware Guest", "BPC Ping"]}}, tok)}
    G03, GAC = gid["BPC/DOMINIO/03 Servidores Virtuais"], gid["BPC/CAMADA/A-CLASSIFICAR"]
    DOM = {"suporte": gid.get("BPC/DOMINIO/10 Servicos de Suporte"),
           "seguranca": gid.get("BPC/DOMINIO/05 Seguranca"),
           "plataforma": gid.get("BPC/DOMINIO/07 APIs e Servicos de Negocio")}
    # vm -> (classe, grupo_proposto, display)
    vm_cls = {}
    for chave, m in mapa["servicos"].items():
        for v in m["vms"]:
            vm_cls[v["vm"]] = (m["classe"], m.get("grupo_proposto"), m["display"])

    existentes = {h["host"].lower() for h in call("host.get", {"output": ["host"]}, tok)}

    for x in plano["4_onboarding"]:
        vm = vm_by_name.get(x["vm"], {})
        if x["power_state"] != "POWERED_ON":
            log["s4_pulados"].append({"vm": x["vm"], "motivo": f"power_state={x['power_state']} — nao criar"})
            continue
        tech = re.split(r"\s*\(", x["vm"])[0].strip().replace(" ", "_")
        if tech.lower() in existentes:
            log["s4_pulados"].append({"vm": x["vm"], "motivo": f"host tecnico '{tech}' ja existe no Zabbix"})
            continue
        ip = x.get("ip") or vm.get("guest_ip")
        dns = f"{tech}.bpc.intranet"
        ip_origem = "vCenter live" if ip else None
        if not ip:
            try:
                ip = socket.gethostbyname(dns)
                ip_origem = f"DNS {dns}"
            except OSError:
                ip = None
        ip_ping = ping(ip) if ip else False

        classe, grupo_srv, display = vm_cls.get(x["vm"], (None, None, None))
        grupos = [{"groupid": G03}]
        if classe in DOM and DOM[classe]:
            grupos.append({"groupid": DOM[classe]})
        elif grupo_srv and grupo_srv in gid:
            grupos.append({"groupid": gid[grupo_srv]})
        elif not classe:
            grupos.append({"groupid": GAC})

        templates = [{"templateid": tid["VMware Guest"]}]
        if ip and ip_ping:
            templates.append({"templateid": tid["BPC Ping"]})

        iface = {"type": 1, "main": 1, "port": "10050",
                 "useip": 1 if ip else 0, "ip": ip or "", "dns": "" if ip else dns}
        tags = [{"tag": "source", "value": f"inventario-3vias-{TS[:8]}"}]
        for tag, campo in (("servico", "servico_anotacao"), ("ambiente", "ambiente"),
                           ("departamento", "departamento"), ("vcenter_cluster", "cluster")):
            if vm.get(campo):
                v = vm[campo]
                if tag == "ambiente":
                    v = {"Producao": "Produção", "Qualidade": "QA"}.get(v, v)
                tags.append({"tag": tag, "value": str(v)})
        visname = f"{display or 'Sem-Classificação'} - VM - {tech}"
        macros = [{"macro": "{$VMWARE.URL}", "value": VMWARE_URL_PRD}]
        if vm.get("instance_uuid") and vm.get("fonte", "").startswith("live"):
            macros.append({"macro": "{$VMWARE.VM.UUID}", "value": vm["instance_uuid"]})

        params = {"host": tech, "name": visname, "groups": grupos,
                  "templates": templates, "interfaces": [iface],
                  "macros": macros, "tags": tags}
        if DRY:
            hostid = "DRY"
        else:
            hostid = call("host.create", params, tok)["hostids"][0]
        log["s4_criados"].append({
            "hostid": hostid, "tech": tech, "visname": visname,
            "ip": ip, "ip_origem": ip_origem, "ip_responde": ip_ping,
            "grupos": [g["groupid"] for g in grupos],
            "templates": [t["templateid"] for t in templates],
            "uuid": vm.get("instance_uuid"), "classe": classe})

    # ============ backup + verificacao ============
    bfile = os.path.join(HERE, f"backup-seccoes346-{TS}.json")
    json.dump({"criado_em": TS, "tags_pre_s6": hosts6, "hosts_pre_s3": backup3},
              open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    falhas = []
    if not DRY:
        pos6 = call("host.get", {"hostids": hostids6, "output": ["hostid"],
                                 "selectTags": "extend"}, tok)
        p6 = {h["hostid"]: {t["tag"]: t["value"] for t in h["tags"]} for h in pos6}
        for a in log["s6_aplicados"]:
            for tag, m in a["mudancas"].items():
                if p6.get(a["hostid"], {}).get(tag) != m["novo"]:
                    falhas.append({"hostid": a["hostid"], "check": f"tag {tag}"})
        pos3 = call("host.get", {"hostids": [d["hostid"] for d in log["s3_desativados"]] or ["0"],
                                 "output": ["hostid", "status"]}, tok)
        for h in pos3:
            if h["status"] != "1":
                falhas.append({"hostid": h["hostid"], "check": "status nao desativado"})
        criados_ids = [c["hostid"] for c in log["s4_criados"]]
        pos4 = call("host.get", {"hostids": criados_ids or ["0"], "output": ["hostid"]}, tok)
        if len(pos4) != len(criados_ids):
            falhas.append({"check": f"criados {len(criados_ids)} mas relidos {len(pos4)}"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}

    lfile = os.path.join(HERE, f"aplicacao-seccoes346-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{'[DRY-RUN] ' if DRY else ''}"
          f"S6: {len(log['s6_aplicados'])} hosts atualizados, "
          f"{len(log['s6_excecao_powerflex'])} excecao PowerFlex, "
          f"{len(log['s6_para_seccao10'])} p/ seccao 10 | "
          f"S3: {len(log['s3_desativados'])} desativados, {len(log['s3_retidos'])} retidos | "
          f"S4: {len(log['s4_criados'])} criados, {len(log['s4_pulados'])} pulados | "
          f"verif: {'OK' if not falhas else f'{len(falhas)} FALHAS'}")
    for a in log["s6_aplicados"]:
        for tag, m in a["mudancas"].items():
            print(f"  S6 {a['host'][:42]:42} {tag}: {str(m['antigo'])[:24]!r} -> {m['novo']!r}")
    for r in log["s3_retidos"]:
        print(f"  S3 RETIDO {r['host'][:55]:55} :: dado={r['sinais']['dado_recente']} ping={r['sinais']['ping']}")
    for d in log["s3_desativados"]:
        print(f"  S3 DESATIVADO {d['host'][:60]}")
    for c in log["s4_criados"]:
        print(f"  S4 CRIADO {c['tech']:22} ip={c['ip'] or 'DNS:'+c['tech']+'.bpc.intranet':18} "
              f"({c['ip_origem'] or 'sem IP'}; ping={c['ip_responde']}) classe={c['classe']}")
    for p in log["s4_pulados"]:
        print(f"  S4 pulado {p['vm'][:35]:35} :: {p['motivo'][:60]}")
    print(f"backup: {bfile}\nlog: {lfile}")


if __name__ == "__main__":
    main()
