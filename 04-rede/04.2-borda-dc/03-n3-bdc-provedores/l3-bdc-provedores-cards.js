// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · BORDA DC — PROVEDORES  v1.0                       ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                             ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                  ║
// ║                                                                          ║
// ║  Vista por operadora/carrier — accountability de SLA ("que operadora    ║
// ║  incumpriu, a quem abrir ticket"), em paralelo com a vista "por         ║
// ║  router" (01-n3-bdc-routers). Mesmos 5 routers de HG_DC_ROUTERS, mas    ║
// ║  fatiados pela operadora que entrega o circuito, não pelo router.       ║
// ║                                                                          ║
// ║  KPI strip + 8 cards num único painel (Flexbox, sem height:100% em      ║
// ║  cascata — lição do N3 por router: usar o próprio card como item flex,  ║
// ║  nunca aninhar <a> dentro de <a>).                                      ║
// ║                                                                          ║
// ║  2026-07-01 (revisão pós-N4/N5): dependência de IP SLA 65 removida do   ║
// ║  effDown do provedor ITA — Z.13 confirmou sonda morta há ~7 meses, não  ║
// ║  reflecte o estado real do circuito. net.if.status passa a ser a única  ║
// ║  fonte de verdade, mesma decisão já tomada no N4/N5 Router e no N3     ║
// ║  por router.                                                            ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_PROV = {
  elementId: 'bpc-n3bdc-provedores',
  refreshMs:  60000,

  n4DashUid:  'rede-n4-bdc-provedor',
  hostIds:    ['10838', '10839', '10840', '10996', '11001'],

  provedores: [
    { key: 'unitel',    label: 'UNITEL',              tokens: ['UNITEL'] },
    { key: 'mst',       label: 'MST / MSTELECOM',     tokens: ['MST', 'MSTELECOM', 'MSTELCOM', 'KWANZA'] },
    { key: 'at',        label: 'AT / ANGOLA TELECOM', tokens: ['ATELECOM', 'BGP_PEER_AT', 'SP_EMIS_AT', 'SP_AT', '_AT_', ' AT '] },
    { key: 'ita',       label: 'ITA',                 tokens: ['ITA'] },
    { key: 'multitel',  label: 'MULTITEL',            tokens: ['MULTITEL'] },
    { key: 'ipworld',   label: 'IPWORLD',             tokens: ['IPWORLD'] },
    { key: 'connectis', label: 'CONNECTIS',           tokens: ['CONNECTIS'] },
    { key: 'azure',     label: 'AZURE',               tokens: ['Po2.2931', 'Po2.2932', 'EXPRESSROUTE', 'AZURE'] },
  ],

  excludeRe: /^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|Ethernet[0-9]\/[0-9]\/[0-9]+$|Te[0-9]\/[0-9]\/[0-9]+$|Gi0\/0\/[0-9]$|Gi0\/0\/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)/i,
  excludeDescRe: /^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)/i,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function pcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function pcParseIf(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').replace(/^\*+|\*+$/g, '').trim() }
}

