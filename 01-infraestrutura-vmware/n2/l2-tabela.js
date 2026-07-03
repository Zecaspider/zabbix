// N2 VMware — Tabela de Hypervisores ESXi
// Dashboard: n2-infraestrutura-vmware (a967e936)
// Painel: bpc-vmw-esxi-tabela
// v1.0 — adapta n3-esxi/l2-tabela.js; grupo 603; sem filtro de tag (mostra todos)

var CFG_VMW_ESXI_TAB = {
  elementId:    'bpc-vmw-esxi-tabela',
  groupId:      '603',
  refreshMs:    60000,
  sparkSeconds: 1800,
  maxAgeSec:    600,
  grafanaL3:    'http://10.10.126.22:3000/d/b55d5481-9f82-4371-a7ca-e83ceb3064cc/n3-servidores-fisicos-esxi-detalhe',

  // Valores canónicos: engenharia-do-sistema.md §6.2 (fonte de verdade única, não inventar aqui).
  thresholds: {
    cpu: { warn: 70, crit: 90 },
    ram: { warn: 70, crit: 85 },
    ds:  { warn: 20, crit: 10 },
  },

  fs: {
    header:  '13px',
    cell:    '15px',
    value:   '18px',
    sub:     '12px',
    badge:   '11px',
    name:    '15px',
    nameSub: '11px',
  },
}

var _vmwEsxiTabHostCache = null

// ─── fetch ────────────────────────────────────────────────────────────────────

function vmwEsxiTabGetHosts(rpc) {
  if (_vmwEsxiTabHostCache && _vmwEsxiTabHostCache.length) return Promise.resolve(_vmwEsxiTabHostCache)
  return rpc('host.get', {
    groupids: [CFG_VMW_ESXI_TAB.groupId],
    output:   ['hostid', 'name', 'host'],
    filter:   { status: 0 },
  }).then(function(all) {
    // filtra só os ESXi (exclui Cisco UCS, IBM Power, Dell)
    _vmwEsxiTabHostCache = all.filter(function(h) {
      return /^VIRT\s*-\s*ESXi\s*-/i.test(h.name)
    })
    return _vmwEsxiTabHostCache
  })
}

function vmwEsxiTabGetSparklines(rpc, cpuByHost) {
  var ids = Object.keys(cpuByHost).map(function(hid) { return cpuByHost[hid] }).filter(Boolean)
  if (!ids.length) return Promise.resolve({})
  var tf = Math.floor(Date.now() / 1000) - CFG_VMW_ESXI_TAB.sparkSeconds
  return rpc('history.get', {
    itemids: ids, history: 0, time_from: tf,
    output: 'extend', sortfield: 'clock', sortorder: 'ASC', limit: 5000,
  }).then(function(rows) {
    if (!Array.isArray(rows)) return {}
    var i2h = {}
    Object.keys(cpuByHost).forEach(function(hid) { i2h[cpuByHost[hid]] = hid })
    var bh = {}
    rows.forEach(function(r) {
      var hid = i2h[r.itemid]; if (!hid) return
      var b = Math.floor(parseInt(r.clock) / 60)
      if (!bh[hid]) bh[hid] = {}
      if (!bh[hid][b]) bh[hid][b] = []
      bh[hid][b].push(parseFloat(r.value))
    })
    var res = {}
    Object.keys(bh).forEach(function(hid) {
      res[hid] = Object.keys(bh[hid]).sort().map(function(t) {
        var v = bh[hid][t]; return v.reduce(function(s, x) { return s + x }, 0) / v.length
      })
    })
    return res
  }).catch(function() { return {} })
}

