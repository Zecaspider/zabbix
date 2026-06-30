// BPC-Observe · N4 · Agência — Ficha + Estado ICMP
// l4-ag-ficha.js  v1.0
// Lê tags do host (unidade_negocio, provincia, municipio, zona_comercial,
// direccao_comercial, wan_fornecedor, wan_tipo, wan_links) + itens ICMP
// e renderiza uma ficha compacta de diagnóstico para o NOC.

var CFG = {
  elementId: 'bpc-n4-ag-ficha',
  proxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',
  group: 'HG_AGENCIAS_ROUTERS',
  refreshMs: 60000
}

// ─── UTILS ────────────────────────────────────────────────────────────────────

function getVarHost() {
  return new URLSearchParams(window.location.search).get('var-host') || ''
}

function fmtMs(v) {
  var n = parseFloat(v)
  if (isNaN(n) || n === 0) return '<span style="color:#6E7681">—</span>'
  if (n >= 1000) return (n / 1000).toFixed(2) + ' s'
  return n.toFixed(1) + ' ms'
}

function fmtPct(v) {
  var n = parseFloat(v)
  if (isNaN(n)) return '<span style="color:#6E7681">—</span>'
  var color = n >= 20 ? '#F85149' : n > 5 ? '#D29922' : '#3FB950'
  return '<span style="color:' + color + '">' + n.toFixed(1) + '%</span>'
}

function icmpBadge(pingVal) {
  var n = parseFloat(pingVal)
  if (isNaN(n)) return '<span style="color:#6E7681;font-size:13px">● DESCONHECIDO</span>'
  if (n >= 1) return '<span style="color:#3FB950;font-size:13px;font-weight:bold">● UP</span>'
  return '<span style="color:#F85149;font-size:13px;font-weight:bold">● DOWN</span>'
}

function tagVal(tags, key) {
  for (var i = 0; i < tags.length; i++) {
    if (tags[i].tag === key) return tags[i].value || ''
  }
  return ''
}

// ─── FETCH ────────────────────────────────────────────────────────────────────

