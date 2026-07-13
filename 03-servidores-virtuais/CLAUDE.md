# CLAUDE.md — Servidores Virtuais
> Guia de arquitectura, políticas e decisões do sistema de observabilidade de VMs BPC NOC.
> Este ficheiro é a fonte de verdade para qualquer IA ou pessoa que trabalhe nesta pasta,
> **excepto a tabela de thresholds da secção 7**, onde `documentacao/engenharia-do-sistema.md`
> §6.2 é a única fonte de verdade (decisão do utilizador, 2026-07-02, após auditoria
> completa de lógica de estado ter encontrado desvio entre as duas tabelas).
> Última revisão: 2026-07-10 (Versão A — fontes maiores + títulos de row — ver §13.7)

---

## 1. Contexto do sistema

Este directório contém os painéis do sistema de observabilidade de **Servidores Virtuais (VMs)** do BPC NOC.

- **Plataforma:** Grafana + Zabbix, painéis tipo "Dynamic Text" (plugin `marcusolsson-dynamictext-panel` v6.2.0)
- **Fonte de dados:** API Zabbix via proxy Grafana (datasource UID `3_KgG43nz`)
- **Proxy URL:** `http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api`
- **Grupo de VMs (Zabbix):** groupId `609`
- **Grupo ESXi (Zabbix):** groupId `603`

Os ficheiros `.js` são scripts injectados no painel Dynamic Text do Grafana. Cada ficheiro é autónomo — não há bundler, não há imports. Tudo resolve em tempo de execução no browser.

---

## 2. Mapa de ficheiros e cobertura de níveis

### Ficheiros ACTIVOS (em produção ou prontos para produção)

**Runtime L3 partilhado:** `../03-servidores-virtuais/_l3-base.js` é a **fonte canónica** do boilerplate copiado para cada painel L3 (paleta §8, `fetchWithRetry`/`zbx` com AbortSignal, `U.esc`/`renderErro`, e o guard anti-double-fire §4C.7 — blocos A/B/C). Não é implantado; melhorias fazem-se aqui primeiro e propagam-se às cópias (mesma filosofia do `_comum/utils.js`).

| Ficheiro | Nível | Painel Grafana | Estado |
|---|---|---|---|
| `l2-kpi-card-v5.js` | L2 | N2 · VMs · KPI Strip | ✅ Activo (BPC Runtime) |
| `l2-tabela.js` | L2 | N2 · VMs · Tabela de VMs (grupo 609) | ✅ Activo (v3.1) — drill "Ver Detalhe" via `CFG.n3DashUid` (sem UID hardcoded) |
| `l2-triggers.js` | L2 | N2 · VMs · Top Triggers | ✅ Activo (v1.0) |
| `l3-vm-header.js` | L3 | N3 · VM Detalhe · Header | ✅ Activo — guard §4C.7 |
| `l3-vm-kpi.js` | L3 | N3 · VM Detalhe · KPI Golden Signals | ✅ Activo (v18) — guard §4C.7 |
| `l3-cpu-kpi.js` | L3 | N3 · VM Detalhe · CPU Detalhado | ✅ Activo (v2) — guard §4C.7 |
| `l3-memoria-kpi.js` | L3 | N3 · VM Detalhe · Memória Detalhada | ✅ Activo (v1.0) — guard §4C.7 (referência) |
| `l3-discos-kpi.js` | L3 | N3 · VM Detalhe · Disco & I/O | ✅ Activo (v1) — guard §4C.7 |
| `l3-rede.js` | L3 | N3 · VM Detalhe · Rede | ✅ Activo (v1) — guard §4C.7 + Poll |
| `l3-servicos.js` | L3 | N3 · VM Detalhe · Serviços | ✅ Activo (v1.1) — guard §4C.7; mostra identidade de negócio (tags) mesmo sem serviços Windows discovered |
| `l3-triggers.js` | L3/L4 | N3 · VM Detalhe · Triggers — **só Versão B** | ✅ Activo (v1.1) — guard §4C.7. Versão A trocou para nativo (`n3-vm-triggers.json`, §13.6); ficheiro não apagado, continua a servir a Versão B |
| `n3-vm-triggers.json` | L3/L4 | N3 · VM Detalhe · Triggers — **Versão A** | ✅ Activo (2026-07-10) — painel nativo `alexanderzobnin-zabbix-triggers-panel`, `group:$groupid`/`host:$hostid`, ver §13.6 |
| `l3-ficha-servidor.js` | L3 | N3 · VM Detalhe · Ficha do Servidor | ✅ Activo (v1.0) — guard §4C.7 |

> **`l2-correlacionador-de-eventos.js`** — arquivado em `n2/arquivo-n2/` (2026-07-09). Estava fora de qualquer manifest; a vista de triggers do grupo 609 é servida pelo `l2-triggers.js`. Reversível — ver `n2/arquivo-n2/README.md`.

### Ficheiros OBSOLETOS — movidos para `../arquivo/servidores-virtuais-olds/` ✅

| Ficheiro | Razão |
|---|---|
| `l3-vm-kpi-v2.js` | Versão v11 — substituída pelo `l3-vm-kpi.js` v16. Mesmo `rootId: 'bt-kpi-gs'` — colisão de DOM garantida se carregados em simultâneo. |
| `l3-card1-srv-virt.js` … `l3-card6-srv-virt.js` | Protótipos com `HOSTID = '10543'` hardcoded. Não parametrizáveis. |
| `l3-rows-3-4-5.js` | Protótipo com `HOSTID = '10543'` hardcoded. Não parametrizável. |

**Estado:** os 8 ficheiros acima já foram movidos para `../arquivo/servidores-virtuais-olds/` (wave 1).

---

## 3. Arquitectura dos painéis

### 3.1 Decisão: BPC Runtime vs Standalone

**Decisão tomada: Standalone para todo o desenvolvimento novo.**

Esta decisão é baseada numa análise técnica dos dois padrões no contexto concreto do BPC NOC.

#### BPC Runtime — análise

O BPC Runtime (`waitForBPC`, `BPC.scheduler`, `BPC.rpc`, `BPC.bus`, `BPC.engine`) é carregado pelo `header-global.js` e oferece:
- Circuit breaker: evita avalanche de erros para o Zabbix
- Cache LRU: reutiliza resultados recentes entre painéis
- Retry com backoff exponencial
- Scheduler centralizado: evita `setInterval` soltos

No entanto tem três limitações críticas para o nosso padrão de uso:

**Limitação 1 — API restrita.** O `rpc()` wrapper do BPC Runtime **não permite** `host.get` nem `hostgroup.get`. Qualquer painel que precise de resolver nomes de host, grupos, ou macros de host (incluindo thresholds do Zabbix — ver secção 4A) fica bloqueado. A lista branca do `rpc()` é: `item.get`, `trigger.get`, `history.get`, `event.get`, `problem.get`.

**Limitação 2 — Não é reactivo a variáveis Grafana.** O Dynamic Text re-executa o script completo quando o utilizador muda uma variável (ex: `var-hostid`). O BPC Runtime usa um scheduler interno que não sabe desta mudança — continua a mostrar dados do host anterior até ao próximo ciclo do scheduler.

**Limitação 3 — Dependência de ordem de carregamento.** `waitForBPC()` é uma fila de callbacks que espera o header inicializar. Em caso de falha do header, todos os painéis ficam presos sem estado de erro visível.

#### Standalone — análise

O padrão Standalone (fetch directo ao proxy Zabbix, sem dependência de runtime) tem:
- Acesso a qualquer método da API Zabbix (incluindo `host.get`, `usermacro.get`, `hostgroup.get`)
- Reactivo a variáveis Grafana: o script re-executa limpo, sem estado residual
- Debugável: toda a lógica está no próprio ficheiro
- O `l3-vm-kpi.js` v16 já resolveu o principal problema do padrão Standalone (double-fire do BT)

