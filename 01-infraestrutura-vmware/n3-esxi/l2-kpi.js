// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · SERVIDORES FÍSICOS (ESXi) · KPI STRIP  v3.0           ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  6 cards: Hosts · Clusters · CPU (pior) · RAM (pior)                   ║
// ║           · Datastores · Alertas                                        ║
// ║  Filtro: tag '01 camada' = 'fisica' dentro do grupo 603                 ║
// ║  Princípio NOC: pior valor, não média                                   ║
// ║                                                                          ║
// ║  [1] CFG          [4] FETCH (hostIds + items + sparks + clusters + trg) ║
// ║  [2] HELPERS      [5] RENDER (usa BPC_CHARTS + BPC.state)              ║
// ║  [3] CACHE        [6] BOOTSTRAP — initWithRetry                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_KPI = {
  elementId:    'bpc-sf-kpi',
  groupId:      '603',
  refreshMs:    60000,
  historySeconds: 3600,
  hostTag:      { tag: '01 camada', value: 'fisica' },
  hostCacheTTL: 300,

  zabbixUrl:          'http://10.10.126.22/zabbix',
  grafanaDsUrl:       'http://10.10.126.22:3000/d/adt8rmt/dashboard-datastores',
  grafanaClustersUrl: 'http://10.10.126.22:3000/d/advn9cn/d3-3-clusters',
  grafanaProblemsUrl: 'http://10.10.126.22:3000/d/adhl9nr/d3-4-triggers-servidores-fisicos',

  triggerPriority: { crit: [4, 5], warn: [2, 3], info: [0, 1] },
  dsThreshold:     { warn: 20, crit: 10 },
  thresholds:      { cpu: { warn: 70, crit: 90 }, ram: { warn: 70, crit: 85 } },  // canónico engenharia-do-sistema.md §6.2
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function kpiEsc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
function kpiPct(v) { return (v == null || isNaN(v)) ? '—' : v.toFixed(1) + '%' }
function kpiGb(bytes) { return bytes > 0 ? +(bytes / 1073741824).toFixed(0) : 0 }

function kpiPrioState(p) {
  p = parseInt(p, 10)
  if (CFG_KPI.triggerPriority.crit.indexOf(p) !== -1) return 'crit'
  if (CFG_KPI.triggerPriority.warn.indexOf(p) !== -1) return 'warn'
  return 'info'
}
function kpiGlobalFromTriggers(triggers) {
  var state = 'ok'
  for (var i = 0; i < triggers.length; i++) {
    var ts = kpiPrioState(triggers[i].priority)
    if (ts === 'crit') return 'crit'
    if (ts === 'warn') state = 'warn'
  }
  return state
}
function kpiZbUrl(severities) {
  var tf = CFG_KPI.hostTag
  var url = CFG_KPI.zabbixUrl + '/zabbix.php?action=problem.view&filter_show=1'
    + '&filter_tags%5B0%5D%5Btag%5D=' + encodeURIComponent(tf.tag)
    + '&filter_tags%5B0%5D%5Bvalue%5D=' + encodeURIComponent(tf.value)
    + '&filter_tags%5B0%5D%5Boperator%5D=0&filter_set=1'
  if (severities && severities.length)
    url += '&' + severities.map(function (s) { return 'filter_severity%5B%5D=' + s }).join('&')
  return url
}


// ────────────────────────────────────────────────────────────────────────────
// [3] CACHE
// ────────────────────────────────────────────────────────────────────────────

var _kpiHostIds = null, _kpiHostIdsCachedAt = 0
var _kpiHostMeta = {}, _kpiRamHistType = null, _kpiVcenterIds = null

function _kpiCacheValid() {
  return _kpiHostIds && _kpiHostIds.length &&
    (Math.floor(Date.now() / 1000) - _kpiHostIdsCachedAt) < CFG_KPI.hostCacheTTL
}


