// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC · SAÚDE DOS LINKS WAN  v1.0                  ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 routers WAN · ~60 interfaces · ICMP + net.if.status                 ║
// ║                                                                          ║
// ║  Secções:                                                                ║
// ║   • WAN-INT  — BGP peers ITA / AT / MSTELCOM                            ║
// ║   • WAN-EMIS — circuitos ATELECOM / MSTELECOM / UNITEL                  ║
// ║   • WAN-AG   — DMVPN agências (Tu101-107) + Edifícios (Tu201-208)       ║
// ║                + Azure ExpressRoute (Po2.2931/2932)                     ║
// ║                + P2P uplinks (ITA/MULTITEL/IPWORLD/MST)                 ║
// ║   • PARC     — parceiros e operadoras de voz (17 sub-interfaces)        ║
// ║   • GTW01    — tunnels MINFIN/INSS/BODIVA + FW-Parc                    ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_WAN = {
  elementId: 'bpc-n3dc-wan',
  refreshMs:  60000,
  maxAgeSec:  600,

  hosts: [
    {
      name: 'DC1-RTE-WAN-INT',
      label: 'Internet / BGP',
      icon: '🌐',
      hostid: '10838',
      sections: [
        { label: 'BGP Peers',  ifRe: /^Po2\.\d/i, groupRe: null },
      ],
    },
    {
      name: 'DC1-RTE-WAN-EMIS',
      label: 'EMIS',
      icon: '🔗',
      hostid: '10839',
      sections: [
        { label: 'Circuitos EMIS', ifRe: /^Po2\.\d/i, groupRe: null },
      ],
    },
    {
      name: 'DC1-RTE-WAN-AG',
      label: 'Agências / Azure',
      icon: '🏢',
      hostid: '10996',
      sections: [
        { label: 'DMVPN — DC',        ifRe: /^Tu1\d\d$/i,     groupRe: null },
        { label: 'DMVPN — Edifícios', ifRe: /^Tu2\d\d$/i,     groupRe: null },
        { label: 'Azure ExpressRoute', ifRe: /^Po2\.293[12]$/i, groupRe: null },
        { label: 'P2P Carriers',       ifRe: /^Po2\.\d/i,      groupRe: /^Po2\.293[12]$/i },  // excluir Azure
      ],
    },
    {
      name: 'DC1-RTE-PARC',
      label: 'Parceiros / Voz',
      icon: '📞',
      hostid: '11001',
      sections: [
        { label: 'Sub-interfaces Po2', ifRe: /^Po2\.\d/i, groupRe: null },
      ],
    },
    {
      name: 'DC1-RTE-GTW01',
      label: 'GTW01 — Tunnels',
      icon: '🔒',
      hostid: '10840',
      sections: [
        { label: 'Gi0/0/1 (MINFIN/INSS/BODIVA)', ifRe: /^Gi0\/0\/1/i,    groupRe: null },
        { label: 'Tunnels GRE',                   ifRe: /^Tu\d/i,          groupRe: null },
        { label: 'FW-Parc',                        ifRe: /^Gi0\/0\/0\.896/i, groupRe: null },
      ],
    },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function wanEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function wanParseIf(itemName) {
  var m = /Interface\s+([^(\s]+)\(([^)]*)\)/.exec(itemName || '')
  if (!m) {
    var m2 = /Interface\s+(\S+)/.exec(itemName || '')
    return { ifname: m2 ? m2[1].trim() : '', desc: '' }
  }
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function wanIsStale(lastclock) {
  return !lastclock || (Math.floor(Date.now() / 1000) - parseInt(lastclock, 10)) > CFG_WAN.maxAgeSec
}

function wanDot(up, stale) {
  var T = window.BPC.THEME
  var c = stale ? T.colorMute : (up ? T.colorOk : T.colorCrit)
  var pulse = (!stale && !up) ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';flex-shrink:0;' + pulse + '"></span>'
}

function wanMs(sec) {
  if (sec == null || sec === '') return '—'
  var ms = parseFloat(sec) * 1000
  return ms < 1 ? (ms * 1000).toFixed(0) + ' µs' : ms.toFixed(1) + ' ms'
}

function wanLossColor(loss) {
  var v = parseFloat(loss)
  if (isNaN(v) || v === 0) return 'var(--bpc-ok)'
  if (v < 5)  return 'var(--bpc-warn)'
  return 'var(--bpc-crit)'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function wanFetch(rpc) {
  var hids = CFG_WAN.hosts.map(function (h) { return h.hostid })
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      output:  ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
      filter:  { status: 0 },
      search:  { key_: 'net.if.status' },
    }),
    rpc('item.get', {
      hostids: hids,
      output:  ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
      filter:  { status: 0, key_: ['icmpping', 'icmppingloss', 'icmppingsec'] },
    }),
  ]).then(function (res) {
    return { ifItems: res[0], icmpItems: res[1] }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function wanCompute(data) {
  var ifItems   = data.ifItems
  var icmpItems = data.icmpItems

  return CFG_WAN.hosts.map(function (hcfg) {
    // ICMP
    var icmp = {}
    icmpItems.forEach(function (it) {
      if (it.hostid !== hcfg.hostid) return
      icmp[it.key_] = { val: it.lastvalue, stale: wanIsStale(it.lastclock) }
    })

    // interfaces por secção
    var sections = hcfg.sections.map(function (sec) {
      var ifaces = []
      ifItems.forEach(function (it) {
        if (it.hostid !== hcfg.hostid) return
        var p = wanParseIf(it.name)
        if (!p.ifname) return
        if (!sec.ifRe.test(p.ifname)) return
        // excludeRe: para P2P carriers do WAN-AG excluir Azure
        if (sec.groupRe && sec.groupRe.test(p.ifname)) return
        var up    = it.lastvalue === '1'
        var stale = wanIsStale(it.lastclock)
        ifaces.push({ ifname: p.ifname, desc: p.desc, up: up, stale: stale })
      })
      ifaces.sort(function (a, b) { return a.ifname < b.ifname ? -1 : 1 })
      var downCount = ifaces.filter(function (i) { return !i.up && !i.stale }).length
      return { label: sec.label, ifaces: ifaces, downCount: downCount }
    }).filter(function (s) { return s.ifaces.length > 0 })

    var totalDown = sections.reduce(function (acc, s) { return acc + s.downCount }, 0)
    var totalIfs  = sections.reduce(function (acc, s) { return acc + s.ifaces.length }, 0)

    return {
      cfg:       hcfg,
      icmp:      icmp,
      sections:  sections,
      totalDown: totalDown,
      totalIfs:  totalIfs,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function wanRenderIcmp(icmp) {
  var ping  = icmp['icmpping']
  var loss  = icmp['icmppingloss']
  var rtt   = icmp['icmppingsec']

  var up    = ping && !ping.stale && ping.val === '1'
  var lossV = loss ? loss.val : null
  var rttV  = rtt  ? rtt.val  : null

  return '<span style="display:inline-flex;align-items:center;gap:8px;font-size:.84rem">'
    + wanDot(up, ping ? ping.stale : true)
    + (up
        ? '<span style="color:var(--bpc-ok)">alcançável</span>'
        + ' <span style="color:rgba(255,255,255,0.30)">|</span>'
        + ' <span style="color:#CDD9E5">RTT ' + wanMs(rttV) + '</span>'
        + ' <span style="color:rgba(255,255,255,0.30)">|</span>'
        + ' <span style="color:' + wanLossColor(lossV) + '">perda ' + (lossV != null ? lossV + '%' : '—') + '</span>'
        : '<span style="color:var(--bpc-crit)">sem resposta ICMP</span>')
    + '</span>'
}

function wanRenderSection(sec) {
  // compact: pills numa grelha
  var pills = sec.ifaces.map(function (iface) {
    var T   = window.BPC.THEME
    var col = iface.stale ? T.colorMute : (iface.up ? T.colorOk : T.colorCrit)
    var bg  = iface.stale ? 'rgba(255,255,255,0.04)'
            : iface.up ? 'rgba(63,185,80,0.09)' : 'rgba(248,81,73,0.12)'
    var pulse = (!iface.stale && !iface.up)
      ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
    var label = iface.desc
      ? iface.desc.replace(/^\*+|\*+$/g, '').trim()
      : iface.ifname
    return '<span title="' + wanEsc(iface.ifname + (iface.desc ? ' · ' + iface.desc : '')) + '"'
      + ' style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;'
      + 'border-radius:10px;background:' + bg + ';border:1px solid ' + col + '33;'
      + 'font-size:.82rem;color:#CDD9E5;' + pulse + '">'
      + wanDot(!iface.up ? false : true, iface.stale)
      + wanEsc(label)
      + '</span>'
  }).join('')

  return '<div style="margin-bottom:10px">'
    + '<div style="font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;'
    + 'color:rgba(255,255,255,0.35);margin-bottom:6px">'
    + wanEsc(sec.label)
    + (sec.downCount ? ' <span style="color:var(--bpc-crit)">· ' + sec.downCount + ' DOWN</span>' : '')
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:5px">' + pills + '</div>'
    + '</div>'
}

function wanRenderHost(host) {
  var icmpOk = host.icmp['icmpping'] && !host.icmp['icmpping'].stale && host.icmp['icmpping'].val === '1'
  var headerColor = (host.totalDown === 0 && icmpOk) ? 'var(--bpc-ok)'
    : host.totalDown > 0 ? 'var(--bpc-crit)' : 'var(--bpc-warn)'
  var badge = host.totalDown > 0
    ? '<span style="font-size:.82rem;padding:2px 7px;border-radius:8px;background:rgba(248,81,73,0.15);color:var(--bpc-crit)">'
      + host.totalDown + ' DOWN</span>'
    : '<span style="font-size:.82rem;padding:2px 7px;border-radius:8px;background:rgba(63,185,80,0.10);color:var(--bpc-ok)">OK</span>'

  var sectionsHtml = host.sections.map(wanRenderSection).join('')

  return '<div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.07);'
    + 'border-left:3px solid ' + headerColor + ';border-radius:8px;padding:10px 14px;margin-bottom:8px">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
    + '<span style="font-size:.96rem;font-weight:700;color:#CDD9E5">'
    + wanEsc(host.cfg.icon + ' ' + host.cfg.name)
    + '</span>'
    + '<span style="font-size:.84rem;color:rgba(255,255,255,0.40)">' + wanEsc(host.cfg.label) + '</span>'
    + badge
    + '<span style="margin-left:auto">' + wanRenderIcmp(host.icmp) + '</span>'
    + '</div>'
    + sectionsHtml
    + '</div>'
}

function wanRender(el, model) {
  var totalDown = model.reduce(function (a, h) { return a + h.totalDown }, 0)
  var headline = totalDown === 0
    ? '<span class="bpc-ok">Todos os links WAN UP</span>'
    : '<span class="bpc-crit">' + totalDown + ' link(s) WAN em baixo</span>'

  var hostsHtml = model.map(wanRenderHost).join('')

  el.innerHTML = [
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">',
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">',
    '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.08em;text-transform:uppercase">Links WAN</span>',
    '<span style="font-size:.90rem;color:var(--bpc-mute)">' + headline + '</span>',
    '</div>',
    hostsHtml,
    '</div>',
  ].join('')
}

function wanRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down">'
    + '<div class="bpc-error-msg">⚠ Links WAN: ' + wanEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function wanLoad(rpc) {
  var el = document.getElementById(CFG_WAN.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:16px;color:var(--bpc-mute);font-size:1.0rem">A carregar links WAN…</div>'
  wanFetch(rpc)
    .then(function (data) { wanRender(el, wanCompute(data)) })
    .catch(function (err) { wanRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function () { wanLoad(rpc) }, CFG_WAN.refreshMs)
}

function wanInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(wanLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-dc-wan: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { wanInitWithRetry(attempt + 1) }, 100)
}

wanInitWithRetry()
