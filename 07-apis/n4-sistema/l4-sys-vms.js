// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · APIS E SERVIÇOS · SISTEMA · VMs POR CAMADA  v1.0        ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-servico — valor da tag servico do sistema (dropdown)            ║
// ║                                                                          ║
// ║  Todas as VMs com tag servico=X, agrupadas pela camada/papel extraída  ║
// ║  do visible name ("… | Middleware)"). Cada card: estado, CPU/RAM/disco  ║
// ║  em mini-barras, nº de problemas, e link para o detalhe da VM no        ║
// ║  domínio 03 · Servidores Virtuais.                                      ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_S4VMS = {
  elementId: 'bpc-sys-vms',
  refreshMs: 60000,
  svN3Url: 'http://10.10.126.22:3000/d/0ae673a3-44c8-41e0-98f5-f5c53473ad54/n3-sv-versao-a-bt',
  thresholds: { warn: 70, crit: 90 }, // FALLBACK visual das barras — estado do card vem dos triggers
  sparkWindowSecs: 21600, // 6h de histórico de CPU para a sparkline de cada VM
  sparkMaxPoints: 48,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function s4vmsGetServico() {
  return new URLSearchParams(window.location.search).get('var-servico') || ''
}

function s4vmsPapel(name) {
  const m = /\|\s*(.*)\)\s*$/.exec(name || '')
  return m ? m[1].trim() : 'Outros'
}

