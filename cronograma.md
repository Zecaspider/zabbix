# Cronograma de Actividades — BPC-Observe

> **Painel de controlo vivo.** Única fonte de verdade do progresso. Actualizar
> a cada ponto concluído (marca o estado + data + nota). O
> `documentacao/engenharia-do-sistema.md` define *como* se faz; este define
> *onde estamos*.
>
> Legenda: ☐ pendente · ◐ em curso · ☑ concluído · ⏸ bloqueado · ✖ descartado
> Cada ponto só passa a ☑ quando cumpre o DoD (engenharia §10.1).

Última actualização: 2026-06-29 (§9.9 Auditoria de qualidade inventário/tags 221 hosts g24: 193 OK, 24 divergências corrigidas via API — GPS RTMENONG00 223km errado corrigido, 6 hosts Icolo e Bengo re-classificados de "Luanda", 2 hosts Moxico Leste actualizados, 4 hosts tags ausentes populados. Todos os campos ficha N4 validados. ANTES: Gap A GPS 172→218 geomap)

---

## Fase 0 · Fundação

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 0.1 | Decisões de arquitectura travadas | ☑ | 2026-06-16 | camadas A–E + 4 forks |
| 0.2 | Blueprint + mapa host groups escritos | ☑ | 2026-06-16 | em `documentacao/` |
| 0.3 | Limpeza Grafana (arquivo + pasta limpa) | ☑ | 2026-06-16 | pasta `efpbu5tvrhce8a` |
| 0.4 | Estrutura de directórios local limpa | ☑ | 2026-06-16 | `<dominio>/n2|n3`, commit `af33bed` |
| 0.5 | Documento de engenharia + contratos | ☑ | 2026-06-16 | §5.1/5.2/6/7/10 |
| 0.6 | Inventário host groups Infra (API) | ☑ | 2026-06-16 | 74 grupos |
| 0.7 | Inventário host groups Network (API) | ☑ | 2026-06-16 | grupos 24-35 |
| 0.8 | UID datasources Grafana confirmados | ☑ | 2026-06-16 | infra `3_KgG43nz`, network `ffo8sp8zllog0e` |
| 0.9 | **Auditar `l2-header-global.js` vs contrato §5.1** | ☑ | 2026-06-16 | expõe `BPC`/`waitForBPC`/`BPC.utils`; faltam `BPC.THEME`, `BPC_SHARED`, `BPC_CHARTS`, `BPC.state` → corrigir no 0.10/0.11 |
| 0.10 | **Implementar `utils.js` canónico** | ☑ | 2026-06-16 | `_comum/utils.js` v9; +`BPC.THEME`/`BPC_SHARED`/`BPC_CHARTS` (BLOCO 5); `node --check` OK |
| 0.11 | `BPC.state` (modelo de estado §6.1) no utils | ☑ | 2026-06-16 | `metric/worst/host/color` no BLOCO 5; cores §6 reconciliadas |
| 0.12 | Validar `utils.js` num dashboard de teste | ☑ | 2026-06-16 | header renderiza, consola limpa; tipo `marcusolsson-dynamictext-panel` confirmado |

## Fase 1 · Infraestrutura VMware (grupos 608+603, Infra)

