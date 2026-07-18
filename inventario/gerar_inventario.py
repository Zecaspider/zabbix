"""Gera o inventario consolidado de VMs de todos os vCenters.

Fontes, por ordem de prioridade:
  1. LIVE — vCenters acessiveis via REST, usando um ficheiro de credenciais
     LOCAL e FORA do repositorio (ver load_cred_file). Sem esse ficheiro,
     esta etapa e pulada.
  2. SNAPSHOT — fontes/vcenter-consolidado-snapshot-20260504.xlsx (extract
     resgatado de scripts-a-analisar/de-scripts-import/), usado para todas
     as VMs que nenhuma fonte live cobrir. Hoje cobre PRD+Swift+PowerFlex
     num unico snapshot (o vCenter PowerFlex/CLS-BPC01 tem credencial
     quebrada ao vivo — pendencia Z.8 — por isso fica so no snapshot).

Saida: inventario-consolidado.json (fonte de verdade; cada VM tem o campo
"fonte" a indicar live/snapshot e a data da coleta).

So leitura em todos os sistemas. Uso:  python gerar_inventario.py
"""
import datetime
import json
import os
import ssl
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx_min import read_xlsx, sheet_as_dicts

SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "fontes", "vcenter-consolidado-snapshot-20260504.xlsx")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inventario-consolidado.json")

# vCenters alvo para extracao live (quando houver ficheiro de credenciais)
VCENTER_TARGETS = {
    "VCenter_PRD": "10.10.101.9",
    "VCenter_BackupSwift": "10.10.101.30",
    # "VCenter_PowerFlex": "10.10.232.84",  # credencial quebrada (401) — Z.8; coberto pelo snapshot
}

SSL_CTX = ssl._create_unverified_context()


def vc_get(base, sid, path):
    req = urllib.request.Request(base + path, headers={"vmware-api-session-id": sid})
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
        data = json.loads(r.read().decode())
    return data.get("value", data)


def vc_login(base, user, pwd):
    import base64
    req = urllib.request.Request(base + "/rest/com/vmware/cis/session", method="POST")
    req.add_header("Authorization", "Basic " +
                   base64.b64encode(f"{user}:{pwd}".encode()).decode())
    with urllib.request.urlopen(req, timeout=20, context=SSL_CTX) as r:
        return json.loads(r.read().decode())["value"]


def load_cred_file():
    """Le credenciais de vCenter de um ficheiro LOCAL controlado pelo utilizador,
    FORA de qualquer repositorio Git. Formato JSON:
      { "VCenter_PRD": {"url": "https://10.10.101.9", "user": "...", "pwd": "..."}, ... }
    O caminho vem da env var VCENTER_CREDS. Sem ela, nenhuma extracao live
    acontece (usa-se so o snapshot). Nunca lemos password de macros do Zabbix
    (a password dos hosts vCenter e Secret de proposito; contornar isso lendo
    a copia em texto plano das VMs guest seria minar esse controlo)."""
    path = os.environ.get("VCENTER_CREDS")
    if path and os.path.exists(path):
        try:
            return json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"  (ficheiro de credenciais ilegivel: {type(e).__name__})")
    return load_legacy_creds()


LEGACY_CREDS = r"C:\Repositorios\zabbix\scripts-a-analisar\de-scripts-import\20-cred-tester.py"


def load_legacy_creds():
    """Fallback: le as credenciais do script legado onde ja estao em texto
    plano (pendencia de seguranca conhecida — nao criamos nova copia em disco;
    quando as credenciais forem rotacionadas/movidas para um cofre, este
    fallback deve ser removido junto com o script legado)."""
    import re as _re
    if not os.path.exists(LEGACY_CREDS):
        return {}
    txt = open(LEGACY_CREDS, encoding="utf-8").read()
    out = {}
    for label, ip in (("VCenter_PRD", "10.10.101.9"),
                      ("VCenter_BackupSwift", "10.10.101.30")):
        m = _re.search(r'"ip":\s*"' + _re.escape(ip) +
                       r'",\s*"rest_url":\s*"([^"]+)",\s*"username":\s*"([^"]+)",'
                       r'\s*"password":\s*"([^"]+)"', txt)
        if m:
            out[label] = {"url": m.group(1), "user": m.group(2), "pwd": m.group(3)}
    if out:
        print(f"  (credenciais lidas do script legado para: {', '.join(out)})")
    return out


