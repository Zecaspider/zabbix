// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC CORE  v2.0                                   ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Grupos 26 (switches Nexus Spine-Leaf) + 27 (routers WAN/Parceiros)    ║
// ║                                                                          ║
// ║  Secção 1 — FABRIC DC: Spine-Leaf Cisco Nexus (7 switches)             ║
// ║    Colunas: ● | Host | Tier | Modelo | CPU% | RAM% | Uptime | Triggers ║
// ║                                                                          ║
// ║  Secção 2 — ROUTERS WAN: Gateway + Internet + Agências + EMIS + Parc.  ║
// ║    Colunas: ● | Host | Função | Peers | RTT | Perda% | CPU% | Uptime   ║
// ║                                                                          ║
// ║  Classificação: lê tag Zabbix "funcao"; fallback por nome do host       ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_DC = {
  elementId: 'bpc-n3dc-table',
  groupIds:  ['26', '27'],
  refreshMs:  60000,
  maxAgeSec:  600,

  thresholds: {
    rttMs:   { warn:  5, crit:  50 },
    lossPct: { warn:  1, crit:  10 },
    cpuPct:  { warn: 60, crit:  85 },
    memPct:  { warn: 80, crit:  92 },
  },

  // Ordem visual nas tabelas
  spineOrder: ['switch-spine', 'switch-leaf'],
  routerOrder: ['gateway', 'wan-internet', 'wan-agencias', 'wan-emis', 'wan-parceiro'],

  tierLabel: {
    'switch-spine': 'SPINE',
    'switch-leaf':  'LEAF',
  },

  routerLabel: {
    'gateway':      'Gateway DC',
    'wan-internet': 'WAN Internet',
    'wan-agencias': 'WAN Agências',
    'wan-emis':     'WAN EMIS',
    'wan-parceiro': 'WAN Parceiros',
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function dcEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

// Classifica o dispositivo: lê tag 'funcao'; fallback por nome
function dcClassify(name, tags) {
  var f = tags && tags['funcao']
  if (f) return f
  var n = (name || '').toUpperCase()
  if (n.indexOf('SPINE') !== -1) return 'switch-spine'
  if (n.indexOf('LEAF')  !== -1) return 'switch-leaf'
  if (n.indexOf('GTW')   !== -1) return 'gateway'
  if (n.indexOf('WAN-INT')  !== -1) return 'wan-internet'
  if (n.indexOf('WAN-AG')   !== -1) return 'wan-agencias'
  if (n.indexOf('EMIS')     !== -1) return 'wan-emis'
  if (n.indexOf('PARC')     !== -1) return 'wan-parceiro'
  return 'unknown'
}

function dcIsSwitch(funcao) {
  return funcao === 'switch-spine' || funcao === 'switch-leaf'
}

function dcIsStale(lastclock) {
  return !lastclock || (Math.floor(Date.now() / 1000) - parseInt(lastclock, 10)) > CFG_DC.maxAgeSec
}

function dcStateAbove(v, t) {
  if (v == null || isNaN(v)) return 'ok'
  if (v >= t.crit) return 'crit'
  if (v >= t.warn) return 'warn'
  return 'ok'
}

function dcWorstState(states) {
  var order = { down: 4, crit: 3, warn: 2, ok: 1 }
  var best = 'ok', bestV = 1
  states.forEach(function (s) {
    var v = order[s] || 0
    if (v > bestV) { bestV = v; best = s }
  })
  return best
}

function dcSeverityToState(p) {
  p = parseInt(p, 10)
  if (p >= 4) return 'crit'
  if (p >= 2) return 'warn'
  return 'ok'
}

function dcStateDot(state) {
  var T = window.BPC.THEME
  var colors = { ok: T.colorOk, warn: T.colorWarn, crit: T.colorCrit, down: T.colorCrit }
  var c = colors[state] || T.colorMute
  var pulse = state === 'down' ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';flex-shrink:0;' + pulse + '"></span>'
}

function dcRowBg(state) {
  if (state === 'down' || state === 'crit') return 'rgba(239,68,68,0.04)'
  if (state === 'warn') return 'rgba(240,165,0,0.03)'
  return ''
}

function dcRowBorderLeft(state) {
  if (state === 'down' || state === 'crit') return 'border-left:2px solid var(--bpc-crit);'
  if (state === 'warn') return 'border-left:2px solid var(--bpc-warn);'
  return 'border-left:2px solid transparent;'
}

function dcFmtRtt(ms) {
  if (ms == null || isNaN(ms)) return '<span class="bpc-mute">—</span>'
  var state = dcStateAbove(ms, CFG_DC.thresholds.rttMs)
  var cls = state === 'crit' ? 'bpc-crit' : state === 'warn' ? 'bpc-warn' : ''
  return '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + ms.toFixed(1) + ' ms</span>'
}

function dcFmtLoss(pct) {
  if (pct == null || isNaN(pct)) return '<span class="bpc-mute">—</span>'
  if (pct === 0) return '<span class="bpc-ok">0%</span>'
  var state = dcStateAbove(pct, CFG_DC.thresholds.lossPct)
  var cls = state === 'crit' ? 'bpc-crit' : 'bpc-warn'
  return '<span class="' + cls + '">' + pct.toFixed(1) + '%</span>'
}

function dcFmtPct(v, thr) {
  if (v == null || isNaN(v)) return '<span class="bpc-mute">—</span>'
  var state = dcStateAbove(v, thr)
  var cls = state === 'crit' ? 'bpc-crit' : state === 'warn' ? 'bpc-warn' : 'bpc-ok'
  return '<span class="' + cls + '">' + v.toFixed(0) + '%</span>'
}

function dcFmtUptime(secs) {
  if (!secs || isNaN(secs)) return '<span class="bpc-mute">—</span>'
  var d = Math.floor(secs / 86400)
  var h = Math.floor((secs % 86400) / 3600)
  var m = Math.floor((secs % 3600) / 60)
  if (d > 0) return d + 'd ' + h + 'h'
  return h + 'h ' + m + 'm'
}

function dcFmtTriggers(list) {
  if (!list || !list.length) return ''
  var worst = Math.max.apply(null, list.map(function (t) { return parseInt(t.priority, 10) }))
  var s = dcSeverityToState(worst)
  var c = s === 'crit' ? 'var(--bpc-crit)' : 'var(--bpc-warn)'
  return '<span style="font-size:.96rem;color:' + c + '">' + (s === 'crit' ? '✖' : '⚠') + ' ' + list.length + '</span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function dcFetch(rpc) {
  var [hosts, icmpItems, memItems, uptItems, triggers, tagsResp] = await Promise.all([

    rpc('host.get', {
      groupids: CFG_DC.groupIds,
      output:   ['hostid', 'host', 'name'],
      filter:   { status: 0 },
    }),

    rpc('item.get', {
      groupids:    CFG_DC.groupIds,
      filter:      { status: 0 },
      output:      ['hostid', 'key_', 'lastvalue', 'lastclock'],
      searchByAny: true,
      search:      { key_: ['icmpping', 'icmppingsec', 'icmppingloss'] },
    }),

    rpc('item.get', {
      groupids: CFG_DC.groupIds,
      filter:   { status: 0 },
      output:   ['hostid', 'key_', 'lastvalue', 'lastclock'],
      search:   { key_: 'memory' },
    }),

    rpc('item.get', {
      groupids: CFG_DC.groupIds,
      filter:   { key_: 'system.uptime', status: 0 },
      output:   ['hostid', 'lastvalue', 'lastclock'],
    }),

    rpc('trigger.get', {
      groupids:  CFG_DC.groupIds,
      filter:    { value: 1 },
      output:    ['triggerid', 'hostid', 'priority', 'description'],
      monitored: true,
      only_true: true,
    }),

    rpc('host.get', {
      groupids:   CFG_DC.groupIds,
      output:     ['hostid'],
      selectTags: ['tag', 'value'],
      filter:     { status: 0 },
    }),
  ])

  return { hosts, icmpItems, memItems, uptItems, triggers, tagsResp }
}

async function dcFetchCpu(rpc) {
  // groupids (não hostids dinâmico) — mesma assinatura de query dos outros
  // fetches deste painel (icmp/mem/uptime/triggers), para não colidir com
  // uma entrada de cache do proxy zabbix-api presa a um lote de hostids
  // antigo/vazio (cache de ~30min, ver engenharia-do-sistema.md).
  return rpc('item.get', {
    groupids: CFG_DC.groupIds,
    filter:   { status: 0 },
    output:   ['hostid', 'key_', 'lastvalue', 'lastclock'],
    search:   { key_: 'system.cpu.util' },
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function dcCompute(data, cpuItems) {
  var hosts      = data.hosts
  var icmpItems  = data.icmpItems
  var memItems   = data.memItems
  var uptItems   = data.uptItems
  var triggers   = data.triggers
  var tagsResp   = data.tagsResp

  // índice de métricas por hostid
  var byHost = {}
  hosts.forEach(function (h) {
    byHost[h.hostid] = {
      host: h, tags: {},
      icmpUp: null, rtt: null, loss: null,
      cpu: null, mem: null, uptime: null,
    }
  })

  // tags
  tagsResp.forEach(function (h) {
    if (!byHost[h.hostid]) return
    ;(h.tags || []).forEach(function (t) { byHost[h.hostid].tags[t.tag] = t.value })
  })

  // ICMP
  icmpItems.forEach(function (i) {
    var e = byHost[i.hostid]
    if (!e) return
    var stale = dcIsStale(i.lastclock)
    if (i.key_ === 'icmpping')     e.icmpUp = !stale && i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  e.rtt    = stale ? null : parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') e.loss   = stale ? null : parseFloat(i.lastvalue)
  })

  // Memória (pega o item mais relevante: preferir util% se existir)
  memItems.forEach(function (i) {
    var e = byHost[i.hostid]
    if (!e || dcIsStale(i.lastclock)) return
    var v = parseFloat(i.lastvalue)
    if (isNaN(v)) return
    // normalizar para percentagem: se o valor parecer bytes (>200), ignorar
    if (v <= 100 && (e.mem == null || i.key_.indexOf('util') !== -1)) {
      e.mem = v
    }
  })

  // Uptime
  uptItems.forEach(function (i) {
    var e = byHost[i.hostid]
    if (!e || dcIsStale(i.lastclock)) return
    e.uptime = parseFloat(i.lastvalue)
  })

  // CPU (LLD — pega o maior)
  cpuItems.forEach(function (i) {
    var e = byHost[i.hostid]
    if (!e || dcIsStale(i.lastclock)) return
    var v = parseFloat(i.lastvalue)
    if (!isNaN(v)) e.cpu = (e.cpu == null) ? v : Math.max(e.cpu, v)
  })

  // Triggers por host
  var trigsByHost = {}
  triggers.forEach(function (t) {
    if (!trigsByHost[t.hostid]) trigsByHost[t.hostid] = []
    trigsByHost[t.hostid].push(t)
  })

  // Montar rows
  var switches = []
  var routers  = []

  hosts.forEach(function (h) {
    var e      = byHost[h.hostid]
    var tList  = trigsByHost[h.hostid] || []
    var funcao = dcClassify(h.name || h.host, e.tags)

    var rowState = dcWorstState([
      e.icmpUp === false ? 'down' : 'ok',
      dcStateAbove(e.rtt,  CFG_DC.thresholds.rttMs),
      dcStateAbove(e.loss, CFG_DC.thresholds.lossPct),
      dcStateAbove(e.cpu,  CFG_DC.thresholds.cpuPct),
      dcStateAbove(e.mem,  CFG_DC.thresholds.memPct),
      tList.length ? dcSeverityToState(
        Math.max.apply(null, tList.map(function (t) { return parseInt(t.priority, 10) }))
      ) : 'ok',
    ])

    var row = {
      hostid:   h.hostid,
      name:     h.name || h.host,
      funcao:   funcao,
      model:    e.tags['modelo'] || null,
      parceiro: e.tags['parceiro'] || null,
      rtt:      e.rtt,
      loss:     e.loss,
      cpu:      e.cpu,
      mem:      e.mem,
      uptime:   e.uptime,
      triggers: tList,
      rowState: rowState,
    }

    if (dcIsSwitch(funcao)) switches.push(row)
    else                    routers.push(row)
  })

  // Ordenar switches: Spine → Leaf, depois por nome
  switches.sort(function (a, b) {
    var oa = CFG_DC.spineOrder.indexOf(a.funcao), ob = CFG_DC.spineOrder.indexOf(b.funcao)
    if (oa !== ob) return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob)
    return a.name.localeCompare(b.name)
  })

  // Ordenar routers: gateway → internet → agências → emis → parceiro
  routers.sort(function (a, b) {
    var oa = CFG_DC.routerOrder.indexOf(a.funcao), ob = CFG_DC.routerOrder.indexOf(b.funcao)
    if (oa !== ob) return (oa < 0 ? 99 : oa) - (ob < 0 ? 99 : ob)
    return a.name.localeCompare(b.name)
  })

  return { switches, routers }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

var DC_TH_SWITCH = [
  '<thead>',
  '<tr style="border-bottom:1px solid rgba(255,255,255,0.08)">',
  '<th style="padding:5px 8px;width:24px"></th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Host</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:60px">Tier</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Modelo</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:58px">CPU</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:58px">RAM</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:78px">Uptime</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:60px">Alerts</th>',
  '</tr>',
  '</thead>',
].join('')

var DC_TH_ROUTER = [
  '<thead>',
  '<tr style="border-bottom:1px solid rgba(255,255,255,0.08)">',
  '<th style="padding:5px 8px;width:24px"></th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Host</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:110px">Função</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Peers / Providers</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:72px">RTT</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:60px">Perda</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:55px">CPU</th>',
  '<th style="padding:5px 8px;text-align:right;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:78px">Uptime</th>',
  '<th style="padding:5px 8px;text-align:left;font-size:.88rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute);width:60px">Alerts</th>',
  '</tr>',
  '</thead>',
].join('')

function dcRenderSwitchRow(row, prevFuncao) {
  var tierLabel = CFG_DC.tierLabel[row.funcao] || row.funcao
  var tierColor = row.funcao === 'switch-spine' ? 'var(--bpc-cyan)' : 'rgba(255,255,255,0.45)'

  // separador visual entre Spine e Leaf
  var separator = ''
  if (prevFuncao === 'switch-spine' && row.funcao === 'switch-leaf') {
    separator = '<tr><td colspan="8" style="padding:0;height:1px;background:rgba(255,255,255,0.06)"></td></tr>'
  }

  var bg = dcRowBg(row.rowState)
  var bl = dcRowBorderLeft(row.rowState)

  var swDrillUrl = '/d/rede-n4-dc-switch/n4-rede-dc-switch?var-switchName=' + encodeURIComponent(row.name)
  var swNameCell = '<a href="' + swDrillUrl + '" style="color:#CDD9E5;text-decoration:none;font-weight:600;font-size:1.03rem" title="Abrir ficha N4">' + dcEsc(row.name) + ' <span style="font-size:.70rem;opacity:.45">↗</span></a>'

  return separator + [
    '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:' + bg + ';' + bl + '">',
    '<td style="padding:6px 8px;text-align:center">' + dcStateDot(row.rowState) + '</td>',
    '<td style="padding:6px 8px">' + swNameCell + '</td>',
    '<td style="padding:6px 8px;font-size:.93rem;font-weight:700;color:' + tierColor + '">' + tierLabel + '</td>',
    '<td style="padding:6px 8px;font-size:.90rem;color:rgba(255,255,255,0.38)">' + dcEsc(row.model || '—') + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.98rem">' + dcFmtPct(row.cpu, CFG_DC.thresholds.cpuPct) + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.98rem">' + dcFmtPct(row.mem, CFG_DC.thresholds.memPct) + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.93rem;color:var(--bpc-mute)">' + dcFmtUptime(row.uptime) + '</td>',
    '<td style="padding:6px 8px">' + dcFmtTriggers(row.triggers) + '</td>',
    '</tr>',
  ].join('')
}

function dcRenderRouterRow(row) {
  var funcLabel  = CFG_DC.routerLabel[row.funcao] || row.funcao
  var peersHtml  = row.parceiro ? dcEsc(row.parceiro) : '<span class="bpc-mute">—</span>'
  var bg = dcRowBg(row.rowState)
  var bl = dcRowBorderLeft(row.rowState)
  var rtDrillUrl  = '/d/rede-n4-bdc-router?var-routerName=' + encodeURIComponent(row.name)
  var rtNameCell  = '<a href="' + rtDrillUrl + '" style="color:#CDD9E5;text-decoration:none;font-weight:600;font-size:1.03rem" title="Abrir ficha N4">' + dcEsc(row.name) + ' <span style="font-size:.70rem;opacity:.45">↗</span></a>'

  return [
    '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);background:' + bg + ';' + bl + '">',
    '<td style="padding:6px 8px;text-align:center">' + dcStateDot(row.rowState) + '</td>',
    '<td style="padding:6px 8px">' + rtNameCell + '</td>',
    '<td style="padding:6px 8px;font-size:.90rem;color:var(--bpc-mute)">' + dcEsc(funcLabel) + '</td>',
    '<td style="padding:6px 8px;font-size:.90rem;color:rgba(255,255,255,0.55)">' + peersHtml + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.98rem">' + dcFmtRtt(row.rtt) + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.98rem">' + dcFmtLoss(row.loss) + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.98rem">' + dcFmtPct(row.cpu, CFG_DC.thresholds.cpuPct) + '</td>',
    '<td style="padding:6px 8px;text-align:right;font-size:.93rem;color:var(--bpc-mute)">' + dcFmtUptime(row.uptime) + '</td>',
    '<td style="padding:6px 8px">' + dcFmtTriggers(row.triggers) + '</td>',
    '</tr>',
  ].join('')
}

function dcSectionHeader(label, count, subtitle) {
  return [
    '<div style="display:flex;align-items:center;gap:10px;margin:14px 0 6px">',
    '<span style="font-size:.78rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--bpc-mute)">' + label + '</span>',
    '<span style="font-size:.75rem;color:rgba(255,255,255,0.20)">' + count + ' dispositivos</span>',
    subtitle ? '<span style="margin-left:auto;font-size:.75rem;color:rgba(255,255,255,0.18)">' + subtitle + '</span>' : '',
    '</div>',
  ].join('')
}

function dcRender(el, result) {
  var switches = result.switches
  var routers  = result.routers
  var all      = switches.concat(routers)
  var total    = all.length
  var down     = all.filter(function (r) { return r.rowState === 'down' }).length
  var crit     = all.filter(function (r) { return r.rowState === 'crit' }).length
  var warn     = all.filter(function (r) { return r.rowState === 'warn' }).length
  var ok       = total - down - crit - warn

  var statusBar = window.BPC.utils.buildStatusBar({
    ok:   ok,
    warn: warn + crit,
    crit: down,
    label: 'Actualizado ' + new Date().toLocaleTimeString('pt-PT'),
  })

  // Fabric section
  var swRows = ''
  var prevFuncao = null
  switches.forEach(function (row) {
    swRows += dcRenderSwitchRow(row, prevFuncao)
    prevFuncao = row.funcao
  })

  var fabricSection = switches.length ? [
    dcSectionHeader('FABRIC DC — SPINE-LEAF', switches.length, 'Cisco Nexus NX-OS'),
    '<div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden;margin-bottom:4px">',
    '<table style="width:100%;border-collapse:collapse">',
    DC_TH_SWITCH,
    '<tbody>' + swRows + '</tbody>',
    '</table>',
    '</div>',
  ].join('') : ''

  // Routers section
  var rtRows = routers.map(dcRenderRouterRow).join('')

  var routersSection = routers.length ? [
    dcSectionHeader('ROUTERS WAN / PARCEIROS', routers.length, 'Cisco ISR · C8xxx'),
    '<div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.07);border-radius:8px;overflow:hidden">',
    '<table style="width:100%;border-collapse:collapse">',
    DC_TH_ROUTER,
    '<tbody>' + rtRows + '</tbody>',
    '</table>',
    '</div>',
  ].join('') : ''

  el.innerHTML = [
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">',

    // cabeçalho
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">',
    '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.08em;text-transform:uppercase">DC CORE</span>',
    '<span style="font-size:.90rem;color:var(--bpc-mute)">' + total + ' dispositivos · grupos 26+27</span>',
    '</div>',

    statusBar,
    fabricSection,
    routersSection,

    '</div>',
  ].join('')
}

function dcRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ DC Core: ' + dcEsc(msg) + '</div>'
    + '</div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function dcLoad(rpc) {
  var el = document.getElementById(CFG_DC.elementId)
  if (!el) return

  el.innerHTML = '<div style="padding:16px;color:var(--bpc-mute);font-size:1.0rem">A carregar DC Core…</div>'

  dcFetch(rpc)
    .then(function (data) {
      return dcFetchCpu(rpc).then(function (cpuItems) {
        return dcCompute(data, cpuItems)
      })
    })
    .then(function (result) { dcRender(el, result) })
    .catch(function (err)   { dcRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { dcLoad(rpc) }, CFG_DC.refreshMs)
}

function dcInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(dcLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-dc-table: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { dcInitWithRetry(attempt + 1) }, 100)
}

dcInitWithRetry()
