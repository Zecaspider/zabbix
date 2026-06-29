// N4 · Edifício — Switches por Edifício
// l4-ed-switches.js
// Condicional: só renderiza se o router tiver switches associados (tag local = router.edificio).
// Painel fica invisível (sem mensagem) se não houver switches. Drill → N6 por switch.

var CFG_EDS = {
  elementId: 'bpc-ed-switches',
  groupId: '29',
  n6DashUid: 'n6-edificio-switch',
  refreshMs: 60000,
}

function start(rpc) {
  var U = window.BPC.utils

  function urlParam(name) {
    return new URLSearchParams(window.location.search).get('var-' + name) || ''
  }

  function n6Url(swHost) {
    var params = new URLSearchParams({
      'var-switch': swHost,
      'var-group': 'HG_EDIFICIOS_SWITCHES',
      orgId: '1',
    })
    return '/d/' + CFG_EDS.n6DashUid + '?' + params.toString()
  }

  function fmtRtt(sec) {
    if (!sec || isNaN(sec)) return '—'
    return (parseFloat(sec) * 1000).toFixed(1) + ' ms'
  }

  function load() {
    var el = document.getElementById(CFG_EDS.elementId)
    if (!el) return

    var hostVar = urlParam('host')
    if (!hostVar) { el.innerHTML = ''; return }

    // Ler tag edificio do router seleccionado
    rpc('host.get', {
      filter: { host: [hostVar] },
      output: ['hostid'],
      selectTags: 'extend',
      limit: 1,
    })
    .then(function (hosts) {
      if (!hosts.length) { el.innerHTML = ''; return }
      var tags = {}
      ;(hosts[0].tags || []).forEach(function (t) { tags[t.tag] = t.value })
      var edificioTag = tags.edificio || tags.local || ''
      if (!edificioTag) { el.innerHTML = ''; return }
      loadSwitches(el, edificioTag)
    })
    .catch(function () { el.innerHTML = '' })
  }

  function loadSwitches(el, edificioTag) {
    el.innerHTML = U.buildSkeleton()

    rpc('host.get', {
      groupids: [CFG_EDS.groupId],
      output: ['hostid', 'host', 'name'],
      selectTags: 'extend',
    })
    .then(function (allHosts) {
      // Filtrar apenas os switches cujo tag local corresponde ao edificio do router
      var hosts = allHosts.filter(function (h) {
        var t = {}
        ;(h.tags || []).forEach(function (x) { t[x.tag] = x.value })
        return t.local === edificioTag
      })

      if (!hosts.length) { el.innerHTML = ''; return }

      var hostIds = hosts.map(function (h) { return h.hostid })

      return Promise.all([
        Promise.resolve(hosts),
        rpc('item.get', {
          hostids: hostIds,
          filter: { key_: 'icmpping', status: 0 },
          output: ['hostid', 'lastvalue'],
        }),
        rpc('item.get', {
          hostids: hostIds,
          filter: { key_: 'icmppingsec', status: 0 },
          output: ['hostid', 'lastvalue'],
        }),
      ])
    })
    .then(function (res) {
      if (!res) return
      var hosts = res[0], pingItems = res[1], rttItems = res[2]

      var pingMap = {}, rttMap = {}
      pingItems.forEach(function (i) { pingMap[i.hostid] = i.lastvalue })
      rttItems.forEach(function (i)  { rttMap[i.hostid]  = i.lastvalue })

      // Agrupar por andar, ordenar dentro de cada andar por zona+nome
      var byFloor = {}
      hosts.forEach(function (h) {
        var tags = {}
        ;(h.tags || []).forEach(function (t) { tags[t.tag] = t.value })
        var floor = tags.andar || '—'
        var zone  = tags.zona  || '—'
        var up    = pingMap[h.hostid] === '1'
        var rtt   = rttMap[h.hostid]
        if (!byFloor[floor]) byFloor[floor] = []
        byFloor[floor].push({ name: h.name, floor: floor, zone: zone, up: up, rtt: rtt })
      })

      // Ordenar andares numericamente (P0, P1, … P20)
      var floors = Object.keys(byFloor).sort(function (a, b) {
        return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0)
      })

      // Ordenar switches dentro de cada andar por zona depois nome
      floors.forEach(function (f) {
        byFloor[f].sort(function (a, b) {
          return a.zone.localeCompare(b.zone) || a.name.localeCompare(b.name)
        })
      })

      var total = hosts.length
      var nDown = hosts.filter(function (h) { return pingMap[h.hostid] !== '1' }).length

      var BORDER   = '1px solid rgba(255,255,255,0.18)'
      var BORDER_H = '2px solid rgba(255,255,255,0.30)'
      var TH_STYLE = 'padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--bpc-mute);border-bottom:' + BORDER_H + ';border-right:' + BORDER
      var TD_BASE  = 'padding:10px 12px;font-size:14px;border-bottom:' + BORDER + ';border-right:' + BORDER

      var html = '<div class="bpc" style="display:flex;flex-direction:column;gap:12px">'

      // Cabeçalho do painel
      html += '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:13px;font-weight:600;color:var(--bpc-cyan);letter-spacing:.04em">SWITCHES · EDIFÍCIO · ' + total + ' DISPOSITIVOS</span>' +
        (nDown > 0
          ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:3px 12px;font-size:13px;font-weight:600">' + nDown + ' DOWN</span>'
          : '<span style="background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.35);border-radius:4px;padding:3px 12px;font-size:13px;font-weight:600">Todos UP</span>') +
      '</div>'

      // Tabela
      html += '<table style="width:100%;border-collapse:collapse;border:' + BORDER + '">' +
        '<thead><tr style="background:rgba(255,255,255,0.04)">' +
          '<th style="' + TH_STYLE + ';width:70px">Andar</th>' +
          '<th style="' + TH_STYLE + ';width:110px">Zona</th>' +
          '<th style="' + TH_STYLE + '">Switch</th>' +
          '<th style="' + TH_STYLE + ';width:90px;text-align:center">Estado</th>' +
          '<th style="' + TH_STYLE + ';width:90px;text-align:right;border-right:none">RTT</th>' +
        '</tr></thead><tbody>'

      floors.forEach(function (floor) {
        var rows = byFloor[floor]
        rows.forEach(function (r, idx) {
          var estado = r.up
            ? '<span style="display:inline-block;min-width:54px;text-align:center;background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.35);border-radius:4px;padding:2px 8px;font-size:13px;font-weight:600">UP</span>'
            : '<span style="display:inline-block;min-width:54px;text-align:center;background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:4px;padding:2px 8px;font-size:13px;font-weight:600">DOWN</span>'
          var rowBg = r.up ? '' : 'background:rgba(239,68,68,0.05);'
          var drillHref = n6Url(r.name)

          html += '<tr style="' + rowBg + '">' +
            (idx === 0
              ? '<td rowspan="' + rows.length + '" style="' + TD_BASE + ';font-weight:700;font-size:14px;color:#A0B0C8;vertical-align:middle;text-align:center;background:rgba(255,255,255,0.03)">' + floor + '</td>'
              : '') +
            '<td style="' + TD_BASE + ';color:var(--bpc-mute)">' + r.zone + '</td>' +
            '<td style="' + TD_BASE + '">' +
              '<a href="' + drillHref + '" style="color:#CDD9E5;text-decoration:none;font-family:monospace" title="Ver N6 — ' + r.name + '">' + r.name + '</a>' +
            '</td>' +
            '<td style="' + TD_BASE + ';text-align:center">' + estado + '</td>' +
            '<td style="' + TD_BASE + ';text-align:right;color:var(--bpc-mute);border-right:none">' + fmtRtt(r.rtt) + '</td>' +
          '</tr>'
        })
      })

      html += '</tbody></table></div>'
      el.innerHTML = html
    })
    .catch(function (err) {
      el.innerHTML = U.buildError('Switches Edifício', err.message)
    })
  }

  U.waitForElement(CFG_EDS.elementId, function () {
    load()
    var el = document.getElementById(CFG_EDS.elementId)
    if (el) U.startRefresh(el, load, CFG_EDS.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return }
  if (attempt > 50) { console.error('[BPC] l4-ed-switches: waitForBPC nunca disponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
