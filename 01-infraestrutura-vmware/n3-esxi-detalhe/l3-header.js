// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · SERVIDORES FÍSICOS (ESXi) · HEADER DO HOST             ║
// ║  v3.0 · Padrão: variável Grafana $hostid + âncora que a referencia     ║
// ║                                                                          ║
// ║  Reactivo: a âncora Zabbix filtra por $hostid. Quando o dropdown       ║
// ║  muda → Grafana re-executa a query → BT re-executa este afterRender    ║
// ║  → JS lê var-hostid do URL de fresco. Sem eventos, sem polling.        ║
// ║                                                                          ║
// ║  Estrutura: [1] CFG  [2] FETCH  [3] COMPUTE  [4] RENDER  [5] BOOTSTRAP ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ─────────────────────────────────────────────────────────────────────────────

var CFG_L3H = {
  elementId: 'bpc-sf-l3-header',
  n2Url:     'http://10.10.126.22:3000/d/8f6a94be-c96f-4177-987d-fd187a14e6b7/n2-servidores-fisicos-esxi',
  maxAgeSec: 600,
  thresholds: {
    cpu: { warn: 75, crit: 90 },
    ram: { warn: 70, crit: 85 },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ─────────────────────────────────────────────────────────────────────────────

function l3hFetch(rpc, hostid) {
  return Promise.all([
    rpc('item.get', {
      hostids: [hostid],
      search: { name: [
        'CPU usage in percent', 'Used memory', 'Total memory',
        'Number of guest VMs', 'Cluster name', 'Uptime',
        'Power usage', 'Connection state',
      ] },
      searchByAny: true,
      output: ['itemid', 'name', 'lastvalue', 'lastclock'],
      monitored: true, limit: 50,
    }),
    rpc('trigger.get', {
      hostids: [hostid],
      only_true: true, monitored: true, skipDependent: true,
      expandDescription: true,
      output: ['description', 'priority', 'lastchange'],
      sortfield: 'priority', sortorder: 'DESC', limit: 20,
    }),
  ]).then(function (res) {
    var items = res[0], triggers = res[1]
    var cpuItem = items.find(function (i) { return i.name === 'CPU usage in percent' })
    if (!cpuItem) return [items, triggers, []]
    return rpc('history.get', {
      itemids: [cpuItem.itemid],
      history: 0,
      time_from: Math.floor(Date.now() / 1000) - 3600,
      sortfield: 'clock', sortorder: 'ASC',
      limit: 60,
    }).then(function (hist) { return [items, triggers, hist || []] })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ─────────────────────────────────────────────────────────────────────────────

function l3hCompute(items, triggers, cpuHistory, hostObj) {
  var S = window.BPC.state
  var h = {}, now = Math.floor(Date.now() / 1000)

  ;(items || []).forEach(function (i) {
    var v = parseFloat(i.lastvalue)
    h[i.name] = isNaN(v) ? i.lastvalue : v
    h['_age_' + i.name] = now - (parseInt(i.lastclock) || 0)
  })

  var cpu    = h['CPU usage in percent'] != null ? +h['CPU usage in percent'] : null
  var ramU   = h['Used memory']  != null ? +h['Used memory']  : null
  var ramT   = h['Total memory'] != null ? +h['Total memory'] : null
  var ramPct = (ramU != null && ramT > 0) ? (ramU / ramT) * 100 : null
  var ramGb  = ramU != null ? +(ramU / 1073741824).toFixed(0) : null
  var ramTGb = ramT != null ? +(ramT / 1073741824).toFixed(0) : null
  var vms    = h['Number of guest VMs'] != null ? Math.round(h['Number of guest VMs']) : null
  var power  = h['Power usage']  != null ? Math.round(h['Power usage']) : null
  var uptime = h['Uptime']       != null ? +h['Uptime'] : null
  var conn   = h['Connection state']
  var connOk = conn == null || String(conn).toLowerCase().indexOf('connect') !== -1
  var stale  = (h['_age_CPU usage in percent'] || 0) > CFG_L3H.maxAgeSec

  var cpuState  = cpu != null ? S.metric(cpu, CFG_L3H.thresholds.cpu) : 'ok'
  var ramState  = ramPct != null ? S.metric(ramPct, CFG_L3H.thresholds.ram) : 'ok'
  var connState = connOk ? 'ok' : 'crit'
  var nCrit = (triggers || []).filter(function (t) { return parseInt(t.priority) >= 4 }).length
  var nWarn = (triggers || []).length - nCrit
  var trgState  = nCrit ? 'crit' : nWarn ? 'warn' : 'ok'
  var rowState  = S.worst([cpuState, ramState, connState, trgState])

  return {
    cpu: cpu, cpuState: cpuState, stale: stale,
    cpuAgeSec: h['_age_CPU usage in percent'] || 0,
    cpuHistory: cpuHistory || [],
    ramPct: ramPct, ramGb: ramGb, ramTGb: ramTGb, ramState: ramState,
    vms: vms, power: power, uptime: uptime,
    connOk: connOk, connState: connState,
    nCrit: nCrit, nWarn: nWarn, trigs: triggers || [],
    rowState: rowState,
    cluster: h['Cluster name'] || '—',
    hostName: (hostObj || {}).name || '',
    hostTech: (hostObj || {}).host || '',
    ip: (((hostObj || {}).interfaces || [])[0] || {}).ip || '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ─────────────────────────────────────────────────────────────────────────────

function l3hRender(el, d, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var u  = window.BPC.utils

  if (err) { el.innerHTML = u.buildError('Header N3 ESXi', err); return }

  function fmtUptime(sec) {
    if (sec == null || isNaN(sec)) return '—'
    var dy = Math.floor(sec / 86400), hr = Math.floor((sec % 86400) / 3600), mn = Math.floor((sec % 3600) / 60)
    return dy > 0 ? dy + 'd ' + hr + 'h' : hr + 'h ' + mn + 'm'
  }

  function bar(pct, wThr, cThr) {
    if (pct == null) return ''
    var color = pct >= cThr ? 'var(--bpc-crit)' : pct >= wThr ? 'var(--bpc-warn)' : 'var(--bpc-ok)'
    var w = Math.min(100, Math.max(0, pct)).toFixed(0)
    return '<div style="height:5px;background:rgba(255,255,255,0.08);border-radius:2px;margin:6px 0 4px">'
      + '<div style="height:100%;width:' + w + '%;background:' + color + ';border-radius:2px"></div>'
      + '</div>'
  }

  function sparkline(hist, wThr, cThr) {
    if (!hist || hist.length < 2) return ''
    var vals = hist.map(function (h) { return parseFloat(h.value) }).filter(function (v) { return !isNaN(v) })
    if (vals.length < 2) return ''
    var W = 130, H = 34
    var maxV = Math.max(100, Math.max.apply(null, vals))
    var pts = vals.map(function (v, i) {
      var x = (i / (vals.length - 1)) * W
      var y = H - (v / maxV) * H
      return x.toFixed(1) + ',' + y.toFixed(1)
    }).join(' ')
    var lastV = vals[vals.length - 1]
    var color = lastV >= cThr ? 'var(--bpc-crit)' : lastV >= wThr ? 'var(--bpc-warn)' : 'var(--bpc-ok)'
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="display:block;margin-top:6px;opacity:.9">'
      + '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
      + '</svg>'
  }

  var sc      = S.color(d.rowState)
  var stLabel = { ok: 'OPERACIONAL', warn: 'DEGRADADO', crit: 'CRÍTICO' }[d.rowState] || '—'
  var DIV     = 'border-right:1px solid rgba(255,255,255,0.06)'
  var LBL     = 'font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);margin-bottom:6px'
  var VAL     = 'font-size:26px;font-weight:800;font-family:monospace;line-height:1'
  var SUB     = 'font-size:13px;color:var(--bpc-mute);margin-top:3px'
  var COL     = 'flex:1;padding:12px 16px;min-width:0;' + DIV

  // ── HEADER ────────────────────────────────────────────────────────────────
  var header = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px 9px;border-bottom:1px solid rgba(255,255,255,0.07)">'
    + '<div style="display:flex;align-items:center;gap:12px;min-width:0;overflow:hidden">'
    +   '<a href="' + SH.esc(CFG_L3H.n2Url) + '" style="color:var(--bpc-mute);font-size:13px;text-decoration:none;letter-spacing:.06em;white-space:nowrap">← N2</a>'
    +   '<span style="color:rgba(255,255,255,0.12)">|</span>'
    +   '<span style="font-size:19px;font-weight:800;color:#E6EDF3;font-family:monospace;white-space:nowrap">' + SH.esc(d.hostTech || d.hostName) + '</span>'
    +   '<span style="color:rgba(255,255,255,0.15);font-size:15px">·</span>'
    +   '<span style="font-size:13px;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + SH.esc(d.hostName) + '</span>'
    +   '<span style="color:rgba(255,255,255,0.15);font-size:15px">·</span>'
    +   '<span style="font-size:13px;color:var(--bpc-mute);white-space:nowrap">' + SH.esc(d.cluster) + '</span>'
    + (d.ip ? '<span style="color:rgba(255,255,255,0.15);font-size:15px">·</span><span style="font-size:13px;color:var(--bpc-mute);font-family:monospace;white-space:nowrap">' + SH.esc(d.ip) + '</span>' : '')
    + '</div>'
    + '<div style="flex-shrink:0;display:flex;align-items:center;gap:7px;padding:5px 13px;border-radius:4px;background:' + sc + '22;border:1px solid ' + sc + '55;margin-left:12px">'
    +   '<span style="width:9px;height:9px;border-radius:50%;background:' + sc + ';box-shadow:0 0 7px ' + sc + ';display:inline-block"></span>'
    +   '<span style="font-size:13px;font-weight:700;color:' + sc + ';letter-spacing:.08em">' + stLabel + '</span>'
    + '</div>'
    + '</div>'

  // ── COL: VMs ──────────────────────────────────────────────────────────────
  var connHtml = d.connOk
    ? ''
    : '<div style="margin-top:6px;font-size:12px;font-weight:600;color:var(--bpc-crit)">⚠ VMware API offline — escalar L2</div>'
  var colVms = '<div style="' + COL + '">'
    + '<div style="' + LBL + '">VMs</div>'
    + '<div style="' + VAL + ';color:var(--bpc-cyan)">' + (d.vms != null ? d.vms : '—') + '</div>'
    + '<div style="' + SUB + '">' + (d.vms != null ? 'total no hypervisor' : '') + '</div>'
    + connHtml
    + '</div>'

  // ── COL: CPU ──────────────────────────────────────────────────────────────
  var cpuColor  = S.color(d.cpuState)
  var ageMin    = Math.round(d.cpuAgeSec / 60)
  var staleHtml = d.stale
    ? '<div style="font-size:12px;color:var(--bpc-warn);margin-top:3px">⚠ última leitura há ' + ageMin + 'm — poller lento</div>'
    : ''
  var colCpu = '<div style="' + COL + '">'
    + '<div style="' + LBL + '">CPU</div>'
    + '<div style="' + VAL + ';color:' + cpuColor + '">' + (d.cpu != null ? d.cpu.toFixed(1) + ' %' : '—') + '</div>'
    + (d.cpu != null ? bar(d.cpu, CFG_L3H.thresholds.cpu.warn, CFG_L3H.thresholds.cpu.crit) : '')
    + sparkline(d.cpuHistory, CFG_L3H.thresholds.cpu.warn, CFG_L3H.thresholds.cpu.crit)
    + staleHtml
    + '</div>'

  // ── COL: RAM ──────────────────────────────────────────────────────────────
  var ramColor = S.color(d.ramState)
  var colRam = '<div style="' + COL + '">'
    + '<div style="' + LBL + '">RAM</div>'
    + '<div style="' + VAL + ';color:' + ramColor + '">' + (d.ramPct != null ? d.ramPct.toFixed(1) + ' %' : '—') + '</div>'
    + (d.ramPct != null ? bar(d.ramPct, CFG_L3H.thresholds.ram.warn, CFG_L3H.thresholds.ram.crit) : '')
    + (d.ramGb != null ? '<div style="' + SUB + '">' + d.ramGb + ' / ' + (d.ramTGb || '?') + ' GB</div>' : '')
    + '</div>'

  // ── COL: POWER ────────────────────────────────────────────────────────────
  var colPwr = '<div style="' + COL + '">'
    + '<div style="' + LBL + '">POWER</div>'
    + '<div style="' + VAL + ';color:var(--bpc-mute)">' + (d.power != null ? d.power : '—') + '</div>'
    + (d.power != null ? '<div style="' + SUB + '">Watt</div>' : '')
    + '</div>'

  // ── COL: UPTIME ───────────────────────────────────────────────────────────
  var colUptime = '<div style="' + COL + '">'
    + '<div style="' + LBL + '">UPTIME</div>'
    + '<div style="font-size:22px;font-weight:800;font-family:monospace;line-height:1.1;color:var(--bpc-mute)">' + fmtUptime(d.uptime) + '</div>'
    + '</div>'

  // ── COL: TRIGGERS — só pills por severidade ────────────────────────────────
  function pill(color, bg, border, txt) {
    return '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:4px;'
      + 'background:' + bg + ';border:1px solid ' + border + ';font-size:14px;font-weight:700;color:' + color + ';margin-right:6px;margin-top:4px">'
      + txt + '</span>'
  }

  var pillsHtml = ''
  if (!d.nCrit && !d.nWarn) {
    pillsHtml = pill('var(--bpc-ok)', 'rgba(63,185,80,0.1)', 'rgba(63,185,80,0.3)', '● OK')
  } else {
    if (d.nCrit) pillsHtml += pill('var(--bpc-crit)', 'rgba(248,81,73,0.12)', 'rgba(248,81,73,0.35)', '✖ ' + d.nCrit + ' CRÍTICO')
    if (d.nWarn) pillsHtml += pill('var(--bpc-warn)', 'rgba(210,153,34,0.12)', 'rgba(210,153,34,0.35)', '▲ ' + d.nWarn + ' ALERTA')
  }

  var colTrg = '<div style="flex:1.3;padding:12px 16px;min-width:0">'
    + '<div style="' + LBL + '">ALERTAS ACTIVOS</div>'
    + '<div style="display:flex;flex-wrap:wrap;align-items:center">' + pillsHtml + '</div>'
    + '</div>'

  // ── MONTAGEM ──────────────────────────────────────────────────────────────
  var body = '<div style="display:flex;border-top:1px solid rgba(255,255,255,0.07)">'
    + colVms + colCpu + colRam + colPwr + colUptime + colTrg
    + '</div>'

  el.innerHTML = '<div class="bpc" style="font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif;'
    + 'border-radius:4px;overflow:hidden;border:1px solid ' + sc + '55;background:rgba(255,255,255,0.02)">'
    + header + body + '</div>'
}

// ─────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
// ─────────────────────────────────────────────────────────────────────────────

function startL3Header(rpc) {
  window.BPC.utils.waitForElement(CFG_L3H.elementId, function (el) {
    // Lê var-hostid do URL de fresco (afterRender re-executa quando a
    // âncora Zabbix muda — ver ANCHOR_TARGET no manifest e §N3-VARS no eng.)
    var hostRaw = ''
    try { hostRaw = new URLSearchParams(window.location.search).get('var-hostid') || '' } catch (e) {}

    if (!hostRaw) {
      el.innerHTML = window.BPC.utils.buildError('Header N3 ESXi', 'Selecciona um host ESXi no selector acima.')
      return
    }

    el.innerHTML = window.BPC.utils.buildSkeleton()

    // $hostid contém o nome do host Zabbix — resolvo o hostid numérico
    rpc('host.get', {
      search: { name: hostRaw },
      output: ['hostid', 'name', 'host'],
      selectInterfaces: ['ip'],
      limit: 5,
    }).then(function (hosts) {
      // Grafana pode passar o nome com wildcards/regex; tentar match exacto primeiro
      var hostObj = hosts.find(function (h) { return h.name === hostRaw }) || hosts[0]
      if (!hostObj) throw new Error('Host "' + hostRaw + '" não encontrado no Zabbix.')

      return l3hFetch(rpc, hostObj.hostid).then(function (res) {
        l3hRender(el, l3hCompute(res[0], res[1], res[2], hostObj), null)
      })
    }).catch(function (e) {
      l3hRender(el, null, e.message || String(e))
    })
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(startL3Header); return }
  if (attempt > 50) { console.error('[BPC] l3-header servidores-fisicos: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
