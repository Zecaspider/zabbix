// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · APIS E SERVIÇOS · KPI STRIP DE DOMÍNIO  v1.0            ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC - INFRA (3_KgG43nz) · Zabbix 7.4                      ║
// ║                                                                          ║
// ║  4 KPIs de domínio (wallboard NOC):                                     ║
// ║    1. Apps monitorizados        (grupo 663, hosts app-* activos)       ║
// ║    2. Disponíveis               (sem trigger [L1] activo)              ║
// ║    3. Indisponíveis/Degradados  (trigger L1 ou L2/L3 activo)           ║
// ║    4. Alertas activos           (crit / aviso, todos os níveis)        ║
// ║                                                                          ║
// ║  Estado vem de trigger.get (Zabbix já avaliou) — nunca recalcular       ║
// ║  thresholds em JS (contrato §4A, mesmo padrão do domínio Rede/VMs).     ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_KPI_API = {
  elementId: 'bpc-api-kpi',
  refreshMs: 60000,

  groupId: '663', // BPC / APLICACOES / SINTETICOS

  // Severidades — crítico vs aviso
  trigPriority: { crit: [4, 5], warn: [2, 3] },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function kpiApiPrioState(p) {
  p = parseInt(p, 10)
  if (CFG_KPI_API.trigPriority.crit.indexOf(p) !== -1) return 'crit'
  if (CFG_KPI_API.trigPriority.warn.indexOf(p) !== -1) return 'warn'
  return 'ok'
}

// Um app conta como "indisponível" se tiver um trigger [L1] activo;
// caso contrário, se tiver qualquer outro trigger activo, "degradado".
function kpiApiHostState(hostid, byHost) {
  const t = byHost[hostid]
  if (!t) return 'ok'
  if (t.l1) return 'down'
  return 'warn'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

// Total de apps (hosts activos do grupo) — inclui maintenance_status para
// distinguir hosts suprimidos (ex.: sem acesso de saida do DC) de indisponiveis
async function kpiApiFetchTotal(rpc) {
  return rpc('host.get', {
    groupids: [CFG_KPI_API.groupId],
    filter: { status: 0 },
    output: ['hostid', 'host', 'maintenance_status'],
  })
}

// Triggers activos do grupo (raw) — a contagem crit/warn e o estado por host
// sao calculados no render, ja que so ai se sabe que hosts estao em manutencao
async function kpiApiFetchTriggers(rpc) {
  return rpc('trigger.get', {
    groupids: [CFG_KPI_API.groupId],
    filter: { value: 1 },
    output: ['triggerid', 'description', 'priority'],
    selectHosts: ['hostid'],
    monitored: true,
    only_true: true,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function kpiApiTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const sub    = opts.sub
    ? '<div style="font-size:1.05rem;color:var(--bpc-mute)">' + opts.sub + '</div>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:18px 22px">'
    + '<div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">'
    +   '<span class="bpc-label" style="font-size:1.35rem;letter-spacing:.03em;text-transform:none;font-weight:700;color:#CDD9E5">' + window.BPC_SHARED.esc(opts.label) + '</span>'
    + '</div>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:10px">'
    +   '<span class="bpc-value-lg" style="font-size:3.4rem;line-height:1;color:' + (opts.valueColor || '#E6EDF3') + '">' + opts.value + '</span>'
    +   (opts.unit ? '<span class="bpc-value-sm bpc-mute" style="font-size:1.1rem">' + opts.unit + '</span>' : '')
    + '</div>'
    + sub
    + '</div>'
}

function kpiApiRender(el, data) {
  const hosts = data.hosts
  const total = hosts.length

  // Hosts em manutencao (ex.: sem acesso de saida do DC) estao suprimidos:
  // nao contam como indisponivel nem geram alerta — vao para o bucket "sem acesso".
  const maint = {}
  hosts.forEach(function (h) { if (h.maintenance_status === '1') maint[h.hostid] = true })

  // Estado por host + contagem crit/warn, ignorando os hosts suprimidos
  const byHost = {}
  let crit = 0, warn = 0
  ;(data.trg || []).forEach(function (t) {
    const hs = t.hosts || []
    if (hs.some(function (h) { return maint[h.hostid] })) return // trigger suprimido
    const s = kpiApiPrioState(t.priority)
    if (s === 'crit') crit++
    else if (s === 'warn') warn++
    const isL1 = /\[L1\]/i.test(t.description) || /indispon/i.test(t.description)
    hs.forEach(function (h) {
      if (!byHost[h.hostid]) byHost[h.hostid] = { l1: false }
      if (isL1) byHost[h.hostid].l1 = true
    })
  })

  let down = 0, degraded = 0, semAcesso = 0
  hosts.forEach(function (h) {
    if (maint[h.hostid]) { semAcesso++; return }
    const s = kpiApiHostState(h.hostid, byHost)
    if (s === 'down') down++
    else if (s === 'warn') degraded++
  })

  const monitoravel = total - semAcesso
  const up = monitoravel - down - degraded
  const devState = down > 0 ? 'down' : degraded > 0 ? 'warn' : 'ok'
  const alrtSt = crit > 0 ? 'crit' : warn > 0 ? 'warn' : 'ok'
  const semAcessoSub = semAcesso > 0 ? ' · ' + semAcesso + ' sem acesso' : ''

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + kpiApiTile({
        label: 'Apps monitorizados', value: total, unit: 'sintéticos',
        state: 'ok',
        sub: 'Sistemas internos + Parceiros',
      })
    + kpiApiTile({
        label: 'Disponíveis', value: up, unit: '/ ' + monitoravel,
        state: devState,
        valueColor: down === 0 && degraded === 0 ? window.BPC.state.color('ok') : '#E6EDF3',
        sub: Math.round((up / (monitoravel || 1)) * 100) + '% disponibilidade',
      })
    + kpiApiTile({
        label: 'Indisponíveis / Degradados', value: down + degraded, unit: 'apps',
        state: devState,
        valueColor: (down + degraded) > 0 ? window.BPC.state.color(devState) : '#E6EDF3',
        sub: down + ' indisponível · ' + degraded + ' degradado' + semAcessoSub,
      })
    + kpiApiTile({
        label: 'Alertas activos', value: crit + warn, unit: 'alertas',
        state: alrtSt,
        valueColor: (crit + warn) > 0 ? window.BPC.state.color(alrtSt) : '#E6EDF3',
        sub: crit + ' crítico · ' + warn + ' aviso',
      })
    + '</div>'
}

function kpiApiRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ KPI APIs e Serviços: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function kpiApiLoad(rpc) {
  const el = document.getElementById(CFG_KPI_API.elementId)
  if (!el) return

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + [0,1,2,3].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  Promise.all([
    kpiApiFetchTotal(rpc),
    kpiApiFetchTriggers(rpc),
  ])
  .then(function (r) {
    kpiApiRender(el, { hosts: r[0], trg: r[1] })
  })
  .catch(function (err) { kpiApiRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { kpiApiLoad(rpc) }, CFG_KPI_API.refreshMs)
}

function kpiApiInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(kpiApiLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-kpi (APIs): window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { kpiApiInitWithRetry(attempt + 1) }, 100)
}

kpiApiInitWithRetry()
