// N4 · Edifício — Switches Sede BPC
// l4-ed-switches.js
// Mostra tabela de switches APENAS para o edifício Sede (tag edificio=sede).
// Cada linha abre N6 · Switch Detalhe.
// Para todos os outros edifícios: painel fica invisível (sem mensagem).

var CFG_EDS = {
  elementId: 'bpc-ed-switches',
  groupId: '29',
  sedeTag: 'sede',
  n6DashUid: 'n6-edificio-switch',
  refreshMs: 60000,
}

function start(rpc) {
  var U = window.BPC.utils

  function urlParam(name) {
    return new URLSearchParams(window.location.search).get('var-' + name) || ''
  }

  function n6Url(swHost) {
    var base = window.location.origin + window.location.pathname.replace(/\/d\/[^/]+\/.*/, '')
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

    // Verificar tag edificio do router seleccionado
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
      if (tags.edificio !== CFG_EDS.sedeTag && tags.local !== CFG_EDS.sedeTag) {
        el.innerHTML = ''
        return
      }
      loadSwitches(el)
    })
    .catch(function () { el.innerHTML = '' })
  }

  function loadSwitches(el) {
    el.innerHTML = U.buildSkeleton()

    rpc('host.get', {
      groupids: [CFG_EDS.groupId],
      output: ['hostid', 'host', 'name'],
      selectTags: 'extend',
    })
    .then(function (hosts) {
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
      rttItems.forEach(function (i) { rttMap[i.hostid] = i.lastvalue })

      // Agrupar por andar
      var byFloor = {}
      hosts.forEach(function (h) {
        var tags = {}
        ;(h.tags || []).forEach(function (t) { tags[t.tag] = t.value })
        var floor = tags.andar || '—'
        var zone = tags.zona || ''
        var up = pingMap[h.hostid] === '1'
        var rtt = rttMap[h.hostid]
        if (!byFloor[floor]) byFloor[floor] = []
        byFloor[floor].push({ host: h.host, name: h.name, floor: floor, zone: zone, up: up, rtt: rtt })
      })

      var floors = Object.keys(byFloor).sort(function (a, b) {
        return (parseInt(a.replace(/\D/g, ''), 10) || 0) - (parseInt(b.replace(/\D/g, ''), 10) || 0)
      })

      var total = hosts.length
      var down = hosts.filter(function (h) { return pingMap[h.hostid] !== '1' }).length
      var up = total - down

      var html = '<div class="bpc" style="display:flex;flex-direction:column;gap:10px">'

      // Header
      html += '<div class="bpc-flex" style="justify-content:space-between;align-items:center">' +
        '<div class="bpc-label" style="font-size:.74rem;color:var(--bpc-cyan)">Switches · Sede BPC · ' + total + ' dispositivos</div>' +
        (down > 0
          ? '<span class="bpc-pill down">' + down + ' DOWN</span>'
          : '<span class="bpc-pill ok">Todos UP</span>') +
      '</div>'

      // Tabela
      html += '<table style="width:100%;border-collapse:collapse;font-size:.8rem">' +
        '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.08);font-size:.7rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.05em">' +
          '<th style="text-align:left;padding:4px 6px">Andar</th>' +
          '<th style="text-align:left;padding:4px 6px">Zona</th>' +
          '<th style="text-align:left;padding:4px 6px">Switch</th>' +
          '<th style="text-align:center;padding:4px 6px">Estado</th>' +
          '<th style="text-align:right;padding:4px 6px">RTT</th>' +
          '<th style="text-align:center;padding:4px 6px">N6</th>' +
        '</tr></thead><tbody>'

      floors.forEach(function (floor) {
        var rows = byFloor[floor]
        rows.forEach(function (r, idx) {
          var dot = r.up
            ? '<span style="color:var(--bpc-ok)">●</span>'
            : '<span style="color:var(--bpc-crit)">●</span>'
          var drillHref = n6Url(r.host)
          var rtrStyle = r.up ? '' : 'background:rgba(239,68,68,0.06);'

          html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.03);' + rtrStyle + '">' +
            (idx === 0
              ? '<td rowspan="' + rows.length + '" style="padding:4px 6px;font-weight:600;color:#A0B0C8;vertical-align:top;border-right:1px solid rgba(255,255,255,0.06)">' + floor + '</td>'
              : '') +
            '<td style="padding:4px 6px;color:var(--bpc-mute);font-size:.75rem">' + r.zone + '</td>' +
            '<td style="padding:4px 6px;font-family:monospace;font-size:.76rem;color:#CDD9E5">' + r.name + '</td>' +
            '<td style="padding:4px 6px;text-align:center">' + dot + '</td>' +
            '<td style="padding:4px 6px;text-align:right;color:var(--bpc-mute)">' + fmtRtt(r.rtt) + '</td>' +
            '<td style="padding:4px 6px;text-align:center">' +
              '<a href="' + drillHref + '" style="color:var(--bpc-cyan);font-size:.75rem;text-decoration:none;padding:2px 6px;border:1px solid rgba(56,189,248,0.3);border-radius:3px" title="' + r.name + '">→ N6</a>' +
            '</td>' +
          '</tr>'
        })
      })

      html += '</tbody></table></div>'
      el.innerHTML = html
    })
    .catch(function (err) {
      el.innerHTML = U.buildError('Switches Sede', err.message)
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
