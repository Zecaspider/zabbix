// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · EDIFÍCIOS — ROUTERS  v1.0                       ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║  Grupo 28 — HG_EDIFICIOS_ROUTERS (9 hosts)                             ║
// ║                                                                          ║
// ║  Tabela: edificio | host | estado | RTT | Perda | CPU | Uptime          ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_EDRT = {
  elementId: 'bpc-net-edrt',
  refreshMs:  60000,
  groupId:    '28',

  thresholds: {
    // Perda ICMP: canónico engenharia-do-sistema.md §6.2 ("rede, agências") — não inventar aqui.
    lossPct: { warn: 1,  crit: 10 },
    rttMs:   { warn: 5,  crit: 50 },
    cpuPct:  { warn: 70, crit: 90 },
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function edRtEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function edRtFmtUptime(secs) {
  secs = parseInt(secs, 10)
  if (!secs || isNaN(secs)) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function edRtStateCell(val, warnThr, critThr, fmt) {
  const n = parseFloat(val)
  if (isNaN(n)) return '<td class="bpc-mute">—</td>'
  const cls = n >= critThr ? 'bpc-crit' : n >= warnThr ? 'bpc-warn' : 'bpc-ok'
  return '<td class="' + cls + '">' + edRtEsc(fmt(n)) + '</td>'
}

function edRtStatusDot(up, lossPct, rttMs) {
  const T = window.BPC.THEME
  if (up === false || up === null) return '<span style="color:' + T.colorCrit + '">●</span> Down'
  if (lossPct > CFG_EDRT.thresholds.lossPct.crit || rttMs > CFG_EDRT.thresholds.rttMs.crit)
    return '<span style="color:' + T.colorCrit + '">●</span> Crítico'
  if (lossPct > CFG_EDRT.thresholds.lossPct.warn || rttMs > CFG_EDRT.thresholds.rttMs.warn)
    return '<span style="color:' + T.colorWarn + '">●</span> Degradado'
  return '<span style="color:' + T.colorOk + '">●</span> OK'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function edRtFetch(rpc) {
  // Hosts do grupo
  const hosts = await rpc('host.get', {
    groupids: [CFG_EDRT.groupId],
    output:   ['hostid', 'name', 'status'],
    selectTags: ['tag', 'value'],
  })

  if (!hosts.length) return []

  const hostIds = hosts.map(function (h) { return h.hostid })

  // ICMP + CPU + Uptime em paralelo
  const [icmpItems, cpuItems, uptimeItems] = await Promise.all([
    rpc('item.get', {
      hostids: hostIds,
      search:  { key_: 'icmpping' },
      filter:  { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hostIds,
      search:  { key_: 'system.cpu.util' },
      filter:  { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'],
      limit:   hostIds.length,
    }),
    rpc('item.get', {
      hostids: hostIds,
      filter:  { key_: 'system.uptime', status: 0 },
      output:  ['hostid', 'lastvalue'],
    }),
  ])

  // Indexar por hostid
  const icmp    = {}
  const cpuMap  = {}
  const uptMap  = {}

  icmpItems.forEach(function (i) {
    if (!icmp[i.hostid]) icmp[i.hostid] = { up: null, rtt: 0, loss: 0 }
    const h = icmp[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })

  cpuItems.forEach(function (i) {
    // Tomar apenas o primeiro item CPU por host (caso LLD gere múltiplos)
    if (!cpuMap[i.hostid]) cpuMap[i.hostid] = parseFloat(i.lastvalue)
  })

  uptimeItems.forEach(function (i) {
    uptMap[i.hostid] = i.lastvalue
  })

  // Construir linhas
  return hosts.map(function (h) {
    const tagMap = {}
    ;(h.tags || []).forEach(function (t) { tagMap[t.tag] = t.value })

    const ic = icmp[h.hostid] || { up: null, rtt: 0, loss: 0 }

    return {
      hostid:   h.hostid,
      name:     h.name,
      edificio: tagMap['edificio'] || tagMap['local'] || '—',
      up:       ic.up,
      rttMs:    ic.rtt,
      lossPct:  ic.loss,
      cpuPct:   cpuMap[h.hostid] != null ? cpuMap[h.hostid] : null,
      uptime:   uptMap[h.hostid] || null,
    }
  }).sort(function (a, b) {
    // Ordenar: down primeiro, depois por edificio
    const stateOrder = function (r) {
      if (r.up === false || r.up === null) return 0
      if (r.lossPct > CFG_EDRT.thresholds.lossPct.warn || r.rttMs > CFG_EDRT.thresholds.rttMs.warn) return 1
      return 2
    }
    const sa = stateOrder(a), sb = stateOrder(b)
    if (sa !== sb) return sa - sb
    return (a.edificio || '').localeCompare(b.edificio || '')
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function edRtRender(el, rows) {
  if (!rows.length) {
    el.innerHTML = '<div class="bpc bpc-card" style="color:var(--bpc-mute)">Sem dados para o grupo 28.</div>'
    return
  }

  const T = CFG_EDRT.thresholds
  const rowsHtml = rows.map(function (r) {
    const lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    const rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1) + ' ms' : '—'
    const lossCls = r.lossPct >= T.lossPct.crit ? 'bpc-crit' : r.lossPct >= T.lossPct.warn ? 'bpc-warn' : 'bpc-ok'
    const rttCls  = r.rttMs   >= T.rttMs.crit   ? 'bpc-crit' : r.rttMs   >= T.rttMs.warn   ? 'bpc-warn' : 'bpc-ok'

    return '<tr>' +
      '<td style="font-weight:600;color:#a0b0c8">' + edRtEsc(r.edificio) + '</td>' +
      '<td style="color:#E6EDF3">' + edRtEsc(r.name) + '</td>' +
      '<td>' + edRtStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td class="' + rttCls + '">' + edRtEsc(rttStr) + '</td>' +
      '<td class="' + lossCls + '">' + edRtEsc(lossStr) + '</td>' +
      (r.cpuPct != null
        ? edRtStateCell(r.cpuPct, T.cpuPct.warn, T.cpuPct.crit, function (n) { return n.toFixed(0) + '%' })
        : '<td class="bpc-mute">—</td>') +
      '<td class="bpc-mute">' + edRtEsc(edRtFmtUptime(r.uptime)) + '</td>' +
      '</tr>'
  }).join('')

  el.innerHTML = `
    <div class="bpc bpc-card" style="padding:12px 16px">
      <div style="font-size:1.0rem;font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);margin-bottom:10px">
        EDIFÍCIOS — ROUTERS (${rows.length})
      </div>
      <table class="bpc-table" style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="font-size:.93rem;color:var(--bpc-mute);text-transform:uppercase">
            <th style="text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid rgba(255,255,255,0.08)">Edifício</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Host</th>
            <th style="text-align:left;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Estado</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">RTT</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Perda</th>
            <th style="text-align:right;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">CPU</th>
            <th style="text-align:right;padding:4px 0 4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Uptime</th>
          </tr>
        </thead>
        <tbody style="font-size:1.0rem">
          ${rowsHtml}
        </tbody>
      </table>
    </div>`

  // Padding correcto nas células
  el.querySelectorAll('td').forEach(function (td) {
    td.style.padding = '5px 8px'
    td.style.borderBottom = '1px solid rgba(255,255,255,0.04)'
  })
  // Primeira e última coluna sem padding lateral exterior
  el.querySelectorAll('td:first-child').forEach(function (td) { td.style.paddingLeft = '0' })
  el.querySelectorAll('td:last-child').forEach(function (td) { td.style.textAlign = 'right'; td.style.paddingRight = '0' })
  el.querySelectorAll('td:nth-child(4), td:nth-child(5), td:nth-child(6)').forEach(function (td) { td.style.textAlign = 'right' })
}

function edRtRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">' +
    '<div class="bpc-error-msg">⚠ Edifícios Routers: ' + edRtEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function edRtLoad(rpc) {
  const el = document.getElementById(CFG_EDRT.elementId)
  if (!el) return

  el.innerHTML = window.BPC.utils.buildSkeleton()

  edRtFetch(rpc)
    .then(function (rows) { edRtRender(el, rows) })
    .catch(function (err) { edRtRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { edRtLoad(rpc) }, CFG_EDRT.refreshMs)
}

function edRtInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(edRtLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-edificios-rt: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { edRtInitWithRetry(attempt + 1) }, 100)
}

edRtInitWithRetry()
