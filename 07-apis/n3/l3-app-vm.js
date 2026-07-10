// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · VMs DE HOSPEDAGEM  v2.0          ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  v2 — suporta N VMs (multi-VM real, ex.: SACC/CONTIF/ebankit): descobre ║
// ║  todas as VMs pela tag servico= partilhada com o app-*, não só a tag    ║
// ║  vm= (que aponta só ao nó principal). Gauges radiais (CPU/RAM/Disco) em ║
// ║  vez de barras lineares, drill-down por VM para o N3 Servidores        ║
// ║  Virtuais.                                                              ║
// ║                                                                          ║
// ║  CAVEAT CONHECIDO: a tag servico= pode ter colisão de sigla em casos    ║
// ║  raros já documentados (ex.: "SGC" também usada por "Gestão de          ║
// ║  Carteiras", sistema diferente) — mostra o que o Zabbix tem tagueado,   ║
// ║  não filtra por nome; ver documentacao/reconciliacao-50-sistemas-       ║
// ║  excel.md §3-bis.                                                       ║
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

async function l3vmFetchAppServico(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['host'],
    selectTags: 'extend',
  })
  if (!hosts[0]) return { servico: '', ownHost: '' }
  return { servico: l3vmTagVal(hosts[0].tags, 'servico'), ownHost: hosts[0].host }
}

// Todas as VMs com a mesma tag servico=, excluindo o proprio app-* (monitor
// sintetico, nao e VM). Ver caveat de colisao de sigla no cabecalho do ficheiro.
async function l3vmFetchVmNames(rpc, servico, ownHost) {
  if (!servico) return []
  const hosts = await rpc('host.get', {
    output: ['host'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  return hosts
    .filter(function (h) { return h.host !== ownHost && h.host.indexOf('app-') !== 0 })
    .map(function (h) { return h.host })
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

// Gauge radial SVG — anel de progresso, sem dependência externa.
function l3vmGauge(label, pct) {
  const size = 52, r = 18, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  if (pct === null) {
    return '<div style="text-align:center">'
      + '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
      +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="4"/>'
      +   '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" fill="var(--bpc-mute)" font-size="9">—</text>'
      + '</svg>'
      + '<div style="font-size:.78rem;color:var(--bpc-mute);margin-top:2px">' + label + '</div>'
      + '</div>'
  }
  const state = l3vmBarState(pct)
  const color = window.BPC.state.color(state)
  const pctR = Math.min(Math.round(pct), 100)
  const dash = (pctR / 100) * circ
  return '<div style="text-align:center">'
    + '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">'
    +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="4"/>'
    +   '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="4"'
    +     ' stroke-dasharray="' + dash + ' ' + circ + '" stroke-linecap="round"'
    +     ' transform="rotate(-90 ' + cx + ' ' + cy + ')"/>'
    +   '<text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" fill="#E6EDF3" font-size="11" font-weight="700">' + pctR + '%</text>'
    + '</svg>'
    + '<div style="font-size:.78rem;color:var(--bpc-mute);margin-top:2px">' + label + '</div>'
    + '</div>'
}

function l3vmCardHtml(vm, isPrimary) {
  const esc = window.BPC_SHARED.esc
  const link = CFG_L3VM.svN3Url + '?var-hostid=' + encodeURIComponent(vm.host)
  const arrow = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bpc-mute)" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>'
  return '<a href="' + link + '" target="_blank" class="bpc bpc-card" style="height:100%;display:flex;flex-direction:column;'
    + 'padding:12px 16px;text-decoration:none;cursor:pointer">'
    + '<div class="bpc-flex" style="justify-content:space-between;align-items:flex-start;margin-bottom:10px">'
    +   '<div style="min-width:0">'
    +     '<div style="font-size:1.0rem;font-weight:700;color:#E6EDF3">' + esc(vm.host) + '</div>'
    +     '<div style="font-size:.82rem;color:var(--bpc-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">'
    +       (isPrimary ? 'principal · ' : '') + esc(vm.name) + '</div>'
    +   '</div>'
    +   arrow
    + '</div>'
    + '<div style="display:flex;justify-content:space-around;flex:1;align-items:center">'
    +   l3vmGauge('CPU', vm.cpu) + l3vmGauge('RAM', vm.ram) + l3vmGauge('Disco', vm.disk)
    + '</div>'
    + '</a>'
}

// No máximo 4 gauges lado a lado (mais que isso fica ilegível numa linha de
// altura fixa) — sistemas com muitas VMs (ebankit ~18, SWIFT ~20) mostram as
// 4 primeiras + indicador; a lista completa fica na Ficha da Aplicação.
const L3VM_MAX_CARDS = 4

function l3vmRender(el, vms) {
  if (!vms.length) { l3vmRenderSemVm(el); return }
  const shown = vms.slice(0, L3VM_MAX_CARDS)
  const extra = vms.length - shown.length
  const cols = shown.length + (extra > 0 ? 1 : 0)
  const moreCard = extra > 0
    ? '<div class="bpc bpc-card" style="height:100%;display:flex;flex-direction:column;align-items:center;'
      + 'justify-content:center;padding:12px;text-align:center">'
      + '<span style="font-size:1.6rem;font-weight:800;color:#E6EDF3">+' + extra + '</span>'
      + '<span style="font-size:.8rem;color:var(--bpc-mute);margin-top:2px">mais VMs — ver ficha completa</span>'
      + '</div>'
    : ''
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:10px;height:100%">'
    + shown.map(function (vm, i) { return l3vmCardHtml(vm, i === 0) }).join('') + moreCard
    + '</div>'
}

function l3vmRenderSemVm(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="height:100%;display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div style="font-size:1.05rem;color:var(--bpc-mute);text-align:center">Sistema externo/parceiro — sem VM interna associada</div></div>'
}

function l3vmRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ VMs de hospedagem: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
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

  l3vmFetchAppServico(rpc, appName).then(function (info) {
    if (!info.servico) { l3vmRenderSemVm(el); return null }
    return l3vmFetchVmNames(rpc, info.servico, info.ownHost).then(function (vmNames) {
      if (!vmNames.length) { l3vmRenderSemVm(el); return null }
      return Promise.all(vmNames.map(function (vn) { return l3vmFetchVm(rpc, vn) })).then(function (vms) {
        l3vmRender(el, vms.filter(Boolean))
      })
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