> **Reestruturação 2026-06-17:** o antigo domínio "Servidores Físicos" foi elevado e
> renomeado para "Infraestrutura VMware". O conteúdo N2 ESXi passa a N3-ESXi;
> cria-se um novo N2 com visão de vCenters + clusters + ESXi.
> Directório: `infraestrutura-vmware/` (era `servidores-fisicos/`).

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 1.1 | Sondar items do grupo 603/608 (CPU/RAM/disco/rede/HW) | ☑ | 2026-06-16 | 27 hosts em 603: 20 ESXi (`vmware.hv.*`) + 4 físicos ICMP-only + 2 Cisco UCS + 1 Dell sem items. Items fixados em mapa-host-groups.md §Sondagem 1.1. |
| 1.2 | Ratificar thresholds no catálogo §6.2 | ☑ | 2026-06-16 | ESXi: CPU warn/crit via `vmware.hv.status`. Sem agente OS nos físicos → triggers são a fonte de estado. |
| 1.3 | N3-ESXi — `utils.js` | ☑ | 2026-06-16 | copiado de `_comum/utils.js` v9; nocLabel "SERVIDORES FÍSICOS (ESXi) - NÍVEL 2"; push OK (UID `8f6a94be`) — título a actualizar quando N2 VMware estiver pronto |
| 1.4 | N3-ESXi — KPI strip (BT) | ☑ | 2026-06-17 | `l2-kpi.js` v3.0 (id=100) |
| 1.5 | N3-ESXi — tabela de hosts (BT) | ☑ | 2026-06-17 | `l2-tabela.js` v3.0 (id=101); 11 colunas NOC@3m |
| 1.6 | N3-ESXi — top triggers | ☑ | 2026-06-17 | `l2-triggers.js` (id=102) |
| 1.7 | N3-ESXi — layout final + snapshot | ☑ | 2026-06-17 | gridPos: h=3/8/36/14; snapshot `dashboard-completo.json` |
| 1.8 | N3-ESXi-Detalhe — header do host (BT) | ☑ | 2026-06-17 | `l3-header.js` (id=101); UID `b55d5481` |
| 1.9 | N3-ESXi-Detalhe — séries CPU/RAM/rede (nativo) | ☑ | 2026-06-17 | 3 timeseries; `push_native.py` criado |
| 1.10 | N3-ESXi-Detalhe — tabela eventos | ☑ | 2026-06-17 | `l3-eventos.js` id=102 |
| 1.11 | N3-ESXi-Detalhe — layout final + snapshot | ☑ | 2026-06-17 | transparent + sem título; snapshot ok |
| 1.12 | **N2 VMware** — criar dashboard + utils | ☑ | 2026-06-17 | dashboard `a967e936` criado; utils.js id=100 pushed OK |
| 1.13 | **N2 VMware** — painel vCenter overview (BT) | ☑ | 2026-06-17 | `l2-vcenter.js` v3.0 pushed id=101; cards com cluster table, drill-down links, fix race condition utils (`_initPending`) |
| 1.14 | **N2 VMware** — tabela ESXi (BT) | ☑ | 2026-06-17 | `l2-tabela.js` pushed id=103; grupo 608 âncora |
| 1.15 | **N2 VMware** — top triggers + VMs desligadas + layout final | ☑ | 2026-06-17 | `l2-triggers.js` id=104, `l2-vms.js` id=102; layout transparent aplicado |
| 1.16 | **N3 vCenter** — criar dashboard + utils | ☑ | 2026-06-17 | dashboard `59e7e4b2` criado; utils.js id=100 + `l3-vcenter-detalhe.js` id=101 pushed; lê `?var-vcenter_hostid` do URL |
| 1.17 | **N3 vCenter** — 4 painéis separados (topo/esxi/triggers) + layout | ☑ | 2026-06-17 | split via VCD_CACHE; transparent+layout pushed; painel antigo removido |
| 1.18 | **N3 vCenter** — snapshot JSON final | ☑ | 2026-06-18 | transparent+título vazio; snapshot v12→v14 em `infraestrutura-vmware/n3/dashboard-completo.json` |
| 1.19 | **N3 vCenter** — dropdown selector de vCenter (var-vcenter_hostid) | ☑ | 2026-06-18 | variável grupo 664; `vcdt_resolveId` resolve nome→hostid; anchor targets referenciam `$vcenter_hostid` (v18) — testado e funcional |
| 1.20 | Revisão de conformidade — todos os dashboards vs contratos da documentação | ☑ | 2026-06-18 | node--check ✓, initWithRetry ✓, content=elementId ✓, transparent+title ✓, UIDs navegação ✓ |
| 1.21 | Navegação N2-VMware → N3-vCenter → Abrir vCenter testada | ☑ | 2026-06-18 | auditoria código: l2-vcenter→59e7e4b2 ✓, l3-vcenter-topo→a967e936 ✓, vcWebUrl+/ui/ ✓ |
| 1.22 | Navegação N3-ESXi ↔ N2-VMware testada | ☑ | 2026-06-18 | back link `← N2 · INFRAESTRUTURA VMware` adicionado ao utils.js N3-ESXi; nocLabel corrigido para NÍVEL 3 |
| 1.23 | Navegação N1→N2-VMware pendente até Fase 10 | ⏸ | | N1 criado por último |