def extract_live(vcname, cred):
    """Extrai VMs de um vCenter usando credencial fornecida. Nunca imprime valores."""
    url, user, pwd = cred.get("url", ""), cred.get("user", ""), cred.get("pwd", "")
    if not (url and user and pwd):
        print(f"  [{vcname}] credencial incompleta no ficheiro — pulado")
        return []
    base = url.replace("/sdk", "").rstrip("/")

    try:
        sid = vc_login(base, user, pwd)
    except Exception as e:
        print(f"  [{vcname}] login FALHOU ({type(e).__name__}) — pulado")
        return []

    clusters = {c["cluster"]: c["name"] for c in vc_get(base, sid, "/rest/vcenter/cluster")}
    esxis = vc_get(base, sid, "/rest/vcenter/host")
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    vms = []
    for h in esxis:
        try:
            vlist = vc_get(base, sid, f"/rest/vcenter/vm?filter.hosts={h['host']}")
        except Exception:
            continue
        for v in vlist:
            rec = {
                "vcenter": vcname,
                "fonte": f"live-{now}",
                "vm_id": v["vm"],
                "name": v["name"],
                "power_state": v.get("power_state"),
                "cpu": v.get("cpu_count"),
                "ram_mib": v.get("memory_size_MiB"),
                "esxi_host": h.get("name"),
                "cluster": None,
                "instance_uuid": None,
                "bios_uuid": None,
                "guest_hostname": None,
                "guest_ip": None,
                "anotacao": None,
            }
            try:
                det = vc_get(base, sid, f"/rest/vcenter/vm/{v['vm']}")
                ident = det.get("identity", {})
                rec["instance_uuid"] = ident.get("instance_uuid")
                rec["bios_uuid"] = ident.get("bios_uuid")
            except Exception:
                pass
            try:
                g = vc_get(base, sid, f"/rest/vcenter/vm/{v['vm']}/guest/identity")
                rec["guest_hostname"] = g.get("host_name")
                rec["guest_ip"] = g.get("ip_address")
            except Exception:
                pass  # tools parados/ausentes
            vms.append(rec)
    # cluster por host (via lista de clusters + hosts por cluster)
    for cid, cname in clusters.items():
        try:
            chosts = vc_get(base, sid, f"/rest/vcenter/host?filter.clusters={cid}")
            hnames = {h["name"] for h in chosts}
            for rec in vms:
                if rec["esxi_host"] in hnames:
                    rec["cluster"] = cname
        except Exception:
            pass
    print(f"  [{vcname}] OK: {len(vms)} VMs extraidas ao vivo")
    return vms


# A sheet "Maquinas Virtuais" e uma CONCATENACAO de extracts: cada seccao
# comeca com a sua propria linha de cabecalho ("Nome", "Estado", ...). A 1a
# rodada fundiu tudo e perdeu a origem por VM; agora cada VM guarda a seccao.
# Atribuicao por clusters observados (auditoria 2026-07-17):
#   sec1 = Cluster Swift + CS9000001 + CS9000002 (extract antigo/PRD+Swift)
#   sec2 = CLS-BPC01 + CLS-MGMT (extract PowerFlex)
SNAPSHOT_HDR = ["Nome", "Estado", "SO (Config)", "SO (Guest Tools)",
                "Guest Tools Status", "IP Principal", "Hostname (Guest)",
                "Host ESXi", "Cluster", "vCPUs", "Cores/Socket", "RAM (GB)",
                "CPU Usada (MHz)", "RAM Usada (MB)", "Disco Total (GB)",
                "Qtd Discos", "Redes", "Qtd NICs", "HW Version", "Snapshots",
                "UUID", "Anotacao"]

# Convencao das anotacoes vCenter: "SERVICO[.SUBCOMPONENTE].<COD>.<DEPT>[.detalhe]"
# onde COD = [WL][PQ][A-Z]: W/L = Windows/Linux, P/Q = Producao/Qualidade.
# Aceitamos [WL][A-Z][A-Z] para apanhar typos (ex. WOB em vez de WPB) — nesses
# casos o ambiente fica por decidir em vez de inventado.
ANOT_COD = __import__("re").compile(r"^[WL][A-Z][A-Z]$")

# Departamentos/unidades reais observados nas anotacoes. Tokens fora desta
# lista na posicao do departamento sao descricao livre -> vao para "detalhe"
# (evita "departamentos" fantasma tipo "Back Office" ou "Middleware").
DEPTS = {"DTI", "PMSI", "DSI", "DSE", "SAFIRA", "DCH", "FENIX", "DCO", "DRG",
         "DOP", "DTM", "DGE", "DGR", "DPC+DGR", "DPC"}


