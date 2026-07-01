// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · BORDA DC — KPI STRIP  v1.0                       ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                            ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                 ║
// ║                                                                          ║
// ║  Resumo agregado dos 5 routers de Borda DC — números grandes para       ║
// ║  leitura a 3m (wallboard NOC). "Ligações" agrega circuitos + túneis     ║
// ║  DMVPN + troncos de voz (ver metodologia-auditoria-topologia.md sobre   ║
// ║  a distinção de termos).                                                ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] COMPUTE  [4] RENDER  [5] BOOT                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_RKPI = {
  elementId: 'bpc-n3bdc-kpi',
  refreshMs:  60000,
  hostIds:    ['10838', '10839', '10840', '10996', '11001'],

  // Mesma classificação de l3-bdc-routers-cards.js — só conta ligações de
  // negócio reais (circuitos/túneis/troncos), nunca interfaces genéricas de
  // gestão/uplink/infra. Manter em sync com CFG_RCARDS.hosts[].sections.
  ifRes: {
    '10838': [/^Po2\.(65|960|1576)$/i],
    '10839': [/^Po2\.(110|835|1158)$/i],
    '10996': [/^Tu10[1-7]$/i, /^Tu20[1-8]$/i, /^Po2\.293[12]$/i],
    '10840': [/^(Tu20|Tu30|Tu603)$/i, /^Gi0\/0\/1\.802$/i],
    '11001': [/^Po2\.\d+$/i, /^VoiceOverIpPeer/i],
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function rkParseIfname(name) {
  var m = /^Interface\s+([^(\s:]+)/.exec(name || '')
  return m ? m[1].trim() : null
}

function rkFetch(rpc) {
  var hids = CFG_RKPI.hostIds
  return Promise.all([
    rpc('item.get', {
      hostids: hids, search: { key_: 'icmpping' }, filter: { status: 0, key_: 'icmpping' },
      output: ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hids, search: { key_: 'net.if.status' }, filter: { status: 0 },
      output: ['hostid', 'name', 'lastvalue'],
    }),
    rpc('trigger.get', {
      hostids: hids, filter: { value: 1 }, output: ['triggerid'],
    }),
  ]).then(function(r) { return { icmp: r[0], ifaces: r[1], triggers: r[2] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function rkIsClassified(hostid, ifname) {
  var res = CFG_RKPI.ifRes[hostid] || []
  for (var i = 0; i < res.length; i++) { if (res[i].test(ifname)) return true }
  return false
}

function rkCompute(data) {
  var routersUp = data.icmp.filter(function(i) { return i.lastvalue === '1' }).length

  var classified = data.ifaces.filter(function(it) {
    var ifname = rkParseIfname(it.name)
    return ifname && rkIsClassified(it.hostid, ifname)
  })
  var total = classified.length
  var up    = classified.filter(function(i) { return i.lastvalue === '1' }).length
  var down  = total - up
  var alerts = data.triggers.length

  return {
    routersTotal: CFG_RKPI.hostIds.length,
    routersUp:    routersUp,
    linksTotal:   total,
    linksDown:    down,
    alerts:       alerts,
    ok:           routersUp === CFG_RKPI.hostIds.length && down === 0 && alerts === 0,
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function rkKpiBlock(value, label, color) {
  return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'padding:14px 28px;border-right:1px solid rgba(255,255,255,0.08)">'
    + '<span style="font-size:34px;font-weight:700;color:' + color + ';line-height:1">' + value + '</span>'
    + '<span style="font-size:13px;color:#8891A8;text-transform:uppercase;letter-spacing:.05em;margin-top:4px">' + label + '</span>'
    + '</div>'
}

function rkRender(el, model) {
  var okCol   = '#22C55E'
  var critCol = '#f85149'

  var stateColor = model.ok ? okCol : critCol
  var stateText  = model.ok ? 'Segmento operacional' : 'Atenção necessária'

  el.innerHTML = '<div style="display:flex;align-items:stretch;background:rgba(14,20,60,0.6);'
    + 'border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + rkKpiBlock(model.routersTotal, 'Routers', '#E6EDF3')
    + rkKpiBlock(model.routersUp + '/' + model.routersTotal, 'UP agora', model.routersUp === model.routersTotal ? okCol : critCol)
    + rkKpiBlock(model.linksTotal, 'Ligações monitorizadas', '#E6EDF3')
    + rkKpiBlock(model.linksDown, 'Ligações down', model.linksDown === 0 ? okCol : critCol)
    + rkKpiBlock(model.alerts, 'Alertas activos', model.alerts === 0 ? okCol : critCol)
    + '<div style="flex:1;display:flex;align-items:center;justify-content:flex-end;padding:0 28px">'
    +   '<span style="font-size:18px;font-weight:700;color:' + stateColor + '">' + stateText + '</span>'
    + '</div>'
    + '</div>'
}

function rkRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Borda DC — KPI: ' + msg + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOT
// ────────────────────────────────────────────────────────────────────────────

function rkLoad(rpc) {
  var el = document.getElementById(CFG_RKPI.elementId)
  if (!el) return
  rkFetch(rpc)
    .then(function(data) { rkRender(el, rkCompute(data)) })
    .catch(function(err)  { rkRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { rkLoad(rpc) }, CFG_RKPI.refreshMs)
}

function rkInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(rkLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-bdc-routers-kpi: waitForBPC nunca disponivel'); return }
  setTimeout(function() { rkInitWithRetry(attempt + 1) }, 100)
}

rkInitWithRetry()
