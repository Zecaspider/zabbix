// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · ARMAZENAMENTO · TABELA DE DISPOSITIVOS  v1.0           ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  Colunas: Estado · Dispositivo · Tipo · ICMP ping · Avail 1h ·         ║
// ║           Saúde SNMP · Triggers · →                                    ║
// ║  Grupos 602 + 605 · Ordenação: pior estado primeiro                     ║
// ║                                                                          ║
// ║  [1] CFG   [2] FETCH   [3] COMPUTE   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_TAB = {
  elementId: 'bpc-st-tabela',
  groupIds:  ['602', '605'],
  refreshMs: 60000,
  zabbixUrl: 'http://10.10.126.22/zabbix',
  // grafanaL3: null  -- N3 Storage não existe ainda

  // IBM hosts com SNMP health
  ibmHealthHostIds: ['11747', '11750'],

  fs: {
    header:  '13px',
    cell:    '14px',
    value:   '16px',
    sub:     '11px',
    badge:   '11px',
    name:    '14px',
    nameSub: '11px',
  },
}

// Mapa de subtipo por padrão de nome
var _TIPO_MAP = [
  { re: /TS\d{4}/i,          label: 'Tape Library' },
  { re: /Controladora/i,     label: 'Controladora' },
  { re: /Cisco MDS/i,        label: 'FC Switch' },
  { re: /V7000/i,            label: 'SAN IBM' },
  { re: /FS9200.*R30/i,      label: 'All-Flash IBM' },
  { re: /IBM\s+FS9[25]00/i,  label: 'All-Flash IBM' },
  { re: /Dell.*Unity/i,      label: 'SAN Dell' },
  { re: /Storage\s+-\s+IBM/i,label: 'All-Flash IBM' },
]

function detectTipo(name) {
  for (var i = 0; i < _TIPO_MAP.length; i++) {
    if (_TIPO_MAP[i].re.test(name)) return _TIPO_MAP[i].label
  }
  return 'Storage'
}