> **Z.8 VMware (alargado):** dos 4 hosts do grupo 664, apenas `sv9000204 (Vcenter PRD)` tem
> todos os items VMware a recolher. `sv9000206 (PowerFlex)` — items `state=1` (unsupported,
> poller não consegue autenticar). `vCenter 02` — idem + sem ICMP. `vCenter Backup` — cluster
> status recolhe mas sem `vmware.fullname[` → não aparece nos cards N2. Causa provável em
> todos: `{$VMWARE.URL}` ausente ou errado ao nível do host (macro herdada de template
> incorrecto ou não definida). Audit e correcção → bloqueado em Z.8 (ver `z8-uuid-mismatch.md`).

## Fase 2 · Armazenamento (anchor 602 + tape 605, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 2.1 | Sondar items 602/605 | ☑ | 2026-06-17 | 10 hosts Storage + 1 Tape. Sem métricas capacidade/IOPS — só ICMP + `system.status` SNMP (IBM). SNMP e script Dell não recolhem (triggers activos). Registado em mapa-host-groups §Sondagem 2.1 |
| 2.2 | N2 (utils + KPI + tabela + triggers) | ☑ | 2026-06-17 | 4 painéis (utils/kpi/tabela/triggers); UID `993834a3`; transparent+layout aplicados. Card IBM SNMP mostra aviso Z.9 enquanto SNMP não recolhe — adapter pronto para activar automaticamente assim que Zabbix resolver |
| 2.3 | N3 (por array/tape) | ⏸ | | Bloqueado até Z.9 (SNMP IBM) e Z.10 (script Dell Unity) estarem resolvidos — sem dados reais no Zabbix, N3 seria só ping. Retomar após Fase 3+ |
| 2.4 | Navegação + teste + commit | ⏸ | | Depende de 2.3 |
| 2.5 | **N2 Datastores** — painel de saúde dos datastores SAN (grupos 603 ESXi) | ☐ | | Origem: volumes Dell EMC Unity (`DATA_UNT_400_8T-0..11`) exportados via FC SAN para cluster CS9000002. Items LLD `vmware.hv.datastore.size[url,uuid,pfree/total]` nos ESXi (grupo 603) — a colectar. Pode ser painel adicional no N2 Armazenamento (`993834a3`) ou dashboard separado em `armazenamento/n3/`. Não bloqueia Z.9/Z.10 — dados já disponíveis. Bloqueado por Z.8 nos ESXi PowerFlex (sv9000650-655 sem dados). |

## Fase 3 · Servidores Virtuais (anchor 609, Infra)

> N2 SV em construção activa. Arquitectura agente-first (VMware fallback).
> Filtro padrão: tag `ambiente` = "Produção" | "producao".

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 3.1 | N2 — utils + KPI strip + tabela (agente-first) + triggers | ☑ | 2026-06-17 | Dashboard `0758c24e`; 4 painéis pushed (id=100-103) |
| 3.2 | N2 — corrigir CPU VMware (MHz→%) e RAM (keys/unidades) | ☑ | 2026-06-17 | `l2-tabela.js` v3.1: CPU→`usage.perf`; RAM→`vm.memory.size[used]` (não [available]); disco; sort por coluna; dropdown ambiente; "ver detalhes" |
| 3.3 | N2 — layout final + snapshot | ☑ | 2026-06-17 | gridPos h=3/10/36/12; transparent; `dashboard-completo.json` guardado |
| 3.4 | N3 — conformar rascunho (l3-*.js em `n3/`) | ☑ | 2026-06-18 | Dashboard `0ae673a3` (versão A BT). Painéis: header (100), KPI strip v18.1 (101), triggers (107), serviços (106), CPU detalhe (102), RAM detalhe (103), Rede (105), Disco I/O (104), Ficha (108). KPI: 6 cards — Saúde/CPU/RAM/Rede/Disco/Alertas; CPU Ready; trigger.get. Snapshot v14. |
| 3.4.1 | N3 — re-aplicar layout definitivo versão A (ordem triggers→KPI + alturas) | ☑ | 2026-06-18 | fix_versao_a_layout.py; ORDER=[100,107,101,106,102,103,105,104,108]; push v14 OK; manifest.json IDs corrigidos; dashboard-completo.json guardado |
| 3.5 | ~~N3 — painel Datastores~~ → **movido para 2.5** | ✖ | 2026-06-18 | Datastores são volumes SAN (Dell Unity) apresentados aos ESXi via FC — pertencem ao domínio Armazenamento, não às VMs. Items vivem nos hosts ESXi (grupo 603) como LLD `vmware.hv.datastore.size`. Adicionado como 2.5 na Fase 2. |
| 3.6 | Navegação N2-VMware ↔ N2-SV ↔ N3-VM testada | ☑ | 2026-06-18 | 5 fluxos corrigidos e auditados por código: `l2-tabela` UID→`0ae673a3`; correlacionador UID→`b55d5481`; `l3-vm-header` backNav 2 chips; `l2-vms` chip "Ver todas as VMs (N2) →" |

