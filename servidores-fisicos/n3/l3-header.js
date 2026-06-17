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
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ─────────────────────────────────────────────────────────────────────────────

function l3hCompute(items, triggers, hostObj) {
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

  var sc = S.color(d.rowState)
  var stLabel = { ok: 'OPERACIONAL', warn: 'DEGRADADO', crit: 'CRÍTICO' }[d.rowState] || '—'

  var topBar = '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px 8px">'
    + '<div style="display:flex;align-items:center;gap:12px">'
    + '<a href="' + SH.esc(CFG_L3H.n2Url) + '" style="color:var(--bpc-mute);font-size:11px;text-decoration:none;letter-spacing:.06em">← N2</a>'
    + '<span style="color:rgba(255,255,255,0.12)">|</span>'
    + '<div>'
    +   '<div style="font-size:20px;font-weight:800;color:#E6EDF3;font-family:monospace">' + SH.esc(d.hostTech || d.hostName) + '</div>'
    +   '<div style="font-size:11px;color:var(--bpc-mute);margin-top:1px">' + SH.esc(d.hostName) + ' · ' + SH.esc(d.cluster) + (d.ip ? ' · ' + SH.esc(d.ip) : '') + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:7px;padding:5px 12px;border-radius:4px;background:' + sc + '22;border:1px solid ' + sc + '55">'
    +   '<span style="width:9px;height:9px;border-radius:50%;background:' + sc + ';box-shadow:0 0 7px ' + sc + ';display:inline-block"></span>'
    +   '<span style="font-size:12px;font-weight:700;color:' + sc + ';letter-spacing:.08em">' + stLabel + '</span>'
    + '</div>'
    + '</div>'

  function kpi(lbl, val, sub, color) {
    return '<div style="padding:10px 18px;border-right:1px solid rgba(255,255,255,0.07)">'
      + '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);margin-bottom:3px">' + lbl + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + (color || '#E6EDF3') + ';font-family:monospace;line-height:1">' + val + '</div>'
      + (sub ? '<div style="font-size:11px;color:var(--bpc-mute);margin-top:2px">' + sub + '</div>' : '')
      + '</div>'
  }

  var kpiRow = '<div style="display:flex;border-top:1px solid rgba(255,255,255,0.07)">'
    + kpi('CPU', d.cpu != null ? d.cpu.toFixed(1) + '%' : '—', d.stale ? 'dados antigos' : null, S.color(d.cpuState))
    + kpi('RAM', d.ramPct != null ? d.ramPct.toFixed(1) + '%' : '—', d.ramGb != null ? d.ramGb + '/' + (d.ramTGb || '?') + ' GB' : null, S.color(d.ramState))
    + kpi('VMs', d.vms != null ? String(d.vms) : '—', null, 'var(--bpc-cyan)')
    + kpi('Power', d.power != null ? d.power + ' W' : '—', null, 'var(--bpc-mute)')
    + kpi('Uptime', fmtUptime(d.uptime), null, 'var(--bpc-mute)')
    + kpi('Conn', d.connOk ? 'OK' : 'FALHA', null, S.color(d.connState))
    + '</div>'

  var trgBar = ''
  if (d.trigs.length) {
    var first = d.trigs[0]
    var desc = first.description.length > 72 ? first.description.slice(0, 71) + '…' : first.description
    trgBar = '<div style="padding:6px 16px;background:rgba(248,81,73,0.07);border-top:1px solid rgba(248,81,73,0.15);display:flex;align-items:center;gap:14px">'
      + '<span style="font-size:10px;font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);text-transform:uppercase">Triggers</span>'
      + (d.nCrit ? '<span style="font-size:13px;font-weight:700;color:var(--bpc-crit)">▲ ' + d.nCrit + ' crit</span>' : '')
      + (d.nWarn ? '<span style="font-size:13px;font-weight:700;color:var(--bpc-warn)">● ' + d.nWarn + ' warn</span>' : '')
      + '<span style="font-size:11px;color:var(--bpc-mute)">' + SH.esc(desc) + '</span>'
      + '</div>'
  }

  el.innerHTML = '<div class="bpc" style="font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif;border-radius:4px;overflow:hidden;border:1px solid ' + sc + '44">'
    + topBar + kpiRow + trgBar + '</div>'
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
        l3hRender(el, l3hCompute(res[0], res[1], hostObj), null)
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
