// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · BORDA DC — 5 CARDS POR ROUTER  v1.0              ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                             ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                  ║
// ║                                                                          ║
// ║  Rebuild 2026-07-01 — mapeamento verificado ao vivo (item.get) contra   ║
// ║  os 5 routers de HG_DC_ROUTERS (g27). Correcções face ao dashboard      ║
// ║  arquivado (arquivo-borda-dc/01-n3-rede-wan):                           ║
// ║   - GTW01: "AZURE/GOV" → "GOVERNO" (zero circuitos Azure confirmados)   ║
// ║   - WAN-AG: expõe 3 secções separadas (Agências / Edifícios / Azure ER) ║
// ║     em vez de as misturar — o mesmo router serve 3 funções distintas    ║
// ║   - PARC: secção "Voz/Telefonia" separada de "Parceiros" (dados vs voz) ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_RCARDS = {
  elementId: 'bpc-n3bdc-routers',
  refreshMs:  60000,
  maxAgeSec:  600,

  n4DashUid:  'rede-n4-bdc-router',

  hosts: [
    {
      hostid:   '10838',
      label:    'INTERNET',
      hostname: 'DC1-RTE-WAN-INT',
      desc:     'ISR4451 · BGP · ITA · AT · MSTELCOM',
      icon:     '🌐',
      hasIpSla: true,
      sections: [
        { label: 'BGP Peers', ifRe: /^Po2\.(65|960|1576)$/i, excludeRe: null },
      ],
    },
    {
      hostid:   '10839',
      label:    'EMIS',
      hostname: 'DC1-RTE-WAN-EMIS',
      desc:     'ISR4451 · EMIS · ATELECOM · MSTELECOM · UNITEL',
      icon:     '🏦',
      hasIpSla: false,
      sections: [
        { label: 'Circuitos EMIS', ifRe: /^Po2\.(110|835|1158)$/i, excludeRe: null },
      ],
    },
    {
      hostid:   '10996',
      label:    'AGÊNCIAS / EDIFÍCIOS / AZURE',
      hostname: 'DC1-RTE-WAN-AG',
      desc:     'C8500L · 3 funções: hub Agências + hub Edifícios + Azure ER',
      icon:     '🏢',
      hasIpSla: false,
      sections: [
        { label: 'Túneis DMVPN Agências',  ifRe: /^Tu10[1-7]$/i,       excludeRe: null },
        { label: 'Túneis DMVPN Edifícios', ifRe: /^Tu20[1-8]$/i,       excludeRe: null },
        { label: 'Azure ExpressRoute', ifRe: /^Po2\.293[12]$/i, excludeRe: null },
      ],
    },
    {
      hostid:   '10840',
      label:    'GOVERNO',
      hostname: 'DC1-RTE-GTW01',
      desc:     'C8200 · MINFIN · INSS · BODIVA',
      icon:     '🏛️',
      hasIpSla: false,
      sections: [
        { label: 'Circuitos institucionais', ifRe: /^(Tu20|Tu30|Tu603)$/i, excludeRe: null },
        { label: 'Circuitos institucionais', ifRe: /^Gi0\/0\/1\.802$/i,    excludeRe: null, merge: true },
      ],
    },
    {
      hostid:   '11001',
      label:    'PARCEIROS',
      hostname: 'DC1-RTE-PARC',
      desc:     'ISR4451 · BNA/MJDH/Seguros/UCALL + Voz CUBE',
      icon:     '🤝',
      hasIpSla: false,
      sections: [
        { label: 'Circuitos de parceiros', ifRe: /^Po2\.\d+$/i,       excludeRe: null },
        { label: 'Troncos de voz',         ifRe: /^VoiceOverIpPeer/i, excludeRe: null },
      ],
    },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function rcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  })
}

function rcParseItem(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return {
    ifname: m[1].trim(),
    desc:   (m[2] || '').replace(/^\*+|\*+$/g,'').trim(),
  }
}

