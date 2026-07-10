// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · FICHA COMPLETA  v1.0             ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  Nome, URL ({$URL}), VMs ligadas (tag servico= partilhada — mesmo       ║
// ║  método do l3-app-vm.js) e serviços monitorizados por VM                ║
// ║  (item service.info["X",state], 0=a correr — só mostra o que existe,   ║
// ║  nunca inventa; muitas VMs não têm nenhum item deste tipo).             ║
// ║                                                                          ║
// ║  CAVEAT: colisão de sigla conhecida em "servico" (ex. SGC) — ver         ║
// ║  documentacao/reconciliacao-50-sistemas-excel.md §3-bis.                 ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3FICHA = {
  elementId: 'bpc-app-ficha',
  refreshMs: 120000,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3fichaGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

function l3fichaTagVal(tags, key) {
  const t = (tags || []).find(function (x) { return x.tag === key })
  return t ? t.value : ''
}

// Extrai o nome do serviço da chave service.info["X",state]
function l3fichaServiceName(key) {
  const m = /service\.info\["(.+?)",state\]/.exec(key)
  return m ? m[1] : key
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3fichaFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'host', 'name'],
    selectTags: ['tag', 'value'],
  })
  return hosts[0] || null
}

async function l3fichaFetchUrl(rpc, hostid) {
  const macros = await rpc('usermacro.get', { hostids: [hostid], output: ['macro', 'value'] })
  const m = macros.find(function (x) { return x.macro === '{$URL}' })
  return m ? m.value : ''
}

async function l3fichaFetchVmNames(rpc, servico, ownHost) {
  if (!servico) return []
  const hosts = await rpc('host.get', {
    output: ['host'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  return hosts
    .filter(function (h) { return h.host !== ownHost && h.host.indexOf('app-') !== 0 })
    .map(function (h) { return h.host })
}

async function l3fichaFetchVmDetail(rpc, vmName) {
  const hosts = await rpc('host.get', { filter: { host: [vmName] }, output: ['hostid', 'host', 'name'] })
  if (!hosts[0]) return null
  const host = hosts[0]
  const items = await rpc('item.get', {
    hostids: [host.hostid], output: ['key_', 'lastvalue'], search: { key_: 'service.info' },
  })
  const services = items.map(function (i) {
    return { name: l3fichaServiceName(i.key_), running: i.lastvalue === '0' }
  })
  return { host: host.host, name: host.name, services: services }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3fichaServiceBadge(svc) {
  const esc = window.BPC_SHARED.esc
  const color = svc.running ? window.BPC.state.color('ok') : window.BPC.state.color('warn')
  return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:.82rem;color:var(--bpc-mute);'
    + 'border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:2px 8px;margin:2px 4px 2px 0">'
    + '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>'
    + esc(svc.name) + '</span>'
}

function l3fichaVmBlock(vm, isPrimary) {
  const esc = window.BPC_SHARED.esc
  const iconVm = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7F77DD" stroke-width="2" style="margin-top:2px;flex-shrink:0">'
    + '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/>'
    + '<circle cx="7" cy="7.5" r=".6" fill="#7F77DD"/><circle cx="7" cy="16.5" r=".6" fill="#7F77DD"/></svg>'
  const servicesHtml = vm.services.length
    ? vm.services.map(l3fichaServiceBadge).join('')
    : '<span style="font-size:.85rem;color:var(--bpc-mute)">sem items de serviço monitorizados nesta VM</span>'
  return '<div style="border:1px solid rgba(255,255,255,.10);border-radius:6px;padding:10px 14px;display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">'
    + iconVm
    + '<div style="min-width:0;flex:1">'
    +   '<div style="font-size:.95rem;color:#E6EDF3;font-weight:700">' + esc(vm.host)
    +     (isPrimary ? '<span style="color:var(--bpc-mute);font-weight:400"> — principal</span>' : '') + '</div>'
    +   '<div style="font-size:.82rem;color:var(--bpc-mute);margin:2px 0 6px">' + esc(vm.name) + '</div>'
    +   '<div>' + servicesHtml + '</div>'
    + '</div>'
    + '</div>'
}

function l3fichaFieldBlock(iconSvg, label, value, isLink) {
  const esc = window.BPC_SHARED.esc
  const valHtml = isLink && value
    ? '<a href="' + esc(value) + '" target="_blank" class="bpc-link">' + esc(value) + '</a>'
    : esc(value || '—')
  return '<div style="display:flex;gap:8px;align-items:flex-start">'
    + '<span style="margin-top:2px;flex-shrink:0;color:var(--bpc-mute)">' + iconSvg + '</span>'
    + '<div><span style="font-size:.8rem;color:var(--bpc-mute)">' + label + '</span><br>'
    +   '<span style="font-size:.95rem;color:#E6EDF3">' + valHtml + '</span></div>'
    + '</div>'
}

function l3fichaRender(el, host, url, vms) {
  const esc = window.BPC_SHARED.esc
  const nome = String(host.name || '').replace(' - Monitor da URL', '')
  const servico = l3fichaTagVal(host.tags, 'servico')
  const iconApp = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>'
  const iconUrl = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1"/><path d="M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1"/></svg>'

  const vmsHtml = vms.length
    ? vms.map(function (vm, i) { return l3fichaVmBlock(vm, i === 0) }).join('')
    : '<div style="font-size:.9rem;color:var(--bpc-mute)">Sistema externo/parceiro — sem VM interna associada.</div>'

  el.innerHTML = '<div class="bpc bpc-card" style="height:100%;overflow-y:auto;padding:16px 20px">'
    + '<div style="font-size:1.15rem;font-weight:700;color:#E6EDF3;margin-bottom:12px">Ficha da aplicação</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-bottom:16px">'
    +   l3fichaFieldBlock(iconApp, 'Nome', nome + (servico ? '  ·  Serviço: ' + esc(servico) : ''), false)
    +   l3fichaFieldBlock(iconUrl, 'URL', url, true)
    + '</div>'
    + '<div style="font-size:.8rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">'
    +   'VMs ligadas' + (vms.length ? ' (' + vms.length + ')' : '') + '</div>'
    + vmsHtml
    + '</div>'
}

function l3fichaRenderNoApp(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;'
    + 'display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div class="bpc-error-msg">Selecciona uma aplicação no menu acima.</div></div>'
}

function l3fichaRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Ficha da aplicação: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3fichaLoad(rpc) {
  const el = document.getElementById(CFG_L3FICHA.elementId)
  if (!el) return

  const appName = l3fichaGetAppName()
  if (!appName) { l3fichaRenderNoApp(el); return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  l3fichaFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3fichaRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    const servico = l3fichaTagVal(host.tags, 'servico')
    return Promise.all([
      l3fichaFetchUrl(rpc, host.hostid),
      l3fichaFetchVmNames(rpc, servico, host.host),
    ]).then(function (r) {
      const url = r[0], vmNames = r[1]
      return Promise.all(vmNames.map(function (vn) { return l3fichaFetchVmDetail(rpc, vn) })).then(function (vms) {
        l3fichaRender(el, host, url, vms.filter(Boolean))
      })
    })
  }).catch(function (err) { l3fichaRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3fichaLoad(rpc) }, CFG_L3FICHA.refreshMs)
}

function l3fichaInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3fichaLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-ficha: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3fichaInitWithRetry(attempt + 1) }, 100)
}

l3fichaInitWithRetry()