## Fase 4 · Rede (multi-grupo 26/27/28/29/35, **Network** `ffo8sp8zllog0e`)

> **Arquitectura aprovada 2026-06-18** (lente NOC + redes) em
> `documentacao/rede-arquitectura.md`. Modelo de 4 níveis: N2 (wallboard, 3 cards
> de segmento) → N3 ×3 (DC / Edifícios / WAN) → N4 (ficha por device,
> parametrizado por variável Grafana hostname). Decisões: N4 como nível novo ·
> WAN via interfaces do grupo 27 · N3 WAN separado · N4 usa hostname (não hostid)
> para compatibilidade com painéis nativos Time Series.

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 4.0 | Plano de arquitectura N2+N3+N4 | ☑ | 2026-06-18 | `documentacao/rede-arquitectura.md`; 3 decisões aprovadas |
| 4.1 | Links WAN (grupo 35 vazio) — RESOLVIDO + topologia auditada | ☑ | 2026-06-18 | Auditoria directa → `documentacao/rede-topologia.md` + `topologia-dc.svg`. WAN = links nas interfaces do g27. IP SLA = verdade de serviço |
| 4.2 | Fundação — consolidar `utils.js` rede | ☑ | 2026-06-18 | 4 cópias (n3-wan, n3-wan-carriers, n4-wan-router, n4-dc-switch) com nocLabel próprio. Pushed e testado |
| 4.3 | N2 · Rede refactor — l2-kpi + l2-segmentos + l2-triggers | ☑ | 2026-06-19 | Título corrigido "N2 · Rede" (era "N2 · Segmentos") · drills N4 por grupo (g26→DC Switch / g27→WAN Router) em l2-triggers · dead code "N3 em construção" removido de l2-segmentos · layout compactado (buraco 18 linhas eliminado) |
| 4.4 | N3 DC Core — fabric + table + WAN links | ☑ | 2026-06-19 | UID `a75e2ba6` · 4 painéis · l3-dc-table re-pushed com drills N4 (estavam ausentes do Grafana) · layout compactado (buraco 8 linhas utils↔fabric) · snapshot gravado |
| 4.5 | N3 Edifícios | ◐ | 2026-06-19 | UID `471f2208` · conformado: CPU threshold corrigido (60/85), manifest id corrigido · drill N4 **adiado** (N4 Edifícios não existe ainda) · snapshot gravado |
| 4.6 | N3 WAN — negócio + cards + triggers + carriers | ☑ | 2026-06-19 | UID `1702465e` (n3-wan) reestruturado: duplicados eliminados (5 painéis→7 canonical), n4DashUid preenchido em l3-wan-triggers, layout novo · UID `31bace26` (n3-wan-carriers) h=48→28 · snapshots gravados |
| 4.7a | N4 WAN Router — ficha técnica por router | ☑ | 2026-06-19 | UID `8ddc4833` · back-link "← N3 WAN" pushed (estava ausente do Grafana) · snapshot gravado |
| 4.7b | N4 DC Switch — ficha técnica por switch | ☑ | 2026-06-19 | UID `7baea796` · back-link "← N3 DC Core" pushed (estava ausente do Grafana) · snapshot gravado |
| 4.8 | Navegação ponta-a-ponta + layout final + conformance test | ☑ | 2026-06-19 | Teste de conformidade executado em todos os 7 dashboards (`documentacao/teste-conformidade-fase4-rede.md`) · 23 defeitos identificados e aplicados (F-01→F-23, excepto F-11 adiado) · back-links N3→N2 e N4→N3 funcionais · drills N2→N3→N4 operacionais |
| 4.9 | Snapshots e registos finais | ☑ | 2026-06-19 | `dashboard-completo.json` gravado para os 7 dashboards (n2, n3-dc, n3-edificios, n3-wan, n3-wan-carriers, n4-wan-router, n4-dc-switch) |
| 4.10 | Drill N4 Edifícios (g28/g29) | ⏸ | | Bloqueado: N4 Edifícios não existe. Implementar quando o dashboard for criado. |

