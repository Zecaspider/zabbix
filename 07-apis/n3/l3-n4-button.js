// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · BOTÃO N4 SISTEMA  v1.0          ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  Botão inteligente (padrão l4-n5-button das Agências): só fica activo   ║
// ║  quando o serviço da app corre em MAIS de 1 VM — caso contrário mostra  ║
// ║  estado desactivado ("sistema de VM única"). Liga ao N4 · Sistema com   ║
// ║  var-servico pré-preenchido.                                            ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_N4BTN = {
  elementId: 'bpc-app-n4-btn',
  refreshMs: 300000, // topologia muda devagar — 5 min chega
  n4Url: '/d/apis-n4-sistema/n4-c2b7-apis-e-servicos-e28094-sistema',
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function n4btnGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function n4btnFetch(rpc, appName) {
  const apps = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid'],
    selectTags: 'extend',
  })
  if (!apps[0]) return { servico: '', vmCount: 0 }
  const tag = (apps[0].tags || []).find(function (t) { return t.tag === 'servico' })
  const servico = tag ? tag.value : ''
  if (!servico) return { servico: '', vmCount: 0 }

  const hosts = await rpc('host.get', {
    filter: { status: 0 },
    output: ['hostid', 'host'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  const vms = hosts.filter(function (h) { return !/^app-/i.test(h.host) })
  return { servico: servico, vmCount: vms.length }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function n4btnRender(el, data) {
  if (data.vmCount > 1) {
    const url = CFG_N4BTN.n4Url + '?var-servico=' + encodeURIComponent(data.servico)
    el.innerHTML = '<a href="' + url + '" style="text-decoration:none">'
      + '<div class="bpc bpc-card" style="--card-accent:var(--bpc-cyan);height:100%;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer">'
      + '<span style="font-size:1.15rem;font-weight:700;color:var(--bpc-cyan)">→ Ver o sistema completo · ' + data.vmCount + ' VMs (N4)</span>'
      + '</div></a>'
  } else {
    el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;display:flex;align-items:center;justify-content:center">'
      + '<span style="font-size:1.0rem;color:var(--bpc-mute)">⊘ Sistema de VM única — sem vista N4</span>'
      + '</div>'
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function n4btnLoad(rpc) {
  const el = document.getElementById(CFG_N4BTN.elementId)
  if (!el) return

  const appName = n4btnGetAppName()
  if (!appName) { el.innerHTML = ''; return }

  n4btnFetch(rpc, appName).then(function (data) {
    n4btnRender(el, data)
  }).catch(function () {
    // fail-open: em caso de erro mostra o botão genérico para o N4 sem filtro
    el.innerHTML = '<a href="' + CFG_N4BTN.n4Url + '" style="text-decoration:none">'
      + '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;display:flex;align-items:center;justify-content:center">'
      + '<span style="font-size:1.0rem;color:var(--bpc-mute)">→ N4 · Sistema</span></div></a>'
  })

  window.BPC.utils.startRefresh(el, function () { n4btnLoad(rpc) }, CFG_N4BTN.refreshMs)
}

function n4btnInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(n4btnLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-n4-button: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { n4btnInitWithRetry(attempt + 1) }, 100)
}

n4btnInitWithRetry()
