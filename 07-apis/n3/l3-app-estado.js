// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · HERO DE ESTADO  v1.0            ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  Banner full-width: nome da app + badge grande do estado actual.         ║
// ║  Estado coerente com o N2 (mesma semântica), maintenance-aware:          ║
// ║    SEM ACESSO (DC)  host em manutencao (ex.: sem saida de rede) — cinza  ║
// ║    FORA DO AR       trigger [L1] activo — vermelho                       ║
// ║    LENTA            trigger [L2] activo — laranja                        ║
// ║    CONTEUDO ERRADO  trigger [L3] activo — amarelo                        ║
// ║    NO AR            sem problemas — verde                                 ║
// ║                                                                          ║
// ║  Estado vem de trigger.get + host.maintenance_status (Zabbix ja avaliou).║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3EST = {
  elementId: 'bpc-app-estado',
  refreshMs: 60000,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3estGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

// Deriva o estado do host — mesma ordem de prioridade do N2.
// Devolve { key, label, state, reason }
function l3estDeriveState(host, trigs) {
  const esc = window.BPC_SHARED.esc
  function problemOf(tag) {
    return trigs.find(function (t) { return t.description.indexOf(tag) !== -1 })
  }
  if (host.maintenance_status === '1') {
    return { key: 'sem-acesso', label: 'SEM ACESSO (DC)', state: 'mute',
             reason: 'monitorizacao em manutencao — sem acesso de saida a partir do DC' }
  }
  if (problemOf('[L1]')) {
    return { key: 'down', label: 'FORA DO AR', state: 'down',
             reason: 'a pagina nao responde (verificacao de disponibilidade a falhar)' }
  }
  if (problemOf('[L2]')) {
    return { key: 'lenta', label: 'LENTA', state: 'warn',
             reason: 'responde, mas mais devagar que o normal' }
  }
  if (problemOf('[L3]')) {
    var t3 = problemOf('[L3]')
    var m = /Conteudo "(.+?)" ausente/.exec(t3 ? t3.description : '')
    return { key: 'conteudo', label: 'CONTEUDO ERRADO', state: 'warn',
             reason: m ? ('texto esperado "' + esc(m[1]) + '" ausente na pagina') : 'conteudo da pagina divergente' }
  }
  return { key: 'ok', label: 'NO AR', state: 'ok',
           reason: 'pagina acessivel e sem problemas activos' }
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3estFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'host', 'name', 'maintenance_status'],
    selectTags: ['tag', 'value'],
  })
  return hosts[0] || null
}

async function l3estFetchTriggers(rpc, hostid) {
  return rpc('trigger.get', {
    hostids: [hostid],
    filter: { value: 1 },
    output: ['description', 'priority', 'lastchange'],
    monitored: true,
    only_true: true,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3estRender(el, host, trigs) {
  const esc = window.BPC_SHARED.esc
  const st = l3estDeriveState(host, trigs)
  const accent = window.BPC.state.color(st.state)
  const tagOf = function (k) {
    const t = (host.tags || []).find(function (x) { return x.tag === k })
    return t ? t.value : ''
  }
  const servico = tagOf('servico')
  const vm = tagOf('vm')
  const nome = esc(String(host.name || '').replace(' - Monitor da URL', ''))
  const sub = [servico ? 'Serviço: ' + esc(servico) : '', vm ? 'VM: ' + esc(vm) : '']
    .filter(Boolean).join('  ·  ')
  const cardSt = st.state === 'down' ? 'down' : st.state

  el.innerHTML =
    '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;align-items:center;'
    + 'justify-content:space-between;gap:24px;padding:18px 28px">'
    +   '<div style="min-width:0">'
    +     '<div style="font-size:2.0rem;font-weight:800;line-height:1.1;color:#E6EDF3;'
    +       'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + nome + '</div>'
    +     (sub ? '<div style="font-size:1.05rem;color:var(--bpc-mute);margin-top:4px">' + sub + '</div>' : '')
    +   '</div>'
    +   '<div style="text-align:right;flex-shrink:0">'
    +     '<div style="display:inline-block;padding:8px 22px;border-radius:8px;'
    +       'background:' + accent + '22;border:2px solid ' + accent + ';'
    +       'font-size:2.2rem;font-weight:800;letter-spacing:.02em;color:' + accent + '">'
    +       st.label + '</div>'
    +     '<div style="font-size:1.0rem;color:var(--bpc-mute);margin-top:6px;max-width:420px">'
    +       esc(st.reason) + '</div>'
    +   '</div>'
    + '</div>'
}

function l3estRenderNoApp(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;'
    + 'display:flex;align-items:center;padding:18px 28px">'
    + '<div class="bpc-error-msg">Selecciona uma aplicação no menu acima.</div></div>'
}

function l3estRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit);height:100%;'
    + 'display:flex;align-items:center;padding:18px 28px">'
    + '<div class="bpc-error-msg">⚠ Estado da app: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3estLoad(rpc) {
  const el = document.getElementById(CFG_L3EST.elementId)
  if (!el) return

  const appName = l3estGetAppName()
  if (!appName) { l3estRenderNoApp(el); return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  l3estFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3estRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    return l3estFetchTriggers(rpc, host.hostid).then(function (trigs) {
      l3estRender(el, host, trigs)
    })
  }).catch(function (err) { l3estRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3estLoad(rpc) }, CFG_L3EST.refreshMs)
}

function l3estInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3estLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-estado: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3estInitWithRetry(attempt + 1) }, 100)
}

l3estInitWithRetry()