// ────────────────────────────────────────────────────────────────────────────
// [4] FETCH
// ────────────────────────────────────────────────────────────────────────────

function kpiGetHostIds(rpc) {
  if (_kpiCacheValid()) return Promise.resolve(_kpiHostIds)
  return rpc('host.get', {
    groupids: [CFG_KPI.groupId], selectTags: 'extend',
    selectInterfaces: ['available'], output: ['hostid', 'name', 'status'],
  }).then(function (hosts) {
    var tag = CFG_KPI.hostTag
    var active = hosts.filter(function (h) {
      return String(h.status) !== '1' &&
        (h.tags || []).some(function (t) { return t.tag === tag.tag && t.value === tag.value })
    })
    _kpiHostMeta = {}
    active.forEach(function (h) {
      var avail = (Array.isArray(h.interfaces) ? h.interfaces : []).reduce(function (w, i) {
        var a = parseInt(i.available, 10)
        return a === 2 ? 2 : w === 2 ? 2 : a === 0 ? 0 : w
      }, 1)
      _kpiHostMeta[h.hostid] = { name: h.name, available: avail }
    })
    _kpiHostIds = active.map(function (h) { return h.hostid })
    _kpiHostIdsCachedAt = Math.floor(Date.now() / 1000)
    return _kpiHostIds
  })
}

function kpiSparkCpu(rpc, ids) {
  if (!ids || !ids.length) return Promise.resolve([])
  var tf = Math.floor(Date.now() / 1000) - CFG_KPI.historySeconds
  return rpc('history.get', {
    itemids: ids, history: 0, time_from: tf,
    output: 'extend', sortfield: 'clock', sortorder: 'ASC', limit: 5000,
  }).then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) return []
    var b = {}
    rows.forEach(function (r) {
      var k = Math.floor(parseInt(r.clock) / 60)
      if (!b[k]) b[k] = { s: 0, n: 0 }
      b[k].s += parseFloat(r.value) || 0; b[k].n++
    })
    return Object.keys(b).sort().map(function (k) { return b[k].s / b[k].n })
  }).catch(function () { return [] })
}

function kpiSparkRam(rpc, usedIds, totIds) {
  if (!usedIds || !usedIds.length) return Promise.resolve([])
  var tf = Math.floor(Date.now() / 1000) - CFG_KPI.historySeconds
  function fetch(ht) {
    return Promise.all([
      rpc('history.get', { itemids: usedIds, history: ht, time_from: tf, output: 'extend', sortfield: 'clock', sortorder: 'ASC', limit: 5000 }),
      rpc('history.get', { itemids: totIds,  history: ht, time_from: tf, output: 'extend', sortfield: 'clock', sortorder: 'ASC', limit: 5000 }),
    ])
  }
  function process(used, tot) {
    if (!used.length) return []
    var totByItem = {}; tot.forEach(function (r) { totByItem[r.itemid] = parseFloat(r.value) || 0 })
    var ramTot = Object.values(totByItem).reduce(function (a, v) { return a + v }, 0)
    if (!ramTot) return []
    var b = {}; used.forEach(function (r) { var k = Math.floor(parseInt(r.clock) / 60); if (!b[k]) b[k] = 0; b[k] += parseFloat(r.value) || 0 })
    return Object.keys(b).sort().map(function (k) { return (b[k] / ramTot) * 100 })
  }
  if (_kpiRamHistType !== null) {
    if (_kpiRamHistType === 0) return Promise.resolve([])
    return fetch(_kpiRamHistType).then(function (r) { return process(r[0], r[1]) }).catch(function () { return [] })
  }
  return fetch(1).then(function (r) {
    if (r[0] && r[0].length > 0) { _kpiRamHistType = 1; return process(r[0], r[1]) }
    _kpiRamHistType = 0; return []
  }).catch(function () { _kpiRamHistType = 0; return [] })
}

