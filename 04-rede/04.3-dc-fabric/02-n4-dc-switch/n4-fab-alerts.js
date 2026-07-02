// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · DC FABRIC · SWITCH — ALERTAS (KPI)  v1.0                 ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                            ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                 ║
// ║                                                                          ║
// ║  Contador de alertas activos SÓ do switch seleccionado (var switchName), ║
// ║  ao lado dos 4 stats nativos (Disponibilidade/CPU/RAM/Uptime). Não há    ║
// ║ painel nativo Zabbix que conte problemas — datasource plugin só tem o    ║
// ║ tipo "lista de problemas" (triggers-panel); contagem por host é sempre   ║
// ║ Business Text + trigger.get, mesmo padrão de l2-kpi.js/l3-fab-kpi.js.    ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] RENDER  [4] BOOT                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_FALERT = {
  elementId: 'bpc-n4fab-alerts',
  pollMs:     1000,   // frequência a que verifica se o dropdown mudou (barato, só lê o URL)
  refreshMs:  60000,  // frequência a que refaz o RPC para o MESMO host (fica actualizado ao vivo)
}

function falertGetVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function falertFetch(rpc, switchName) {
  var hosts = await rpc('host.get', { filter: { host: [switchName] }, output: ['hostid'], limit: 1 })
  var host = hosts[0]
  if (!host) return { total: 0, crit: 0 }

  var trigs = await rpc('trigger.get', {
    hostids:   [host.hostid],
    filter:    { value: 1 },
    monitored: true,
    only_true: true,
    output:    ['priority'],
  })

  var crit = trigs.filter(function (t) { return parseInt(t.priority, 10) >= 4 }).length
  return { total: trigs.length, crit: crit }
}


// ────────────────────────────────────────────────────────────────────────────
// [3] RENDER
// ────────────────────────────────────────────────────────────────────────────

function falertRender(el, model) {
  var T = window.BPC.THEME
  var color = model.crit > 0 ? T.colorCrit : model.total > 0 ? T.colorWarn : T.colorOk

  el.innerHTML = '<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + '<div style="font-size:.85rem;font-weight:500;color:rgba(255,255,255,0.75)">Alertas</div>'
    + '<div style="font-size:3rem;font-weight:400;color:' + color + ';line-height:1.2">' + model.total + '</div>'
    + '</div>'
}

function falertRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ ' + msg + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [4] BOOT
// ────────────────────────────────────────────────────────────────────────────

// A âncora do painel é fixa de propósito (não referencia $switchName), por
// isso o painel nunca re-renderiza sozinho quando o dropdown muda — sem
// isto o contador ficava preso no primeiro switch carregado mesmo com o
// resto do dashboard já actualizado (mesma classe de bug do título do
// header, commit 5b3d931). Poller de 1s (barato, só lê o URL) detecta a
// mudança e refaz o RPC nesse instante; para o MESMO host, só refaz a
// cada refreshMs (60s) para não martelar a API sem necessidade.
var _falertLastSwitch = null
var _falertLastFetch  = 0

function falertLoad(rpc) {
  var el = document.getElementById(CFG_FALERT.elementId)
  if (!el) return

  var switchName = falertGetVar('switchName')
  if (!switchName) { el.innerHTML = ''; _falertLastSwitch = null; return }

  var now = Date.now()
  var changed = switchName !== _falertLastSwitch
  if (changed || now - _falertLastFetch >= CFG_FALERT.refreshMs) {
    _falertLastSwitch = switchName
    _falertLastFetch = now
    falertFetch(rpc, switchName)
      .then(function (model) { falertRender(el, model) })
      .catch(function (err) { falertRenderError(el, err.message || String(err)) })
  }

  if (window._bpc_n4falert_interval) clearInterval(window._bpc_n4falert_interval)
  window._bpc_n4falert_interval = setInterval(function () { falertLoad(rpc) }, CFG_FALERT.pollMs)
}

function falertInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(falertLoad); return }
  if (attempt > 50) { console.error('[BPC] n4-fab-alerts: waitForBPC nunca disponivel'); return }
  setTimeout(function () { falertInitWithRetry(attempt + 1) }, 100)
}

falertInitWithRetry()
