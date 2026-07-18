"""Correcção do BPC DNS Check (bug do incidente 2026-07-16).

CAUSA (confirmada por item.get 2026-07-17): os items `net.dns[...]` foram
criados como **Simple check**, mas `net.dns` é item de **Zabbix agent** →
"Unsupported item key". `net.dns` corre NUM AGENTE, não no poller de simple
checks. Os hosts NS3/NS4 têm o agente morto (agent.ping sem dados 30d), por
isso mudar só o tipo não resolve.

SOLUÇÃO (padrão já usado no projecto: hosts sintéticos, como os `app-*` do
web monitoring): um **host-prober** dedicado cuja interface de agente aponta
ao agente saudável do próprio Zabbix server (10.10.126.22:10050, agent.ping
vivo). O agente do server executa `net.dns` contra cada DNS remoto — não
depende do agente de NS3/NS4. Todos os 4 DNS-alvo já respondem a ping do
server (validado), logo são alcançáveis.

O que este script faz (DRY-RUN por omissão; --apply para escrever, mas a
escrita Zabbix exige aprovação explícita do utilizador — constraint do
CLAUDE.md):
  A. cria host-prober "BPC DNS Prober" (grupo 10 Serviços de Suporte),
     interface agente -> agente do Zabbix server;
  B. 4 items net.dns (Zabbix agent), 1 por DNS-alvo, com tag dns_target;
  C. 4 triggers individuais (High, min(,3m)=0) + 2 de correlação (Disaster,
     ambos do par em baixo) — reproduzem o desenho aprovado a 2026-07-16;
  D. desactiva (NUNCA apaga) os 4 items partidos + as 2 triggers de
     correlação antigas que dependem deles — reversível.

Nada aqui altera o vCenter nem toca em agentes de VMs.
"""
import datetime, json, os, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
TESTE1 = "--teste-1" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

ZBX_SERVER_AGENT_IP = "10.10.126.22"      # agente saudável (agent.ping vivo)
PROBER_NAME = "BPC DNS Prober"
GRUPO_SUPORTE = "BPC/DOMINIO/10 Servicos de Suporte"

# DNS-alvo (IP, zona, rótulo do host real, tipo de registo)
ALVOS = [
    ("10.5.0.128",     "bpc.ao",       "NS3",       "externo"),
    ("10.5.0.129",     "bpc.ao",       "NS4",       "externo"),
    ("10.10.240.135",  "bpc.intranet", "VS9000003", "interno-ad"),
    ("10.10.240.133",  "bpc.intranet", "VS9000007", "interno-ad"),
]
DNS_TYPE, DNS_TIMEOUT, DNS_COUNT = "SOA", "2", "3"

# items partidos a desactivar (do incidente) + triggers antigas de correlação
ITEMS_PARTIDOS = ["543125", "543126", "543127", "543128"]
TRIGGERS_ANTIGAS = ["172224", "172225"]


def call(method, params, auth=True):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    hdr = {"Content-Type": "application/json-rpc"}
    if auth:
        hdr["Authorization"] = "Bearer " + TOK
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=60) as r:
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


TOK = load_token()


def dns_key(ip, zona):
    return f"net.dns[{ip},{zona},{DNS_TYPE},{DNS_TIMEOUT},{DNS_COUNT}]"