function kpiClusters(rpc) {
  var step1 = _kpiVcenterIds
    ? Promise.resolve(_kpiVcenterIds)
    : rpc('host.get', { search: { name: 'vcenter' }, searchWildcardsEnabled: false, output: ['hostid', 'name'] })
        .then(function (hosts) {
          _kpiVcenterIds = hosts.filter(function (h) { return /\(v[Cc]enter/i.test(h.name) })
          return _kpiVcenterIds
        })
  return step1.then(function (vcs) {
    if (!vcs || !vcs.length) return []
    return rpc('item.get', {
      hostids: vcs.map(function (v) { return v.hostid }),
      search: { name: 'Status of [' }, output: ['name', 'lastvalue'], monitored: true, limit: 200,
    }).then(function (items) {
      var seen = {}, clusters = []
      items.forEach(function (i) {
        var m = i.name.match(/\[([^\]]+)\]/), name = m ? m[1] : i.name
        if (seen[name]) return; seen[name] = true
        clusters.push({ name: name, green: !!(i.lastvalue && (i.lastvalue === '1' || i.lastvalue.indexOf('(1)') !== -1)) })
      })
      clusters.sort(function (a, b) { if (a.green !== b.green) return a.green ? 1 : -1; return a.name.localeCompare(b.name) })
      return clusters
    })
  })
}

