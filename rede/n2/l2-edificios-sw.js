// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · EDIFÍCIOS — SWITCHES  v1.0                      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║  Grupo 29 — HG_EDIFICIOS_SWITCHES (46 hosts)                           ║
// ║                                                                          ║
// ║  Filtro dropdown por "andar" (tag Zabbix).                              ║
// ║  Tabela: andar | host | estado | RTT | Perda | Uptime                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_EDSW = {
  elementId: 'bpc-net-edsw',
  refreshMs:  60000,
  groupId:    '29',

  thresholds: {
    lossPct: { warn: 1, crit: 5 },
    rttMs:   { warn: 5, crit: 50 },
  },
}

// Estado do filtro (persiste durante refresh)
var _edSwFilter = 'all'
var _edSwAllRows = []


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function edSwEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function edSwFmtUptime(secs) {
  secs = parseInt(secs, 10)
  if (!secs || isNaN(secs)) return '—'
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function edSwStatusDot(up, lossPct, rttMs) {
  const T = window.BPC.THEME
  if (up === false || up === null) return '<span style="color:' + T.colorCrit + '">●</span> Down'
  if (lossPct > CFG_EDSW.thresholds.lossPct.crit || rttMs > CFG_EDSW.thresholds.rttMs.crit)
    return '<span style="color:' + T.colorCrit + '">●</span> Crítico'
  if (lossPct > CFG_EDSW.thresholds.lossPct.warn || rttMs > CFG_EDSW.thresholds.rttMs.warn)
    return '<span style="color:' + T.colorWarn + '">●</span> Degradado'
  return '<span style="color:' + T.colorOk + '">●</span> OK'
}

function edSwStateClass(val, warnThr, critThr) {
  const n = parseFloat(val)
  if (isNaN(n)) return 'bpc-mute'
  return n >= critThr ? 'bpc-crit' : n >= warnThr ? 'bpc-warn' : 'bpc-ok'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function edSwFetch(rpc) {
  const hosts = await rpc('host.get', {
    groupids:   [CFG_EDSW.groupId],
    output:     ['hostid', 'name', 'status'],
    selectTags: ['tag', 'value'],
  })

  if (!hosts.length) return []

  const hostIds = hosts.map(function (h) { return h.hostid })

  const [icmpItems, uptimeItems] = await Promise.all([
    rpc('item.get', {
      hostids: hostIds,
      search:  { key_: 'icmpping' },
      filter:  { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hostIds,
      filter:  { key_: 'system.uptime', status: 0 },
      output:  ['hostid', 'lastvalue'],
    }),
  ])

  const icmp   = {}
  const uptMap = {}

  icmpItems.forEach(function (i) {
    if (!icmp[i.hostid]) icmp[i.hostid] = { up: null, rtt: 0, loss: 0 }
    const h = icmp[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })

  uptimeItems.forEach(function (i) { uptMap[i.hostid] = i.lastvalue })

  return hosts.map(function (h) {
    const tagMap = {}
    ;(h.tags || []).forEach(function (t) { tagMap[t.tag] = t.value })
    const ic = icmp[h.hostid] || { up: null, rtt: 0, loss: 0 }

    return {
      hostid:  h.hostid,
      name:    h.name,
      andar:   tagMap['andar']    || '—',
      edificio:tagMap['edificio'] || tagMap['local'] || '—',
      up:      ic.up,
      rttMs:   ic.rtt,
      lossPct: ic.loss,
      uptime:  uptMap[h.hostid] || null,
    }
  }).sort(function (a, b) {
    // Down primeiro, depois andar, depois nome
    const stateOrder = function (r) {
      if (r.up === false || r.up === null) return 0
      if (r.lossPct > CFG_EDSW.thresholds.lossPct.warn || r.rttMs > CFG_EDSW.thresholds.rttMs.warn) return 1
      return 2
    }
    const sa = stateOrder(a), sb = stateOrder(b)
    if (sa !== sb) return sa - sb
    const ca = (a.andar || '').localeCompare(b.andar || '')
    return ca !== 0 ? ca : (a.name || '').localeCompare(b.name || '')
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function edSwBuildTable(rows) {
  if (!rows.length) {
    return '<tr><td colspan="6" style="color:var(--bpc-mute);padding:16px;text-align:center">Sem resultados</td></tr>'
  }

  const T = CFG_EDSW.thresholds
  return rows.map(function (r) {
    const lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    const rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1) + ' ms' : '—'
    const lossCls = edSwStateClass(r.lossPct, T.lossPct.warn, T.lossPct.crit)
    const rttCls  = edSwStateClass(r.rttMs,   T.rttMs.warn,   T.rttMs.crit)

    return '<tr>' +
      '<td style="font-weight:600;color:#a0b0c8">' + edSwEsc(r.andar) + '</td>' +
      '<td style="color:#c8d8e8;font-size:.96rem">' + edSwEsc(r.edificio) + '</td>' +
      '<td style="color:#E6EDF3">' + edSwEsc(r.name) + '</td>' +
      '<td>' + edSwStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td class="' + rttCls + '">' + edSwEsc(rttStr) + '</td>' +
      '<td class="' + lossCls + '">' + edSwEsc(lossStr) + '</td>' +
      '<td class="bpc-mute">' + edSwEsc(edSwFmtUptime(r.uptime)) + '</td>' +
      '</tr>'
  }).join('')
}

function edSwApplyFilter(el) {
  const rows = _edSwFilter === 'all'
    ? _edSwAllRows
    : _edSwAllRows.filter(function (r) { return r.andar === _edSwFilter })

  const tbody = el.querySelector('#edsw-tbody')
  if (tbody) tbody.innerHTML = edSwBuildTable(rows)

  // Highlight botão activo
  el.querySelectorAll('.edsw-filter-btn').forEach(function (btn) {
    const isActive = btn.dataset.andar === _edSwFilter
    btn.style.background   = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'
    btn.style.color        = isActive ? '#E6EDF3' : 'var(--bpc-mute)'
    btn.style.borderColor  = isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)'
  })
}

function edSwRender(el, rows) {
  _edSwAllRows = rows

  // Extrair andares únicos (excluir '—')
  const andares = []
  rows.forEach(function (r) {
    if (r.andar !== '—' && andares.indexOf(r.andar) === -1) andares.push(r.andar)
  })
  andares.sort()

  // Contagens por andar (para badge nos botões)
  const countByAndar = { all: rows.length }
  andares.forEach(function (a) {
    countByAndar[a] = rows.filter(function (r) { return r.andar === a }).length
  })
  const downAll = rows.filter(function (r) { return r.up === false || r.up === null }).length

  // Botões de filtro
  const btnStyle = 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;border:1px solid;cursor:pointer;font-size:.93rem;transition:all .15s'
  const allActive = _edSwFilter === 'all'
  let filterHtml = '<button class="edsw-filter-btn" data-andar="all" style="' + btnStyle +
    ';background:' + (allActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)') +
    ';color:' + (allActive ? '#E6EDF3' : 'var(--bpc-mute)') +
    ';border-color:' + (allActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)') + '">Todos <span style="opacity:.6">' + rows.length + '</span></button> '

  andares.forEach(function (a) {
    const active = _edSwFilter === a
    const cnt    = countByAndar[a]
    filterHtml += '<button class="edsw-filter-btn" data-andar="' + edSwEsc(a) + '" style="' + btnStyle +
      ';background:' + (active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)') +
      ';color:' + (active ? '#E6EDF3' : 'var(--bpc-mute)') +
      ';border-color:' + (active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)') + '">' +
      edSwEsc(a) + ' <span style="opacity:.6">' + cnt + '</span></button> '
  })

  el.innerHTML = `
    <div class="bpc bpc-card" style="padding:12px 16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:12px;flex-wrap:wrap">
        <div style="font-size:1.0rem;font-weight:700;letter-spacing:.08em;color:var(--bpc-mute)">
          EDIFÍCIOS — SWITCHES (${rows.length})
          ${downAll > 0 ? '<span style="margin-left:8px;color:var(--bpc-crit)">' + downAll + ' down</span>' : ''}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">${filterHtml}</div>
      </div>

      <div style="overflow-x:auto">
        <table class="bpc-table" style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="font-size:.93rem;color:var(--bpc-mute);text-transform:uppercase">
              <th style="text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid rgba(255,255,255,0.08)">Andar</th>
              <th style="text-align:left;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Edifício</th>
              <th style="text-align:left;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Host</th>
              <th style="text-align:left;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Estado</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">RTT</th>
              <th style="text-align:right;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Perda</th>
              <th style="text-align:right;padding:4px 0 4px 8px;border-bottom:1px solid rgba(255,255,255,0.08)">Uptime</th>
            </tr>
          </thead>
          <tbody id="edsw-tbody" style="font-size:1.0rem">
          </tbody>
        </table>
      </div>
    </div>`

  // Preencher tabela
  edSwApplyFilter(el)

  // Event delegation para os filtros
  el.querySelectorAll('.edsw-filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _edSwFilter = btn.dataset.andar
      edSwApplyFilter(el)
    })
  })

  // Estilos das células
  el.querySelectorAll('td').forEach(function (td) {
    td.style.padding = '5px 8px'
    td.style.borderBottom = '1px solid rgba(255,255,255,0.04)'
  })
  el.querySelectorAll('td:first-child').forEach(function (td) { td.style.paddingLeft = '0' })
  el.querySelectorAll('td:last-child').forEach(function (td) {
    td.style.textAlign = 'right'
    td.style.paddingRight = '0'
  })
  el.querySelectorAll('td:nth-child(5), td:nth-child(6)').forEach(function (td) {
    td.style.textAlign = 'right'
  })
}

function edSwRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">' +
    '<div class="bpc-error-msg">⚠ Edifícios Switches: ' + edSwEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function edSwLoad(rpc) {
  const el = document.getElementById(CFG_EDSW.elementId)
  if (!el) return

  el.innerHTML = window.BPC.utils.buildSkeleton()

  edSwFetch(rpc)
    .then(function (rows) { edSwRender(el, rows) })
    .catch(function (err) { edSwRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { edSwLoad(rpc) }, CFG_EDSW.refreshMs)
}

function edSwInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(edSwLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-edificios-sw: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { edSwInitWithRetry(attempt + 1) }, 100)
}

edSwInitWithRetry()
