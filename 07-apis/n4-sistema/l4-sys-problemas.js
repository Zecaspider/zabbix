// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · APIS E SERVIÇOS · SISTEMA · PROBLEMAS DO SISTEMA  v1.0  ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-servico — valor da tag servico do sistema (dropdown)            ║
// ║                                                                          ║
// ║  Problemas activos de TODOS os hosts do sistema (VMs + o monitor        ║
// ║  sintético app-*). BT em vez do painel nativo porque o nativo não       ║
// ║  filtra por tag de host — só por grupo/nome.                            ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_S4PRB = {
  elementId: 'bpc-sys-problemas',
  refreshMs: 60000,
  severities: {
    0: { label: 'Não classificado', state: 'info' },
    1: { label: 'Informação',       state: 'info' },
    2: { label: 'Aviso',            state: 'warn' },
    3: { label: 'Média',            state: 'warn' },
    4: { label: 'Alta',             state: 'crit' },
    5: { label: 'Desastre',         state: 'crit' },
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function s4prbGetServico() {
  return new URLSearchParams(window.location.search).get('var-servico') || ''
}

function s4prbAge(lastchange) {
  const secs = Date.now() / 1000 - parseInt(lastchange, 10)
  const days = Math.floor(secs / 86400)
  if (days >= 1) return 'há ' + days + (days === 1 ? ' dia' : ' dias')
  const hours = Math.floor(secs / 3600)
  if (hours >= 1) return 'há ' + hours + 'h'
  return 'há ' + Math.max(1, Math.floor(secs / 60)) + 'min'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function s4prbFetch(rpc, servico) {
  const hosts = await rpc('host.get', {
    filter: { status: 0 },
    output: ['hostid', 'host', 'name'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  const ids = hosts.map(function (h) { return h.hostid })
  if (!ids.length) return []
  const trigs = await rpc('trigger.get', {
    hostids: ids,
    filter: { value: 1 },
    output: ['description', 'priority', 'lastchange'],
    selectHosts: ['host', 'name'],
    expandDescription: true,
    monitored: true,
    only_true: true,
    sortfield: 'priority',
    sortorder: 'DESC',
  })
  return trigs
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function s4prbRender(el, trigs) {
  const esc = window.BPC_SHARED.esc
  const zoneLabel = '<div style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
    + 'Alertas activos — sistema inteiro<div style="flex:1;height:1px;background:rgba(255,255,255,.09)"></div></div>'
  if (!trigs.length) {
    el.innerHTML = zoneLabel
      + '<div class="bpc bpc-card" style="--card-accent:' + window.BPC.state.color('ok') + ';height:calc(100% - 28px);display:flex;align-items:center;justify-content:center">'
      + '<div style="font-size:1.15rem;color:' + window.BPC.state.color('ok') + '">● Nenhum problema activo em todo o sistema</div></div>'
    return
  }
  const rows = trigs.map(function (t) {
    const sev = CFG_S4PRB.severities[parseInt(t.priority, 10)] || CFG_S4PRB.severities[0]
    const color = window.BPC.state.color(sev.state)
    const hostName = t.hosts && t.hosts[0] ? t.hosts[0].host : '?'
    return '<tr>'
      + '<td style="padding:6px 10px;white-space:nowrap"><span class="bpc-pill ' + (sev.state === 'crit' ? 'crit' : sev.state === 'warn' ? 'warn' : 'ok') + '" style="border-color:' + color + '">' + sev.label + '</span></td>'
      + '<td style="padding:6px 10px;font-weight:700;color:#E6EDF3;white-space:nowrap">' + esc(hostName) + '</td>'
      + '<td style="padding:6px 10px;color:#CDD9E5">' + esc(t.description) + '</td>'
      + '<td style="padding:6px 10px;color:var(--bpc-mute);white-space:nowrap">' + s4prbAge(t.lastchange) + '</td>'
      + '</tr>'
  }).join('')
  el.innerHTML = zoneLabel
    + '<div class="bpc bpc-card" style="height:calc(100% - 28px);overflow:auto;padding:8px 10px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:.95rem">'
    + '<thead><tr style="text-align:left;color:var(--bpc-mute);font-size:.85rem">'
    +   '<th style="padding:4px 10px">Severidade</th><th style="padding:4px 10px">Máquina / App</th>'
    +   '<th style="padding:4px 10px">Problema</th><th style="padding:4px 10px">Início</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</div>'
}

function s4prbRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Problemas do sistema: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function s4prbLoad(rpc) {
  const el = document.getElementById(CFG_S4PRB.elementId)
  if (!el) return

  const servico = s4prbGetServico()
  if (!servico) { el.innerHTML = ''; return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  s4prbFetch(rpc, servico).then(function (trigs) {
    s4prbRender(el, trigs)
  }).catch(function (err) { s4prbRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { s4prbLoad(rpc) }, CFG_S4PRB.refreshMs)
}

function s4prbInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(s4prbLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-sys-problemas: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { s4prbInitWithRetry(attempt + 1) }, 100)
}

s4prbInitWithRetry()
