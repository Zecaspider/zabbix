// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · EDIFÍCIOS  v1.0                                 ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║  Grupo 28 (9 routers) + Grupo 29 (46 switches)                         ║
// ║                                                                          ║
// ║  Tabs: Routers | Switches (filtro por andar)                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_N3ED = {
  elementId: 'bpc-n3ed-table',
  refreshMs:  60000,

  grupos: { rt: '28', sw: '29' },

  thresholds: {
    lossPct: { warn: 1,  crit: 5 },
    rttMs:   { warn: 5,  crit: 50 },
    cpuPct:  { warn: 70, crit: 90 },
  },
}

var _n3edTab    = 'rt'   // 'rt' | 'sw'
var _n3edSwFilter = 'all'
var _n3edRtRows = []
var _n3edSwRows = []


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function n3edEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function n3edFmtUptime(secs) {
  secs = parseInt(secs, 10)
  if (!secs || isNaN(secs)) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function n3edStatusDot(up, lossPct, rttMs) {
  const T = window.BPC.THEME
  if (up === false || up === null) return '<span style="color:' + T.colorCrit + '">●</span> Down'
  const T2 = CFG_N3ED.thresholds
  if (lossPct > T2.lossPct.crit || rttMs > T2.rttMs.crit) return '<span style="color:' + T.colorCrit + '">●</span> Crítico'
  if (lossPct > T2.lossPct.warn || rttMs > T2.rttMs.warn) return '<span style="color:' + T.colorWarn + '">●</span> Degradado'
  return '<span style="color:' + T.colorOk + '">●</span> OK'
}

function n3edStateCls(val, warn, crit) {
  const n = parseFloat(val)
  if (isNaN(n)) return 'bpc-mute'
  return n >= crit ? 'bpc-crit' : n >= warn ? 'bpc-warn' : 'bpc-ok'
}

function n3edSortRows(rows) {
  return rows.slice().sort(function (a, b) {
    const order = function (r) {
      if (r.up === false || r.up === null) return 0
      if (r.lossPct > CFG_N3ED.thresholds.lossPct.warn || r.rttMs > CFG_N3ED.thresholds.rttMs.warn) return 1
      return 2
    }
    const sa = order(a), sb = order(b)
    if (sa !== sb) return sa - sb
    return (a.edificio || a.andar || '').localeCompare(b.edificio || b.andar || '')
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function n3edFetchGroup(rpc, groupId, withCpu) {
  const hosts = await rpc('host.get', {
    groupids:   [groupId],
    output:     ['hostid', 'name'],
    selectTags: ['tag', 'value'],
  })
  if (!hosts.length) return []

  const hostIds = hosts.map(function (h) { return h.hostid })

  const queries = [
    rpc('item.get', {
      hostids: hostIds, search: { key_: 'icmpping' }, filter: { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hostIds, filter: { key_: 'system.uptime', status: 0 },
      output:  ['hostid', 'lastvalue'],
    }),
  ]
  if (withCpu) {
    queries.push(rpc('item.get', {
      hostids: hostIds, search: { key_: 'system.cpu.util' }, filter: { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'], limit: hostIds.length,
    }))
  }

  const [icmpItems, uptItems, cpuItems] = await Promise.all(queries)

  const icmp   = {}
  const uptMap = {}
  const cpuMap = {}

  icmpItems.forEach(function (i) {
    if (!icmp[i.hostid]) icmp[i.hostid] = { up: null, rtt: 0, loss: 0 }
    const h = icmp[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })
  uptItems.forEach(function (i) { uptMap[i.hostid] = i.lastvalue })
  if (cpuItems) cpuItems.forEach(function (i) {
    if (!cpuMap[i.hostid]) cpuMap[i.hostid] = parseFloat(i.lastvalue)
  })

  return hosts.map(function (h) {
    const tagMap = {}
    ;(h.tags || []).forEach(function (t) { tagMap[t.tag] = t.value })
    const ic = icmp[h.hostid] || { up: null, rtt: 0, loss: 0 }
    return {
      hostid:   h.hostid,
      name:     h.name,
      edificio: tagMap['edificio'] || tagMap['local'] || '—',
      andar:    tagMap['andar'] || '—',
      up:       ic.up,
      rttMs:    ic.rtt,
      lossPct:  ic.loss,
      cpuPct:   cpuMap[h.hostid] != null ? cpuMap[h.hostid] : null,
      uptime:   uptMap[h.hostid] || null,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function n3edBuildRtRows(rows) {
  const T = CFG_N3ED.thresholds
  return rows.map(function (r) {
    const lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    const rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1)  + ' ms' : '—'
    const lossCls = n3edStateCls(r.lossPct, T.lossPct.warn, T.lossPct.crit)
    const rttCls  = n3edStateCls(r.rttMs,   T.rttMs.warn,   T.rttMs.crit)
    const cpuCls  = n3edStateCls(r.cpuPct,  T.cpuPct.warn,  T.cpuPct.crit)

    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<td style="padding:6px 10px;font-weight:600;color:#a0b0c8;font-size:1.0rem">' + n3edEsc(r.edificio) + '</td>' +
      '<td style="padding:6px 10px;color:#E6EDF3;font-size:1.0rem;font-weight:600">' + n3edEsc(r.name) + '</td>' +
      '<td style="padding:6px 10px;font-size:.96rem">' + n3edStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:1.0rem" class="' + rttCls + '">' + n3edEsc(rttStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:1.0rem" class="' + lossCls + '">' + n3edEsc(lossStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:1.0rem" class="' + cpuCls + '">' + (r.cpuPct != null ? r.cpuPct.toFixed(0) + '%' : '<span class="bpc-mute">—</span>') + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.93rem;color:var(--bpc-mute)">' + n3edEsc(n3edFmtUptime(r.uptime)) + '</td>' +
      '</tr>'
  }).join('')
}

function n3edBuildSwRows(rows) {
  const T = CFG_N3ED.thresholds
  return rows.map(function (r) {
    const lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    const rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1)  + ' ms' : '—'
    const lossCls = n3edStateCls(r.lossPct, T.lossPct.warn, T.lossPct.crit)
    const rttCls  = n3edStateCls(r.rttMs,   T.rttMs.warn,   T.rttMs.crit)

    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<td style="padding:6px 10px;font-weight:600;color:#a0b0c8;font-size:1.0rem">' + n3edEsc(r.andar) + '</td>' +
      '<td style="padding:6px 10px;color:#c8d8e8;font-size:.93rem">' + n3edEsc(r.edificio) + '</td>' +
      '<td style="padding:6px 10px;color:#E6EDF3;font-size:.96rem">' + n3edEsc(r.name) + '</td>' +
      '<td style="padding:6px 10px;font-size:.96rem">' + n3edStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:1.0rem" class="' + rttCls + '">' + n3edEsc(rttStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:1.0rem" class="' + lossCls + '">' + n3edEsc(lossStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.93rem;color:var(--bpc-mute)">' + n3edEsc(n3edFmtUptime(r.uptime)) + '</td>' +
      '</tr>'
  }).join('')
}

function n3edBuildSwFilterBar(rows) {
  const andares = []
  rows.forEach(function (r) {
    if (r.andar !== '—' && andares.indexOf(r.andar) === -1) andares.push(r.andar)
  })
  andares.sort()

  const btnBase = 'padding:3px 12px;border-radius:12px;border:1px solid;cursor:pointer;font-size:.93rem;transition:all .15s'
  const btn = function (val, label, count) {
    const active = _n3edSwFilter === val
    return '<button class="n3ed-sw-btn" data-val="' + n3edEsc(val) + '" style="' + btnBase +
      ';background:' + (active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)') +
      ';color:' + (active ? '#E6EDF3' : 'var(--bpc-mute)') +
      ';border-color:' + (active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)') + '">' +
      n3edEsc(label) + ' <span style="opacity:.6">' + count + '</span></button>'
  }

  return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">' +
    btn('all', 'Todos', rows.length) + ' ' +
    andares.map(function (a) {
      return btn(a, a, rows.filter(function (r) { return r.andar === a }).length)
    }).join(' ') +
    '</div>'
}

function n3edRenderContent(el) {
  const tabBtnBase = 'padding:8px 20px;border:none;border-bottom:2px solid;cursor:pointer;font-size:1.0rem;font-weight:600;background:transparent;transition:all .15s'

  const tabRtStyle = tabBtnBase + ';color:' + (_n3edTab === 'rt' ? '#E6EDF3' : 'var(--bpc-mute)') +
    ';border-color:' + (_n3edTab === 'rt' ? 'var(--bpc-info)' : 'transparent')
  const tabSwStyle = tabBtnBase + ';color:' + (_n3edTab === 'sw' ? '#E6EDF3' : 'var(--bpc-mute)') +
    ';border-color:' + (_n3edTab === 'sw' ? 'var(--bpc-info)' : 'transparent')

  let bodyHtml = ''

  if (_n3edTab === 'rt') {
    const sorted = n3edSortRows(_n3edRtRows)
    const down   = sorted.filter(function (r) { return r.up === false || r.up === null }).length
    bodyHtml = `
      <div style="margin-bottom:8px;font-size:.93rem;color:var(--bpc-mute)">
        ${sorted.length} routers${down > 0 ? ' · <span class="bpc-crit">' + down + ' down</span>' : ''}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">
          <th style="padding:5px 10px;text-align:left">Edifício</th>
          <th style="padding:5px 10px;text-align:left">Host</th>
          <th style="padding:5px 10px;text-align:left">Estado</th>
          <th style="padding:5px 10px;text-align:right">RTT</th>
          <th style="padding:5px 10px;text-align:right">Perda</th>
          <th style="padding:5px 10px;text-align:right">CPU</th>
          <th style="padding:5px 10px;text-align:right">Uptime</th>
        </tr></thead>
        <tbody>${n3edBuildRtRows(sorted)}</tbody>
      </table>`
  } else {
    const filtered = _n3edSwFilter === 'all'
      ? _n3edSwRows
      : _n3edSwRows.filter(function (r) { return r.andar === _n3edSwFilter })
    const sorted   = n3edSortRows(filtered)
    const down     = sorted.filter(function (r) { return r.up === false || r.up === null }).length
    bodyHtml = n3edBuildSwFilterBar(_n3edSwRows) + `
      <div style="margin-bottom:8px;font-size:.93rem;color:var(--bpc-mute)">
        ${sorted.length} switches${down > 0 ? ' · <span class="bpc-crit">' + down + ' down</span>' : ''}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">
          <th style="padding:5px 10px;text-align:left">Andar</th>
          <th style="padding:5px 10px;text-align:left">Edifício</th>
          <th style="padding:5px 10px;text-align:left">Host</th>
          <th style="padding:5px 10px;text-align:left">Estado</th>
          <th style="padding:5px 10px;text-align:right">RTT</th>
          <th style="padding:5px 10px;text-align:right">Perda</th>
          <th style="padding:5px 10px;text-align:right">Uptime</th>
        </tr></thead>
        <tbody>${n3edBuildSwRows(sorted)}</tbody>
      </table>`
  }

  el.innerHTML = `
    <div class="bpc" style="font-family:'Inter','Segoe UI',sans-serif">
      <!-- Back link -->
      <div style="margin-bottom:12px">
        <a href="/d/ec590abd-c1ab-4b83-ac26-2b998aa80556/n2-rede"
           style="font-size:.93rem;color:var(--bpc-mute);text-decoration:none">
          ← N2 · Rede
        </a>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:16px">
        <button class="n3ed-tab" data-tab="rt" style="${tabRtStyle}">
          Routers <span style="opacity:.6;font-size:.85rem">${_n3edRtRows.length}</span>
        </button>
        <button class="n3ed-tab" data-tab="sw" style="${tabSwStyle}">
          Switches <span style="opacity:.6;font-size:.85rem">${_n3edSwRows.length}</span>
        </button>
      </div>

      <!-- Body -->
      <div class="bpc bpc-card" style="padding:14px 16px">
        ${bodyHtml}
      </div>
    </div>`

  // Tab click
  el.querySelectorAll('.n3ed-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _n3edTab = btn.dataset.tab
      n3edRenderContent(el)
    })
  })

  // Switch filter click
  el.querySelectorAll('.n3ed-sw-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _n3edSwFilter = btn.dataset.val
      n3edRenderContent(el)
    })
  })
}

function n3edRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">' +
    '<div class="bpc-error-msg">⚠ Edifícios N3: ' + n3edEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function n3edLoad(rpc) {
  const el = document.getElementById(CFG_N3ED.elementId)
  if (!el) return

  el.innerHTML = window.BPC.utils.buildSkeleton()

  Promise.all([
    n3edFetchGroup(rpc, CFG_N3ED.grupos.rt, true),
    n3edFetchGroup(rpc, CFG_N3ED.grupos.sw, false),
  ])
  .then(function (results) {
    _n3edRtRows = results[0]
    _n3edSwRows = results[1]
    n3edRenderContent(el)
  })
  .catch(function (err) { n3edRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { n3edLoad(rpc) }, CFG_N3ED.refreshMs)
}

function n3edInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(n3edLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-edificios-table: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { n3edInitWithRetry(attempt + 1) }, 100)
}

n3edInitWithRetry()
