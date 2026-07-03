# BPC KPI Card Framework

### Versão 2.0 — Universal · Plug & Play · Vendor-Agnóstico

> ⚠️ **NÃO ADOPTADO (auditado 2026-07-01) — não seguir para código novo.**
> Auditoria exaustiva a todo o repositório (produção + arquivo) confirmou
> **zero ficheiros** a usar `BPC_KPI`, `buildModel`, `BPC_KPI_VIEW`,
> `BPC_KPI_SCHEMA`, `adapter()` no formato aqui descrito, ou `validateModel`.
> Os próprios ficheiros "core" que este documento diz nunca modificar
> (`bpc.kpi.core.js`, `bpc.kpi.view.js`, `bpc.kpi.schema.js`) **não existem**
> no repositório. O padrão `deviceClass` só aparece em
> `arquivo-referencia/v5-material-bruto/` — uma tentativa anterior à
> reconstrução actual, abandonada. O padrão realmente universal (61 ficheiros
> em produção, todos os domínios) é **CFG → FETCH → COMPUTE → RENDER → BOOT**,
> documentado em `engenharia-do-sistema.md §5.2`. Este ficheiro fica como
> referência histórica — só reconsiderar para um tipo de card futuro que seja
> genuinamente um tile golden-signals de 1 dispositivo (ex.: N1 wallboard),
> nunca para fichas ricas multi-secção como as que já existem em N3/N4.
>
> **Propósito original:** Este documento é o contrato de design e implementação do sistema de cards KPI para NOC. Qualquer IA, developer ou auditor deve conseguir implementar um novo card lendo apenas este ficheiro.

---

## Índice

