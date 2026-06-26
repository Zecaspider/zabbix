# Blueprint — BPC-Observe (v5)

> Documento de referência da arquitectura-alvo. Aprovado em 2026-06-16.
> Complementa o `../CLAUDE.md` (fluxo de trabalho) e o
> `framework-de-criacao-de-cards.md` (framework de cards). Este define **o quê**
> se constrói e **porquê**.

---

## 1. Objectivo

Transformar o Grafana de "dashboards bonitos" num **sistema de observabilidade
NOC completo**: detecção → triagem → correlação → resposta, com drill-down
lógico (N1→N2→N3) e vistas distintas para operação, engenharia e gestão.

## 2. Camadas e fontes de verdade

| Camada | Responsabilidade | Fonte de verdade |
|---|---|---|
| **Zabbix** | recolha, triggers, alerta, escalação/on-call | dados e alertas |
| **Grafana** | superfície única de observabilidade + navegação | apresentação/dashboards canónicos |
| **Repo (`v5/`)** | código dos painéis (`.js`) + manifestos | código |

Regra: o Grafana **não** duplica triggers como alertas próprios. O alerta vive
no Zabbix; o Grafana mostra, navega e correlaciona.

## 3. Naming canónico

```
n1-visao-geral          "N1 · Visão Geral NOC"
n2-<dominio>            "N2 · <Domínio>"
n3-<dominio>-detalhe    "N3 · <Domínio> · Detalhe"
```

Substitui a numeração caótica (D01/D3.1/D4.2/D6.1). 1 UID estável por dashboard.

## 4. Mapa de drill-down (estado-alvo)

```
N1 · Visão Geral NOC  ── wallboard, 1 card por domínio (tudo Dynamic Text)
 │
 ├─ Infraestrutura VMware ► N2 · VMware (vCenters + clusters + ESXi)
 │                               └─► N3 · ESXi Detalhe (por hypervisor)
 ├─ Servidores Virtuais ──► N2 · VMs (saúde, filtro por ambiente)
 │                               └─► N3 · Detalhe VM (por VM)
 ├─ Armazenamento ────────► N2 · Armazenamento ──────► N3 · Storage (por array/tape)
 ├─ Bases de Dados ───────► N2 · Bases de Dados ──────► N3 · Instância (por DB)
 ├─ Rede ─────────────────► N2 · Rede ──► N3 · WAN — Serviços ──────────────► N4 · WAN — Device (var-hostid)
 │                                    ├─► N3 · DC — Fabric ───────────────► N4 · DC — Switch (var-hostid)
 │                                    ├─► N3 · Edifícios ─────────────────► N4 · Rede — Device (var-hostid)
 │                                    └─► N3 · Agências (geomap + lista) ──► N4 · Agência — Device (var-hostid)
 │                  [Zabbix network — grupos 24/25/26/27/28/29]
 │                  [Agências integradas em Rede — decisão 2026-06-19]
 ├─ Segurança ────────────► N2 · Segurança ───────────► N3 · Firewall/WAF/Darktrace
 ├─ APIs & Serviços ──────► N2 · APIs ─────────────────► N3 · Endpoint/Aplicação
 └─ Serviços de Negócio ──► N2 · eBankit ──────────────► N3 · Jornada/Transacção
```

Decisões de estrutura:
- **Infraestrutura VMware** e **Servidores Virtuais** são dois cards separados no N1.
  VMware = camada de infra (vCenters, clusters, ESXi). VMs = camada de workload (saúde operacional).
  O antigo domínio "Servidores Físicos" foi absorvido e elevado: o seu conteúdo
  (tabela ESXi) passa a N3-ESXi dentro do domínio VMware.
- **Datastores** dobrado em Servidores Virtuais (vista N3), não é domínio próprio.
- **APIs (técnico)** e **Serviços de Negócio (eBankit)** mantêm-se separados
  (consumidores diferentes: engenharia vs gestão/operação).
- **Agências integradas em Rede** (decisão 2026-06-19): Agências deixa de ser
  domínio independente e passa a sub-domínio de Rede (N3-Agências). Edifícios e
  Agências têm a mesma natureza operacional (routers + switches de acesso); separá-los
  no N1 criava fragmentação sem valor. O N1 terá um único card "Rede" que agrega WAN,
  DC Fabric, Edifícios e Agências.
- **N4 · Device** (ficha do dispositivo) existe em todos os sub-domínios de Rede:
  dashboard parametrizado (`var-hostid`) com séries temporais (interfaces in/out,
  CPU, memória se disponível), tabela de interfaces UP/DOWN, triggers activos do host,
  e link de retorno ao N3 pai. Inspiração: marketplace Grafana (Network Device Dashboard).
