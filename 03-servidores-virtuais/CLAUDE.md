# CLAUDE.md — Servidores Virtuais
> Guia de arquitectura, políticas e decisões do sistema de observabilidade de VMs BPC NOC.
> Este ficheiro é a fonte de verdade para qualquer IA ou pessoa que trabalhe nesta pasta,
> **excepto a tabela de thresholds da secção 7**, onde `documentacao/engenharia-do-sistema.md`
> §6.2 é a única fonte de verdade (decisão do utilizador, 2026-07-02, após auditoria
> completa de lógica de estado ter encontrado desvio entre as duas tabelas).
> Última revisão: 2026-07-02

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

| Ficheiro | Nível | Painel Grafana | Estado |
|---|---|---|---|
| `l2-kpi-card-v5.js` | L2 | D03-N2-VMs · Painel 1 · KPI Strip | ✅ Activo |
| `l2-correlacionador-de-eventos.js` | L2 | D03-N2-VMs · Event Correlation | ⚠️ Órfão — **não está no `manifest.json`** nem no dashboard Grafana ao vivo (confirmado por query directa à API, 2026-07-02: só 4 painéis existem — header/KPI/tabela/triggers). Ficheiro mantido no repo, mantido correcto (thresholds §7), mas não implantado. Decidir: implantar (criar entrada no manifest + push) ou mover para `../arquivo/` |
| `l3-vm-header.js` | L3 | D5-Detalhe-VM · Row 0 · Header | ✅ Activo |
| `l3-vm-kpi.js` | L3 | D5-Detalhe-VM · Row 1 · KPI Golden Signals | ✅ Activo (v16) |
| `l3-cpu-kpi.js` | L3 | D5-Detalhe-VM · Row 3 · CPU Detalhado | ✅ Activo (v2) |
| `l3-discos-kpi.js` | L3 | D5-Detalhe-VM · Row 2 · Disco & I/O | ✅ Activo (v1) |
| `l3-rede.js` | L3 | D5-Detalhe-VM · Rede | ✅ Activo (v1) — `debug: false`, proxy split, fetchWithRetry |
| `l3-triggers.js` | L3/L4 | D5-Detalhe-VM · Row 4 · Triggers | ✅ Activo (v1.1) — `debug: false`, proxy split, fetchWithRetry |

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
**Gap identificado:** existe o correlacionador de eventos mas **não existe uma lista de VMs com estado individual**. O NOC não consegue identificar qual VM específica está em problema a partir do L2.

**Painel em falta:** tabela L2 com todas as VMs do grupo `609`, mostrando por linha: nome da VM, estado (ligada/desligada/stale), CPU%, RAM%, último trigger activo (severidade + descrição), hypervisor. Ordenável por severidade.

### L3 — Detalhe de uma VM

| Painel | Ficheiro | Estado |
|---|---|---|
| Header de identidade | `l3-vm-header.js` | ✅ Completo |
| KPI Golden Signals (saúde, CPU, RAM, rede, disco) | `l3-vm-kpi.js` | ✅ Completo (v16) |
| CPU detalhado (tempos + contenção VMware) | `l3-cpu-kpi.js` | ✅ Completo (v2) |
| Disco & I/O detalhado | `l3-discos-kpi.js` | ✅ Completo (v1) |
| Rede (agente + ICMP fallback) | `l3-rede.js` | ✅ Completo (v1) |
| Triggers activos + resolvidos recentes | `l3-triggers.js` | ✅ Completo (v1.1) |
| **Memória detalhada** | **em falta** | ❌ Gap crítico |
| **Top processos por CPU/RAM** | **em falta** | ❌ Gap |

**Painel de memória em falta** — é o gap mais importante. Deve incluir:
- Gauge de utilização (agente: `vm.memory.util`; fallback VMware: `vmware.vm.memory.size.usage.host`)
- Breakdown: total / usada / livre / cached / buffered (agente) ou usada / balloon / swap (VMware)
- Sparkline de utilização nas últimas 6h
- Thresholds dinâmicos via `usermacro.get` (macro `{$MEM.UTIL.MAX}`)

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

- [ ] Criar painel L2 de lista de VMs — tabela com todas as VMs do grupo 609, estado individual, CPU%, RAM%, último trigger activo, hypervisor
- [ ] Criar painel L3 de memória detalhada — gauge, breakdown, sparkline 6h, thresholds via `usermacro.get`

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
