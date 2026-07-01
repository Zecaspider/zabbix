// BPC-Observe · N4 · WAN-AG — Painel de Interfaces
// l4-wan-ag-interfaces.js  v1.1  (standalone — fetch directo ao proxy Network)
// Status, tráfego e discards de todas as interfaces do DC1-RTE-WAN-AG
// Secções: Uplinks físicos | Circuitos WAN | DMVPN DC | DMVPN Edifícios

// ─── CFG ──────────────────────────────────────────────────────────────────────

var CFG = {
  elementId: 'bpc-n4-wan-ag-ifaces',
  hostId:    '10996',   // DC1-RTE-WAN-AG — fixo, este painel é dedicado a este host
  proxy:     'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',
  refreshMs: 60000,
  debug:     false,

  UPLINKS: [
    { ref: 'Te0/1/2', label: 'Te0/1/2', desc: 'To LEAF-2' },
    { ref: 'Te0/1/3', label: 'Te0/1/3', desc: 'To LEAF-1' }
  ],

  WAN_CIRCUITS: [
    { ref: 'Po2.914',  isp: 'UNITEL',    tipo: 'P2P'              },
    { ref: 'Po2.51',   isp: 'ITA',       tipo: 'P2P'              },
    { ref: 'Po2.413',  isp: 'IPWORLD',   tipo: 'P2P'              },
    { ref: 'Po2.930',  isp: 'MULTITEL',  tipo: 'WAN L2'           },
    { ref: 'Po2.173',  isp: 'MULTITEL',  tipo: 'VSAT'             },
    { ref: 'Po2.341',  isp: 'MST',       tipo: 'Microondas'       },
    { ref: 'Po2.905',  isp: 'MST',       tipo: 'VSAT'             },
    { ref: 'Po2.904',  isp: 'MST',       tipo: 'VSAT Backup'      },
    { ref: 'Po2.1506', isp: 'MST',       tipo: 'MPLS Colectora'   },
    { ref: 'Po2.2931', isp: 'Azure',     tipo: 'ExpressRoute L1'  },
    { ref: 'Po2.2932', isp: 'Azure',     tipo: 'ExpressRoute L2'  }
  ],

  DMVPN_DC: [
    { ref: 'Tu101', isp: 'UNITEL'    },
    { ref: 'Tu102', isp: 'ITA'       },
    { ref: 'Tu103', isp: 'IPWORLD'   },
    { ref: 'Tu104', isp: 'MULTITEL'  },
    { ref: 'Tu105', isp: 'MST Fibra' },
    { ref: 'Tu106', isp: 'MST VSAT'  },
    { ref: 'Tu107', isp: 'MST MW'    }
  ],

  DMVPN_EDIF: [
    { ref: 'Tu201', isp: 'UNITEL'    },
    { ref: 'Tu202', isp: 'ITA'       },
    { ref: 'Tu203', isp: 'IPWORLD'   },
    { ref: 'Tu204', isp: 'MULTITEL'  },
    { ref: 'Tu205', isp: 'MST Fibra' },
    { ref: 'Tu206', isp: 'MST VSAT'  },
    { ref: 'Tu207', isp: 'MST MW'    },
    { ref: 'Tu208', isp: 'MULTITEL 2'}
  ]
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

// ─── UTILS ────────────────────────────────────────────────────────────────────

function fmtBps(v) {
  v = parseFloat(v) || 0
  if (v === 0) return '<span style="color:#6E7681">—</span>'
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Gbps'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Mbps'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' Kbps'
  return v.toFixed(0) + ' bps'
}

function fmtDiscard(v) {
  v = parseFloat(v) || 0
  if (v === 0) return '<span style="color:#6E7681">0</span>'
  return '<span style="color:#F85149;font-weight:bold">' + v.toFixed(2) + '/s</span>'
}

function statusBadge(s) {
  var n = parseInt(s, 10)
  if (n === 1) return '<span style="color:#3FB950;font-weight:bold">● UP</span>'
  if (n === 2) return '<span style="color:#F85149;font-weight:bold">● DOWN</span>'
  return '<span style="color:#6E7681">● ?</span>'
}

// ─── PARSE ────────────────────────────────────────────────────────────────────

function parseItems(items) {
  var map = {}
  // "Interface Te0/1/2(To_LEAF2): Bits received"
  var RE = /^Interface\s+(\S+)\s*\([^)]*\):\s*(.+)$/
  for (var i = 0; i < items.length; i++) {
    var m = RE.exec(items[i].name)
    if (!m) continue
    var ref    = m[1]
    var metric = m[2]
    if (!map[ref]) map[ref] = {}
    var val = items[i].lastvalue
    if      (metric === 'Operational status')          map[ref].status  = val
    else if (metric === 'Bits received')               map[ref].bitsIn  = val
    else if (metric === 'Bits sent')                   map[ref].bitsOut = val
    else if (metric === 'Inbound packets discarded')   map[ref].discIn  = val
    else if (metric === 'Outbound packets discarded')  map[ref].discOut = val
    else if (metric === 'Speed')                       map[ref].speed   = val
  }
  return map
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

var CSS = '<style>' +
  '.wan-wrap { font-family: "JetBrains Mono",monospace,sans-serif; color:#CDD9E5; font-size:11px; }' +
  '.wan-sec { margin-bottom:16px; }' +
  '.wan-sec-title { font-size:10px; font-weight:bold; color:#58A6FF; letter-spacing:.1em;' +
    ' text-transform:uppercase; border-bottom:1px solid #2D333B; padding-bottom:3px; margin-bottom:7px; }' +
  'table.wt { width:100%; border-collapse:collapse; }' +
  'table.wt th { color:#6E7681; font-weight:normal; font-size:10px; text-align:left;' +
    ' padding:2px 10px 4px 0; border-bottom:1px solid #2D333B; }' +
  'table.wt td { padding:4px 10px 4px 0; border-bottom:1px solid rgba(45,51,59,.35);' +
    ' vertical-align:middle; white-space:nowrap; }' +
  'table.wt tr:last-child td { border-bottom:none; }' +
  '.isp { color:#D29922; font-weight:bold; }' +
  '.tipo { color:#6E7681; font-size:10px; display:block; }' +
  '.ref { opacity:.7; }' +
  '.row-down td { background:rgba(248,81,73,.05); }' +
  '</style>'

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderSection(title, rows, map) {
  var html = '<div class="wan-sec"><div class="wan-sec-title">' + title + '</div>'
  html += '<table class="wt"><tr><th>ISP / Interface</th><th>Ref</th><th>Status</th>'
  html += '<th>Bits In</th><th>Bits Out</th><th>Disc In</th><th>Disc Out</th></tr>'
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i]
    var d = map[r.ref] || {}
    var isDown = parseInt(d.status, 10) === 2
    html += '<tr' + (isDown ? ' class="row-down"' : '') + '>'
    html += '<td><span class="isp">' + (r.isp || r.label || r.ref) + '</span>'
    var sub = r.desc || r.tipo || ''
    if (sub) html += '<span class="tipo">' + sub + '</span>'
    html += '</td>'
    html += '<td><span class="ref">' + r.ref + '</span></td>'
    html += '<td>' + statusBadge(d.status) + '</td>'
    html += '<td>' + fmtBps(d.bitsIn)  + '</td>'
    html += '<td>' + fmtBps(d.bitsOut) + '</td>'
    html += '<td>' + fmtDiscard(d.discIn)  + '</td>'
    html += '<td>' + fmtDiscard(d.discOut) + '</td>'
    html += '</tr>'
  }
  html += '</table></div>'
  return html
}

