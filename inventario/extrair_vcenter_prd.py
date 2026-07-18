"""Extract LIVE (so leitura) do vCenter PRD (10.10.101.9) para a comparacao
de 3 vias (live x Excel x Zabbix).

Credenciais: lidas EM RUNTIME do script legado
scripts-a-analisar/de-scripts-import/20-cred-tester.py (onde ja existem em
texto plano — pendencia de seguranca registada; nao criamos nova copia em
disco nem imprimimos valores).

Saida: fontes/vcenter-prd-live-<data>.json (sem credenciais).
"""
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gerar_inventario import vc_login, vc_get, extract_live

LEGACY = r"C:\Repositorios\zabbix\scripts-a-analisar\de-scripts-import\20-cred-tester.py"
HERE = os.path.dirname(os.path.abspath(__file__))


def load_prd_cred():
    txt = open(LEGACY, encoding="utf-8").read()
    m = re.search(
        r'"ip":\s*"10\.10\.101\.9",\s*"rest_url":\s*"(?P<url>[^"]+)",\s*'
        r'"username":\s*"(?P<user>[^"]+)",\s*"password":\s*"(?P<pwd>[^"]+)"', txt)
    if not m:
        raise SystemExit("credenciais do vCenter PRD nao encontradas no script legado")
    return {"url": m.group("url"), "user": m.group("user"), "pwd": m.group("pwd")}


def main():
    cred = load_prd_cred()
    vms = extract_live("VCenter_PRD_live", cred)
    if not vms:
        raise SystemExit("extracao live devolveu 0 VMs (login falhou?)")
    stamp = datetime.datetime.now().strftime("%Y%m%d")
    out = os.path.join(HERE, "fontes", f"vcenter-prd-live-{stamp}.json")
    doc = {
        "extraido_em": datetime.datetime.now().isoformat(timespec="seconds"),
        "vcenter": "VCenter_PRD (10.10.101.9)",
        "total_vms": len(vms),
        "vms": vms,
    }
    json.dump(doc, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    clusters = {}
    for v in vms:
        clusters[v.get("cluster")] = clusters.get(v.get("cluster"), 0) + 1
    print(f"{len(vms)} VMs -> {out}")
    print("clusters:", clusters)


if __name__ == "__main__":
    main()
