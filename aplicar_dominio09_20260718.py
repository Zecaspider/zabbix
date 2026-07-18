"""Reestruturação de domínios — plano §8 da taxonomia (aprovado 2026-07-18).

Executa a decisão de fronteira Negócio / Integração / Suporte:
  1. Renomear grupo 663: '07 APIs e Servicos de Negocio' -> '07 Servicos de Negocio'
  2. Criar grupo '09 Integracao e APIs'
  3. Mover para 09 (massadd): EAI + Integrador ESB (Kafka/NiFi/Elastic/CEPH/nodes),
     EXCETO GitLab
  4. GitLab (VS8000817) + ELK-de-logs (9 hosts) -> 10 Servicos de Suporte (massadd)
  5. Remover do 07 (massremove) TODAS as 53 VMs reais (ficam em 03 pela regra de
     ouro; OCP/OKD/compute só em 03+tag, Integrador/EAI em 03+09)

Métodos usados: hostgroup.update (rename), hostgroup.create, hostgroup.massadd
e hostgroup.massremove — aditivos/subtractivos, não tocam noutros dados dos
hosts. Segurança: antes de remover um host do 07, confirma que fica em >=1
grupo. Idempotente: relê o estado vivo; re-correr não duplica.

A tag `fonte` nos sintéticos é DEFERIDA (redundante enquanto o 07 é só
sintéticos; ganha valor quando os sistemas internos EBA/MATCH CASH entrarem
na vista de Negócio — ver §8.1).

DRY-RUN por omissão; --apply escreve. Backup do estado em
documentacao/backup-dominio09-<ts>.json.
"""
import datetime, json, os, re, sys, urllib.request

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
HERE = os.path.dirname(os.path.abspath(__file__))
APPLY = "--apply" in sys.argv
TS = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")

NOME07_NOVO = "BPC/DOMINIO/07 Servicos de Negocio"
NOME09 = "BPC/DOMINIO/09 Integracao e APIs"
GITLAB = "VS8000817"
ELK_LOGS = ["VS8000135", "VS8000136", "VS8000137", "VS8000772", "VS8000773",
            "VS8000774", "VS8000775", "VS8000776", "VS8000777"]


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


def call(method, params):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    hdr = {"Content-Type": "application/json-rpc", "Authorization": "Bearer " + TOK}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers=hdr)
    with urllib.request.urlopen(req, timeout=60) as r:
        out = json.loads(r.read().decode())
    if "error" in out:
        raise RuntimeError(f"{method}: {json.dumps(out['error'])}")
    return out["result"]


def servico(h):
    return {t["tag"]: t["value"] for t in h.get("tags", [])}.get("servico", "").upper()


def main():
    groups = call("hostgroup.get", {"search": {"name": "BPC/DOMINIO"}, "output": ["groupid", "name"]})
    gmap = {x["name"]: x["groupid"] for x in groups}
    G07 = gmap.get("BPC/DOMINIO/07 APIs e Servicos de Negocio") or gmap.get(NOME07_NOVO)
    G10 = gmap.get("BPC/DOMINIO/10 Servicos de Suporte")
    G09 = gmap.get(NOME09)
    if not G07 or not G10:
        raise SystemExit("grupos 07/10 não encontrados")

    hosts = call("host.get", {"groupids": [G07], "output": ["hostid", "host", "name"],
                              "selectTags": "extend", "selectHostGroups": ["groupid"]})
    real = [h for h in hosts if not h["host"].startswith("app-")]
    app = [h for h in hosts if h["host"].startswith("app-")]

    to09, gitlab, stay03 = [], [], []
    for h in real:
        if h["host"] == GITLAB:
            gitlab.append(h)
        elif servico(h) in ("INTEGRADOR", "EAI"):
            to09.append(h)
        else:
            stay03.append(h)

    elk = call("host.get", {"filter": {"host": ELK_LOGS}, "output": ["hostid", "host"]})

    # segurança: nenhum host removido do 07 pode ficar sem grupo
    orfaos = [h["host"] for h in real if len([g for g in h.get("hostgroups", []) if g["groupid"] != G07]) == 0]
    if orfaos:
        raise SystemExit(f"ABORTAR: estes ficariam sem grupo ao sair do 07: {orfaos}")

    bkp = {"ts": TS, "G07": G07, "G10": G10, "G09_pre": G09,
           "membros_07_antes": [{"hostid": h["hostid"], "host": h["host"]} for h in hosts],
           "to09": [h["host"] for h in to09], "gitlab": [h["host"] for h in gitlab],
           "elk_para_10": [h["host"] for h in elk],
           "remove_do_07": [h["host"] for h in real]}
    json.dump(bkp, open(os.path.join(HERE, "documentacao", f"backup-dominio09-{TS}.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)

    print("== APPLY ==" if APPLY else "== DRY-RUN (nada escrito; --apply para executar) ==")
    print(f"\n1) RENAME grupo {G07}: '07 APIs e Servicos de Negocio' -> '{NOME07_NOVO}'")
    print(f"2) CREATE '{NOME09}'" + (f" (já existe: {G09})" if G09 else ""))
    print(f"3) massadd 09 <- {len(to09)} hosts (EAI+Integrador+CEPH, sem GitLab)")
    print(f"4) massadd 10 <- GitLab ({len(gitlab)}) + ELK-logs ({len(elk)})")
    print(f"5) massremove 07 -> {len(real)} VMs reais (ficam em 03; 07 fica com {len(app)} sinteticos)")
    print(f"   dos 53: {len(to09)} p/09, 1 GitLab p/10, {len(stay03)} só em 03 (OCP/OKD/compute)")

    if not APPLY:
        print("\n[DRY-RUN] backup do plano gravado. Aprovar e correr com --apply.")
        return

    # 1) rename
    call("hostgroup.update", {"groupid": G07, "name": NOME07_NOVO})
    print(f"  [1] grupo {G07} renomeado")
    # 2) create 09
    if not G09:
        G09 = call("hostgroup.create", {"name": NOME09})["groupids"][0]
        print(f"  [2] grupo 09 criado: {G09}")
    # 3) add to 09
    if to09:
        call("hostgroup.massadd", {"groups": [{"groupid": G09}],
                                   "hosts": [{"hostid": h["hostid"]} for h in to09]})
        print(f"  [3] {len(to09)} hosts adicionados ao 09")
    # 4) add gitlab + elk to 10
    add10 = [{"hostid": h["hostid"]} for h in gitlab] + [{"hostid": h["hostid"]} for h in elk]
    if add10:
        call("hostgroup.massadd", {"groups": [{"groupid": G10}], "hosts": add10})
        print(f"  [4] {len(add10)} hosts adicionados ao 10 (GitLab + ELK-logs)")
    # 5) remove all real VMs from 07
    call("hostgroup.massremove", {"groupids": [G07], "hostids": [h["hostid"] for h in real]})
    print(f"  [5] {len(real)} VMs removidas do 07")

    # verificação
    apos = call("host.get", {"groupids": [G07], "output": ["host"]})
    n09 = call("host.get", {"groupids": [G09], "output": ["hostid"]})
    print(f"\n  VERIF: 07 tem agora {len(apos)} hosts (esperado {len(app)}); "
          f"09 tem {len(n09)} hosts (esperado {len(to09)})")
    print(f"  backup: documentacao/backup-dominio09-{TS}.json")


if __name__ == "__main__":
    main()
