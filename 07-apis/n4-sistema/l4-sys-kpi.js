// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · APIS E SERVIÇOS · SISTEMA · KPI DO SISTEMA  v1.0        ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-servico — valor da tag servico do sistema (dropdown)            ║
// ║                                                                          ║
// ║  4 KPIs: VMs do sistema · Saudáveis · Com problemas · Camadas          ║
// ║  As VMs vêm da tag servico=X (fecho multi-VM da reconciliação 7.0.5);  ║
// ║  os hosts sintéticos app-* (nome app-*) são excluídos da contagem.     ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_S4KPI = {
  elementId: 'bpc-sys-kpi',
  refreshMs: 60000,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function s4kpiGetServico() {
  return new URLSearchParams(window.location.search).get('var-servico') || ''
}

function s4kpiIsSynthetic(host) {
  return /^app-/i.test(host.host)
}

// Papel/camada da VM — parte final do visible name, depois do "|"
function s4kpiPapel(name) {
  const m = /\|\s*(.*)\)\s*$/.exec(name || '')
  return m ? m[1].trim() : 'Outros'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function s4kpiFetchVms(rpc, servico) {
  const hosts = await rpc('host.get', {
    filter: { status: 0 },
    output: ['hostid', 'host', 'name'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  return hosts.filter(function (h) { return !s4kpiIsSynthetic(h) })
}

async function s4kpiFetchTriggers(rpc, hostids) {
  if (!hostids.length) return []
  return rpc('trigger.get', {
    hostids: hostids,
    filter: { value: 1 },
    output: ['triggerid', 'priority'],
    selectHosts: ['hostid'],
    monitored: true,
    only_true: true,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function s4kpiTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const sub = opts.sub
    ? '<div style="font-size:1.0rem;color:var(--bpc-mute);line-height:1.35">' + opts.sub + '</div>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px 20px">'
    + '<span class="bpc-label" style="font-size:1.2rem;letter-spacing:.02em;text-transform:none;font-weight:700;color:#CDD9E5">' + opts.label + '</span>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:10px">'
    +   '<span style="font-size:2.6rem;font-weight:800;line-height:1.05;color:' + (state === 'ok' ? '#E6EDF3' : accent) + '">' + opts.value + '</span>'
    +   (opts.valueSuffix ? '<span style="font-size:1.1rem;color:var(--bpc-mute)">' + opts.valueSuffix + '</span>' : '')
    + '</div>'
    + sub
    + '</div>'
}

function s4kpiRender(el, vms, trigs) {
  const problemHosts = {}
  trigs.forEach(function (t) {
    (t.hosts || []).forEach(function (h) { problemHosts[h.hostid] = true })
  })
  const comProblemas = vms.filter(function (v) { return problemHosts[v.hostid] }).length
  const saudaveis = vms.length - comProblemas

  const camadas = {}
  vms.forEach(function (v) { camadas[s4kpiPapel(v.name)] = true })
  const nCamadas = Object.keys(camadas).length

  const zoneLabel = '<div style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
    + 'Estado da infraestrutura<div style="flex:1;height:1px;background:rgba(255,255,255,.09)"></div></div>'

  el.innerHTML = zoneLabel
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:calc(100% - 28px)">'
    + s4kpiTile({
        label: 'VMs do sistema', value: vms.length, valueSuffix: 'máquinas',
        state: 'ok', sub: 'todas as VMs com este serviço',
      })
    + s4kpiTile({
        label: 'Saudáveis', value: saudaveis, valueSuffix: '/ ' + vms.length,
        state: comProblemas > 0 ? 'warn' : 'ok',
        sub: Math.round((saudaveis / (vms.length || 1)) * 100) + '% do sistema sem problemas',
      })
    + s4kpiTile({
        label: 'Com problemas', value: comProblemas, valueSuffix: comProblemas === 1 ? 'máquina' : 'máquinas',
        state: comProblemas > 0 ? 'warn' : 'ok',
        sub: comProblemas > 0 ? 'ver detalhe nas camadas abaixo' : 'nenhuma',
      })
    + s4kpiTile({
        label: 'Camadas', value: nCamadas, valueSuffix: 'níveis',
        state: 'ok', sub: 'frontend · middleware · base de dados …',
      })
    + '</div>'
}

function s4kpiRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ KPI do sistema: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function s4kpiLoad(rpc) {
  const el = document.getElementById(CFG_S4KPI.elementId)
  if (!el) return

  const servico = s4kpiGetServico()
  if (!servico) {
    el.innerHTML = '<div class="bpc bpc-card"><div class="bpc-error-msg">Selecciona um sistema no menu acima.</div></div>'
    return
  }

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + [0,1,2,3].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  s4kpiFetchVms(rpc, servico).then(function (vms) {
    return s4kpiFetchTriggers(rpc, vms.map(function (v) { return v.hostid })).then(function (trigs) {
      s4kpiRender(el, vms, trigs)
    })
  }).catch(function (err) { s4kpiRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { s4kpiLoad(rpc) }, CFG_S4KPI.refreshMs)
}

function s4kpiInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(s4kpiLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-sys-kpi: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { s4kpiInitWithRetry(attempt + 1) }, 100)
}

s4kpiInitWithRetry()
