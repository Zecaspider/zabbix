// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · ARMAZENAMENTO · TOP TRIGGERS  v1.0                     ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  Lista os triggers activos mais severos dos grupos 602 + 605.           ║
// ║  Colunas: Severidade · Host · Descrição · Duração                       ║
// ║                                                                          ║
// ║  [1] CFG   [2] UTILS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP          ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_TRG = {
  elementId:    'bpc-st-triggers',
  groupIds:     ['602', '605'],
  refreshMs:    60000,
  limit:        20,
  critPriority: 4,
  sevLabel: ['N/C', 'Info', 'Aviso', 'Média', 'Alto', 'Desastre'],
  sevState: ['ok',  'ok',  'warn',  'warn',  'crit', 'crit'],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] UTILS
// ────────────────────────────────────────────────────────────────────────────

function fmtDuration(epochSec) {
  if (!epochSec) return '—'
  var s = Math.floor(Date.now() / 1000) - parseInt(epochSec)
  if (s < 60)    return s + 's'
  if (s < 3600)  return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm'
  return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h'
}

function shortStorageName(name) {
  return (name || '')
    .replace(/^Storage\s+-\s+/i, '')
    .replace(/^Tape\s+-\s+/i, '')
    .replace(/\s+\[.*?\]$/, '')
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function fetchTriggersData(rpc) {
  return rpc('trigger.get', {
    groupids:    CFG_TRG.groupIds,
    only_true:   true,
    output:      ['triggerid', 'description', 'priority', 'lastchange'],
    selectHosts: ['name'],
    sortfield:   'priority',
    sortorder:   'DESC',
    limit:       CFG_TRG.limit,
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function renderTriggers(el, triggers, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state

  if (err) { el.innerHTML = window.BPC.utils.buildError('Top Triggers Storage', err); return }

  if (!triggers || !triggers.length) {
    el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
      + '<div style="font-size:.70rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);margin-bottom:10px">'
      + 'Triggers Activos · Grupos 602 + 605</div>'
      + '<div style="display:flex;align-items:center;gap:8px;padding:14px 0;color:var(--bpc-ok)">'
      + '<span style="width:8px;height:8px;border-radius:50%;background:var(--bpc-ok)"></span>'
      + '<span style="font-size:.82rem;font-weight:600">Sem problemas activos</span>'
      + '</div></div>'
    return
  }

  var rows = triggers.map(function (t) {
    var sev   = parseInt(t.priority) || 0
    var state = CFG_TRG.sevState[sev] || 'ok'
    var color = S.color(state)
    var label = CFG_TRG.sevLabel[sev] || '?'
    var host  = t.hosts && t.hosts[0] ? shortStorageName(t.hosts[0].name) : '—'

    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05)">'
      + '<td style="padding:6px 8px;white-space:nowrap">'
      + '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:.65rem;font-weight:700;background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;text-transform:uppercase">' + SH.esc(label) + '</span>'
      + '</td>'
      + '<td style="padding:6px 8px;font-size:.78rem;color:var(--bpc-mute);white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis">' + SH.esc(host) + '</td>'
      + '<td style="padding:6px 8px;font-size:.80rem;color:#E6EDF3">' + SH.esc(t.description) + '</td>'
      + '<td style="padding:6px 8px;font-size:.75rem;color:var(--bpc-mute);white-space:nowrap;text-align:right">' + fmtDuration(t.lastchange) + '</td>'
      + '</tr>'
  }).join('')

  var nCrit = triggers.filter(function (t) { return parseInt(t.priority) >= CFG_TRG.critPriority }).length
  var nWarn = triggers.length - nCrit

  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    + '<div style="font-size:.70rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute)">Triggers Activos · Grupos 602 + 605</div>'
    + '<div style="display:flex;gap:8px">'
    + (nCrit ? '<span style="font-size:.65rem;font-weight:700;color:var(--bpc-crit)">' + nCrit + ' CRÍTICO' + (nCrit > 1 ? 'S' : '') + '</span>' : '')
    + (nWarn ? '<span style="font-size:.65rem;font-weight:700;color:var(--bpc-warn)">' + nWarn + ' AVISO' + (nWarn > 1 ? 'S' : '') + '</span>' : '')
    + '</div></div>'
    + '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse;font-size:.80rem">'
    + '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.10)">'
    + '<th style="text-align:left;padding:4px 8px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Sev.</th>'
    + '<th style="text-align:left;padding:4px 8px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Host</th>'
    + '<th style="text-align:left;padding:4px 8px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Descrição</th>'
    + '<th style="text-align:right;padding:4px 8px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--bpc-mute)">Há</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
// ────────────────────────────────────────────────────────────────────────────

function startTriggers(rpc) {
  window.BPC.utils.waitForElement(CFG_TRG.elementId, function (el) {
    el.innerHTML = window.BPC.utils.buildSkeleton()

    function load() {
      fetchTriggersData(rpc)
        .then(function (data) { renderTriggers(el, data, null) })
        .catch(function (e)   { renderTriggers(el, null, e.message || String(e)) })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG_TRG.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(startTriggers); return }
  if (attempt > 50) { console.error('[BPC] l2-triggers armazenamento: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