As vantagens do BPC Runtime (circuit breaker, cache, retry) **podem ser implementadas localmente** num módulo Standalone, sem as limitações acima. O v16 já demonstra que um painel Standalone é robusto.

#### Regra de transição

- **Todo o desenvolvimento novo** (L2 e L3) usa o padrão Standalone.
- **Painéis L2 existentes** (`l2-kpi-card-v5.js`, `l2-correlacionador-de-eventos.js`) mantêm-se com BPC Runtime até uma reescrita ser justificada por requisitos novos — não reescrever só para mudar o padrão.
- **Proibido** criar novos painéis com dependência de `waitForBPC()`.

### 3.2 Dois padrões presentes no código (legado vs novo)

**Padrão A — BPC Runtime** (ficheiros L2 existentes — legado)

```javascript
waitForBPC(function(rpc) {
  BPC.utils.waitForElement(CFG.elementId, function(el) {
    // fetch via rpc() — apenas item.get, trigger.get, history.get
    // BPC.utils.startRefresh(el, load, CFG.refreshMs)
  });
});
```

**Padrão B — Standalone** (ficheiros L3 e todo o novo desenvolvimento)

```javascript
(function () {
  'use strict'; // ou omitir em ES5 strict

  var CFG = { ... };

  // Protecção contra double-fire do BT (ver secção 4.7)
  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;

  // ... lógica de fetch, render, bootstrap
}());
```

**Regra:** não misturar os dois padrões no mesmo ficheiro.

### 3.3 Estrutura interna obrigatória de cada ficheiro

Todos os ficheiros devem seguir esta sequência de blocos, numerados e comentados:

```
[1] CFG          — configuração editável (proxy, rootId, thresholds, groupId)
[2] UTILS        — helpers puros sem efeitos laterais
[3] RESOLVER     — lógica de extracção/normalização de dados
[4] CSS          — estilos em string, injectados via innerHTML
[5] SVG/TEMPLATES — componentes de renderização
[6] CARDS/RENDER — montagem do HTML final
[7] API/FETCH    — chamadas ao Zabbix
[8] BOOTSTRAP    — ponto de entrada, leitura de URL, gestão de ciclo de vida
```

O CFG deve ser o único bloco que um técnico NOC precisa editar.

### 3.4 Versão ES obrigatória por tipo de ficheiro

| Contexto | Versão JS | Razão |
|---|---|---|
| Ficheiros L3 (Dynamic Text standalone) | **ES5 obrigatório** — `var`, `function`, `for` | O Dynamic Text executa o script em `eval()` — ES6+ é **proibido**: causa erros silenciosos e comportamento indefinido entre versões do plugin |
| Ficheiros L2 (BPC Runtime, IIFE normal) | **ES6+** permitido | Correm no contexto normal do browser, não em `eval()` |

