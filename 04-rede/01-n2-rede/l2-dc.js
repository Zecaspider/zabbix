// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · DC CORE  v1.0                                   ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Tabela DC Core — grupos 26 (switches) + 27 (routers)                  ║
// ║  12 dispositivos Cisco Nexus + ISR/C8xxx                                ║
// ║                                                                          ║
// ║  Colunas: Estado · Host · Função · Modelo · RTT · Perda% · CPU% ·      ║
// ║           Uptime · Triggers                                              ║
// ║                                                                          ║
// ║  Tags Zabbix usadas: funcao, modelo (lidas via item system.hw.model)    ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] COMPUTE   [5] RENDER          ║
// ║  [6] BOOTSTRAP                                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_DC = {
  elementId:  'bpc-net-dc',
  groupIds:   ['26', '27'],
  refreshMs:  60000,

  // Drill-down N3 (dashboard a criar)
  n3DashUid:  null,   // preencher quando N3 existir

  thresholds: {
    rttMs:   { warn:  5,  crit:  50 },
    lossPct: { warn:  1,  crit:  10 },
    cpuPct:  { warn: 60,  crit:  85 },
  },

  maxAgeSec: 600,   // dados mais velhos que 10min → stale (SNMP polling ~5min)

  // Ordem de exibição por funcao (tag Zabbix)
  funcaoOrder: [
    'switch-spine', 'switch-leaf',
    'gateway', 'wan-internet', 'wan-agencias', 'wan-parceiro',
  ],

  // Labels amigáveis para a coluna Função
  funcaoLabel: {
    'switch-spine':  'SPINE',
    'switch-leaf':   'LEAF',
    'gateway':       'Gateway',
    'wan-internet':  'WAN Internet',
    'wan-agencias':  'WAN Agências',
    'wan-parceiro':  'WAN Parceiro',
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function dcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function dcStateColor(s) {
  const T = window.BPC.THEME
  return { ok: T.colorOk, warn: T.colorWarn, crit: T.colorCrit, down: T.colorCrit, mute: T.colorMute }[s] || T.colorMute
}

function dcStateDot(s) {
  const c = dcStateColor(s)
  const pulse = (s === 'down') ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};flex-shrink:0;${pulse}"></span>`
}

function dcFmtRtt(ms) {
  if (ms == null || isNaN(ms)) return '—'
  return ms.toFixed(1) + ' ms'
}

function dcFmtLoss(pct) {
  if (pct == null || isNaN(pct)) return '—'
  if (pct === 0) return '<span class="bpc-ok">0%</span>'
  const cls = pct >= CFG_DC.thresholds.lossPct.crit ? 'bpc-crit' : 'bpc-warn'
  return `<span class="${cls}">${pct.toFixed(1)}%</span>`
}

function dcFmtCpu(pct) {
  if (pct == null || isNaN(pct)) return '<span class="bpc-mute">—</span>'
  const cls = pct >= CFG_DC.thresholds.cpuPct.crit ? 'bpc-crit'
            : pct >= CFG_DC.thresholds.cpuPct.warn ? 'bpc-warn' : 'bpc-ok'
  return `<span class="${cls}">${pct.toFixed(0)}%</span>`
}

function dcFmtUptime(secs) {
  if (!secs || isNaN(secs)) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  if (d > 0) return d + 'd ' + h + 'h'
  const m = Math.floor((secs % 3600) / 60)
  return h + 'h ' + m + 'm'
}

function dcStateAbove(v, t) {
  if (v == null || isNaN(v)) return 'ok'
  if (v >= t.crit) return 'crit'
  if (v >= t.warn) return 'warn'
  return 'ok'
}

function dcWorstState(states) {
  if (states.indexOf('down') !== -1) return 'down'
  if (states.indexOf('crit') !== -1) return 'crit'
  if (states.indexOf('warn') !== -1) return 'warn'
  return 'ok'
}

function dcIsStale(lastclock) {
  return !lastclock || (Math.floor(Date.now() / 1000) - parseInt(lastclock, 10)) > CFG_DC.maxAgeSec
}

