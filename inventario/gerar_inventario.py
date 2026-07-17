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
    if not path or not os.path.exists(path):
        return {}
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception as e:
        print(f"  (ficheiro de credenciais ilegivel: {type(e).__name__})")
        return {}


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


def extract_snapshot(live_names):
    """Linhas do snapshot 2026-05-04 cujo nome nao apareceu em nenhuma fonte live."""
    data = read_xlsx(SNAPSHOT)
    rows = sheet_as_dicts(data["Maquinas Virtuais"], header_idx=2)
    out = []
    for r in rows:
        name = (r.get("Nome") or "").strip()
        if not name or name == "Nome" or name in live_names:
            continue
        out.append({
            "vcenter": "snapshot(desconhecido/PowerFlex)",
            "fonte": "snapshot-2026-05-04",
            "vm_id": None,
            "name": name,
            "power_state": {"Ligada": "POWERED_ON", "Desligada": "POWERED_OFF"}.get(r.get("Estado"), r.get("Estado")),
            "cpu": r.get("vCPUs"),
            "ram_mib": None,
            "ram_gb": r.get("RAM (GB)"),
            "esxi_host": r.get("Host ESXi"),
            "cluster": r.get("Cluster"),
            "instance_uuid": (r.get("UUID") or "").lower() or None,
            "bios_uuid": None,
            "guest_hostname": r.get("Hostname (Guest)"),
            "guest_ip": None if r.get("IP Principal") in ("N/A", None) else r.get("IP Principal"),
            "anotacao": r.get("Anotacao"),
            "so": r.get("SO (Guest Tools)") or r.get("SO (Config)"),
            "redes": r.get("Redes"),
        })
    print(f"  [snapshot 2026-05-04] {len(out)} VMs adicionadas (sem par live)")
    return out


def main():
    all_vms = []
    print("== extracao live ==")
    creds = load_cred_file()
    if not creds:
        print("  (sem ficheiro VCENTER_CREDS — a usar so o snapshot; ver README)")
    for vcname in VCENTER_TARGETS:
        if vcname in creds:
            all_vms.extend(extract_live(vcname, creds[vcname]))
    live_names = {v["name"] for v in all_vms}
    print("== fallback snapshot ==")
    all_vms.extend(extract_snapshot(live_names))

    doc = {
        "gerado_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "fontes_live": [v for v in VCENTER_TARGETS if v in creds],
        "fontes_pendentes": ["VCenter_PowerFlex (credencial quebrada — Z.8; coberto por snapshot 2026-05-04)"],
        "total_vms": len(all_vms),
        "vms": all_vms,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"\ninventario consolidado: {len(all_vms)} VMs -> {OUT}")


if __name__ == "__main__":
    main()
