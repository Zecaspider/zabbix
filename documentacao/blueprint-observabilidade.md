# Blueprint — Sistema de Observabilidade BPC NOC (v5)

> Documento de referência da arquitectura-alvo. Aprovado em 2026-06-16.
> Complementa o `CLAUDE.md` raiz (framework de cards) e o `v5/CLAUDE.md`
> (fluxo de trabalho). Este define **o quê** se constrói e **porquê**.

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
N1 · Visão Geral NOC  ── wallboard, 1 card por domínio (tudo Business Text)
 │
 ├─ Armazenamento ───────► N2 · Armazenamento ──────► N3 · Storage (por array/tape)
 ├─ Servidores Físicos ──► N2 · Servidores Físicos ─► N3 · Servidor Físico (por host)
 ├─ Servidores Virtuais ─► N2 · Servidores Virtuais ► N3 · Detalhe VM (por VM)   [REFERÊNCIA ✅]
 │                          └─ inclui vista de Datastores (dobrado aqui)
 ├─ Bases de Dados ──────► N2 · Bases de Dados ──────► N3 · Instância (por DB)
 ├─ Rede ────────────────► N2 · Rede (DC/Edif/WAN) ──► N3 · Link/Segmento   [Zabbix network]
 ├─ Segurança ───────────► N2 · Segurança ───────────► N3 · Firewall/WAF/Darktrace
 ├─ APIs & Serviços ─────► N2 · APIs ─────────────────► N3 · Endpoint/Aplicação
 ├─ Serviços de Negócio ─► N2 · eBankit ──────────────► N3 · Jornada/Transacção
 └─ Agências ────────────► N2 · Agências (geomap) ────► N3 · Detalhe Agência/Link  [Zabbix network]
```

Decisões de estrutura:
- **Datastores** dobrado em Servidores Virtuais (vista N3), não é domínio próprio.
- **APIs (técnico)** e **Serviços de Negócio (eBankit)** mantêm-se separados
  (consumidores diferentes: engenharia vs gestão/operação).
- **N0 · Executivo/SLA** (disponibilidade %, tendências) — slot reservado,
  construído por último (fase 2).

## 5. Estratégia de painel por nível (regra híbrida)

| Nível | Business Text | Nativo Grafana |
|---|---|---|
| **N1** | todos os cards compostos | — |
| **N2** | KPI strip (topo) | tabela de hosts, lista de top-triggers |
| **N3** | só o header do host | séries temporais (CPU/RAM/IO/rede), state-timeline (triggers), tabela de eventos |
| **Agências** | card de KPIs do link | geomap nativo |

Princípio: nativo onde o Grafana já é forte e grátis (geomap, séries, tabelas,
alertlist); Business Text só onde a estética/lógica composta NOC *é* o valor.

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
do `v5/CLAUDE.md`: painel a painel → push → testar → aprovar → commit).

```
F.  Fundação  — utils/state/nav canónicos + adoptar Virtuais como referência
1.  Servidores Físicos    (conteúdo existe → conformar)
2.  Armazenamento         (conteúdo existe)
3.  Rede                  (geomap bom)
4.  Segurança             (firewall/WAF/Darktrace existem)
5.  Bases de Dados        (parcial)
6.  APIs & Serviços       (consolidar experiências web)
7.  Serviços de Negócio   (eBankit — consolidar cluster web monitoring)
8.  Agências              (geomap + detalhe)
9.  N1 · Visão Geral      (finalizar cards quando todos os N2 UID existirem)
10. (fase 2) N0 · Executivo/SLA
```

Ordem dentro de cada domínio: N2 → N3 → ligar navegação → testar → commit.