// system.status SNMP IBM: 0=ok, 1=warn, 2=crit
function ibmSnmpState(v) {
  v = parseInt(v, 10)
  if (v === 2) return 'crit'
  if (v === 1) return 'warn'
  return 'ok'
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

var _tabHostCache = null

function tabFetch(rpc) {
  var hostsPromise = _tabHostCache
    ? Promise.resolve(_tabHostCache)
    : rpc('host.get', {
        groupids: CFG_TAB.groupIds,
        output: ['hostid', 'name', 'host'],
        filter: { status: 0 },
      }).then(function (h) { _tabHostCache = h; return h })

  return hostsPromise.then(function (hosts) {
    if (!hosts.length) return { hosts: [], items: [], triggers: [] }
    var hostIds = hosts.map(function (h) { return h.hostid })

    return Promise.all([
      // ICMP + SNMP health items
      rpc('item.get', {
        hostids: hostIds,
        search: { key_: ['icmpping', 'bpc.icmp', 'system.status'] },
        searchByAny: true, searchWildcardsEnabled: true,
        filter: { status: 0 },
        output: ['hostid', 'key_', 'lastvalue', 'name'],
      }),
      // Triggers activos
      rpc('trigger.get', {
        hostids: hostIds,
        only_true: true, monitored: true, skipDependent: true,
        expandDescription: true,
        output: ['triggerid', 'description', 'priority', 'lastchange'],
        selectHosts: ['hostid'],
        sortfield: 'priority', sortorder: 'DESC',
        limit: 500,
      }),
    ]).then(function (res) {
      return { hosts: hosts, items: res[0] || [], triggers: res[1] || [] }
    })
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function tabCompute(data) {
  var S       = window.BPC.state
  var SH      = window.BPC_SHARED
  var hosts   = data.hosts
  var items   = data.items
  var triggers = data.triggers

  // items por host
  var byHost = {}
  items.forEach(function (i) {
    if (!byHost[i.hostid]) byHost[i.hostid] = {}
    byHost[i.hostid][i.key_] = i.lastvalue
  })

  // triggers por host
  var trgByHost = {}
  ;(triggers || []).forEach(function (t) {
    ;(t.hosts || []).forEach(function (h) {
      if (!trgByHost[h.hostid]) trgByHost[h.hostid] = []
      trgByHost[h.hostid].push(t)
    })
  })

  function prio2state(p) {
    p = parseInt(p)
    return p >= 4 ? 'crit' : p >= 2 ? 'warn' : 'ok'
  }

  var rows = hosts.map(function (host) {
    var hid  = host.hostid
    var h    = byHost[hid] || {}
    var trgs = trgByHost[hid] || []

    var ping      = h['icmpping']
    var avail1h   = parseFloat(h['bpc.icmp.avail.1h'])
    var snmpRaw   = h['system.status[systemHealthStat.0]']

    var icmpState  = ping === '0' ? 'crit' : 'ok'
    var availState = isNaN(avail1h) ? 'ok'
      : avail1h < 90 ? 'crit' : avail1h < 99 ? 'warn' : 'ok'
    var snmpState  = snmpRaw != null ? ibmSnmpState(snmpRaw) : null
    var trgState   = trgs.length ? prio2state(trgs[0].priority) : 'ok'

    var states = [icmpState, availState, trgState]
    if (snmpState) states.push(snmpState)
    var rowState = S.worst(states)

    return {
      hostid:    hid,
      name:      host.name,
      tipo:      detectTipo(host.name),
      ping:      ping,
      icmpState: icmpState,
      avail1h:   isNaN(avail1h) ? null : avail1h,
      availState:availState,
      snmpRaw:   snmpRaw,
      snmpState: snmpState,
      trgs:      trgs,
      trgState:  trgState,
      rowState:  rowState,
    }
  })

  function stateOrder(s) { return s === 'crit' ? 0 : s === 'warn' ? 1 : 2 }
  rows.sort(function (a, b) { return stateOrder(a.rowState) - stateOrder(b.rowState) })

  return rows
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function tabRender(el, rows, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var u  = window.BPC.utils
  var FS = CFG_TAB.fs

  if (err)              { el.innerHTML = u.buildError('Tabela Armazenamento', err); return }
  if (!rows || !rows.length) { el.innerHTML = u.buildError('Tabela Armazenamento', 'Sem dispositivos nos grupos 602+605.'); return }

  function stateDot(state) {
    var color = S.color(state)
    var label = { ok: 'OK', warn: 'WARN', crit: 'CRIT' }[state] || '?'
    return '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + color + ';flex-shrink:0;box-shadow:0 0 6px ' + color + '55"></span>'
      + '<span style="font-size:' + FS.badge + ';font-weight:700;letter-spacing:.08em;color:' + color + '">' + label + '</span>'
      + '</div>'
  }

  var TH = 'text-align:left;padding:8px 10px;font-size:' + FS.header + ';font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);border-bottom:2px solid rgba(255,255,255,0.1);white-space:nowrap'
  var TD = 'padding:8px 10px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,0.06)'

  var thead = '<tr>'
    + '<th style="' + TH + '">Estado</th>'
    + '<th style="' + TH + '">Dispositivo</th>'
    + '<th style="' + TH + '">Tipo</th>'
    + '<th style="' + TH + '">ICMP</th>'
    + '<th style="' + TH + '">Avail 1h</th>'
    + '<th style="' + TH + '">Saúde SNMP</th>'
    + '<th style="' + TH + '">Triggers</th>'
    + '<th style="' + TH + '"></th>'
    + '</tr>'

  var tbody = rows.map(function (r) {
    var rowBg = r.rowState === 'crit' ? 'rgba(248,81,73,0.05)'
              : r.rowState === 'warn' ? 'rgba(210,153,34,0.04)' : ''

    // Estado
    var colEstado = '<td style="' + TD + '">' + stateDot(r.rowState) + '</td>'

    // Dispositivo (nome limpo)
    var shortName = r.name.replace(/^Storage\s+-\s+/i, '').replace(/^Tape\s+-\s+/i, '')
    var colName = '<td style="' + TD + ';min-width:160px">'
      + '<div style="font-size:' + FS.name + ';font-weight:700;color:#E6EDF3">' + SH.esc(shortName) + '</div>'
      + '<div style="font-size:' + FS.nameSub + ';color:var(--bpc-mute);margin-top:1px;font-family:monospace">' + SH.esc(r.name) + '</div>'
      + '</td>'

    // Tipo
    var colTipo = '<td style="' + TD + ';font-size:' + FS.cell + ';color:var(--bpc-mute)">' + SH.esc(r.tipo) + '</td>'

    // ICMP ping
    var icmpColor = S.color(r.icmpState)
    var colIcmp = '<td style="' + TD + ';text-align:center">'
      + '<span style="font-size:' + FS.value + ';font-weight:700;color:' + icmpColor + '">'
      + (r.ping === '1' ? '●' : r.ping === '0' ? '✕' : '—')
      + '</span>'
      + '</td>'

    // Avail 1h
    var aColor = S.color(r.availState)
    var colAvail = '<td style="' + TD + ';text-align:right;font-family:monospace">'
      + (r.avail1h != null
        ? '<span style="font-size:' + FS.value + ';font-weight:700;color:' + aColor + '">' + r.avail1h.toFixed(0) + '%</span>'
        : '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>')
      + '</td>'

    // Saúde SNMP
    var colSnmp = '<td style="' + TD + ';text-align:center">'
    if (r.snmpRaw == null) {
      colSnmp += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      var sc = S.color(r.snmpState)
      var sl = { ok: 'OK', warn: 'WARN', crit: 'CRIT' }[r.snmpState] || '?'
      colSnmp += '<span style="font-size:' + FS.cell + ';font-weight:700;color:' + sc + '">' + sl + '</span>'
    }
    colSnmp += '</td>'

    // Triggers
    var colTrg = '<td style="' + TD + ';min-width:80px">'
    if (!r.trgs.length) {
      colTrg += '<span style="font-size:' + FS.cell + ';color:var(--bpc-ok)">OK</span>'
    } else {
      var nCrit = r.trgs.filter(function (t) { return parseInt(t.priority) >= 4 }).length
      var nWarn = r.trgs.length - nCrit
      colTrg += (nCrit ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-crit)">▲ ' + nCrit + ' crit</div>' : '')
        + (nWarn ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-warn)">● ' + nWarn + ' warn</div>' : '')
      var first = r.trgs[0]
      var desc  = first.description.length > 30 ? first.description.slice(0, 29) + '…' : first.description
      colTrg += '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute);margin-top:2px">' + SH.esc(desc) + '</div>'
    }
    colTrg += '</td>'

    // Drill (N3 ainda não existe)
    var zbHostUrl = CFG_TAB.zabbixUrl + '/zabbix.php?action=latest.view&filter_hostids%5B%5D=' + SH.esc(r.hostid) + '&filter_set=1'
    var colDrill = '<td style="' + TD + ';text-align:center">'
      + '<a href="' + SH.esc(zbHostUrl) + '" target="_blank" style="font-size:' + FS.cell + ';color:var(--bpc-cyan)">Zabbix →</a>'
      + '</td>'

    return '<tr style="background:' + rowBg + '">'
      + colEstado + colName + colTipo + colIcmp + colAvail + colSnmp + colTrg + colDrill
      + '</tr>'
  }).join('')

  var nCrit = rows.filter(function (r) { return r.rowState === 'crit' }).length
  var nWarn = rows.filter(function (r) { return r.rowState === 'warn' }).length
  var summary = '<div style="display:flex;align-items:center;gap:16px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08)">'
    + '<span style="font-size:' + FS.header + ';font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);text-transform:uppercase">Armazenamento · ' + rows.length + ' dispositivos</span>'
    + (nCrit ? '<span style="font-size:' + FS.badge + ';font-weight:700;color:var(--bpc-crit)">▲ ' + nCrit + ' críticos</span>' : '')
    + (nWarn ? '<span style="font-size:' + FS.badge + ';font-weight:700;color:var(--bpc-warn)">● ' + nWarn + ' degradados</span>' : '')
    + '</div>'

  el.innerHTML = '<div class="bpc" style="font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif">'
    + summary
    + '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead>' + thead + '</thead>'
    + '<tbody>' + tbody + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
// ────────────────────────────────────────────────────────────────────────────

function startTabela(rpc) {
  window.BPC.utils.waitForElement(CFG_TAB.elementId, function (el) {
    el.innerHTML = window.BPC.utils.buildSkeleton()

    function load() {
      tabFetch(rpc)
        .then(function (data) { tabRender(el, tabCompute(data), null) })
        .catch(function (e)    { tabRender(el, null, e.message || String(e)) })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG_TAB.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(startTabela); return }
  if (attempt > 50) { console.error('[BPC] l2-tabela armazenamento: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
