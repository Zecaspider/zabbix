"""Deixa o Zabbix "no ponto" (SO, departamento, cluster, servico, tags) para
a fase de templates/triggers/dashboards. NADA e escrito no vCenter — regra
do utilizador: a outra equipa e dona do vCenter; nos so validamos e
corrigimos o LADO ZABBIX.

Fase A — tags em massa (468 hosts casados; fonte = inventario live-first):
  so             : "Windows"/"Linux" derivado do SO real (guest tools) —
                   criado se falta, corrigido se classe errada
  cod_ambiente   : preenchido se falta (nunca sobrepoe divergente)
  ambiente       : preenchido se falta OU se 'A-CLASSIFICAR'; vocab
                   {Produção, QA, Operações}
  servico/departamento/vcenter_cluster : preenchidos se faltam
  esxi_host      : ATUALIZADO para o valor live de hoje (so VMs live) —
                   politica de remocao continua em aberto; entretanto que
                   a tag nao minta
  typos          : SECURESHERE->SECURESPHERE, CONNET->CONNECT (so na tag)

Fase B — cirurgia de identidades (lado Zabbix):
  host "Sftp pmsi - VM - VS8000319": IP -> 10.10.238.57 (VM SFTP live;
    validado por ping) e macro UUID -> instance da VS8000319;
  host "Talentia - VM - VS9000319": ganha macro UUID da VS9000319
    (IP 10.10.236.55 ja esta certo).

Fase C — renomear visible names mentirosos (ex-"Integrador" que monitorizam
  as VMs PRD, provado por UUID+IP): VS8000809 -> Excel Report, VS8000811 ->
  Ansible.

Backup + dry-run + verificacao. Log: aplicacao-final-<ts>.json
Uso: python aplicar_zabbix_final.py [--dry-run]
"""
import datetime
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry-run" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

SFTP_VM = {"uuid": "5023a639-ee56-054a-3fe5-d2a0b9817ec1", "ip": "10.10.238.57"}
TALENTIA_VM = {"uuid": "500d8263-cdb4-85de-8b48-a1557d74dd5d", "ip": "10.10.236.55"}
RENAMES = {"VS8000809": "Excel Report - VM - VS8000809 (QA | PMSI)",
           "VS8000811": "Ansible - VM - VS8000811 (QA | DTI)"}
TYPOS = {"SECURESHERE": "SECURESPHERE", "CONNET": "CONNECT"}
VOCAB_AMB = {"producao": "Produção", "qualidade": "QA", "operacoes": "Operações"}


def call(method, params, tok):
    body = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json-rpc", "Authorization": "Bearer " + tok})
    with urllib.request.urlopen(req, timeout=120) as r:
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