function pcDetectProv(ifname, desc) {
  var haystack = (ifname + ' ' + desc).toUpperCase()
  for (var i = 0; i < CFG_PROV.provedores.length; i++) {
    var p = CFG_PROV.provedores[i]
    for (var j = 0; j < p.tokens.length; j++) {
      if (haystack.indexOf(p.tokens[j].toUpperCase()) !== -1) return p.key
    }
  }
  return null
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function pcFetch(rpc) {
  var hids = CFG_PROV.hostIds
  return Promise.all([
    rpc('item.get', { hostids: hids, filter: { status: 0 }, search: { key_: 'net.if.status' }, output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'] }),
    rpc('trigger.get', { hostids: hids, filter: { value: 1 }, output: ['triggerid'] }),
  ]).then(function(r) { return { ifStatus: r[0], triggers: r[1] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function pcCompute(data) {
  var map = {}
  CFG_PROV.provedores.forEach(function(p) { map[p.key] = { cfg: p, total: 0, up: 0, effDown: 0 } })

  data.ifStatus.forEach(function(it) {
    var p = pcParseIf(it.name)
    if (!p || !p.ifname) return
    if (CFG_PROV.excludeRe.test(p.ifname)) return
    if (p.desc && CFG_PROV.excludeDescRe.test(p.desc)) return

    var pk = pcDetectProv(p.ifname, p.desc)
    if (!pk || !map[pk]) return

    var g = map[pk]
    var isUp = it.lastvalue === '1'
    var effDown = !isUp

    g.total++
    if (isUp) g.up++
    if (effDown) g.effDown++
  })

  var groups = CFG_PROV.provedores.map(function(p) { return map[p.key] }).filter(function(g) { return g.total > 0 })
  var totalCirc = groups.reduce(function(a, g) { return a + g.total }, 0)
  var totalUp = groups.reduce(function(a, g) { return a + g.up }, 0)
  var provProb = groups.filter(function(g) { return g.effDown > 0 }).length
  var alerts = data.triggers.length

  return { groups: groups, totalCirc: totalCirc, totalUp: totalUp, provProb: provProb, alerts: alerts }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function pcKpiBlock(value, label, color) {
  return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'padding:14px 26px;border-right:1px solid rgba(255,255,255,0.08)">'
    + '<span style="font-size:34px;font-weight:700;color:' + color + ';line-height:1">' + pcEsc(String(value)) + '</span>'
    + '<span style="font-size:13px;color:#8891A8;text-transform:uppercase;letter-spacing:.05em;margin-top:4px">' + pcEsc(label) + '</span>'
    + '</div>'
}

function pcRenderKpi(model) {
  var ok = model.provProb === 0
  var stateColor = ok ? '#22C55E' : '#f85149'
  var stateText = ok ? 'Todos os provedores operacionais' : model.provProb + ' provedor(es) com problema'

  return '<div style="display:flex;align-items:stretch;background:rgba(14,20,60,0.6);'
    + 'border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;margin-bottom:14px">'
    + pcKpiBlock(model.groups.length, 'Provedores', '#E6EDF3')
    + pcKpiBlock(model.totalUp + '/' + model.totalCirc, 'Circuitos UP', model.totalUp === model.totalCirc ? '#22C55E' : '#f85149')
    + pcKpiBlock(model.provProb || '—', 'Com problema', model.provProb > 0 ? '#f85149' : '#22C55E')
    + pcKpiBlock(model.alerts || '—', 'Alertas activos', model.alerts > 0 ? '#f85149' : '#22C55E')
    + '<div style="flex:1;display:flex;align-items:center;justify-content:flex-end;padding:0 24px">'
    +   '<span style="font-size:18px;font-weight:700;color:' + stateColor + '">' + pcEsc(stateText) + '</span>'
    + '</div>'
    + '</div>'
}

function pcRenderCard(grp) {
  var stateCol = grp.effDown > 0 ? '#f85149' : '#22C55E'
  var stateLbl = grp.effDown > 0 ? grp.effDown + ' DOWN' : (grp.up + '/' + grp.total + ' UP')
  var pillBg   = grp.effDown > 0 ? 'rgba(248,81,73,0.18)' : 'rgba(34,197,94,0.15)'

  var n4Href = CFG_PROV.n4DashUid ? '/d/' + CFG_PROV.n4DashUid + '?var-provider=' + encodeURIComponent(grp.cfg.key) : null
  var tag = n4Href ? 'a' : 'div'
  var hrefAttr = n4Href ? ' href="' + n4Href + '"' : ''
  var footer = '<span style="font-size:13px;color:' + (n4Href ? '#00B4D8' : '#8891A8') + ';font-weight:600">Ver detalhes do provedor →</span>'

  return '<' + tag + hrefAttr + ' style="text-decoration:none;background:rgba(14,20,60,0.55);'
    + 'border:1px solid rgba(255,255,255,0.08);border-left:5px solid ' + stateCol + ';border-radius:8px;'
    + 'padding:14px;display:flex;flex-direction:column;flex:1 1 190px;min-width:170px;' + (n4Href ? 'cursor:pointer' : '') + '">'

    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
    +   '<span style="font-size:18px;font-weight:700;color:#E6EDF3;line-height:1.25">' + pcEsc(grp.cfg.label) + '</span>'
    + '</div>'

    + '<div style="margin-bottom:10px">'
    +   '<span style="background:' + pillBg + ';color:' + stateCol + ';font-size:16px;font-weight:700;padding:4px 10px;border-radius:4px;white-space:nowrap">' + pcEsc(stateLbl) + '</span>'
    + '</div>'

    + '<div style="flex:1;font-size:14px;color:#8891A8">' + grp.total + ' circuito' + (grp.total !== 1 ? 's' : '') + ' monitorizado' + (grp.total !== 1 ? 's' : '') + '</div>'

    + '<div style="margin-top:auto;padding-top:10px">'
    +   footer
    + '</div>'

    + '</' + tag + '>'
}

function pcRender(el, model) {
  el.innerHTML = '<div style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + pcRenderKpi(model)
    + '<div style="display:flex;flex-wrap:wrap;gap:14px;align-items:stretch">'
    +   model.groups.map(pcRenderCard).join('')
    + '</div>'
    + '</div>'
}

function pcRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Borda DC — Provedores: ' + pcEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function pcLoad(rpc) {
  var el = document.getElementById(CFG_PROV.elementId)
  if (!el) return
  pcFetch(rpc)
    .then(function(data) { pcRender(el, pcCompute(data)) })
    .catch(function(err) { pcRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { pcLoad(rpc) }, CFG_PROV.refreshMs)
}

function pcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(pcLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-bdc-provedores-cards: waitForBPC nunca disponivel'); return }
  setTimeout(function() { pcInitWithRetry(attempt + 1) }, 100)
}

pcInitWithRetry()
