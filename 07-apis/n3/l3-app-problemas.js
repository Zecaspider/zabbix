// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · PROBLEMAS ACTIVOS  v1.0         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  Substitui o painel nativo alexanderzobnin-zabbix-triggers-panel, que    ║
// ║  fica "No data" quando a app nao tem problemas (a maioria do tempo) —    ║
// ║  aqui o estado "sem problemas" e um resultado tratado, nao um erro.      ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3PRB = {
  elementId: 'bpc-app-problemas',
  refreshMs: 60000,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3prbGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

function l3prbAgeLabel(ts) {
  const secs = Date.now() / 1000 - ts
  const days = Math.floor(secs / 86400)
  if (days >= 1) return 'há ' + days + (days === 1 ? ' dia' : ' dias')
  const hours = Math.floor(secs / 3600)
  if (hours >= 1) return 'há ' + hours + (hours === 1 ? ' hora' : ' horas')
  const mins = Math.floor(secs / 60)
  return 'há ' + Math.max(mins, 1) + (mins === 1 ? ' minuto' : ' minutos')
}

// Prioridade Zabbix (0-5) -> chave de estado usada por window.BPC.state.color
function l3prbPrioState(p) {
  p = parseInt(p, 10)
  if (p >= 4) return 'crit'
  if (p >= 2) return 'warn'
  return 'mute'
}

const L3PRB_SEV_LABEL = { '0': 'Info', '1': 'Aviso', '2': 'Menor', '3': 'Média', '4': 'Alta', '5': 'Desastre' }

function l3prbSimplifyDescription(desc) {
  return String(desc || '')
    .replace(/^\[L1\]\s*/i, '')
    .replace(/^\[L2\]\s*/i, '')
    .replace(/^\[L3\]\s*/i, '')
    .replace(/^\[L4\]\s*/i, '')
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3prbFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'name', 'maintenance_status'],
  })
  return hosts[0] || null
}

async function l3prbFetchTriggers(rpc, hostid) {
  return rpc('trigger.get', {
    hostids: [hostid],
    filter: { value: 1 },
    output: ['description', 'priority', 'lastchange'],
    monitored: true,
    only_true: true,
    sortfield: 'priority',
    sortorder: 'DESC',
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3prbRowHtml(t) {
  const esc = window.BPC_SHARED.esc
  const st = l3prbPrioState(t.priority)
  const accent = window.BPC.state.color(st)
  return '<div style="display:flex;align-items:center;gap:14px;padding:10px 16px;'
    + 'border-left:4px solid ' + accent + ';background:' + accent + '14;border-radius:6px;margin-bottom:8px">'
    + '<span style="flex-shrink:0;min-width:70px;text-align:center;font-size:.85rem;font-weight:700;'
    +   'color:' + accent + ';text-transform:uppercase;letter-spacing:.03em">'
    +   esc(L3PRB_SEV_LABEL[t.priority] || t.priority) + '</span>'
    + '<span style="flex:1;color:#E6EDF3;font-size:1.02rem">' + esc(l3prbSimplifyDescription(t.description)) + '</span>'
    + '<span style="flex-shrink:0;color:var(--bpc-mute);font-size:.9rem">' + l3prbAgeLabel(parseInt(t.lastchange, 10)) + '</span>'
    + '</div>'
}

function l3prbRender(el, host, trigs) {
  if (host.maintenance_status === '1') {
    el.innerHTML = '<div class="bpc bpc-card state-mute" style="--card-accent:var(--bpc-mute);height:100%;'
      + 'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:20px">'
      + '<span style="font-size:1.3rem;color:var(--bpc-mute);font-weight:700">Notificações suprimidas</span>'
      + '<span style="font-size:.95rem;color:var(--bpc-mute)">host em manutenção — sem acesso a partir do DC · '
      +   trigs.length + (trigs.length === 1 ? ' problema silenciado' : ' problemas silenciados') + '</span>'
      + '</div>'
    return
  }
  if (!trigs.length) {
    el.innerHTML = '<div class="bpc bpc-card state-ok" style="--card-accent:var(--bpc-ok);height:100%;'
      + 'display:flex;flex-direction:column;justify-content:center;align-items:center;gap:6px;padding:20px">'
      + '<span style="font-size:2rem">✓</span>'
      + '<span style="font-size:1.3rem;color:#E6EDF3;font-weight:700">Sem problemas activos</span>'
      + '<span style="font-size:.95rem;color:var(--bpc-mute)">tudo saudável nesta aplicação</span>'
      + '</div>'
    return
  }
  el.innerHTML = '<div style="height:100%;overflow-y:auto;padding:4px 2px">'
    + trigs.map(l3prbRowHtml).join('') + '</div>'
}

function l3prbRenderNoApp(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;'
    + 'display:flex;align-items:center;justify-content:center;padding:20px">'
    + '<div class="bpc-error-msg">Selecciona uma aplicação no menu acima.</div></div>'
}

function l3prbRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit);height:100%;'
    + 'display:flex;align-items:center;justify-content:center;padding:20px">'
    + '<div class="bpc-error-msg">⚠ Problemas activos: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3prbLoad(rpc) {
  const el = document.getElementById(CFG_L3PRB.elementId)
  if (!el) return

  const appName = l3prbGetAppName()
  if (!appName) { l3prbRenderNoApp(el); return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  l3prbFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3prbRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    return l3prbFetchTriggers(rpc, host.hostid).then(function (trigs) {
      l3prbRender(el, host, trigs)
    })
  }).catch(function (err) { l3prbRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3prbLoad(rpc) }, CFG_L3PRB.refreshMs)
}

function l3prbInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3prbLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-problemas: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3prbInitWithRetry(attempt + 1) }, 100)
}

l3prbInitWithRetry()