function vmwEsxiTabFetch(rpc) {
  return vmwEsxiTabGetHosts(rpc).then(function(hosts) {
    if (!hosts.length) return { hosts: [], items: [], triggers: [] }
    var hostIds = hosts.map(function(h) { return h.hostid })
    return Promise.all([
      rpc('item.get', {
        hostids: hostIds,
        search: { name: [
          'CPU usage in percent', 'Total memory', 'Used memory',
          'Number of guest VMs', 'Cluster name', 'Uptime', 'Power usage',
          'Connection state', 'Free space on datastore [', 'Total size of datastore [',
        ] },
        searchByAny: true,
        output: ['hostid', 'name', 'lastvalue', 'lastclock', 'itemid'],
        monitored: true, limit: 8000,
      }),
      rpc('trigger.get', {
        hostids: hostIds,
        only_true: true, monitored: true, skipDependent: true,
        expandDescription: true,
        output: ['triggerid', 'description', 'priority', 'lastchange'],
        selectHosts: ['hostid'],
        sortfield: 'priority', sortorder: 'DESC',
        limit: 500,
      }),
    ]).then(function(res) {
      return { hosts: hosts, items: res[0], triggers: res[1] }
    })
  })
}

// ─── compute ──────────────────────────────────────────────────────────────────

function vmwEsxiTabCompute(data, sparks) {
  var S  = window.BPC.state
  var C  = CFG_VMW_ESXI_TAB
  var hosts    = data.hosts
  var items    = data.items
  var triggers = data.triggers

  var trgByHost = {}
  ;(triggers || []).forEach(function(t) {
    ;(t.hosts || []).forEach(function(h) {
      if (!trgByHost[h.hostid]) trgByHost[h.hostid] = []
      trgByHost[h.hostid].push(t)
    })
  })

  var byHost = {}
  ;(items || []).forEach(function(i) {
    if (!byHost[i.hostid]) byHost[i.hostid] = { _clocks: {}, _ds: {} }
    var hd = byHost[i.hostid]
    if (i.name.indexOf('Free space on datastore [') !== -1) {
      var lbl = (i.name.match(/\[([^\]]+)\]/) || ['', i.name])[1]
      var fp = parseFloat(i.lastvalue)
      if (!isNaN(fp)) {
        if (hd._ds[lbl] === undefined) hd._ds[lbl] = { free: fp }
        else hd._ds[lbl].free = Math.min(hd._ds[lbl].free, fp)
      }
    } else if (i.name.indexOf('Total size of datastore [') !== -1) {
      var lbl2 = (i.name.match(/\[([^\]]+)\]/) || ['', i.name])[1]
      var ts = parseFloat(i.lastvalue)
      if (!isNaN(ts)) {
        if (!hd._ds[lbl2]) hd._ds[lbl2] = {}
        hd._ds[lbl2].totGb = +(ts / 1073741824).toFixed(0)
      }
    } else {
      var v = parseFloat(i.lastvalue)
      hd[i.name] = isNaN(v) ? i.lastvalue : v
      hd._clocks[i.name] = parseInt(i.lastclock) || 0
      if (i.name === 'CPU usage in percent') hd._cpuItemId = i.itemid
    }
  })

  function stateOrder(s) { return s === 'crit' ? 0 : s === 'warn' ? 1 : 2 }
  function prio2state(p) { p = parseInt(p); return p >= 4 ? 'crit' : p >= 2 ? 'warn' : 'ok' }

  var rows = hosts.map(function(host) {
    var hid = host.hostid
    var h   = byHost[hid] || { _clocks: {}, _ds: {} }

    var cpu    = h['CPU usage in percent'] != null ? +h['CPU usage in percent'] : null
    var ramU   = h['Used memory']  != null ? +h['Used memory']  : null
    var ramT   = h['Total memory'] != null ? +h['Total memory'] : null
    var ramPct = (ramU != null && ramT > 0) ? (ramU / ramT) * 100 : null
    var ramGb  = ramU != null ? +(ramU / 1073741824).toFixed(0) : null
    var ramTGb = ramT != null ? +(ramT / 1073741824).toFixed(0) : null

    var now    = Math.floor(Date.now() / 1000)
    var cpuAge = h._clocks['CPU usage in percent'] ? now - h._clocks['CPU usage in percent'] : 9999
    var stale  = cpuAge > C.maxAgeSec
    var noData = cpu == null

    var cpuState  = (cpu != null && !stale) ? S.metric(cpu, C.thresholds.cpu) : (stale ? 'warn' : 'ok')
    var ramState  = ramPct != null ? S.metric(ramPct, C.thresholds.ram) : 'ok'
    var connRaw   = h['Connection state']
    var connOk    = connRaw == null || String(connRaw).toLowerCase().indexOf('connect') !== -1
    var connState = connOk ? 'ok' : 'crit'

    var dsArr = Object.keys(h._ds).map(function(name) {
      var d = h._ds[name]
      return { name: name, freePct: d.free != null ? d.free : null, totGb: d.totGb || 0 }
    }).filter(function(d) { return d.freePct != null })
    dsArr.sort(function(a, b) { return a.freePct - b.freePct })
    var dsWorst = dsArr[0] || null
    var dsState = dsWorst ? (dsWorst.freePct <= C.thresholds.ds.crit ? 'crit' : dsWorst.freePct <= C.thresholds.ds.warn ? 'warn' : 'ok') : 'ok'

    var hostTrigs     = trgByHost[hid] || []
    var trgWorstState = hostTrigs.length ? prio2state(hostTrigs[0].priority) : 'ok'
    var rowState      = S.worst([cpuState, ramState, connState, dsState, trgWorstState])
    if (noData) rowState = 'ok'

    var techName = host.host || host.name
    var visName  = host.name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i, '')

    return {
      hostid: hid, hostName: host.name,
      techName: techName, visName: visName,
      cluster: h['Cluster name'] || '—',
      cpu: cpu, cpuState: cpuState, cpuSpark: (sparks || {})[hid] || [],
      ramPct: ramPct, ramGb: ramGb, ramTGb: ramTGb, ramState: ramState,
      vms:    h['Number of guest VMs'] != null ? Math.round(h['Number of guest VMs']) : null,
      uptime: h['Uptime'] != null ? +h['Uptime'] : null,
      power:  h['Power usage'] != null ? Math.round(h['Power usage']) : null,
      dsArr: dsArr, dsWorst: dsWorst, dsState: dsState,
      trigs: hostTrigs, trgWorstState: trgWorstState,
      rowState: rowState, stale: stale, noData: noData,
    }
  })

  rows.sort(function(a, b) {
    var od = stateOrder(a.rowState) - stateOrder(b.rowState)
    if (od !== 0) return od
    var ac = a.cpu != null ? a.cpu : -1
    var bc = b.cpu != null ? b.cpu : -1
    return bc - ac
  })

  return rows
}

