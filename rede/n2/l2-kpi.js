// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · KPI STRIP  v1.0                                 ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  4 cards:                                                                ║
// ║    DC Core (grupos 26+27 — 12 dispositivos)                             ║
// ║    Edifícios Routers (grupo 28 — 9 routers)                             ║
// ║    Edifícios Switches (grupo 29 — 46 switches)                          ║
// ║    Alertas (todos os grupos 26+27+28+29)                                ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_KPI_NET = {
  elementId: 'bpc-net-kpi',
  refreshMs:  60000,

  grupos: {
    dc:   ['26', '27'],   // HG_DC_SWITCHES + HG_DC_ROUTERS
    edRt: ['28'],         // HG_EDIFICIOS_ROUTERS
    edSw: ['29'],         // HG_EDIFICIOS_SWITCHES
    all:  ['26', '27', '28', '29'],
  },

  // ICMP — thresholds para classificar como "degradado"
  rttWarnMs:   5,    // RTT acima disto → warn (redes locais ≤5ms é normal)
  lossWarnPct: 1,    // qualquer perda de pacotes → warn

  // Triggers — o que conta como crítico vs aviso
  trigPriority: { crit: [4, 5], warn: [2, 3], info: [0, 1] },

  // Labels dos cards
  labels: {
    dc:   'DC Core',
    edRt: 'Edifícios · Routers',
    edSw: 'Edifícios · Switches',
    alrt: 'Alertas',
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function kpiNetEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function kpiNetPrioState(p) {
  p = parseInt(p, 10)
  if (CFG_KPI_NET.trigPriority.crit.indexOf(p) !== -1) return 'crit'
  if (CFG_KPI_NET.trigPriority.warn.indexOf(p) !== -1) return 'warn'
  return 'info'
}

// Classifica um host a partir de ICMP: down | warn | ok
function kpiNetIcmpState(up, rttMs, lossPct) {
  if (up === false || up === null) return 'down'
  if (lossPct > CFG_KPI_NET.lossWarnPct) return 'warn'
  if (rttMs   > CFG_KPI_NET.rttWarnMs)   return 'warn'
  return 'ok'
}

// Pior estado de uma lista
function kpiNetWorst(states) {
  if (states.indexOf('down') !== -1) return 'down'
  if (states.indexOf('crit') !== -1) return 'crit'
  if (states.indexOf('warn') !== -1) return 'warn'
  return 'ok'
}

function kpiNetStateAccent(s) {
  const T = window.BPC.THEME
  return { ok: T.colorOk, warn: T.colorWarn, crit: T.colorCrit, down: T.colorCrit }[s] || T.colorMute
}

function kpiNetStatePill(s) {
  const labels = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }
  const cls    = { ok: 'ok', warn: 'warn', crit: 'down', down: 'down' }
  return `<span class="bpc-pill ${cls[s] || 'ok'}">${labels[s] || '—'}</span>`
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

// Busca items ICMP de um array de groupIds e devolve { total, down, warn, ok, avgRtt, avgLoss }
async function kpiNetFetchIcmp(rpc, groupIds) {
  const items = await rpc('item.get', {
    groupids: groupIds,
    search:   { key_: 'icmpping' },
    filter:   { status: 0 },
    output:   ['hostid', 'key_', 'lastvalue', 'lastclock'],
  })

  const byHost = {}
  items.forEach(function (i) {
    if (!byHost[i.hostid]) byHost[i.hostid] = { up: null, rtt: 0, loss: 0 }
    const h = byHost[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })

  const hosts  = Object.values(byHost)
  const total  = hosts.length
  const states = hosts.map(function (h) { return kpiNetIcmpState(h.up, h.rtt, h.loss) })
  const down   = states.filter(function (s) { return s === 'down' }).length
  const warn   = states.filter(function (s) { return s === 'warn' }).length
  const ok     = total - down - warn

  const upHosts = hosts.filter(function (h) { return h.up !== false })
  const avgRtt  = upHosts.length
    ? upHosts.reduce(function (a, h) { return a + h.rtt }, 0) / upHosts.length
    : 0
  const avgLoss = upHosts.length
    ? upHosts.reduce(function (a, h) { return a + h.loss }, 0) / upHosts.length
    : 0

  return { total, down, warn, ok, avgRtt, avgLoss, worstState: kpiNetWorst(states) }
}

// Busca triggers activos para todos os grupos
async function kpiNetFetchTriggers(rpc, groupIds) {
  const trigs = await rpc('trigger.get', {
    groupids:    groupIds,
    filter:      { value: 1 },
    output:      ['priority'],
    monitored:   true,
    only_true:   true,
  })

  let crit = 0, warn = 0
  trigs.forEach(function (t) {
    const s = kpiNetPrioState(t.priority)
    if (s === 'crit') crit++
    else if (s === 'warn') warn++
  })
  return { crit, warn }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function kpiNetRenderIcmpCard(label, d) {
  const S      = window.BPC_SHARED
  const accent = kpiNetStateAccent(d.worstState)
  const avail  = d.total > 0 ? Math.round((d.ok / d.total) * 100) : 100
  const availCls = avail === 100 ? 'bpc-ok' : avail >= 80 ? 'bpc-warn' : 'bpc-crit'
  const rttFmt   = d.down === d.total ? '—' : (d.avgRtt).toFixed(1) + ' ms'
  const lossFmt  = d.down === d.total ? '—' : (d.avgLoss).toFixed(1) + '%'
  const lossCls  = d.avgLoss > CFG_KPI_NET.lossWarnPct ? 'bpc-warn' : d.avgLoss > 0 ? 'bpc-warn' : 'bpc-ok'

  return `
    <div class="bpc bpc-card state-${d.worstState === 'crit' || d.worstState === 'down' ? 'down' : d.worstState}"
         style="--card-accent:${accent};height:100%;display:flex;flex-direction:column;gap:10px">

      <!-- Cabeçalho -->
      <div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">
        <div style="font-size:1.08rem;font-weight:700;color:#E6EDF3;line-height:1.2">${kpiNetEsc(label)}</div>
        ${kpiNetStatePill(d.worstState)}
      </div>

      <!-- Contadores -->
      <div class="bpc-flex bpc-gap-12">
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-lg">${d.total}</span>
          <span class="bpc-label">Total</span>
        </div>
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-md bpc-crit">${d.down}</span>
          <span class="bpc-label">Down</span>
        </div>
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-md bpc-warn">${d.warn}</span>
          <span class="bpc-label">Degradado</span>
        </div>
        <div class="bpc-flex-col bpc-gap-4" style="margin-left:auto;text-align:right">
          <span class="bpc-value-md ${availCls}">${avail}%</span>
          <span class="bpc-label">Disponib.</span>
        </div>
      </div>

      <!-- RTT + Loss -->
      <div class="bpc-flex bpc-gap-12" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-sm bpc-info">${kpiNetEsc(rttFmt)}</span>
          <span class="bpc-label">RTT médio</span>
        </div>
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-sm ${lossCls}">${kpiNetEsc(lossFmt)}</span>
          <span class="bpc-label">Perda média</span>
        </div>
      </div>

    </div>`
}

function kpiNetRenderAlertsCard(d) {
  const state  = d.crit > 0 ? 'crit' : d.warn > 0 ? 'warn' : 'ok'
  const accent = kpiNetStateAccent(state)

  return `
    <div class="bpc bpc-card state-${state === 'crit' ? 'down' : state}"
         style="--card-accent:${accent};height:100%;display:flex;flex-direction:column;gap:10px">

      <div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">
        <div style="font-size:1.08rem;font-weight:700;color:#E6EDF3">Alertas</div>
        ${kpiNetStatePill(state)}
      </div>

      <div class="bpc-flex bpc-gap-12">
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-lg bpc-crit">${d.crit}</span>
          <span class="bpc-label">Crítico</span>
        </div>
        <div class="bpc-flex-col bpc-gap-4">
          <span class="bpc-value-lg bpc-warn">${d.warn}</span>
          <span class="bpc-label">Aviso</span>
        </div>
      </div>

      <div style="font-size:.96rem;color:var(--bpc-mute);margin-top:auto">
        Grupos DC + Edifícios
      </div>

    </div>`
}

function kpiNetRender(el, results) {
  const [dc, edRt, edSw, trigs] = results
  const L = CFG_KPI_NET.labels

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">
      <div>${kpiNetRenderIcmpCard(L.dc,   dc)}</div>
      <div>${kpiNetRenderIcmpCard(L.edRt, edRt)}</div>
      <div>${kpiNetRenderIcmpCard(L.edSw, edSw)}</div>
      <div>${kpiNetRenderAlertsCard(trigs)}</div>
    </div>`
}

function kpiNetRenderError(el, msg) {
  el.innerHTML = `<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">
    <div class="bpc-error-msg">⚠ KPI Rede: ${kpiNetEsc(msg)}</div>
  </div>`
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function kpiNetLoad(rpc) {
  const el = document.getElementById(CFG_KPI_NET.elementId)
  if (!el) return

  // Skeleton enquanto carrega
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">
      ${[0,1,2,3].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')}
    </div>`

  Promise.all([
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.dc),
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.edRt),
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.edSw),
    kpiNetFetchTriggers(rpc, CFG_KPI_NET.grupos.all),
  ])
  .then(function (results) { kpiNetRender(el, results) })
  .catch(function (err) { kpiNetRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { kpiNetLoad(rpc) }, CFG_KPI_NET.refreshMs)
}

function kpiNetInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(kpiNetLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-kpi-net: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { kpiNetInitWithRetry(attempt + 1) }, 100)
}

kpiNetInitWithRetry()
