"""Renderiza plano-correcao.json em plano-correcao.md (revisao humana)."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "plano-correcao.json"), encoding="utf-8"))
L = []
add = L.append

add(f"# Plano de correção host-a-host — {P['gerado_em']}")
add("")
add("**Nada foi aplicado.** Cada item tem evidência e risco; marcar a checkbox = aprovado para aplicar.")
add("Fontes: vCenter PRD live 2026-07-17, snapshot Excel 2026-05-04, Zabbix Infra (608 hosts).")
add("")
tot = P["totais_por_seccao"]
add("| Secção | Itens |")
add("|---|---|")
for k, v in tot.items():
    add(f"| {k} | {v} |")
add("")

add("## 0. NÃO MEXER — revoga propostas anteriores")
add("")
for x in P["0_nao_mexer"]:
    add(f"- ⛔ `{x['zabbix_host']}` (hostid {x['hostid']}): **{x['acao']}**")
    add(f"  - Evidência: {x['evidencia']}")
    add(f"  - {x['nota']}")
add("")

add("## 1. IPs de interface divergentes")
add("")
add("| ✓ | Host | hostid | IP no Zabbix | IP proposto | Fonte | Confiança |")
add("|---|---|---|---|---|---|---|")
for x in P["1_ip_interface"]:
    add(f"| [ ] | {x['zabbix_host']} | {x['hostid']} | {', '.join(x['ip_atual_zabbix']) if isinstance(x['ip_atual_zabbix'], list) else x['ip_atual_zabbix']} "
        f"| **{x['ip_proposto']}** | {x['fonte_ip']} | {x['confianca']} |")
add("")
add("Risco comum: agente Zabbix pode só responder no IP antigo — validar ping/agente no IP novo antes de aplicar.")
add("")

add("## 2. Backfill da macro {$VMWARE.VM.UUID} (33 hosts sem macro)")
add("")
add("| ✓ | Host | hostid | VM | UUID proposto | Tipo | Confiança |")
add("|---|---|---|---|---|---|---|")
for x in P["2_uuid_macro"]:
    add(f"| [ ] | {x['zabbix_host'][:45]} | {x['hostid']} | {x['vm'][:30]} | `{x['uuid_proposto'][:18]}…` | {x['tipo_uuid']} | {x['confianca'][:40]} |")
add("")

add("## 3. Hosts do grupo 03 sem VM em nenhuma fonte (investigar → desativar; NUNCA apagar)")
add("")
add("| ✓ | Host | hostid | IPs | Status |")
add("|---|---|---|---|---|")
for x in P["3_hosts_sem_vm"]:
    add(f"| [ ] | {x['zabbix_host'][:60]} | {x['hostid']} | {', '.join(x['ips'])} | {x['status_atual']} |")
add("")
add(f"Evidência comum: {P['3_hosts_sem_vm'][0]['evidencia']}. Risco: {P['3_hosts_sem_vm'][0]['risco']}")
add("")

add("## 4. Onboarding — VMs sem cobertura Zabbix (confirmado por 2 fontes)")
add("")
add("| ✓ | VM | Cluster | Estado | IP | Serviço (anotação) | Pendência |")
add("|---|---|---|---|---|---|---|")
for x in P["4_onboarding"]:
    add(f"| [ ] | {x['vm'][:36]} | {x['cluster']} | {x['power_state']} | {x.get('ip') or '—'} "
        f"| {(x.get('servico') or '—')[:28]} | {x.get('pendencia', '—')[:44]} |")
add("")
add("Ação: criar host com grupos 03 + domínio funcional, templates `VMware Guest` + `BPC Ping`, macro UUID. VMs desligadas: decidir caso a caso.")
add("")

add("## 5. Templates de SO errados")
add("")
add("| ✓ | Host | hostid | SO no vCenter | Ação |")
add("|---|---|---|---|---|")
for x in P["5_templates_so"]:
    so = x["so_vcenter"].get("so") if isinstance(x["so_vcenter"], dict) else x["so_vcenter"]
    add(f"| [ ] | {x['zabbix_host'][:45]} | {x['hostid']} | {so} | {x['acao_proposta']} |")
add("")
add("Risco: histórico do template errado fica órfão; validar que o agente responde após a troca.")
add("")

add("## 6. Tags em CONFLITO (decisão humana: Excel vs curadoria Zabbix)")
add("")
add("| Vence | Host | Tag | Valor Excel/vCenter | Valor Zabbix | Nota |")
add("|---|---|---|---|---|---|")
for x in P["6_tags_conflito"]:
    add(f"| Excel [ ] / Zbx [ ] | {x['zabbix_host'][:40]} | {x['tag']} | {str(x['valor_excel'])[:30]} "
        f"| {str(x['valor_zabbix'])[:30]} | {(x.get('nota') or '')[:40]} |")
add("")

add("## 7. Tags AUSENTES (aplicar valor do inventário — baixo risco)")
add("")
add("| ✓ | Host | Tag | Valor proposto |")
add("|---|---|---|---|")
for x in P["7_tags_ausentes"]:
    add(f"| [ ] | {x['zabbix_host'][:45]} | {x['tag']} | {str(x['valor_proposto'])[:40]} |")
add("")

add("## 8. Reintegrar no domínio 03 (aditivo — não remove grupos atuais)")
add("")
add("| ✓ | Host | hostid | Grupos atuais |")
add("|---|---|---|---|")
for x in P["8_grupos_reintegrar_03"]:
    add(f"| [ ] | {x['zabbix_host'][:45]} | {x['hostid']} | {', '.join(g for g in x['grupos_atuais'])[:60]} |")
add("")

add("## 9. Grupos de serviço (criar onde novo + adicionar membros; aditivo)")
add("")
for x in P["9_grupos_servico"]:
    marca = "**NOVO** " if x["novo"] else ""
    add(f"- [ ] {marca}`{x['grupo']}` — {x['n_hosts']} hosts")
    nomes = ", ".join(h["vm"] for h in x["hosts"][:12])
    extra = f" … +{x['n_hosts']-12}" if x["n_hosts"] > 12 else ""
    add(f"  - {nomes}{extra}")
add("")

add("## 10. Decisões de política (aplicam-se em lote depois de decididas)")
add("")
for x in P["10_politicas"]:
    add(f"- **{x['tema']}** — {x['achado']}")
    for o in x["opcoes"]:
        add(f"  - [ ] {o}")
add("")

out = os.path.join(HERE, "plano-correcao.md")
open(out, "w", encoding="utf-8").write("\n".join(L))
print(f"{len(L)} linhas -> {out}")
