// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN · CARDS DE LINKS  v1.0                      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 cards (1 por router WAN) com estado em tempo real:                  ║
// ║   • WAN-INT  — BGP peers ITA/AT/MSTELCOM + IP SLA por probe            ║
// ║   • WAN-EMIS — circuitos ATELECOM/MSTELECOM/UNITEL                     ║
// ║   • WAN-AG   — DMVPN agências+edifícios + Azure ER + P2P carriers      ║
// ║   • PARC     — parceiros e operadoras de voz (17 sub-interfaces)        ║
// ║   • GTW01    — tunnels MINFIN/INSS/BODIVA + FW-Parc                    ║
// ║                                                                          ║
// ║  Dados: net.if.status + icmpping/loss/sec + rttMonCtrlAdmin*           ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_WAN = {
  elementId: 'bpc-n3wan-cards',
  refreshMs:  60000,
  maxAgeSec:  600,

  // IP SLA sense: 1=OK, 2=disconnected, 3=overThreshold, 4=timeout, 5=busy, 6=notConnected
  iplsaSenseLabel: { '1':'OK', '2':'desligado', '3':'acima threshold', '4':'timeout', '5':'ocupado', '6':'sem ligação' },

  hosts: [
    {
      name:   'DC1-RTE-WAN-INT',
      hostid: '10838',
      label:  'Internet / BGP',
      desc:   'ISR4451 · ITA · AT · MSTELCOM',
      hasIpSla: true,
      sections: [
        { label: 'BGP Peers', ifRe: /^Po2\.\d/i, excludeRe: null },
      ],
    },
    {
      name:   'DC1-RTE-WAN-EMIS',
      hostid: '10839',
      label:  'EMIS',
      desc:   'ISR4451 · ATELECOM · MSTELECOM · UNITEL',
      hasIpSla: false,
      sections: [
        { label: 'Circuitos EMIS', ifRe: /^Po2\.\d/i, excludeRe: null },
      ],
    },
    {
      name:   'DC1-RTE-WAN-AG',
      hostid: '10996',
      label:  'Agências / Azure',
      desc:   'C8500L · DMVPN DC + Edifícios + Azure ER + P2P',
      hasIpSla: false,
      sections: [
        { label: 'DMVPN — DC',         ifRe: /^Tu1\d\d$/i,       excludeRe: null },
        { label: 'DMVPN — Edifícios',  ifRe: /^Tu2\d\d$/i,       excludeRe: null },
        { label: 'Azure ExpressRoute', ifRe: /^Po2\.293[12]$/i,   excludeRe: null },
        { label: 'P2P Carriers',       ifRe: /^Po2\.\d/i,         excludeRe: /^Po2\.293[12]$/i },
      ],
    },
    {
      name:   'DC1-RTE-PARC',
      hostid: '11001',
      label:  'Parceiros / Voz',
      desc:   'ISR4451 · CUBE · Unitel · AT · Multitel · Connectis',
      hasIpSla: false,
      sections: [
        { label: 'Sub-interfaces Po2', ifRe: /^Po2\.\d/i, excludeRe: null },
      ],
    },
    {
      name:   'DC1-RTE-GTW01',
      hostid: '10840',
      label:  'GTW01 — Tunnels',
      desc:   'C8200 · MINFIN · INSS · BODIVA · FW-Parc · Po1 DOWN',
      hasIpSla: false,
      sections: [
        { label: 'Gi0/0/1 sub-interfaces', ifRe: /^Gi0\/0\/1/i,     excludeRe: null },
        { label: 'Tunnels GRE',            ifRe: /^Tu\d/i,           excludeRe: null },
        { label: 'FW-Parc',               ifRe: /^Gi0\/0\/0\.896/i,  excludeRe: null },
      ],
    },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function wEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
  })
}

function wParseIf(name) {
  var m = /Interface\s+([^(\s]+)\(([^)]*)\)/.exec(name || '')
  if (!m) { var m2 = /Interface\s+(\S+)/.exec(name||''); return {ifname:m2?m2[1].trim():'',desc:''} }
  return {ifname:m[1].trim(), desc:(m[2]||'').trim()}
}