1. [Princípios Fundadores](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#1-princ%C3%ADpios-fundadores)
2. [Arquitectura em Camadas](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#2-arquitectura-em-camadas)
3. [Contrato Universal (Data Model)](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#3-contrato-universal-data-model)
4. [CORE Engine (bpc.kpi.core.js)](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#4-core-engine)
5. [Adapter Layer](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#5-adapter-layer)
6. [Normalizer](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#6-normalizer)
7. [Root Cause Engine](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#7-root-cause-engine)
8. [View Layer](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#8-view-layer)
9. [Config por Card](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#9-config-por-card)
10. [Pipeline Completo](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#10-pipeline-completo)
11. [Golden Signals &amp; USE Model](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#11-golden-signals--use-model)
12. [Threshold Strategy](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#12-threshold-strategy)
13. [NOC Design Rules](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#13-noc-design-rules)
14. [Schema por Device Class](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#14-schema-por-device-class)
15. [Como Criar um Novo Card](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#15-como-criar-um-novo-card)
16. [Prompt Base para Geração de Cards](https://claude.ai/chat/7ac6b522-21b7-4026-9d19-992efce805c2#16-prompt-base-para-gera%C3%A7%C3%A3o-de-cards)

---

## 1. Princípios Fundadores

| #  | Princípio                                       | Descrição                                                                                            |
| -- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| P1 | **Separação total de responsabilidades** | SOURCE → ADAPTER → MODEL → VIEW. Cada camada ignora as outras. Comunicam apenas por contrato.       |
| P2 | **Contrato universal obrigatório**        | Todo o card produz exactamente o mesmo output JSON. A UI não sabe o que é um PowerStore ou um Cisco. |
| P3 | **Adapter como única diferença**         | Para adicionar um novo vendor, só se escreve o adapter. O resto é zero-código.                      |
| P4 | **NOC-first design**                       | Legível a 3 metros. Estado domina dados. Cores falam mais alto que números.                          |
| P5 | **Root cause, não raw data**              | O card apresenta a causa do problema, não um dump de métricas.                                       |
| P6 | **Stale detection obrigatória**           | Se os dados têm mais de N segundos, o status é elevado para `warn`. Nunca silencia dados velhos.   |
| P7 | **Demo passa pelo engine**                 | O mock data segue o mesmo pipeline que produção. Nunca mostra HTML hardcoded.                        |
| P8 | **Erros explícitos, nunca silenciosos**   | Adapter usa strict mode. validateModel verifica o contrato. .catch() renderiza erro visível.          |

---

## 2. Arquitectura em Camadas

```
┌─────────────────────────────────────────────────────┐
│  SOURCE                                             │
│  Zabbix · API REST · SNMP · Prometheus · IPMI       │
└────────────────────┬────────────────────────────────┘
                     │ raw data
┌────────────────────▼────────────────────────────────┐
│  ADAPTER  (vendor-specific)                         │
│  powerstoreAdapter · vmwareAdapter · ciscoAdapter   │
│  → extrai e converte unidades para o modelo base    │
└────────────────────┬────────────────────────────────┘
                     │ metrics { latency, traffic, errors, saturation }
┌────────────────────▼────────────────────────────────┐
│  NORMALIZER                                         │
│  → aplica thresholds → produz KPI objects com state │
└────────────────────┬────────────────────────────────┘
                     │ kpis { latency: {value,unit,state}, ... }
┌────────────────────▼────────────────────────────────┐
│  ENGINE                                             │
│  computeStatus() · detectPrimaryIssue()             │
│  → status global · causa raiz prioritizada          │
└────────────────────┬────────────────────────────────┘
                     │ DataModel (contrato universal)
┌────────────────────▼────────────────────────────────┐
│  VIEW  (genérica — igual para todos os cards)       │
│  BPC_KPI_VIEW.render(cfg, model)                    │
└─────────────────────────────────────────────────────┘
```

**Regra de ouro:** Nenhuma camada referencia a camada adjacente por nome. Só comunica pelo contrato.

---

## 3. Contrato Universal (Data Model)

Este é o output obrigatório de qualquer card. A UI só consome este modelo.

```js
{
  // Estado global do componente
  status: 'ok' | 'warn' | 'down',

  // Causa raiz prioritizada (1 problema de cada vez)
  // ⚠️ type deve ser EXACTAMENTE um dos valores abaixo — nunca 'capacity' nem 'availability'
  primary_issue: {
    type: 'errors' | 'latency' | 'saturation' | 'traffic' | 'none',
    message: 'string legível para NOC'
  },

  // 4 KPIs universais (Golden Signals)
  // ⚠️ KPI pode ser null quando não aplicável ao device class — tile é escondido na VIEW
  kpis: {
    latency:    { value: Number, unit: String, state: 'ok'|'warn'|'down' } | null,
    traffic:    { value: Number, unit: String, state: 'ok'|'warn'|'down' } | null,
    errors:     { value: Number, unit: String, state: 'ok'|'warn'|'down' } | null,
    saturation: { value: Number, unit: String, state: 'ok'|'warn'|'down' } | null
  },

  // Série temporal curta (para sparkline)
  trend: [ Number ],  // últimos N pontos da métrica mais crítica

  // Dados de inventário (opcionais)
  inventory: {
    name:  String,
    model: String,
    extra: Object  // campos livres por device class
  },

  // Metadados do card
  meta: {
    version:     '2.0',                              // versão do framework
    source:      'zabbix' | 'api' | 'snmp' | 'prometheus',
    entity:      'storage' | 'switch' | 'server' | 'ups' | 'api',
    lastclock:   Number,  // timestamp Unix do último dado
    stale:       Boolean  // true se lastclock > staleThresholdSec
                          // ⚠️ stale eleva status para 'warn' (ou mantém 'down')
  }
}
```

> ⚠️ **Regra de validação:** Se um adapter não produzir este modelo exacto, o card não renderiza. O VIEW nunca aceita campos ad-hoc.

---

## 4. CORE Engine

Ficheiro: `bpc.kpi.core.js` — **nunca modificar sem versionamento**

```js
window.BPC_KPI = (function () {

  // ── Estado de um KPI individual
  function getState(val, thr) {
    if (!thr) return 'ok'
    if (val >= thr.crit) return 'down'
    if (val >= thr.warn) return 'warn'
    return 'ok'
  }

  // ── Status global: o pior KPI activo (não-null) define o todo
  function computeStatus(kpis) {
    const states = Object.values(kpis).filter(k => k !== null).map(k => k.state)
    if (states.includes('down')) return 'down'
    if (states.includes('warn')) return 'warn'
    return 'ok'
  }

  // ── Root cause: prioridade fixa (erros > latência > saturação > tráfego)
  //    Ignora KPIs null (não aplicáveis ao device class)
  function detectPrimaryIssue(kpis) {
    const priority = ['errors', 'latency', 'saturation', 'traffic']

    for (const k of priority) {
      if (kpis[k] !== null && kpis[k] && kpis[k].state !== 'ok') {
        return { type: k, message: MESSAGES[k] || 'Anomalia detectada' }
      }
    }
    return { type: 'none', message: 'Operação normal' }
  }

  const MESSAGES = {
    latency:    'Latência elevada',
    traffic:    'Carga de tráfego elevada',
    errors:     'Erros detectados',
    saturation: 'Capacidade elevada'
  }

  // ── SCHEMA por deviceClass (definido na secção 14 — referenciado aqui)
  //    Injectado em window.BPC_KPI_SCHEMA antes de ser usado
  const SCHEMA = window.BPC_KPI_SCHEMA || {}

  // ── Stale detection
  function checkStale(lastclock, staleThresholdSec) {
    const age = Math.floor(Date.now() / 1000) - lastclock
    return age > staleThresholdSec
  }

  // ── SCHEMA: auto-configura labels, thresholds e ícone por deviceClass
  //    CFG pode sobrepor qualquer campo — SCHEMA é o fallback
  function applySchema(cfg) {
    const s = SCHEMA[cfg.deviceClass]
    if (!s) return cfg
    return {
      ...cfg,
      icon:       cfg.icon       || s.icon,
      thresholds: cfg.thresholds || s.thresholds,
      kpiLabels:  cfg.kpiLabels  || s.kpiLabels
    }
  }

  // ── Sparkline automático: usa a série da métrica mais crítica activa
  function pickTrend(primary, trends, fallback) {
    if (primary.type !== 'none' && trends && trends[primary.type]) {
      return trends[primary.type]
    }
    return fallback || []
  }

  // ── Validator: garante que o DataModel está completo antes de sair do CORE
  function validateModel(m) {
    const required = ['status', 'primary_issue', 'kpis', 'trend', 'inventory', 'meta']
    const kpiKeys  = ['latency', 'traffic', 'errors', 'saturation']

    for (const f of required) {
      if (m[f] === undefined) throw new Error(`BPC_KPI: campo obrigatório ausente: ${f}`)
    }
    for (const k of kpiKeys) {
      const kpi = m.kpis[k]
      // KPI pode ser null (device class sem essa métrica), mas nunca undefined
      if (kpi !== null && kpi !== undefined) {
        if (typeof kpi.value !== 'number' || isNaN(kpi.value)) {
          throw new Error(`BPC_KPI: kpis.${k}.value inválido (${kpi.value})`)
        }
        if (!['ok', 'warn', 'down'].includes(kpi.state)) {
          throw new Error(`BPC_KPI: kpis.${k}.state inválido (${kpi.state})`)
        }
      }
    }
    const validTypes = ['errors', 'latency', 'saturation', 'traffic', 'none']
    if (!validTypes.includes(m.primary_issue.type)) {
      throw new Error(`BPC_KPI: primary_issue.type inválido (${m.primary_issue.type})`)
    }
  }

  // ── Normalizer: adapter metrics → KPI objects com state
  //    Aceita null para KPIs não aplicáveis ao device class
  function normalize(metrics, thr) {
    const result = {}
    const keys = ['latency', 'traffic', 'errors', 'saturation']

    for (const k of keys) {
      if (metrics[k] === null || metrics[k] === undefined) {
        result[k] = null  // KPI não aplicável — VIEW irá esconder o tile
        continue
      }
      const val = parseFloat(metrics[k])
      if (isNaN(val)) throw new Error(`BPC_KPI adapter: valor inválido para ${k} (${metrics[k]})`)
      result[k] = { value: val, unit: thr[k]?.unit || '', state: getState(val, thr[k]) }
    }
    return result
  }

  // ── Entry point principal: constrói o DataModel completo
  function buildModel(rawCfg, metrics, extra) {
    const cfg     = applySchema(rawCfg)           // SCHEMA aplicado automaticamente
    const thr     = cfg.thresholds
    const kpis    = normalize(metrics, thr)
    const primary = detectPrimaryIssue(kpis)
    const stale   = checkStale(extra.lastclock || 0, extra.staleThresholdSec || 300)

    // Stale influencia o status: dado velho nunca pode parecer OK
    let status = computeStatus(kpis)
    if (stale) status = (status === 'down') ? 'down' : 'warn'

    const trend = pickTrend(primary, extra.trends, extra.trend)

    const model = {
      status,
      primary_issue: primary,
      kpis,
      trend,
      inventory: extra.inventory || {},
      meta: {
        version:   '2.0',
        source:    extra.meta?.source    || 'unknown',
        entity:    extra.meta?.entity    || cfg.deviceClass || 'unknown',
        lastclock: extra.lastclock       || 0,
        stale
      }
    }

    validateModel(model)   // lança erro se contrato for violado
    return model
  }

  return { buildModel, getState, computeStatus, detectPrimaryIssue, applySchema, validateModel }

})()
```

---

## 5. Adapter Layer

Ficheiro: `adapters/[vendor].adapter.js` — **um ficheiro por vendor/tecnologia**

### Contrato do Adapter

```js
// Input:  raw data vindo da source (Zabbix items, API response, etc.)
// Output: { latency, traffic, errors, saturation }
//
// REGRAS OBRIGATÓRIAS:
//   1. Nunca usar || 0 silencioso — lançar erro se valor inválido
//   2. Usar null para KPIs não aplicáveis ao device class (ex: UPS sem latency)
//   3. Documentar sempre: unidade de origem → unidade do modelo
//   4. Nunca aceder à DOM, globals ou à API directamente

function [vendor]Adapter(rawItems) {
  const find = key => {
    const item = rawItems.find(i => i.key_ === key)
    if (!item) throw new Error(`Adapter: item não encontrado: ${key}`)
    return item.lastvalue
  }

  return {
    latency:    Number | null,  // ms  (null = não aplicável)
    traffic:    Number | null,  // MB/s
    errors:     Number | null,  // count
    saturation: Number | null   // %
  }
}
```

> ⚠️ **Strict mode:** O adapter DEVE lançar erro explícito se um item crítico estiver ausente ou retornar `NaN`. O CORE rejeita `NaN` no normalizer. Nunca usar `|| 0` para mascarar dados ausentes.

### Exemplo — Dell PowerStore

```js
function powerstoreAdapter(rawItems) {
  const find = key => {
    const v = parseFloat(rawItems.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`powerstoreAdapter: item inválido: ${key}`)
    return v
  }

  return {
    latency:    find('powerstore.volume.latency.read') / 1000,               // µs → ms
    traffic:    (find('powerstore.volume.bandwidth.read') +
                 find('powerstore.volume.bandwidth.write')) / 1_048_576,     // B/s → MB/s
    errors:     find('powerstore.disk.failed'),                               // count
    saturation: find('powerstore.capacity.used_pct')                          // %
  }
}
```

### Exemplo — VMware ESXi

```js
function vmwareAdapter(rawItems) {
  const find = key => {
    const v = parseFloat(rawItems.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`vmwareAdapter: item inválido: ${key}`)
    return v
  }

  return {
    latency:    find('vmware.vm.cpu.ready'),                    // ms
    traffic:    find('vmware.vm.net.usage') / 1024,             // KB/s → MB/s
    errors:     find('vmware.vm.net.packetslost'),               // count
    saturation: find('vmware.vm.cpu.usage.average')              // %
  }
}
```

### Exemplo — Cisco Switch (SNMP)

```js
function ciscoSwitchAdapter(rawItems) {
  const find = key => {
    const v = parseFloat(rawItems.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`ciscoSwitchAdapter: item inválido: ${key}`)
    return v
  }

  return {
    latency:    null,                                           // switch: latency não aplicável
    traffic:    find('net.if.in') / 1_048_576,                  // B/s → MB/s
    errors:     find('net.if.in.errors'),                        // count
    saturation: find('system.cpu.util')                          // %
  }
}
```

### Exemplo — UPS (Eaton/APC via SNMP)

```js
function upsAdapter(rawItems) {
  const find = key => {
    const v = parseFloat(rawItems.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`upsAdapter: item inválido: ${key}`)
    return v
  }

  return {
    latency:    null,                                           // UPS: latency não aplicável
    traffic:    find('ups.output.load'),                         // W (carga actual)
    errors:     find('ups.battery.fault'),                       // count (0 ou 1)
    saturation: find('ups.battery.charge')                       // % de carga restante
  }
}
```

> 📌 **Regra:** O adapter **nunca** chama a API directamente. Só transforma dados. A chamada à fonte é responsabilidade do `getData()` no bootstrap do card.

---

## 6. Normalizer

Integrado no CORE (`BPC_KPI.buildModel`). Não requer ficheiro separado.

Responsabilidades:

* Aplicar thresholds por KPI
* Atribuir `state: 'ok' | 'warn' | 'down'`
* **Rejeitar `NaN` com erro explícito** — nunca mascarar com `|| 0`
* **Suportar `null`** para KPIs não aplicáveis ao device class (ex: UPS sem latency)

> ✅ **Mudança v2.0:** O normalizer já  **não usa `|| 0` silencioso** . Se um valor for inválido, o erro é lançado no adapter (strict mode) antes de chegar ao normalizer. Se um KPI for `null` (não aplicável), o tile é escondido na VIEW.

**Unidades obrigatórias por KPI — definidas no SCHEMA de cada deviceClass:**

```js
// As unidades são agora parte do SCHEMA (secção 14), não hardcoded no normalizer
// O SCHEMA define: { unit: 'ms' } para latency, { unit: 'MB/s' } para traffic, etc.
// Cada deviceClass pode usar unidades semânticas diferentes (ex: UPS usa 'W' para traffic)
```

```js
// Exemplo de thresholds v2 — com unidade incluída
const THR_STORAGE = {
  latency:    { warn: 5,    crit: 15,   unit: 'ms'    },
  traffic:    { warn: 2000, crit: 4000, unit: 'MB/s'  },
  errors:     { warn: 1,    crit: 3,    unit: 'count' },
  saturation: { warn: 75,   crit: 90,   unit: '%'     }
}

const THR_UPS = {
  latency:    null,                                            // não aplicável
  traffic:    { warn: 1500, crit: 2000, unit: 'W'     },
  errors:     { warn: 1,    crit: 1,    unit: 'fault' },
  saturation: { warn: 30,   crit: 20,   unit: '%'     }       // ⚠️ invertido: menos = pior
}
```

---

## 7. Root Cause Engine

Integrado no CORE. Define a prioridade de causa raiz.

```
Prioridade (maior para menor):
  1. errors      → falha activa (disco morto, pacotes perdidos)
  2. latency     → degradação de performance
  3. saturation  → capacidade no limite
  4. traffic     → carga elevada (pode ser normal)
```

**Lógica de decisão:**

```js
// O primeiro KPI com state !== 'ok' torna-se a primary_issue
// Só um problema é apresentado de cada vez no card NOC
// Detalhes adicionais vão para o drilldown (Nível 2)
```

**Extensão futura — agregação de alarmes:**

```js
// Para NOC: em vez de "Disco 1 falhou", mostrar:
// primary_issue.message = "3 alarmes activos"
// primary_issue.count   = 3
// primary_issue.details = [...]  // para drilldown
```

---

## 8. View Layer

Ficheiro: `bpc.kpi.view.js` — **uma única UI para todos os cards**

> ✅ **Mudança v2.0:** A VIEW usa `cfg.kpiLabels` (vindo do SCHEMA) para os labels semânticos. Tiles com KPI `null` são escondidos automaticamente. Sparkline é sempre renderizada se `data.trend.length > 1` — sem flag `showSparkline` (eliminada).

```js
window.BPC_KPI_VIEW = (function () {

  function stateColor(state) {
    return state === 'down' ? 'bpc-crit'
         : state === 'warn' ? 'bpc-warn'
         : 'bpc-ok'
  }

  // Renderiza um tile KPI — retorna '' se kpi === null (não aplicável)
  function renderTile(label, kpi) {
    if (kpi === null) return ''  // tile escondido — KPI não aplicável a este device class
    return `
      <div class="bpc-kpi-tile ${stateColor(kpi.state)}">
        <span class="bpc-kpi-label">${label}</span>
        <span class="bpc-kpi-value">${Number.isInteger(kpi.value) ? kpi.value : kpi.value.toFixed(1)}</span>
        <span class="bpc-kpi-unit">${kpi.unit}</span>
      </div>`
  }

  function render(cfg, data) {
    const k      = data.kpis
    const labels = cfg.kpiLabels || { latency: 'Latência', traffic: 'Tráfego', errors: 'Erros', saturation: 'Saturação' }
    const stale  = data.meta.stale ? '<span class="bpc-badge-stale">STALE</span>' : ''
    const issue  = data.primary_issue.type !== 'none'
                   ? `<div class="bpc-issue">⚠ ${data.primary_issue.message}</div>`
                   : ''

    return `
    <div class="bpc bpc-card state-${data.status}" data-entity="${data.meta.entity}" data-version="${data.meta.version}">

      <!-- HEADER -->
      <div class="bpc-header">
        <span class="bpc-label">${cfg.icon} ${cfg.label}</span>
        <span class="bpc-pill state-${data.status}">${data.status.toUpperCase()}</span>
        ${stale}
      </div>

      <!-- PRIMARY ISSUE -->
      ${issue}

      <div class="bpc-divider"></div>

      <!-- KPI TILES — tiles null são omitidos automaticamente -->
      <div class="bpc-kpi-grid">
        ${renderTile(labels.latency,    k.latency)}
        ${renderTile(labels.traffic,    k.traffic)}
        ${renderTile(labels.errors,     k.errors)}
        ${renderTile(labels.saturation, k.saturation)}
      </div>

      <!-- SPARKLINE — automática se trend disponível (sem flag) -->
      ${data.trend.length > 1 ? renderSparkline(data.trend) : ''}

    </div>
    `
  }

  function renderSparkline(trend) {
    const max = Math.max(...trend)
    const min = Math.min(...trend)
    const w = 80, h = 24
    const pts = trend.map((v, i) => {
      const x = (i / (trend.length - 1)) * w
      const y = h - ((v - min) / (max - min || 1)) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    return `<svg class="bpc-spark" viewBox="0 0 ${w} ${h}" style="width:${w}px;height:${h}px">
              <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"/>
            </svg>`
  }

  return { render }

})()
```

---

## 9. Config por Card

Cada card é apenas uma config + adapter. Zero lógica adicional.

> ✅ **Mudança v2.0:** `buildModel` recebe agora `(CFG, metrics, extra)` — o CFG passa directamente para o CORE aplicar o SCHEMA automaticamente. `showSparkline` foi removido da CFG (sparkline é automática). `extra.trends` é um mapa de séries por KPI key.

```js
// card.san-storage.js
;(function () {

var CFG = {
  elementId:         'bpc-card-san-storage',
  label:             'SAN Storage',
  icon:              '💾',
  deviceClass:       'storage',
  refreshMs:         60_000,
  staleThresholdSec: 300
  // thresholds e kpiLabels: omitir para usar SCHEMA por defeito
  // thresholds: { ... }  ← só se quiser sobrepor o SCHEMA
}

// Adapter específico do PowerStore (strict mode)
function adapter(rawItems) {
  const find = key => {
    const v = parseFloat(rawItems.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`adapter: item inválido: ${key}`)
    return v
  }
  return {
    latency:    find('powerstore.volume.latency.read') / 1000,
    traffic:    (find('powerstore.volume.bandwidth.read') + find('powerstore.volume.bandwidth.write')) / 1_048_576,
    errors:     find('powerstore.disk.failed'),
    saturation: find('powerstore.capacity.used_pct')
  }
}

// Bootstrap
window.waitForBPC(function (rpc) {
  var u = window.BPC.utils

  u.waitForElement(CFG.elementId, function (el) {
    function load() {
      return getData(rpc, CFG).then(function (raw) {

        const metrics = adapter(raw.items)

        const model = BPC_KPI.buildModel(CFG, metrics, {
          trends:    raw.sparkTrends,   // { latency:[...], traffic:[...], errors:[...], saturation:[...] }
          inventory: raw.inventory,
          lastclock: raw.lastclock,
          staleThresholdSec: CFG.staleThresholdSec,
          meta: { source: 'zabbix' }
        })

        el.innerHTML = BPC_KPI_VIEW.render(CFG, model)
      }).catch(function (err) {
        console.error('[BPC] card error:', err)
        el.innerHTML = `<div class="bpc-card state-down">⚠ Erro: ${err.message}</div>`
      })
    }

    load()
    u.startRefresh(el, load, CFG.refreshMs)
  })
})

})()
```

> ✅ Para criar um novo card: copiar este template, alterar `CFG.deviceClass`, `CFG.label` e escrever o `adapter()`. O SCHEMA é aplicado automaticamente. O resto é zero-toque.

---

## 10. Pipeline Completo

```
getData(rpc, CFG)
    │
    ▼
adapter(raw.items)          ← strict mode: lança erro se NaN; null se KPI não aplicável
    │  { latency, traffic, errors, saturation }  (Number | null)
    ▼
BPC_KPI.buildModel(CFG, metrics, extra)
    │  applySchema(CFG)      ← SCHEMA aplicado automaticamente
    │  normalize()           ← NaN rejeitado; null propagado
    │  computeStatus()       ← ignora KPIs null
    │  detectPrimaryIssue()  ← ignora KPIs null
    │  stale → eleva status  ← stale nunca silencioso
    │  pickTrend()           ← série da métrica mais crítica activa
    │  validateModel()       ← contrato verificado; lança erro se inválido
    ▼
DataModel (contrato universal v2.0)
    │
    ▼
BPC_KPI_VIEW.render(CFG, model)
    │  labels de cfg.kpiLabels (do SCHEMA)
    │  tiles null → escondidos automaticamente
    │  sparkline automática se trend.length > 1
    ▼
el.innerHTML = HTML final
    │
    └─ .catch → render de erro explícito (nunca silencioso)
```

**Invariantes do pipeline:**

* `adapter()` nunca acede a globals nem à DOM
* `buildModel()` nunca acede à DOM
* `render()` nunca acede à source
* Demo e produção correm pelo **mesmo pipeline**
* Erros são sempre **explícitos e visíveis** — nunca silenciosos

---

## 11. Golden Signals & USE Model

O framework mapeia automaticamente para dois modelos de observabilidade reconhecidos:

| KPI Universal  | Google Golden Signals | USE Method  |
| -------------- | --------------------- | ----------- |
| `latency`    | Latency               | —          |
| `traffic`    | Traffic               | Utilization |
| `errors`     | Errors                | Errors      |
| `saturation` | Saturation            | Saturation  |

**Aplicabilidade por entity class:**

| Entity      | latency          | traffic         | errors            | saturation      |
| ----------- | ---------------- | --------------- | ----------------- | --------------- |
| `storage` | I/O latency (ms) | Throughput MB/s | Disk failures     | Capacity used % |
| `switch`  | Interface errors | Bandwidth MB/s  | Packet loss count | CPU util %      |
| `server`  | CPU ready (ms)   | Net MB/s        | Packet loss       | CPU/RAM %       |
| `ups`     | —               | Load W          | Battery faults    | Battery %       |
| `api`     | Response ms      | Req/s           | HTTP 5xx count    | Queue depth     |

---

## 12. Threshold Strategy

O framework suporta 3 modos de threshold (evolução progressiva):

```js
thresholds: {
  mode: 'static' | 'relative' | 'baseline',

  // static: valores fixos (default, usar hoje)
  latency: { warn: 5, crit: 15 },

  // relative: % da capacidade máxima
  // latency: { warn: 0.7, crit: 0.9, maxCapacity: 20 }

  // baseline: desvio-padrão do histórico (futuro)
  // latency: { warn: 2.0, crit: 3.0, unit: 'sigma' }
}
```

**Recomendação de adopção:**

| Fase | Modo         | Quando usar                                          |
| ---- | ------------ | ---------------------------------------------------- |
| MVP  | `static`   | Agora — valores conhecidos pela operação          |
| V2   | `relative` | Quando a capacidade máxima é conhecida e variável |
| V3   | `baseline` | Com histórico de 30+ dias disponível               |

---

## 13. NOC Design Rules

Regras obrigatórias para o VIEW em contexto de TV/NOC:

| Elemento                      | Regra                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| **Font size KPI value** | Mínimo 18px. Recomendado 24px para o valor principal              |
| **Font size labels**    | Mínimo 12px                                                       |
| **Estado global**       | O fundo do card (`.bpc-card`) DEVE mudar de cor com o estado     |
| **Pill de estado**      | Complementar, nunca o único indicador                             |
| **Stale badge**         | Obrigatório quando `meta.stale === true`                        |
| **Animação em down**  | O card DEVE pulsar/blink quando `status === 'down'`              |
| **Inventário**         | Firmware, modelo, versão → só no drilldown (Nível 2)           |
| **Sparkline**           | Mostrar a métrica mais crítica activa, não sempre IOPS          |
| **Alarmes**             | Mostrar contador "N alarmes" em vez de lista de detalhes           |
| **Cor semáforo**       | `ok`= verde,`warn`= âmbar,`down`= vermelho. Sem excepções |

**CSS classes obrigatórias:**

```css
.state-ok   { border-left: 3px solid var(--color-ok);   background: var(--bg-ok-subtle);   }
.state-warn { border-left: 3px solid var(--color-warn); background: var(--bg-warn-subtle); }
.state-down { border-left: 3px solid var(--color-crit); background: var(--bg-crit-subtle);
              animation: blink-border 1.2s ease-in-out infinite; }

.bpc-kpi-value { font-size: 24px; font-weight: 600; line-height: 1; }
.bpc-kpi-label { font-size: 11px; text-transform: uppercase; opacity: 0.7; }
.bpc-kpi-unit  { font-size: 12px; opacity: 0.8; }
.bpc-badge-stale { font-size: 10px; background: #888; color: #fff;
                   padding: 1px 5px; border-radius: 3px; }
```

---

## 14. Schema por Device Class

O SCHEMA é o único lugar onde se definem labels semânticos, thresholds por defeito e ícones. É aplicado **automaticamente pelo CORE** via `applySchema(cfg)` — nunca precisa ser chamado manualmente.

> ✅ **v2.0:** Thresholds incluem `unit`. KPIs não aplicáveis têm `null` no threshold (normalizer propaga `null` para o KPI, VIEW esconde o tile).

```js
// bpc.kpi.schema.js — carregado ANTES do core
window.BPC_KPI_SCHEMA = {

  'storage': {
    icon: '💾',
    kpiLabels: { latency: 'I/O Lat', traffic: 'Throughput', errors: 'Disk Err', saturation: 'Capacity' },
    thresholds: {
      latency:    { warn: 5,    crit: 15,   unit: 'ms'    },
      traffic:    { warn: 2000, crit: 4000, unit: 'MB/s'  },
      errors:     { warn: 1,    crit: 3,    unit: 'count' },
      saturation: { warn: 75,   crit: 90,   unit: '%'     }
    }
  },

  'switch': {
    icon: '🔀',
    kpiLabels: { latency: null, traffic: 'Bandwidth', errors: 'Pkt Loss', saturation: 'CPU' },
    thresholds: {
      latency:    null,                                               // não aplicável
      traffic:    { warn: 800,  crit: 950,  unit: 'MB/s'  },
      errors:     { warn: 1,    crit: 10,   unit: 'count' },
      saturation: { warn: 70,   crit: 90,   unit: '%'     }
    }
  },

  'server': {
    icon: '🖥️',
    kpiLabels: { latency: 'CPU Ready', traffic: 'Net MB/s', errors: 'Pkt Loss', saturation: 'CPU %' },
    thresholds: {
      latency:    { warn: 20,  crit: 80,   unit: 'ms'    },
      traffic:    { warn: 500, crit: 900,  unit: 'MB/s'  },
      errors:     { warn: 1,   crit: 5,    unit: 'count' },
      saturation: { warn: 80,  crit: 95,   unit: '%'     }
    }
  },

  'ups': {
    icon: '🔋',
    kpiLabels: { latency: null, traffic: 'Load', errors: 'Bat Fault', saturation: 'Battery' },
    thresholds: {
      latency:    null,                                               // não aplicável
      traffic:    { warn: 1500, crit: 2000, unit: 'W'     },
      errors:     { warn: 1,    crit: 1,    unit: 'fault' },
      saturation: { warn: 30,   crit: 20,   unit: '%'     }          // ⚠️ invertido: menos % = pior
    }
  },

  'api': {
    icon: '🌐',
    kpiLabels: { latency: 'Response', traffic: 'Req/s', errors: 'HTTP 5xx', saturation: 'Queue' },
    thresholds: {
      latency:    { warn: 500,  crit: 2000, unit: 'ms'    },
      traffic:    { warn: 1000, crit: 5000, unit: 'req/s' },
      errors:     { warn: 1,    crit: 10,   unit: 'count' },
      saturation: { warn: 80,   crit: 95,   unit: '%'     }
    }
  }

}
```

**Com Zabbix Tags (auto-discovery):**

```js
// Em vez de groupid: 602 (hardcoded), usar:
// Host tag: Class=Storage → deviceClass='storage'
// O CORE aplica o SCHEMA automaticamente via applySchema(cfg)

function resolveDeviceClass(hostTags) {
  const classTag = hostTags.find(t => t.tag === 'Class')
  const cls = classTag?.value?.toLowerCase()
  return window.BPC_KPI_SCHEMA[cls] ? cls : 'server'  // fallback para 'server'
}
```

> ⚠️ **Nota sobre thresholds invertidos (UPS battery):** O `getState` padrão assume que valor alto = pior. Para métricas onde valor baixo = pior (ex: battery %), o adapter deve transformar: `saturation: 100 - find('ups.battery.charge')` — assim 70% de bateria vira 30% de saturação, e o threshold funciona normalmente.

---

## 15. Como Criar um Novo Card

### Checklist (5 passos)

```
[ ] 1. Definir CFG (elementId, label, deviceClass — thresholds/icon opcionais se SCHEMA cobrir)
[ ] 2. Escrever adapter() — strict mode, null para KPIs não aplicáveis, documentar unidades
[ ] 3. Confirmar que adapter() lança erro para NaN (nunca usa || 0 silencioso)
[ ] 4. Copiar template bootstrap (secção 9): buildModel(CFG, metrics, extra)
[ ] 5. Testar com getDemoData() → buildModel → render antes de ligar à source real
```

### Tempo estimado

| Card                                      | Tempo   |
| ----------------------------------------- | ------- |
| Novo vendor com items conhecidos          | ~30 min |
| Novo vendor com discovery de items        | ~2h     |
| Novo deviceClass (nova entrada no SCHEMA) | ~15 min |

### getDemoData() — template obrigatório

```js
function getDemoData() {
  const metrics = {
    latency:    12.5,   // ms — valor de exemplo
    traffic:    850,    // MB/s
    errors:     2,      // count
    saturation: 78      // %
  }
  return BPC_KPI.buildModel(CFG, metrics, {
    trends:    { latency: [8,9,10,11,12,12.5], errors: [0,0,1,1,2,2] },
    inventory: { name: 'DEMO-HOST', model: 'Demo Model' },
    lastclock: Math.floor(Date.now() / 1000),
    staleThresholdSec: CFG.staleThresholdSec,
    meta: { source: 'demo' }
  })
}
```

---

## 16. Prompt Base para Geração de Cards

> Este é o prompt que deve ser passado a qualquer IA para gerar um novo card dentro deste framework.

---

```text
Gera um card BPC NOC para Grafana Dynamic Text seguindo
EXACTAMENTE o modelo de FRAMEWORK KPI abaixo.

⚠️ ESTE NÃO É UM CARD LIVRE.
É uma instância de um FRAMEWORK reutilizável.

O output DEVE respeitar o contrato universal v2.0.
Qualquer violação invalida o card.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ARQUITETURA OBRIGATÓRIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O card DEVE implementar estas camadas em ordem:

[1] CFG        (configuração — zero lógica)
[2] ADAPTER    (raw → métricas base)
[3] getDemoData (raw data simulado — NÃO model KPI)
[4] getData    (raw data real — NÃO model KPI)
[5] build()    (adapter + BPC_KPI.buildModel)
[6] render()   (BPC_KPI_VIEW.render — sem UI custom)
[7] Bootstrap  (load + refresh + catch)

❌ PROIBIDO:
- lógica de KPI no render
- UI custom por card
- cálculos fora do adapter/build
- || 0 silencioso no adapter

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 CONTRATO UNIVERSAL v2.0 (OBRIGATÓRIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O card DEVE produzir EXACTAMENTE este DataModel:

```js
{
  status: 'ok' | 'warn' | 'down',
  // ⚠️ stale eleva status para 'warn' automaticamente — nunca silencioso

  primary_issue: {
    type: 'errors' | 'latency' | 'saturation' | 'traffic' | 'none',
    // ⚠️ 'none' é obrigatório para o caso "tudo OK"
    message: string
  },

  kpis: {
    latency:    { value, unit, state } | null,
    traffic:    { value, unit, state } | null,
    errors:     { value, unit, state } | null,
    saturation: { value, unit, state } | null
    // ⚠️ null = KPI não aplicável ao device class (ex: UPS sem latency)
    // ⚠️ tile null é escondido automaticamente pela VIEW
  },

  trend: number[],   // escolhido automaticamente pelo CORE (pickTrend)
  inventory: object,
  meta: { version: '2.0', source, entity, lastclock, stale }
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 1 · CFG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DEVE conter APENAS configuração — zero lógica:

```js
var CFG = {
  elementId,
  label,
  icon,          // omitir para usar ícone do SCHEMA
  deviceClass,   // 'storage'|'switch'|'server'|'ups'|'api'
  dashUid,
  refreshMs,
  staleThresholdSec,

  // thresholds: OMITIR para usar SCHEMA por defeito
  // só preencher se precisar sobrepor o SCHEMA
  thresholds: {
    latency:    { warn, crit } | null,   // null = KPI não aplicável
    traffic:    { warn, crit } | null,
    errors:     { warn, crit } | null,
    saturation: { warn, crit } | null
  },

  queryStrategy,
  tagName,
  tagValue,
  groupid,
  itemKeys,
  demo
}
```

❌ PROIBIDO em CFG: lógica, cálculos, estados, funções

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 2 · ADAPTER (OBRIGATÓRIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Transforma raw data → métricas base universais.
ESTE BLOCO É O ÚNICO PONTO VARIÁVEL ENTRE TECNOLOGIAS.

```js
function adapter(raw) {
  const find = key => {
    const v = parseFloat(raw.items.find(i => i.key_ === key)?.lastvalue)
    if (isNaN(v)) throw new Error(`adapter: item inválido: ${key}`)
    return v
  }

  return {
    latency:    number | null,   // ms      (null = não aplicável)
    traffic:    number | null,   // MB/s
    errors:     number | null,   // count
    saturation: number | null    // %
  }
}
```

⚠️ STRICT MODE OBRIGATÓRIO:

- lançar Error explícito para NaN
- NUNCA usar || 0 silencioso
- null para KPIs não aplicáveis ao device class
- documentar unidade de origem → unidade do modelo (ex: µs → ms)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 3 · getDemoData()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Retorna RAW DATA (não DataModel) — passa pelo mesmo pipeline que produção:

```js
function getDemoData() {
  return {
    items: [
      { key_: 'vendor.metric.key', lastvalue: '12.5' },
      // ... outros items necessários ao adapter
    ],
    trends:    { latency: [...], errors: [...] },  // mapa por KPI key
    inventory: { name: 'DEMO-HOST', model: 'Demo Model' },
    lastclock: Math.floor(Date.now() / 1000)
  }
}
```

❌ NÃO retornar kpis, status ou DataModel aqui
❌ NÃO retornar HTML hardcoded

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 4 · getData(rpc)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Retorna RAW DATA com a mesma estrutura que getDemoData():

❌ NÃO calcular KPIs aqui
❌ NÃO calcular status aqui
✔ Estrutura de retorno idêntica ao getDemoData

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 5 · build(raw) — OBRIGATÓRIO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```js
function build(raw) {
  const metrics = adapter(raw)

  return BPC_KPI.buildModel(
    CFG,        // ⚠️ CFG é o 1º argumento — CORE aplica SCHEMA automaticamente
    metrics,    // { latency, traffic, errors, saturation } — Number | null
    {
      trends:            raw.trends,      // mapa por KPI key — NÃO array simples
      inventory:         raw.inventory,
      lastclock:         raw.lastclock,
      staleThresholdSec: CFG.staleThresholdSec,
      meta: { source: 'zabbix' }          // entity é inferido do CFG.deviceClass
    }
  )
}
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 6 · render(model, isDemo, errorMsg)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ UI CUSTOM É PROIBIDA

```js
function render(model, isDemo, errorMsg) {
  const badge = isDemo    ? '<span class="bpc-badge-demo">DEMO</span>'   : ''
  const error = errorMsg  ? `<div class="bpc-error-bar">⚠ ${errorMsg}</div>` : ''

  return `
    <a href="/d/${CFG.dashUid}" target="_blank">
      ${BPC_KPI_VIEW.render(CFG, model)}
    </a>
    ${badge}${error}
  `
}
```

Pode apenas adicionar: wrapper link, badge DEMO, error bar.
❌ NÃO alterar o output de BPC_KPI_VIEW.render

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BLOCO 7 · Bootstrap
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

```js
window.waitForBPC(function (rpc) {
  window.BPC.utils.waitForElement(CFG.elementId, function (el) {

    function load() {
      if (CFG.demo) {
        el.innerHTML = render(build(getDemoData()), true, null)
        return Promise.resolve()
      }

      return getData(rpc)
        .then(raw => {
          el.innerHTML = render(build(raw), false, null)
        })
        .catch(e => {
          BPC.log('[BPC] card error:', e)
          el.innerHTML = render(build(getDemoData()), true, e.message)
          // ⚠️ erro nunca silencioso — fallback para demo + mensagem visível
        })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG.refreshMs)
  })
})
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS CRÍTICAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✔ Adapter é o ÚNICO ponto variável entre tecnologias
✔ View é SEMPRE a mesma (BPC_KPI_VIEW.render)
✔ Modelo é SEMPRE o mesmo (DataModel v2.0)
✔ SCHEMA é aplicado automaticamente — thresholds em CFG são opcionais
✔ Card = CFG + Adapter + Data (< 60 linhas excluindo CORE/SCHEMA/VIEW)

❌ NÃO inventar novos KPIs
❌ NÃO alterar estrutura do DataModel
❌ NÃO misturar lógica no render
❌ NÃO usar || 0 silencioso no adapter
❌ NÃO passar thresholds directamente ao buildModel (vai em CFG)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INPUT DO CARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  VENDOR / TECNOLOGIA : [PREENCHER — ex: "Cisco ASA Firewall"]
  DEVICE CLASS        : [PREENCHER — ex: "switch" | "storage" | "server" | "ups" | "api"]
  SOURCE              : [PREENCHER — ex: "Zabbix 7.4 via API REST"]
  ITEM KEYS RELEVANTES: [PREENCHER — ex: lista das keys do Zabbix ou campos da API]
  THRESHOLDS          : [PREENCHER — ou omitir para usar SCHEMA por defeito]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CHECKLIST DE VALIDAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

O card está correcto se:
  [ ] adapter() lança Error para NaN — nunca usa || 0
  [ ] adapter() retorna null para KPIs não aplicáveis
  [ ] build() chama buildModel(CFG, metrics, extra) — CFG é 1º arg
  [ ] extra.trends é { latency:[...], errors:[...] } — não array simples
  [ ] getDemoData() retorna raw data (não DataModel nem HTML)
  [ ] getData() retorna estrutura idêntica ao getDemoData()
  [ ] render() usa BPC_KPI_VIEW.render sem modificações
  [ ] load() tem .catch com fallback demo + mensagem de erro visível
  [ ] primary_issue.type é um de: errors|latency|saturation|traffic|none
  [ ] Card tem < 60 linhas (excluindo CORE/SCHEMA/VIEW)

```


---


## Apêndice A — Glossário


| Termo                       | Definição                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- |
| **DataModel**         | Output JSON universal produzido por qualquer card                                           |
| **Adapter**           | Função que transforma raw data de um vendor em metrics universais                         |
| **Strict mode**       | Adapter lança erro explícito para NaN — nunca usa`\|\| 0`silencioso                    |
| **Normalizer**        | Parte do CORE que aplica thresholds e gera KPI objects com state                            |
| **Root Cause Engine** | Lógica que elege o problema mais prioritário para exibir no card                          |
| **Stale**             | Dado com`lastclock`mais antigo que`staleThresholdSec`— eleva status para`warn` |
| **KPI null**          | KPI não aplicável ao device class — tile é escondido na VIEW automaticamente            |
| **SCHEMA**            | Mapa de configuração por deviceClass: labels, thresholds, ícone                          |
| **applySchema**       | Função do CORE que funde CFG + SCHEMA — chamada automaticamente em buildModel            |
| **validateModel**     | Função do CORE que verifica o contrato antes de retornar o DataModel                      |
| **pickTrend**         | Função do CORE que escolhe a série temporal da métrica mais crítica activa             |
| **deviceClass**       | Tipo semântico do equipamento: storage, switch, server, ups, api                           |
| **trends**            | Mapa de séries temporais por KPI key:`{ latency:[...], errors:[...] }`                 |
| **Golden Signals**    | Latency, Traffic, Errors, Saturation — os 4 KPIs universais do Google SRE                  |
| **USE Method**        | Utilization, Saturation, Errors — modelo de observabilidade da Brendan Gregg               |
| **NOC**               | Network Operations Center — sala de operações com TVs de monitoramento                   |
| **Drilldown**         | Nível 2 de detalhe — acedido ao clicar no card, contém inventário e histórico          |


---


## Apêndice B — Changelog


| Versão        | Data        | Alterações                                                                                                                                                      |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v1.0** | inicial     | Framework base: 4 camadas, contrato universal, SCHEMA decorativo                                                                                                  |
| **v2.0** | correcção | 7 fixes críticos: contrato unificado, stale→status, validateModel, KPI null, SCHEMA integrado no CORE, adapter strict mode, sparkline automática via pickTrend |
```
