// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · CARD DA VM DE HOSPEDAGEM  v1.0   ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  Lê a tag vm= do app-* seleccionado; se vazia (apps externas/parceiros) ║
// ║  mostra mensagem em vez do card. CPU/RAM/Disco vêm de item.get          ║
// ║  (fonte de verdade), link de drill para o N3 de Servidores Virtuais.    ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3VM = {
  elementId: 'bpc-app-vm',
  refreshMs: 60000,
  svN3Url: 'http://10.10.126.22:3000/d/0ae673a3-44c8-41e0-98f5-f5c53473ad54/n3-sv-versao-a-bt',
  thresholds: { warn: 70, crit: 90 }, // FALLBACK — usado só se não houver trigger
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3vmGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

function l3vmTagVal(tags, key) {
  const t = (tags || []).find(function (x) { return x.tag === key })
  return t ? t.value : ''
}

function l3vmBarState(pct) {
  if (pct >= CFG_L3VM.thresholds.crit) return 'crit'
  if (pct >= CFG_L3VM.thresholds.warn) return 'warn'
  return 'ok'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3vmFetchAppTags(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid'],
    selectTags: 'extend',
  })
  return hosts[0] ? l3vmTagVal(hosts[0].tags, 'vm') : ''
}

async function l3vmFetchVm(rpc, vmName) {
  const hosts = await rpc('host.get', {
    filter: { host: [vmName] },
    output: ['hostid', 'host', 'name'],
  })
  if (!hosts[0]) return null
  const host = hosts[0]

  const results = await Promise.all([
    rpc('item.get', {
      hostids: [host.hostid],
      output: ['key_', 'lastvalue'],
      filter: { key_: ['system.cpu.util', 'vm.memory.util'] },
    }),
    rpc('item.get', {
      hostids: [host.hostid],
      output: ['key_', 'lastvalue'],
      search: { key_: 'vfs.fs.size' },
    }),
  ])
  const items = results[0].concat(results[1])

  const cpu = items.find(function (i) { return i.key_ === 'system.cpu.util' })
  const ram = items.find(function (i) { return i.key_ === 'vm.memory.util' })
  const disks = items.filter(function (i) { return /vfs\.fs\.size\[.+,pused\]/.test(i.key_) })
  const worstDisk = disks.reduce(function (max, i) {
    const v = parseFloat(i.lastvalue)
    return v > max ? v : max
  }, 0)

  return {
    host: host.host,
    name: host.name,
    cpu: cpu ? parseFloat(cpu.lastvalue) : null,
    ram: ram ? parseFloat(ram.lastvalue) : null,
    disk: disks.length ? worstDisk : null,
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3vmBar(label, pct) {
  if (pct === null) {
    return '<div style="margin-bottom:10px"><div class="bpc-flex" style="justify-content:space-between">'
      + '<span style="font-size:1.0rem;color:var(--bpc-mute)">' + label + '</span>'
      + '<span style="font-size:1.0rem;color:var(--bpc-mute)">sem dado</span></div></div>'
  }
  const state = l3vmBarState(pct)
  const color = window.BPC.state.color(state)
  const pctR = Math.round(pct)
  return '<div style="margin-bottom:10px">'
    + '<div class="bpc-flex" style="justify-content:space-between;margin-bottom:4px">'
    +   '<span style="font-size:1.0rem;color:#CDD9E5">' + label + '</span>'
    +   '<span style="font-size:1.0rem;font-weight:700;color:' + color + '">' + pctR + '%</span>'
    + '</div>'
    + '<div style="background:rgba(255,255,255,.08);border-radius:4px;height:10px;overflow:hidden">'
    +   '<div style="width:' + Math.min(pctR, 100) + '%;height:100%;background:' + color + '"></div>'
    + '</div></div>'
}

function l3vmRender(el, vm) {
  const link = CFG_L3VM.svN3Url + '?var-hostid=' + encodeURIComponent(vm.host)
  el.innerHTML = '<div class="bpc bpc-card" style="height:100%;display:flex;flex-direction:column;padding:16px 20px">'
    + '<div style="font-size:1.3rem;font-weight:700;color:#E6EDF3">' + window.BPC_SHARED.esc(vm.host) + '</div>'
    + '<div style="font-size:.95rem;color:var(--bpc-mute);margin-bottom:14px">' + window.BPC_SHARED.esc(vm.name) + '</div>'
    + l3vmBar('CPU', vm.cpu)
    + l3vmBar('RAM', vm.ram)
    + l3vmBar('Disco (pior volume)', vm.disk)
    + '<a href="' + link + '" target="_blank" class="bpc-link" style="margin-top:auto;font-size:1.0rem">→ Ver detalhe da VM (N3 Servidores Virtuais)</a>'
    + '</div>'
}

function l3vmRenderSemVm(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="height:100%;display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div style="font-size:1.05rem;color:var(--bpc-mute);text-align:center">Sistema externo/parceiro — sem VM interna associada</div></div>'
}

function l3vmRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ VM de hospedagem: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3vmLoad(rpc) {
  const el = document.getElementById(CFG_L3VM.elementId)
  if (!el) return

  const appName = l3vmGetAppName()
  if (!appName) { el.innerHTML = ''; return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  l3vmFetchAppTags(rpc, appName).then(function (vmName) {
    if (!vmName) { l3vmRenderSemVm(el); return null }
    return l3vmFetchVm(rpc, vmName).then(function (vm) {
      if (!vm) { l3vmRenderError(el, 'VM "' + vmName + '" não encontrada no Zabbix'); return }
      l3vmRender(el, vm)
    })
  }).catch(function (err) { l3vmRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3vmLoad(rpc) }, CFG_L3VM.refreshMs)
}

function l3vmInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3vmLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-vm: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3vmInitWithRetry(attempt + 1) }, 100)
}

l3vmInitWithRetry()
