// N4 · Edifício — Ficha + Estado ICMP
// l4-ed-ficha.js
// Lê tags do host (unidade_negocio, edificio, modelo, os_version, funcao)
// + itens ICMP e renderiza a ficha de diagnóstico do edifício para o NOC.

var CFG_ED_FICHA = {
  elementId: 'bpc-n4-ed-ficha',
  refreshMs: 60000,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function edFichaVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}

function edFichaFmtMs(v) {
  var n = parseFloat(v)
  if (isNaN(n) || n === 0) return '<span style="color:#64748B">—</span>'
  if (n >= 1000) return (n / 1000).toFixed(2) + ' s'
  return n.toFixed(1) + ' ms'
}

function edFichaFmtPct(v) {
  var n = parseFloat(v)
  if (isNaN(n)) return '<span style="color:#64748B">—</span>'
  var color = n >= 20 ? '#F85149' : n > 5 ? '#D29922' : '#3FB950'
  return '<span style="color:' + color + '">' + n.toFixed(1) + '%</span>'
}

function edFichaIcmpBadge(pingVal) {
  var n = parseFloat(pingVal)
  if (isNaN(n)) return '<span style="color:#64748B;font-size:13px">● DESCONHECIDO</span>'
  if (n >= 1)   return '<span style="color:#3FB950;font-size:13px;font-weight:bold">● UP</span>'
  return '<span style="color:#F85149;font-size:13px;font-weight:bold">● DOWN</span>'
}

function edFichaTagVal(tags, key) {
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].tag === key) return tags[i].value || ''
  }
  return ''
}

// ── render ────────────────────────────────────────────────────────────────────

var ED_FICHA_CSS = '<style>' +
  '.ed-ficha { font-family:"JetBrains Mono",monospace; color:#CDD9E5; font-size:12px; padding:4px 0; }' +
  '.ed-row { display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start; margin-bottom:12px; }' +
  '.ed-block { min-width:160px; }' +
  '.ed-label { font-size:10px; color:#64748B; text-transform:uppercase; letter-spacing:.08em; margin-bottom:3px; }' +
  '.ed-val { color:#CDD9E5; }' +
  '.ed-name { font-size:16px; font-weight:bold; color:#58A6FF; margin-bottom:4px; }' +
  '.ed-host { font-size:10px; color:#64748B; margin-bottom:12px; }' +
  '.ed-sep { border:none; border-top:1px solid #2D333B; margin:10px 0; }' +
  '.ed-icmp { display:flex; gap:32px; align-items:center; flex-wrap:wrap; }' +
  '.ed-kpi { text-align:center; }' +
  '.ed-kpi-val { font-size:14px; font-weight:bold; }' +
  '.ed-kpi-label { font-size:10px; color:#64748B; }' +
  '.ed-badge { display:inline-block; background:#1C2128; border:1px solid #30363D; border-radius:4px; padding:2px 7px; margin:2px; font-size:10px; color:#8B949E; }' +
  '</style>'

function edFichaRender(host, tags, icmpItems) {
  var el = document.getElementById(CFG_ED_FICHA.elementId)
  if (!el) return

  var name    = edFichaTagVal(tags, 'unidade_negocio') || edFichaTagVal(tags, 'edificio') || host
  var edificio = edFichaTagVal(tags, 'edificio') || '—'
  var modelo  = edFichaTagVal(tags, 'modelo') || '—'
  var osVer   = edFichaTagVal(tags, 'os_version') || '—'
  var funcao  = edFichaTagVal(tags, 'funcao') || '—'
  var tipo    = edFichaTagVal(tags, 'tipo') || '—'
  var fabric  = edFichaTagVal(tags, 'fabricante') || '—'

  var pingVal = '', rttVal = '', lossVal = ''
  for (var i = 0; i < icmpItems.length; i++) {
    var nm = icmpItems[i].name, val = icmpItems[i].lastvalue
    if (nm === 'ICMP ping')          pingVal = val
    else if (nm === 'ICMP response time') rttVal  = val
    else if (nm === 'ICMP loss')          lossVal = val
  }

  var html = ED_FICHA_CSS + '<div class="ed-ficha">'

  html += '<div class="ed-name">' + name + '</div>'
  html += '<div class="ed-host">' + host + ' &nbsp;·&nbsp; ' + edificio + '</div>'

  html += '<div class="ed-row">'
  html += '<div class="ed-block"><div class="ed-label">Tipo / Função</div><div class="ed-val">' + tipo + ' / ' + funcao + '</div></div>'
  html += '<div class="ed-block"><div class="ed-label">Fabricante</div><div class="ed-val">' + fabric + '</div></div>'
  html += '<div class="ed-block"><div class="ed-label">Modelo</div><div class="ed-val">' + modelo + '</div></div>'
  html += '<div class="ed-block"><div class="ed-label">IOS / OS</div><div class="ed-val">' + osVer + '</div></div>'
  html += '</div>'

  html += '<hr class="ed-sep">'
  html += '<div class="ed-label" style="margin-bottom:8px">Estado ICMP Actual</div>'
  html += '<div class="ed-icmp">'
  html += '<div class="ed-kpi"><div class="ed-kpi-val">' + edFichaIcmpBadge(pingVal) + '</div><div class="ed-kpi-label">Disponibilidade</div></div>'
  html += '<div class="ed-kpi"><div class="ed-kpi-val">' + edFichaFmtMs(rttVal) + '</div><div class="ed-kpi-label">RTT</div></div>'
  html += '<div class="ed-kpi"><div class="ed-kpi-val">' + edFichaFmtPct(lossVal) + '</div><div class="ed-kpi-label">Packet Loss</div></div>'
  html += '</div>'

  html += '</div>'
  el.innerHTML = html
}

// ── bootstrap ─────────────────────────────────────────────────────────────────

function edFichaLoad() {
  var el = document.getElementById(CFG_ED_FICHA.elementId)
  if (!el) return
  var host = edFichaVar('host')
  if (!host) {
    el.innerHTML = '<span style="color:#64748B;font-size:12px">Sem edifício seleccionado.</span>'
    return
  }
  el.textContent = 'A carregar ficha…'

  var proxy = 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api'

  function zPost(method, params) {
    return fetch(proxy, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: 1 })
    })
    .then(function (r) { return r.json() })
    .then(function (d) {
      if (d.error) throw new Error(d.error.data || d.error.message)
      return d.result || []
    })
  }

  Promise.all([
    zPost('host.get', { output: ['host', 'hostid'], filter: { host: [host] }, selectTags: 'extend', limit: 1 }),
    zPost('item.get', { output: ['name', 'lastvalue'], filter: { host: [host] }, search: { name: 'ICMP' } }),
  ])
  .then(function (results) {
    var hosts = results[0], items = results[1]
    var tags = hosts.length ? hosts[0].tags : []
    edFichaRender(host, tags, items)
    setTimeout(function () { edFichaLoad() }, CFG_ED_FICHA.refreshMs)
  })
  .catch(function (err) {
    var el2 = document.getElementById(CFG_ED_FICHA.elementId)
    if (el2) el2.innerHTML = '<span style="color:#F85149;font-size:12px">Erro: ' + err.message + '</span>'
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(function () { edFichaLoad() })
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-ed-ficha: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
