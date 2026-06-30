// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN · TRIGGERS  v1.0                            ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Alertas activos nos 5 routers WAN (grupo 27), ordenados por           ║
// ║  severidade descendente. Cada linha tem link drill → N4 device.        ║
// ║  Máximo 20 triggers exibidos.                                           ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] RENDER  [4] BOOT                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_TRG = {
  elementId: 'bpc-wan-triggers',
  refreshMs:  60000,
  maxRows:    20,
  n4DashUid:  'rede.n4.wan-router',

  // 5 routers WAN (grupo 27) + hostids para link drill N4
  wanHosts: [
    { hostid: '10838', name: 'WAN-INT'  },
    { hostid: '10839', name: 'WAN-EMIS' },
    { hostid: '10840', name: 'GTW01'    },
    { hostid: '10996', name: 'WAN-AG'   },
    { hostid: '11001', name: 'PARC'     },
  ],

  // Severidade Zabbix → label + cor
  sevMap: {
    5: { label: 'Desastre',  color: '#ff0000' },
    4: { label: 'Alto',      color: '#f85149' },
    3: { label: 'Médio',     color: '#d29922' },
    2: { label: 'Aviso',     color: '#a37e00' },
    1: { label: 'Info',      color: '#00B4D8' },
    0: { label: 'N/D',       color: '#64748B' },
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function tFetch(rpc) {
  var hids = CFG_TRG.wanHosts.map(function(h) { return h.hostid })
  return rpc('trigger.get', {
    hostids: hids,
    filter: { value: 1 },
    output: ['triggerid', 'priority', 'description', 'lastchange'],
    selectHosts: ['hostid', 'host'],
    sortfield: ['priority', 'lastchange'],
    sortorder: 'DESC',
    limit: CFG_TRG.maxRows,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] RENDER
// ────────────────────────────────────────────────────────────────────────────

function tEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function tFmtAge(lastchange) {
  if (!lastchange) return '—'
  var sec = Math.floor(Date.now() / 1000) - parseInt(lastchange, 10)
  if (sec < 60)   return sec + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'm'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h'
  return Math.floor(sec / 86400) + 'd'
}

function tRender(el, triggers) {
  if (!triggers.length) {
    el.innerHTML = '<div class="bpc" style="padding:14px;text-align:center;color:var(--bpc-ok);font-size:.90rem">'
      + '✓ Sem alertas activos nos routers WAN</div>'
    return
  }

  // Mapa hostid→nome (para lookup rápido)
  var hostMap = {}
  CFG_TRG.wanHosts.forEach(function(h) { hostMap[h.hostid] = h.name })

  var rows = triggers.map(function(t) {
    var sev     = parseInt(t.priority, 10) || 0
    var sevInfo = CFG_TRG.sevMap[sev] || CFG_TRG.sevMap[0]
    var host    = (t.hosts && t.hosts[0]) || {}
    var hostId  = host.hostid || ''
    var hostName = hostMap[hostId] || tEsc(host.host || '—')
    var age     = tFmtAge(t.lastchange)

    var routerHostName = tEsc(host.host || hostName)
    var drillHref = CFG_TRG.n4DashUid
      ? '/d/' + CFG_TRG.n4DashUid + '/n4-rede-wan-router?var-routerName=' + encodeURIComponent(host.host || hostName)
      : null

    var hostCell = drillHref
      ? '<a href="' + drillHref + '" style="color:var(--bpc-cyan);text-decoration:none">' + tEsc(hostName) + ' →</a>'
      : '<span style="color:#CDD9E5">' + tEsc(hostName) + '</span>'

    return '<tr style="border-top:1px solid rgba(255,255,255,0.04)">'
      + '<td style="padding:5px 8px;white-space:nowrap">'
      + '<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:.72rem;font-weight:700;'
      + 'letter-spacing:.04em;background:' + sevInfo.color + '22;color:' + sevInfo.color + ';border:1px solid ' + sevInfo.color + '44">'
      + tEsc(sevInfo.label) + '</span></td>'
      + '<td style="padding:5px 8px;font-size:.83rem">' + hostCell + '</td>'
      + '<td style="padding:5px 10px;font-size:.83rem;color:rgba(255,255,255,0.70);max-width:420px">'
      + tEsc(t.description) + '</td>'
      + '<td style="padding:5px 8px;font-size:.78rem;color:var(--bpc-mute);white-space:nowrap;text-align:right">'
      + tEsc(age) + '</td>'
      + '</tr>'
  }).join('')

  el.innerHTML = '<div class="bpc">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + '<span style="font-size:.90rem;font-weight:700;color:#CDD9E5;letter-spacing:.05em;text-transform:uppercase">Alertas activos</span>'
    + '<span style="font-size:.82rem;color:var(--bpc-mute)">routers WAN · grupo 27</span>'
    + '<span style="margin-left:auto;font-size:.75rem;color:var(--bpc-mute)">' + triggers.length + ' alerta(s)</span>'
    + '</div>'
    + '<div style="overflow-x:auto">'
    + '<table style="border-collapse:collapse;width:100%">'
    + '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.10)">'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Sev</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Router</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Descrição</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:right">Duração</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>'
}

function tRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Triggers WAN: ' + tEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [4] BOOT
// ────────────────────────────────────────────────────────────────────────────

function tLoad(rpc) {
  var el = document.getElementById(CFG_TRG.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:10px;color:var(--bpc-mute);font-size:.85rem">A carregar alertas WAN…</div>'
  tFetch(rpc)
    .then(function(triggers) { tRender(el, triggers) })
    .catch(function(err) { tRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { tLoad(rpc) }, CFG_TRG.refreshMs)
}

function tInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(tLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-triggers: waitForBPC nunca disponivel'); return }
  setTimeout(function() { tInitWithRetry(attempt + 1) }, 100)
}

tInitWithRetry()
