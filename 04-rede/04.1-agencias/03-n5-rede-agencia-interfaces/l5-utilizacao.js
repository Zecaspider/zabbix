// N5 · Utilização WAN (%) — interfaces físicas
// Mostra rx%/tx% para interfaces com ifSpeed > 0 (físicas).
// Interfaces lógicas (túneis, speed=0) aparecem em rodapé com indicação.
// Filtra pela variável $iface quando não é All (.*).

const CFG_UTI = {
  elementId: 'bpc-l5-uti',
  refreshMs:  60000,
}

// ── helpers ───────────────────────────────────────────────────────────────────

function utiVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}

function fmtBps(v) {
  if (v == null || isNaN(v) || v < 0) return '—'
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' Gbps'
  if (v >= 1e6) return (v / 1e6).toFixed(1) + ' Mbps'
  if (v >= 1e3) return (v / 1e3).toFixed(0) + ' Kbps'
  return v.toFixed(0) + ' bps'
}

function fmtSpeed(v) {
  if (!v || v <= 0) return '—'
  if (v >= 1e9) return (v / 1e9).toFixed(0) + ' Gbps'
  if (v >= 1e6) return (v / 1e6).toFixed(0) + ' Mbps'
  return (v / 1e3).toFixed(0) + ' Kbps'
}

function pctColor(pct) {
  if (pct >= 90) return '#f85149'
  if (pct >= 70) return '#d29922'
  return '#22C55E'
}

function pbar(pct, color) {
  const w = Math.min(100, Math.max(0, pct || 0)).toFixed(1)
  return '<div style="background:rgba(255,255,255,0.08);border-radius:3px;height:5px;width:100%;overflow:hidden;margin-top:2px">'
    + '<div style="height:100%;width:' + w + '%;background:' + color + ';border-radius:3px"></div>'
    + '</div>'
}

// Extrai token e nome completo de um nome de item Zabbix.
// "Interface Gi0/0/0.914(WAN UNITEL): Bits received"
//   → { token: "Gi0/0/0.914", full: "Gi0/0/0.914(WAN UNITEL)" }
function parseIfToken(itemName) {
  var m = itemName.match(/^Interface\s+([^(:]+?)(\([^)]*\))?\s*:/)
  if (!m) return null
  var token = m[1].trim()
  var alias = m[2] || ''
  return { token: token, full: token + alias }
}

// ── lógica principal ──────────────────────────────────────────────────────────

