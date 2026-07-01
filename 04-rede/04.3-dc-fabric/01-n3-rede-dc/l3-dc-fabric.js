// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · DC — FABRIC · 4 BLOCOS  v2.0                           ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Layout: grid 2×2 — cada bloco = camada de fabric                      ║
// ║    [SPINE-11 / SPINE-12]          [vPC-A · LEAF-101 / LEAF-102]        ║
// ║    [vPC-B · LEAF-103 / LEAF-104]  [LEAF-105 standalone + OOB]          ║
// ║                                                                          ║
// ║  Por linha de dispositivo:                                              ║
// ║    • ● ICMP dot                                                         ║
// ║    • nome do switch                                                     ║
// ║    • PortChannels X UP / Y total                                        ║
// ║    • contagem IF DOWN (warn se > 0)                                     ║
// ║    • link → N4 · Ficha                                                  ║
// ║                                                                          ║
// ║  Parsing de interfaces: name field do Zabbix                            ║
// ║    "Interface Po1(WAN-INT): Operational status" → ifname=Po1, Po*=true  ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_FAB2 = {
  elementId: 'bpc-n3dc-fabric',
  refreshMs:  60000,
  n4DashUid:  null,  // placeholder até N4 criado

  // 4 blocos: título, ícone, devices por bloco
  blocks: [
    {
      title: 'SPINE',
      icon:  '🔷',
      role:  'Route Reflectors · EVPN core',
      devices: [
        { hostid: '10847', label: 'DC1-SPINE-11' },
        { hostid: '10848', label: 'DC1-SPINE-12' },
      ],
    },
    {
      title: 'vPC-A — LEAF-101/102',
      icon:  '🔶',
      role:  'Uplink WAN-AG + GTW01',
      devices: [
        { hostid: '10843', label: 'DC1-LEAF-101' },
        { hostid: '10845', label: 'DC1-LEAF-102' },
      ],
    },
    {
      title: 'vPC-B — LEAF-103/104',
      icon:  '🔶',
      role:  'Uplink ISR4451',
      devices: [
        { hostid: '10842', label: 'DC1-LEAF-103' },
        { hostid: '10846', label: 'DC1-LEAF-104' },
      ],
    },
    {
      title: 'LEAF-105 + OOB',
      icon:  '⬛',
      role:  'Standalone · gestão OOB',
      devices: [
        { hostid: '10844', label: 'DC1-LEAF-105' },
        { hostid: '10667', label: 'DC-IMP-SWA-EDGE' },
      ],
    },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

// Parseia "Interface Po1(WAN-INT): Operational status" → { ifname: "Po1", desc: "WAN-INT", isPo: true }
function fabParseItem(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  var ifname = m[1].trim()
  return {
    ifname: ifname,
    desc:   (m[2] || '').replace(/^\*+|\*+$/g,'').trim(),
    isPo:   /^Po\d/i.test(ifname),
    isNve:  /^nve\d/i.test(ifname),
  }
}

function fabDot(up) {
  var T = window.BPC.THEME
  var col = up ? T.colorOk : T.colorCrit
  return '<span style="color:' + col + ';font-size:1rem">●</span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function fabFetch(rpc) {
  var hids = []
  CFG_FAB2.blocks.forEach(function(b) {
    b.devices.forEach(function(d) { hids.push(d.hostid) })
  })
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      filter:  { status: 0, key_: 'icmpping' },
      output:  ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hids,
      search:  { key_: 'net.if.status' },
      filter:  { status: 0 },
      output:  ['hostid', 'name', 'lastvalue'],
    }),
  ]).then(function(r) { return { icmp: r[0], ifaces: r[1] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function fabCompute(data) {
  // índice ICMP por hostid
  var icmpMap = {}
  data.icmp.forEach(function(i) { icmpMap[i.hostid] = i.lastvalue === '1' })

  // índice interfaces por hostid
  var ifMap = {}
  data.ifaces.forEach(function(it) {
    if (!ifMap[it.hostid]) ifMap[it.hostid] = []
    var p = fabParseItem(it.name)
    if (p) ifMap[it.hostid].push({ p: p, up: it.lastvalue === '1' })
  })

  return CFG_FAB2.blocks.map(function(blk) {
    var devices = blk.devices.map(function(dev) {
      var ifaces = ifMap[dev.hostid] || []
      var poUp    = 0, poTotal = 0, ifDown = 0
      ifaces.forEach(function(i) {
        if (i.p.isPo) { poTotal++; if (i.up) poUp++ }
        if (!i.up) ifDown++
      })
      var icmpUp = icmpMap[dev.hostid]
      var worst  = icmpUp === false ? 'down' : ifDown > 0 ? 'warn' : 'ok'
      return {
        hostid:  dev.hostid,
        label:   dev.label,
        icmpUp:  icmpUp,
        poUp:    poUp,
        poTotal: poTotal,
        ifDown:  ifDown,
        worst:   worst,
      }
    })
    var blockWorst = devices.reduce(function(w, d) {
      if (d.worst === 'down') return 'down'
      if (d.worst === 'warn' && w !== 'down') return 'warn'
      return w
    }, 'ok')
    return { blk: blk, devices: devices, worst: blockWorst }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function fabRenderDevice(dev) {
  var T    = window.BPC.THEME
  var icmpDot = fabDot(dev.icmpUp !== false)
  var poStr   = dev.poTotal > 0
    ? ('<span style="color:' + (dev.poUp < dev.poTotal ? T.colorWarn : T.colorOk) + '">'
       + dev.poUp + '/' + dev.poTotal + '</span> Po UP')
    : '<span style="color:var(--bpc-mute)">sem Po</span>'
  var ifDownStr = dev.ifDown > 0
    ? ('<span style="color:' + T.colorWarn + ';font-weight:600">' + dev.ifDown + ' IF ↓</span>')
    : ''

  var n4Link = CFG_FAB2.n4DashUid
    ? ('<a href="/d/' + CFG_FAB2.n4DashUid + '?var-hostid=' + dev.hostid + '"'
       + ' style="color:var(--bpc-mute);font-size:.8rem;text-decoration:none" target="_self">'
       + '↗ ficha</a>')
    : '<span style="color:var(--bpc-mute);font-size:.8rem">↗ ficha (N4 pendente)</span>'

  return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;'
    + 'border-bottom:1px solid rgba(255,255,255,.06)">'
    + icmpDot
    + '<span style="flex:1;font-size:.9rem;font-weight:600">'
    + window.BPC_SHARED.esc(dev.label) + '</span>'
    + '<span style="font-size:.82rem;color:var(--bpc-mute)">' + poStr + '</span>'
    + (ifDownStr ? '<span style="margin-left:6px">' + ifDownStr + '</span>' : '')
    + '<span style="margin-left:8px">' + n4Link + '</span>'
    + '</div>'
}

function fabRenderBlock(computed) {
  var blk    = computed.blk
  var worst  = computed.worst
  var T      = window.BPC.THEME
  var accent = worst === 'down' ? T.colorCrit : worst === 'warn' ? T.colorWarn : T.colorOk
  var rows   = computed.devices.map(fabRenderDevice).join('')
  return '<div class="bpc bpc-card state-' + worst + '"'
    + ' style="--card-accent:' + accent + ';display:flex;flex-direction:column;gap:6px">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
    +   '<span style="font-size:1.1rem">' + blk.icon + '</span>'
    +   '<span class="bpc-label" style="font-size:.95rem;font-weight:700">'
    +     window.BPC_SHARED.esc(blk.title) + '</span>'
    + '</div>'
    + '<div style="font-size:.78rem;color:var(--bpc-mute);margin-bottom:6px">'
    +   window.BPC_SHARED.esc(blk.role) + '</div>'
    + rows
    + '</div>'
}

function fabRender(el, data) {
  var computed = fabCompute(data)
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;height:100%">'
    + computed.map(fabRenderBlock).join('')
    + '</div>'
}

function fabRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ DC Fabric: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function fabLoad(rpc) {
  var el = document.getElementById(CFG_FAB2.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;height:100%">'
    + [0,1,2,3].map(function() { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  fabFetch(rpc)
    .then(function(data) { fabRender(el, data) })
    .catch(function(err)  { fabRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { fabLoad(rpc) }, CFG_FAB2.refreshMs)
}

function fabInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(fabLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-dc-fabric: waitForBPC nunca disponivel'); return }
  setTimeout(function() { fabInitWithRetry(attempt + 1) }, 100)
}

fabInitWithRetry()
