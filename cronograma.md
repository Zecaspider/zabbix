# Cronograma de Actividades — Sistema de Observabilidade BPC NOC

> **Painel de controlo vivo.** Única fonte de verdade do progresso. Actualizar
> a cada ponto concluído (marca o estado + data + nota). O
> `documentacao/engenharia-do-sistema.md` define *como* se faz; este define
> *onde estamos*.
>
> Legenda: ☐ pendente · ◐ em curso · ☑ concluído · ⏸ bloqueado · ✖ descartado
> Cada ponto só passa a ☑ quando cumpre o DoD (engenharia §10.1).

Última actualização: 2026-06-17 (1.13–1.17 ☑ N2 VMware + N3 vCenter 4 painéis; 1.19/1.20 pendentes: dropdown + revisão conformidade; 3.2 ◐ aguarda validação)

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
| 1.18 | **N3 vCenter** — snapshot JSON final | ☐ | | pull + gridPos definitivo + snapshot |
| 1.19 | **N3 vCenter** — dropdown selector de vCenter (var-vcenter_hostid) | ☐ | | variável Grafana ou painel de selecção no topo do dashboard |
| 1.20 | Revisão de conformidade — todos os dashboards vs contratos da documentação | ☐ | | ver `documentacao/revisao-conformidade.md`; cheklist por dashboard |
| 1.21 | Navegação N2-VMware → N3-vCenter → Abrir vCenter testada | ☐ | | |
| 1.22 | Navegação N3-ESXi ↔ N2-VMware testada | ☐ | | |
| 1.23 | Navegação N1→N2-VMware pendente até Fase 10 | ⏸ | | N1 criado por último |
| 1.20 | Navegação N3-ESXi ↔ N2-VMware testada | ☐ | | |
| 1.21 | Navegação N1→N2-VMware pendente até Fase 10 | ⏸ | | N1 criado por último |

## Fase 2 · Armazenamento (anchor 602 + tape 605, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 2.1 | Sondar items 602/605 | ☑ | 2026-06-17 | 10 hosts Storage + 1 Tape. Sem métricas capacidade/IOPS — só ICMP + `system.status` SNMP (IBM). SNMP e script Dell não recolhem (triggers activos). Registado em mapa-host-groups §Sondagem 2.1 |
| 2.2 | N2 (utils + KPI + tabela + triggers) | ☑ | 2026-06-17 | 4 painéis (utils/kpi/tabela/triggers); UID `993834a3`; transparent+layout aplicados. Card IBM SNMP mostra aviso Z.9 enquanto SNMP não recolhe — adapter pronto para activar automaticamente assim que Zabbix resolver |
| 2.3 | N3 (por array/tape) | ⏸ | | Bloqueado até Z.9 (SNMP IBM) e Z.10 (script Dell Unity) estarem resolvidos — sem dados reais no Zabbix, N3 seria só ping. Retomar após Fase 3+ |
| 2.4 | Navegação + teste + commit | ⏸ | | Depende de 2.3 |

## Fase 3 · Servidores Virtuais (anchor 609, Infra)

> N2 SV em construção activa. Arquitectura agente-first (VMware fallback).
> Filtro padrão: tag `ambiente` = "Produção" | "producao".

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 3.1 | N2 — utils + KPI strip + tabela (agente-first) + triggers | ◐ | 2026-06-17 | Dashboard `0758c24e` criado; 4 painéis pushed (id=100-103); layout transparent aplicado |
| 3.2 | N2 — corrigir CPU VMware (MHz→%) e RAM (keys/unidades) | ◐ | 2026-06-17 | `l2-tabela.js` v2.0 pushed id=102; CPU→`vmware.vm.cpu.usage.perf`; RAM split em 2 queries; aguarda confirmação visual |
| 3.3 | N2 — layout final + snapshot | ☐ | | após CPU/RAM correctos |
| 3.4 | N3 — conformar rascunho (l3-*.js em `n3/`) | ☐ | | |
| 3.5 | N3 — painel Datastores (grupo 608) | ☐ | | |
| 3.6 | Navegação N2-VMware ↔ N2-SV ↔ N3-VM testada | ☐ | | |

## Fase 4 · Rede (multi-grupo 26/27/28/29/35, **Network** `ffo8sp8zllog0e`)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 4.1 | Confirmar onde vivem os links WAN (grupo 35 vazio) | ☐ | | item por interface vs host |
| 4.2 | N2 — DC (26/27) | ☐ | | |
| 4.3 | N2 — Edifícios (28/29) | ☐ | | |
| 4.4 | N2 — WAN/Links | ☐ | | |
| 4.5 | N3 por segmento/link | ☐ | | |
| 4.6 | Navegação + teste + commit | ☐ | | |

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

## Fase 10 · N1 · Visão Geral (depende de 1–9)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 10.1 | Cards compostos, 1 por domínio (BT) | ☐ | | cada um liga ao `dashUid` do N2 |
| 10.2 | Estado agregado coerente (consome `BPC.state`) | ☐ | | N1 não contradiz N2/N3 |
| 10.3 | Layout wallboard + teste + commit | ☐ | | |

## Fase 11 · (Fase 2 do projecto) N0 · Executivo/SLA
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 11.1 | Disponibilidade %, tendências, SLA | ☐ | | adiado |

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

---

## Pontos Alto ainda abertos (registo)

Resolvidos os bloqueadores e médios; nenhum Alto crítico em aberto após
2026-06-16 (ancoragem, precedência, nav N1→N2 e sondagem ficaram documentados).
Manter este espaço para novas dívidas técnicas que surjam por fase.