function rcDot(up) {
  var T   = window.BPC.THEME
  var col = up ? T.colorOk : T.colorCrit
  var pulse = !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
    + 'background:' + col + ';flex-shrink:0;' + pulse + '"></span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function rcFetch(rpc) {
  var hids = CFG_RCARDS.hosts.map(function(h) { return h.hostid })
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      search:  { key_: 'icmpping' },
      filter:  { status: 0, key_: 'icmpping' },
      output:  ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hids,
      search:  { key_: 'net.if.status' },
      filter:  { status: 0 },
      output:  ['hostid', 'name', 'key_', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: ['10838'],
      search:  { key_: 'rttMonCtrlAdminSense' },
      filter:  { status: 0 },
      output:  ['key_', 'lastvalue'],
    }),
  ]).then(function(r) { return { icmp: r[0], ifaces: r[1], ipsla: r[2] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function rcCompute(data) {
  var ipslaOk = 0, ipslaTotal = 0
  data.ipsla.forEach(function(i) {
    ipslaTotal++
    if (i.lastvalue === '1') ipslaOk++
  })

  return CFG_RCARDS.hosts.map(function(hcfg) {
    var icmpItem = data.icmp.filter(function(i) { return i.hostid === hcfg.hostid })[0]
    var icmpUp   = icmpItem ? icmpItem.lastvalue === '1' : null

    var sectionsRaw = []
    hcfg.sections.forEach(function(sec) {
      var ifaces = []
      data.ifaces.forEach(function(it) {
        if (it.hostid !== hcfg.hostid) return
        var p = rcParseItem(it.name)
        if (!p) return
        if (!sec.ifRe.test(p.ifname)) return
        if (sec.excludeRe && sec.excludeRe.test(p.ifname)) return
        ifaces.push({ ifname: p.ifname, label: p.desc || p.ifname, up: it.lastvalue === '1' })
      })
      if (sec.merge && sectionsRaw.length && sectionsRaw[sectionsRaw.length - 1].label === sec.label) {
        sectionsRaw[sectionsRaw.length - 1].ifaces = sectionsRaw[sectionsRaw.length - 1].ifaces.concat(ifaces)
        return
      }
      sectionsRaw.push({ label: sec.label, ifaces: ifaces })
    })

    var sections = sectionsRaw.map(function(s) {
      s.ifaces.sort(function(a, b) { return a.ifname < b.ifname ? -1 : 1 })
      return { label: s.label, ifaces: s.ifaces, downCount: s.ifaces.filter(function(i) { return !i.up }).length }
    }).filter(function(s) { return s.ifaces.length > 0 })

    var totalDown = sections.reduce(function(a, s) { return a + s.downCount }, 0)
    var ipsla     = hcfg.hasIpSla ? { ok: ipslaOk, total: ipslaTotal } : null
    var worst     = icmpUp === false ? 'down' : totalDown > 0 ? 'warn' : icmpUp === null ? 'warn' : 'ok'

    return { cfg: hcfg, icmpUp: icmpUp, sections: sections, totalDown: totalDown, ipsla: ipsla, worst: worst }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function rcRenderCircuits(sections) {
  if (!sections.length) {
    return '<div style="font-size:14px;color:#8891A8;padding:4px 0">Sem ligações identificadas</div>'
  }
  return sections.map(function(sec) {
    var total = sec.ifaces.length
    var down  = sec.downCount
    var up    = total - down
    var col   = down > 0 ? '#f85149' : '#22C55E'

    var summaryRow = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
      + '<span style="font-size:14px;color:#B8C0D4">' + rcEsc(sec.label) + '</span>'
      + '<span style="font-size:18px;font-weight:700;color:' + col + '">' + up + '/' + total + ' UP</span>'
      + '</div>'

    var downRows = ''
    if (down > 0) {
      downRows = sec.ifaces.filter(function(i) { return !i.up }).map(function(iface) {
        var lbl = iface.label || iface.ifname
        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;'
          + 'background:rgba(248,81,73,0.10);border-radius:4px;margin-bottom:4px">'
          + rcDot(false)
          + '<span style="font-size:14px;color:#f85149;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + rcEsc(iface.ifname) + '">'
          + rcEsc(lbl) + ' — DOWN</span>'
          + '</div>'
      }).join('')
    }

    return '<div style="margin-bottom:8px">' + summaryRow + downRows + '</div>'
  }).join('')
}

function rcRenderCard(host) {
  var S       = window.BPC_SHARED
  var stateCol = { ok: '#22C55E', warn: '#d29922', crit: '#f85149', down: '#f85149' }[host.worst] || '#8891A8'
  var pillLbl  = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }[host.worst] || '—'
  var pillBg   = { ok: 'rgba(34,197,94,0.15)', warn: 'rgba(210,153,34,0.15)', crit: 'rgba(248,81,73,0.18)', down: 'rgba(248,81,73,0.18)' }[host.worst] || 'rgba(136,145,168,0.15)'

  var icmpBadge = host.icmpUp === null
    ? '<span style="font-size:15px;color:#8891A8">ICMP n/d</span>'
    : host.icmpUp
      ? '<span style="font-size:15px;color:#22C55E;font-weight:600">ICMP UP</span>'
      : '<span style="font-size:15px;color:#f85149;font-weight:700">ICMP DOWN</span>'

  var ipslaLine = ''
  if (host.ipsla) {
    var slaCol = host.ipsla.ok === host.ipsla.total ? '#22C55E' : '#d29922'
    ipslaLine = ' &nbsp;·&nbsp; <span style="font-size:15px;color:' + slaCol + ';font-weight:600">SLA ' + host.ipsla.ok + '/' + host.ipsla.total + ' OK</span>'
  }

  var n4Href = CFG_RCARDS.n4DashUid
    ? '/d/' + CFG_RCARDS.n4DashUid + '?var-routerName=' + encodeURIComponent(host.cfg.hostname)
    : null

  var footer = n4Href
    ? '<a href="' + n4Href + '" style="font-size:14px;color:#00B4D8;font-weight:600;text-decoration:none">Ver ficha (N4) →</a>'
    : '<span style="font-size:14px;color:#8891A8">Ver ficha (N4) →</span>'

  var inner = '<div style="background:rgba(14,20,60,0.6);border:1px solid rgba(255,255,255,0.08);'
    + 'border-left:5px solid ' + stateCol + ';border-radius:8px;padding:16px;height:100%;'
    + 'display:flex;flex-direction:column;' + (n4Href ? 'cursor:pointer' : '') + '">'

    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
    +   '<div>'
    +     '<div style="font-size:19px;font-weight:700;color:#E6EDF3">' + S.esc(host.cfg.label) + '</div>'
    +     '<div style="font-size:13px;color:#8891A8;font-family:monospace;margin-top:2px">' + S.esc(host.cfg.hostname) + '</div>'
    +   '</div>'
    +   '<span style="background:' + pillBg + ';color:' + stateCol + ';font-size:14px;font-weight:700;padding:4px 10px;border-radius:4px;white-space:nowrap">' + pillLbl + '</span>'
    + '</div>'

    + '<div style="padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:10px">'
    +   icmpBadge + ipslaLine
    + '</div>'

    + '<div style="flex:1">'
    +   rcRenderCircuits(host.sections)
    + '</div>'

    + '<div style="margin-top:10px;text-align:right">'
    +   footer
    + '</div>'

    + '</div>'

  return n4Href
    ? '<a href="' + n4Href + '" style="text-decoration:none;display:block;height:100%">' + inner + '</a>'
    : '<div style="height:100%">' + inner + '</div>'
}

function rcRender(el, model) {
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;height:100%;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + model.map(function(host) { return '<div>' + rcRenderCard(host) + '</div>' }).join('')
    + '</div>'
}

function rcRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Borda DC — Routers: ' + rcEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function rcLoad(rpc) {
  var el = document.getElementById(CFG_RCARDS.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function() { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  rcFetch(rpc)
    .then(function(data) { rcRender(el, rcCompute(data)) })
    .catch(function(err)  { rcRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { rcLoad(rpc) }, CFG_RCARDS.refreshMs)
}

function rcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(rcLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-bdc-routers-cards: waitForBPC nunca disponivel'); return }
  setTimeout(function() { rcInitWithRetry(attempt + 1) }, 100)
}

rcInitWithRetry()
