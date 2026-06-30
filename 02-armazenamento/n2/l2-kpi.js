// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · ARMAZENAMENTO · KPI STRIP  v1.0                        ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  4 cards: Dispositivos · Saúde IBM · Disponibilidade 1h · Alertas      ║
// ║  Grupos: 602 (Storage, 10 hosts) + 605 (Tape, 1 host)                  ║
// ║  Princípio NOC: pior estado, não média                                  ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_KPI = {
  elementId:  'bpc-st-kpi',
  groupIds:   ['602', '605'],
  refreshMs:  60000,
  zabbixUrl:  'http://10.10.126.22/zabbix',

  // hostids dos arrays IBM com SNMP health (system.status[systemHealthStat.0])
  ibmHealthHostIds: ['11747', '11750'],

  triggerPriority: { crit: [4, 5], warn: [2, 3], info: [0, 1] },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function kpiEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function kpiPrioState(p) {
  p = parseInt(p, 10)
  if (CFG_KPI.triggerPriority.crit.indexOf(p) !== -1) return 'crit'
  if (CFG_KPI.triggerPriority.warn.indexOf(p) !== -1) return 'warn'
  return 'info'
}

// system.status SNMP IBM: 0=ok, 1=warn, 2=crit
function ibmStatusToState(v) {
  v = parseInt(v, 10)
  if (v === 2) return 'crit'
  if (v === 1) return 'warn'
  return 'ok'
}