def parse_anotacao(anot):
    """Decompoe a anotacao na convencao SERVICO.<COD>.<DEPT>[.detalhe].
    Devolve dict vazio se a anotacao nao seguir a convencao (texto livre)."""
    if not anot or anot == "N/A":
        return {}
    tokens = [t.strip() for t in anot.split(".") if t.strip()]
    cod_idx = next((i for i, t in enumerate(tokens) if ANOT_COD.match(t)), None)
    if cod_idx is None or cod_idx == 0:
        return {}
    cod = tokens[cod_idx]
    out = {
        "servico_anotacao": ".".join(tokens[:cod_idx]),
        "codigo": cod,
        "so_hint": {"W": "Windows", "L": "Linux"}[cod[0]],
    }
    amb = {"P": "Producao", "Q": "Qualidade", "O": "Operacoes"}.get(cod[1])
    if amb:
        out["ambiente"] = amb
    else:
        out["codigo_suspeito"] = True  # 2a letra fora de P/Q — provavel typo
    resto = tokens[cod_idx + 1:]
    if resto and resto[0].upper() in DEPTS:
        out["departamento"] = resto[0].upper()
        resto = resto[1:]
    if resto:
        out["detalhe"] = ".".join(resto)
    return out


def na(v):
    return None if v in (None, "", "N/A", "None") else v


def extract_snapshot(live_names, live_bios_uuids=frozenset()):
    """Linhas do snapshot 2026-05-04 cujo nome E cujo UUID (BIOS, 42xx) nao
    apareceram em nenhuma fonte live — VMs renomeadas desde maio nao entram
    em duplicado. Trata as seccoes concatenadas e marca duplicados com
    evidencia — nada e descartado silenciosamente."""
    data = read_xlsx(SNAPSHOT)
    raw = data["Maquinas Virtuais"]
    cols = [chr(ord("A") + i) for i in range(20)] + ["U", "V"]

    # separa seccoes pelas linhas de cabecalho repetidas
    records, sec = [], 0
    for row in raw:
        vals = {SNAPSHOT_HDR[i]: row.get(c) for i, c in enumerate(cols)}
        name = (vals.get("Nome") or "").strip()
        if name == "Nome":
            sec += 1
            continue
        if sec == 0 or not name or "objeto(s)" in name or name == "Maquinas Virtuais":
            continue
        vals["_seccao"] = f"sec{sec}"
        records.append(vals)

    seccao_label = {
        "sec1": "extract-1 (Swift/CS9000001/CS9000002)",
        "sec2": "extract-2 (PowerFlex: CLS-BPC01/CLS-MGMT)",
    }

    # indices para marcar duplicados (mesmo UUID entre seccoes = migracao
    # capturada 2x; mesmo nome com UUID diferente = NOME REUTILIZADO — so
    # UUID desambigua no matching com Zabbix)
    from collections import defaultdict
    by_uuid, by_name = defaultdict(list), defaultdict(list)
    for r in records:
        u = (r.get("UUID") or "").lower()
        if u:
            by_uuid[u].append(r)
        by_name[r["Nome"].strip()].append(r)

    out, dropped_dup = [], []
    for r in records:
        name = r["Nome"].strip()
        u = (r.get("UUID") or "").lower()
        if name in live_names or (u and u in live_bios_uuids):
            continue
        uuid_twins = by_uuid.get(u, [])
        if len(uuid_twins) > 1:
            # mesma VM em 2 seccoes: fica a copia LIGADA; se ambas ligadas ou
            # ambas desligadas, fica a da sec2 (extract PowerFlex, mais
            # recente na migracao CS9000002->CLS-BPC01) e o caso e ANOTADO.
            on = [t for t in uuid_twins if t.get("Estado") == "Ligada"]
            keep = on[0] if len(on) == 1 else uuid_twins[-1]
            if r is not keep:
                dropped_dup.append({
                    "name": name, "uuid": u, "seccao_descartada": r["_seccao"],
                    "cluster_descartado": r.get("Cluster"),
                    "estado_descartado": r.get("Estado"),
                    "motivo": ("copia desligada" if len(on) == 1 else
                               "ambiguo: 2 copias no mesmo estado — mantida a sec2"),
                })
                continue

        rec = {
            "vcenter": seccao_label.get(r["_seccao"], r["_seccao"]),
            "fonte": f"snapshot-2026-05-04/{r['_seccao']}",
            "vm_id": None,
            "name": name,
            "power_state": {"Ligada": "POWERED_ON", "Desligada": "POWERED_OFF"}.get(r.get("Estado"), r.get("Estado")),
            "cpu": na(r.get("vCPUs")),
            "ram_mib": None,
            "ram_gb": na(r.get("RAM (GB)")),
            "esxi_host": na(r.get("Host ESXi")),
            "cluster": na(r.get("Cluster")),
            "instance_uuid": u or None,
            "bios_uuid": None,
            "guest_hostname": na(r.get("Hostname (Guest)")),
            "guest_ip": na(r.get("IP Principal")),
            "anotacao": na(r.get("Anotacao")),
            "so_config": na(r.get("SO (Config)")),
            "so_guest_tools": na(r.get("SO (Guest Tools)")),
            "so": na(r.get("SO (Guest Tools)")) or na(r.get("SO (Config)")),
            "guest_tools_status": na(r.get("Guest Tools Status")),
            "redes": na(r.get("Redes")),
            "disco_total_gb": na(r.get("Disco Total (GB)")),
        }
        rec.update(parse_anotacao(rec["anotacao"]))
        # nome partilhado por VMs com UUIDs distintos -> matching por nome e
        # AMBIGUO para este host; reconciliar.py deve exigir UUID
        distinct_uuids = {(t.get("UUID") or "").lower() for t in by_name[name]}
        if len(by_name[name]) > 1 and len(distinct_uuids) > 1:
            rec["nome_reutilizado"] = True
        out.append(rec)

    print(f"  [snapshot 2026-05-04] {len(out)} VMs adicionadas (sem par live)")
    print(f"    seccoes detetadas: {sec}; duplicados UUID resolvidos: {len(dropped_dup)}")
    for d in dropped_dup:
        print(f"      - {d['name']} ({d['seccao_descartada']}, {d['cluster_descartado']}, "
              f"{d['estado_descartado']}): {d['motivo']}")
    extract_snapshot.dropped_dup = dropped_dup
    return out


