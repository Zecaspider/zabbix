"""3.2 — caracteriza o ACESSO aos 94 hosts cat B (ping OK, porta Zabbix
10050 fechada) para orientar a campanha de instalacao do agente. So SCAN DE
PORTAS (TCP connect, sem autenticacao): 22/SSH, 5985/WinRM, 3389/RDP,
10050/agent(re-teste). Diz onde da para instalar por SSH (Linux) ou
WinRM/RDP (Windows) sem tocar em credenciais.

NAO faz autenticacao em massa de proposito: falhas repetidas com a conta de
servico AD (bpcnet\\s_wsus) accionariam o lockout de dominio e causariam
negacao de servico — isso e trabalho para a equipa dona, host a host, ou
uma amostra minima manual. Este script so mede portas.

Saida: acesso-vms.json
"""
import json, os, socket
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "levantamento-templates-agentes.json"), encoding="utf-8"))

catB = [h for h in d["hosts"] if h.get("ping") and h.get("tcp10050") is False]

PORTAS = {22: "SSH", 5985: "WinRM-http", 5986: "WinRM-https", 3389: "RDP", 10050: "Zabbix"}


def porta_aberta(ip, p):
    try:
        with socket.create_connection((ip, p), timeout=1.5):
            return True
    except Exception:
        return False


res = []
for h in catB:
    ip = h.get("interface_endereco")
    if not ip or ":" in ip:
        continue
    abertas = [name for p, name in PORTAS.items() if porta_aberta(ip, p)]
    res.append({"host": h["host"], "so": h["so"], "ip": ip, "portas_abertas": abertas})

# sumario: por SO, que via de instalacao esta disponivel
via = defaultdict(Counter)
for r in res:
    so = r["so"] or "?"
    if r["so"] == "Linux":
        via[so]["SSH-disponivel" if "SSH" in r["portas_abertas"] else "SSH-fechado"] += 1
    elif r["so"] == "Windows":
        v = "WinRM" if any("WinRM" in x for x in r["portas_abertas"]) else \
            "RDP-so" if "RDP" in r["portas_abertas"] else "nenhuma-via-remota"
        via[so][v] += 1

out = {"total_catB_com_ipv4": len(res),
       "vias_instalacao_por_so": {k: dict(v) for k, v in via.items()},
       "hosts": res}
json.dump(out, open(os.path.join(HERE, "acesso-vms.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in out.items() if k != "hosts"}, ensure_ascii=False, indent=1))
print("\nAmostra (10):")
for r in res[:10]:
    print(f"  {r['host'][:50]:50} {r['so']!s:8} {r['ip']:16} {r['portas_abertas']}")
print(f"\n-> acesso-vms.json ({len(res)} hosts)")
