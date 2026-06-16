# Engenharia do Sistema de Observabilidade BPC NOC (v5)

> **Documento mestre.** Define arquitectura, fluxo de trabalho, padrões de
> código, teste, operação e manutenção. Serve de base ao `CLAUDE.md` e guia
> qualquer IA ou pessoa na construção dos dashboards.
> Sub-documentos de detalhe: [`blueprint-observabilidade.md`](blueprint-observabilidade.md)
> (mapa drill-down) e [`mapa-host-groups.md`](mapa-host-groups.md) (domínio→grupo).
> Criado 2026-06-16 · revisão contínua via a checklist da §12.

---

## 1. Visão e objectivo

Transformar o Grafana de "dashboards bonitos" num **sistema de observabilidade
NOC completo** para um banco: detecção → triagem → correlação → resposta, com
drill-down lógico e vistas distintas para operação, engenharia e gestão.

Critério de sucesso: um operador NOC vê o estado de tudo num ecrã (N1), desce
ao domínio em causa (N2), isola o host/causa (N3) — sem sair do Grafana, com
estado coerente entre níveis e navegação determinística.

## 2. Princípios de arquitectura

1. **Separação de camadas e fontes de verdade.**
   | Camada | Responsabilidade | Fonte de verdade |
   |---|---|---|
   | Zabbix | recolha, triggers, alerta, escalação | dados e alertas |
   | Grafana | apresentação + navegação (observabilidade) | dashboards canónicos |
   | Repo `v5/` | código dos painéis + manifestos | código |
   O Grafana **não** duplica triggers como alertas próprios.

2. **Híbrido por princípio.** Painel nativo Grafana onde já é forte (geomap,
   séries temporais, tabelas, listas de triggers/alertas, stat/gauge);
   Business Text só onde a estética/lógica composta NOC *é* o valor.

3. **Estado coerente, calculado uma vez.** Um modelo de estado único
   (§6) — o N1 nunca contradiz o N2/N3.

4. **Navegação determinística.** Contrato de drill-down explícito (§7),
   nunca links ad-hoc.

5. **DRY via painel utilitário.** Tudo o que é partilhado (runtime, charts,
   CSS, estado) vive 1× no painel utils de cada dashboard (§5), nunca repetido
   por painel.

6. **Código local é a fonte; Grafana é o ambiente de execução/teste.** Nunca
   corrigir só no Grafana (§8).

## 3. Hierarquia e domínios

Drill-down `N1 → N2 → N3` (mapa completo no blueprint). Detalhe + contagens em
`mapa-host-groups.md`.