def plan():
    """Monta o plano (lê o estado actual; não escreve)."""
    grp = call("hostgroup.get", {"filter": {"name": GRUPO_SUPORTE}, "output": ["groupid"]})
    if not grp:
        raise SystemExit(f"grupo '{GRUPO_SUPORTE}' não encontrado")
    groupid = grp[0]["groupid"]

    ja = call("host.get", {"filter": {"host": PROBER_NAME}, "output": ["hostid"]})
    prober_existe = ja[0]["hostid"] if ja else None

    itens = []
    trigs_ind = []
    for ip, zona, rot, tipo in ALVOS:
        key = dns_key(ip, zona)
        itens.append({
            "name": f"DNS {rot} resolve {zona} ({DNS_TYPE})", "key_": key,
            "type": 0,  # 0 = Zabbix agent (passivo)
            "value_type": 3, "delay": "1m",
            "tags": [{"tag": "servico", "value": "DNS"},
                     {"tag": "dns_target", "value": rot},
                     {"tag": "dns_tipo", "value": tipo}],
        })
        trigs_ind.append({
            "description": f"DNS {rot} nao resolve {zona} ha 3 min",
            "expression": f"min(/{PROBER_NAME}/{key},3m)=0",
            "priority": 4,  # High
        })
    # correlação: ambos do par em baixo = Disaster
    def expr_both(a, b):
        ka = dns_key(ALVOS[a][0], ALVOS[a][1])
        kb = dns_key(ALVOS[b][0], ALVOS[b][1])
        return f"min(/{PROBER_NAME}/{ka},3m)=0 and min(/{PROBER_NAME}/{kb},3m)=0"
    trigs_corr = [
        {"description": "AMBOS os DNS Externos (NS3+NS4) indisponiveis",
         "expression": expr_both(0, 1), "priority": 5},
        {"description": "AMBOS os DNS Internos AD (VS9000003+VS9000007) indisponiveis",
         "expression": expr_both(2, 3), "priority": 5},
    ]
    return groupid, prober_existe, itens, trigs_ind, trigs_corr


def ensure_prober(groupid, prober_existe):
    """Cria (ou reutiliza) o host-prober e devolve (hostid, interfaceid)."""
    if prober_existe:
        hostid = prober_existe
    else:
        hostid = call("host.create", {
            "host": PROBER_NAME, "name": PROBER_NAME,
            "groups": [{"groupid": groupid}],
            "interfaces": [{"type": 1, "main": 1, "useip": 1,
                            "ip": ZBX_SERVER_AGENT_IP, "dns": "", "port": "10050"}],
            "tags": [{"tag": "tipo", "value": "prober"}, {"tag": "servico", "value": "DNS"}],
        })["hostids"][0]
    iface = call("hostinterface.get", {"hostids": hostid, "output": ["interfaceid"]})[0]["interfaceid"]
    return hostid, iface


def smoke_test():
    """Cria SÓ o prober + o item NS3 (sem triggers, sem desactivar nada) e
    espera até o item coletar ou dar erro. Escrita mínima e reversível."""
    import time
    groupid, prober_existe, itens, _, _ = plan()
    hostid, iface = ensure_prober(groupid, prober_existe)
    it = itens[0]  # NS3
    ja = call("item.get", {"hostids": hostid, "filter": {"key_": it["key_"]},
                           "output": ["itemid"]})
    if ja:
        itemid = ja[0]["itemid"]
        print(f"item NS3 já existe (id {itemid}) — a reavaliar")
    else:
        itemid = call("item.create", {**it, "hostid": hostid, "interfaceid": iface})["itemids"][0]
        print(f"criado prober (host {hostid}) + item NS3 (id {itemid}): {it['key_']}")
    print("a aguardar coleta (config cache + polling, até ~3 min)…")
    for i in range(18):
        time.sleep(10)
        r = call("item.get", {"itemids": itemid,
                              "output": ["state", "error", "lastvalue", "lastclock"]})[0]
        lc = int(r.get("lastclock") or 0)
        if r["state"] == "1":
            print(f"  [{(i+1)*10}s] state=1 NOT SUPPORTED — erro: {r.get('error')}")
            if "Unsupported" in (r.get("error") or ""):
                print("\n❌ net.dns está bloqueado no agente do server (AllowKey/DenyKey)"
                      " — o risco residual materializou-se. NÃO alargar.")
                return itemid, False
        elif lc > 0:
            print(f"\n✅ COLETA OK — lastvalue={r.get('lastvalue')} "
                  f"(1=resolve, 0=falha). A arquitectura funciona; pronto para alargar.")
            return itemid, True
        else:
            print(f"  [{(i+1)*10}s] ainda sem dado (state={r['state']})…")
    print("\n⚠ sem dado após ~3 min — verificar manualmente (pode ser cache de config lenta).")
    return itemid, None


