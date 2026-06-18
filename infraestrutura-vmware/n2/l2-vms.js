// N2 VMware — Tabela VMs desligadas
// Dashboard: n2-infraestrutura-vmware (a967e936)
// Painel: bpc-vmw-vms
// v1.0 — lê window.BPC_VMW (exposto por l2-vcenter.js); sem fetch próprio

var CFG_VMW_VMS = {
  elementId:   'bpc-vmw-vms',
  defaultRows: 15,       // linhas visíveis antes do toggle
  refreshMs:   65000,    // ligeiramente desalinhado do vcenter para não colidir
  dashN2sv:    '0758c24e-d2b1-4a81-bb14-1788ac8bec68',
}

// ─── render ───────────────────────────────────────────────────────────────────

function vmw_vms_render(el) {
  var vmw = window.BPC_VMW
  if (!vmw) {
    el.innerHTML = '<div style="padding:14px;color:#6E7681;font-size:11px;font-family:monospace">A aguardar dados do painel vCenter…</div>'
    return
  }

  var vcMap    = vmw.vcenters
  var urlToVcId = vmw.urlToVcId

  // Agregar todas as VMs desligadas de todos os vCenters
  var allOff = []
  Object.keys(vcMap).forEach(function(vcId) {
    var vc = vcMap[vcId]
    if (vc._dup) return
    vc.vms.off.forEach(function(vm) {
      allOff.push({
        vcName:  vc.name,
        name:    vm.name,
        cluster: vm.cluster,
        esxi:    vm.esxi,
        stale:   vm.staleData,
      })
    })
  })
  allOff.sort(function(a, b) { return a.name.localeCompare(b.name) })

  if (!allOff.length) {
    el.innerHTML = '<div style="padding:14px 16px;display:flex;align-items:center;gap:8px">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:#3FB950;display:inline-block"></span>' +
      '<span style="font-size:13px;font-weight:600;color:#3FB950">Sem VMs desligadas</span>' +
      '</div>'
    return
  }

  var css = '<style>' +
    '#bpc-vmw-vms{font-family:"JetBrains Mono",monospace;color:#CDD9E5}' +
    '.vmsvms-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid #1C2128;font-size:13px;font-weight:600;color:#CDD9E5}' +
    '.vmsvms-badge{background:#F85149;color:#fff;border-radius:3px;padding:2px 8px;font-size:12px;font-weight:700}' +
    '.vmsvms-toggle{margin-left:auto;background:none;border:1px solid #30363D;border-radius:3px;color:#8B949E;font-size:12px;padding:3px 10px;cursor:pointer;font-family:inherit}' +
    '.vmsvms-toggle:hover{border-color:#58A6FF;color:#58A6FF}' +
    '.vmsvms-tbl{width:100%;border-collapse:collapse;font-size:13px}' +
    '.vmsvms-tbl th{text-align:left;padding:7px 14px;color:#6E7681;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #0D1117;white-space:nowrap}' +
    '.vmsvms-tbl td{padding:6px 14px;border-bottom:1px solid #0D1117;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}' +
    '.vmsvms-tbl tr:last-child td{border-bottom:none}' +
    '.vmsvms-tbl tr:hover td{background:rgba(255,255,255,0.02)}' +
    '.vmsvms-hidden{display:none}' +
    '.vmsvms-na{color:#6E7681}' +
    '.vmsvms-stale{color:#D29922;font-size:10px}' +
    '</style>'

  var def      = CFG_VMW_VMS.defaultRows
  var totalOff = allOff.length
  var toggleId = 'vmsvms-tog-' + Date.now()

  var rows = allOff.map(function(vm, i) {
    var hidCls = i >= def ? ' class="vmsvms-hidden"' : ''
    var staleTag = vm.stale ? ' <span class="vmsvms-stale">(sem dados)</span>' : ''
    return '<tr' + hidCls + '>' +
      '<td style="color:#F85149;font-size:15px">□</td>' +
      '<td>' + vm.name + staleTag + '</td>' +
      '<td style="color:#F85149">desligada</td>' +
      '<td>' + (vm.cluster || '<span class="vmsvms-na">—</span>') + '</td>' +
      '<td>' + (vm.esxi    || '<span class="vmsvms-na">—</span>') + '</td>' +
      '<td style="color:#8B949E">' + vm.vcName + '</td>' +
    '</tr>'
  }).join('')

  var toggleBtn = totalOff > def
    ? '<button class="vmsvms-toggle" id="' + toggleId + '" onclick="' +
        '(function(){' +
          'var rows=document.querySelectorAll(\'#bpc-vmw-vms .vmsvms-hidden,#bpc-vmw-vms .vmsvms-tbl tr.vmsvms-hidden\');' +
          'var btn=document.getElementById(\'' + toggleId + '\');' +
          'var collapsed=rows.length>0;' +
          'document.querySelectorAll(\'#bpc-vmw-vms .vmsvms-tbl tbody tr\').forEach(function(r,i){' +
            'if(i>=' + def + '){collapsed?r.classList.remove(\'vmsvms-hidden\'):r.classList.add(\'vmsvms-hidden\')}' +
          '});' +
          'btn.textContent=collapsed?\'↑ mostrar menos\':\'↓ ver todas ' + totalOff + ' desligadas\'' +
        '})()' +
      '">↓ ver todas ' + totalOff + ' desligadas</button>'
    : ''

  var crossNav = '<div style="padding:8px 14px;border-top:1px solid #1C2128;display:flex;align-items:center;justify-content:flex-end;">' +
    '<a href="/d/' + CFG_VMW_VMS.dashN2sv + '/n2-servidores-virtuais" style="' +
    'font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:600;' +
    'color:#58A6FF;text-decoration:none;padding:3px 10px;' +
    'border:1px solid rgba(88,166,255,.25);border-radius:4px;' +
    'background:rgba(88,166,255,.06);">' +
    'Ver todas as VMs (N2) →</a>' +
    '</div>'

  el.innerHTML = css +
    '<div class="vmsvms-hdr">' +
      'VMs desligadas <span class="vmsvms-badge">' + totalOff + '</span>' +
      toggleBtn +
    '</div>' +
    '<table class="vmsvms-tbl"><thead><tr>' +
      '<th></th><th>VM</th><th>Estado</th><th>Cluster</th><th>ESXi</th><th>vCenter</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>' +
    crossNav
}