def deaccent(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def so_class(txt):
    t = (txt or "").lower()
    if "windows" in t:
        return "Windows"
    if any(k in t for k in ("linux", "rhel", "red hat", "centos", "ubuntu",
                            "debian", "suse", "photon", "freebsd")):
        return "Linux"
    return None


def ping(ip):
    try:
        r = subprocess.run(["ping", "-n", "2", "-w", "1000", ip],
                           capture_output=True, text=True, timeout=10)
        return "TTL=" in r.stdout
    except Exception:
        return False


def main():
    tok = load_token()
    inv = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))
    cmp_ = json.load(open(os.path.join(HERE, "comparacao-campos.json"), encoding="utf-8"))
    vm_by_name = {v["name"]: v for v in inv["vms"]}
    log = {"executado_em": TS, "dry_run": DRY, "A_tags": [], "B_cirurgia": [],
           "C_renames": [], "erros": []}

    # ---------- FASE A ----------
    hostids = sorted({p["hostid"] for p in cmp_["matched_pairs"]})
    hosts = call("host.get", {"hostids": hostids, "output": ["hostid", "host", "name"],
                              "selectTags": "extend"}, tok)
    hcur = {h["hostid"]: h for h in hosts}
    n_por_tag = {}
    for p in cmp_["matched_pairs"]:
        vm = vm_by_name.get(p["vm"])
        h = hcur.get(p["hostid"])
        if not vm or not h:
            continue
        atuais = {t["tag"]: t["value"] for t in h.get("tags", [])}
        mud = {}

        so = so_class(vm.get("so"))
        if so and so_class(atuais.get("so")) != so:
            mud["so"] = so
        if vm.get("codigo") and "cod_ambiente" not in atuais:
            mud["cod_ambiente"] = vm["codigo"]
        amb_vm = VOCAB_AMB.get(deaccent(vm.get("ambiente") or "").lower())
        if amb_vm and ("ambiente" not in atuais
                       or atuais["ambiente"] == "A-CLASSIFICAR"):
            mud["ambiente"] = amb_vm
        for tag, campo in (("servico", "servico_anotacao"),
                           ("departamento", "departamento"),
                           ("vcenter_cluster", "cluster")):
            if vm.get(campo) and tag not in atuais:
                mud[tag] = str(vm[campo])
        if vm.get("fonte", "").startswith("live") and vm.get("esxi_host") \
                and "esxi_host" in atuais:
            live_esxi = vm["esxi_host"].split(".")[0]
            if atuais["esxi_host"].split(".")[0].lower() != live_esxi.lower():
                mud["esxi_host"] = live_esxi
        for tag in ("servico",):
            val = mud.get(tag, atuais.get(tag))
            if val:
                novo = val
                for errado, certo in TYPOS.items():
                    novo = re.sub(errado, certo, novo, flags=re.IGNORECASE)
                if novo != val:
                    mud[tag] = novo

        if not mud:
            continue
        merged = {**atuais, **mud}
        if not DRY:
            call("host.update", {"hostid": p["hostid"],
                                 "tags": [{"tag": k, "value": v} for k, v in merged.items()]}, tok)
        log["A_tags"].append({"hostid": p["hostid"], "host": h["name"], "mudancas": mud})
        for k in mud:
            n_por_tag[k] = n_por_tag.get(k, 0) + 1

    # ---------- FASE B: cirurgia ----------
    def find_host(frag):
        r = call("host.get", {"search": {"name": frag}, "output": ["hostid", "host", "name"],
                              "selectInterfaces": "extend"}, tok)
        return r[0] if len(r) == 1 else None

    sftp = find_host("Sftp pmsi - VM - VS8000319")
    tal = find_host("Talentia - VM - VS9000319")
    if sftp and ping(SFTP_VM["ip"]):
        mif = next((i for i in sftp["interfaces"] if i["main"] == "1"), None)
        macs = call("usermacro.get", {"hostids": sftp["hostid"],
                                      "filter": {"macro": "{$VMWARE.VM.UUID}"},
                                      "output": ["hostmacroid", "value"]}, tok)
        if not DRY:
            if mif:
                call("hostinterface.update", {"interfaceid": mif["interfaceid"],
                                              "ip": SFTP_VM["ip"], "useip": 1}, tok)
            if macs:
                call("usermacro.update", {"hostmacroid": macs[0]["hostmacroid"],
                                          "value": SFTP_VM["uuid"]}, tok)
        log["B_cirurgia"].append({"host": sftp["name"], "ip": SFTP_VM["ip"],
                                  "uuid": SFTP_VM["uuid"],
                                  "antes": {"ip": mif["ip"] if mif else None,
                                            "uuid": macs[0]["value"] if macs else None}})
    else:
        log["erros"].append({"fase": "B", "erro": "host SFTP nao encontrado ou IP novo sem ping"})
    if tal:
        macs = call("usermacro.get", {"hostids": tal["hostid"],
                                      "filter": {"macro": "{$VMWARE.VM.UUID}"},
                                      "output": ["hostmacroid", "value"]}, tok)
        if not DRY:
            if macs:
                call("usermacro.update", {"hostmacroid": macs[0]["hostmacroid"],
                                          "value": TALENTIA_VM["uuid"]}, tok)
            else:
                call("usermacro.create", {"hostid": tal["hostid"],
                                          "macro": "{$VMWARE.VM.UUID}",
                                          "value": TALENTIA_VM["uuid"]}, tok)
        log["B_cirurgia"].append({"host": tal["name"], "uuid": TALENTIA_VM["uuid"],
                                  "antes": {"uuid": macs[0]["value"] if macs else None}})
    else:
        log["erros"].append({"fase": "B", "erro": "host Talentia nao encontrado (unico)"})

    # ---------- FASE C: renames ----------
    for vmid, novo_nome in RENAMES.items():
        r = call("host.get", {"search": {"name": f"- VM - {vmid}"},
                              "output": ["hostid", "name"]}, tok)
        cand = [h for h in r if "integrador" in deaccent(h["name"]).lower()]
        if len(cand) != 1:
            log["erros"].append({"fase": "C", "vmid": vmid,
                                 "erro": f"{len(cand)} candidatos — pulado"})
            continue
        if not DRY:
            call("host.update", {"hostid": cand[0]["hostid"], "name": novo_nome}, tok)
        log["C_renames"].append({"hostid": cand[0]["hostid"],
                                 "antes": cand[0]["name"], "depois": novo_nome})

    # ---------- backup + verificacao ----------
    bfile = os.path.join(HERE, f"backup-final-{TS}.json")
    json.dump({"criado_em": TS, "hosts_tags_pre": hosts,
               "sftp_pre": sftp, "talentia_pre": tal},
              open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    falhas = []
    if not DRY:
        pos = call("host.get", {"hostids": [a["hostid"] for a in log["A_tags"]] or ["0"],
                                "output": ["hostid"], "selectTags": "extend"}, tok)
        pt = {h["hostid"]: {t["tag"]: t["value"] for t in h["tags"]} for h in pos}
        for a in log["A_tags"]:
            for k, v in a["mudancas"].items():
                if pt.get(a["hostid"], {}).get(k) != v:
                    falhas.append({"hostid": a["hostid"], "check": f"tag {k}"})
    log["verificacao"] = {"falhas": falhas, "ok": not falhas}

    lfile = os.path.join(HERE, f"aplicacao-final-{TS}.json")
    json.dump(log, open(lfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{'[DRY-RUN] ' if DRY else ''}A: {len(log['A_tags'])} hosts com tags mudadas "
          f"{n_por_tag} | B: {len(log['B_cirurgia'])} cirurgias | "
          f"C: {len(log['C_renames'])} renames | erros: {len(log['erros'])} | "
          f"verif: {'OK' if not falhas else f'{len(falhas)} FALHAS'}")
    for b in log["B_cirurgia"]:
        print(f"  B {b['host'][:50]:50} antes={b['antes']}")
    for c in log["C_renames"]:
        print(f"  C {c['antes'][:48]} -> {c['depois']}")
    for e in log["erros"]:
        print(f"  ERRO {e}")
    print(f"backup: {bfile}\nlog: {lfile}")


if __name__ == "__main__":
    main()
