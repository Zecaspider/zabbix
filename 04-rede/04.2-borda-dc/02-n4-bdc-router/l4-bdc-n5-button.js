// N4 · Botão inteligente → N5 Interfaces (Borda DC)
// Verifica estado ICMP + existência de items SNMP antes de activar o link.
// Estados:
//   ok      → router UP + tem interfaces SNMP → botão azul activo
//   down    → ICMP ping = 0 → botão desactivado (cinzento/vermelho)
//   no-snmp → UP mas sem items de interface → botão de aviso
//   loading → a consultar

const CFG_BTN_BDC = {
  elementId: 'bpc-bdc-n5-btn',
  proxy:     'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',
  n5Uid:     'rede-n5-bdc-router-interfaces',
  refreshMs: 60000,
}

function btnBdcGetVar(name) {
  return new URLSearchParams(window.location.search).get('var-' + name) || ''
}

function btnBdcPost(method, params) {
  return fetch(CFG_BTN_BDC.proxy, {
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

function btnBdcRender(el, routerName, state) {
  const url = '/d/' + CFG_BTN_BDC.n5Uid
    + '?var-routerName=' + encodeURIComponent(routerName)
    + '&from=now-6h&to=now'

  const wrap = 'display:flex;justify-content:center;align-items:center;height:100%;gap:14px'
  const linkAlt = `<a href="${url}" style="font-size:11px;color:#6E7681;text-decoration:none;white-space:nowrap" title="Abrir N5 mesmo assim (dados históricos podem existir)">abrir na mesma →</a>`

  if (state === 'loading') {
    el.innerHTML = `<div style="${wrap}"><span style="color:#6E7681;font-size:13px">A verificar estado…</span></div>`
    return
  }

  if (state === 'down') {
    el.innerHTML = `<div style="${wrap}">
      <div style="display:inline-flex;gap:9px;align-items:center;background:#1c0e0e;border:1px solid #5a2020;border-radius:8px;padding:11px 24px;color:#8b4444;font-size:14px;font-weight:600;cursor:not-allowed">
        ⊘&nbsp; N5 · Interfaces — router DOWN, sem dados úteis
      </div>
      ${linkAlt}
    </div>`
    return
  }

  if (state === 'no-snmp') {
    el.innerHTML = `<div style="${wrap}">
      <div style="display:inline-flex;gap:9px;align-items:center;background:#1c1400;border:1px solid #6e5000;border-radius:8px;padding:11px 24px;color:#c8900a;font-size:14px;font-weight:600;cursor:not-allowed">
        ⚠&nbsp; N5 · Interfaces — sem dados SNMP
      </div>
      ${linkAlt}
    </div>`
    return
  }

  // ok
  el.innerHTML = `<div style="${wrap}">
    <a href="${url}" style="display:inline-flex;gap:10px;align-items:center;background:#10243e;border:1px solid #388BFD;border-radius:8px;padding:12px 28px;color:#58A6FF;font-size:15px;font-weight:600;text-decoration:none"
       onmouseover="this.style.background='#16325a'" onmouseout="this.style.background='#10243e'">
      &#x2913;&nbsp; N5 · Interfaces do Router — diagnóstico profundo &rarr;
    </a>
  </div>`
}

async function btnBdcLoad() {
  const el = document.getElementById(CFG_BTN_BDC.elementId)
  if (!el) return

  const routerName = btnBdcGetVar('routerName')
  if (!routerName) {
    el.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%"><span style="color:#6E7681;font-size:12px">Sem router seleccionado</span></div>'
    return
  }

  btnBdcRender(el, routerName, 'loading')

  try {
    const [pingItems, ifaceItems] = await Promise.all([
      btnBdcPost('item.get', {
        output: ['name', 'lastvalue'],
        filter: { host: [routerName], name: 'ICMP ping' },
      }),
      btnBdcPost('item.get', {
        output: ['itemid'],
        filter:  { host: [routerName] },
        search:  { name: 'Interface' },
        limit: 1,
      }),
    ])

    const pingVal  = pingItems.length ? parseFloat(pingItems[0].lastvalue) : NaN
    const isDown   = isNaN(pingVal) || pingVal < 1
    const hasSnmp  = ifaceItems.length > 0

    if (isDown)       btnBdcRender(el, routerName, 'down')
    else if (!hasSnmp) btnBdcRender(el, routerName, 'no-snmp')
    else               btnBdcRender(el, routerName, 'ok')

  } catch (e) {
    // fail-open: em caso de erro API mostrar botão activo
    btnBdcRender(el, routerName, 'ok')
  }

  setTimeout(btnBdcLoad, CFG_BTN_BDC.refreshMs)
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(function () { btnBdcLoad() })
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-bdc-n5-button: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