## Fase 5 · Segurança (anchor 656, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 5.1 | N2 + N3 (firewall/WAF/Darktrace) | ☐ | | |
| 5.2 | Navegação + teste + commit | ☐ | | |

## Fase 6 · Bases de Dados (anchor 355, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 6.1 | N2 + N3 (MSSQL/Oracle/DB2) | ☐ | | |
| 6.2 | Navegação + teste + commit | ☐ | | |

## Fase 7 · APIs & Serviços (anchor 663 + 345, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 7.1 | N2 + N3 (endpoints/sintéticos) | ☐ | | |
| 7.2 | Navegação + teste + commit | ☐ | | |

## Fase 8 · Serviços de Negócio — eBankit (anchor 391, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 8.1 | N2 + N3 (jornadas/transacções) | ☐ | | |
| 8.2 | Navegação + teste + commit | ☐ | | |

## Fase 9 · Agências (anchor 24 + 25, **Network**) — sub-domínio de Rede

> **Fluxo real (2026-06-27):** Agências é sub-domínio de Rede. Percurso
> `N1 → N2 Rede → N3 Agências (geomap) → N4 Agência (detalhe/diagnóstico) → N5 Interfaces`.
> Desenho e decisões em `documentacao/fluxo-agencias-n4-n5.md`.

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 9.0 | Bugs do fluxo (B-01/B-02 N2, B-03 N4, T-01 N1, T-03) | ☑ | 2026-06-27 | NET_THR + apiUrl Network (N2); âncora de rede no N4 (B-03); N1 liga ao N3 (T-01); drill por var-host (T-03). Detalhe em engenharia §12.0. Commits `3dcc616` |
| 9.1 | N3 Agências — geomap + tabela de alertas (nativo) | ☑ | 2026-06-27 | UID `n3-agencias`; geomap + tabela → drill N4 (dataLink) |
| 9.2 | **N4 Agência — reconstruído (triagem NOC)** | ☑ | 2026-06-27 | UID `n4-agencia-detalhe`. Dropdown por **nome** (MySQL); ESTADO (disponib+ficha nativa) · PORQUÊ (CPU/RAM/uptime/lat/loss) · LINKS WAN (estado colorido + histórico timeline) · PROBLEMAS (painel **nativo** Zabbix) · TENDÊNCIA · botão N5. Item filtrado por **nome**. Commits `9d98685`/`a833c5a`/`996d566` |
| 9.3 | **N5 Agência — Interfaces** (exclusivo, `n5-agencia-interfaces`) | ☑ | 2026-06-27 | Criado. Header + back-link N4; Estado&flaps (state-timeline todas as ifaces); Tráfego rx/tx; Erros in/out; Descartes in/out. Dropdowns Agência(nome) + Interface(All+filtro). Item por **nome**. Utilização % fora (speed=0 nos tunnels → T-08). Snapshot guardado. Validado RTUIGE00 |
| 9.4 | Refinamentos N5: ~~provider/tipo da interface (T-06)~~ · **T-08** utilização % | ◐ | 2026-06-28 | **T-06 ✅**: dropdown `iface` do N5 → MySQL, mostra `<token>(<provider>)` no `__text` e token limpo no `__value`; filtra `flags=4/status=0` (sem protótipo LLD); robusto no caso DOWN (lê config). Validado browser. **T-08 reclassificado** (era "Zabbix") → é **refinamento de dashboard**: as interfaces **físicas já têm `ifSpeed`** (ex. `Gi0/0/0.914` = 1 Gbps); só os túneis dão 0 (correcto, interface lógica). Acção: activar utilização % só quando `speed>0` (WAN físicas); túneis ficam em bps. T-07 movido para 9.7 |
| 9.5 | Navegação ponta-a-ponta N1→N5 + commit final | ☑ | 2026-06-27 | Fluxo N1→N2→N3→N4→N5 validado no browser; commits locais (repo sem remote → push git pendente) |
| 9.6 | **Correlação por provider (hub DMVPN) para causa de agências DOWN** (T-09) | ◐ | 2026-06-28 | **v1 implementado**: painel N4 `l4-provider-context.js` (id 211) — 7 operadoras com **Transporte** (sub-iface P2P `Po2.x`, veredicto) + **Pulso** (tráfego túnel `Tu10x`). Premissa corrigida (túnel DMVPN lógico é sinal fraco → usar transporte+pulso). Lê da config → popula com agência DOWN. Validado caso CUNHINGA (browser + data path). **Bug latente corrigido**: apiUrl do BPC.rpc no utils N4 ia ao Infra → Network. Falta v2 (destaque das operadoras da agência) e Z.15 (per-spoke NHRP). Detalhe em `fluxo-agencias-n4-n5.md` §9.6 |
| 9.8 | **Gap A — GPS em falta no geomap** | ☑ | 2026-06-29 | Auditoria 221 hosts g24 via API Zabbix: 49 sem `location_lat`/`location_lon`. Cruzamento com Excels BPC (Dados das Agências + Lista Geral + CSV). 46 populados (45 confirmados por província/município + RT_UBM30 Km30 Luanda/Viana). 3 IPs anónimos (`172.22.1.38`/`.203`/`.240`) excluídos: criados manualmente, DOWN há semanas, zero tags/inventory, ausentes dos Excels → aguardam identificação pela equipa de rede. Geomap: **172 → 218**. Artefactos: `BPC/audit_gps_g24.csv`, `BPC/hosts_sem_gps_preenchido.csv`. |
| 9.9 | **Auditoria de qualidade inventário/tags — 221 hosts g24** | ☑ | 2026-06-29 | Auditoria completa: GPS vs bounding-box provincial, tags (unidade_negocio/tipo_un/provincia) vs Excel, inventory site_state vs Excel. 193/221 sem divergências. 24 corrigidos: (1) **RTMENONG00 GPS** lat=-16.66 → -14.657 (erro de 223km, Menongue); (2) **6 hosts Icolo e Bengo** tag `provincia` "Luanda"→"Icolo e Bengo" + `site_state` (reorganização admin. 2011: Cabo Ledo, Muxima, Siac Zango, Zango, SIAC Cacuaco, Catete); (3) **2 hosts Moxico Leste** "Moxico"→"Moxico Leste" (Luau, Cazombo); (4) **4 hosts tags ausentes** unidade_negocio+tipo_un populados do Excel (RTCAMB00, RTLUCA00, RTFAASU00, 172.22.1.202). Divergências residuais: naming Cubango/Cuando Cubango (Excel truncado, tags correcto — aceite) + 11 GPS bbox falso-positivo (bounding boxes aproximados). Artefacto: `BPC/inventory_divergencias.csv`. |
| 9.7 | **Agências/postos sem router próprio (ponto-a-ponto)** (T-07) | ☐ | | Muitas unidades intermitentes/móveis **não têm router próprio** — ligam ponto-a-ponto a um pai. **Auditoria 2026-06-28 (3 Excels + cruzamento com Zabbix).** A população **sem router próprio** é precisa: **14 Balcões Intermitentes/Móveis** (na `Lista Geral`) — **sem código, sem IP MGMT, ausentes do Zabbix** → invisíveis. **O pai está no NOME** (com código): `Ag. Cunhinga (0312)`, `Ag. EBO (0199)`, `Ag. N´harea (0311)`, `Ag. Catabola (0310)`, `Ag. Ukuma (0116)`, `Ag. Cacula (0107)`, `Ag. Cangamba (0089)`, `Ag. Samba Cajú (0180)`, `Ag. Gulungo Alto (0263)`, `Ag. Kalandula (0187)`, `Ag. Sanza Pombo (0144)`, + Móveis Andulo/Samanhonga/Candembe. Logo o mapa filha→pai **é derivável do nome** (não precisa do inventário de equipamentos). **Importante (corrige equívoco):** "sem SNMP" ≠ "dependente" — os ~71 routers sem SNMP fresco são **routers reais** com sessão SNMP partida (Z.14), NÃO dependentes; os dependentes nem sequer têm IP. Plano: (1) extrair pai do nome dos 14; (2) monitorizá-los via **sub-interface/porto do router-pai** (depende de Z.14 SNMP no pai); (3) ficha marca "sem router próprio (dependente de X)". Deliverable A feito: `BPC/mapa_agencias_zabbix.csv` (IP↔nome↔tipo↔estado SNMP, 226 linhas) → naming Z.14 + enriquecer ficha. |

