// N4 · Edifício — Links WAN P2P (operadoras)
// l4-provider-context-ed.js
//
// Edifícios usam links P2P directos (não DMVPN).
// Lê as interfaces WAN do próprio router do edifício e mostra
// Operational status + tráfego por operadora.

var CFG_P2P = {
  elementId: 'bpc-provider-ctx-ed',
  refreshMs: 60000,
}

function start(rpc) {
  var U = window.BPC.utils

  function providerFromAlias(alias) {
    // ex: "P2P_UNITEL_WAN" → "UNITEL"
    var m = alias.match(/P2P_([^_]+)_WAN/i)
    if (m) return m[1]
    // fallback: primeiro token não genérico
    return alias.replace(/P2P_|_WAN/gi, '').trim() || alias
  }

  function tokenOf(name) {
    var m = /^Interface\s+([^(:]+?)[\s(:]/.exec(name || '')
    return m ? m[1].trim() : ''
  }

  function aliasOf(name) {
    var m = /\(([^)]+)\)/.exec(name || '')
    return m ? m[1].trim() : ''
  }

  function fmtBps(b) {
    if (b == null || isNaN(b) || b <= 0) return '—'
    if (b >= 1e9) return (b / 1e9).toFixed(1) + ' Gb/s'
    if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + ' Mb/s'
    if (b >= 1e3) return (b / 1e3).toFixed(0) + ' kb/s'
    return Math.round(b) + ' b/s'
  }

  function load() {
    var el = document.getElementById(CFG_P2P.elementId)
    if (!el) return

    var host = new URLSearchParams(window.location.search).get('var-host') || ''
    if (!host) {
      el.innerHTML = '<div style="color:#64748B;font-size:12px;padding:10px">Sem edifício seleccionado.</div>'
      return
    }

    Promise.all([
      rpc('item.get', {
        filter: { host: [host], status: 0 },
        search: { name: 'Operational status' },
        output: ['name', 'lastvalue'],
      }),
      rpc('item.get', {
        filter: { host: [host], status: 0 },
        search: { name: 'Bits received' },
        output: ['name', 'lastvalue'],
      }),
    ])
    .then(function (results) {
      var opsItems = results[0], rxItems = results[1]

      // Filtrar só interfaces WAN
      var wanOps = opsItems.filter(function (i) {
        return /WAN/i.test(i.name)
      })
      var wanRx = rxItems.filter(function (i) {
        return /WAN/i.test(i.name)
      })

      // Indexar rx por token
      var rxByToken = {}
      wanRx.forEach(function (i) {
        rxByToken[tokenOf(i.name)] = parseFloat(i.lastvalue)
      })

      // Construir lista de providers
      var providers = wanOps.map(function (i) {
        var token = tokenOf(i.name)
        var alias = aliasOf(i.name)
        var provider = alias ? providerFromAlias(alias) : token
        var st = parseInt(i.lastvalue, 10)
        var rx = rxByToken[token]
        return { token: token, alias: alias, provider: provider, up: st === 1, down: st === 2, rx: rx }
      })

      if (!providers.length) {
        el.innerHTML = U.buildError('Links WAN', 'Sem interfaces WAN encontradas neste host.')
        return
      }

      render(el, providers, host)
    })
    .catch(function (err) {
      el.innerHTML = U.buildError('Links WAN P2P', err.message)
    })
  }

  function render(el, providers, host) {
    var T = window.BPC.THEME
    var downCount = providers.filter(function (p) { return p.down }).length
    var upCount = providers.filter(function (p) { return p.up }).length

    var html = '<div class="bpc" style="display:flex;flex-direction:column;gap:9px">'

    html += '<div class="bpc-flex" style="justify-content:space-between;align-items:baseline">' +
      '<div class="bpc-label" style="font-size:.74rem;color:var(--bpc-cyan)">Operadoras WAN · Links P2P do edifício</div>' +
      (downCount > 0
        ? '<span class="bpc-pill down">' + downCount + ' link(s) DOWN</span>'
        : '<span class="bpc-pill ok">' + upCount + '/' + providers.length + ' UP</span>') +
    '</div>'

    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:stretch">'
    providers.forEach(function (p) {
      var accent = p.down ? 'var(--bpc-crit)' : p.up ? 'var(--bpc-ok)' : 'var(--bpc-mute)'
      var pill = p.down
        ? '<span class="bpc-pill down">DOWN</span>'
        : p.up ? '<span class="bpc-pill ok">UP</span>'
        : '<span class="bpc-pill warn">—</span>'
      var stateClass = p.down ? 'state-down' : p.up ? 'state-ok' : 'state-warn'

      html += '<div class="bpc bpc-card ' + stateClass + '" style="--card-accent:' + accent + ';min-width:120px;flex:1;display:flex;flex-direction:column;gap:6px;padding:10px 12px">' +
        '<div style="font-size:.92rem;font-weight:700;color:#E6EDF3">' + p.provider + '</div>' +
        '<div style="font-size:.72rem;font-family:monospace;color:var(--bpc-mute)">' + p.token + '</div>' +
        pill +
        '<div class="bpc-flex-col bpc-gap-4" style="margin-top:2px">' +
          '<span class="bpc-value-sm bpc-info">' + fmtBps(p.rx) + '</span>' +
          '<span class="bpc-label">rx actual</span>' +
        '</div>' +
      '</div>'
    })
    html += '</div>'

    html += '<div class="bpc-label" style="font-size:.6rem;color:var(--bpc-mute)">Links P2P directos — estado local do router ' + host + '</div>'
    html += '</div>'
    el.innerHTML = html
  }

  U.waitForElement(CFG_P2P.elementId, function (el) {
    load()
    U.startRefresh(el, load, CFG_P2P.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-provider-context-ed: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
