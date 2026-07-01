// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · WAN — SERVIÇOS · 5 CARDS  v2.0                         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 cards em grid horizontal (1 por router/serviço):                     ║
// ║   INTERNET (10838) · EMIS (10839) · AGÊNCIAS (10996)                   ║
// ║   PARCEIROS (11001) · AZURE/GOV (10840)                                 ║
// ║  Cada card: estado ICMP · lista de circuitos/tunnels · link → N4        ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_WCARDS = {
  elementId: 'bpc-n3wan-cards',
  refreshMs:  60000,
  maxAgeSec:  600,

  // N4 ficha técnica por router (dropdown fixo aos 5 routers WAN de borda)
  n4DashUid:  'rede-n4-wan-router',

  hosts: [
    {
      hostid:   '10838',
      label:    'INTERNET',
      name:     'WAN-INT',
      hostname: 'DC1-RTE-WAN-INT',   // nome real no Zabbix Network
      desc:     'ISR4451 · ITA · AT · MSTELCOM',
      icon:     '🌐',
      hasIpSla: true,
      sections: [
        { label: 'BGP Peers',    ifRe: /BGP_PEER/i,      excludeRe: null },
        { label: 'Interfaces',   ifRe: /^Po2\.\d/i,      excludeRe: /BGP_PEER/i },
      ],
    },
    {
      hostid:   '10839',
      label:    'EMIS',
      name:     'WAN-EMIS',
      hostname: 'DC1-RTE-WAN-EMIS',
      desc:     'ISR4451 · ATELECOM · MSTELECOM · UNITEL',
      icon:     '🏦',
      hasIpSla: false,
      sections: [
        { label: 'Circuitos',    ifRe: /^Po/i,            excludeRe: null },
      ],
    },
    {
      hostid:   '10996',
      label:    'AGÊNCIAS',
      name:     'WAN-AG',
      hostname: 'DC1-RTE-WAN-AG',
      desc:     'C8500L · DMVPN hub · Azure ER',
      icon:     '🏢',
      hasIpSla: false,
      sections: [
        { label: 'DMVPN carriers', ifRe: /^Tu1\d\d$/i,       excludeRe: null },
        { label: 'Azure ER',       ifRe: /^Po2\.293[12]$/i,   excludeRe: null },
        { label: 'P2P carriers',   ifRe: /^Po2\.\d/i,         excludeRe: /^Po2\.293[12]$/i },
      ],
    },
    {
      hostid:   '11001',
      label:    'PARCEIROS',
      name:     'PARC',
      hostname: 'DC1-RTE-PARC',
      desc:     'ISR4451 · BNA · MINFIN · INSS · Connectis · Voz',
      icon:     '🤝',
      hasIpSla: false,
      sections: [
        { label: 'Sub-interfaces',     ifRe: /^Po/i,            excludeRe: null },
        { label: 'Outros',             ifRe: /^(Gi|Se|Tu)\d/i,  excludeRe: null },
      ],
    },
    {
      hostid:   '10840',
      label:    'AZURE/GOV',
      name:     'GTW01',
      hostname: 'DC1-RTE-GTW01',
      desc:     'C8200 · ExpressRoute · MINFIN · BODIVA',
      icon:     '☁',
      hasIpSla: false,
      sections: [
        { label: 'Sub-interfaces', ifRe: /^Gi0\/0\/1/i,   excludeRe: null },
        { label: 'Tunnels GRE',    ifRe: /^Tu\d/i,         excludeRe: null },
        { label: 'FW-Parc',        ifRe: /^Gi0\/0\/0\./i,  excludeRe: null },
      ],
    },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function wcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  })
}

// Parseia o item name do Zabbix:
//   "Interface Po2.65(BGP_PEER_ITA): Operational status"
//   → { ifname: "Po2.65", desc: "BGP_PEER_ITA" }
// Testa secções contra ifname E desc para máxima flexibilidade.
function wcParseItem(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return {
    ifname: m[1].trim(),
    desc:   (m[2] || '').replace(/^\*+|\*+$/g,'').trim(),
  }
}