## Fase 10 · N1 · Portal NOC (porta de entrada — spec em engenharia §4.2)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 10.1 | Cards compostos, 1 por domínio (BT) | ☐ | | cada um liga ao `dashUid` do N2; domínios por construir = card "em construção" sem link |
| 10.2 | Estado agregado coerente (consome `BPC.state`) | ☐ | | rollup down/warn ao vivo por card; N1 não contradiz N2/N3 |
| 10.3 | Logo + header canónico (reutiliza `utils.js` §5.1) | ☐ | | é o menu de entrada com logo que o utilizador pediu |
| 10.4 | Definir como Home da org (`PUT /api/org/preferences`) | ☐ | | abrir Grafana cai no Portal |
| 10.5 | Layout wallboard + teste + commit | ☐ | | vive em `visao-geral/n1/` |

## Fase 11 · (Fase 2 do projecto) N0 · Executivo/SLA
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 11.1 | Disponibilidade %, tendências, SLA | ☐ | | adiado |

## Fase 12 · Reorganização da estrutura no Grafana (transversal — spec em engenharia §4.2)
> Decisões 2026-06-19: pastas de domínio **no topo** (sistema limpo, sem
> coexistir com legado) · TODO o legado consolidado numa pasta `99 · Arquivo`
> única (destino decidido no fim) · execução em sessão dedicada, com confirmação
> de push. Estado actual = 82 dashboards, 17 achatados na `dashboards v5`.

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 12.1 | Criar pastas de domínio no topo (`00`–`09`) + `99 · Arquivo` | ☑ | 2026-06-19 | 11 pastas criadas via `/api/folders`; UIDs registados no CLAUDE.md |
| 12.2 | Mover + renomear os 14 dashboards de produção v5 | ☑ | 2026-06-19 | 14/14 OK: 01·VMware (4), 02·Armazenamento (1), 03·Virtuais (2), 04·Rede (7). Títulos `N2/N3/N4 · …` |
| 12.3 | ~~Esclarecer duplicado vmware vs virtuais~~ — RESOLVIDO | ☑ | 2026-06-19 | Não é duplicado: são 2 domínios (blueprint §56-57). VMware (`a967e936`)→pasta 01; Servidores Virtuais (`0758c24e`)→pasta 03. Mapa de migração corrigido em engenharia §4.2 |
| 12.4 | Consolidar legados + testes em `99 · Arquivo` | ☑ | 2026-06-19 | 67/68 arquivados. 1 preso: `visao-geral-v5` (payload não transferível via CDP) — já estava em pasta de arquivo legado, fica lá. IA não apaga; eliminação fica para o utilizador |
| 12.5 | Esvaziar/arquivar `dashboards v5` + actualizar constraint do CLAUDE.md | ☑ | 2026-06-19 | `dashboards v5` (`efpbu5tvrhce8a`) ficou vazia; constraint do CLAUDE.md substituído pelos UIDs das pastas de domínio. Pastas legadas numeradas `00`–`08` (com `-`) ficaram vazias — eliminação fica para o utilizador |
| 12.6 | Sincronizar `dashboardTitle` + `folderUid` nos `manifest.json` | ☑ | 2026-06-19 | 14 manifests actualizados (título novo + folderUid da pasta de domínio; 4 sem folderUid passaram a tê-lo). Evita que o próximo push devolva o dashboard à pasta velha. JSON validado |