function zabbixPost(method, params) {
  return fetch(CFG.proxy, {
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

// ─── RENDER ───────────────────────────────────────────────────────────────────

var CSS = '<style>' +
  '.ag-ficha { font-family:"JetBrains Mono",monospace; color:#CDD9E5; font-size:12px; padding:4px 0; }' +
  '.ag-row { display:flex; gap:24px; flex-wrap:wrap; align-items:flex-start; margin-bottom:12px; }' +
  '.ag-block { min-width:180px; }' +
  '.ag-label { font-size:10px; color:#6E7681; text-transform:uppercase; letter-spacing:.08em; margin-bottom:3px; }' +
  '.ag-val { color:#CDD9E5; }' +
  '.ag-name { font-size:16px; font-weight:bold; color:#58A6FF; margin-bottom:4px; }' +
  '.ag-host { font-size:10px; color:#6E7681; margin-bottom:12px; }' +
  '.ag-isp-pill { display:inline-block; background:#1C2128; border:1px solid #30363D;' +
    ' border-radius:4px; padding:2px 7px; margin:2px; font-size:10px; color:#8B949E; }' +
  '.ag-sep { border:none; border-top:1px solid #2D333B; margin:10px 0; }' +
  '.ag-icmp { display:flex; gap:32px; align-items:center; flex-wrap:wrap; }' +
  '.ag-kpi { text-align:center; }' +
  '.ag-kpi-val { font-size:14px; font-weight:bold; }' +
  '.ag-kpi-label { font-size:10px; color:#6E7681; }' +
  '.ag-link { margin-top:12px; }' +
  '.ag-link a { color:#58A6FF; font-size:11px; text-decoration:none; }' +
  '.ag-link a:hover { text-decoration:underline; }' +
  '.ag-btn { display:inline-flex; align-items:center; gap:6px; background:#1C2128; border:1px solid #388BFD;' +
    ' border-radius:4px; padding:5px 12px; color:#58A6FF; font-size:12px; text-decoration:none; cursor:pointer; }' +
  '.ag-btn:hover { background:#2D333B; }' +
  '</style>'

function buildUrl(host, group) {
  var base = '/d/rede.n4.wan-dispositivo'
  return base + '?var-group=' + encodeURIComponent(group) +
    '&var-host=' + encodeURIComponent(host) +
    '&var-iface=Gi0%2F1&from=now-3h&to=now'
}

function render(host, group, tags, icmpItems) {
  var el = document.getElementById(CFG.elementId)
  if (!el) return

  var name = tagVal(tags, 'unidade_negocio') || host
  var tipoUN = tagVal(tags, 'tipo_un') || 'Agência'
  var provincia = tagVal(tags, 'provincia') || '—'
  var municipio = tagVal(tags, 'municipio') || '—'
  var zona = tagVal(tags, 'zona_comercial') || '—'
  var dir = tagVal(tags, 'direccao_comercial') || '—'
  var fornecedores = tagVal(tags, 'wan_fornecedor') || '—'
  var tipos = tagVal(tags, 'wan_tipo') || '—'
  var nLinks = tagVal(tags, 'wan_links') || '—'

  var pingVal = '', rttVal = '', lossVal = ''
  for (var i = 0; i < icmpItems.length; i++) {
    var name_item = icmpItems[i].name
    var val = icmpItems[i].lastvalue
    if (name_item === 'ICMP ping') pingVal = val
    else if (name_item === 'ICMP response time') rttVal = val
    else if (name_item === 'ICMP loss') lossVal = val
  }

  var isps = fornecedores.split(',')
  var ispHtml = isps.map(function (s) {
    return '<span class="ag-isp-pill">' + s.trim() + '</span>'
  }).join('')

  var wanUrl = buildUrl(host, group)
  var html = CSS + '<div class="ag-ficha">'
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">'
  html += '<div><div class="ag-name">' + name + '</div>'
  html += '<div class="ag-host">' + host + ' &nbsp;·&nbsp; ' + tipoUN + '</div></div>'
  html += '<a class="ag-btn" href="' + wanUrl + '" target="_blank">&#x2197; Interfaces WAN · N4</a>'
  html += '</div>'

  html += '<div class="ag-row">'
  html += '<div class="ag-block"><div class="ag-label">Província</div><div class="ag-val">' + provincia + '</div></div>'
  html += '<div class="ag-block"><div class="ag-label">Município</div><div class="ag-val">' + municipio + '</div></div>'
  html += '<div class="ag-block"><div class="ag-label">Zona Comercial</div><div class="ag-val">' + zona + '</div></div>'
  html += '<div class="ag-block"><div class="ag-label">Direcção</div><div class="ag-val">' + dir + '</div></div>'
  html += '<div class="ag-block"><div class="ag-label">Links WAN</div><div class="ag-val">' + nLinks + '</div></div>'
  html += '</div>'

  html += '<div class="ag-label">Fornecedores / Tipos de Link</div>'
  html += '<div style="margin-bottom:12px">' + ispHtml + '</div>'

  html += '<hr class="ag-sep">'
  html += '<div class="ag-label" style="margin-bottom:8px">Estado ICMP Actual</div>'
  html += '<div class="ag-icmp">'
  html += '<div class="ag-kpi"><div class="ag-kpi-val">' + icmpBadge(pingVal) + '</div><div class="ag-kpi-label">Disponibilidade</div></div>'
  html += '<div class="ag-kpi"><div class="ag-kpi-val">' + fmtMs(rttVal) + '</div><div class="ag-kpi-label">RTT</div></div>'
  html += '<div class="ag-kpi"><div class="ag-kpi-val">' + fmtPct(lossVal) + '</div><div class="ag-kpi-label">Packet Loss</div></div>'
  html += '</div>'

  html += '<div class="ag-link"><a href="' + wanUrl + '" target="_blank">→ Ver todas as interfaces · N4 WAN Device</a></div>'
  html += '</div>'

  el.innerHTML = html
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

function boot() {
  var el = document.getElementById(CFG.elementId)
  if (!el) return
  var host = getVarHost()
  if (!host) {
    el.innerHTML = '<span style="color:#6E7681;font-size:12px">Sem host seleccionado. Navegar a partir do geomap ou N2 · Rede.</span>'
    return
  }
  el.textContent = 'A carregar ficha da agência...'
  var group = new URLSearchParams(window.location.search).get('var-group') || CFG.group

  Promise.all([
    zabbixPost('host.get', {
      output: ['host', 'hostid'],
      filter: { host: [host] },
      selectTags: 'extend'
    }),
    zabbixPost('item.get', {
      output: ['name', 'lastvalue'],
      filter: { host: [host] },
      search: { name: 'ICMP' },
      searchWildcardsEnabled: false
    })
  ])
  .then(function (results) {
    var hosts = results[0]
    var items = results[1]
    var tags = hosts.length ? hosts[0].tags : []
    render(host, group, tags, items)
    setTimeout(function () { boot() }, CFG.refreshMs)
  })
  .catch(function (err) {
    var el2 = document.getElementById(CFG.elementId)
    if (el2) el2.innerHTML = '<span style="color:#F85149">Erro: ' + err.message + '</span>'
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(function () { boot() })
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-ag-ficha: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
