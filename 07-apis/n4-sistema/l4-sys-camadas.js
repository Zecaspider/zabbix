// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · APIS E SERVIÇOS · SISTEMA · TABELA DE CAMADAS  v1.0     ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-servico — valor da tag servico do sistema (dropdown)            ║
// ║                                                                          ║
// ║  A resposta rápida a "onde está o problema?" — 1 linha por camada com   ║
// ║  o pior CPU/RAM/Disco da camada em mini-barras e badge de estado.       ║
// ║  Desenho herdado da tabela de camadas da proposta arquivada             ║
// ║  (dash-servico-unificado.js). O drill máquina-a-máquina fica nos cards  ║
// ║  do painel seguinte (l4-sys-vms.js).                                    ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_S4CAM = {
  elementId: 'bpc-sys-camadas',
  refreshMs: 60000,
  thresholds: { warn: 70, crit: 90 }, // FALLBACK visual das barras
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function s4camGetServico() {
  return new URLSearchParams(window.location.search).get('var-servico') || ''
}

function s4camPapel(name) {
  const m = /\|\s*(.*)\)\s*$/.exec(name || '')
  return m ? m[1].trim() : 'Outros'
}

function s4camColor(pct) {
  if (pct == null) return 'var(--bpc-mute)'
  if (pct >= CFG_S4CAM.thresholds.crit) return window.BPC.state.color('crit')
  if (pct >= CFG_S4CAM.thresholds.warn) return window.BPC.state.color('warn')
  return window.BPC.state.color('ok')
}

function s4camZoneLabel(text) {
  return '<div style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
    + text + '<div style="flex:1;height:1px;background:rgba(255,255,255,.09)"></div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH  (mesmos dados do painel de cards — cada painel é autónomo)
// ────────────────────────────────────────────────────────────────────────────

async function s4camFetchAll(rpc, servico) {
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
      output: ['hostid', 'key_', 'lastvalue'],
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
  return { vms: vms, metrics: r[0], disks: r[1], trigs: r[2] }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function s4camBarCell(pct) {
  const color = s4camColor(pct)
  const txt = pct == null ? '—' : Math.round(pct) + '%'
  const width = pct == null ? 0 : Math.min(Math.round(pct), 100)
  return '<div style="display:flex;align-items:center;gap:8px;min-width:120px">'
    + '<div style="flex:1;background:rgba(255,255,255,.08);border-radius:4px;height:8px;overflow:hidden">'
    +   '<div style="width:' + width + '%;height:100%;background:' + color + '"></div>'
    + '</div>'
    + '<span style="font-size:.95rem;font-weight:700;color:' + color + ';width:44px;text-align:right">' + txt + '</span>'
    + '</div>'
}

function s4camBadge(state) {
  const label = state === 'down' ? 'CRÍTICO' : state === 'warn' ? 'AVISO' : 'OK'
  const cls = state === 'down' ? 'crit' : state === 'warn' ? 'warn' : 'ok'
  return '<span class="bpc-pill ' + cls + '" style="font-size:.85rem;font-weight:700">' + label + '</span>'
}

function s4camRender(el, data) {
  const esc = window.BPC_SHARED.esc
  const byHost = {}
  data.vms.forEach(function (v) {
    byHost[v.hostid] = { papel: s4camPapel(v.name), cpu: null, ram: null, disk: null, problems: 0, maxPrio: 0 }
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

  // agregar por camada — pior valor de cada métrica
  const camadas = {}
  Object.keys(byHost).forEach(function (id) {
    const v = byHost[id]
    if (!camadas[v.papel]) camadas[v.papel] = { n: 0, cpu: null, ram: null, disk: null, problems: 0, maxPrio: 0 }
    const c = camadas[v.papel]
    c.n++
    if (v.cpu != null && (c.cpu == null || v.cpu > c.cpu)) c.cpu = v.cpu
    if (v.ram != null && (c.ram == null || v.ram > c.ram)) c.ram = v.ram
    if (v.disk != null && (c.disk == null || v.disk > c.disk)) c.disk = v.disk
    c.problems += v.problems
    if (v.maxPrio > c.maxPrio) c.maxPrio = v.maxPrio
  })

  function stateOf(c) {
    if (c.maxPrio >= 4) return 'down'
    if (c.problems > 0) return 'warn'
    return 'ok'
  }
  const rank = { down: 0, warn: 1, ok: 2 }
  const ordem = Object.keys(camadas).sort(function (a, b) {
    const sa = rank[stateOf(camadas[a])], sb = rank[stateOf(camadas[b])]
    return sa - sb || camadas[b].n - camadas[a].n || a.localeCompare(b)
  })

  const rows = ordem.map(function (papel) {
    const c = camadas[papel]
    const st = stateOf(c)
    return '<tr>'
      + '<td style="padding:8px 12px;font-size:1.05rem;font-weight:700;color:#E6EDF3;white-space:nowrap">' + esc(papel) + '</td>'
      + '<td style="padding:8px 12px;color:var(--bpc-mute);text-align:center">' + c.n + '</td>'
      + '<td style="padding:8px 12px">' + s4camBarCell(c.cpu) + '</td>'
      + '<td style="padding:8px 12px">' + s4camBarCell(c.ram) + '</td>'
      + '<td style="padding:8px 12px">' + s4camBarCell(c.disk) + '</td>'
      + '<td style="padding:8px 12px;text-align:center;font-weight:700;color:' + (c.problems > 0 ? window.BPC.state.color(st) : 'var(--bpc-mute)') + '">' + c.problems + '</td>'
      + '<td style="padding:8px 12px;text-align:right">' + s4camBadge(st) + '</td>'
      + '</tr>'
  }).join('')

  el.innerHTML = s4camZoneLabel('Onde está o problema — por camada')
    + '<div class="bpc bpc-card" style="padding:6px 8px;overflow:auto;height:calc(100% - 28px)">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="text-align:left;color:var(--bpc-mute);font-size:.8rem;text-transform:uppercase;letter-spacing:.05em">'
    +   '<th style="padding:6px 12px">Camada</th><th style="padding:6px 12px;text-align:center">VMs</th>'
    +   '<th style="padding:6px 12px">Pior CPU</th><th style="padding:6px 12px">Pior RAM</th>'
    +   '<th style="padding:6px 12px">Pior Disco</th><th style="padding:6px 12px;text-align:center">Problemas</th>'
    +   '<th style="padding:6px 12px;text-align:right">Estado</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</div>'
}

function s4camRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Camadas do sistema: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function s4camLoad(rpc) {
  const el = document.getElementById(CFG_S4CAM.elementId)
  if (!el) return

  const servico = s4camGetServico()
  if (!servico) { el.innerHTML = ''; return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  s4camFetchAll(rpc, servico).then(function (data) {
    s4camRender(el, data)
  }).catch(function (err) { s4camRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { s4camLoad(rpc) }, CFG_S4CAM.refreshMs)
}

function s4camInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(s4camLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-sys-camadas: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { s4camInitWithRetry(attempt + 1) }, 100)
}

s4camInitWithRetry()