function dcFuncaoOrder(f) {
  const idx = CFG_DC.funcaoOrder.indexOf(f)
  return idx >= 0 ? idx : 99
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function dcFetch(rpc) {
  // Busca paralela: hosts, items ICMP + sistema + CPU, triggers activos
  const [hosts, items, triggers, tags] = await Promise.all([
    rpc('host.get', {
      groupids: CFG_DC.groupIds,
      output:   ['hostid', 'host', 'name'],
      filter:   { status: 0 },
    }),
    rpc('item.get', {
      groupids: CFG_DC.groupIds,
      filter:   { status: 0 },
      output:   ['hostid', 'key_', 'lastvalue', 'lastclock', 'units'],
      searchByAny: true,
      search:   { key_: ['icmpping', 'icmppingsec', 'icmppingloss', 'system.uptime', 'system.hw.model'] },
    }),
    rpc('trigger.get', {
      groupids:  CFG_DC.groupIds,
      filter:    { value: 1 },
      output:    ['triggerid', 'hostid', 'priority', 'description'],
      monitored: true,
      only_true: true,
    }),
    rpc('host.get', {
      groupids: CFG_DC.groupIds,
      output:   ['hostid'],
      selectTags: ['tag', 'value'],
      filter:   { status: 0 },
    }),
  ])

  return { hosts, items, triggers, tags }
}

// Busca itens CPU separadamente (LLD — key diferente)
async function dcFetchCpu(rpc, hostIds) {
  if (!hostIds.length) return []
  return rpc('item.get', {
    hostids: hostIds,
    filter:  { status: 0 },
    output:  ['hostid', 'key_', 'lastvalue', 'lastclock'],
    search:  { key_: 'system.cpu.util' },
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function dcCompute(data, cpuItems) {
  const { hosts, items, triggers, tags } = data

  // Índice de items por hostid
  const byHost = {}
  hosts.forEach(function (h) { byHost[h.hostid] = { host: h, icmpUp: null, rtt: null, loss: null, uptime: null, model: null, cpu: null, tags: {} } })

  // Tags por hostid
  tags.forEach(function (h) {
    if (!byHost[h.hostid]) return
    h.tags.forEach(function (t) { byHost[h.hostid].tags[t.tag] = t.value })
  })

  // Items estáticos
  items.forEach(function (i) {
    const e = byHost[i.hostid]
    if (!e) return
    const stale = dcIsStale(i.lastclock)
    if (i.key_ === 'icmpping')     e.icmpUp = !stale && i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  e.rtt    = stale ? null : parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') e.loss   = stale ? null : parseFloat(i.lastvalue)
    if (i.key_ === 'system.uptime') e.uptime = stale ? null : parseFloat(i.lastvalue)
    if (i.key_ === 'system.hw.model') e.model = i.lastvalue || null
  })

  // CPU (LLD — pode ter múltiplos, pegamos o maior)
  cpuItems.forEach(function (i) {
    const e = byHost[i.hostid]
    if (!e) return
    const v = parseFloat(i.lastvalue)
    if (!isNaN(v) && !dcIsStale(i.lastclock)) {
      e.cpu = (e.cpu == null) ? v : Math.max(e.cpu, v)
    }
  })

  // Triggers por host
  const trigsByHost = {}
  triggers.forEach(function (t) {
    if (!trigsByHost[t.hostid]) trigsByHost[t.hostid] = []
    trigsByHost[t.hostid].push(t)
  })

  // Montar linhas
  const rows = hosts.map(function (h) {
    const e      = byHost[h.hostid]
    const tList  = trigsByHost[h.hostid] || []
    const funcao = e.tags['funcao'] || ''
    const parceiro = e.tags['parceiro'] ? '/' + e.tags['parceiro'] : ''

    const rowState = dcWorstState([
      e.icmpUp === false ? 'down' : 'ok',
      dcStateAbove(e.rtt,  CFG_DC.thresholds.rttMs),
      dcStateAbove(e.loss, CFG_DC.thresholds.lossPct),
      dcStateAbove(e.cpu,  CFG_DC.thresholds.cpuPct),
      tList.length ? window.BPC_SHARED.severityToState(Math.max.apply(null, tList.map(function (t) { return parseInt(t.priority, 10) }))) : 'ok',
    ])

    return {
      hostid:   h.hostid,
      name:     h.name || h.host,
      funcao,
      parceiro,
      model:    e.model,
      rtt:      e.rtt,
      loss:     e.loss,
      cpu:      e.cpu,
      uptime:   e.uptime,
      triggers: tList,
      rowState,
    }
  })

  // Ordenar por funcaoOrder, depois por nome
  rows.sort(function (a, b) {
    const fa = dcFuncaoOrder(a.funcao), fb = dcFuncaoOrder(b.funcao)
    if (fa !== fb) return fa - fb
    return a.name.localeCompare(b.name)
  })

  return rows
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

const DC_TH = `
  <thead>
    <tr style="border-bottom:1px solid rgba(255,255,255,0.08)">
      <th style="padding:6px 8px;text-align:left;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:28px"></th>
      <th style="padding:6px 8px;text-align:left;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Host</th>
      <th style="padding:6px 8px;text-align:left;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:120px">Função</th>
      <th style="padding:6px 8px;text-align:left;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:140px">Modelo</th>
      <th style="padding:6px 8px;text-align:right;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:70px">RTT</th>
      <th style="padding:6px 8px;text-align:right;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:65px">Perda%</th>
      <th style="padding:6px 8px;text-align:right;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:60px">CPU</th>
      <th style="padding:6px 8px;text-align:right;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:80px">Uptime</th>
      <th style="padding:6px 8px;text-align:left;font-size:.90rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Triggers</th>
    </tr>
  </thead>`

function dcRenderRow(row) {
  const funcaoLabel = CFG_DC.funcaoLabel[row.funcao] || row.funcao
  const funcaoParceiro = funcaoLabel + (row.parceiro ? row.parceiro : '')

  // Triggers: pill do pior
  let trigHtml = ''
  if (row.triggers.length) {
    const worst = Math.max.apply(null, row.triggers.map(function (t) { return parseInt(t.priority, 10) }))
    const s = window.BPC_SHARED.severityToState(worst)
    const c = s === 'crit' ? 'var(--bpc-crit)' : 'var(--bpc-warn)'
    const icon = s === 'crit' ? '✖' : '⚠'
    trigHtml = `<span style="font-size:.96rem;color:${c}">${icon} ${row.triggers.length}</span>`
  }

  const rttState = dcStateAbove(row.rtt, CFG_DC.thresholds.rttMs)
  const rttCls   = rttState !== 'ok' ? (rttState === 'crit' ? 'bpc-crit' : 'bpc-warn') : ''
  const rttHtml  = row.rtt != null
    ? `<span class="${rttCls}">${dcFmtRtt(row.rtt)}</span>`
    : '<span class="bpc-mute">—</span>'

  const bgRow = row.rowState === 'down' ? 'rgba(239,68,68,0.04)'
              : row.rowState === 'crit' ? 'rgba(239,68,68,0.03)'
              : row.rowState === 'warn' ? 'rgba(240,165,0,0.03)' : ''

  const borderLeft = row.rowState === 'down' || row.rowState === 'crit'
    ? 'border-left:2px solid var(--bpc-crit);'
    : row.rowState === 'warn' ? 'border-left:2px solid var(--bpc-warn);' : 'border-left:2px solid transparent;'

  return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${bgRow};${borderLeft}">
    <td style="padding:7px 8px;text-align:center">${dcStateDot(row.rowState)}</td>
    <td style="padding:7px 8px;font-size:1.06rem;font-weight:600;color:#CDD9E5">${dcEsc(row.name)}</td>
    <td style="padding:7px 8px;font-size:1.0rem;color:var(--bpc-mute)">${dcEsc(funcaoParceiro)}</td>
    <td style="padding:7px 8px;font-size:.98rem;color:rgba(255,255,255,0.35)">${dcEsc(row.model || '—')}</td>
    <td style="padding:7px 8px;text-align:right;font-size:1.03rem">${rttHtml}</td>
    <td style="padding:7px 8px;text-align:right;font-size:1.03rem">${dcFmtLoss(row.loss)}</td>
    <td style="padding:7px 8px;text-align:right;font-size:1.03rem">${dcFmtCpu(row.cpu)}</td>
    <td style="padding:7px 8px;text-align:right;font-size:1.0rem;color:var(--bpc-mute)">${dcFmtUptime(row.uptime)}</td>
    <td style="padding:7px 8px;font-size:1.0rem">${trigHtml}</td>
  </tr>`
}

function dcRender(el, rows) {
  const total = rows.length
  const down  = rows.filter(function (r) { return r.rowState === 'down' }).length
  const warn  = rows.filter(function (r) { return r.rowState === 'warn' || r.rowState === 'crit' }).length

  const statusBar = window.BPC.utils.buildStatusBar({ ok: total - down - warn, warn, crit: down, label: 'Actualizado ' + new Date().toLocaleTimeString('pt-PT') })

  el.innerHTML = `
    <div class="bpc" style="font-family:'Inter','Segoe UI',sans-serif">

      <!-- Cabeçalho da secção -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <span style="font-size:1.03rem;font-weight:700;color:#CDD9E5;letter-spacing:.08em;text-transform:uppercase">DC CORE</span>
        <span style="font-size:.95rem;color:var(--bpc-mute)">${total} dispositivos · grupos 26+27</span>
        <div style="flex:1"></div>
        <span style="font-size:.95rem;color:var(--bpc-mute)">Switches Nexus · Routers ISR/C8xxx</span>
      </div>

      ${statusBar}

      <div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse">
          ${DC_TH}
          <tbody>
            ${rows.map(dcRenderRow).join('')}
          </tbody>
        </table>
      </div>

    </div>`
}

function dcRenderError(el, msg) {
  el.innerHTML = `<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">
    <div class="bpc-error-msg">⚠ DC Core: ${dcEsc(msg)}</div>
  </div>`
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function dcLoad(rpc) {
  const el = document.getElementById(CFG_DC.elementId)
  if (!el) return

  el.innerHTML = '<div style="padding:16px;color:var(--bpc-mute);font-size:1.03rem">A carregar DC Core…</div>'

  dcFetch(rpc)
    .then(function (data) {
      const hostIds = data.hosts.map(function (h) { return h.hostid })
      return dcFetchCpu(rpc, hostIds).then(function (cpuItems) {
        return dcCompute(data, cpuItems)
      })
    })
    .then(function (rows) { dcRender(el, rows) })
    .catch(function (err) { dcRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { dcLoad(rpc) }, CFG_DC.refreshMs)
}

function dcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(dcLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-dc: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { dcInitWithRetry(attempt + 1) }, 100)
}

dcInitWithRetry()