function render(map) {
  var el = document.getElementById(CFG.elementId)
  if (!el) return
  var html = CSS + '<div class="wan-wrap">'
  html += renderSection('Uplinks Físicos — Ligação ao Fabric DC', CFG.UPLINKS, map)
  html += renderSection('Circuitos WAN — Sub-interfaces (Po2.x)', CFG.WAN_CIRCUITS, map)
  html += renderSection('Túneis DMVPN — Hub Agências (DC)', CFG.DMVPN_DC, map)
  html += renderSection('Túneis DMVPN — Hub Edifícios', CFG.DMVPN_EDIF, map)
  html += '</div>'
  el.innerHTML = html
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────

function boot() {
  var el = document.getElementById(CFG.elementId)
  if (!el) return
  el.textContent = 'A carregar interfaces...'

  zabbixPost('item.get', {
    hostids: [CFG.hostId],
    output:  ['name', 'lastvalue'],
    limit:   500
  })
  .then(function (items) {
    if (CFG.debug) console.log('[wan-ag-ifaces] items:', items.length)
    render(parseItems(items))
    setTimeout(function () {
      zabbixPost('item.get', {
        hostids: [CFG.hostId],
        output:  ['name', 'lastvalue'],
        limit:   500
      }).then(function (fresh) { render(parseItems(fresh)) })
    }, CFG.refreshMs)
  })
  .catch(function (err) {
    var el2 = document.getElementById(CFG.elementId)
    if (el2) el2.innerHTML = '<span style="color:#F85149">Erro: ' + err.message + '</span>'
  })
}

// Protecção double-fire BT
if (!window.__bpc_wan_ag_ifaces) {
  window.__bpc_wan_ag_ifaces = true
  boot()
}