function s4vmsBarColor(pct) {
  if (pct == null) return 'var(--bpc-mute)'
  if (pct >= CFG_S4VMS.thresholds.crit) return window.BPC.state.color('crit')
  if (pct >= CFG_S4VMS.thresholds.warn) return window.BPC.state.color('warn')
  return window.BPC.state.color('ok')
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function s4vmsFetchAll(rpc, servico) {
  const hosts = await rpc('host.get', {
    filter: { status: 0 },
    output: ['hostid', 'host', 'name'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  const vms = hosts.filter(function (h) { return !/^app-/i.test(h.host) })
  const ids = vms.map(function (v) { return v.hostid })
  if (!ids.length) return { vms: [], metrics: [], disks: [], trigs: [] }

  const r = await Promise.all([
    rpc('item.get', {
      hostids: ids,
      output: ['itemid', 'hostid', 'key_', 'lastvalue'],
      filter: { key_: ['system.cpu.util', 'vm.memory.util'] },
    }),
    rpc('item.get', {
      hostids: ids,
      output: ['hostid', 'key_', 'lastvalue'],
      search: { key_: 'vfs.fs.size' },
    }),
    rpc('trigger.get', {
      hostids: ids,
      filter: { value: 1 },
      output: ['triggerid', 'priority'],
      selectHosts: ['hostid'],
      monitored: true,
      only_true: true,
    }),
  ])

  // sparkline de CPU (6h) — 1 só history.get para todos os itens CPU, depois divide por host
  const cpuItems = r[0].filter(function (i) { return i.key_ === 'system.cpu.util' })
  const cpuItemToHost = {}
  cpuItems.forEach(function (i) { cpuItemToHost[i.itemid] = i.hostid })
  let sparkByHost = {}
  if (cpuItems.length) {
    const hist = await rpc('history.get', {
      itemids: cpuItems.map(function (i) { return i.itemid }),
      history: 0,
      time_from: Math.floor(Date.now() / 1000) - CFG_S4VMS.sparkWindowSecs,
      output: 'extend',
      sortfield: 'clock',
      sortorder: 'ASC',
    })
    const raw = {}
    hist.forEach(function (row) {
      const hid = cpuItemToHost[row.itemid]
      if (!hid) return
      if (!raw[hid]) raw[hid] = []
      raw[hid].push(parseFloat(row.value))
    })
    // downsample para no máx sparkMaxPoints por host
    Object.keys(raw).forEach(function (hid) {
      const vals = raw[hid]
      if (vals.length <= CFG_S4VMS.sparkMaxPoints) { sparkByHost[hid] = vals; return }
      const step = vals.length / CFG_S4VMS.sparkMaxPoints
      const out = []
      for (let i = 0; i < CFG_S4VMS.sparkMaxPoints; i++) out.push(vals[Math.floor(i * step)])
      sparkByHost[hid] = out
    })
  }

  return { vms: vms, metrics: r[0], disks: r[1], trigs: r[2], sparkByHost: sparkByHost }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function s4vmsBar(label, pct) {
  const color = s4vmsBarColor(pct)
  const txt = pct == null ? '—' : Math.round(pct) + '%'
  const width = pct == null ? 0 : Math.min(Math.round(pct), 100)
  return '<div style="display:flex;align-items:center;gap:6px;margin-top:4px">'
    + '<span style="font-size:.8rem;color:var(--bpc-mute);width:38px">' + label + '</span>'
    + '<div style="flex:1;background:rgba(255,255,255,.08);border-radius:3px;height:7px;overflow:hidden">'
    +   '<div style="width:' + width + '%;height:100%;background:' + color + '"></div>'
    + '</div>'
    + '<span style="font-size:.8rem;font-weight:700;color:' + color + ';width:38px;text-align:right">' + txt + '</span>'
    + '</div>'
}

function s4vmsCard(vm) {
  const state = vm.problems === 0 ? 'ok' : vm.maxPrio >= 4 ? 'down' : 'warn'
  const accent = window.BPC.state.color(state)
  const badge = vm.problems > 0
    ? '<span class="bpc-pill ' + (state === 'down' ? 'crit' : 'warn') + '" style="font-size:.75rem">' + vm.problems + ' problema' + (vm.problems > 1 ? 's' : '') + '</span>'
    : '<span style="font-size:.8rem;color:' + window.BPC.state.color('ok') + '">●</span>'
  const link = CFG_S4VMS.svN3Url + '?var-hostid=' + encodeURIComponent(vm.host)
  const spark = (vm.spark && vm.spark.length > 1)
    ? '<div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.06)">'
      + '<span style="font-size:.72rem;color:var(--bpc-mute);width:38px">CPU 6h</span>'
      + '<div style="flex:1">' + window.BPC_CHARTS.sparkline(vm.spark, s4vmsBarColor(vm.cpu)) + '</div>'
      + '</div>'
    : ''
  return '<a href="' + link + '" target="_blank" style="text-decoration:none">'
    + '<div class="bpc bpc-card state-' + (state === 'down' ? 'down' : state) + '"'
    + ' style="--card-accent:' + accent + ';padding:10px 14px;cursor:pointer">'
    + '<div class="bpc-flex" style="justify-content:space-between;align-items:center;margin-bottom:2px">'
    +   '<span style="font-size:1.05rem;font-weight:700;color:#E6EDF3">' + window.BPC_SHARED.esc(vm.host) + '</span>'
    +   badge
    + '</div>'
    + s4vmsBar('CPU', vm.cpu)
    + s4vmsBar('RAM', vm.ram)
    + s4vmsBar('Disco', vm.disk)
    + spark
    + '</div></a>'
}

function s4vmsRender(el, data) {
  const byHost = {}
  data.vms.forEach(function (v) {
    byHost[v.hostid] = { host: v.host, name: v.name, papel: s4vmsPapel(v.name), cpu: null, ram: null, disk: null, problems: 0, maxPrio: 0 }
  })
  data.metrics.forEach(function (i) {
    const v = byHost[i.hostid]
    if (!v) return
    if (i.key_ === 'system.cpu.util') v.cpu = parseFloat(i.lastvalue)
    if (i.key_ === 'vm.memory.util') v.ram = parseFloat(i.lastvalue)
  })
  data.disks.forEach(function (i) {
    const v = byHost[i.hostid]
    if (!v || !/vfs\.fs\.size\[.+,pused\]/.test(i.key_)) return
    const val = parseFloat(i.lastvalue)
    if (v.disk == null || val > v.disk) v.disk = val
  })
  data.trigs.forEach(function (t) {
    (t.hosts || []).forEach(function (h) {
      const v = byHost[h.hostid]
      if (!v) return
      v.problems++
      const p = parseInt(t.priority, 10)
      if (p > v.maxPrio) v.maxPrio = p
    })
  })

  // agrupar por camada, camadas com mais VMs primeiro, "Outros" no fim
  const grupos = {}
  Object.keys(byHost).forEach(function (id) {
    const v = byHost[id]
    if (!grupos[v.papel]) grupos[v.papel] = []
    grupos[v.papel].push(v)
  })
  const ordem = Object.keys(grupos).sort(function (a, b) {
    if (a === 'Outros') return 1
    if (b === 'Outros') return -1
    return grupos[b].length - grupos[a].length || a.localeCompare(b)
  })

  const sections = ordem.map(function (papel) {
    const cards = grupos[papel]
      .sort(function (a, b) { return a.host.localeCompare(b.host) })
      .map(s4vmsCard).join('')
    return '<div style="margin-bottom:14px">'
      + '<div style="font-size:1.05rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--bpc-cyan);margin-bottom:8px">'
      +   window.BPC_SHARED.esc(papel) + ' <span style="color:var(--bpc-mute);font-weight:400">· ' + grupos[papel].length + '</span>'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px">' + cards + '</div>'
      + '</div>'
  }).join('')

  const zoneLabel = '<div style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
    + 'Detalhe por máquina<div style="flex:1;height:1px;background:rgba(255,255,255,.09)"></div></div>'

  el.innerHTML = sections
    ? zoneLabel + sections
    : '<div class="bpc bpc-card"><div class="bpc-error-msg">Nenhuma VM encontrada com este serviço.</div></div>'
}

function s4vmsRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ VMs do sistema: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function s4vmsLoad(rpc) {
  const el = document.getElementById(CFG_S4VMS.elementId)
  if (!el) return

  const servico = s4vmsGetServico()
  if (!servico) { el.innerHTML = ''; return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  s4vmsFetchAll(rpc, servico).then(function (data) {
    s4vmsRender(el, data)
  }).catch(function (err) { s4vmsRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { s4vmsLoad(rpc) }, CFG_S4VMS.refreshMs)
}

function s4vmsInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(s4vmsLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-sys-vms: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { s4vmsInitWithRetry(attempt + 1) }, 100)
}

s4vmsInitWithRetry()
