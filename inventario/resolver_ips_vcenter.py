"""Para os hosts sem IPv4 utilizavel (IPv6 link-local ou DNS que nao
resolve), consulta o vCenter live TODAS as NICs da VM (nao so o IP
principal) via REST guest/networking/interfaces. Fonte fiavel — evita
inventar IP (licao VS8000223). So leitura. Saida: ips-vcenter.json
"""
import json, os, re, ssl, sys, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_inventario import load_cred_file, vc_login, vc_get

HERE = os.path.dirname(os.path.abspath(__file__))
SSL_CTX = ssl._create_unverified_context()


def main():
    os.environ.setdefault("VCENTER_CREDS", "")  # usa fallback legado se preciso
    creds = load_cred_file()
    cred = creds.get("VCenter_PRD")
    if not cred:
        raise SystemExit("sem credencial PRD")
    base = cred["url"].replace("/sdk", "").rstrip("/")
    sid = vc_login(base, cred["user"], cred["pwd"])

    # indice nome->vm_id do PRD live
    inv = json.load(open(os.path.join(HERE, "inventario-consolidado.json"), encoding="utf-8"))
    live = {v["name"]: v for v in inv["vms"] if v.get("fonte", "").startswith("live")}

    d = json.load(open(os.path.join(HERE, "levantamento-templates-agentes.json"), encoding="utf-8"))
    alvos = []
    for h in d["hosts"]:
        ep = h.get("interface_endereco") or ""
        if (":" in ep) or ep.endswith(".bpc.intranet") or not ep:
            alvos.append(h)

    # obter vm_id: a partir do nome tecnico embutido no visible name
    def find_vm(host):
        m = re.search(r"- (?:VM|Compute|Mgmt|Infra|Network|Web) - ([\w.-]+)", host["host"])
        base_name = m.group(1) if m else None
        for nm, v in live.items():
            if base_name and (nm == base_name or nm.startswith(base_name)):
                return v
        return None

    out = []
    for h in alvos:
        v = find_vm(h)
        if not v or not v.get("vm_id"):
            out.append({"host": h["host"], "resultado": "nao esta no PRD live (provavel PowerFlex)"})
            continue
        try:
            nics = vc_get(base, sid, f"/rest/vcenter/vm/{v['vm_id']}/guest/networking/interfaces")
        except Exception as e:
            out.append({"host": h["host"], "resultado": f"erro guest tools: {type(e).__name__}"})
            continue
        ipv4 = []
        for n in nics:
            for ipinfo in (n.get("ip", {}) or {}).get("ip_addresses", []):
                ip = ipinfo.get("ip_address", "")
                if ip and ":" not in ip and not ip.startswith(("169.254.", "127.")):
                    ipv4.append(ip)
        out.append({"host": h["host"], "vm": v["name"], "ipv4_encontrados": ipv4,
                    "resultado": "ok" if ipv4 else "sem IPv4 (tools nao reportam)"})

    json.dump(out, open(os.path.join(HERE, "ips-vcenter.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    for o in out:
        print(f"  {o['host'][:50]:50} {o.get('ipv4_encontrados', o['resultado'])}")
    n_ok = sum(1 for o in out if o.get("ipv4_encontrados"))
    print(f"\n{n_ok}/{len(out)} com IPv4 recuperado -> ips-vcenter.json")


if __name__ == "__main__":
    main()