// ─── bootstrap ────────────────────────────────────────────────────────────────

function vmw_vms_waitForData(attempt) {
  attempt = attempt || 0
  var el = document.getElementById(CFG_VMW_VMS.elementId)
  if (!el) return

  if (window.BPC_VMW) {
    vmw_vms_render(el)
    // auto-refresh: re-render quando BPC_VMW for actualizado
    if (CFG_VMW_VMS._timer) clearTimeout(CFG_VMW_VMS._timer)
    CFG_VMW_VMS._timer = setTimeout(function() {
      vmw_vms_waitForData(0)
    }, CFG_VMW_VMS.refreshMs)
    return
  }

  if (attempt > 150) {
    el.innerHTML = '<div style="padding:14px;color:#F85149;font-size:11px;font-family:monospace">[BPC] l2-vms: timeout a aguardar BPC_VMW</div>'
    return
  }
  setTimeout(function() { vmw_vms_waitForData(attempt + 1) }, 200)
}

function start_vms(rpc) {
  var el = document.getElementById(CFG_VMW_VMS.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:14px;color:#6E7681;font-size:11px;font-family:monospace">A carregar VMs…</div>'
  vmw_vms_waitForData(0)
}

function initWithRetry_vms(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start_vms)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-vms: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function() { initWithRetry_vms(attempt + 1) }, 100)
}

initWithRetry_vms()
