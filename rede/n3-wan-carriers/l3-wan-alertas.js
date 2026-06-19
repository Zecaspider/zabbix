// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN PROVEDORES · ALERTAS  v1.0                  ║
// ║  Alertas activos nos 5 routers WAN (grupo 27), ordenados por           ║
// ║  severidade descendente. Máximo 25 triggers exibidos.                  ║
// ║  [1] CFG  [2] FETCH  [3] RENDER  [4] BOOT                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_ALT = {
  elementId: 'bpc-wan-alertas',
  refreshMs:  60000,
  maxRows:    25,
  n4RouterUid: '8ddc4833-be01-47ea-8ada-a89531d4babb',

  wanHosts: [
    { hostid: '10838', name: 'WAN-INT'  },
    { hostid: '10839', name: 'WAN-EMIS' },
    { hostid: '10840', name: 'GTW01'    },
    { hostid: '10996', name: 'WAN-AG'   },
    { hostid: '11001', name: 'PARC'     },
  ],

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

function aFetch(rpc) {
  var hids = CFG_ALT.wanHosts.map(function(h) { return h.hostid })
  return rpc('trigger.get', {
    hostids: hids,
    filter: { value: 1 },
    output: ['triggerid', 'priority', 'description', 'lastchange'],
    selectHosts: ['hostid', 'host'],
    sortfield: ['priority', 'lastchange'],
    sortorder: 'DESC',
    limit: CFG_ALT.maxRows,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] RENDER
// ────────────────────────────────────────────────────────────────────────────

function aEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  })
}

function aFmtAge(lc) {
  if (!lc) return '—'
  var sec = Math.floor(Date.now() / 1000) - parseInt(lc, 10)
  if (sec < 60)    return sec + 's'
  if (sec < 3600)  return Math.floor(sec / 60) + 'm'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h'
  return Math.floor(sec / 86400) + 'd'
}

function aRenderRow(t, hostMap) {
  var sev  = parseInt(t.priority, 10) || 0
  var info = CFG_ALT.sevMap[sev] || CFG_ALT.sevMap[0]
  var host = (t.hosts && t.hosts[0]) || {}
  var hname = hostMap[host.hostid] || aEsc(host.host || '—')
  var link = CFG_ALT.n4RouterUid
    ? '/d/' + CFG_ALT.n4RouterUid + '?var-routerName=' + encodeURIComponent(host.host || hname)
    : null
  var hostCell = link
    ? '<a href="' + link + '" style="color:var(--bpc-cyan);text-decoration:none">' + aEsc(hname) + ' →</a>'
    : '<span style="color:#CDD9E5">' + aEsc(hname) + '</span>'
  return '<tr style="border-top:1px solid rgba(255,255,255,0.04)">'
    + '<td style="padding:5px 8px;white-space:nowrap">'
    + '<span style="display:inline-block;padding:2px 7px;border-radius:6px;font-size:.72rem;font-weight:700;'
    + 'background:' + info.color + '22;color:' + info.color + ';border:1px solid ' + info.color + '44">'
    + aEsc(info.label) + '</span></td>'
    + '<td style="padding:5px 8px;font-size:.83rem">' + hostCell + '</td>'
    + '<td style="padding:5px 10px;font-size:.83rem;color:rgba(255,255,255,0.70);max-width:420px">' + aEsc(t.description) + '</td>'
    + '<td style="padding:5px 8px;font-size:.78rem;color:var(--bpc-mute);white-space:nowrap;text-align:right">' + aFmtAge(t.lastchange) + '</td>'
    + '</tr>'
}

function aRender(el, triggers) {
  if (!triggers.length) {
    el.innerHTML = '<div class="bpc" style="padding:14px;text-align:center;color:var(--bpc-ok);font-size:.90rem">'
      + '✓ Sem alertas activos nos routers WAN</div>'
    return
  }
  var hostMap = {}
  CFG_ALT.wanHosts.forEach(function(h) { hostMap[h.hostid] = h.name })
  el.innerHTML = '<div class="bpc">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
    + '<span style="font-size:.90rem;font-weight:700;color:#CDD9E5;letter-spacing:.05em;text-transform:uppercase">Alertas activos</span>'
    + '<span style="font-size:.82rem;color:var(--bpc-mute)">routers WAN · grupo 27</span>'
    + '<span style="margin-left:auto;font-size:.75rem;color:var(--bpc-mute)">' + triggers.length + ' alerta(s)</span>'
    + '</div>'
    + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
    + '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.10)">'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Sev</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Router</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:left">Descrição</th>'
    + '<th style="padding:4px 8px;font-size:.70rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--bpc-mute);text-align:right">Duração</th>'
    + '</tr></thead>'
    + '<tbody>' + triggers.map(function(t) { return aRenderRow(t, hostMap) }).join('') + '</tbody>'
    + '</table></div>'
    + '</div>'
}

function aRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Alertas WAN: ' + aEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [4] BOOT
// ────────────────────────────────────────────────────────────────────────────

function aLoad(rpc) {
  var el = document.getElementById(CFG_ALT.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:10px;color:var(--bpc-mute);font-size:.85rem">A carregar alertas WAN…</div>'
  aFetch(rpc)
    .then(function(t) { aRender(el, t) })
    .catch(function(err) { aRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { aLoad(rpc) }, CFG_ALT.refreshMs)
}

function aInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(aLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-alertas: waitForBPC nunca disponivel'); return }
  setTimeout(function() { aInitWithRetry(attempt + 1) }, 100)
}

aInitWithRetry()