def main():
    if TESTE1:
        smoke_test()
        return
    groupid, prober_existe, itens, trigs_ind, trigs_corr = plan()

    # backup do estado a desactivar
    bkp = {"criado_em": TS,
           "items_partidos": call("item.get", {"itemids": ITEMS_PARTIDOS,
                "output": ["itemid", "hostid", "name", "key_", "type", "status"]}),
           "triggers_antigas": call("trigger.get", {"triggerids": TRIGGERS_ANTIGAS,
                "output": ["triggerid", "description", "status"], "expandExpression": True})}
    bfile = os.path.join(HERE, f"backup-dns-fix-{TS}.json")
    json.dump(bkp, open(bfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"{'== APPLY ==' if APPLY else '== DRY-RUN (nada escrito) =='}")
    print(f"\nA) HOST-PROBER '{PROBER_NAME}' "
          f"({'já existe id '+prober_existe if prober_existe else 'a criar'}) "
          f"no grupo {GRUPO_SUPORTE}")
    print(f"   interface agente -> {ZBX_SERVER_AGENT_IP}:10050 (agente do Zabbix server, vivo)")

    print(f"\nB) {len(itens)} items net.dns (tipo Zabbix agent):")
    for it in itens:
        print(f"   • {it['name']:38} key={it['key_']}")

    print(f"\nC) {len(trigs_ind)} triggers individuais (High) + {len(trigs_corr)} correlação (Disaster):")
    for t in trigs_ind + trigs_corr:
        sev = {4: "High", 5: "Disaster"}[t["priority"]]
        print(f"   • [{sev:8}] {t['description']}")

    print(f"\nD) DESACTIVAR (status=1, reversível — nunca apaga):")
    for it in bkp["items_partidos"]:
        print(f"   • item partido {it['itemid']} '{it['name'][:40]}' (Simple check net.dns)")
    for t in bkp["triggers_antigas"]:
        print(f"   • trigger antiga {t['triggerid']} '{t['description'][:50]}'")

    if not APPLY:
        print(f"\n[DRY-RUN] backup do estado a desactivar -> {bfile}")
        print("[DRY-RUN] para escrever: aprovar e correr com --apply")
        return

    # ---- APPLY (só com aprovação explícita) ----
    if prober_existe:
        hostid = prober_existe
    else:
        hostid = call("host.create", {
            "host": PROBER_NAME, "name": PROBER_NAME,
            "groups": [{"groupid": groupid}],
            "interfaces": [{"type": 1, "main": 1, "useip": 1,
                            "ip": ZBX_SERVER_AGENT_IP, "dns": "", "port": "10050"}],
            "tags": [{"tag": "tipo", "value": "prober"}, {"tag": "servico", "value": "DNS"}],
        })["hostids"][0]
    iface = call("hostinterface.get", {"hostids": hostid, "output": ["interfaceid"]})[0]["interfaceid"]

    keymap = {}
    for it in itens:
        r = call("item.create", {**it, "hostid": hostid, "interfaceid": iface})
        keymap[it["key_"]] = r["itemids"][0]
    for t in trigs_ind + trigs_corr:
        call("trigger.create", t)
    for iid in ITEMS_PARTIDOS:
        call("item.update", {"itemid": iid, "status": 1})
    for tid in TRIGGERS_ANTIGAS:
        call("trigger.update", {"triggerid": tid, "status": 1})
    print(f"\n[APPLY] prober={hostid}, {len(itens)} items, "
          f"{len(trigs_ind)+len(trigs_corr)} triggers criados; "
          f"{len(ITEMS_PARTIDOS)} items + {len(TRIGGERS_ANTIGAS)} triggers antigas desactivados.")
    print(f"[APPLY] backup: {bfile}")


if __name__ == "__main__":
    main()
