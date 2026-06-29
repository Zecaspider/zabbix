// N6 · Switch — Ficha de identidade
// l6-sw-ficha.js
// Mostra nome display, andar, zona, modelo, OS, ICMP state actual
// ${switch} = h.host (IP técnico do switch)

var CFG_SWF = { elementId: 'bpc-n6-sw-ficha' }

function start(rpc) {
  var U = window.BPC.utils

  function load() {
    var el = document.getElementById(CFG_SWF.elementId)
    if (!el) return

    var sw = new URLSearchParams(window.location.search).get('var-switch') || ''
    if (!sw) {
      el.innerHTML = '<div style="color:#64748B;font-size:12px;padding:10px">Sem switch seleccionado.</div>'
      return
    }

    Promise.all([
      rpc('host.get', {
        filter: { host: [sw] },
        output: ['hostid', 'host', 'name'],
        selectTags: 'extend',
        limit: 1,
      }),
      rpc('item.get', {
        filter: { host: [sw], status: 0, key_: 'icmpping' },
        output: ['lastvalue'],
        limit: 1,
      }),
    ])
    .then(function (results) {
      var hosts = results[0], icmp = results[1]
      if (!hosts.length) {
        el.innerHTML = U.buildError('Switch', 'Host não encontrado: ' + sw)
        return
      }
      var h = hosts[0]
      var tags = {}
      ;(h.tags || []).forEach(function (t) { tags[t.tag] = t.value })
      var up = icmp.length && icmp[0].lastvalue === '1'
      var stateColor = up ? 'var(--bpc-ok)' : 'var(--bpc-crit)'
      var statePill = up
        ? '<span class="bpc-pill ok">UP</span>'
        : '<span class="bpc-pill down">DOWN</span>'

      var html = '<div class="bpc" style="display:flex;flex-direction:column;gap:8px">' +
        '<div class="bpc-flex" style="justify-content:space-between;align-items:center">' +
          '<div>' +
            '<div style="font-size:1rem;font-weight:700;color:#E6EDF3">' + (h.name || h.host) + '</div>' +
            '<div style="font-size:.72rem;font-family:monospace;color:var(--bpc-mute);margin-top:1px">' + h.host + '</div>' +
          '</div>' +
          statePill +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:.78rem">' +
          row('Andar', tags.andar || '—') +
          row('Zona', tags.zona || '—') +
          row('Modelo', tags.modelo || '—') +
          row('OS / IOS', tags.os_version || '—') +
          row('Função', tags.funcao || '—') +
          row('Fabricante', tags.fabricante || '—') +
        '</div>' +
      '</div>'

      el.innerHTML = html
    })
    .catch(function (err) {
      el.innerHTML = U.buildError('Switch ficha', err.message)
    })
  }

  function row(label, val) {
    return '<div><span style="color:var(--bpc-mute)">' + label + '</span><br>' +
      '<span style="color:#CBD5E1;font-weight:500">' + val + '</span></div>'
  }

  U.waitForElement(CFG_SWF.elementId, function () { load() })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return }
  if (attempt > 50) { console.error('[BPC] l6-sw-ficha: waitForBPC nunca disponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