**Proibido em ficheiros L3:** `const`, `let`, arrow functions (`=>`), template literals (`` ` ``), `class`, `...spread`, destructuring, `import/export`.

O `l2-correlacionador-de-eventos.js` foi convertido para ES5 (sem `const`/`let`/arrow/template-literals) na wave 2 — agora é seguro no contexto Dynamic Text `eval()`.

---

## 4A. Zabbix como fonte de verdade para thresholds

**Princípio:** O Zabbix avalia thresholds internamente e expõe o resultado via triggers com severidade. O Grafana deve consumir esse resultado — não reimplementar a avaliação.

### A distinção fundamental

As macros (`{$CPU.UTIL.CRIT}`) são os **inputs** da expressão de trigger no Zabbix. A severidade do trigger é o **output** — o Zabbix já fez a comparação. Ler macros no Grafana para comparar com o valor do item é duplicar a lógica do Zabbix em JS, o que viola o princípio de fonte de verdade.

```
ERRADO:  Grafana lê macro {$CPU.UTIL.CRIT} = 85
         Grafana lê item cpu.util = 87
         Grafana compara 87 > 85 → vermelho     ← duplicou lógica do Zabbix

CORRECTO: Zabbix avaliou 87 > 85 → trigger HIGH
          Grafana lê trigger severity = HIGH → vermelho   ← consumiu decisão do Zabbix
```

### Fonte de estado: trigger severity + tags

Para colorir cards e indicadores de saúde, consultar `problem.get` ou `trigger.get` filtrado por tags de componente. As tags em triggers Zabbix (`component:cpu`, `scope:performance`, etc.) permitem isolar problemas por área sem comparar números.

```javascript
// Exemplos de consulta por componente via tags
// CPU com problema activo neste host?
{ method: 'problem.get', params: {
    hostids: [hostid],
    tags: [{ tag: 'component', value: 'cpu', operator: '0' }],
    output: ['severity', 'name', 'clock'],
    sortfield: 'severity', sortorder: 'DESC'
}}

// Disco?
tags: [{ tag: 'component', value: 'storage' }]

// Memória?
tags: [{ tag: 'component', value: 'memory' }]
```

Mapeamento de severidade para cor (usar `CFG.severities` já definido no l3-triggers.js):

| Severity Zabbix | Valor | Cor BPC |
|---|---|---|
| Not classified | 0 | `sub` (cinzento) |
| Information | 1 | `info` (azul) |
| Warning | 2 | `warn` (âmbar) |
| Average | 3 | `warn` (âmbar) |
| High | 4 | `crit` (vermelho) |
| Disaster | 5 | `crit` (vermelho) |

### Fonte de valor numérico: item.get

Para mostrar o número actual (ex: CPU = 73%) usar `item.get` + `history.get` como já se faz. O número é apresentação — a cor/estado vem do trigger.

### Quando é que macros fazem sentido

Apenas em dois casos:
1. **Linha de threshold numa sparkline** — para desenhar a linha de aviso/crítico visualmente numa série temporal, é necessário o número concreto.
2. **Ausência total de trigger** — se uma métrica não tem trigger configurado no Zabbix (lacuna de monitorização), usar valor CFG como fallback de último recurso e documentar a lacuna.

Exemplo de `usermacro.get` para obter o threshold e desenhar a linha na sparkline:

```javascript
// Obter macros do host para threshold visual na sparkline
function fetchMacros(hostid, signal) {
  return zabbixPost({
    method: 'usermacro.get',
    params: {
      hostids: [hostid],
      output: ['macro', 'value']
    }
  }, signal).then(function (macros) {
    var map = {};
    macros.forEach(function (m) { map[m.macro] = parseFloat(m.value); });
    return {
      cpuWarn: map['{$CPU.UTIL.WARN}'] || CFG.thresholds.cpuWarn,
      cpuCrit: map['{$CPU.UTIL.CRIT}'] || CFG.thresholds.cpuCrit,
      memCrit: map['{$MEM.UTIL.MAX}']  || CFG.thresholds.ramCrit,
      diskWarn: map['{$VFS.FS.PUSED.MAX.WARN}'] || CFG.thresholds.diskWarn,
      diskCrit: map['{$VFS.FS.PUSED.MAX.CRIT}'] || CFG.thresholds.diskCrit,
    };
  });
}
// Uso: chamar em Promise.all junto com os items, passar resultado ao render da sparkline.
// Fora deste caso específico, não chamar usermacro.get.
```

Fora destes casos, **não chamar `usermacro.get`**.

### Fonte de agrupamento: hostgroups

`hostgroup.get` e filtros por `groupids` (609 para VMs, 603 para ESXi) são a forma correcta de limitar o âmbito das consultas. Não hardcode listas de hostnames.

### Política

1. **Estado/cor** de cards → trigger severity via `problem.get` ou `trigger.get` + tags de componente.
2. **Valor numérico** → `item.get` + `history.get`.
3. **Linha de threshold em gráfico** → `usermacro.get` (único caso justificado).
4. **Âmbito de consulta** → `groupids` via `CFG.groupId`.
5. `CFG.thresholds` existe **apenas** como fallback de emergência quando não há trigger configurado. Documentar no CFG com o comentário `// FALLBACK — threshold não configurado no Zabbix para este item`.

---

## 4B. Política de zero hardcoding — tudo no CFG

**Princípio:** qualquer valor que possa mudar entre ambientes (IPs, IDs, limites, URLs, expressões regulares) deve estar no bloco `CFG`. Um técnico que precise de adaptar um painel deve editar **apenas o CFG**.

### Auditoria — itens que devem mover para CFG

Os seguintes valores estão presentemente hardcoded fora do CFG e violam esta política:

**1. UID da datasource Zabbix**
Actualmente embutido na string da proxy URL em todos os ficheiros:
```javascript
// PROIBIDO — UID embutido na string
proxy: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api'
```
Solução: separar e construir a URL:
```javascript
var CFG = {
  grafanaUrl:    'http://10.10.126.22:3000',
  datasourceUid: '3_KgG43nz',
  // proxy construído em runtime, não editável:
};
// No bootstrap:
var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';
```
Se o datasource for substituído, só `CFG.datasourceUid` muda.

**2. UIDs dos dashboards Grafana (links de navegação)**
Em `l2-kpi-card-v5.js`, os links para outros dashboards usam `PLACEHOLDER_CPU`, `PLACEHOLDER_RAM`, etc. Devem ser preenchidos com os UIDs reais e incluídos no CFG:
```javascript
grafanaDash: {
  vmDetail:  '/d/UID_REAL_AQUI/vm-detalhe',   // D5-Detalhe-VM
  vmCpu:     '/d/UID_REAL_AQUI/vm-cpu-detail',
  vmRam:     '/d/UID_REAL_AQUI/vm-ram-detail',
  problems:  '/d/UID_REAL_AQUI/problemas',
  storage:   '/d/UID_REAL_AQUI/storage',
},
```
Para obter o UID real: abrir o dashboard no Grafana → URL contém `/d/XXXXXX/nome` — o `XXXXXX` é o UID.

**3. Limites de resultados das chamadas API**
Presentemente espalhados nas chamadas fetch (`limit: 50000`, `limit: 10000`, `limit: 20000`):
```javascript
// PROIBIDO — limit hardcoded no fetch
params: { groupids: [CFG.groupId], limit: 50000 }

// CORRECTO — limit no CFG
var CFG = {
  apiLimits: { items: 50000, history: 10000, triggers: 20000 }
};
params: { groupids: [CFG.groupId], limit: CFG.apiLimits.items }
```

**4. Regex de grupos a ignorar**
Em `l3-vm-header.js`, a lista de grupos a esconder no header da VM está hardcoded:
```javascript
// PROIBIDO — regex hardcoded no código
var IGNORE = /^(Linux Servers|Windows Servers|Discovered|Virtual machines|Zabbix)/i;

// CORRECTO — lista no CFG
var CFG = {
  groupsIgnore: ['Linux Servers', 'Windows Servers', 'Discovered', 'Virtual machines', 'Zabbix'],
  groupsMax:    2,
};
// No código:
var IGNORE = new RegExp('^(' + CFG.groupsIgnore.join('|') + ')', 'i');
```

**5. Janelas de tempo históricas**
Verificar que todas as janelas estão no CFG — não hardcoded em `Date.now() / 1000 - 21600`:
```javascript
// CORRECTO
var CFG = {
  historyWindowSecs: 21600,  // 6h de histórico para sparklines e triggers recentes
  sparkWindowSecs:   21600,
  recentWindowSecs:  21600,  // em l3-triggers.js
};
```

### Template CFG mínimo para novos painéis

Copiar e adaptar para qualquer novo painel:

```javascript
var CFG = {
  // ── Identificação ──────────────────────────────────────────────────────────
  rootId:       'bt-NOME-PAINEL',        // único por painel — nunca reutilizar
  version:      'v1.0',

  // ── Ligação Zabbix/Grafana ─────────────────────────────────────────────────
  grafanaUrl:    'http://10.10.126.22:3000',
  datasourceUid: '3_KgG43nz',
  // proxy construído no bootstrap: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'

  // ── Configuração do painel ─────────────────────────────────────────────────
  refreshMs:    60000,            // intervalo de refresh automático
  debug:        false,            // true só durante desenvolvimento

  // ── Thresholds (fallback — o primário vem do Zabbix via usermacro.get) ────
  // ATENÇÃO: ajustar aqui SÓ se os valores Zabbix não estiverem disponíveis.
  // A fonte de verdade é o Zabbix.
  thresholds: {
    cpuWarn:    70,
    cpuCrit:    90,
    ramWarn:    70,
    ramCrit:    85,
    diskWarn:   75,
    diskCrit:   90,
  },

  // ── Limites de API ─────────────────────────────────────────────────────────
  apiLimits: {
    items:    50000,
    history:  10000,
    triggers: 20000,
  },

  // ── Janelas de tempo ───────────────────────────────────────────────────────
  historyWindowSecs:  21600,     // 6h

  // ── Stale detection ────────────────────────────────────────────────────────
  maxAgeSec: {
    agent:  7200,    // 2h — intervalo real ~30min; margem para delays
    vmware: 600,     // 10min — poller VMware mais frequente
    icmp:   7200,
  },

  // ── Protecção double-fire BT ───────────────────────────────────────────────
  abortDelayMs: 80,  // absorve o double-fire do Dynamic Text v6.2.0
};
```

---

## 4C. Políticas de código

### 4C.1 Proxy URL

A URL do proxy deve ser **construída a partir de `CFG.grafanaUrl` + `CFG.datasourceUid`**, nunca hardcoded:

```javascript
// CORRECTO
var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

// PROIBIDO
fetch('http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api', ...)
```

### 4C.2 HOSTID hardcoded

**Proibido em qualquer ficheiro activo.** Ficheiros com `HOSTID = '10543'` são protótipos e vão para `../arquivo/`. Painéis activos lêem o host de `var-hostid` no URL ou de `CFG.groupId` para painéis de grupo.

### 4C.3 Debug em produção

- `debug: false` é o valor padrão em produção.
- `debug: true` só durante desenvolvimento activo — nunca fazer commit com `debug: true`.
- **Correcção pendente:** `l3-triggers.js` e `l3-rede.js` têm `debug: true` — alterar para `false`.

### 4C.4 Logs de diagnóstico temporários

Blocos de diagnóstico marcados com "remover após análise" devem ser removidos antes de considerar o ficheiro estável. Actualmente presente em `l3-vm-kpi.js` (v16), bloco "DIAGNÓSTICO v15d" com `console.group/groupEnd` — **remover**.

### 4C.5 Modo DEMO

O modo DEMO foi **intencionalmente removido** do `l2-kpi-card-v5.js` (v4.3). Dados de demo em ecrãs de NOC criam ambiguidade perigosa.

**Política:** nenhum novo ficheiro deve implementar modo DEMO. Em caso de falha, mostrar um card de erro explícito com causa e acção correctiva.

### 4C.6 Stale detection

Todos os painéis devem verificar a age dos items antes de os apresentar como dados válidos.

Valores de `maxAgeSec` validados para o ambiente BPC:

| Fonte | maxAgeSec | Razão |
|---|---|---|
| Agente Zabbix (perf counters Windows) | `7200` (2h) | Intervalo real dos templates é ~30min; 2h dá margem para delays |
| VMware poller (valores dinâmicos) | `600` (10min) | Poller centralizado, mais frequente |
| VMware poller (strings estáticas: hypervisor, cluster, datacenter) | não filtrar por age | Valores imutáveis — o lastclock pode ser antigo mas o valor é válido |
| ICMP | `7200` (2h) | Mesmo intervalo que agente |

**Atenção:** `l3-vm-kpi-v2.js` (v11, obsoleto) tinha `maxAgeSec.agent: 300` — valor errado para este ambiente, causava "agente stale" em VMs completamente saudáveis. O v16 corrigiu para 7200.

### 4C.7 Gestão de race conditions em painéis L3 — padrão obrigatório

O Dynamic Text v6.2.0 dispara o script **duas vezes** por cada mudança de variável (double-fire). O padrão obrigatório para painéis L3 que fazem fetch é:

> **Estado (2026-07-09):** o guard está aplicado aos **9 painéis L3** (antes só em
> `l3-vm-kpi.js` e `l3-memoria-kpi.js`). Os blocos canónicos vivem em `_l3-base.js`
> (A = vars de módulo `_sig`/`_myToken`/`_isCurrent`; B = `signal || _sig` no
> `fetchWithRetry`; C = namespace + AbortController + token no bootstrap). Cada
> escrita ao DOM é guardada com `if (!_isCurrent()) return;` e cada `.catch` ignora
> `AbortError` + execuções obsoletas.

```javascript
// Namespace estável em window (sobrevive a re-renders do DOM)
if (!window.__bpc_ns) window.__bpc_ns = {};
var _ns = window.__bpc_ns[CFG.rootId] || {};
window.__bpc_ns[CFG.rootId] = _ns;

// Camada 1: AbortController com delay (absorve o double-fire)
// As duas execuções do BT chegam com <10ms de diferença.
// O delay de 80ms absorve-as: a 2ª agenda o abort antes da 1ª completar.
var _prevController = _ns.controller;
if (_prevController) {
  setTimeout(function () { _prevController.abort(); }, CFG.abortDelayMs);
}
var _myController = new AbortController();
_ns.controller = _myController;

// Camada 2: token em window (descarta resultados de fetches antigos)
var _myToken = Date.now() + Math.random();
_ns.token = _myToken;
function _isCurrent() {
  return window.__bpc_ns[CFG.rootId] &&
         window.__bpc_ns[CFG.rootId].token === _myToken;
}
```

Ver implementação completa em `l3-vm-kpi.js` (v16), Bloco 9.

### 4C.8 Retry em painéis Standalone

Os painéis Standalone não têm o circuit breaker do BPC Runtime. Devem implementar retry com backoff exponencial para chamadas fetch:

```javascript
function fetchWithRetry(url, body, opts, attempt) {
  attempt = attempt || 0;
  var maxAttempts = opts.maxAttempts || 3;
  var baseDelayMs = opts.baseDelayMs || 1000;

  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body), signal: opts.signal })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch(function (err) {
      if (err.name === 'AbortError') throw err; // não fazer retry em aborts
      if (attempt >= maxAttempts - 1) throw err;
      return new Promise(function (res) {
        setTimeout(res, baseDelayMs * Math.pow(2, attempt));
      }).then(function () {
        return fetchWithRetry(url, body, opts, attempt + 1);
      });
    });
}
```

### 4C.9 Sparklines — injectar no render, não depois

**Problema actual:** `l3-vm-kpi.js` renderiza o HTML inicial e depois injiecta sparklines via `Dom.injectSparkAt()`. Se o BT re-renderizar o DOM antes da injecção, as sparklines perdem-se.

**Política:** sparklines devem ser obtidas em paralelo com os items (`Promise.all`) e incluídas no render final:

```javascript
// CORRECTO
Promise.all([getItems(hostid), getSparklineHistory(itemid)])
  .then(function (results) {
    var items = results[0], sparkVals = results[1];
    root.innerHTML = render(compute(items), sparkVals);
  });
```

### 4C.10 Variáveis Grafana requeridas

No topo de cada ficheiro, documentar as variáveis Grafana que o painel precisa:

```javascript
// ╔═══════════════════════════════════════════════════════╗
// ║  VARIÁVEIS GRAFANA REQUERIDAS                         ║
// ║  var-hostid  — host Zabbix seleccionado               ║
// ╚═══════════════════════════════════════════════════════╝
```

Isto evita que o painel seja adicionado a um dashboard sem as variáveis necessárias, causando falhas silenciosas.

### 4C.11 Política de versioning

- **Minor version** (v1.1 → v1.2): bug fixes, thresholds, texto, estilos
- **Major version** (v1.x → v2.0): mudança de arquitectura, novo padrão de fetch, refactoring de blocos
- Incrementar a versão no cabeçalho do ficheiro e no `CFG.version` a cada alteração significativa.

---

## 5. Cobertura de observabilidade L1 → L4

### L1 — Visão geral (dashboard principal)
Implementado no `l2-kpi-card-v5.js`. Cards presentes: VMs ligadas/desligadas/stale, CPU pior VM (gauge + sparkline + trend), RAM pior VM (gauge + sparkline), pressão de memória (balloon + swap), storage volumes por agente, triggers activos por severidade, cobertura de agente.

**Estado: ✅ Completo.**

### L2 — Drill-down por grupo
**Estado: ✅ Completo.** `l2-tabela.js` (v3.1) lista todas as VMs do grupo `609`
por linha (estado, fonte agente/VMware, CPU%, RAM%, disco, power/uptime, triggers)
com ordenação por coluna e drill "Ver Detalhe" para o N3 (`CFG.n3DashUid`).
`l2-triggers.js` (v1.0) complementa com os top triggers do grupo.

### L3 — Detalhe de uma VM

| Painel | Ficheiro | Estado |
|---|---|---|
| Header de identidade | `l3-vm-header.js` | ✅ Completo |
| KPI Golden Signals (saúde, CPU, RAM, rede, disco) | `l3-vm-kpi.js` | ✅ Completo (v16) |
| CPU detalhado (tempos + contenção VMware) | `l3-cpu-kpi.js` | ✅ Completo (v2) |
| Disco & I/O detalhado | `l3-discos-kpi.js` | ✅ Completo (v1) |
| Rede (agente + ICMP fallback) | `l3-rede.js` | ✅ Completo (v1) |
| Triggers activos + resolvidos recentes | `l3-triggers.js` | ✅ Completo (v1.1) |
| Memória detalhada | `l3-memoria-kpi.js` | ✅ Completo (v1.0) |
| Serviços monitorizados | `l3-servicos.js` | ✅ Completo (v1.0) |
| Ficha de identidade do servidor | `l3-ficha-servidor.js` | ✅ Completo (v1.0) |
| **Top processos por CPU/RAM** | **em falta** | ❌ Gap |

O painel de memória (`l3-memoria-kpi.js`) já cobre gauge, breakdown (total/usada/livre/cached/swap
ou balloon/swapped no fallback VMware), e thresholds via `usermacro.get` (`{$MEM.UTIL.MAX}`).
É a **implementação de referência** do guard anti-double-fire (§4C.7).

### L4 — Triggers e eventos
O `l3-triggers.js` cobre activos + resolvidos recentes (últimas 6h).

**Gap:** não há link directo para o histórico do item que disparou o trigger. Ver secção 9 P3 para acção pendente.

---

## 6. Dados e fontes por métrica

### Hierarquia de fallback (aplicar em todos os resolvers)

```
Agente Zabbix (dados SO) → VMware poller → ICMP → sem dados
```

Nunca mostrar `—` sem indicar qual a fonte que falhou. Sempre mostrar um badge de fonte (`AGENTE`, `VMware`, `ICMP`, `SEM AGENTE`).

### Mapeamento item → chave Zabbix (validado em ambiente BPC)

**CPU (agente Windows):**
- `system.cpu.util` → "CPU utilization"
- `perf_counter_en["\\Processor Information(_total)\\% User Time"]` → "CPU user time"
- `perf_counter_en["\\Processor Information(_total)\\% Privileged Time"]` → "CPU privileged time"
- `perf_counter_en["\\System\\Processor Queue Length"]` → "CPU queue length"

**CPU (VMware fallback):**
- `vmware.vm.cpu.usage.perf[{$VMWARE.URL},{$VMWARE.VM.UUID}]` → "VMware: CPU usage in percents"
- `vmware.vm.cpu.latency[{$VMWARE.URL},{$VMWARE.VM.UUID}]` → "VMware: CPU latency in percents"

**RAM (agente Windows):**
- `vm.memory.util` → "Memory utilization"
- `vm.memory.size[used]` → "Used memory"
- `vm.memory.size[total]` → "Total memory"
- `perf_counter_en["\\Paging file(_Total)\\% Usage"]` → "Used swap space in %"

**RAM (VMware fallback):**
- `vmware.vm.memory.size.usage.guest[...]` → "VMware: Guest memory usage"
- `vmware.vm.memory.size[...]` → "VMware: Memory size"
- `vmware.vm.memory.size.ballooned[...]` → "VMware: Ballooned memory"
- `vmware.vm.memory.size.usage.host[...]` → "VMware: Host memory usage in percents"

**Disco (agente Windows):**
- Item: `(C:): Space utilization` → regex `\(([A-Z]:)\):\s*Space utilization`
- I/O: `_Total: Disk write rate`, `_Total: Disk read rate`, latências, queue, utilização

**Rede (agente):**
- Items com substring "Bits received" / "Bits sent" → tráfego por interface
- Items com substring ": Speed" → velocidade da NIC

**ICMP:**
- `icmpping` → ping up/down
- `icmppingsec` → RTT em segundos (converter para ms se valor < 1)
- `icmppingloss` → perda em %

**VMware meta (strings estáticas — não filtrar por age):**
- `vmware.vm.hv.name[...]` → hypervisor
- `vmware.vm.cluster.name[...]` → cluster
- `vmware.vm.datacenter.name[...]` → datacenter
- `vmware.vm.powerstate[...]` → "poweredOn (1)" / "poweredOff (0)"

---

## 7. Thresholds padrão (fallback CFG)

Estes são os valores fallback quando os thresholds não estão disponíveis via `usermacro.get`. **A fonte primária é sempre o Zabbix** (ver secção 4A).

**As linhas marcadas ✅ têm entrada no catálogo canónico global
(`documentacao/engenharia-do-sistema.md` §6.2) — os valores abaixo foram
alinhados a esse catálogo em 2026-07-02 e qualquer alteração futura
faz-se primeiro lá, depois aqui. As restantes linhas (I/O, ICMP RTT,
Balloon) não têm entrada global — permanecem como fallback local até
serem ratificadas.**

| Métrica | Aviso | Crítico | Fonte |
|---|---|---|---|
| CPU % | 70 | 90 | ✅ global §6.2 |
| RAM % | 70 | 85 | ✅ global §6.2 |
| Disco % (volume, uso) | 75 | 90 | ✅ global §6.2 |
| Disco % (L2 KPI strip) | 75 | 90 | ✅ global §6.2 |
| I/O ops/s | 50 | 100 | local (sem entrada global) |
| I/O latência ms | 10 | 50 | local (sem entrada global) |
| I/O queue depth | 1 | 5 | local (sem entrada global) |
| I/O utilização % | 60 | 85 | local (sem entrada global) |
| ICMP RTT ms | 10 | 50 | local (sem entrada global — global só cobre perda % ICMP, 1/10) |
| Balloon (ratio) | 0.1 | 0.1 | ✅ global §6.2 |
| Swap (ratio) | 0.1 | 0.5 | ✅ global §6.2 |

---

## 8. Paleta de cores

Usar sempre estas constantes. Suplementar cor com texto ou ícone para acessibilidade (daltónicos).

```javascript
// Estado
ok:   '#3FB950'   // verde
warn: '#D29922'   // âmbar
crit: '#F85149'   // vermelho
info: '#58A6FF'   // azul

// Categorias de métrica
cpu:  '#E8A020'   // laranja
mem:  '#7C4DFF'   // roxo
net:  '#00BCD4'   // ciano
io:   '#F44336'   // vermelho I/O
hlth: '#58A6FF'   // azul (saúde/uptime)

// Texto e fundo
text: '#CDD9E5'   // texto principal
sub:  '#6E7681'   // texto secundário / muted
brd:  '#1C2128'   // bordas
mute: '#2D333B'   // elementos inactivos
bg:   'rgba(255,255,255,0.015)' // fundo de card
```

**Acessibilidade:** nunca usar cor como único indicador de estado. Sempre incluir texto de estado (`OK`, `WARN`, `CRIT`) ou ícone. Daltónicos não distinguem verde de vermelho.

---

## 9. Lista de correcções pendentes

Estado a 2026-06-16. Ordenado por prioridade.

### P1 — Imediato (antes de qualquer novo desenvolvimento)

- [x] Mover `l3-vm-kpi-v2.js` para `../arquivo/servidores-virtuais-olds/`
- [x] Mover `l3-card1-srv-virt.js` … `l3-card6-srv-virt.js` para `../arquivo/servidores-virtuais-olds/`
- [x] Mover `l3-rows-3-4-5.js` para `../arquivo/servidores-virtuais-olds/`
- [x] `l3-triggers.js` — alterar `debug: true` → `debug: false`
- [x] `l3-rede.js` — alterar `debug: true` → `debug: false`
- [x] `l3-vm-kpi.js` — remover bloco "DIAGNÓSTICO v15d"
- [ ] `l2-kpi-card-v5.js` — substituir `PLACEHOLDER_CPU/RAM/PB/ST` pelos UIDs reais dos dashboards (mantidos com comentário `// TODO` — UIDs reais ainda por obter)

### P2 — Alta prioridade (cobertura de observabilidade)

- [x] Criar painel L2 de lista de VMs — `l2-tabela.js` (v3.1), grupo 609, estado individual, CPU/RAM/disco, triggers, drill para N3
- [x] Criar painel L3 de memória detalhada — `l3-memoria-kpi.js` (v1.0), gauge + breakdown + thresholds via `usermacro.get`

### P3 — Melhoria de qualidade

- [x] Todos os ficheiros — separar `datasourceUid` do proxy URL e mover para CFG (secção 4B ponto 1)
- [x] Todos os ficheiros — mover limites de API (`limit: 50000`, etc.) para `CFG.apiLimits`
- [x] `l3-vm-header.js` — mover `groupsIgnore` regex para `CFG.groupsIgnore` (array) + `IGNORE_RE`
- [x] `l3-vm-kpi.js` — refactorizar sparklines para render único (`Promise.all` em vez de injecção pós-render)
- [x] `l2-correlacionador-de-eventos.js` — convertido para ES5 (sem const/let/arrow/template-literals); THEME unificado em CFG
- [x] Todos os ficheiros L3 — adicionar `fetchWithRetry` para substituir fetch directo (secção 4C.8)
- [x] Todos os ficheiros L3 — adicionar comentário de variáveis Grafana requeridas no topo (secção 4C.10)
- [ ] Adicionar link para histórico do item nos cards de trigger em `l3-triggers.js`

### P4 — Melhorias propostas

- [ ] Nos painéis L3 que mostram estado (saúde, CPU card, RAM card): substituir comparação com `CFG.thresholds` por leitura de `problem.get` com tags de componente (secção 4A)
- [x] Skeleton de loading consistente em todos os painéis L3 (texto "A carregar…" durante o fetch)
- [x] Card de erro consistente em todos os painéis L3 — `renderErro(causa, accao)` substituiu os spans vermelhos inline
- [ ] Criar painel L3 de top processos por CPU/RAM (requer Zabbix Agent com `proc.get` ou `proc.cpu.util`)
- [ ] Adicionar drill-down de VM no painel L2 list (link para D5-Detalhe-VM com `var-hostid` preenchido)
- [ ] Rever `l3-cpu-kpi.js` v2 — confirmar VMware CPU Ready e CPU Latency com os novos `maxAgeSec`

---

## 10. Convenções de nomenclatura de ficheiros

| Prefixo | Significado |
|---|---|
| `l2-` | Painel de nível 2 — visão de grupo |
| `l3-` | Painel de nível 3 — detalhe de uma VM específica |
| `-v2`, `-v3`, ... | Versões activas com mudanças arquitecturais significativas |

Quando uma versão é substituída, o ficheiro antigo vai para `../arquivo/` — não fica na pasta activa com sufixo `-old` ou `-backup`.

---

## 12. Workflow de contribuição

Sequência obrigatória para qualquer alteração a um painel existente ou criação de novo painel:

```
1. Desenvolver
   ├─ Copiar ficheiro base (ver secção 11 para novos painéis)
   ├─ Alterar apenas o bloco CFG para configuração inicial
   ├─ Activar debug: true durante desenvolvimento
   └─ Verificar na consola F12 que os items/triggers esperados chegam

2. Testar
   ├─ Mudar variável Grafana (ex: var-hostid) e confirmar que o painel recarrega sem estado residual
   ├─ Abrir dois tabs com hosts diferentes — confirmar que não há colisão de rootId
   ├─ Simular falha de rede (DevTools → Network → Offline) — confirmar card de erro visível
   └─ Confirmar que não há erros na consola em ES5 strict

3. Estabilizar
   ├─ Alterar debug: false
   ├─ Remover todos os console.log / console.group de diagnóstico temporário
   ├─ Incrementar versão em CFG.version e no cabeçalho do ficheiro (ver secção 4C.11)
   └─ Mover versão anterior para ../arquivo/servidores-virtuais-olds/ se for substituição major

4. Documentar
   ├─ Actualizar tabela da secção 2 deste CLAUDE.md com o novo ficheiro e estado
   ├─ Actualizar secção 5 se a cobertura de observabilidade mudou
   └─ Actualizar secção 9 marcando os itens resolvidos com [x]

5. Commit
   └─ Mensagem de commit: [Lx] nome-ficheiro vX.Y — descrição da mudança
       Exemplos: "[L3] l3-vm-kpi v17 — sparklines em Promise.all"
                 "[L2] l2-lista-vms v1 — novo painel de tabela de VMs grupo 609"
```

**Regras rápidas de revisão antes de qualquer commit:**
- `debug: false` em todos os ficheiros activos
- Sem `HOSTID` hardcoded
- Sem `const`/`let`/arrow functions em ficheiros L3
- `rootId` único — pesquisar no repositório antes de usar
- Este CLAUDE.md actualizado

---

## 11. Como criar um novo painel L3

1. Copiar a estrutura de `l3-discos-kpi.js` (painel L3 mais recente e limpo).
2. Alterar `CFG.rootId` para um ID único — nunca reutilizar IDs de outros painéis.
3. Separar `grafanaUrl` e `datasourceUid` no CFG; construir `PROXY` no bootstrap.
4. Adicionar comentário com variáveis Grafana requeridas no topo do ficheiro.
5. Implementar `fetchMacros` para thresholds dinâmicos antes de usar valores fixos. O helper está documentado na secção 4A com o seu contrato completo: recebe `(hostid, signal)`, devolve uma Promise com um objecto `{ cpuWarn, cpuCrit, memCrit, diskWarn, diskCrit }`, com fallback para `CFG.thresholds` se a macro não existir no host.
6. No Grafana, criar painel Dynamic Text com `<div id="[CFG.rootId]"></div>` no campo "Default content".
7. Colar o JS no campo "After content ready".
8. Adicionar a variável Grafana `hostid` do tipo "Query" se o painel depende de uma VM específica.
9. Testar com `debug: true` — verificar na consola F12 que os items esperados estão a ser encontrados.
10. Antes de considerar estável: alterar `debug: false`, remover logs de diagnóstico, incrementar versão.
11. Actualizar este CLAUDE.md com o novo ficheiro na tabela da secção 2.

---

## 13. Auditoria de dashboards de VMs (2026-07-09)

### 13.0 TERCEIRA versão N3 — híbrida (`vm-n3-ficha`, 2026-07-13)

Pedido do utilizador: "uma verdadeira ficha da VM com fluxo de observabilidade
top-down, golden signals/USE, e ficha de contexto/inventário elegante".
Nova pasta `n3-hibrido/` (manifest próprio, coexiste com A e B):

1. **HERO BT** (`l3h-hero.js`) — farol de pior severidade + nome grande +
   badges LIGADA/AGENTE + chips de tags + factos (IP·SO·RAM·uptime·HV·cluster)
2. **Golden signals nativos** — 6 stats (disponibilidade/RTT/perda/CPU/RAM/
   swap) com thresholds do catálogo §6.2; pintam em ~2s sem esperar pelo proxy
3. **USE/RED por recurso** — 8 timeseries nativos (CPU util+queue+ready,
   RAM util+swap+balloon, disco espaço+I/O, rede tráfego+perda ICMP)
4. **Problemas nativo** → 5. **FICHA BT** (`l3h-ficha.js`) — 3 cartões com
   acento de cor (Identidade/Virtualização/Negócio & monitorização), kv
   alinhado, pills de tags e grupos.

**Lição CRÍTICA de variável (2026-07-13, generaliza a §13.4)**: nos targets
de MÉTRICAS (queryType 0) do datasource Zabbix, o filtro de host só faz match
fiável contra o **nome técnico** e em **forma regex** — o nome visível
completo falha como string simples E como regex escapado (`${var:regex}`),
confirmado por `ds/query` directo (0 pontos vs 60 com `/VS8000345/`).
Solução canónica: variável `hostid` via **MySQL** com `__text`=nome visível
(dropdown legível) e `__value`=host técnico, filtros `/${hostid}/`. O plano
`$hostid`=nome visível da Versão A/B continua a funcionar APENAS no painel de
triggers (queryType 5) e nos BT — não copiar esse padrão para métricas novas.

### 13.1 Duas versões N3 em produção (decisão do utilizador)

O **N3 · VM Detalhe** existe em **duas versões, ambas em produção**. Partilham os
mesmos `l3-*.js` (o render é idêntico); diferem no tipo de painel Grafana:

| Versão | UID | Manifest / snapshot | Natureza |
|---|---|---|---|
| **A — all-BT** | `0ae673a3-44c8-41e0-98f5-f5c53473ad54` | `n3/manifest.json` + `n3/dashboard-completo.json` | 9 painéis Business Text |
| **B — nativo** | `0812353b-3da2-4b65-a884-862633c7d70a` | `n3/manifest-versao-b.json` + `n3/versao-b-corrected.json` | gauges/stat/timeseries nativos Zabbix + 4 painéis BT (build: `n3/build_versao_b.py`) |

Ambas vivem na pasta Grafana **`03·Servidores Virtuais`** (`cfpm0sdsxjb40c`). A Versão B foi movida de `99·Arquivo` → `03·Servidores Virtuais` em 2026-07-09 e o `manifest-versao-b.json` passou a fixar `folderUid` para os push a manterem-na lá.

- Qualquer alteração aos `l3-*.js` afecta **as duas** — testar em ambas antes de fechar.
- O drill "Ver Detalhe" da tabela L2 aponta para o **HÍBRIDO** (`vm-n3-ficha`) desde
  2026-07-13 (decisão do utilizador) — passa `r.techName` (host técnico), não o nome
  visível, porque a variável do híbrido é MySQL com `__value`=host técnico (§13.0).
- A Versão B, sendo nativa, não sofre do double-fire do Business Text — a vantagem que
  motivou mantê-la em produção a par da A.

### 13.2 O que foi feito nesta auditoria

1. **CLAUDE.md reconciliado** com o estado real (memória/serviços/ficha estavam por documentar; gaps já fechados marcados).
2. **Guard anti-double-fire (§4C.7) alargado de 2 → 9 painéis L3.** Fonte canónica extraída para `_l3-base.js`. Paleta `text` alinhada ao §8 (`#CDD9E5`) em ficha/serviços/header. `console.log` de debug removidos (cpu bootstrap+resolver, discos, header).
3. **Duas versões N3 promovidas a produção** (§13.1).
4. **Limpezas:** hardcode do UID N3 na `l2-tabela.js` movido para CFG; órfão `l2-correlacionador-de-eventos.js` arquivado (`n2/arquivo-n2/`); scaffolding morto da Versão A arquivado (`n3/arquivo-n3/`).

### 13.3 Pendente (não feito nesta auditoria)

- `l3-vm-kpi.js` mantém `console.log('[KPI-GS v18.1]…')` de diagnóstico (§4C.4) — remover numa próxima passagem (ficheiro de referência, não tocado para não arriscar).
- `n3/build_versao_b.py` tem path de saída stale (`servidores-virtuais/…` pré-`03-`).
- Migrar mais painéis all-BT para nativo (Versão B) onde forem puramente numéricos — decisão de arquitectura em aberto.

### 13.4 Bug real encontrado e corrigido — CPU Ready lido em ms como se fosse % (2026-07-10)

Nova ronda de avaliação (pedido do utilizador, "vamos avaliar os dashboards das VMs, começamos pelo N3"). Achado ao testar ao vivo com `VS8000345`: o painel "VMware · Contenção no Host" (`l3-cpu-kpi.js`) mostrava **"CPU READY 101.00% CRÍTICO"**, enquanto o card resumo (`l3-vm-kpi.js`) mostrava **"CPU READY 101 ms"** para o mesmo host — duas unidades diferentes para a mesma métrica.

**Causa raiz confirmada via `item.get` ao vivo**: o Zabbix só expõe `VMware: CPU ready` (chave `vmware.vm.cpu.ready[...]`) em **ms** — nunca existiu uma variante "in percents" para este item (ao contrário de `CPU latency`/`CPU readiness latency`, que **têm mesmo** item nativo em `%`). O `CFG.itemNames.vmwReady` do `l3-cpu-kpi.js` apontava para um nome de item ("VMware: CPU ready in percents") que nunca existiu; a função de lookup caía para o item em ms pela mesma *key*, sem qualquer conversão, e o valor era formatado com sufixo `%` e comparado contra um threshold 0-100% — gerando falso `CRÍTICO` em VMs com CPU Ready normal (ex.: 88-101ms, valores saudáveis).

**Bug secundário apanhado na correcção**: a linha "READINESS LATENCY" reutilizava por engano o threshold de `vmwReady` — funcionava por coincidência (ambos eram %), mas ficaria errado assim que `vmwReady` passasse a ms. Corrigido com um threshold próprio (`vmwRdyLat`).

**Fix (`l3-cpu-kpi.js` v2.1)**: `CFG.itemNames.vmwReady` corrigido para o nome real do item; `_vmwRow` ganhou parâmetro `unit` (`'ms'`/`'%'`); CPU Ready mostra agora `"101 ms"` com threshold próprio em ms (`{warn:1000, crit:3000}`, **fallback não calibrado por trigger Zabbix** — documentado no código, ajustar se necessário); READINESS LATENCY passou a usar `CFG.thresholds.vmwRdyLat` (`{warn:5, crit:20}`, valores antigos preservados). Validado ao vivo: `VS8000345` passa de "101.00% CRÍTICO" para "101 ms NORMAL", os outros dois campos (Latency/Readiness Latency) inalterados.

**Nota metodológica que valeu a pena registar**: ao testar manualmente pela URL, `var-hostid=<código técnico>` (ex. `VS9000007`) devolve **"query didn't return any results"** em todos os painéis — a variável `hostid` (tipo Zabbix "host") resolve para o **nome visível completo** da VM (ex. `"ACM - VM - VS8000345 (Win · QA · ...)"`, tal como Grafana a auto-selecciona), não o código curto. Confirmado com `ds/query` directo: filtro de host `"VS9000007"` (string simples) devolve 0 pontos, `"/VS9000007/"` (forma regex) devolve os dados todos — o filtro de host deste datasource não faz match por substring numa string simples contra o nome completo. Mesma classe de cuidado já documentada para a Borda DC (`${var:raw}` vs `${var}`), aqui do lado do valor-teste manual, não da variável em si.

### 13.5 Versão B (nativa) — thresholds desalinhados do catálogo canónico + duplicação visual (2026-07-10)

Continuação da avaliação do N3, agora na Versão B (`0812353b`, painéis nativos gerados por `build_versao_b.py`). O fix da §13.4 (`l3-cpu-kpi.js`) **não se aplica aqui** — a Versão B só usa 4 painéis Business Text (header/serviços/triggers/ficha, iguais aos da Versão A); CPU/RAM/Disco/Rede são todos painéis nativos (`stat`/`gauge`/`bargauge`/`timeseries`) definidos directamente no JSON do dashboard, sem passar por nenhum `l3-*.js`.

**Achado 1 — thresholds nunca alinhados ao catálogo canónico** (`engenharia-do-sistema.md §6.2`, o mesmo que a Versão A segue via `CFG.thresholds`): CPU usava `{warn:60, crit:85}` em vez de `{70,90}`; RAM usava `{warn:60, crit:85}` em vez de `{70,85}` (só o warn estava errado); Disco usava `{warn:70, crit:85}` em vez de `{75,90}`. Confirmado ao vivo: `VS8000345` com RAM a 67.2% aparecia **âmbar** (devia ser verde, só passa a aviso aos 70%).

**Achado 2 — duplicação visual**: CPU e RAM apareciam em 3 sítios ao mesmo tempo (stat card, gauge, timeseries) — o gauge não acrescentava nada ao stat card (ambos só mostram o valor actual, sem série temporal).

**Achado 3 — rótulos em inglês, nomes brutos dos items Zabbix** ("CPU utilization", "VMware: CPU usage in percents"), sem tradução nem estilo NOC, ao contrário de toda a restante Versão A/domínio.

**Fix aplicado (via API directa — `build_versao_b.py` não foi tocado, tem path de saída stale, já registado como pendente §13.3)**:
1. Thresholds dos painéis `stat`/`gauge` de CPU (id 101) e RAM (id 102) e do `bargauge` de Disco (id 110) corrigidos para os valores canónicos.
2. Gauges duplicados de CPU (id 106) e RAM (id 108) **removidos**; as `timeseries` correspondentes (105, 107) alargadas para ocupar o espaço libertado (16→24 colunas, mesma largura da rede).
3. `displayName` override (regex por campo) para traduzir os rótulos: "CPU (%) — Agente" / "CPU (%) — VMware", "Memória (%) — Agente" / "Memória (%) — VMware", "Tempo activo", "Tempo de resposta (ICMP)", "Disco — escrita/leitura". **Cuidado apanhado a meio**: a 1ª tentativa usou o mesmo rótulo ("CPU (%)") para as 2 séries (Agente e VMware, que o painel mostra em simultâneo) — ficou **mais confuso** que antes (2 números iguais em nome, diferentes em valor, sem se perceber porquê); corrigido para rótulos distintos por fonte. Painel de Disco (`Space utilization`) e Rede (`Bits received/sent`) **não** receberam displayName — as séries reais têm o nome da drive/interface como prefixo (ex. `"(C:): Space utilization"`, `"Interface vmxnet3... : Bits received"`); um rótulo fixo apagaria essa distinção entre discos/interfaces, por isso ficaram como estão (só o threshold do disco foi corrigido).

Validado ao vivo com `VS8000345`: RAM 66.9% agora verde, CPU mostra "Agente 0.9%" / "VMware 1.0%" claramente distintos, disco 32.9% verde. Snapshot local `n3/versao-b-corrected.json` actualizado a partir do dashboard ao vivo (13 painéis, era 15 antes de remover os 2 gauges).

**Pendente**: `build_versao_b.py` continua a gerar a versão *antiga* (thresholds errados, sem os rótulos PT, com os gauges duplicados) — se alguém correr o script outra vez, desfaz estas correcções. Precisa de ser actualizado para gerar o estado corrigido, ou passar a ser só histórico/referência (decidir).

### 13.6 Versão A (BT) — 3 pedidos directos do utilizador: Rede full-width, identidade de negócio nos Serviços, Triggers nativo (2026-07-10)

Continuação da avaliação, de volta à Versão A depois da B (§13.5). Três pedidos concretos:

**1. Painel Rede tinha scroll interno.** Partilhava linha com Disco (`w12 h8`) e o conteúdo (interface, throughput, erros/drops, ICMP) não cabia. **Fix**: `l3-rede.js` não mudou (o scroll era só de layout, não de código) — gridPos passou a `w24 h10`, linha própria. Disco (`l3-discos-kpi.js`) também passou a `w24` (já não tinha com quem partilhar a linha) e Serviços (`l3-servicos.js`) também, ocupando a linha que os Triggers libertaram (ver ponto 3).

**2. Painel Serviços aparecia vazio em `VS8000345`** — utilizador perguntou se não havia dados de serviços de negócio a vir do Zabbix. **Investigado antes de mexer**: confirmado que `VS8000345` genuinamente não tem items Windows `"X service is running"` (esse discovery só está aplicado a um subconjunto de VMs, ex. as 18 do eBankit — confirmado que o mecanismo funciona lá). Mas a VM **tem** a tag `servico=ACM` (+ `departamento=DSE`, `camada=Camada Aplicacional`, `ambiente=QA`) que não aparecia nem aqui nem na Ficha (`l3-ficha-servidor.js` só busca `selectGroups`, nunca `selectTags`). **Fix** (`l3-servicos.js` v1.1): `fetchAll` passa a pedir `selectTags` no `host.get`; nova função `renderIdentity` mostra uma linha de identidade (Serviço/Departamento/Camada/Ambiente) acima da lista de serviços Windows, sempre que a tag existir — deixa de ser um painel "morto" para VMs sem esse discovery aplicado. Validado ao vivo: `VS8000345` mostra "ACM · DSE · Camada Aplicacional · QA" + "Sem serviços Windows monitorizados explicitamente neste host." (a frase antiga "Sem serviços monitorizados" ficou mais específica, para não parecer que falta tudo).

**3. Triggers deixou de ser Business Text, passou a nativo, e moveu-se para o fim (antes da Ficha).** `l3-triggers.js` **não foi apagado** (ficheiro partilhado — a Versão B continua a usá-lo como um dos seus 4 painéis BT, `manifest-versao-b.json`); só saiu do `manifest.json`/dashboard da Versão A. Novo painel nativo `n3-vm-triggers.json` (mesmo padrão do domínio de APIs — `alexanderzobnin-zabbix-triggers-panel`, `group:$groupid`, `host:$hostid`, `hostField:false` porque já está scoped a 1 VM). Simples de fazer porque `$hostid` já resolve para o nome visível completo (confirmado no §13.4) — nenhuma variável regex extra necessária, ao contrário do `${hostRegex:raw}` que a Fase 7 (APIs) precisou. Reordenado para ficar logo antes da Ficha (era o 2º painel, a seguir ao KPI).

Layout final (topo→fundo): Header → KPI → **Serviços** (full-width, com identidade) → CPU / Memória (lado a lado) → **Disco** (full-width) → **Rede** (full-width, sem scroll) → **Triggers nativo** → Ficha. Validado ao vivo com `VS8000345`: Rede sem scroll, Serviços mostra a identidade + estado real, Triggers nativo mostra "Page 1 of 0" (0 problemas, consistente com o header "Sem triggers activos"), Ficha no fim. Snapshots locais actualizados (`n3/dashboard-completo.json` a partir do dashboard ao vivo, 9 painéis — mesma contagem que antes, só trocou 1 BT por 1 nativo).

### 13.7 Versão A (BT) — fontes maiores, títulos de row, e correcção do overflow que o próprio aumento de fonte introduziu (2026-07-10)

Terceiro pedido consecutivo do utilizador sobre a Versão A (depois de §13.6), com 3 partes:

1. **Aumentar o tamanho da fonte**, "principalmente a ficha do servidor e outras todas na verdade". **Fix**: `bump_fonts.py` (scratchpad) aplicou um multiplicador ×1.4 a todos os `font-size:Npx` dos 8 ficheiros L3 da Versão A (`l3-vm-header.js`, `l3-vm-kpi.js`, `l3-cpu-kpi.js`, `l3-memoria-kpi.js`, `l3-discos-kpi.js`, `l3-rede.js`, `l3-servicos.js`, `l3-ficha-servidor.js`), arredondado a 0.5px — só regex sobre a CSS, nenhuma outra lógica tocada.
2. **Título antes de cada row**, "para saber do que se trata". **Fix**: painéis nativos `type:"row"` (h=1, w=24, `collapsed:false`) inseridos antes de cada grupo — "Estado geral", "Serviços", "CPU & Memória", "Disco", "Rede", "Problemas", "Ficha do servidor" — via `fix_n3_bt2.py`. Rows não têm ficheiro `.js` próprio (são estrutura pura do dashboard JSON), por isso não entram no `manifest.json`.
3. **Redistribuir a row da Rede**, que "ainda tem scroll interno e a distribuição dos itens dentro não está uniforme, está disforme" — este pedido specific já tinha CSS pronta de §13.6 (`.nr-stats-grid`/`.nr-stat-cell` uniformes), mas o utilizador reportou que continuava insuficiente.

**Achado na validação ao vivo (não no pedido original, mas causado directamente por ele)**: o aumento de fonte do ponto 1 tornou o conteúdo de 2 painéis mais alto do que a caixa (`gridPos.h`) permitia — reintroduzindo exactamente o tipo de scroll interno que o ponto 3 pedia para eliminar, desta vez por causa da própria fonte maior em vez de CSS desigual:
- **Rede** (painel 105): conteúdo real 578px vs caixa 408px (h=11) → overflow 170px. **Fix**: `gridPos.h` 11→17 (+6), reposicionando Problemas/Triggers/Ficha para baixo (`fix_rede_height.py`).
- **Ficha do servidor** (painel 108): conteúdo real 290px vs caixa 218px (h=6) → overflow 72px. **Fix**: `gridPos.h` 6→10 (+4) (`fix_ficha_height.py`).

Ambas as correcções pedidas e confirmadas individualmente pelo utilizador antes do push (regra de confirmação por escrita distinta). Validado ao vivo com `VS8000345` via `scrollHeight - clientHeight` medido por JS em cada painel: Rede e Ficha ficaram com overflow `0`. `n3/dashboard-completo.json` re-sincronizado a partir do dashboard ao vivo (16 entradas — 9 painéis + 7 rows).

**Pendente (overflow residual, não reportado pelo utilizador, não corrigido nesta ronda)**: 3 painéis ficaram com overflow pequeno (Header identidade ~48px, KPI/Estado geral ~26px, CPU · Tempos & Saturação ~21px) — provavelmente o mesmo efeito do bump de fonte, mas bem menor que os 2 casos acima (cortam no máximo meia linha) e fora do que foi pedido. Corrigir numa próxima ronda se o utilizador voltar a notar.

**Lição para o futuro**: qualquer aumento de `font-size` num painel L3 desta pasta deve ser seguido de uma verificação de `scrollHeight` vs `clientHeight` ao vivo (via JS, não só screenshot) antes de dar o layout por fechado — o overflow pode não ser visível no primeiro ecrã do painel se o conteúdo cortado ficar just abaixo da dobra visível do card.