function wStale(clock) {
  return !clock || (Math.floor(Date.now()/1000) - parseInt(clock,10)) > CFG_WAN.maxAgeSec
}

function wDot(up, stale, size) {
  var T = window.BPC.THEME
  var c = stale ? T.colorMute : (up ? T.colorOk : T.colorCrit)
  var pulse = !stale && !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  var sz = size || 9
  return '<span style="display:inline-block;width:'+sz+'px;height:'+sz+'px;border-radius:50%;'
    + 'background:'+c+';flex-shrink:0;'+pulse+'"></span>'
}

function wMs(sec) {
  if (sec == null || sec === '') return '—'
  var ms = parseFloat(sec) * 1000
  return ms < 1 ? (ms*1000).toFixed(0)+' µs' : ms.toFixed(1)+' ms'
}

function wLossColor(loss) {
  var v = parseFloat(loss)
  if (isNaN(v) || v===0) return 'var(--bpc-ok)'
  return v < 5 ? 'var(--bpc-warn)' : 'var(--bpc-crit)'
}

function wIpSlaColor(sense) {
  return sense === '1' ? 'var(--bpc-ok)' : 'var(--bpc-crit)'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function wFetch(rpc) {
  var hids = CFG_WAN.hosts.map(function(h){return h.hostid})
  return Promise.all([
    rpc('item.get', {
      hostids: hids, output: ['hostid','name','key_','lastvalue','lastclock'],
      filter: {status:0}, search: {key_:'net.if.status'},
    }),
    rpc('item.get', {
      hostids: hids, output: ['hostid','name','key_','lastvalue','lastclock'],
      filter: {status:0, key_:['icmpping','icmppingloss','icmppingsec']},
    }),
    rpc('item.get', {
      hostids: ['10838'],  // só WAN-INT tem IP SLA
      output: ['hostid','name','key_','lastvalue','lastclock'],
      filter: {status:0},
      search: {key_:'rttMonCtrlAdmin'},
    }),
  ]).then(function(res){ return {ifItems:res[0], icmpItems:res[1], ipslaItems:res[2]} })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function wCompute(data) {
  var ifItems   = data.ifItems
  var icmpItems = data.icmpItems
  var ipslaItems = data.ipslaItems

  // Montar mapa IP SLA por índice: index → {sense, completionTime, threshold, status}
  var ipslaByIdx = {}
  ipslaItems.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_)
    if (!m) return
    var field = m[1], idx = m[2]
    if (!ipslaByIdx[idx]) ipslaByIdx[idx] = {}
    ipslaByIdx[idx][field] = {val: it.lastvalue, stale: wStale(it.lastclock)}
  })

  return CFG_WAN.hosts.map(function(hcfg) {
    // ICMP
    var icmp = {}
    icmpItems.forEach(function(it){ if(it.hostid===hcfg.hostid) icmp[it.key_]={val:it.lastvalue,stale:wStale(it.lastclock)} })

    // Secções de interfaces
    var sections = hcfg.sections.map(function(sec) {
      var ifaces = []
      ifItems.forEach(function(it) {
        if (it.hostid !== hcfg.hostid) return
        var p = wParseIf(it.name)
        if (!p.ifname || !sec.ifRe.test(p.ifname)) return
        if (sec.excludeRe && sec.excludeRe.test(p.ifname)) return
        ifaces.push({ifname:p.ifname, desc:p.desc, up:it.lastvalue==='1', stale:wStale(it.lastclock)})
      })
      ifaces.sort(function(a,b){return a.ifname<b.ifname?-1:1})
      return {label:sec.label, ifaces:ifaces, downCount:ifaces.filter(function(i){return !i.up&&!i.stale}).length}
    }).filter(function(s){return s.ifaces.length>0})

    // IP SLA (só WAN-INT)
    var ipsla = hcfg.hasIpSla ? ipslaByIdx : null

    var totalDown = sections.reduce(function(a,s){return a+s.downCount},0)
    return {cfg:hcfg, icmp:icmp, sections:sections, ipsla:ipsla, totalDown:totalDown}
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function wRenderIcmp(icmp) {
  var ping = icmp['icmpping'], loss = icmp['icmppingloss'], rtt = icmp['icmppingsec']
  var up   = ping && !ping.stale && ping.val==='1'
  return '<span style="display:inline-flex;align-items:center;gap:7px;font-size:.83rem">'
    + wDot(up, ping?ping.stale:true, 8)
    + (up
        ? '<span style="color:var(--bpc-ok)">UP</span>'
        + ' <span style="color:rgba(255,255,255,0.25)">·</span>'
        + ' RTT <span style="color:#CDD9E5">'+wMs(rtt?rtt.val:null)+'</span>'
        + ' <span style="color:rgba(255,255,255,0.25)">·</span>'
        + ' perda <span style="color:'+wLossColor(loss?loss.val:null)+'">'+((loss&&loss.val!=null)?loss.val+'%':'—')+'</span>'
        : '<span style="color:var(--bpc-crit)">SEM RESPOSTA ICMP</span>')
    + '</span>'
}

function wRenderIpSla(ipslaByIdx) {
  if (!ipslaByIdx || !Object.keys(ipslaByIdx).length) return ''
  var rows = Object.keys(ipslaByIdx).sort().map(function(idx) {
    var d = ipslaByIdx[idx]
    var sense = d['Sense'] ? d['Sense'].val : null
    var rtt   = d['CompletionTime'] ? d['CompletionTime'].val : null
    var thr   = d['Threshold'] ? d['Threshold'].val : null
    var stale = d['Sense'] ? d['Sense'].stale : true
    var label = CFG_WAN.iplsaSenseLabel[sense] || ('sense='+sense)
    var col   = stale ? 'var(--bpc-mute)' : wIpSlaColor(sense)
    return '<tr style="border-top:1px solid rgba(255,255,255,0.04)">'
      + '<td style="padding:3px 8px;font-size:.82rem;color:rgba(255,255,255,0.50)">SLA #'+wEsc(idx)+'</td>'
      + '<td style="padding:3px 8px">'+wDot(sense==='1',stale,8)+'</td>'
      + '<td style="padding:3px 8px;font-size:.82rem;color:'+col+'">'+wEsc(label)+'</td>'
      + '<td style="padding:3px 8px;font-size:.82rem;color:#CDD9E5">'+(rtt?rtt+' ms':'—')+'</td>'
      + '<td style="padding:3px 8px;font-size:.80rem;color:rgba(255,255,255,0.30)">thr '+(thr?thr+' ms':'—')+'</td>'
      + '</tr>'
  }).join('')
  return '<div style="margin-top:8px">'
    + '<div style="font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,0.30);margin-bottom:4px">IP SLA</div>'
    + '<table style="border-collapse:collapse"><tbody>'+rows+'</tbody></table>'
    + '</div>'
}

function wRenderSection(sec) {
  var pills = sec.ifaces.map(function(iface) {
    var T   = window.BPC.THEME
    var col = iface.stale?T.colorMute:(iface.up?T.colorOk:T.colorCrit)
    var bg  = iface.stale?'rgba(255,255,255,0.04)':(iface.up?'rgba(63,185,80,0.09)':'rgba(248,81,73,0.12)')
    var pulse = !iface.stale&&!iface.up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;':''
    var lbl = iface.desc ? iface.desc.replace(/^\*+|\*+$/g,'').trim() : iface.ifname
    return '<span title="'+wEsc(iface.ifname+(iface.desc?' · '+iface.desc:''))+'"'
      +' style="display:inline-flex;align-items:center;gap:4px;padding:3px 7px;'
      +'border-radius:10px;background:'+bg+';border:1px solid '+col+'33;'
      +'font-size:.80rem;color:#CDD9E5;'+pulse+'white-space:nowrap">'
      +wDot(iface.up,iface.stale,7)+wEsc(lbl)+'</span>'
  }).join('')

  return '<div style="margin-bottom:8px">'
    + '<div style="font-size:.75rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;'
    + 'color:rgba(255,255,255,0.30);margin-bottom:5px">'+wEsc(sec.label)
    + (sec.downCount?' <span style="color:var(--bpc-crit)">· '+sec.downCount+' DOWN</span>':'')+'</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:4px">'+pills+'</div>'
    + '</div>'
}

function wRenderCard(host) {
  var T = window.BPC.THEME
  var pingOk  = host.icmp['icmpping']&&!host.icmp['icmpping'].stale&&host.icmp['icmpping'].val==='1'
  var hasDown = host.totalDown > 0
  var accentColor = hasDown ? T.colorCrit : (!pingOk ? T.colorWarn : T.colorOk)

  var badge = hasDown
    ? '<span style="font-size:.79rem;padding:2px 7px;border-radius:8px;background:rgba(248,81,73,0.15);color:var(--bpc-crit);font-weight:600">'+host.totalDown+' DOWN</span>'
    : '<span style="font-size:.79rem;padding:2px 7px;border-radius:8px;background:rgba(63,185,80,0.10);color:var(--bpc-ok)">OK</span>'

  var totalIfs  = host.sections.reduce(function(a,s){return a+s.ifaces.length},0)
  var downIfs   = host.totalDown
  var ifSummary = '<span style="font-size:.80rem;color:rgba(255,255,255,0.35)">'+
    (totalIfs-downIfs)+'/'+totalIfs+' interfaces UP</span>'

  return '<div style="background:rgba(14,20,60,0.45);border:1px solid rgba(255,255,255,0.07);'
    + 'border-left:3px solid '+accentColor+';border-radius:8px;padding:12px 16px;margin-bottom:10px">'

    // ── cabeçalho do card ──
    + '<div style="display:flex;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
    + '<div style="flex:1;min-width:0">'
    + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
    + '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5">'+wEsc(host.cfg.name)+'</span>'
    + badge
    + ifSummary
    + '</div>'
    + '<div style="font-size:.83rem;color:rgba(255,255,255,0.40);margin-top:2px">'+wEsc(host.cfg.desc)+'</div>'
    + '</div>'
    + '<div style="text-align:right">'+wRenderIcmp(host.icmp)+'</div>'
    + '</div>'

    // ── secções de interfaces ──
    + host.sections.map(wRenderSection).join('')

    // ── IP SLA (só WAN-INT) ──
    + (host.ipsla ? wRenderIpSla(host.ipsla) : '')

    + '</div>'
}

function wRender(el, model) {
  var totalDown = model.reduce(function(a,h){return a+h.totalDown},0)
  var headline  = totalDown===0
    ? '<span class="bpc-ok">Todos os links WAN operacionais</span>'
    : '<span class="bpc-crit">'+totalDown+' link(s) WAN em baixo</span>'

  // resumo rápido (barra de 5 dots)
  var dots = model.map(function(h) {
    var T = window.BPC.THEME
    var pingOk = h.icmp['icmpping']&&!h.icmp['icmpping'].stale&&h.icmp['icmpping'].val==='1'
    var col = h.totalDown>0 ? T.colorCrit : (!pingOk ? T.colorWarn : T.colorOk)
    return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;'
      +'border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid '+col+'44">'
      +wDot(h.totalDown===0&&pingOk,false,8)
      +'<span style="font-size:.80rem;color:#CDD9E5">'+wEsc(h.cfg.label)+'</span>'
      +'</span>'
  }).join('')

  el.innerHTML = [
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">',

    // título + headline
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">',
    '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.08em;text-transform:uppercase">Links WAN</span>',
    '<span style="font-size:.90rem;color:var(--bpc-mute)">'+headline+'</span>',
    '</div>',

    // barra de estado rápida
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">'+dots+'</div>',

    // cards
    model.map(wRenderCard).join(''),

    '</div>',
  ].join('')
}

function wRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Links WAN: '+wEsc(msg)+'</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function wLoad(rpc) {
  var el = document.getElementById(CFG_WAN.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:16px;color:var(--bpc-mute)">A carregar links WAN…</div>'
  wFetch(rpc)
    .then(function(data){ wRender(el, wCompute(data)) })
    .catch(function(err){ wRenderError(el, err.message||String(err)) })
  window.BPC.utils.startRefresh(el, function(){wLoad(rpc)}, CFG_WAN.refreshMs)
}

function wInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(wLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-cards: waitForBPC nunca disponivel'); return }
  setTimeout(function(){wInitWithRetry(attempt+1)}, 100)
}

wInitWithRetry()