function kpiGetData(rpc) {
  return kpiGetHostIds(rpc).then(function (hostIds) {
    if (!hostIds || !hostIds.length) throw new Error('Nenhum host ESXi com tag esperada')

    var hostsDownNames = []
    Object.keys(_kpiHostMeta).forEach(function (hid) {
      if (_kpiHostMeta[hid].available === 2) hostsDownNames.push(_kpiHostMeta[hid].name || hid)
    })

    return rpc('item.get', {
      hostids: hostIds,
      search: { name: ['CPU usage in percent','Total memory','Used memory','Number of guest VMs','Uptime','Free space on datastore [','Total size of datastore ['] },
      searchByAny: true,
      output: ['hostid', 'name', 'lastvalue', 'itemid'],
      selectHosts: ['hostid', 'name'],
      monitored: true, limit: 5000,
    }).then(function (items) {
      if (!Array.isArray(items) || !items.length) throw new Error('Sem items ESXi')

      var byHost = {}, dsUnique = {}, dsTotBytes = {}
      var cpuIds = [], ramUsedIds = [], ramTotIds = []

      hostIds.forEach(function (hid) {
        var m = _kpiHostMeta[hid] || {}
        byHost[hid] = { name: m.name || hid, scalars: {} }
      })

      items.forEach(function (i) {
        var h = i.hosts && i.hosts[0]; if (!h || !byHost[h.hostid]) return
        var hid = h.hostid
        if (i.name.indexOf('Free space on datastore [') !== -1) {
          var v = parseFloat(i.lastvalue); if (isNaN(v)) return
          var lbl = (i.name.match(/\[([^\]]+)\]/) || ['', i.name])[1]
          if (dsUnique[lbl] === undefined || v < dsUnique[lbl]) dsUnique[lbl] = v
        } else if (i.name.indexOf('Total size of datastore [') !== -1) {
          var v2 = parseFloat(i.lastvalue); if (isNaN(v2)) return
          var lbl2 = (i.name.match(/\[([^\]]+)\]/) || ['', i.name])[1]
          if (!dsTotBytes[lbl2] || v2 > dsTotBytes[lbl2]) dsTotBytes[lbl2] = v2
        } else {
          byHost[hid].scalars[i.name] = i.lastvalue
          if (i.name === 'CPU usage in percent') cpuIds.push(i.itemid)
          if (i.name === 'Used memory')  ramUsedIds.push(i.itemid)
          if (i.name === 'Total memory') ramTotIds.push(i.itemid)
        }
      })

      var hosts = Object.values(byHost)
      var hostsTotal = hostIds.length, hostsNoData = 0
      var sumCpu = 0, hostsWithCpu = 0
      var worstCpu = 0, worstCpuHost = '—', worstCpuVMs = null
      var worstRam = 0, worstRamHost = '—', worstRamUsedGb = null, worstRamTotGb = null
      var sumRamUsed = 0, sumRamTot = 0, sumVMs = 0
      var recentReboots = 0, rebootHosts = []

      hosts.forEach(function (h) {
        var sc = h.scalars
        var cpu = parseFloat(sc['CPU usage in percent']); if (isNaN(cpu)) { hostsNoData++; return }
        var ramU = parseFloat(sc['Used memory']) || 0
        var ramT = parseFloat(sc['Total memory']) || 0
        var ram  = ramT > 0 ? (ramU / ramT) * 100 : 0
        hostsWithCpu++; sumCpu += cpu
        if (cpu > worstCpu) { worstCpu = cpu; worstCpuHost = h.name; worstCpuVMs = parseFloat(sc['Number of guest VMs']) || null }
        if (ram > worstRam) { worstRam = ram; worstRamHost = h.name; worstRamUsedGb = kpiGb(ramU); worstRamTotGb = kpiGb(ramT) }
        sumRamUsed += ramU; sumRamTot += ramT
        sumVMs += parseFloat(sc['Number of guest VMs']) || 0
        var up = parseFloat(sc['Uptime'])
        if (!isNaN(up) && up < 86400) { recentReboots++; rebootHosts.push(h.name) }
      })

      var dsArr = [], dsWorstPct = null, dsUniqAlert = 0, dsUniqCrit = 0, totalDsGb = 0
      Object.keys(dsUnique).forEach(function (name) {
        var fp = dsUnique[name], totB = dsTotBytes[name] || 0
        var totGb = kpiGb(totB), usedGb = totGb > 0 ? Math.round(totGb * (1 - fp / 100)) : 0
        totalDsGb += totGb
        if (fp <= CFG_KPI.dsThreshold.crit) dsUniqCrit++
        if (fp <= CFG_KPI.dsThreshold.warn) dsUniqAlert++
        if (dsWorstPct === null || fp < dsWorstPct) dsWorstPct = fp
        dsArr.push({ name: name, freePct: fp, totGb: totGb, usedGb: usedGb })
      })
      dsArr.sort(function (a, b) { return a.freePct - b.freePct })

      var cpuAvg = hostsWithCpu > 0 ? sumCpu / hostsWithCpu : null
      var ramAvgPct = sumRamTot > 0 ? (sumRamUsed / sumRamTot) * 100 : null

      return Promise.all([
        kpiSparkCpu(rpc, cpuIds),
        kpiSparkRam(rpc, ramUsedIds, ramTotIds),
        kpiClusters(rpc),
        rpc('trigger.get', {
          hostids: hostIds, only_true: true, monitored: true, skipDependent: true,
          expandDescription: true,
          output: ['triggerid', 'priority', 'value'],
          selectHosts: ['hostid'], limit: 1000,
        }),
      ]).then(function (res) {
        var activeTriggers = (res[3] || []).filter(function (t) { return String(t.value) === '1' })
        var globalState = kpiGlobalFromTriggers(activeTriggers)
        if (hostsDownNames.length > 0 && globalState === 'ok') globalState = 'warn'

        var trigCounts = { crit: 0, warn: 0, info: 0 }
        var hostsWithTrigger = {}
        activeTriggers.forEach(function (t) {
          trigCounts[kpiPrioState(t.priority)]++
          ;(t.hosts || []).forEach(function (h) { hostsWithTrigger[h.hostid] = true })
        })

        return {
          globalState: globalState,
          hostsTotal: hostsTotal,
          hostsOnline: hostsTotal - hostsDownNames.length,
          hostsDown: hostsDownNames.length, hostsDownNames: hostsDownNames,
          hostsAlerta: Object.keys(hostsWithTrigger).length,
          vmsTotal: Math.round(sumVMs),
          cpuAvg: cpuAvg,
          cpuWorst: +worstCpu.toFixed(1), cpuWorstHost: worstCpuHost, cpuWorstVMs: worstCpuVMs,
          ramAvgPct: ramAvgPct,
          ramWorst: +worstRam.toFixed(1), worstRamHost: worstRamHost,
          worstRamUsedGb: worstRamUsedGb, worstRamTotGb: worstRamTotGb,
          recentReboots: recentReboots, rebootHosts: rebootHosts,
          dsWorstPct: dsWorstPct !== null ? +dsWorstPct.toFixed(1) : null,
          dsUniqAlert: dsUniqAlert, dsUniqCrit: dsUniqCrit,
          dsCount: dsArr.length, dsTopWorst: dsArr.slice(0, 3),
          totalDsGb: +totalDsGb.toFixed(0),
          trigCounts: trigCounts, trigTotal: activeTriggers.length,
          sparkCpu: res[0], sparkRam: res[1], clusters: res[2],
        }
      })
    })
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER — usa BPC_CHARTS + BPC.state + classes BPC
// ────────────────────────────────────────────────────────────────────────────

function kpiRender(el, d, errMsg) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var CH = window.BPC_CHARTS
  var u  = window.BPC.utils

  if (errMsg) { el.innerHTML = u.buildError('KPI ESXi', errMsg); return }
  if (!d)     { el.innerHTML = u.buildError('KPI ESXi', 'Sem dados'); return }

  // ── utilitários locais de render ────────────────────────────────
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

  function drillLink(url, label) {
    return '<a href="' + kpiEsc(url) + '" target="_blank" class="bpc-link" style="font-size:.70rem;">' + kpiEsc(label) + ' →</a>'
  }

  // ── Card 1 — Hosts ──────────────────────────────────────────────
  var hostState = d.hostsDown > 0 ? 'warn' : 'ok'
  var c1 = '<div class="bpc bpc-card state-' + hostState + '" style="--card-accent:' + S.color(hostState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Hosts activos', hostState)
    + '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
    + '  <span class="bpc-value-lg bpc-' + hostState + '">' + d.hostsOnline + '</span>'
    + '  <span class="bpc-label">/ ' + d.hostsTotal + '</span>'
    + '</div>'
    + SH.pbar(d.hostsTotal > 0 ? Math.round(d.hostsOnline / d.hostsTotal * 100) : 0, S.color(hostState))
    + (d.hostsDown > 0
      ? '<div class="bpc-label bpc-warn" style="margin-top:2px">● ' + d.hostsDown + ' offline'
        + (d.hostsDownNames.length ? ' · ' + kpiEsc(d.hostsDownNames.slice(0,2).join(', ')) + (d.hostsDownNames.length > 2 ? ' +' + (d.hostsDownNames.length - 2) : '') : '')
        + '</div>'
      : '<div class="bpc-label bpc-ok" style="margin-top:2px">● todos disponíveis</div>')
    + (d.recentReboots > 0 ? '<div class="bpc-label bpc-warn">↺ ' + d.recentReboots + ' reboot &lt;24h</div>' : '')
    + '</div>'

  // ── Card 2 — Clusters ────────────────────────────────────────────
  var cl = d.clusters || [], totCl = cl.length, greenCl = cl.filter(function (c) { return c.green }).length
  var clState = totCl > 0 && greenCl < totCl ? 'crit' : totCl > 0 ? 'ok' : 'ok'
  var clGrid = cl.map(function (c) {
    var nm = c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name
    return '<div class="bpc-flex" style="gap:5px;overflow:hidden">'
      + CH.dot(c.green ? 'ok' : 'crit')
      + '<span class="bpc-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + kpiEsc(c.name) + '">' + kpiEsc(nm) + '</span>'
      + '</div>'
  }).join('')
  var c2 = '<div class="bpc bpc-card state-' + clState + '" style="--card-accent:' + S.color(clState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Clusters', clState)
    + '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
    + '  <span class="bpc-value-lg bpc-' + clState + '">' + greenCl + '</span>'
    + '  <span class="bpc-label">/ ' + totCl + '</span>'
    + '</div>'
    + (totCl > 0 && greenCl < totCl
      ? '<div class="bpc-label bpc-crit">● ' + (totCl - greenCl) + ' cluster(s) em falha</div>'
      : '<div class="bpc-label bpc-ok">● todos healthy</div>')
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px">' + clGrid + '</div>'
    + (d.vmsTotal != null ? '<div class="bpc-divider" style="margin:6px 0"></div>'
      + '<div class="bpc-flex bpc-gap-8"><span class="bpc-value-md bpc-cyan">' + d.vmsTotal + '</span>'
      + '<span class="bpc-label">VMs · ' + (d.hostsOnline > 0 ? Math.round(d.vmsTotal / d.hostsOnline) : '—') + '/host</span></div>'
      : '')
    + '<div style="margin-top:auto;padding-top:6px">' + drillLink(CFG_KPI.grafanaClustersUrl, 'Ver clusters') + '</div>'
    + '</div>'

  // ── Card 3 — CPU pior host ──────────────────────────────────────
  var cpuState = S.metric(d.cpuWorst, CFG_KPI.thresholds.cpu)
  var c3 = '<div class="bpc bpc-card state-' + cpuState + '" style="--card-accent:' + S.color(cpuState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('CPU · pior host', cpuState)
    + CH.gaugeSemi(d.cpuWorst, { color: S.color(cpuState), size: 80 })
    + '<div class="bpc-label" style="margin-top:2px">avg ' + kpiPct(d.cpuAvg) + '</div>'
    + (d.cpuWorstHost !== '—'
      ? '<div style="margin-top:4px;padding:4px 6px;border-radius:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)">'
        + '<div class="bpc-label" style="margin-bottom:2px">host</div>'
        + '<div class="bpc-label" style="font-family:monospace;color:' + S.color(cpuState) + '">' + kpiEsc(d.cpuWorstHost) + (d.cpuWorstVMs ? ' · <span class="bpc-cyan">' + d.cpuWorstVMs + ' VMs</span>' : '') + '</div>'
        + '</div>'
      : '')
    + (d.sparkCpu && d.sparkCpu.length >= 2 ? CH.sparkline(d.sparkCpu, S.color(cpuState)) : '')
    + '</div>'

  // ── Card 4 — RAM pior host ──────────────────────────────────────
  var ramState = S.metric(d.ramWorst, CFG_KPI.thresholds.ram)
  var c4 = '<div class="bpc bpc-card state-' + ramState + '" style="--card-accent:' + S.color(ramState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('RAM · pior host', ramState)
    + CH.gaugeSemi(d.ramWorst, { color: S.color(ramState), size: 80 })
    + '<div class="bpc-label" style="margin-top:2px">avg ' + kpiPct(d.ramAvgPct) + '</div>'
    + (d.worstRamHost !== '—'
      ? '<div style="margin-top:4px;padding:4px 6px;border-radius:4px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)">'
        + '<div class="bpc-label" style="margin-bottom:2px">host</div>'
        + '<div class="bpc-label" style="font-family:monospace;color:' + S.color(ramState) + '">' + kpiEsc(d.worstRamHost) + (d.worstRamUsedGb ? ' · <span class="bpc-mute">' + d.worstRamUsedGb + '/' + d.worstRamTotGb + ' GB</span>' : '') + '</div>'
        + '</div>'
      : '')
    + (d.sparkRam && d.sparkRam.length >= 2 ? CH.sparkline(d.sparkRam, S.color(ramState)) : '')
    + '</div>'

  // ── Card 5 — Datastores ──────────────────────────────────────────
  var dsState = d.dsUniqCrit > 0 ? 'crit' : d.dsUniqAlert > 0 ? 'warn' : 'ok'
  var c5 = '<div class="bpc bpc-card state-' + dsState + '" style="--card-accent:' + S.color(dsState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Datastores · ' + d.dsCount, dsState)
    + '<div class="bpc-flex" style="align-items:baseline;gap:4px">'
    + '  <span class="bpc-value-lg bpc-' + dsState + '">' + kpiPct(d.dsWorstPct) + '</span>'
    + '  <span class="bpc-label">livre (pior)</span>'
    + '</div>'
    + (d.dsUniqCrit > 0 ? '<div class="bpc-label bpc-crit">● ' + d.dsUniqCrit + ' DS crítico(s) ≤10%</div>'
      : d.dsUniqAlert > 0 ? '<div class="bpc-label bpc-warn">● ' + d.dsUniqAlert + ' DS ≤20% livres</div>'
      : '<div class="bpc-label bpc-ok">● todos os DS ok</div>')
    + (d.dsTopWorst || []).map(function (ds) {
      var dss = S.metric(100 - ds.freePct, { warn: 80, crit: 90 })
      var nm  = ds.name.length > 15 ? ds.name.slice(0, 14) + '…' : ds.name
      return '<div class="bpc-flex" style="justify-content:space-between;margin-top:2px">'
        + '<span class="bpc-label" title="' + kpiEsc(ds.name) + '">' + kpiEsc(nm) + '</span>'
        + '<span class="bpc-label bpc-' + dss + '" style="font-family:monospace">' + ds.freePct.toFixed(1) + '%</span>'
        + '</div>'
    }).join('')
    + '<div style="margin-top:auto;padding-top:6px">' + drillLink(CFG_KPI.grafanaDsUrl, 'Ver datastores') + '</div>'
    + '</div>'

  // ── Card 6 — Alertas ─────────────────────────────────────────────
  var tc = d.trigCounts || { crit: 0, warn: 0, info: 0 }
  var trgState = tc.crit > 0 ? 'crit' : tc.warn > 0 ? 'warn' : 'ok'

  function trgCount(sev, count, state) {
    var num = count
      ? '<a href="' + kpiEsc(kpiZbUrl(sev)) + '" target="_blank" class="bpc-value-md bpc-' + state + '" style="text-decoration:none">' + count + '</a>'
      : '<span class="bpc-value-md bpc-mute">0</span>'
    return '<div class="bpc-flex" style="justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<span class="bpc-label bpc-' + state + '" style="letter-spacing:.08em">' + state.toUpperCase() + '</span>'
      + num + '</div>'
  }

  var c6 = '<div class="bpc bpc-card state-' + trgState + '" style="--card-accent:' + S.color(trgState) + ';flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">'
    + cardHeader('Alertas · ' + d.trigTotal + ' triggers', trgState)
    + trgCount([4, 5], tc.crit, 'crit')
    + trgCount([2, 3], tc.warn, 'warn')
    + trgCount([0, 1], tc.info, 'info')
    + (d.hostsAlerta > 0 ? '<div class="bpc-label bpc-warn" style="margin-top:4px">● ' + d.hostsAlerta + ' hosts afectados</div>' : '')
    + '<div style="margin-top:auto;padding-top:6px">' + drillLink(CFG_KPI.grafanaProblemsUrl, 'Ver problemas') + '</div>'
    + '</div>'

  // ── Pill de estado global + grid de cards ────────────────────────
  var globalPillState = d.globalState
  el.innerHTML = '<div class="bpc" style="display:flex;flex-direction:column;height:100%;font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif">'
    + '<div style="display:flex;justify-content:flex-end;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.06)">'
    + pill(globalPillState)
    + '</div>'
    + '<div style="display:flex;flex:1;gap:8px;padding:8px;overflow:hidden">'
    + c1 + c2 + c3 + c4 + c5 + c6
    + '</div>'
    + '</div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
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
  if (attempt > 50) { console.error('[BPC] l2-kpi servidores-fisicos: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