async function utiLoad(rpc, el) {
  var host  = utiVar('host')
  var iface = utiVar('iface')   // '.*' ou '' = All; token específico = filtro

  if (!host) {
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#64748B;font-size:12px">Sem agência seleccionada</div>'
    return
  }

  el.innerHTML = '<div style="padding:12px 16px;color:#64748B;font-size:12px">A calcular utilização…</div>'

  var allIfItems = await rpc('item.get', {
    output: ['name', 'lastvalue'],
    filter: { host: [host], status: 0 },
    search: { name: 'Interface ' },
    limit: 500,
  })

  // Agrupar por token de interface
  var byToken = {}
  allIfItems.forEach(function(item) {
    var parsed = parseIfToken(item.name)
    if (!parsed) return
    var t = parsed.token
    if (!byToken[t]) byToken[t] = { token: t, full: parsed.full, rx: null, tx: null, speed: null }
    var d = byToken[t]
    if (item.name.endsWith(': Bits received'))  d.rx    = parseFloat(item.lastvalue)
    if (item.name.endsWith(': Bits sent'))       d.tx    = parseFloat(item.lastvalue)
    if (item.name.endsWith(': Speed'))           d.speed = parseFloat(item.lastvalue)
  })

  // Filtrar por iface se não for All
  var ifaceFilter = (iface && iface !== '.*' && iface !== '$__all' && iface !== '') ? iface : null

  var physical = []
  var tunnels  = []

  Object.keys(byToken).forEach(function(t) {
    var d = byToken[t]
    if (d.speed === null) return          // sem item de speed — ignorar
    if (ifaceFilter && d.token !== ifaceFilter) return
    if (d.speed > 0) physical.push(d)
    else             tunnels.push(d)
  })

  // Ordenar físicas por maior utilização máx (rx ou tx)
  physical.sort(function(a, b) {
    var uA = Math.max((a.rx || 0) / a.speed, (a.tx || 0) / a.speed)
    var uB = Math.max((b.rx || 0) / b.speed, (b.tx || 0) / b.speed)
    return uB - uA
  })

  // Quando All: filtrar interfaces com tráfego activo (sem scroll no painel)
  var hiddenCount = 0
  if (!ifaceFilter) {
    var active = physical.filter(function(d) { return (d.rx || 0) > 0 || (d.tx || 0) > 0 })
    hiddenCount = physical.length - active.length
    physical = active.slice(0, 4)   // máx 4 interfaces activas (evita scroll)
  }

  // ── render ─────────────────────────────────────────────────────────────────
  var html = '<div style="padding:12px 16px;font-family:Inter,\'Segoe UI\',sans-serif">'

  html += '<div style="font-size:10.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#64748B;margin-bottom:10px">Utilização WAN — Interfaces Físicas</div>'

  if (physical.length === 0 && ifaceFilter) {
    // Interface seleccionada é túnel
    html += '<div style="padding:10px 12px;background:rgba(14,20,60,0.55);border:1px solid rgba(255,255,255,0.08);border-radius:8px;border-left:3px solid #64748B">'
      + '<div style="font-size:12px;font-weight:700;color:#E6EDF3;margin-bottom:4px">' + ifaceFilter + '</div>'
      + '<div style="font-size:11px;color:#d29922">Interface lógica (túnel) — ifSpeed = 0, utilização % N/A</div>'
      + '</div>'
  } else if (physical.length === 0) {
    html += '<div style="color:#64748B;font-size:12px">Sem interfaces físicas com ifSpeed &gt; 0 para ' + host + '</div>'
  } else {
    physical.forEach(function(d) {
      var rxPct = d.rx != null ? (d.rx / d.speed) * 100 : 0
      var txPct = d.tx != null ? (d.tx / d.speed) * 100 : 0
      var worst = Math.max(rxPct, txPct)
      var bord  = pctColor(worst)

      html += '<div style="margin-bottom:8px;padding:10px 12px;background:rgba(14,20,60,0.55);border:1px solid rgba(255,255,255,0.08);border-radius:8px;border-left:3px solid ' + bord + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'
        +   '<span style="font-size:12px;font-weight:700;color:#E6EDF3">' + d.full + '</span>'
        +   '<span style="font-size:10.5px;color:#64748B">' + fmtSpeed(d.speed) + '</span>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +   '<div>'
        +     '<div style="display:flex;justify-content:space-between">'
        +       '<span style="font-size:10px;color:#64748B;letter-spacing:.05em;text-transform:uppercase">RX</span>'
        +       '<span style="font-size:11px;font-weight:700;color:' + pctColor(rxPct) + '">' + rxPct.toFixed(1) + '%</span>'
        +     '</div>'
        +     pbar(rxPct, pctColor(rxPct))
        +     '<div style="font-size:10px;color:#64748B;margin-top:2px">' + fmtBps(d.rx) + '</div>'
        +   '</div>'
        +   '<div>'
        +     '<div style="display:flex;justify-content:space-between">'
        +       '<span style="font-size:10px;color:#64748B;letter-spacing:.05em;text-transform:uppercase">TX</span>'
        +       '<span style="font-size:11px;font-weight:700;color:' + pctColor(txPct) + '">' + txPct.toFixed(1) + '%</span>'
        +     '</div>'
        +     pbar(txPct, pctColor(txPct))
        +     '<div style="font-size:10px;color:#64748B;margin-top:2px">' + fmtBps(d.tx) + '</div>'
        +   '</div>'
        + '</div>'
        + '</div>'
    })
  }

  // Rodapé: notas quando All
  if (!ifaceFilter) {
    var notes = []
    if (hiddenCount > 0) notes.push(hiddenCount + ' física(s) sem tráfego ocultada(s)')
    if (tunnels.length > 0) notes.push(tunnels.length + ' túnel(is) excluído(s) — ifSpeed = 0')
    if (notes.length > 0) {
      html += '<div style="font-size:10px;color:#64748B;margin-top:4px;padding:5px 8px;background:rgba(255,255,255,0.03);border-radius:4px;border-left:2px solid rgba(255,255,255,0.10)">'
        + notes.join(' · ')
        + '</div>'
    }
  }

  html += '</div>'
  el.innerHTML = html

  setTimeout(function() {
    utiLoad(rpc, document.getElementById(CFG_UTI.elementId)).catch(function() {})
  }, CFG_UTI.refreshMs)
}

// ── bootstrap ─────────────────────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG_UTI.elementId, function(el) {
    utiLoad(rpc, el).catch(function(e) {
      var el2 = document.getElementById(CFG_UTI.elementId)
      if (el2) el2.innerHTML = BPC.utils.buildError('Utilização WAN', e.message)
    })
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l5-utilizacao: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function() { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