function ibmStatusLabel(v) {
  v = parseInt(v, 10)
  if (v === 2) return 'CRÍTICO'
  if (v === 1) return 'AVISO'
  return 'OK'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function kpiGetData(rpc) {
  return Promise.all([
    // 1. Todos os hosts dos grupos 602+605
    rpc('host.get', {
      groupids: CFG_KPI.groupIds,
      output: ['hostid', 'name'],
      filter: { status: 0 },
    }),
    // 2. Items ICMP (ping + avail 1h) de todos os hosts
    rpc('item.get', {
      groupids: CFG_KPI.groupIds,
      search: { key_: 'icmpping' },
      searchWildcardsEnabled: true,
      filter: { status: 0 },
      output: ['hostid', 'key_', 'lastvalue'],
    }),
    // 3. SNMP health dos arrays IBM (FS9200 + FS9500)
    rpc('item.get', {
      hostids: CFG_KPI.ibmHealthHostIds,
      search: { key_: 'system.status' },
      filter: { status: 0 },
      output: ['hostid', 'name', 'key_', 'lastvalue'],
    }),
    // 4. Triggers activos nos grupos 602+605
    rpc('trigger.get', {
      groupids: CFG_KPI.groupIds,
      only_true: true, monitored: true, skipDependent: true,
      output: ['triggerid', 'priority', 'value'],
      selectHosts: ['hostid'],
      limit: 500,
    }),
  ]).then(function (res) {
    var hosts    = res[0] || []
    var icmpItems = res[1] || []
    var ibmItems  = res[2] || []
    var triggers  = (res[3] || []).filter(function (t) { return String(t.value) === '1' })

    // ── ICMP: estado por host (ping + avail 1h) ──────────────────
    var icmpByHost = {}
    icmpItems.forEach(function (i) {
      if (!icmpByHost[i.hostid]) icmpByHost[i.hostid] = {}
      if (i.key_ === 'icmpping')          icmpByHost[i.hostid].ping  = i.lastvalue
      if (i.key_ === 'bpc.icmp.avail.1h') icmpByHost[i.hostid].avail = parseFloat(i.lastvalue)
    })

    var hostsTotal  = hosts.length
    var hostsDown   = 0, hostsDownNames = []
    var availSum    = 0, availCount     = 0
    hosts.forEach(function (h) {
      var ic = icmpByHost[h.hostid] || {}
      if (ic.ping === '0') { hostsDown++; hostsDownNames.push(h.name) }
      if (ic.avail != null && !isNaN(ic.avail)) { availSum += ic.avail; availCount++ }
    })
    var avgAvail = availCount > 0 ? +(availSum / availCount).toFixed(1) : null

    // ── IBM health: FS9200 + FS9500 ──────────────────────────────
    var ibmStatuses = {}
    ibmItems.forEach(function (i) {
      if (/systemHealthStat/.test(i.key_)) ibmStatuses[i.hostid] = parseFloat(i.lastvalue)
    })
    var ibmCount    = CFG_KPI.ibmHealthHostIds.length
    var ibmWorstVal = null, ibmWorstState = 'ok'
    CFG_KPI.ibmHealthHostIds.forEach(function (hid) {
      var v = ibmStatuses[hid]
      if (v == null) return
      if (ibmWorstVal === null || v > ibmWorstVal) {
        ibmWorstVal  = v
        ibmWorstState = ibmStatusToState(v)
      }
    })

    // ── Triggers: contagem por severidade ────────────────────────
    var trigCounts = { crit: 0, warn: 0, info: 0 }
    triggers.forEach(function (t) { trigCounts[kpiPrioState(t.priority)]++ })
    var trgState = trigCounts.crit > 0 ? 'crit' : trigCounts.warn > 0 ? 'warn' : 'ok'

    var hostState  = hostsDown > 0 ? 'crit' : 'ok'
    var availState = avgAvail == null ? 'ok'
      : avgAvail < 90 ? 'crit' : avgAvail < 99 ? 'warn' : 'ok'

    return {
      hostsTotal: hostsTotal,
      hostsDown:  hostsDown,
      hostsDownNames: hostsDownNames,
      hostState:  hostState,
      avgAvail:   avgAvail,
      availState: availState,
      ibmCount:   ibmCount,
      ibmWorstVal:   ibmWorstVal,
      ibmWorstState: ibmWorstState,
      ibmStatuses: ibmStatuses,
      trigCounts:  trigCounts,
      trigTotal:   triggers.length,
      trgState:    trgState,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function kpiRender(el, d, errMsg) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var CH = window.BPC_CHARTS
  var u  = window.BPC.utils

  if (errMsg) { el.innerHTML = u.buildError('KPI Armazenamento', errMsg); return }
  if (!d)     { el.innerHTML = u.buildError('KPI Armazenamento', 'Sem dados'); return }

  function pill(state) {
    var label = { ok: 'OK', warn: 'DEGRADADO', crit: 'CRÍTICO' }[state] || 'OK'
    return '<span class="bpc-pill ' + state + '">' + label + '</span>'
  }

  function cardHeader(label, state) {
    return '<div class="bpc-flex" style="justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
      + '<span class="bpc-label">' + kpiEsc(label) + '</span>'
      + CH.dot(state)
      + '</div>'
  }

  function zbLink(severities) {
    var url = CFG_KPI.zabbixUrl + '/zabbix.php?action=problem.view&filter_show=1'
      + '&filter_groupids%5B%5D=602&filter_groupids%5B%5D=605&filter_set=1'
    if (severities && severities.length)
      url += '&' + severities.map(function (s) { return 'filter_severity%5B%5D=' + s }).join('&')
    return url
  }

  // ── Card 1 — Dispositivos ───────────────────────────────────────
  var hostsOnline = d.hostsTotal - d.hostsDown
  var c1 = '<div class="bpc bpc-card state-' + d.hostState + '" style="--card-accent:' + S.color(d.hostState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Dispositivos online', d.hostState)
    + '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
    + '  <span class="bpc-value-lg bpc-' + d.hostState + '">' + hostsOnline + '</span>'
    + '  <span class="bpc-label">/ ' + d.hostsTotal + '</span>'
    + '</div>'
    + SH.pbar(d.hostsTotal > 0 ? Math.round(hostsOnline / d.hostsTotal * 100) : 0, S.color(d.hostState))
    + (d.hostsDown > 0
      ? '<div class="bpc-label bpc-crit" style="margin-top:3px">● ' + d.hostsDown + ' offline'
        + (d.hostsDownNames.length ? ' · ' + kpiEsc(d.hostsDownNames.slice(0, 2).join(', '))
            + (d.hostsDownNames.length > 2 ? ' +' + (d.hostsDownNames.length - 2) : '') : '')
        + '</div>'
      : '<div class="bpc-label bpc-ok" style="margin-top:3px">● todos disponíveis</div>')
    + '<div class="bpc-label bpc-mute" style="margin-top:4px">Storage + Tape</div>'
    + '</div>'

  // ── Card 2 — Saúde IBM (FS9200 + FS9500) ───────────────────────
  var ibmOk    = 0, ibmWarn = 0, ibmCrit = 0, ibmNoData = 0
  CFG_KPI.ibmHealthHostIds.forEach(function (hid) {
    var v = d.ibmStatuses[hid]
    if (v == null || isNaN(v)) { ibmNoData++; return }
    var s = ibmStatusToState(v)
    if (s === 'crit') ibmCrit++
    else if (s === 'warn') ibmWarn++
    else ibmOk++
  })
  var ibmNoSnmp = ibmNoData === d.ibmCount

  var c2 = '<div class="bpc bpc-card state-' + d.ibmWorstState + '" style="--card-accent:' + S.color(d.ibmWorstState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Arrays IBM · SNMP', d.ibmWorstState)
    + (ibmNoSnmp
      ? '<div class="bpc-label bpc-warn" style="margin-top:4px">⚠ SNMP sem dados (Z.9)</div>'
        + '<div class="bpc-label bpc-mute" style="margin-top:3px">FS9200 + FS9500</div>'
      : '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
        + '<span class="bpc-value-lg bpc-' + d.ibmWorstState + '">'
        + ibmStatusLabel(d.ibmWorstVal) + '</span></div>'
        + (ibmCrit ? '<div class="bpc-label bpc-crit">▲ ' + ibmCrit + ' array(s) crítico(s)</div>' : '')
        + (ibmWarn ? '<div class="bpc-label bpc-warn">● ' + ibmWarn + ' array(s) em aviso</div>' : '')
        + (ibmOk === d.ibmCount ? '<div class="bpc-label bpc-ok">● todos healthy</div>' : ''))
    + '<div class="bpc-label bpc-mute" style="margin-top:4px">IBM FS9200 · FS9500</div>'
    + '</div>'

  // ── Card 3 — Disponibilidade 1h ─────────────────────────────────
  var availPct = d.avgAvail
  var c3 = '<div class="bpc bpc-card state-' + d.availState + '" style="--card-accent:' + S.color(d.availState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Disponibilidade 1h', d.availState)
    + '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
    + '  <span class="bpc-value-lg bpc-' + d.availState + '">'
    + (availPct != null ? availPct.toFixed(1) + '%' : '—') + '</span>'
    + '</div>'
    + (availPct != null ? SH.pbar(availPct, S.color(d.availState)) : '')
    + (availPct != null && availPct < 99
      ? '<div class="bpc-label bpc-warn" style="margin-top:3px">● abaixo do normal</div>'
      : '<div class="bpc-label bpc-ok" style="margin-top:3px">● dentro do esperado</div>')
    + '<div class="bpc-label bpc-mute" style="margin-top:4px">média · ICMP BPC · todos os hosts</div>'
    + '</div>'

  // ── Card 4 — Alertas ─────────────────────────────────────────────
  function trgCount(sevs, count, state) {
    var num = count
      ? '<a href="' + kpiEsc(zbLink(sevs)) + '" target="_blank" class="bpc-value-md bpc-' + state + '" style="text-decoration:none">' + count + '</a>'
      : '<span class="bpc-value-md bpc-mute">0</span>'
    return '<div class="bpc-flex" style="justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<span class="bpc-label bpc-' + state + '" style="letter-spacing:.08em">' + state.toUpperCase() + '</span>'
      + num + '</div>'
  }

  var tc = d.trigCounts || { crit: 0, warn: 0, info: 0 }
  var c4 = '<div class="bpc bpc-card state-' + d.trgState + '" style="--card-accent:' + S.color(d.trgState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Alertas · ' + d.trigTotal + ' triggers', d.trgState)
    + trgCount([4, 5], tc.crit, 'crit')
    + trgCount([2, 3], tc.warn, 'warn')
    + trgCount([0, 1], tc.info, 'info')
    + '<div style="margin-top:auto;padding-top:6px">'
    + '<a href="' + kpiEsc(zbLink(null)) + '" target="_blank" class="bpc-link" style="font-size:.70rem">Ver problemas →</a>'
    + '</div>'
    + '</div>'

  // ── Layout global ────────────────────────────────────────────────
  var globalState = window.BPC.state.worst([d.hostState, d.ibmWorstState, d.availState, d.trgState])
  var pillLabel = { ok: 'OK', warn: 'DEGRADADO', crit: 'CRÍTICO' }[globalState] || 'OK'
  el.innerHTML = '<div class="bpc" style="display:flex;flex-direction:column;height:100%;font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif">'
    + '<div style="display:flex;justify-content:flex-end;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.06)">'
    + '<span class="bpc-pill ' + globalState + '">' + pillLabel + '</span>'
    + '</div>'
    + '<div style="display:flex;flex:1;gap:8px;padding:8px;overflow:hidden">'
    + c1 + c2 + c3 + c4
    + '</div>'
    + '</div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
// ────────────────────────────────────────────────────────────────────────────

function start(rpc) {
  window.BPC.utils.waitForElement(CFG_KPI.elementId, function (el) {
    el.innerHTML = window.BPC.utils.buildSkeleton()

    function load() {
      kpiGetData(rpc)
        .then(function (d) { kpiRender(el, d, null) })
        .catch(function (e) { kpiRender(el, null, e.message || String(e)) })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG_KPI.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return }
  if (attempt > 50) { console.error('[BPC] l2-kpi armazenamento: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