// ─── render ───────────────────────────────────────────────────────────────────

function vmwEsxiTabRender(el, rows, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var u  = window.BPC.utils
  var FS = CFG_VMW_ESXI_TAB.fs

  if (err)  { el.innerHTML = u.buildError('Tabela ESXi', err); return }
  if (!rows || !rows.length) { el.innerHTML = u.buildError('Tabela ESXi', 'Sem hosts ESXi no grupo 603.'); return }

  function fmtUptime(sec) {
    if (sec == null || isNaN(sec)) return '—'
    var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600)
    return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
  }

  function stateDot(state) {
    var color = S.color(state)
    var label = { ok: 'OK', warn: 'WARN', crit: 'CRIT' }[state] || '?'
    return '<div style="display:flex;align-items:center;gap:6px">'
      + '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>'
      + '<span style="font-size:' + FS.badge + ';font-weight:700;letter-spacing:.08em;color:' + color + '">' + label + '</span>'
      + '</div>'
  }

  function pctBar(pct, state, w) {
    w = w || 60
    var color = S.color(state)
    var fill  = Math.min(pct != null ? pct : 0, 100).toFixed(1)
    return '<div style="width:' + w + 'px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:3px">'
      + '<div style="height:100%;width:' + fill + '%;background:' + color + ';border-radius:2px"></div>'
      + '</div>'
  }

  function sparkSVG(data, color) {
    if (!data || data.length < 2) return ''
    var mn = Math.min.apply(null, data), mx = Math.max.apply(null, data), rng = mx - mn || 1
    var w = 70, h = 20
    var pts = data.map(function(v, i) { return [(i / (data.length - 1)) * w, h - ((v - mn) / rng) * (h - 4) - 2] })
    var ln  = 'M' + pts.map(function(p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1) }).join('L')
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;margin-top:2px">'
      + '<path d="' + ln + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round"/>'
      + '<circle cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="2" fill="' + color + '"/>'
      + '</svg>'
  }

  function drillUrl(hostName) {
    if (!CFG_VMW_ESXI_TAB.grafanaL3) return '#'
    return CFG_VMW_ESXI_TAB.grafanaL3 + '?var-hostid=' + encodeURIComponent(hostName)
  }

  var TH = 'text-align:left;padding:8px 10px;font-size:' + FS.header + ';font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);border-bottom:2px solid rgba(255,255,255,0.1);white-space:nowrap'
  var TD = 'padding:8px 10px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,0.06)'

  var thead = '<tr>'
    + '<th style="' + TH + '">Estado</th>'
    + '<th style="' + TH + '">Host</th>'
    + '<th style="' + TH + '">Cluster</th>'
    + '<th style="' + TH + '">CPU</th>'
    + '<th style="' + TH + '">RAM</th>'
    + '<th style="' + TH + '">VMs</th>'
    + '<th style="' + TH + '">Uptime</th>'
    + '<th style="' + TH + '">Power</th>'
    + '<th style="' + TH + '">Datastores</th>'
    + '<th style="' + TH + '">Triggers</th>'
    + '<th style="' + TH + '"></th>'
    + '</tr>'

  var tbody = rows.map(function(r) {
    var rowBg = r.rowState === 'crit' ? 'rgba(248,81,73,0.05)'
              : r.rowState === 'warn' ? 'rgba(210,153,34,0.04)' : ''

    var colEstado = '<td style="' + TD + '">' + stateDot(r.rowState) + '</td>'

    var colHost = '<td style="' + TD + ';min-width:140px">'
      + '<div style="font-size:' + FS.name + ';font-weight:700;color:#E6EDF3;font-family:monospace">' + SH.esc(r.techName) + '</div>'
      + '<div style="font-size:' + FS.nameSub + ';color:var(--bpc-mute);margin-top:1px">' + SH.esc(r.visName) + '</div>'
      + '</td>'

    var colCluster = '<td style="' + TD + ';font-size:' + FS.cell + ';color:var(--bpc-mute)">' + SH.esc(r.cluster) + '</td>'

    var cpuColor = S.color(r.cpuState)
    var colCpu = '<td style="' + TD + ';min-width:90px">'
    if (r.noData || r.cpu == null) {
      colCpu += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      colCpu += '<span style="font-size:' + FS.value + ';font-weight:700;color:' + cpuColor + ';font-family:monospace">' + r.cpu.toFixed(1) + '%</span>'
        + (r.stale ? '<span style="font-size:' + FS.sub + ';color:var(--bpc-mute)"> stale</span>' : '')
        + pctBar(r.cpu, r.cpuState, 70)
        + sparkSVG(r.cpuSpark, cpuColor)
    }
    colCpu += '</td>'

    var ramColor = S.color(r.ramState)
    var colRam = '<td style="' + TD + ';min-width:110px">'
    if (r.ramPct == null) {
      colRam += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      colRam += '<span style="font-size:' + FS.value + ';font-weight:700;color:' + ramColor + ';font-family:monospace">' + r.ramPct.toFixed(1) + '%</span>'
        + pctBar(r.ramPct, r.ramState, 70)
        + '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute);margin-top:2px">'
        + (r.ramGb != null ? r.ramGb + ' / ' + (r.ramTGb || '?') + ' GB' : '')
        + '</div>'
    }
    colRam += '</td>'

    var colVms = '<td style="' + TD + ';text-align:center">'
      + (r.vms != null ? '<span style="font-size:' + FS.value + ';font-weight:700;color:var(--bpc-cyan)">' + r.vms + '</span>' : '<span style="color:var(--bpc-mute)">—</span>')
      + '</td>'

    var colUptime = '<td style="' + TD + ';font-size:' + FS.cell + ';color:var(--bpc-mute);white-space:nowrap">' + fmtUptime(r.uptime) + '</td>'
    var colPower  = '<td style="' + TD + ';font-size:' + FS.cell + ';color:var(--bpc-mute);white-space:nowrap">' + (r.power != null ? r.power + ' W' : '—') + '</td>'

    var colDs = '<td style="' + TD + ';min-width:110px">'
    if (!r.dsArr || !r.dsArr.length) {
      colDs += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      var dsColor = S.color(r.dsState)
      colDs += '<span style="font-size:' + FS.value + ';font-weight:700;color:' + dsColor + ';font-family:monospace">' + r.dsArr[0].freePct.toFixed(1) + '%</span>'
        + '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute)">livre · ' + r.dsArr.length + ' DS</div>'
      if (r.dsArr.length > 1) {
        var w2 = r.dsArr[1]
        var nm2 = w2.name.length > 12 ? w2.name.slice(0, 11) + '…' : w2.name
        colDs += '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute)">' + SH.esc(nm2) + ' ' + w2.freePct.toFixed(1) + '%</div>'
      }
    }
    colDs += '</td>'

    var colTrg = '<td style="' + TD + ';min-width:80px">'
    if (!r.trigs || !r.trigs.length) {
      colTrg += '<span style="font-size:' + FS.cell + ';color:var(--bpc-ok)">OK</span>'
    } else {
      var nCrit = r.trigs.filter(function(t) { return parseInt(t.priority) >= 4 }).length
      var nWarn = r.trigs.length - nCrit
      colTrg += (nCrit ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-crit)">▲ ' + nCrit + ' crit</div>' : '')
        + (nWarn ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-warn)">● ' + nWarn + ' warn</div>' : '')
      var first = r.trigs[0]
      var desc  = first.description.length > 28 ? first.description.slice(0, 27) + '…' : first.description
      colTrg += '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute);margin-top:2px">' + SH.esc(desc) + '</div>'
    }
    colTrg += '</td>'

    var colDrill = '<td style="' + TD + ';text-align:center">'
      + '<a href="' + SH.esc(drillUrl(r.hostName)) + '" target="_blank" class="bpc-link" style="font-size:' + FS.cell + ';white-space:nowrap">Ver detalhes</a>'
      + '</td>'

    return '<tr style="background:' + rowBg + '">'
      + colEstado + colHost + colCluster + colCpu + colRam
      + colVms + colUptime + colPower + colDs + colTrg + colDrill
      + '</tr>'
  }).join('')

  var nCrit = rows.filter(function(r) { return r.rowState === 'crit' }).length
  var nWarn = rows.filter(function(r) { return r.rowState === 'warn' }).length
  var summary = '<div style="display:flex;align-items:center;gap:16px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.08)">'
    + '<span style="font-size:' + FS.header + ';font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);text-transform:uppercase">Hypervisores ESXi · ' + rows.length + ' hosts</span>'
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

// ─── bootstrap ────────────────────────────────────────────────────────────────

function startVmwEsxiTabela(rpc) {
  window.BPC.utils.waitForElement(CFG_VMW_ESXI_TAB.elementId, function(el) {
    el.innerHTML = window.BPC.utils.buildSkeleton()

    function load() {
      vmwEsxiTabFetch(rpc).then(function(data) {
        var cpuByHost = {}
        ;(data.items || []).forEach(function(i) {
          if (i.name === 'CPU usage in percent') cpuByHost[i.hostid] = i.itemid
        })
        vmwEsxiTabGetSparklines(rpc, cpuByHost).then(function(sparks) {
          vmwEsxiTabRender(el, vmwEsxiTabCompute(data, sparks), null)
        })
      }).catch(function(e) {
        vmwEsxiTabRender(el, null, e.message || String(e))
      })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG_VMW_ESXI_TAB.refreshMs)
  })
}

function initWithRetry_vmwTabela(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(startVmwEsxiTabela); return }
  if (attempt > 50) { console.error('[BPC] l2-tabela vmware: waitForBPC indisponivel'); return }
  setTimeout(function() { initWithRetry_vmwTabela(attempt + 1) }, 100)
}

initWithRetry_vmwTabela()
