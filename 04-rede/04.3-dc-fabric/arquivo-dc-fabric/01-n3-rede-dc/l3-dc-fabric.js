// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC · SAÚDE DO FABRIC  v1.0                       ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Reflecte a topologia auditada (documentacao/rede-topologia.md §2.1/§13)║
// ║  Responde "o fabric está saudável?" numa olhada, em linguagem clássica: ║
// ║                                                                          ║
// ║   • UNDERLAY  — uplinks de cada LEAF aos 2 SPINEs (full-mesh 2×5)        ║
// ║                 = o "trunk para o core", mas para os dois cores          ║
// ║   • vPC       — pares de switches que agem como 1 (tipo StackWise/VSS)   ║
// ║   • OVERLAY   — túnel VXLAN (nve1) que transporta as VLANs               ║
// ║   • ROUTERS   — uplink Po1 de cada router ao fabric + Po2 (handoff ITA)  ║
// ║                                                                          ║
// ║  Dados: net.if.status (1=UP,2=DOWN) lidos por DESCRIÇÃO de interface.    ║
// ║  Sem hardcode de estado — só o mapa de adjacências é fixo (auditado).   ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_FAB = {
  elementId: 'bpc-n3dc-fabric',
  groupIds:  ['26', '27'],
  refreshMs:  60000,
  // net.if.status tem polling SNMP lento (mediana ~12158s, max ~19776s
  // observado ao vivo em 2026-07-02) — 600s marcava quase tudo como stale
  // e isso era forçado a "down" (falso crítico permanente). 21600 (6h) dá
  // folga real; mesmo assim tratamos "stale" como estado neutro, nunca down
  // (ver fabIsStale/state 'stale' abaixo).
  maxAgeSec:  21600,

  // Ordem visual dos LEAFs nas colunas do underlay
  leafOrder: ['DC1-LEAF-101', 'DC1-LEAF-102', 'DC1-LEAF-103', 'DC1-LEAF-104', 'DC1-LEAF-105'],
  spineOrder: ['DC1-SPINE-11', 'DC1-SPINE-12'],

  // Pares vPC auditados (§2.1). 105 = standalone (sem peer-link).
  vpcPairs: [
    { label: 'vPC-A', members: ['DC1-LEAF-101', 'DC1-LEAF-102'], model: 'N9K-93180YC-FX3' },
    { label: 'vPC-B', members: ['DC1-LEAF-103', 'DC1-LEAF-104'], model: 'N9K-93108TC-FX' },
  ],
  standaloneLeaf: 'DC1-LEAF-105',

  // Para que fabric cada router se liga (§13). Interfaces reais por router:
  //   fabricIfs → uplink(s) ao fabric (regex sobre ifname)
  //   handoff   → tem Po2 para DC-ITA-SWA-SP (só os 3 ISR4451)
  routerAttach: {
    'DC1-RTE-WAN-INT':  { to: 'vPC-B (LEAF-103/104)', via: 'Po1 → Po11/12/13', fabricIfs: [/^Po1$/i], handoff: true },
    'DC1-RTE-WAN-EMIS': { to: 'vPC-B (LEAF-103/104)', via: 'Po1 → Po11/12/13', fabricIfs: [/^Po1$/i], handoff: true },
    'DC1-RTE-PARC':     { to: 'vPC-B (LEAF-103/104)', via: 'Po1 → Po11/12/13', fabricIfs: [/^Po1$/i], handoff: true },
    'DC1-RTE-WAN-AG':   { to: 'vPC-A (LEAF-101/102)', via: 'Te0/1/2-3 → E1/1', fabricIfs: [/^Te0\/1\/2$/i, /^Te0\/1\/3$/i], handoff: false },
    'DC1-RTE-GTW01':    { to: 'FW-Parc / túneis',     via: 'Po1 (fabric) em baixo', fabricIfs: [/^Po1$/i], handoff: false },
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function fabEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

// Extrai { ifname, desc } do nome do item:
//   "Interface Ethernet1/49(LINK TO SPINE-11): Operational status"
function fabParseIf(itemName) {
  var m = /Interface\s+([^(]+)\(([^)]*)\)/.exec(itemName || '')
  if (!m) {
    var m2 = /Interface\s+(\S+)/.exec(itemName || '')
    return { ifname: m2 ? m2[1].trim() : '', desc: '' }
  }
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function fabIsStale(lastclock) {
  return !lastclock || (Math.floor(Date.now() / 1000) - parseInt(lastclock, 10)) > CFG_FAB.maxAgeSec
}

// net.if.status: 1=UP, 2=DOWN, 4=idle(voz). Aqui só nos interessa up/down físico.
function fabUp(lastvalue) { return String(lastvalue) === '1' }

// Estado de uma interface para efeitos de render: 'stale' é neutro, nunca
// vira 'down' — só reportamos crítico com dado fresco a confirmar.
function fabState(hit) {
  if (!hit) return 'na'
  if (hit.stale) return 'stale'
  return hit.up ? 'up' : 'down'
}

function fabDot(state) {
  var T = window.BPC.THEME
  var c = state === 'up' ? T.colorOk : state === 'down' ? T.colorCrit : state === 'stale' ? T.colorWarn : T.colorMute
  var pulse = state === 'down' ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + c + ';' + pulse + '"></span>'
}

function fabPill(label, state, title) {
  var T = window.BPC.THEME
  var c = state === 'up' ? T.colorOk : state === 'down' ? T.colorCrit : state === 'stale' ? T.colorWarn : T.colorMute
  var bg = state === 'up' ? 'rgba(63,185,80,0.10)' : state === 'down' ? 'rgba(248,81,73,0.12)' : state === 'stale' ? 'rgba(210,153,34,0.12)' : 'rgba(255,255,255,0.05)'
  var suffix = state === 'stale' ? ' <span style="opacity:.7">(sem dado recente)</span>' : ''
  return '<span title="' + fabEsc(title || '') + (state === 'stale' ? ' — sem dado recente (fora da janela de polling)' : '') + '" style="display:inline-flex;align-items:center;gap:6px;'
    + 'padding:3px 9px;border-radius:12px;background:' + bg + ';border:1px solid ' + c + '33;font-size:.86rem;color:#CDD9E5">'
    + fabDot(state) + fabEsc(label) + suffix + '</span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function fabFetch(rpc) {
  var [hosts, ifItems] = await Promise.all([
    rpc('host.get', {
      groupids:   CFG_FAB.groupIds,
      output:     ['hostid', 'host', 'name'],
      selectTags: ['tag', 'value'],
      filter:     { status: 0 },
    }),
    rpc('item.get', {
      groupids: CFG_FAB.groupIds,
      filter:   { status: 0 },
      output:   ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
      search:   { key_: 'net.if.status' },
    }),
  ])
  return { hosts, ifItems }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function fabCompute(data) {
  var hosts   = data.hosts
  var ifItems = data.ifItems

  // nome → host
  var byName = {}
  hosts.forEach(function (h) {
    byName[h.name || h.host] = { host: h, name: h.name || h.host, ifs: [] }
  })

  // distribuir interfaces (com descrição) pelos hosts
  ifItems.forEach(function (it) {
    var h = null
    hosts.forEach(function (hh) { if (hh.hostid === it.hostid) h = hh })
    if (!h) return
    var key = h.name || h.host
    if (!byName[key]) return
    var parsed = fabParseIf(it.name)
    byName[key].ifs.push({
      ifname: parsed.ifname,
      desc:   parsed.desc,
      up:     !fabIsStale(it.lastclock) && fabUp(it.lastvalue),
      stale:  fabIsStale(it.lastclock),
      raw:    it.lastvalue,
    })
  })

  function findDesc(entry, re) {
    if (!entry) return null
    for (var i = 0; i < entry.ifs.length; i++) {
      if (re.test(entry.ifs[i].desc) || re.test(entry.ifs[i].ifname)) return entry.ifs[i]
    }
    return null
  }

  // ── UNDERLAY: matriz spine × leaf ──────────────────────────────────────
  // Lado SPINE: interface com desc "LEAF-10X UNDERLAY".
  var underlay = []   // [{spine, cells:[{leaf, state}]}]
  CFG_FAB.spineOrder.forEach(function (spineName) {
    var sp = byName[spineName]
    var cells = CFG_FAB.leafOrder.map(function (leafName) {
      var num = leafName.replace(/^.*LEAF-/, '')   // 101..105
      var hit = sp ? findDesc(sp, new RegExp('LEAF-' + num + '\\b.*UNDERLAY', 'i')) : null
      return { leaf: leafName, state: fabState(hit) }
    })
    underlay.push({ spine: spineName, present: !!sp, cells: cells })
  })

  // ── vPC: peer-link + keepalive por par ──────────────────────────────────
  var vpc = CFG_FAB.vpcPairs.map(function (pair) {
    var members = pair.members.map(function (leafName) {
      var e  = byName[leafName]
      var pl = findDesc(e, /VPC\s*PEER-?LINK/i)
      var ka = findDesc(e, /VPC\s*KEEPALIVE/i)
      return {
        name:     leafName,
        present:  !!e,
        peerlink: !e ? 'na' : fabState(pl),
        keepalive:!e ? 'na' : fabState(ka),
      }
    })
    return { label: pair.label, model: pair.model, members: members }
  })
  var standalone = (function () {
    var e = byName[CFG_FAB.standaloneLeaf]
    return { name: CFG_FAB.standaloneLeaf, present: !!e }
  })()

  // ── OVERLAY: nve1 por spine e por leaf ──────────────────────────────────
  var overlay = []
  CFG_FAB.spineOrder.concat(CFG_FAB.leafOrder).forEach(function (n) {
    var e   = byName[n]
    var nve = findDesc(e, /VXLAN\s*OVERLAY|^nve1$/i)
    overlay.push({
      name:  n,
      tier:  n.indexOf('SPINE') !== -1 ? 'SPINE' : 'LEAF',
      state: !e ? 'na' : fabState(nve),
    })
  })

  // ── ROUTERS: uplink(s) ao fabric + Po2 (handoff DC-ITA-SWA-SP) ──────────
  var routers = []
  Object.keys(CFG_FAB.routerAttach).forEach(function (rname) {
    var e  = byName[rname]
    if (!e) return
    var att = CFG_FAB.routerAttach[rname]

    // estado do uplink ao fabric = pior das fabricIfs encontradas
    var upIfs = att.fabricIfs.map(function (re) { return findDesc(e, re) }).filter(Boolean)
    var upIfStates = upIfs.map(fabState)
    var fabricState = !upIfStates.length ? 'na'
      : upIfStates.indexOf('down') !== -1 ? 'down'
      : upIfStates.indexOf('stale') !== -1 ? 'stale'
      : 'up'
    var fabricLabel = att.fabricIfs.length > 1 ? 'Te0/1/2-3' : 'Po1'

    var po2 = att.handoff ? findDesc(e, /^Po2$/i) : null

    routers.push({
      name:        rname,
      attach:      att,
      fabricLabel: fabricLabel,
      fabricState: fabricState,
      handoff:     att.handoff,
      po2:         fabState(po2),
    })
  })

  return { underlay: underlay, vpc: vpc, standalone: standalone, overlay: overlay, routers: routers }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function fabBlockTitle(label, hint) {
  return [
    '<div style="display:flex;align-items:baseline;gap:10px;margin:14px 0 8px">',
    '<span style="font-size:.80rem;font-weight:700;letter-spacing:.10em;text-transform:uppercase;color:var(--bpc-mute)">' + label + '</span>',
    hint ? '<span style="font-size:.78rem;color:rgba(255,255,255,0.30)">' + hint + '</span>' : '',
    '</div>',
  ].join('')
}

function fabCard(inner) {
  return '<div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:10px 12px;margin-bottom:4px">' + inner + '</div>'
}

function fabShortLeaf(n) { return n.replace('DC1-LEAF-', 'L') }
function fabShortSpine(n) { return n.replace('DC1-', '') }

// Matriz underlay: linhas = spine, colunas = leaf
function fabRenderUnderlay(underlay) {
  var head = '<tr><th style="padding:4px 8px"></th>'
    + CFG_FAB.leafOrder.map(function (l) {
        return '<th style="padding:4px 8px;font-size:.82rem;font-weight:600;color:var(--bpc-mute);text-align:center">' + fabShortLeaf(l) + '</th>'
      }).join('')
    + '</tr>'

  var rows = underlay.map(function (r) {
    var cells = r.cells.map(function (c) {
      return '<td style="padding:6px 8px;text-align:center" title="' + fabShortSpine(r.spine) + ' ↔ ' + c.leaf + '">'
        + (c.state === 'na' ? '<span class="bpc-mute">·</span>' : fabDot(c.state)) + '</td>'
    }).join('')
    return '<tr><td style="padding:6px 8px;font-size:.92rem;font-weight:600;color:#CDD9E5;white-space:nowrap">' + fabShortSpine(r.spine) + '</td>' + cells + '</tr>'
  }).join('')

  return fabCard('<table style="width:100%;border-collapse:collapse"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table>')
}

function fabRenderVpc(vpc, standalone) {
  var cards = vpc.map(function (pair) {
    var membersHtml = pair.members.map(function (m) {
      return '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">'
        + '<span style="font-size:.92rem;font-weight:600;color:#CDD9E5;width:96px">' + fabEsc(m.name) + '</span>'
        + fabPill('peer-link', m.peerlink, 'cabo entre o par (tipo cabo de stack)')
        + fabPill('keepalive', m.keepalive, 'linha de vida do vPC')
        + '</div>'
    }).join('')
    return '<div style="flex:1;min-width:230px">'
      + '<div style="font-size:.88rem;font-weight:700;color:var(--bpc-cyan)">' + pair.label
      + ' <span style="font-weight:400;color:rgba(255,255,255,0.30)">· ' + fabEsc(pair.model) + '</span></div>'
      + membersHtml + '</div>'
  }).join('')

  var sa = '<div style="flex:1;min-width:230px">'
    + '<div style="font-size:.88rem;font-weight:700;color:rgba(255,255,255,0.45)">standalone</div>'
    + '<div style="display:flex;align-items:center;gap:8px;margin-top:4px">'
    + '<span style="font-size:.92rem;font-weight:600;color:#CDD9E5;width:96px">' + fabEsc(standalone.name) + '</span>'
    + '<span style="font-size:.84rem;color:var(--bpc-mute)">sem par vPC (não emparelhado)</span>'
    + '</div></div>'

  return fabCard('<div style="display:flex;flex-wrap:wrap;gap:18px">' + cards + sa + '</div>')
}

function fabRenderOverlay(overlay) {
  var pills = overlay.map(function (o) {
    return fabPill(fabShortSpine(o.name).replace('LEAF-', 'L'), o.state, 'nve1 (túnel VXLAN) — ' + o.tier)
  }).join(' ')
  var spinesDown = overlay.filter(function (o) { return o.tier === 'SPINE' && o.state === 'down' }).length
  var note = spinesDown
    ? '<div style="margin-top:8px;font-size:.84rem;color:var(--bpc-warn)">⚠ nve1 down nos SPINEs: o túnel VXLAN de gestão está em baixo. O fabric encaminha (tudo a jusante UP) → provável loopback/monitorização, a confirmar com a equipa de rede.</div>'
    : ''
  return fabCard('<div style="display:flex;flex-wrap:wrap;gap:8px">' + pills + '</div>' + note)
}

function fabRenderRouters(routers) {
  var rows = routers.map(function (r) {
    return '<tr style="border-top:1px solid rgba(255,255,255,0.05)">'
      + '<td style="padding:6px 8px;font-size:.96rem;font-weight:600;color:#CDD9E5">' + fabEsc(r.name) + '</td>'
      + '<td style="padding:6px 8px">' + fabPill(r.fabricLabel, r.fabricState, 'uplink ao fabric') + '</td>'
      + '<td style="padding:6px 8px">' + (r.handoff ? fabPill('Po2', r.po2, 'handoff DC-ITA-SWA-SP (operadoras)') : '<span class="bpc-mute">—</span>') + '</td>'
      + '<td style="padding:6px 8px;font-size:.86rem;color:rgba(255,255,255,0.55)">' + fabEsc(r.attach.to) + '<br><span style="font-size:.80rem;color:var(--bpc-mute)">' + fabEsc(r.attach.via) + '</span></td>'
      + '</tr>'
  }).join('')
  return fabCard('<table style="width:100%;border-collapse:collapse"><tbody>' + rows + '</tbody></table>')
}

function fabRender(el, model) {
  // resumo: contar links down
  var underDown = 0
  model.underlay.forEach(function (r) { r.cells.forEach(function (c) { if (c.state === 'down') underDown++ }) })
  var plDown = 0
  model.vpc.forEach(function (p) { p.members.forEach(function (m) { if (m.peerlink === 'down' || m.keepalive === 'down') plDown++ }) })
  var po1Down = model.routers.filter(function (r) { return r.fabricState === 'down' }).length
  var overSpineDown = model.overlay.filter(function (o) { return o.tier === 'SPINE' && o.state === 'down' }).length

  var headline = (underDown === 0 && plDown === 0)
    ? '<span class="bpc-ok">Fabric saudável</span> — underlay e vPC todos UP'
    : '<span class="bpc-crit">' + (underDown + plDown) + ' ligação(ões) de fabric em baixo</span>'

  el.innerHTML = [
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">',

    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">',
    '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.08em;text-transform:uppercase">Saúde do Fabric</span>',
    '<span style="font-size:.90rem;color:var(--bpc-mute)">' + headline + '</span>',
    '</div>',
    '<div style="font-size:.80rem;color:rgba(255,255,255,0.30);margin-bottom:2px">',
    'SPINE = núcleo · LEAF = acesso/distribuição · Po = EtherChannel (trunk) · vPC = 2 switches como 1',
    '</div>',

    fabBlockTitle('Underlay — uplinks LEAF aos 2 SPINEs', 'full-mesh: cada LEAF liga a cada SPINE'),
    fabRenderUnderlay(model.underlay),

    fabBlockTitle('Pares vPC', '2 switches que agem como 1 (tipo StackWise/VSS)'),
    fabRenderVpc(model.vpc, model.standalone),

    fabBlockTitle('Overlay VXLAN (nve1)', 'túnel que transporta as VLANs sobre o fabric'),
    fabRenderOverlay(model.overlay),

    fabBlockTitle('Routers WAN — uplink ao fabric', 'Po1 = ligação ao fabric · Po2 = handoff operadoras'),
    fabRenderRouters(model.routers),

    (po1Down || overSpineDown ? '<div style="margin-top:6px;font-size:.82rem;color:var(--bpc-mute)">Nota: GTW01 com Po1 em baixo opera por túneis/FW-Parc (esperado); ver topologia em rede-topologia.md §13.</div>' : ''),

    '</div>',
  ].join('')
}

function fabRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Saúde do Fabric: ' + fabEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function fabLoad(rpc) {
  var el = document.getElementById(CFG_FAB.elementId)
  if (!el) return

  el.innerHTML = '<div style="padding:16px;color:var(--bpc-mute);font-size:1.0rem">A carregar saúde do fabric…</div>'

  fabFetch(rpc)
    .then(function (data) { fabRender(el, fabCompute(data)) })
    .catch(function (err) { fabRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { fabLoad(rpc) }, CFG_FAB.refreshMs)
}

function fabInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(fabLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-dc-fabric: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { fabInitWithRetry(attempt + 1) }, 100)
}

fabInitWithRetry()
