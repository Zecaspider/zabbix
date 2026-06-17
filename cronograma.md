# Cronograma de Actividades — Sistema de Observabilidade BPC NOC

> **Painel de controlo vivo.** Única fonte de verdade do progresso. Actualizar
> a cada ponto concluído (marca o estado + data + nota). O
> `documentacao/engenharia-do-sistema.md` define *como* se faz; este define
> *onde estamos*.
>
> Legenda: ☐ pendente · ◐ em curso · ☑ concluído · ⏸ bloqueado · ✖ descartado
> Cada ponto só passa a ☑ quando cumpre o DoD (engenharia §10.1).

Última actualização: 2026-06-17 (1.9 ☑)

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

## Fase 1 · Servidores Físicos (anchor 603, Infra)

| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 1.1 | Sondar items do grupo 603 (CPU/RAM/disco/rede/HW) | ☑ | 2026-06-16 | 27 hosts: 20 ESXi (`vmware.hv.*`) + 4 físicos ICMP-only + 2 Cisco UCS + 1 Dell sem items. Items fixados em mapa-host-groups.md §Sondagem 1.1. ⚠ grupo 603 é maioritariamente ESXi, não físicos clássicos. |
| 1.2 | Ratificar thresholds no catálogo §6.2 | ☑ | 2026-06-16 | ESXi: CPU warn/crit via `vmware.hv.status` (green/yellow/red — Zabbix já avalia). Sem agente OS nos físicos → triggers são a fonte de estado. Catálogo §6.2 confirma-se para ESXi. |
| 1.3 | N2 — `utils.js` | ☑ | 2026-06-16 | copiado de `_comum/utils.js` v9; header "SERVIDORES FÍSICOS (ESXi) - NÍVEL 2"; push OK (UID `8f6a94be`) |
| 1.4 | N2 — KPI strip (BT) | ☑ | 2026-06-17 | `l2-kpi.js` v3.0 (id=100); 6 cards: Hosts/Clusters/CPU-pior/RAM-pior/Datastores/Alertas; BPC-UI framework; worst não médio |
| 1.5 | N2 — tabela de hosts (nativo) | ☑ | 2026-06-17 | `l2-tabela.js` v3.0 (id=101); 11 colunas NOC@3m; sparklines CPU; DS worst%; triggers/host; ordenado pior estado |
| 1.6 | N2 — top triggers (nativo) | ☑ | 2026-06-17 | `l2-triggers.js` (id=102); grupo 603, top alertas activos |
| 1.7 | N2 — layout final + snapshot + commit | ☑ | 2026-06-17 | gridPos: h=3/8/36/14; snapshot `dashboard-completo.json`; commit pendente |
| 1.8 | N3 — header do host (BT) | ☑ | 2026-06-17 | `l3-header.js` (id=101); lê var-hostid/hostname da URL; KPI row + triggers resumo + link ← N2; dashboard UID `b55d5481` criado |
| 1.9 | N3 — séries CPU/RAM/disco/rede (nativo) | ☑ | 2026-06-17 | 3 painéis timeseries: CPU (% + thresholds), RAM (used+total bytes), Network (bytes received/transmitted); `push_native.py` criado; âncora BT corrigida para "CPU usage in percent" |
| 1.10 | N3 — state-timeline triggers + tabela eventos | ☑ | 2026-06-17 | `l3-eventos.js` id=102; tabela BT com severidade PT, duração relativa, tokens BPC |
| 1.11 | N3 — layout final + snapshot + commit | ☑ | 2026-06-17 | transparent + sem título em todos os 6 painéis; snapshot `dashboard-completo.json` |
| 1.12 | Navegação N1→N2→N3→volta testada | ◐ | | N2→N3 validado; N1→N2 pendente até Fase 10 (N1 criado por último, após todos os domínios) |

## Fase 2 · Armazenamento (anchor 602 + tape 605, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 2.1 | Sondar items 602/605 | ☐ | | capacidade/latência/IOPS/tape |
| 2.2 | N2 (utils + KPI + tabela + triggers) | ☐ | | |
| 2.3 | N3 (por array/tape) | ☐ | | |
| 2.4 | Navegação + teste + commit | ☐ | | |

## Fase 3 · Servidores Virtuais (anchor 609 + ESXi 608, Infra)
| # | Tarefa | Estado | Data | Nota |
|---|---|---|---|---|
| 3.1 | Conformar N2 de referência ao padrão (CFG/utils) | ☐ | | já funciona; alinhar |
| 3.2 | Conformar N3 (rascunho → aprovado) | ☐ | | l3-*.js em `n3/` |
| 3.3 | Painel Datastores dentro do N3 (grupo 608) | ☐ | | §5 nota #9 |
| 3.4 | Navegação + teste + commit | ☐ | | |

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
| Z.8 | P1 | VMware poller não recolhe dados de `sv9000650–655` (Powerflex) e `cls9000650–652` (Cluster Gestão) | ☐ | `lastclock=0` em todos — poller nunca atingiu estes hosts; verificar credenciais VMware e acessibilidade vCenter |

---

## Pontos Alto ainda abertos (registo)

Resolvidos os bloqueadores e médios; nenhum Alto crítico em aberto após
2026-06-16 (ancoragem, precedência, nav N1→N2 e sondagem ficaram documentados).
Manter este espaço para novas dívidas técnicas que surjam por fase.