---

## Acções Zabbix (lado do utilizador — não-bloqueantes)

| # | Prioridade | Acção | Estado | Nota |
|---|---|---|---|---|
| Z.1 | P1 | Esquema de tags canónico (`dominio`/`ambiente`/`criticidade`) | ☐ | facilita filtros |
| Z.2 | P2 | Corrigir espaço duplo no grupo 602 | ☐ | "STORAGE" |
| Z.3 | P2 | Uniformizar separador de naming dos grupos | ☐ | `" / "` vs `"/"` |
| Z.4 | P2 | Fundir `412 Git lab` + `416 Gitlab` | ☐ | duplicado |
| Z.5 | P3 | Classificar 25 hosts em `A-CLASSIFICAR` (480) | ☐ | |
| Z.6 | P3 | Rever `Novos_Inventario` (632, 21 hosts) | ☐ | staging? |
| Z.7 | P2 | Esclarecer `network` vs `network2` (2 tokens) | ☐ | mesmo servidor? |
| Z.8 | P1 | VMware poller não recolhe dados de `sv9000650–655` (Powerflex) e `cls9000650–652` (Cluster Gestão) — **âmbito real: 270 VMs do grupo 609 com `lastclock=0`** (nunca recolhidas) | ☐ | Inicialmente identificado nos ESXi Powerflex; auditoria 2026-06-17 revelou que 270/451 VMs do grupo 609 têm `vmware.vm.powerstate` com `lastclock=0` (valor padrão=0 ≠ desligadas). O poller VMware nunca atingiu estes hosts. Verificar credenciais VMware nos dois vCenters e acessibilidade. Até resolução: dashboards mostram `?` no powerstate em vez de `OFF` para dados sem `lastclock` |
| Z.11 | P2 | Tag `ambiente` inconsistente: 13 hosts com `"producao"` em vez de `"Producao"` no grupo 609 | ☐ | Normalizar para `"Producao"` — afecta filtros de dashboards N2 SV que usam tag para separar producao de QA |
| Z.9 | P1 | SNMP não recolhe dos IBM FS9500 (11750) e FS9200 (11747) | ☐ | triggers `No SNMP data collection` activos em ambos — verificar community string SNMP e acessibilidade de rede |
| Z.10 | P1 | Script `unity_get_state.py` da Dell EMC Unity (11834) sem dados há >1h | ☐ | trigger `No data from storage for 1 hours` activo + `Exist unsupported items` — verificar credenciais API Unity e acessibilidade do host |
| Z.12 | P2 | Ruído de alertas Rede: 220× "Link down" (P3) em portas de acesso desligadas (g29) + ~204 "Ethernet changed to lower speed" (P1) | ☐ | Auditado 2026-06-18 (`rede-topologia.md` §9). Inflaciona KPI "Alertas activos" do N2. Baixar severidade/suprimir em portas de acesso down; rever lower-speed/half-duplex |
| Z.13 | P1 | IP SLA 65 (ITA) no DC1-RTE-WAN-INT está NOT OK (sense=4) — link Internet ITA degradado a nível de serviço apesar de if-UP | ☐ | Detectado na auditoria; é incidente real de rede, não config dashboard — encaminhar para equipa de redes |
| Z.14 | P1 | **~73 agency routers sem dados SNMP de interface** — respondem a ICMP mas sem interfaces/CPU/memória úteis (ponto cego no troubleshoot WAN) | ☐ | **Âmbito corrigido (auditoria 2026-06-28):** dos 221 routers no g24, **13 sem qualquer item** de interface (só ICMP) + **60 com items mas `lastclock=0`** (nunca recolhidos) = **~73 (33%)**. **Causa-raiz corrigida: NÃO é falta de template.** Os partidos (RTSICA00, RTAIAAN, RTKIKOLO02) já têm o template `Cisco IOS by SNMP` **e** interface SNMPv3 (authPriv SHA/AES, user `snmpv3_noc_bpc`) — **a sessão SNMP é que não fecha** (creds/ACL/`snmp-server user` no IOS, ou SNMP desligado). 13 → LLD nunca descobriu; 60 → LLD criou items mas polling falha. **Acção:** `snmpwalk -v3` de teste do Zabbix server/proxy → `ifTable` (`1.3.6.1.2.1.2.2`); se falhar é device-side. Renomear os 5 que ainda são `172.22.1.x`. Endurecer: auth e priv usam a **mesma** passphrase. N4 mostra "Sem SNMP" (dashboard correcto; dado em falta) |
| Z.15 | P2 | **Monitorização per-spoke no hub DMVPN** (`DC1-RTE-WAN-AG`) — sessão IPsec/NHRP por agência | ☐ | **Confirmado (2026-06-28):** o hub só tem 1 item agregado `Active IPsec VPN tunnels` (contagem) + estado **por provider** (`Tu101…Tu107`); **zero** items per-spoke. **Caminho:** LLD sobre `CISCO-IPSEC-FLOW-MONITOR-MIB` (`cipSecTunnelTable`) no hub → 1 entrada por **peer** (IP público do spoke) com estado/contadores da SA IPsec → mapear peer IP↔agência (inventory/tag). Pesado (200+ spokes → afinar `max_repetitions`/intervalo) mas é o caminho oficial por SNMP. Dá visibilidade do túnel de cada agência **mesmo com o router dela down** (causa-raiz de agências sem sistema). Habilita 9.6 completo |

---

## Pontos Alto ainda abertos (registo)

Resolvidos os bloqueadores e médios; nenhum Alto crítico em aberto após
2026-06-16 (ancoragem, precedência, nav N1→N2 e sondagem ficaram documentados).
Manter este espaço para novas dívidas técnicas que surjam por fase.
