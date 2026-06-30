// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · SERVIDORES FÍSICOS (ESXi) · TABELA DE EVENTOS          ║
// ║  v1.0 · Triggers activos do host, ordenados por severidade              ║
// ║                                                                          ║
// ║  Estrutura: [1] CFG  [2] FETCH  [3] RENDER  [4] BOOTSTRAP              ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ─────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ─────────────────────────────────────────────────────────────────────────────

var CFG_EV = {
  elementId: 'bpc-sf-l3-eventos',
  maxTriggers: 50,
}

// ─────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ─────────────────────────────────────────────────────────────────────────────

function evFetch(rpc, hostid) {
  return rpc('trigger.get', {
    hostids: [hostid],
    only_true: true,
    monitored: true,
    skipDependent: true,
    expandDescription: true,
    output: ['triggerid', 'description', 'priority', 'lastchange', 'comments'],
    sortfield: 'priority',
    sortorder: 'DESC',
    limit: CFG_EV.maxTriggers,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] RENDER
// ─────────────────────────────────────────────────────────────────────────────

var SEV = {
  5: { label: 'DESASTRE',   color: 'var(--bpc-crit)',  bg: 'rgba(229,57,53,.13)',  border: 'var(--bpc-crit)' },
  4: { label: 'ALTO',       color: 'var(--bpc-crit)',  bg: 'rgba(229,57,53,.08)',  border: 'var(--bpc-crit)' },
  3: { label: 'MÉDIO',      color: 'var(--bpc-warn)',  bg: 'rgba(251,140,0,.10)',  border: 'var(--bpc-warn)' },
  2: { label: 'AVISO',      color: 'var(--bpc-warn)',  bg: 'rgba(251,140,0,.07)',  border: 'var(--bpc-warn)' },
  1: { label: 'INFO',       color: 'var(--bpc-info)',  bg: 'rgba(66,165,245,.08)', border: 'var(--bpc-info)' },
  0: { label: 'NÃO CLASSIF',color: 'var(--bpc-ok)',   bg: 'rgba(102,187,106,.07)',border: 'var(--bpc-ok)'   },
}

function fmtDuration(lastchange) {
  var sec = Math.floor(Date.now() / 1000) - parseInt(lastchange, 10)
  if (sec < 0) sec = 0
  if (sec < 60)  return sec + 's'
  if (sec < 3600) return Math.floor(sec / 60) + 'min'
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'min'
  return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h'
}

function fmtDate(lastchange) {
  var d = new Date(parseInt(lastchange, 10) * 1000)
  var pad = function (n) { return n < 10 ? '0' + n : '' + n }
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function evRender(triggers, el) {
  if (!triggers || triggers.length === 0) {
    el.innerHTML = [
      '<div style="padding:16px 0;display:flex;align-items:center;gap:10px">',
      '<span style="font-size:22px">✔</span>',
      '<span style="font-size:15px;font-weight:600;color:var(--bpc-ok)">Sem alertas activos para este host</span>',
      '</div>',
    ].join('')
    return
  }

  var rows = triggers.map(function (t) {
    var sev = SEV[t.priority] || SEV[0]
    return [
      '<tr style="border-bottom:1px solid rgba(255,255,255,.06)">',

      // Severidade
      '<td style="padding:10px 12px;white-space:nowrap">',
      '<span style="display:inline-block;padding:3px 8px;border-radius:4px;',
      'font-size:11px;font-weight:700;letter-spacing:.6px;',
      'color:' + sev.color + ';background:' + sev.bg + ';border:1px solid ' + sev.border + '">',
      sev.label,
      '</span>',
      '</td>',

      // Descrição
      '<td style="padding:10px 12px;font-size:13px;color:var(--bpc-text);line-height:1.4">',
      escHtml(t.description),
      '</td>',

      // Início
      '<td style="padding:10px 12px;font-size:12px;color:var(--bpc-muted);white-space:nowrap">',
      fmtDate(t.lastchange),
      '</td>',

      // Duração
      '<td style="padding:10px 12px;font-size:13px;font-weight:600;color:' + sev.color + ';white-space:nowrap;text-align:right">',
      fmtDuration(t.lastchange),
      '</td>',

      '</tr>',
    ].join('')
  })

  el.innerHTML = [
    '<div style="font-size:11px;font-weight:700;letter-spacing:.8px;color:var(--bpc-muted);',
    'text-transform:uppercase;margin-bottom:8px">',
    'ALERTAS ACTIVOS (' + triggers.length + ')',
    '</div>',
    '<table style="width:100%;border-collapse:collapse">',
    '<thead>',
    '<tr style="border-bottom:1px solid rgba(255,255,255,.12)">',
    '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:600;',
    'letter-spacing:.5px;color:var(--bpc-muted);text-transform:uppercase">Severidade</th>',
    '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:600;',
    'letter-spacing:.5px;color:var(--bpc-muted);text-transform:uppercase">Descrição</th>',
    '<th style="padding:6px 12px;text-align:left;font-size:11px;font-weight:600;',
    'letter-spacing:.5px;color:var(--bpc-muted);text-transform:uppercase">Início</th>',
    '<th style="padding:6px 12px;text-align:right;font-size:11px;font-weight:600;',
    'letter-spacing:.5px;color:var(--bpc-muted);text-transform:uppercase">Duração</th>',
    '</tr>',
    '</thead>',
    '<tbody>',
    rows.join(''),
    '</tbody>',
    '</table>',
  ].join('')
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─────────────────────────────────────────────────────────────────────────────
// [4] BOOTSTRAP
// ─────────────────────────────────────────────────────────────────────────────

function start(rpc) {
  var el = document.getElementById(CFG_EV.elementId)
  if (!el) return

  var params = new URLSearchParams(window.location.search)
  var hostRaw = params.get('var-hostid') || ''
  if (!hostRaw) {
    el.innerHTML = '<div style="color:var(--bpc-muted);font-size:13px">var-hostid em falta no URL</div>'
    return
  }

  rpc('host.get', {
    filter: { name: [hostRaw] },
    output: ['hostid'],
    limit: 1,
  }).then(function (hosts) {
    if (!hosts || !hosts.length) {
      el.innerHTML = '<div style="color:var(--bpc-muted);font-size:13px">Host não encontrado: ' + escHtml(hostRaw) + '</div>'
      return
    }
    return evFetch(rpc, hosts[0].hostid).then(function (triggers) {
      evRender(triggers, el)
    })
  }).catch(function (err) {
    console.error('[BPC] l3-eventos:', err)
    el.innerHTML = '<div style="color:var(--bpc-crit);font-size:13px">Erro ao carregar eventos: ' + escHtml(String(err)) + '</div>'
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-eventos: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
