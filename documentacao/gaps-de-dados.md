# Gaps de Dados — Relatório de Inconsistências

> **Propósito:** Catalogar limitações de dados conhecidas que afectam a fidelidade
> dos dashboards. Este documento deve ser revisto e resolvido antes de os dashboards
> serem promovidos a produção NOC.

---

## G.1 — VMs reportadas como "desligadas" por falha de credenciais (Z.8)

**Impacto:** 270 de 451 VMs do grupo 609 aparecem como `desligadas` no dashboard N2.

**Causa:** O Zabbix não consegue autenticar no **vCenter02** (`10.10.232.84`) —
a conta `agonzaga@vsphere.local` tem credenciais erradas ou expiradas. Sem acesso
ao vCenter, o poller VMware não recolhe o `vmware.vm.powerstate` dessas VMs,
deixando o item com `lastclock=0` e `state=not_supported`.

**Efeito nos dashboards:**
- N2 Infraestrutura VMware → card "vCenter PowerFlex": mostra `0 ligadas · 270 desligadas`
- N2 Servidores Virtuais → tabela: 270 VMs com estado `desligada` e campos `—`
- As VMs **podem estar de facto ligadas** — o dashboard não sabe, não tem dados

**Fix pendente:** Credenciais correctas para vCenter02 → actualizar `{$VMWARE.PASSWORD}`
nos 17 hosts do grupo 608 (hostids: 11900, 14170–14172, 14205, 14246–14248,
14267–14269, 14284–14289) via `usermacro.update` batch.

**Workaround activo:** Dashboards desenvolvidos com dados das 181 VMs do vCenter PRD.
Contagens reais dependem de Z.8 resolvido.

---

## G.2 — VMs sem agente Zabbix configurado

**Impacto:** Desconhecido (inventário não feito). Estimativa: significativo.

**Causa:** Nem todas as VMs têm o Zabbix Agent instalado e configurado. Para essas VMs:
- O Zabbix sabe que existem (via VMware API) e pode saber o powerstate
- Mas **não tem métricas internas**: CPU real (do SO), memória usada pelo SO,
  serviços, logs, processos

**Efeito nos dashboards:**
- VMs aparecem na tabela mas com `—` em colunas de métricas do agente
- A coluna `(sem dados)` na tabela N2 SV indica ausência de agente ou dados stale
- Uma VM pode aparecer "ligada" pelo VMware mas com métricas de agente em branco —
  não significa que o serviço de negócio está saudável

**Recomendação:** Inventariar VMs sem agente e priorizar instalação nas VMs de produção
críticas. Considerar tag Zabbix `agente=ausente` para filtrar nos dashboards.

---

## G.3 — Dados VMware stale por intervalo longo do poller

**Impacto:** Cards vCenter no N2 mostram "dados desactualizados" mesmo com o vCenter acessível.

**Causa:** O poller VMware do Zabbix tem intervalos mais longos que ICMP/SNMP (tipicamente
5–15 min). Se o dashboard for consultado entre ciclos de polling, os itens podem ter
`lastclock` com mais de 1h → threshold de stale ultrapassado → badge de aviso.

**Efeito nos dashboards:**
- Badge `⚠ dados desactualizados` aparece mesmo quando o vCenter está operacional
- Indicador de estado `?` (cinzento) em vez de `OK/WARN/CRIT`

**Recomendação:** Ajustar `staleThreshold` no CFG de cada painel para acomodar o
intervalo real do poller VMware (verificar no Zabbix o `update interval` dos items
`vmware.status` e `vmware.fullname`). Alternativa: reduzir o intervalo do poller.

---

## G.4 — Ausência de join VM → Cluster para vCenters sem LLD primário

**Impacto:** Coluna "VMs" nos clusters do N2 mostra `—` para todos os clusters
excepto os do vCenter PRD.

**Causa:** O join VM→Cluster requer que o LLD do vCenter tenha gerado items
`vmware.vm.powerstate[url,uuid]` no host do vCenter (fonte primária). Para vCenters
com Z.8 (PowerFlex) ou sem LLD completo (DR, Backup), a fonte primária não existe
e o fallback (grupo 609) não tem informação de cluster por VM.

**Efeito nos dashboards:**
- Clusters do PowerFlex, DR e Backup mostram `0 VMs` ou `—`
- Dados reais de distribuição de VMs por cluster não disponíveis

**Fix:** Resolver Z.8 (G.1) desbloqueará automaticamente o join para o PowerFlex.
Para DR/Backup, verificar se o LLD VMware está configurado no host do vCenter.

---

## G.5 — VMs de produção sem tag `ambiente=Producao` correcta (Z.11)

**Impacto:** 13 hosts com tag `ambiente=producao` (minúscula) em vez de `Producao`.

**Causa:** Inconsistência de capitalização nas tags do Zabbix. Filtros que usam
`ambiente=Producao` (capital P) excluem estes 13 hosts.

**Efeito nos dashboards:** Estes hosts podem não aparecer em filtros de produção
(dashboards futuros que filtrem por tag `ambiente`).

**Fix:** Corrigir a tag nos 13 hosts via `host.update` batch no Zabbix.

---

## Sumário de prioridade

| Gap | Severidade | Bloqueante para NOC | Responsável |
|-----|-----------|--------------------|-|
| G.1 — Credenciais vC02 | 🔴 Alta | Sim — 60% das VMs invisíveis | Infra/VMware |
| G.2 — VMs sem agente | 🟡 Média | Parcial — métricas internas em branco | Infra |
| G.3 — Dados stale VMware | 🟡 Média | Não — cosmético | Zabbix admin |
| G.4 — Join VM→Cluster | 🟢 Baixa | Não — desbloqueado por G.1 | Dependente G.1 |
| G.5 — Tags incorrectas | 🟢 Baixa | Não | Zabbix admin |

---

*Documento criado em 2026-06-17. Rever após resolução de cada gap.*
