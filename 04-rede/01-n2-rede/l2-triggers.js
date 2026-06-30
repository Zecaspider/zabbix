// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · TRIGGERS ACTIVOS  v1.0                          ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║  Grupos 26+27+28+29 — todos os dispositivos de rede                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_TRG = {
  elementId: 'bpc-net-trg',
  refreshMs:  30000,
  groupIds:   ['26', '27', '28', '29'],

  severity: {
    5: { label: 'Desastre',  cls: 'bpc-crit',  icon: '✖' },
    4: { label: 'Crítico',   cls: 'bpc-crit',  icon: '✖' },
    3: { label: 'Alto',      cls: 'bpc-warn',  icon: '⚠' },
    2: { label: 'Médio',     cls: 'bpc-warn',  icon: '⚠' },
    1: { label: 'Info',      cls: 'bpc-info',  icon: 'ℹ' },
    0: { label: 'Não class.', cls: 'bpc-mute', icon: '·' },
  },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function trgEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function trgN4Link(hostname, groupIds) {
  if (groupIds.indexOf('26') >= 0)
    return '/d/rede-n4-dc-switch/n4-rede-dc-switch?var-switchName=' + encodeURIComponent(hostname)
  if (groupIds.indexOf('27') >= 0)
    return '/d/rede-n4-wan-router/n4-rede-wan-router?var-routerName=' + encodeURIComponent(hostname)
  return null // g28/g29 edifícios: N4 não existe ainda
}

function trgFmtAge(lastchange) {
  const secs = Math.floor(Date.now() / 1000) - parseInt(lastchange, 10)
  if (secs < 60)  return secs + 's'
  if (secs < 3600) return Math.floor(secs / 60) + 'm'
  if (secs < 86400) return Math.floor(secs / 3600) + 'h'
  return Math.floor(secs / 86400) + 'd'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function trgFetch(rpc) {
  const triggers = await rpc('trigger.get', {
    groupids:       CFG_TRG.groupIds,
    filter:         { value: 1 },
    monitored:      true,
    only_true:      true,
    output:         ['triggerid', 'description', 'priority', 'lastchange'],
    selectHosts:    ['hostid', 'name'],
    selectGroups:   ['groupid'],
    selectTags:     ['tag', 'value'],
    sortfield:      ['priority', 'lastchange'],
    sortorder:      'DESC',
    limit:          100,
  })

  return triggers.map(function (t) {
    const host = (t.hosts || [])[0] || {}
    const tagMap = {}
    ;(t.tags || []).forEach(function (tg) { tagMap[tg.tag] = tg.value })
    const groupIds = (t.groups || []).map(function (g) { return g.groupid })
    return {
      triggerid:  t.triggerid,
      desc:       t.description,
      priority:   parseInt(t.priority, 10),
      lastchange: t.lastchange,
      hostid:     host.hostid,
      hostname:   host.name || '—',
      funcao:     tagMap['funcao'] || '',
      groupIds:   groupIds,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function trgRender(el, rows) {
  if (!rows.length) {
    el.innerHTML = `
      <div class="bpc bpc-card" style="--card-accent:var(--bpc-ok);text-align:center;padding:24px">
        <div style="font-size:1.3rem;margin-bottom:6px">✔</div>
        <div style="color:var(--bpc-ok);font-size:1.0rem;font-weight:600">Sem alertas activos</div>
        <div style="color:var(--bpc-mute);font-size:.85rem;margin-top:4px">Grupos 26 · 27 · 28 · 29</div>
      </div>`
    return
  }

  // Contagens por severidade
  const crits = rows.filter(function (r) { return r.priority >= 4 }).length
  const warns  = rows.filter(function (r) { return r.priority >= 2 && r.priority < 4 }).length

  const rowsHtml = rows.map(function (r) {
    const sev   = CFG_TRG.severity[r.priority] || CFG_TRG.severity[0]
    const age   = trgFmtAge(r.lastchange)
    const bgRow = r.priority >= 4 ? 'rgba(239,68,68,0.04)' : r.priority >= 2 ? 'rgba(240,165,0,0.03)' : ''
    const border= r.priority >= 4 ? 'border-left:2px solid var(--bpc-crit)' : r.priority >= 2 ? 'border-left:2px solid var(--bpc-warn)' : 'border-left:2px solid transparent'

    const n4Href = trgN4Link(r.hostname, r.groupIds || [])
    const hostCell = n4Href
      ? `<a href="${n4Href}" style="color:var(--bpc-cyan);text-decoration:none;font-weight:600">${trgEsc(r.hostname)} →</a>`
      : `<span style="color:#CDD9E5;font-weight:600">${trgEsc(r.hostname)}</span>`
    return `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${bgRow};${border}">
      <td style="padding:7px 10px;width:90px">
        <span class="${sev.cls}" style="font-size:.93rem;font-weight:600">${sev.icon} ${trgEsc(sev.label)}</span>
      </td>
      <td style="padding:7px 10px;font-size:1.0rem">${hostCell}</td>
      <td style="padding:7px 10px;font-size:.96rem;color:rgba(255,255,255,0.75)">${trgEsc(r.desc)}</td>
      <td style="padding:7px 10px;font-size:.90rem;color:var(--bpc-mute);text-align:right;white-space:nowrap">${trgEsc(age)}</td>
    </tr>`
  }).join('')

  el.innerHTML = `
    <div class="bpc bpc-card" style="padding:12px 16px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="font-size:.93rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute)">Alertas Activos</span>
        ${crits > 0 ? `<span class="bpc-pill down">${crits} Crítico</span>` : ''}
        ${warns > 0  ? `<span class="bpc-pill warn">${warns} Aviso</span>`  : ''}
        <span style="margin-left:auto;font-size:.85rem;color:var(--bpc-mute)">${rows.length} total · actualizado ${new Date().toLocaleTimeString('pt-PT')}</span>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">
            <th style="padding:4px 10px;text-align:left">Severidade</th>
            <th style="padding:4px 10px;text-align:left">Host</th>
            <th style="padding:4px 10px;text-align:left">Problema</th>
            <th style="padding:4px 10px;text-align:right">Há</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`
}

function trgRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">' +
    '<div class="bpc-error-msg">⚠ Triggers Rede: ' + trgEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function trgLoad(rpc) {
  const el = document.getElementById(CFG_TRG.elementId)
  if (!el) return

  el.innerHTML = window.BPC.utils.buildSkeleton()

  trgFetch(rpc)
    .then(function (rows) { trgRender(el, rows) })
    .catch(function (err) { trgRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { trgLoad(rpc) }, CFG_TRG.refreshMs)
}

function trgInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(trgLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-triggers: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { trgInitWithRetry(attempt + 1) }, 100)
}

trgInitWithRetry()
