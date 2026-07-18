"""Validacao de rede (so leitura) para o levantamento de templates/agentes:
ping + TCP 10050 (agente Zabbix) a cada host de producao com gap, para
separar "sem template" (acao simples) de "agente parado/rede inacessivel"
(investigacao operacional, nao resolve com host.update).
"""
import json
import os
import socket
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(HERE, "levantamento-templates-agentes.json"), encoding="utf-8"))


def ping(ip):
    try:
        r = subprocess.run(["ping", "-n", "1", "-w", "800", ip],
                           capture_output=True, text=True, timeout=5)
        return "TTL=" in r.stdout
    except Exception:
        return False


def tcp10050(ip):
    try:
        with socket.create_connection((ip, 10050), timeout=2):
            return True
    except Exception:
        return False


alvo = [h for h in d["hosts"] if h["gaps"]]
for h in alvo:
    ip = h["interface_endereco"]
    if ip and ":" not in ip:
        h["ping"] = ping(ip)
        h["tcp10050"] = tcp10050(ip)
    else:
        h["ping"] = h["tcp10050"] = None

json.dump(d, open(os.path.join(HERE, "levantamento-templates-agentes.json"), "w",
                  encoding="utf-8"), ensure_ascii=False, indent=1)

from collections import Counter
c = Counter((h["ping"], h["tcp10050"]) for h in alvo)
print(f"{len(alvo)} hosts com gap validados. (ping, tcp10050) -> contagem:")
for k, v in c.most_common():
    print(f"  {k}: {v}")