- **N0 · Executivo/SLA** (disponibilidade %, tendências) — slot reservado,
  construído por último (fase 2).

## 5. Estratégia de painel por nível (regra híbrida)

| Nível | Dynamic Text (`marcusolsson-dynamictext-panel`) | Nativo Grafana |
|---|---|---|
| **N1** | todos os cards compostos | — |
| **N2** | KPI strip (topo) | tabela de hosts, lista de top-triggers |
| **N3** | só o header do host | séries temporais (CPU/RAM/IO/rede), state-timeline (triggers), tabela de eventos |
| **Agências** | card de KPIs do link | geomap nativo |

Princípio: nativo onde o Grafana já é forte e grátis (geomap, séries, tabelas,
alertlist); Dynamic Text só onde a estética/lógica composta NOC *é* o valor.

## 6. Peças transversais (existem 1× por dashboard, reutilizadas)

- **Painel utils (`utils.js`)** — runtime BPC (`window.BPC`, `waitForBPC`),
  `BPC_SHARED`, `BPC_CHARTS`, `THEME`, CSS global. Contrato em
  `engenharia-do-sistema.md` §5.1. Bootstrap com `initWithRetry`.
- **Modelo de estado único** — vive no utils. Thresholds documentados por
  domínio, agregação bottom-up. Garante que N1 nunca contradiz N2/N3.
- **Contrato de navegação** — cada card N1 conhece o `dashUid` do seu N2;
  cada linha de host no N2 constrói o link N3 com `var-hostid`.

## 7. Personas / vistas

| Persona | Onde | Foco |
|---|---|---|
| Operador NOC | N1 (wallboard) | estado em tempo real, vermelho/verde imediato |
| Operador (triagem) | N2 → N3 | drill-down para isolar o host/causa |
| Engenharia | N3 | séries, triggers, eventos do host específico |
| Gestão | N0 (fase 2) | disponibilidade, SLA, tendências |

## 8. Limpeza ("começar limpo") — EXECUTADO 2026-06-16

A pasta "dashboards v5" tinha ~64 dashboards (legado + duplicados +
experiências). Em vez de re-acolher, decidiu-se **construir o canónico de
zero**; os dashboards bons ficam só como **referência/salvamento** no arquivo.

Método (mais seguro que mover 64 dashboards): renomear a pasta poluída e criar
uma pasta nova limpa — 2 operações de pasta, zero reescritas de dashboards.

**Coordenadas Grafana (estado actual):**

| Pasta | UID | Conteúdo |
|---|---|---|
| `dashboards v5` (canónica, **vazia**, onde se constrói) | `efpbu5tvrhce8a` | — |
| `99 - Arquivo v5 (legado)` | `efp8usobcfeo0d` | os ~64 antigos (referência) |

**Dashboards de referência** (no arquivo, **não** tocar — só consultar/salvar):
- N1 que renderiza: `d01-v1`
- N2 Virtuais corrigido: `5b6b0e85-0e65-4753-9d99-9602cfcd85d1`
- N3 Detalhe VM: `ad040c90-01ae-45f9-b537-44580fd75d03`

**Datasource Zabbix:** UID `3_KgG43nz`. **Service account API:** `sa-1-dev`.

Tudo o canónico (n1-/n2-/n3-) nasce novo na pasta `efpbu5tvrhce8a`, validando
sempre via API do Grafana que dados chegam de cada host/grupo antes de construir.

## 9. Ordem de construção

Fundação primeiro, depois domínio a domínio (cada um pelo fluxo incremental
do `../CLAUDE.md`: painel a painel → push → testar → aprovar → commit).

```
F.  Fundação              — utils/state/nav canónicos
1.  Infraestrutura VMware — N2 (vCenters+ESXi) + N3-ESXi + N3-ESXi-Detalhe
                            [N3-ESXi e N3-ESXi-Detalhe: conteúdo migrado de Servidores Físicos]
2.  Servidores Virtuais   — N2 (saúde VMs, agente-first) + N3 VM Detalhe
3.  Armazenamento         — conteúdo existe; N3 bloqueado até Z.9/Z.10
4.  Rede                  — geomap bom
5.  Segurança             — firewall/WAF/Darktrace existem
6.  Bases de Dados        — parcial
7.  APIs & Serviços       — consolidar experiências web
8.  Serviços de Negócio   — eBankit
9.  Agências              — geomap + detalhe
10. N1 · Visão Geral      — finalizar quando todos os N2 UID existirem
11. (fase 2) N0 · Executivo/SLA
```

Ordem dentro de cada domínio: N2 → N3 → ligar navegação → testar → commit.
