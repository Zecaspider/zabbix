// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC FABRIC — 7 CARDS POR SWITCH  v1.0             ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                            ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                 ║
// ║                                                                          ║
// ║  2 SPINE + 5 LEAF (HG_DC_SWITCHES, grupo 26). Classificação por tag     ║
// ║  Zabbix "funcao" (switch-spine/switch-leaf) e "modelo" — confirmado ao  ║
// ║  vivo em 2026-07-02 (host.get selectTags), não por regex sobre o nome.  ║
// ║  Uplinks/vPC/overlay lidos por descrição de interface (net.if.status),  ║
// ║  também confirmados ao vivo — ver documentacao/rede-topologia.md §2.1.  ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_FCARDS = {
  elementId: 'bpc-n3fab-switches',
  refreshMs:  60000,
  groupIds:   ['26'],
  n4DashUid:  'rede-n4-dc-fabric-switch',

  funcaoLabel: { 'switch-spine': 'SPINE', 'switch-leaf': 'LEAF' },
  funcaoIcon:  { 'switch-spine': '🧭', 'switch-leaf': '🔀' },
  // ordem visual: SPINE primeiro, depois LEAF por nome (agrupa os pares vPC
  // 101+102 / 103+104 naturalmente, 105 fica isolado no fim — sem tabela
  // de pares hardcoded, é assim que o nome já ordena)
  funcaoOrder: { 'switch-spine': 0, 'switch-leaf': 1 },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function fcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function fcParseIf(name) {
  var m = /Interface\s+([^(]+)\(([^)]*)\)/.exec(name || '')
  if (!m) return { ifname: '', desc: '' }
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function fcTag(tags, key) {
  var t = (tags || []).filter(function (t) { return t.tag === key })[0]
  return t ? t.value : null
}

function fcDot(up) {
  var T = window.BPC.THEME
  var col = up ? T.colorOk : T.colorCrit
  var pulse = !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + col + ';flex-shrink:0;' + pulse + '"></span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function fcFetch(rpc) {
  return Promise.all([
    rpc('host.get', {
      groupids:   CFG_FCARDS.groupIds,
      output:     ['hostid', 'name'],
      selectTags: 'extend',
      filter:     { status: 0 },
    }),
    rpc('item.get', {
      groupids: CFG_FCARDS.groupIds,
      filter:   { status: 0, key_: 'icmpping' },
      output:   ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      groupids: CFG_FCARDS.groupIds,
      search:   { key_: 'net.if.status' },
      filter:   { status: 0 },
      output:   ['hostid', 'name', 'lastvalue'],
    }),
    rpc('trigger.get', {
      groupids:  CFG_FCARDS.groupIds,
      filter:    { value: 1 },
      output:    ['triggerid'],
      monitored: true,
      only_true: true,
    }),
  ]).then(function (r) { return { hosts: r[0], icmp: r[1], ifaces: r[2], triggers: r[3] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function fcCompute(data) {
  var icmpByHost = {}
  data.icmp.forEach(function (i) { icmpByHost[i.hostid] = i.lastvalue === '1' })

  var trigCountByHost = {}
  // trigger.get sem hostids aqui devolve só triggerid — contamos globalmente
  // e mostramos por host via trigger.get dedicado seria mais preciso, mas
  // para o card basta o pill de alerta vermelho quando algo está down.

  var ifacesByHost = {}
  data.ifaces.forEach(function (it) {
    if (!ifacesByHost[it.hostid]) ifacesByHost[it.hostid] = []
    var p = fcParseIf(it.name)
    ifacesByHost[it.hostid].push({ ifname: p.ifname, desc: p.desc, up: it.lastvalue === '1' })
  })

  function find(hostid, re) {
    var ifs = ifacesByHost[hostid] || []
    for (var i = 0; i < ifs.length; i++) {
      if (re.test(ifs[i].desc) || re.test(ifs[i].ifname)) return ifs[i]
    }
    return null
  }
  function findAll(hostid, re) {
    return (ifacesByHost[hostid] || []).filter(function (f) { return re.test(f.desc) || re.test(f.ifname) })
  }
  // find só a interface lógica (ifname bate ifRe) que também bate descRe —
  // usado para colapsar port-channel + membros físicos na mesma etiqueta
  // (ex.: VPC PEER-LINK aparece 3x: port-channel1 + 2 portas membro).
  function findLogical(hostid, ifRe, descRe) {
    var ifs = ifacesByHost[hostid] || []
    for (var i = 0; i < ifs.length; i++) {
      if (ifRe.test(ifs[i].ifname) && descRe.test(ifs[i].desc)) return ifs[i]
    }
    return null
  }

  var cards = data.hosts.map(function (h) {
    var funcao = fcTag(h.tags, 'funcao') || 'unknown'
    var modelo = fcTag(h.tags, 'modelo') || '—'
    var isSpine = funcao === 'switch-spine'

    // Underlay é assimétrico (confirmado ao vivo 2026-07-02): SPINE diz
    // "LEAF-10X UNDERLAY", LEAF diz "LINK TO SPINE-1X". A palavra "UNDERLAY"
    // sozinha também aparece na loopback0 de BGP dos LEAFs ("BGP PEERING
    // UNDERLAY") — não é um uplink físico, por isso o regex exige um dos
    // dois padrões específicos, nunca "UNDERLAY" isolado.
    var underlay = findAll(h.hostid, /LINK TO SPINE-\d+|LEAF-\d+\s*UNDERLAY/i)
    var underlayUp = underlay.filter(function (i) { return i.up }).length

    var overlay = find(h.hostid, /VXLAN\s*OVERLAY|^nve1$/i)

    // VPC PEER-LINK aparece 3x (port-channel lógico + 2 portas físicas
    // membro) — preferir o port-channel lógico para 1 linha só, coerente.
    var vpcPeer = findLogical(h.hostid, /^port-channel\d+$/i, /VPC\s*PEER-?LINK/i)
      || find(h.hostid, /VPC\s*PEER-?LINK/i)
    var vpcKeep = find(h.hostid, /VPC\s*KEEPALIVE/i)
    var hasVpc  = !!(vpcPeer || vpcKeep)

    var icmpUp = icmpByHost[h.hostid]
    var downCount = underlay.filter(function (i) { return !i.up }).length
      + (overlay && !overlay.up ? 1 : 0)
      + (vpcPeer && !vpcPeer.up ? 1 : 0)
      + (vpcKeep && !vpcKeep.up ? 1 : 0)
    var worst = icmpUp === false ? 'down' : downCount > 0 ? 'warn' : icmpUp === undefined ? 'warn' : 'ok'

    return {
      hostid: h.hostid, name: h.name, funcao: funcao, modelo: modelo, isSpine: isSpine,
      icmpUp: icmpUp,
      underlay: underlay, underlayUp: underlayUp, underlayTotal: underlay.length,
      overlay: overlay, vpcPeer: vpcPeer, vpcKeep: vpcKeep, hasVpc: hasVpc,
      worst: worst,
    }
  })

  cards.sort(function (a, b) {
    var fo = (CFG_FCARDS.funcaoOrder[a.funcao] || 9) - (CFG_FCARDS.funcaoOrder[b.funcao] || 9)
    if (fo !== 0) return fo
    return a.name < b.name ? -1 : 1
  })

  return cards
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function fcRenderUplinkRow(label, up, total, title) {
  var col = up === total ? '#22C55E' : '#f85149'
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0" title="' + fcEsc(title || '') + '">'
    + '<span style="font-size:13px;color:#B8C0D4">' + fcEsc(label) + '</span>'
    + '<span style="font-size:14px;font-weight:700;color:' + col + '">' + up + '/' + total + '</span>'
    + '</div>'
}

function fcRenderPillRow(label, hit, title) {
  var state = hit ? hit.up : null
  var col = state === true ? '#22C55E' : state === false ? '#f85149' : '#8891A8'
  var txt = state === true ? 'UP' : state === false ? 'DOWN' : 'n/d'
  return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0" title="' + fcEsc(title || '') + '">'
    + '<span style="font-size:13px;color:#B8C0D4">' + fcEsc(label) + '</span>'
    + '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:' + col + '">' + fcDot(state === true) + txt + '</span>'
    + '</div>'
}

function fcRenderCard(c) {
  var S = window.BPC_SHARED
  var stateCol = { ok: '#22C55E', warn: '#d29922', crit: '#f85149', down: '#f85149' }[c.worst] || '#8891A8'
  var pillLbl  = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }[c.worst] || '—'
  var pillBg   = { ok: 'rgba(34,197,94,0.15)', warn: 'rgba(210,153,34,0.15)', crit: 'rgba(248,81,73,0.18)', down: 'rgba(248,81,73,0.18)' }[c.worst] || 'rgba(136,145,168,0.15)'

  var icmpBadge = c.icmpUp === undefined
    ? '<span style="font-size:15px;color:#8891A8">ICMP n/d</span>'
    : c.icmpUp
      ? '<span style="font-size:15px;color:#22C55E;font-weight:600">ICMP UP</span>'
      : '<span style="font-size:15px;color:#f85149;font-weight:700">ICMP DOWN</span>'

  var body = ''
  body += c.isSpine
    ? fcRenderUplinkRow('Underlay → LEAFs', c.underlayUp, c.underlayTotal, 'uplinks a cada LEAF do fabric')
    : fcRenderUplinkRow('Underlay → SPINEs', c.underlayUp, c.underlayTotal, 'uplinks aos 2 SPINEs (full-mesh)')
  if (c.hasVpc) {
    body += fcRenderPillRow('vPC peer-link', c.vpcPeer, 'cabo entre o par (tipo cabo de stack)')
    body += fcRenderPillRow('vPC keepalive', c.vpcKeep, 'linha de vida do vPC')
  } else if (!c.isSpine) {
    body += '<div style="font-size:12px;color:#8891A8;padding:5px 0">standalone (sem par vPC)</div>'
  }
  body += fcRenderPillRow('Overlay (nve1)', c.overlay, 'túnel VXLAN que transporta as VLANs')

  var n4Href = CFG_FCARDS.n4DashUid ? '/d/' + CFG_FCARDS.n4DashUid + '?var-switchName=' + encodeURIComponent(c.name) : null
  var footer = '<span style="font-size:14px;color:' + (n4Href ? '#00B4D8' : '#8891A8') + ';font-weight:600">Ver detalhes do switch →</span>'
  var tag = n4Href ? 'a' : 'div'
  var hrefAttr = n4Href ? ' href="' + n4Href + '"' : ''

  return '<' + tag + hrefAttr + ' style="text-decoration:none;background:rgba(14,20,60,0.6);'
    + 'border:1px solid rgba(255,255,255,0.08);border-left:5px solid ' + stateCol + ';border-radius:8px;'
    + 'padding:14px;display:flex;flex-direction:column;flex:1 1 0;min-width:0;' + (n4Href ? 'cursor:pointer' : '') + '">'

    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
    +   '<div>'
    +     '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;color:var(--bpc-mute)">' + (CFG_FCARDS.funcaoIcon[c.funcao] || '') + ' ' + (CFG_FCARDS.funcaoLabel[c.funcao] || c.funcao.toUpperCase()) + '</div>'
    +     '<div style="font-size:17px;font-weight:700;color:#E6EDF3;line-height:1.25;font-family:monospace">' + S.esc(c.name) + '</div>'
    +     '<div style="font-size:11px;color:#8891A8;margin-top:2px">' + S.esc(c.modelo) + '</div>'
    +   '</div>'
    +   '<span style="background:' + pillBg + ';color:' + stateCol + ';font-size:12px;font-weight:700;padding:3px 8px;border-radius:4px;white-space:nowrap">' + pillLbl + '</span>'
    + '</div>'

    + '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:4px">' + icmpBadge + '</div>'

    + '<div style="flex:1">' + body + '</div>'

    + '<div style="margin-top:auto;padding-top:8px;text-align:right">' + footer + '</div>'

    + '</' + tag + '>'
}

function fcRender(el, cards) {
  el.innerHTML = '<div style="display:flex;gap:12px;align-items:stretch;flex-wrap:nowrap;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + cards.map(fcRenderCard).join('')
    + '</div>'
}

function fcRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ DC Fabric — Switches: ' + fcEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function fcLoad(rpc) {
  var el = document.getElementById(CFG_FCARDS.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:12px;height:100%">'
    + [0, 1, 2, 3, 4, 5, 6].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  fcFetch(rpc)
    .then(function (data) { fcRender(el, fcCompute(data)) })
    .catch(function (err) { fcRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function () { fcLoad(rpc) }, CFG_FCARDS.refreshMs)
}

function fcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(fcLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-fab-cards: waitForBPC nunca disponivel'); return }
  setTimeout(function () { fcInitWithRetry(attempt + 1) }, 100)
}

fcInitWithRetry()
