// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC FABRIC — KPI STRIP  v1.0                      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                            ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                 ║
// ║                                                                          ║
// ║  Resumo agregado dos 7 switches do fabric DC (grupo 26, HG_DC_SWITCHES) ║
// ║  — números grandes para leitura a 3m (wallboard NOC). "Uplinks" conta   ║
// ║  só interfaces com papel no fabric (underlay/vPC/overlay), lidas pela   ║
// ║  descrição da interface — igual para os 7 hosts (ao contrário dos       ║
// ║  routers de Borda DC, aqui não há mapa por host).                       ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] COMPUTE  [4] RENDER  [5] BOOT                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_FKPI = {
  elementId: 'bpc-n3fab-kpi',
  refreshMs:  60000,
  groupIds:   ['26'],
  saudeUrl:   '/d/rede-n3-dc-fabric-saude',

  // interfaces com papel no fabric — mesma classificação para os 7 hosts.
  // Underlay é assimétrico por natureza (confirmado ao vivo 2026-07-02):
  // lado SPINE diz "LEAF-10X UNDERLAY", lado LEAF diz "LINK TO SPINE-1X" —
  // nenhum dos dois usa a palavra "underlay" nos dois lados. NÃO simplificar
  // para /UNDERLAY/ sozinho: a loopback0 de BGP também se chama "BGP
  // PEERING UNDERLAY" nos LEAFs e não é um uplink físico — apanhava-a por
  // engano e inflava a contagem.
  uplinkRe: /LINK TO SPINE-\d+|LEAF-\d+\s*UNDERLAY|VXLAN\s*OVERLAY|^nve1$|VPC\s*PEER-?LINK|VPC\s*KEEPALIVE/i,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function fkParseIf(name) {
  var m = /Interface\s+([^(]+)\(([^)]*)\)/.exec(name || '')
  if (!m) return { ifname: '', desc: '' }
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function fkFetch(rpc) {
  return Promise.all([
    rpc('host.get', {
      groupids: CFG_FKPI.groupIds,
      output:   ['hostid'],
      filter:   { status: 0 },
    }),
    rpc('item.get', {
      groupids: CFG_FKPI.groupIds,
      filter:   { status: 0, key_: 'icmpping' },
      output:   ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      groupids: CFG_FKPI.groupIds,
      search:   { key_: 'net.if.status' },
      filter:   { status: 0 },
      output:   ['hostid', 'name', 'lastvalue'],
    }),
    rpc('trigger.get', {
      groupids:  CFG_FKPI.groupIds,
      filter:    { value: 1 },
      output:    ['triggerid'],
      monitored: true,
      only_true: true,
    }),
  ]).then(function (r) { return { hosts: r[0], icmp: r[1], ifaces: r[2], triggers: r[3] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function fkCompute(data) {
  var switchesTotal = data.hosts.length
  var switchesUp = data.icmp.filter(function (i) { return i.lastvalue === '1' }).length

  var uplinks = data.ifaces.filter(function (it) {
    var p = fkParseIf(it.name)
    return CFG_FKPI.uplinkRe.test(p.desc) || CFG_FKPI.uplinkRe.test(p.ifname)
  })
  var upTotal = uplinks.length
  var upDown  = uplinks.filter(function (i) { return i.lastvalue !== '1' }).length
  var alerts  = data.triggers.length

  return {
    switchesTotal: switchesTotal,
    switchesUp:    switchesUp,
    uplinksTotal:  upTotal,
    uplinksDown:   upDown,
    alerts:        alerts,
    ok:            switchesUp === switchesTotal && upDown === 0 && alerts === 0,
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function fkKpiBlock(value, label, color) {
  return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'padding:14px 28px;border-right:1px solid rgba(255,255,255,0.08)">'
    + '<span style="font-size:34px;font-weight:700;color:' + color + ';line-height:1">' + value + '</span>'
    + '<span style="font-size:13px;color:#8891A8;text-transform:uppercase;letter-spacing:.05em;margin-top:4px">' + label + '</span>'
    + '</div>'
}

function fkRender(el, model) {
  var okCol   = '#22C55E'
  var critCol = '#f85149'

  var stateColor = model.ok ? okCol : critCol
  var stateText  = model.ok ? 'Fabric operacional' : 'Atenção necessária'

  el.innerHTML = '<div style="display:flex;align-items:stretch;background:rgba(14,20,60,0.6);'
    + 'border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + fkKpiBlock(model.switchesTotal, 'Switches', '#E6EDF3')
    + fkKpiBlock(model.switchesUp + '/' + model.switchesTotal, 'UP agora', model.switchesUp === model.switchesTotal ? okCol : critCol)
    + fkKpiBlock(model.uplinksTotal, 'Uplinks monitorizados', '#E6EDF3')
    + fkKpiBlock(model.uplinksDown, 'Uplinks down', model.uplinksDown === 0 ? okCol : critCol)
    + fkKpiBlock(model.alerts, 'Alertas activos', model.alerts === 0 ? okCol : critCol)
    + '<div style="flex:1;display:flex;align-items:center;justify-content:flex-end;gap:20px;padding:0 28px">'
    +   '<span style="font-size:18px;font-weight:700;color:' + stateColor + '">' + stateText + '</span>'
    +   '<a href="' + CFG_FKPI.saudeUrl + '" style="font-size:14px;color:#00B4D8;text-decoration:none;font-weight:600;white-space:nowrap">Ver Saúde do Fabric (underlay/vPC/overlay) →</a>'
    + '</div>'
    + '</div>'
}

function fkRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ DC Fabric — KPI: ' + msg + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOT
// ────────────────────────────────────────────────────────────────────────────

function fkLoad(rpc) {
  var el = document.getElementById(CFG_FKPI.elementId)
  if (!el) return
  fkFetch(rpc)
    .then(function (data) { fkRender(el, fkCompute(data)) })
    .catch(function (err) { fkRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function () { fkLoad(rpc) }, CFG_FKPI.refreshMs)
}

function fkInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(fkLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-fab-kpi: waitForBPC nunca disponivel'); return }
  setTimeout(function () { fkInitWithRetry(attempt + 1) }, 100)
}

fkInitWithRetry()
