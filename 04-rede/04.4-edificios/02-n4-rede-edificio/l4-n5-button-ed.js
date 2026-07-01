// N4 Edifício · Botão inteligente → N5 Interfaces
// Verifica estado ICMP + existência de items SNMP antes de activar o link.

const CFG_BTN = {
  elementId: 'bpc-n5-btn',
  proxy:     'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',
  n5Uid:     'rede-n5-edificio-interfaces',
  refreshMs: 60000,
}

function btnGetVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}

function btnPost(method, params) {
  return fetch(CFG_BTN.proxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: 1 })
  })
  .then(r => r.json())
  .then(d => {
    if (d.error) throw new Error(d.error.data || d.error.message)
    return d.result || []
  })
}

function btnRender(el, host, state) {
  const url = '/d/' + CFG_BTN.n5Uid
    + '?var-host=' + encodeURIComponent(host)
    + '&from=now-3h&to=now'

  const wrap = 'display:flex;justify-content:center;align-items:center;height:100%;gap:14px'
  const linkAlt = `<a href="${url}" style="font-size:11px;color:#6E7681;text-decoration:none;white-space:nowrap" title="Abrir N5 mesmo assim">abrir na mesma →</a>`

  if (state === 'loading') {
    el.innerHTML = `<div style="${wrap}"><span style="color:#6E7681;font-size:13px">A verificar estado…</span></div>`
    return
  }
  if (state === 'down') {
    el.innerHTML = `<div style="${wrap}">
      <div style="display:inline-flex;gap:9px;align-items:center;background:#1c0e0e;border:1px solid #5a2020;border-radius:8px;padding:11px 24px;color:#8b4444;font-size:14px;font-weight:600;cursor:not-allowed">
        ⊘&nbsp; N5 · Interfaces — edifício DOWN, sem dados úteis
      </div>${linkAlt}</div>`
    return
  }
  if (state === 'no-snmp') {
    el.innerHTML = `<div style="${wrap}">
      <div style="display:inline-flex;gap:9px;align-items:center;background:#1c1400;border:1px solid #6e5000;border-radius:8px;padding:11px 24px;color:#c8900a;font-size:14px;font-weight:600;cursor:not-allowed">
        ⚠&nbsp; N5 · Interfaces — sem dados SNMP de interface
      </div>${linkAlt}</div>`
    return
  }
  // ok
  el.innerHTML = `<div style="${wrap}">
    <a href="${url}" style="display:inline-flex;gap:10px;align-items:center;background:#10243e;border:1px solid #388BFD;border-radius:8px;padding:12px 28px;color:#58A6FF;font-size:15px;font-weight:600;text-decoration:none"
       onmouseover="this.style.background='#16325a'" onmouseout="this.style.background='#10243e'">
      &#x2913;&nbsp; N5 · Interfaces do Edifício — diagnóstico detalhado &rarr;
    </a>
  </div>`
}

async function btnLoad() {
  const el = document.getElementById(CFG_BTN.elementId)
  if (!el) return

  const host = btnGetVar('host')
  if (!host) {
    el.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%"><span style="color:#6E7681;font-size:12px">Sem edifício seleccionado</span></div>'
    return
  }

  btnRender(el, host, 'loading')

  try {
    const [pingItems, ifaceItems] = await Promise.all([
      btnPost('item.get', { output: ['name','lastvalue'], filter: { host: [host], name: 'ICMP ping' } }),
      btnPost('item.get', { output: ['itemid'], filter: { host: [host] }, search: { name: 'Interface' }, limit: 1 }),
    ])

    const pingVal = pingItems.length ? parseFloat(pingItems[0].lastvalue) : NaN
    if (isNaN(pingVal) || pingVal < 1) btnRender(el, host, 'down')
    else if (!ifaceItems.length)        btnRender(el, host, 'no-snmp')
    else                                btnRender(el, host, 'ok')
  } catch (e) {
    btnRender(el, host, 'ok')
  }

  setTimeout(btnLoad, CFG_BTN.refreshMs)
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(function () { btnLoad() }); return }
  if (attempt > 50) { console.error('[BPC] l4-n5-button-ed: waitForBPC nunca disponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
