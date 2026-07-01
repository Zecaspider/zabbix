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
// ║  2026-07-01 (revisão pós-N4/N5): linha "SLA X/5 OK" removida do card    ║
// ║  WAN-INT — Z.13 confirmou que só a sonda 65 tem alvo verificado (as     ║
// ║  outras 4 nunca tiveram destino confirmado), e a sonda 65 está morta há ║
// ║  ~7 meses. Mostrar a média das 5 diluía a única falha real numa         ║
// ║  aparência de "4/5 OK" — mesma decisão já tomada no N4 Router.          ║
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
      sections: [
        { label: 'Circuitos EMIS', ifRe: /^Po2\.(110|835|1158)$/i, excludeRe: null },
      ],
    },
    {
      hostid:   '10996',
      label:    'AGÊNCIAS/EDIFÍCIOS/AZURE',
      hostname: 'DC1-RTE-WAN-AG',
      desc:     'C8500L · 3 funções: hub Agências + hub Edifícios + Azure ER',
      icon:     '🏢',
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
  ]).then(function(r) { return { icmp: r[0], ifaces: r[1] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function rcCompute(data) {
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
    var worst     = icmpUp === false ? 'down' : totalDown > 0 ? 'warn' : icmpUp === null ? 'warn' : 'ok'

    return { cfg: hcfg, icmpUp: icmpUp, sections: sections, totalDown: totalDown, worst: worst }
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

    // Rótulo em cima, contagem por baixo — mais robusto do que lado-a-lado
    // em colunas estreitas (5 cards lado a lado), onde rótulo+número a par
    // colidia e quebrava mal.
    var summaryRow = '<div style="margin-bottom:8px">'
      + '<div style="font-size:13px;color:#B8C0D4;line-height:1.3">' + rcEsc(sec.label) + '</div>'
      + '<div style="font-size:18px;font-weight:700;color:' + col + '">' + up + '/' + total + ' UP</div>'
      + '</div>'

    var downRows = ''
    if (down > 0) {
      var rows = sec.ifaces.filter(function(i) { return !i.up }).map(function(iface) {
        var lbl = iface.label || iface.ifname
        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;'
          + 'background:rgba(248,81,73,0.10);border-radius:4px;margin-bottom:4px">'
          + rcDot(false)
          + '<span style="font-size:14px;color:#f85149;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + rcEsc(iface.ifname) + '">'
          + rcEsc(lbl) + ' — DOWN</span>'
          + '</div>'
      }).join('')
      // Tecto de altura + scroll interno — protege o layout do painel se muitos
      // circuitos caírem em simultâneo num card (nunca corta informação de falha).
      downRows = down > 5 ? '<div style="max-height:140px;overflow-y:auto">' + rows + '</div>' : rows
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

  var n4Href = CFG_RCARDS.n4DashUid
    ? '/d/' + CFG_RCARDS.n4DashUid + '?var-routerName=' + encodeURIComponent(host.cfg.hostname)
    : null

  // Nota: o card inteiro já é um <a> (ver tag/hrefAttr abaixo) — o rodapé é
  // só texto estilizado, nunca outro <a> aninhado (HTML inválido; o browser
  // "corrige" sozinho partindo a estrutura, o que causava uma caixa vazia
  // a aparecer no meio do card).
  var footer = '<span style="font-size:14px;color:' + (n4Href ? '#00B4D8' : '#8891A8') + ';font-weight:600">Ver detalhes do router →</span>'

  // O próprio elemento raiz (link ou div) É o item flex da fila de 5 cards —
  // sem nenhum wrapper extra por cima. Isto deixa o align-items:stretch do
  // flexbox esticar directamente esta caixa visível (com a borda/fundo) até
  // à altura do card mais alto, sem cadeia de height:100% (essa cadeia foi
  // a causa do bug anterior: media o conteúdo como ~625px e criava scroll
  // interno no painel). display:flex + flex-direction:column aqui dentro
  // distribui header/estado/circuitos/rodapé ao longo de toda essa altura
  // esticada (o rodapé usa margin-top:auto para ficar sempre no fundo).
  var tag = n4Href ? 'a' : 'div'
  var hrefAttr = n4Href ? ' href="' + n4Href + '"' : ''

  return '<' + tag + hrefAttr + ' style="text-decoration:none;background:rgba(14,20,60,0.6);'
    + 'border:1px solid rgba(255,255,255,0.08);border-left:5px solid ' + stateCol + ';border-radius:8px;'
    + 'padding:16px;display:flex;flex-direction:column;flex:1 1 0;min-width:0;' + (n4Href ? 'cursor:pointer' : '') + '">'

    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
    +   '<div>'
    +     '<div style="font-size:21px;font-weight:700;color:#E6EDF3;line-height:1.2">' + S.esc(host.cfg.label) + '</div>'
    +     '<div style="font-size:13px;color:#8891A8;font-family:monospace;margin-top:3px">' + S.esc(host.cfg.hostname) + '</div>'
    +   '</div>'
    +   '<span style="background:' + pillBg + ';color:' + stateCol + ';font-size:14px;font-weight:700;padding:4px 10px;border-radius:4px;white-space:nowrap">' + pillLbl + '</span>'
    + '</div>'

    + '<div style="padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:10px">'
    +   icmpBadge
    + '</div>'

    + '<div style="flex:1">'
    +   rcRenderCircuits(host.sections)
    + '</div>'

    + '<div style="margin-top:auto;padding-top:10px;text-align:right">'
    +   footer
    + '</div>'

    + '</' + tag + '>'
}

function rcRender(el, model) {
  el.innerHTML = '<div style="display:flex;gap:14px;align-items:stretch;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + model.map(function(host) { return rcRenderCard(host) }).join('')
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