**Regra de ancoragem (#5/#6) — determinística:**
- A taxonomia Zabbix é **facetada** (um host está em vários grupos de eixos
  diferentes). O nome do eixo (INFRAESTRUTURA / CAMADA / APLICACOES) é
  **irrelevante** para escolher a âncora — o que vale é a tabela abaixo.
- Cada domínio tem **um `groupId` âncora**: o grupo cujo conjunto de hosts *é*
  o domínio. É esse que filtra o dashboard N2 (lista de hosts) e a query âncora.
- Grupos **de enriquecimento** (coluna própria) **não** filtram o dashboard;
  são consultados por RPC dentro do `afterRender` para items extra (ex.:
  datastores nos ESXi). Nunca usar um grupo de enriquecimento como âncora.

| Domínio | Zabbix | groupId âncora | Enriquecimento | N3 |
|---|---|---|---|---|
| Servidores Físicos | Infra | `603` | — | por host |
| Servidores Virtuais | Infra | `609` | `608` (ESXi/datastores) | por VM |
| Armazenamento | Infra | `602` (Storage) | `605` (Tape) | por array |
| Segurança | Infra | `656` | — | firewall/WAF/Darktrace |
| Bases de Dados | Infra | `355` | — | por instância |
| APIs & Serviços | Infra | `663` (Sintéticos) | `345` (Camada Aplic.) | por endpoint |
| Serviços de Negócio | Infra | `391` (eBankit) | eixo SERVICO/* | por jornada |
| **Rede** | Network | *multi-grupo* `26/27/28/29/35` | `22` (gestão) | por segmento |
| **Agências** | Network | `24` (routers) | `25` (switches) | por agência |

**Excepção Rede:** não tem groupId âncora único — agrega DC (`26/27`),
Edifícios (`28/29`) e WAN (`35`). O N2 de Rede trata cada segmento como
sub-secção; a query âncora aponta para um grupo real e estável (ex.: `26`).

## 4. Naming canónico

```
Dashboards:  n1-visao-geral · n2-<dominio> · n3-<dominio>-detalhe
Ficheiros:   lowercase-com-hifens.js (sem acentos, sem versão no nome)
  painel utils:   utils.js (ou *-header-global.js em dashboards herdados)
  conteúdo N2/N3: l2-*.js / l3-*.js  (prefixo de nível)
Funções/vars: específicas e grepáveis (< 5 matches no codebase)
```

Git versiona — nunca `-v1`, `-old`, `copy` no nome do ficheiro.

### 4.1 Hierarquia de directórios local (REPRODUZÍVEL)

Esta é a regra que traduz a arquitectura lógica (níveis + domínios) para a
árvore de ficheiros. Uma IA deve poder reproduzir esta estrutura **só a partir
desta secção**, sem adivinhar.

Raiz de trabalho: `C:\Repositorios\zabbix\sistema-de-observabilidade\`.

```
sistema-de-observabilidade/
├── CLAUDE.md                       # fluxo de trabalho (esta pasta)
├── README.md                       # indice da estrutura
├── documentacao/                   # os 3 docs canonicos (este, blueprint, mapa-host-groups)
├── visao-geral/                    # o N1 (nivel de topo, sem dominio)
│   └── n1/                         # 1 subpasta = 1 dashboard Grafana
│       ├── manifest.json
│       └── *.js
├── <dominio>/                      # 1 pasta por dominio (nome do dominio, SEM prefixo n2-)
│   ├── CLAUDE.md                   # (opcional) regras especificas do dominio
│   ├── n2/                         # dashboard N2 do dominio = 1 UID Grafana
│   │   ├── manifest.json           # liga ficheiro<->painel; tem o dashboardUid do N2
│   │   ├── dashboard-snapshot.json # (so apos fecho) JSON completo do dashboard
│   │   └── l2-*.js                 # paineis (utils + conteudo)
│   └── n3/                         # dashboard N3 de detalhe = OUTRO UID Grafana
│       ├── manifest.json           # com o dashboardUid do N3
│       └── l3-*.js
└── arquivo-referencia/             # material antigo, SO consulta, nunca editar
```

**Regras invioláveis:**
1. **1 subpasta = 1 dashboard Grafana = 1 manifest.json com 1 dashboardUid.**
   N2 e N3 são dashboards separados no Grafana, logo `n2/` e `n3/` são
   subpastas separadas, cada uma com o seu manifesto. Nunca misturar `l2-*` e
   `l3-*` na mesma pasta.
2. **A pasta de domínio tem o nome do domínio** (`servidores-virtuais/`), não
   `n2-servidores-virtuais/`. O nível (`n2`/`n3`) é a subpasta. O prefixo
   `n1-/n2-/n3-` da §4 aplica-se ao **título/UID do dashboard no Grafana**, não
   ao nome da pasta de domínio.
3. Domínios da §3 → uma pasta cada: `servidores-fisicos`, `servidores-virtuais`,
   `armazenamento`, `seguranca`, `bases-dados`, `apis`, `servicos-negocio`,
   `rede`, `agencias`. (Datastores **não** tem pasta — vive dentro do N3 de
   `servidores-virtuais`, conforme blueprint §4.)
4. Subpastas vazias (ainda por construir) levam um `.gitkeep` para a hierarquia
   sobreviver no git.

## 5. Arquitectura do dashboard

### Painéis por nível (regra híbrida aplicada)

| Nível | Business Text | Nativo Grafana |
|---|---|---|
| N1 | cards compostos (1 por domínio) | — |
| N2 | KPI strip (topo) | tabela de hosts, top-triggers |
| N3 | header do host | séries (CPU/RAM/IO/rede), state-timeline, eventos |
| Agências | card KPIs do link | geomap |

### Contrato de métricas N3 por domínio (#10)

Cada N3 mostra o conjunto de séries/painéis abaixo. Os **nomes de item Zabbix**
confirmam-se ao sondar (§10) e fixam-se em `CFG.itemNames*` do card — esta
tabela é o alvo, não o palpite:

| Domínio | Séries / painéis N3 mínimos |
|---|---|
| Servidores Físicos | CPU %, RAM %, disco por volume, rede I/O, temperatura/HW, triggers, eventos |
| Servidores Virtuais | CPU %, RAM % (+balloon/swap), disco por volume, rede I/O, power state, **Datastores** (ver nota), triggers, eventos |
| Armazenamento | capacidade/livre por array, latência, IOPS, estado de pool/RAID, tape jobs, triggers |
| Bases de Dados | conexões, cache hit, locks, tamanho/crescimento, backup status, triggers |
| Segurança | sessões/throughput firewall, regras WAF, alertas Darktrace, estado HA |
| APIs & Serviços | latência endpoint, código HTTP, disponibilidade sintética, erros |
| Serviços de Negócio (eBankit) | estado da jornada, latência transacção, fila, dependências |
| Rede | disponibilidade ICMP, latência/perda, utilização de interface, estado de link |

**Nota Datastores (#9):** Datastores **não** é dashboard próprio — é um painel
*dentro* do N3 de Servidores Virtuais (`servidores-virtuais/n3/`), alimentado
pelos items de datastore que vivem nos hosts ESXi (grupo Hypervisores 608;
prefixo de item `Datastore discovery:` / `Total size of datastore` /
`Free space on datastore`). Estado por `% livre` (catálogo §6.2, dir `below`).

### 5.1 Contrato do painel utilitário (`utils`) — o que expõe

Obrigatório, **1 por dashboard** (`role: "utils"` no manifesto). É o primeiro
painel a carregar e o único autorizado a definir o runtime partilhado. Todos os
painéis de conteúdo **assumem** que estes símbolos existem (via `initWithRetry`,
§9) e **nunca** os redefinem. Contrato mínimo exposto em `window`:

| Símbolo | Tipo | Responsabilidade |
|---|---|---|
| `window.BPC` | objecto | namespace raiz (`BPC.utils`, `BPC.rpc`, `BPC.log`, `BPC.nav`) |
| `window.waitForBPC(cb)` | função | invoca `cb(rpc)` quando o runtime está pronto |
| `window.BPC.utils` | objecto | `waitForElement`, `startRefresh`, `buildSkeleton`, `fetchICMP` |
| `window.BPC_SHARED` | objecto | helpers puros: `esc`, `ts`, `cls`, `divider`, `pbar`, `fmtNum`, `fmtTb`, `worstState`, `severityToState`, `stateAbove/Below`, `toFloat` |
| `window.BPC_CHARTS` | objecto | SVG: `gaugeSemi`, `sparkline`, `pbar`, `dot` |
| `window.BPC.THEME` | objecto | tokens visuais consumidos pelos cards (`colorOk/Warn/Crit/Info/Mute/Dis`, `fontBody`, `sz*`, `cardPadding`, …) |
| `window.BPC.state` | objecto | API do modelo de estado (§6): `hostState(metrics)`, `worst(states)`, `color(state)` |
| CSS global `.bpc-*` | `<style>` | vive **só** aqui; nenhum card repete |

Por defeito **um** painel utils por dashboard (menos pontos de falha). Só se
separa em dois com justificação concreta (ex.: biblioteca de gráficos pesada
usada por poucos painéis). Nome canónico do ficheiro: `utils.js` (ou, em
dashboards herdados já aprovados, mantém-se `*-header-global.js` até refactor —
ver nota de conformidade em §11).

### 5.2 Framework BPC do card (5 blocos) + contrato de dados

Detalhe completo do framework e do contrato `getData()→adapter()→render()` em
[`framework-de-criacao-de-cards.md`](framework-de-criacao-de-cards.md). Resumo
obrigatório:

1. **CFG** — config aninhada, única fonte de verdade (`CFG.id`, `CFG.behaviour`,
   `CFG.thresholds`, `CFG.labels`, `CFG.stateColors`…). Sem valores mágicos no
   corpo. (detalhe no `CLAUDE.md` raiz)
2. **getDemoData()** — dados estáticos para preview offline (mesma forma que o
   adapter devolve).
3. **getData(rpc)** — queries Zabbix via `rpc.call()`; devolve dados **crus**.
4. **adapter(raw)** — normaliza o cru para o **objecto de view** (forma abaixo).
5. **render(data, err)** — sub-funções ≤ 20 linhas, uma por secção visual.
6. **Bootstrap** — `initWithRetry` (§9), nunca `waitForBPC` directo.

**Contrato do objecto de view** (o que `adapter` devolve e `render` consome).
Forma mínima comum a todos os cards — cada domínio acrescenta o seu bloco:

```js
{
  state:   'ok' | 'warn' | 'crit',   // estado agregado do card (via BPC.state.worst)
  updated: <epoch ms>,               // timestamp da recolha
  stale:   <bool>,                   // algum host acima de staleThresholdSec?
  counts:  { total, ok, warn, crit, down },  // contagem de hosts/items
  hasData: <bool>,                   // false → render mostra estado vazio, nao erro
  signals: [                         // "golden signals" do dominio (0..n)
    { key, label, value, unit, state, spark? }
  ],
  // + bloco especifico do dominio (ex.: storage: {totalB, freeB, worstDs})
}
```

Regra: `render` **nunca** recalcula estado — lê `data.state`/`signals[].state`
já calculados pelo adapter via `BPC.state`. Se `getData` falhar, o bootstrap
chama `render(null, errorMsg)` (§9), nunca deixa o painel em branco.

## 6. Modelo de estado

- Estados: `ok` (#22C55E) · `warn` (#d29922) · `crit` (#f85149). Cor sempre via
  `BPC.state.color(state)` / `BPC.THEME`, nunca hex no card.
- Cada host/item → estado por thresholds documentados em `CFG.thresholds`.
- Agregação **bottom-up**: host → domínio (N2) → card N1. O pior estado
  propaga. Implementado no painel utils, consumido por todos.
- Regra: nenhuma lógica de estado hardcoded num card — sempre via utils + CFG.

### 6.1 Esquema do estado (forma única)

A API `window.BPC.state` (exposta pelo utils, §5.1) é a **única** fonte de
cálculo de estado. Esquema:

```js
// classifica UMA métrica contra um threshold { warn, crit }
BPC.state.metric(value, thr, dir = 'above')
  // dir 'above': value>=crit→'crit', >=warn→'warn', senão 'ok'
  // dir 'below': value<=crit→'crit', <=warn→'warn', senão 'ok' (ex.: espaco livre)
  // → 'ok' | 'warn' | 'crit'

// pior de uma lista de estados (precedência crit > warn > ok)
BPC.state.worst(['ok','warn','crit', ...])  // → 'crit'

// estado de um host a partir das suas métricas já classificadas
BPC.state.host({ cpu:'ok', ram:'warn', ... })  // → worst(...) ; 'down' se inalcançável

BPC.state.color('warn')  // → '#d29922'
```

Precedência fixa: `down`/`crit` > `warn` > `ok`. Host **stale** (sem dados há
mais de `CFG.behaviour.staleThresholdSec`) conta como `warn` por defeito (ou
`down` se o domínio o definir em `CFG.thresholds.staleAs`).

### 6.2 Catálogo de thresholds por domínio (única fonte de verdade)

Valores canónicos. Cada `CFG.thresholds` do card **copia daqui** — não inventa.
Mudança de threshold faz-se primeiro nesta tabela, depois no(s) card(s).
(Base inicial confirmada no card de referência Servidores Virtuais; restantes a
ratificar ao sondar cada domínio — marcar ⚠ enquanto provisório.)

| Métrica | warn | crit | dir | Domínios |
|---|---|---|---|---|
| CPU % | 70 | 90 | above | físicos, virtuais |
| RAM % | 70 | 85 | above | físicos, virtuais |
| Armazenamento/uso % | 75 | 90 | above | virtuais, armazenamento |
| Espaço livre % | 20 | 10 | below | armazenamento, bases-dados |
| Balloon (ratio) | 0.1 | 0.1 | above | virtuais (VMware) |
| Swap (ratio) | 0.1 | 0.5 | above | virtuais |
| Latência storage (ms) ⚠ | 5 | 20 | above | armazenamento |
| Disponibilidade ICMP (perda %) ⚠ | 1 | 10 | above | rede, agências |
| Severidade trigger → estado | sev≥`warn` | sev≥`critPriority` (4) | — | todos (`severityToState`) |

Mapeamento severidade Zabbix → estado: `0-1`→ok, `2-3`→warn, `4-5`→crit
(via `BPC_SHARED.severityToState`, `CFG.thresholds.critPriority` ajustável).

## 7. Contrato de navegação

Drill-down determinístico (sem links ad-hoc). Toda a construção de URL passa por
`BPC.nav` / `CFG.nav.basePath` (`/d/`) — nunca `/d/` hardcoded no render.

| Salto | Origem (clique) | Destino | URL |
|---|---|---|---|
| N1 → N2 | card de domínio inteiro | dashboard N2 | `/d/<dashUidN2>` (+ opcional `var-grupo=<groupId âncora>`) |
| N2 → N3 | linha de host na tabela | dashboard N3 | `/d/<dashUidN3>?var-hostid=<id>` |
| N3 → N2 | breadcrumb / botão voltar | dashboard N2 | `/d/<dashUidN2>` |

Regras:
- Cada card N1 conhece o `dashUid` do seu N2 em `CFG.id.dashUid`. O card inteiro
  é clicável (não um botão escondido).
- Cada N3 conhece o `dashUid` do seu N2 (volta) em `CFG.nav.parentUid`.
- **Variável de host canónica: `var-hostid`** (o `hostid` Zabbix). Não usar
  nome de host nem outras variáveis para o salto N2→N3.
- N2 lê `var-hostid` do URL; se ausente, mostra a vista agregada do domínio
  (nunca erro/branco).
- `dashUid` tem de ser um UID real (não `PLACEHOLDER_*`); validar no DoD (§10.1)
  antes de marcar o domínio como pronto.

## 8. Fluxo de trabalho de desenvolvimento

```
1. Editar o .js local
2. node --check ficheiro.js
3. Push do painel para o Grafana (pede confirmação — escrita partilhada)
4. Testar no browser (screenshot + console, esperar 15-20s pelos dados)
5. Aprovado → git commit | Reprovado → corrigir .js e repetir do passo 2
```

**Construção incremental, painel a painel** (não tudo de uma vez):
utils primeiro → cada painel de conteúdo → testar → aprovar → próximo.
Layout final (gridPos lado a lado) só depois de todos os painéis aprovados.

**Manifesto** (`manifest.json` por dashboard) liga ficheiro↔painel:
```json
{ "dashboardUid": "...", "panels": [
  { "file": "utils.js", "id": 1, "role": "utils",   "title": "..." },
  { "file": "l2-...js", "id": 3, "role": "content", "title": "..." }
] }
```
`id` = `null` até ao 1º push (atribuído pelo Grafana).

## 9. Padrões de código obrigatórios

**Bootstrap com retry** (todo painel de conteúdo) — evita que uma corrida de
carregamento derrube o dashboard inteiro:
```js
function start(rpc) { /* lógica */ }
function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return }
  if (attempt > 50) { console.error('[BPC] <nome>: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}
initWithRetry()
```

**Query âncora** — o `target` Zabbix do painel BT nunca tem `group`/`host`/
`item` vazios (0 linhas = render nunca acontece). Apontar para algo real.

**Reutilização** — nunca redefinir `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils`
localmente; nunca repetir CSS `.bpc-*` (vive no utils); gauges via
`BPC_CHARTS.gaugeSemi()`.

**Limites** — funções ≤ 20 linhas; ficheiros < 500 linhas.

## 10. Estratégia de teste

| Quando | Como |
|---|---|
| Antes de codar um painel | sondar a API (`hostgroup.get`/`item.get`) — confirmar que dados existem no grupo/host |
| Antes de push | `node --check` |
| Após push | screenshot + `read_console_messages` (zero erros) + esperar dados |
| Render vazio | inspeccionar DOM (`dt-row` preenchido?) + verificar query âncora |
| Aprovação | estado correcto vs realidade Zabbix; navegação drill-down funciona |

### 10.2 Procedimento de sondagem (antes de codar qualquer painel)

Confirmar sempre que os dados existem **antes** de escrever o card. Há duas vias:

**Via A — API Zabbix directa** (mais rápida para inventário/items). Tokens no
ficheiro `C:\Repositorios\zabbix\tok3n` (nunca colar em chat/commit):

| Zabbix | Endpoint | Usar para |
|---|---|---|
| Infra | `http://10.10.126.22/zabbix/api_jsonrpc.php` | físicos, virtuais, armazenamento, segurança, bases-dados, apis, serviços |
| Network | `http://10.10.233.140/zabbix/api_jsonrpc.php` | rede, agências |

Header: `Authorization: Bearer <token>`, `Content-Type: application/json-rpc`.
Métodos típicos:
```
apiinfo.version            → smoke test (não precisa auth)
hostgroup.get {output:[groupid,name], selectHosts:count}   → inventário
host.get      {groupids:[<id>], output:[hostid,name]}       → hosts do grupo
item.get      {groupids:[<id>], search:{name:'CPU'}, output:[name,key_,lastvalue]}  → confirmar items/thresholds
```

**Via B — proxy Grafana** (o que os painéis usam em runtime, valida o caminho
real): `POST /api/datasources/uid/<dsUid>/resources/zabbix-api` com um token
**Grafana** (service account `sa-1-dev`). `dsUid`: `3_KgG43nz` (infra) ou o UID
de network (a confirmar com `GET /api/datasources`).

Saída esperada: registar no `mapa-host-groups.md` / `CFG.itemNames*` os nomes
de item exactos antes de construir. Item inexistente = render vazio (§7 âncora).

### 10.1 Definição de pronto (DoD) — critério de aceitação

Uma unidade só conta como ☑ na §12 quando cumpre o seu DoD. Sem isto, "pronto"
é subjectivo.

**Painel** (pronto):
- [ ] `node --check` passa; ficheiro < 500 linhas; funções ≤ 20 linhas
- [ ] usa `initWithRetry`; não redefine `BPC_SHARED`/`BPC_CHARTS`/`THEME`
- [ ] CFG aninhado; sem strings/cores/thresholds hardcoded (lê do catálogo §6.2)
- [ ] `target` âncora aponta para host/item real; render não fica em branco
- [ ] testado no Grafana (≥15-20s), estado bate certo com a realidade Zabbix
- [ ] `id` registado no `manifest.json`

**Dashboard N2/N3** (pronto): todos os painéis prontos + 1 painel `utils` +
layout final aplicado + `dashboard-snapshot.json` gravado (fecho, CLAUDE.md §4)
+ navegação de entrada/saída testada (N1→N2→N3) + commit.

**Domínio** (pronto): N2 pronto **e** N3 pronto **e** card N1 do domínio liga ao
N2 (`dashUid` real) **e** drill-down N1→N2→N3→volta verificado ponta-a-ponta.

## 11. Operação e manutenção

- **Dois Zabbix, dois datasources** (mesmo Grafana `http://10.10.126.22:3000`):

  | Zabbix | Servidor API | Datasource Grafana | Domínios |
  |---|---|---|---|
  | Infra | `10.10.126.22/zabbix` (v7.4.8) | `3_KgG43nz` | físicos, virtuais, armazenamento, segurança, bases-dados, apis, serviços-negócio |
  | Network | `10.10.233.140/zabbix` | `ffo8sp8zllog0e` ("BPC-NETWORK") | **rede**, **agências** |

  Cada painel/manifesto declara o datasource correcto. Um card de Rede aponta
  para o datasource de network, não para `3_KgG43nz`. UID Grafana de network
  confirma-se com `GET /api/datasources` (token Grafana) ao iniciar a Rede.
  Procedimento de sondagem completo em §10.2.
- **Coordenadas Grafana:** pasta canónica `efpbu5tvrhce8a` ("dashboards v5");
  arquivo `efp8usobcfeo0d` ("99 - Arquivo v5 (legado)"); service account API
  `sa-1-dev`.
- **Credenciais** em `C:\Repositorios\zabbix\tok3n` (nunca colar em
  chat/commit): tokens da **API Zabbix directa** (infra, network, network2). O
  token **Grafana** (SA `sa-1-dev`, para `GET /api/datasources` e push de
  dashboards) é separado — pedir/renovar quando necessário.
- **Referência (não tocar):** `d01-v1` (N1), `5b6b0e85-…` (N2 virtuais),
  `ad040c90-…` (N3 detalhe VM) — no arquivo, só consulta/salvamento.
- **Versionamento Grafana:** cada push cria versão; revertível em Version
  history. O repo é a fonte de verdade do código.
- **Alterações partilhadas:** qualquer escrita no Grafana partilhado pede
  confirmação explícita.

## 12. Roadmap e checklist (preencher conforme avança)

Estado: ☐ Pendente · ◐ Em curso · ☑ Concluído

| Fase | Tarefa | Estado | Notas |
|---|---|---|---|
| **0 · Fundação** | Decisões de arquitectura travadas | ☑ | A–E + 4 forks |
| | Blueprint + mapa host groups escritos | ☑ | docs commitados |
| | Limpeza Grafana (arquivo + pasta limpa) | ☑ | `efpbu5tvrhce8a` |
| | Inventário host groups (API) | ☑ | 74 grupos |
| | Este documento de engenharia | ☑ | contratos §5.1/5.2/6/10.1 escritos |
| | Contrato do painel utils especificado | ☑ | §5.1 |
| | Contrato de dados card especificado | ☑ | §5.2 + framework-de-criacao-de-cards.md |
| | Modelo de estado + catálogo thresholds | ☑ | §6.1 / §6.2 |
| | Contrato de navegação especificado | ☑ | §7 |
| | Definição de pronto (DoD) | ☑ | §10.1 |
| | Regra de ancoragem + nav N1→N2 especificadas | ☑ | §3 / §7 |
| | Procedimento de sondagem documentado | ☑ | §10.2 (2 Zabbix) |
| | Inventário network (Rede/Agências) | ☑ | grupos 24-35, server 10.10.233.140 |
| | Painel utils canónico (`utils.js`) implementado | ☐ | adoptar header v8 e conformar |
| | Confirmar UID datasource Grafana de network | ☑ | `ffo8sp8zllog0e` (BPC-NETWORK) |
| **1 · Servidores Físicos** | Sondar items grupo 603 | ☐ | |
| | N2 (utils + KPI + tabela + triggers) | ☐ | |
| | N3 (header + séries + timeline + eventos) | ☐ | |
| | Navegação ligada + testado + commit | ☐ | |
| **2 · Armazenamento** | N2 + N3 + nav + teste | ☐ | grupos 602/605 |
| **3 · Servidores Virtuais** | Conformar referência ao padrão | ☐ | já existe, conformar |
| **4 · Rede** | N2 + N3 (DC/Edifícios/WAN) | ☐ | grupos 26/27/28/29/35 (network) |
| **5 · Segurança** | N2 + N3 | ☐ | grupo 656 |
| **6 · Bases de Dados** | N2 + N3 | ☐ | grupo 355 |
| **7 · APIs & Serviços** | N2 + N3 | ☐ | grupos 663/345 |
| **8 · Serviços de Negócio** | N2 + N3 (eBankit) | ☐ | grupo 391 |
| **9 · Agências** | N2 (geomap) + N3 | ☐ | grupos 24/25 (network) |
| **10 · N1 Visão Geral** | Finalizar cards (todos os N2 UID) | ☐ | depende de 1–9 |
| **11 · Fase 2** | N0 Executivo/SLA | ☐ | adiado |

### Acções Zabbix (lado do utilizador)

| Prioridade | Acção | Estado |
|---|---|---|
| P1 | Esquema de tags canónico (`dominio`/`ambiente`/`criticidade`) | ☐ |
| P2 | Corrigir espaço duplo no grupo 602 | ☐ |
| P2 | Uniformizar separador de naming dos grupos | ☐ |
| P2 | Fundir `412 Git lab` + `416 Gitlab` | ☐ |
| P3 | Classificar 25 hosts em `A-CLASSIFICAR` (480) | ☐ |
| P3 | Rever `Novos_Inventario` (632, 21 hosts) | ☐ |