function wcDot(up) {
  var T   = window.BPC.THEME
  var col = up ? T.colorOk : T.colorCrit
  var pulse = !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
    + 'background:' + col + ';flex-shrink:0;' + pulse + '"></span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function wcFetch(rpc) {
  var hids = CFG_WCARDS.hosts.map(function(h) { return h.hostid })
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

function wcCompute(data) {
  // IP SLA: sense 1=OK
  var ipslaOk = 0, ipslaTotal = 0
  data.ipsla.forEach(function(i) {
    ipslaTotal++
    if (i.lastvalue === '1') ipslaOk++
  })

  return CFG_WCARDS.hosts.map(function(hcfg) {
    // ICMP — valor directo do Zabbix, sem check de stale
    var icmpItem = data.icmp.filter(function(i) { return i.hostid === hcfg.hostid })[0]
    var icmpUp   = icmpItem ? icmpItem.lastvalue === '1' : null  // null = sem dados

    // Secções de interfaces — parsear do name (key_ usa índice SNMP numérico)
    var sections = hcfg.sections.map(function(sec) {
      var ifaces = []
      data.ifaces.forEach(function(it) {
        if (it.hostid !== hcfg.hostid) return
        var p = wcParseItem(it.name)
        if (!p) return
        // testar regex contra ifname E desc (BGP_PEER está no desc; Po2.x no ifname)
        var match = p.ifname + ' ' + p.desc
        if (!sec.ifRe.test(match)) return
        if (sec.excludeRe && sec.excludeRe.test(match)) return
        ifaces.push({
          ifname: p.ifname,
          label:  p.desc || p.ifname,
          up:     it.lastvalue === '1',
        })
      })
      ifaces.sort(function(a, b) { return a.ifname < b.ifname ? -1 : 1 })
      return {
        label:     sec.label,
        ifaces:    ifaces,
        downCount: ifaces.filter(function(i) { return !i.up }).length,
      }
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

function wcRenderCircuits(sections) {
  if (!sections.length) {
    return '<div style="font-size:.82rem;color:var(--bpc-mute);padding:4px 0">Sem interfaces nomeadas</div>'
  }
  return sections.map(function(sec) {
    var total  = sec.ifaces.length
    var down   = sec.downCount
    var up     = total - down

    // Linha de sumário: label + contagem
    var upPart  = '<span style="color:var(--bpc-ok);font-weight:600">' + up + ' UP</span>'
    var parts   = [upPart]
    if (down > 0) parts.push('<span style="color:var(--bpc-crit);font-weight:700">' + down + ' DOWN</span>')
    var summary = parts.join(' <span style="color:rgba(255,255,255,0.2)">·</span> ')

    var header = '<div style="display:flex;justify-content:space-between;align-items:center;'
      + 'padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:4px">'
      + '<span style="font-size:.73rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;'
      + 'color:rgba(255,255,255,0.35)">' + wcEsc(sec.label) + ' <span style="color:rgba(255,255,255,0.2);font-weight:400">(' + total + ')</span></span>'
      + '<span style="font-size:.78rem">' + summary + '</span>'
      + '</div>'

    // Listar APENAS os DOWN (não todos)
    var downRows = ''
    if (down > 0) {
      downRows = sec.ifaces.filter(function(i) { return !i.up }).map(function(iface) {
        var lbl = iface.desc ? iface.desc.replace(/^\*+|\*+$/g,'').trim() : iface.ifname
        return '<div style="display:flex;align-items:center;gap:5px;padding:2px 4px;'
          + 'background:rgba(248,81,73,0.08);border-radius:4px;margin-bottom:2px">'
          + wcDot(false)
          + '<span style="font-size:.78rem;color:var(--bpc-crit);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + wcEsc(iface.ifname) + '">'
          + wcEsc(lbl) + '</span>'
          + '</div>'
      }).join('')
    }

    return '<div style="margin-bottom:8px">' + header + downRows + '</div>'
  }).join('')
}

function wcRenderCard(host) {
  var S       = window.BPC_SHARED
  var T       = window.BPC.THEME
  var accent  = window.BPC.state.color(host.worst)
  var cardSt  = host.worst === 'down' ? 'down' : host.worst

  var pillLbl = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }[host.worst] || '—'
  var pillCls = (host.worst === 'crit' || host.worst === 'down') ? 'down' : host.worst

  // ICMP badge
  var icmpBadge = host.icmpUp === null
    ? '<span style="font-size:.78rem;color:var(--bpc-mute)">ICMP n/d</span>'
    : host.icmpUp
      ? '<span style="font-size:.78rem;color:var(--bpc-ok)">ICMP UP</span>'
      : '<span style="font-size:.78rem;color:var(--bpc-crit);font-weight:600">ICMP DOWN</span>'

  // IP SLA (só INTERNET)
  var ipslaLine = ''
  if (host.ipsla) {
    var slaCol = host.ipsla.ok === host.ipsla.total ? 'var(--bpc-ok)' : 'var(--bpc-warn)'
    ipslaLine = '<div style="font-size:.79rem;color:' + slaCol + ';margin-top:4px">'
      + 'SLA ' + host.ipsla.ok + '/' + host.ipsla.total + ' OK</div>'
  }

  // Drill-down → N4
  var n4Href = CFG_WCARDS.n4DashUid
    ? '/d/' + CFG_WCARDS.n4DashUid + '?var-routerName=' + encodeURIComponent(host.cfg.hostname)
    : null

  var footer = n4Href
    ? '<a href="' + n4Href + '" style="font-size:.85rem;color:var(--bpc-cyan);text-decoration:none">Ver ficha (N4) →</a>'
    : '<span style="font-size:.85rem;color:var(--bpc-mute);opacity:.5">Ver ficha (N4) →</span>'

  var inner = '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;gap:8px;'
    + (n4Href ? 'cursor:pointer' : '') + '">'

    // cabeçalho
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start">'
    +   '<div>'
    +     '<div style="display:flex;align-items:center;gap:6px">'
    +       '<span style="font-size:1.1rem">' + host.cfg.icon + '</span>'
    +       '<span style="font-size:1.05rem;font-weight:700;color:#E6EDF3">' + S.esc(host.cfg.label) + '</span>'
    +     '</div>'
    +     '<div style="font-size:.78rem;color:var(--bpc-mute);margin-top:1px;font-family:monospace">' + S.esc(host.cfg.hostname) + '</div>'
    +   '</div>'
    +   '<span class="bpc-pill ' + pillCls + '">' + pillLbl + '</span>'
    + '</div>'

    // ICMP + IP SLA
    + '<div style="padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.07)">'
    +   icmpBadge + ipslaLine
    +   '<div style="font-size:.76rem;color:var(--bpc-mute);margin-top:2px">' + S.esc(host.cfg.desc) + '</div>'
    + '</div>'

    // circuitos/interfaces
    + '<div style="flex:1;overflow:hidden">'
    +   wcRenderCircuits(host.sections)
    + '</div>'

    // footer drill-down
    + '<div style="margin-top:auto;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06)">'
    +   footer
    + '</div>'

    + '</div>'

  return n4Href
    ? '<a href="' + n4Href + '" style="text-decoration:none;display:block;height:100%">' + inner + '</a>'
    : '<div style="height:100%">' + inner + '</div>'
}

function wcRender(el, model) {
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + model.map(function(host) {
        return '<div>' + wcRenderCard(host) + '</div>'
      }).join('')
    + '</div>'
}

function wcRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ WAN Cards: ' + wcEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function wcLoad(rpc) {
  var el = document.getElementById(CFG_WCARDS.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function() { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  wcFetch(rpc)
    .then(function(data) { wcRender(el, wcCompute(data)) })
    .catch(function(err)  { wcRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { wcLoad(rpc) }, CFG_WCARDS.refreshMs)
}

function wcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(wcLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-cards: waitForBPC nunca disponivel'); return }
  setTimeout(function() { wcInitWithRetry(attempt + 1) }, 100)
}

wcInitWithRetry()