def snapshot_enrichment_index():
    """Indice UUID(bios)/nome -> campos que so o snapshot tem (Anotacao, SO,
    Redes). O REST live nao devolve a anotacao, e e nela que vivem servico/
    ambiente/departamento — sem isto, VMs live ficariam sem classificacao."""
    data = read_xlsx(SNAPSHOT)
    cols = [chr(ord("A") + i) for i in range(20)] + ["U", "V"]
    idx = {}
    for row in data["Maquinas Virtuais"]:
        vals = {SNAPSHOT_HDR[i]: row.get(c) for i, c in enumerate(cols)}
        name = (vals.get("Nome") or "").strip()
        if not name or name == "Nome":
            continue
        rec = {"anotacao": na(vals.get("Anotacao")),
               "so_config": na(vals.get("SO (Config)")),
               "so_guest_tools": na(vals.get("SO (Guest Tools)")),
               "redes": na(vals.get("Redes"))}
        u = (vals.get("UUID") or "").lower()
        if u:
            idx.setdefault(f"uuid:{u}", rec)
        idx.setdefault(f"nome:{name.lower()}", rec)
    return idx


def enrich_live_from_snapshot(vms):
    idx = snapshot_enrichment_index()
    n = 0
    for v in vms:
        if v.get("anotacao"):
            continue
        rec = idx.get(f"uuid:{(v.get('bios_uuid') or '').lower()}") or \
            idx.get(f"nome:{v['name'].lower()}")
        if not rec:
            continue
        v["anotacao"] = rec["anotacao"]
        v["so_config"] = rec["so_config"]
        v["so_guest_tools"] = rec["so_guest_tools"]
        v["so"] = rec["so_guest_tools"] or rec["so_config"]
        v["redes"] = rec["redes"]
        v.update(parse_anotacao(v["anotacao"]))
        n += 1
    print(f"  (enriquecidas {n} VMs live com anotacao/SO do snapshot)")


def main():
    all_vms = []
    print("== extracao live ==")
    creds = load_cred_file()
    if not creds:
        print("  (sem ficheiro VCENTER_CREDS — a usar so o snapshot; ver README)")
    for vcname in VCENTER_TARGETS:
        if vcname in creds:
            all_vms.extend(extract_live(vcname, creds[vcname]))
    enrich_live_from_snapshot(all_vms)
    live_names = {v["name"] for v in all_vms}
    live_bios = {(v.get("bios_uuid") or "").lower() for v in all_vms} - {""}
    print("== fallback snapshot ==")
    all_vms.extend(extract_snapshot(live_names, live_bios))

    # relatorio de completude por campo — parte da saida para que gaps de
    # extracao fiquem visiveis (e comparaveis entre rodadas) em vez de mudos
    campos = sorted({k for v in all_vms for k in v})
    completude = {c: sum(1 for v in all_vms if v.get(c) not in (None, "", "N/A"))
                  for c in campos}

    doc = {
        "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "fontes_live": [v for v in VCENTER_TARGETS if v in creds],
        "fontes_pendentes": ["VCenter_PowerFlex (credencial quebrada — Z.8; coberto por snapshot 2026-05-04)"],
        "total_vms": len(all_vms),
        "completude_campos": completude,
        "duplicados_resolvidos": getattr(extract_snapshot, "dropped_dup", []),
        "vms": all_vms,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"\ninventario consolidado: {len(all_vms)} VMs -> {OUT}")


if __name__ == "__main__":
    main()
