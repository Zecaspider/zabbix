# Cronograma de Actividades — Sistema de Observabilidade BPC NOC

> **Painel de controlo vivo.** Única fonte de verdade do progresso. Actualizar
> a cada ponto concluído (marca o estado + data + nota). O
> `documentacao/engenharia-do-sistema.md` define *como* se faz; este define
> *onde estamos*.
>
> Legenda: ☐ pendente · ◐ em curso · ☑ concluído · ⏸ bloqueado · ✖ descartado
> Cada ponto só passa a ☑ quando cumpre o DoD (engenharia §10.1).

Última actualização: 2026-06-18 (1.20 ☑ conformidade; 1.21 ☑ navegação N2-VMware↔N3-vCenter; 1.22 ☑ N3-ESXi back link + nocLabel corrigido)

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
| 4.3 | N2 refactor — l2-kpi + l2-segmentos + l2-triggers | ◐ | 2026-06-18 | Pushed. Falta: layout final (4.8) + teste browser confirmado |
| 4.4 | N3 DC Core — fabric + table + WAN links | ☑ | 2026-06-19 | UID `a75e2ba6` · 4 painéis (utils/fabric/table/wan) · pushed + committed · `rede/n3-dc/` |
| 4.5 | N3 Edifícios | ◐ | | UID `471f2208` · pushed anteriormente · falta drill N4 |
| 4.6 | N3 WAN — negócio + cards + triggers + carriers | ☑ | 2026-06-19 | UID `1702465e` (n3-wan) · UID `31bace26` (n3-wan-carriers) · 4+2 painéis · 3 "não identificado" residuais (aceitável) · pushed + committed |
| 4.7a | N4 WAN Router — ficha técnica por router | ☑ | 2026-06-19 | UID `8ddc4833` · var `routerName` (Custom, 5 routers) · BT: ficha+circuitos categorizados+impacto negócio+flapping 4h+BGP prefixos+IP SLA · TS nativo: tráfego+CPU/RAM+RTT · pushed + committed |
| 4.7b | N4 DC Switch — ficha técnica por switch | ☑ | 2026-06-19 | UID `7baea796` · var `switchName` (Query→HG_DC_SWITCHES, auto-popula) · BT: ficha+fabric categorizado+impacto negócio+BGP EVPN+erros CRC+flapping 4h · TS nativo: tráfego+CPU+erros · pushed + committed |
| 4.8 | Navegação ponta-a-ponta + layout final + teste confirmado | ☐ | | back-links N2→N3→N4 · gridPos final · screenshot NOC |

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

## Fase 9 · Agências (anchor 24 + 25, **Network**)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 9.1 | N2 geomapa (nativo) + card KPIs do link (BT) | ☐ | | 220 routers |
| 9.2 | N3 detalhe agência/link | ☐ | | |
| 9.3 | Navegação + teste + commit | ☐ | | |

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

---

## Pontos Alto ainda abertos (registo)

Resolvidos os bloqueadores e médios; nenhum Alto crítico em aberto após
2026-06-16 (ancoragem, precedência, nav N1→N2 e sondagem ficaram documentados).
Manter este espaço para novas dívidas técnicas que surjam por fase.
