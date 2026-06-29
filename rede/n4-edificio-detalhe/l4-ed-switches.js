// N4 · Edifício — Switches (adaptativo)
// l4-ed-switches.js
// Só mostra conteúdo para o Edifício Sede (edificio=sede, grupo 29).
// Para os restantes 8 edifícios não há switches monitorizados.

var CFG_EDS = {
  elementId: 'bpc-ed-switches',
  groupId: '29',             // HG_EDIFICIOS_SWITCHES
  sedeEdificio: 'sede',      // único edifício com switches monitorizados
  refreshMs: 60000,
  thresholds: {
    lossPct: { warn: 1, crit: 5 },
    rttMs:   { warn: 5, crit: 50 },
  },
}

// ── helpers ───────────────────────────────────────────────────────────────────

function edsVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}

function edsEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function edsFmtUptime(secs) {
  secs = parseInt(secs, 10)
  if (!secs || isNaN(secs)) return '—'
  var d = Math.floor(secs / 86400)
  var h = Math.floor((secs % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function edsStateColor(up, lossPct, rttMs) {
  var T = window.BPC.THEME
  if (up === false || up === null) return T.colorCrit
  var T2 = CFG_EDS.thresholds
  if (lossPct > T2.lossPct.crit || rttMs > T2.rttMs.crit) return T.colorCrit
  if (lossPct > T2.lossPct.warn || rttMs > T2.rttMs.warn) return T.colorWarn
  return T.colorOk
}


// ── main ──────────────────────────────────────────────────────────────────────

function edsLoad(rpc) {
  var el = document.getElementById(CFG_EDS.elementId)
  if (!el) return

  var hostVar = edsVar('host')
  if (!hostVar) {
    el.innerHTML = '<div style="color:#64748B;font-size:12px;padding:10px">Sem edifício seleccionado.</div>'
    return
  }

  // Verificar se este edifício tem switches — buscar tags do host
  rpc('host.get', {
    filter: { host: [hostVar] },
    output: ['hostid', 'host'],
    selectTags: 'extend',
    limit: 1,
  })
  .then(function (hosts) {
    if (!hosts.length) {
      el.innerHTML = '<div style="color:#64748B;font-size:12px;padding:10px">Host não encontrado.</div>'
      return
    }
    var h = hosts[0]
    var tags = h.tags || []
    var edificio = ''
    for (var i = 0; i < tags.length; i++) {
      if (tags[i].tag === 'edificio') { edificio = tags[i].value; break }
    }

    if (edificio !== CFG_EDS.sedeEdificio) {
      // Edifício sem switches monitorizados — estado informativo
      el.innerHTML =
        '<div class="bpc" style="padding:12px 14px;background:rgba(14,20,60,0.35);border:1px solid rgba(255,255,255,0.06);border-radius:8px">' +
          '<div class="bpc-label" style="margin-bottom:6px">Switches</div>' +
          '<div style="font-size:.82rem;color:#64748B;line-height:1.5">' +
            'Sem switches monitorizados neste edifício.<br>' +
            '<span style="font-size:.75rem;opacity:.7">Apenas o Edifício Sede tem cobertura de switches (46 Cisco C9200L, pisos P0-P20).</span>' +
          '</div>' +
        '</div>'
      return
    }

    // Sede — carregar switches
    edsLoadSede(rpc, el)
  })
  .catch(function (err) {
    el.innerHTML = '<div class="bpc-error-msg">⚠ Switches: ' + edsEsc(err.message) + '</div>'
  })
}

function edsLoadSede(rpc, el) {
  el.innerHTML = window.BPC.utils.buildSkeleton()

  Promise.all([
    rpc('host.get', {
      groupids: [CFG_EDS.groupId],
      output: ['hostid', 'name'],
      selectTags: 'extend',
    }),
  ])
  .then(function (results) {
    var hosts = results[0]
    if (!hosts.length) {
      el.innerHTML = '<div style="color:#64748B;font-size:12px;padding:10px">Sem switches no grupo.</div>'
      return
    }
    var hostIds = hosts.map(function (h) { return h.hostid })

    return Promise.all([
      Promise.resolve(hosts),
      rpc('item.get', {
        hostids: hostIds, search: { key_: 'icmpping' }, filter: { status: 0 },
        output: ['hostid', 'key_', 'lastvalue'],
      }),
      rpc('item.get', {
        hostids: hostIds, filter: { key_: 'system.uptime', status: 0 },
        output: ['hostid', 'lastvalue'],
      }),
    ])
  })
  .then(function (results) {
    if (!results) return
    var hosts = results[0], icmpItems = results[1], uptItems = results[2]

    var icmp = {}, uptMap = {}
    icmpItems.forEach(function (i) {
      if (!icmp[i.hostid]) icmp[i.hostid] = { up: null, rtt: 0, loss: 0 }
      var h = icmp[i.hostid]
      if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
      if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
      if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
    })
    uptItems.forEach(function (i) { uptMap[i.hostid] = i.lastvalue })

    // Agrupar por andar
    var byAndar = {}
    hosts.forEach(function (h) {
      var tagMap = {}
      ;(h.tags || []).forEach(function (t) { tagMap[t.tag] = t.value })
      var andar = tagMap['andar'] || '—'
      var zona  = tagMap['zona']  || ''
      var ic    = icmp[h.hostid] || { up: null, rtt: 0, loss: 0 }

      if (!byAndar[andar]) byAndar[andar] = []
      byAndar[andar].push({
        name:    h.name,
        zona:    zona,
        up:      ic.up,
        rttMs:   ic.rtt,
        lossPct: ic.loss,
        uptime:  uptMap[h.hostid] || null,
      })
    })

    var andares = Object.keys(byAndar).sort(function(a, b) {
      // ordenar por número de piso: P0, P1, P2...
      var na = parseInt(a.replace(/\D/g,''), 10) || 0
      var nb = parseInt(b.replace(/\D/g,''), 10) || 0
      return na - nb
    })

    // Estatísticas globais
    var allRows = hosts.map(function(h) { return icmp[h.hostid] || { up: null, rtt:0, loss:0 } })
    var down = allRows.filter(function(r) { return r.up === false || r.up === null }).length
    var ok   = allRows.length - down

    var html = '<div class="bpc" style="display:flex;flex-direction:column;gap:12px">'

    // Cabeçalho
    html += '<div class="bpc-flex" style="justify-content:space-between;align-items:center">' +
      '<div class="bpc-label" style="font-size:.74rem;color:var(--bpc-cyan)">Switches · Sede BPC · ' + hosts.length + ' dispositivos</div>' +
      (down > 0
        ? '<span class="bpc-pill down">' + down + ' down</span>'
        : '<span class="bpc-pill ok">Todos OK</span>') +
    '</div>'

    // Tabela por andar
    html += '<table style="width:100%;border-collapse:collapse;font-size:.82rem">' +
      '<thead><tr style="font-size:.72rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">' +
        '<th style="padding:4px 8px;text-align:left">Andar</th>' +
        '<th style="padding:4px 8px;text-align:left">Zona</th>' +
        '<th style="padding:4px 8px;text-align:left">Host</th>' +
        '<th style="padding:4px 8px;text-align:center">Estado</th>' +
        '<th style="padding:4px 8px;text-align:right">RTT</th>' +
        '<th style="padding:4px 8px;text-align:right">Uptime</th>' +
      '</tr></thead><tbody>'

    andares.forEach(function(andar) {
      var rows = byAndar[andar]
      rows.forEach(function(r, idx) {
        var color = edsStateColor(r.up, r.lossPct, r.rttMs)
        var dot = '<span style="color:' + color + '">●</span>'
        var rttStr = r.rttMs ? r.rttMs.toFixed(1) + ' ms' : '—'

        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03)">' +
          // Andar — só na primeira linha do grupo
          (idx === 0
            ? '<td rowspan="' + rows.length + '" style="padding:4px 8px;font-weight:600;color:#a0b0c8;vertical-align:top">' + edsEsc(andar) + '</td>'
            : '') +
          '<td style="padding:4px 8px;color:#64748B;font-size:.78rem">' + edsEsc(r.zona) + '</td>' +
          '<td style="padding:4px 8px;color:#CDD9E5;font-family:monospace;font-size:.78rem">' + edsEsc(r.name) + '</td>' +
          '<td style="padding:4px 8px;text-align:center">' + dot + '</td>' +
          '<td style="padding:4px 8px;text-align:right;color:#64748B">' + rttStr + '</td>' +
          '<td style="padding:4px 8px;text-align:right;color:#64748B">' + edsEsc(edsFmtUptime(r.uptime)) + '</td>' +
        '</tr>'
      })
    })

    html += '</tbody></table></div>'
    el.innerHTML = html
  })
  .catch(function (err) {
    el.innerHTML = '<div class="bpc-error-msg">⚠ Switches Sede: ' + edsEsc(err.message) + '</div>'
  })
}


// ── bootstrap ─────────────────────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG_EDS.elementId, function (el) {
    edsLoad(rpc)
    BPC.utils.startRefresh(el, function () { edsLoad(rpc) }, CFG_EDS.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-ed-switches: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
