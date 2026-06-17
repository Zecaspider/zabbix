// N3 VMware — Detalhe de vCenter
// Dashboard: n3-vcenter-detalhe (59e7e4b2)
// Painel: bpc-vmw-vc-detalhe
// Lê ?var-vcenter_hostid=<hostid> do URL para filtrar ao vCenter seleccionado.

var CFG_VMW_VCD = {
  elementId:    'bpc-vmw-vc-detalhe',
  groupIdESXi:  '608',
  groupIdVMs:   '609',
  refreshMs:    60000,
  staleThreshold: 3600,
  PROXY: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api',
  statusColor: ['#6E7681','#3FB950','#D29922','#F85149'],
  statusLabel: ['?','OK','WARN','CRIT'],
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function vcd_normalizeUrl(url) {
  return (url || '').toLowerCase().replace(/\/sdk$/, '').replace(/\/$/, '').trim()
}

function vcd_getParam(name) {
  try {
    return new URLSearchParams(window.location.search).get(name) || ''
  } catch(e) { return '' }
}

function vcd_fmtUptime(sec) {
  if (!sec) return '—'
  var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function vcd_fmtBytes(bytes) {
  if (!bytes) return '—'
  return (bytes / 1073741824).toFixed(0) + ' GB'
}

// ─── fetch ────────────────────────────────────────────────────────────────────

function start_vcd(rpc) {
  var el = document.getElementById(CFG_VMW_VCD.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:16px;color:#6E7681;font-size:12px;font-family:monospace">A carregar detalhe do vCenter…</div>'

  var vcHostId = vcd_getParam('var-vcenter_hostid')
  if (!vcHostId) {
    el.innerHTML = '<div style="padding:20px;color:#D29922;font-family:monospace;font-size:13px">⚠ Nenhum vCenter seleccionado.<br>Aceda via drill-down do dashboard N2 (passar ?var-vcenter_hostid=&lt;id&gt;).</div>'
    return
  }

  var now = Math.floor(Date.now() / 1000)

  function zpost(method, params) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', CFG_VMW_VCD.PROXY, true)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.onload = function() {
        try { resolve(JSON.parse(xhr.responseText).result || []) }
        catch(e) { reject(e) }
      }
      xhr.onerror = function() { reject(new Error('XHR error')) }
      xhr.send(JSON.stringify({ jsonrpc:'2.0', method:method, params:params, id:1 }))
    })
  }

  Promise.all([
    // PA — info do host vCenter (nome, macros)
    zpost('host.get', {
      hostids:      [vcHostId],
      output:       ['hostid','name'],
      selectMacros: ['macro','value'],
    }),
    // PB — fullname + version
    zpost('item.get', {
      hostids: [vcHostId],
      search:  { key_: 'vmware.fullname[' },
      output:  ['lastvalue','lastclock'],
      limit:   5
    }),
    // PC — status vCenter
    zpost('item.get', {
      hostids: [vcHostId],
      search:  { key_: 'vmware.status[' },
      output:  ['lastvalue','lastclock'],
      limit:   5
    }),
    // PD — clusters do vCenter
    zpost('item.get', {
      hostids: [vcHostId],
      search:  { key_: 'vmware.cluster.status[' },
      output:  ['key_','lastvalue'],
      limit:   200
    }),
    // PE — ESXi do grupo 608 com macro {$VMWARE.URL}
    zpost('host.get', {
      groupids:     [CFG_VMW_VCD.groupIdESXi],
      output:       ['hostid','name'],
      selectMacros: ['macro','value'],
      limit:        500
    }),
  ]).then(function(pa) {
    var vcHosts    = pa[0]
    var fullItems  = pa[1]
    var statItems  = pa[2]
    var clsItems   = pa[3]
    var allESXi    = pa[4]

    if (!vcHosts.length) {
      el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">vCenter hostid=' + vcHostId + ' não encontrado.</div>'
      return
    }
    var vcHost = vcHosts[0]
    var urlMacro = (vcHost.macros || []).find(function(m) { return m.macro === '{$VMWARE.URL}' })
    var vcUrl    = urlMacro ? vcd_normalizeUrl(urlMacro.value) : ''
    var vcIp     = vcUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')

    var fullname = fullItems[0] ? fullItems[0].lastvalue : ''
    var verMatch = fullname.match(/vCenter Server\s+([\d.]+)/i)
    var version  = verMatch ? verMatch[1] : ''
    var stale    = fullItems[0] ? (now - parseInt(fullItems[0].lastclock || 0)) > CFG_VMW_VCD.staleThreshold : true

    var status   = statItems[0] ? parseInt(statItems[0].lastvalue) || 0 : 0
    var sColor   = CFG_VMW_VCD.statusColor[status]
    var sLabel   = CFG_VMW_VCD.statusLabel[status]

    // Clusters
    var clusters = {}
    clsItems.forEach(function(i) {
      var m = i.key_.match(/vmware\.cluster\.status\[[^\]]+?,(.+)\]/)
      if (!m) return
      clusters[m[1].trim()] = { status: parseInt(i.lastvalue) || 0, esxiCount: 0, vmCount: 0 }
    })

    // ESXi filtrados a este vCenter
    var myESXi = allESXi.filter(function(h) {
      var m = (h.macros || []).find(function(x) { return x.macro === '{$VMWARE.URL}' })
      return m && vcd_normalizeUrl(m.value) === vcUrl
    })
    var myESXiIds = myESXi.map(function(h) { return h.hostid })

    if (!myESXiIds.length) {
      vcd_render(el, { vcHost: vcHost, vcIp: vcIp, version: version, stale: stale,
        status: status, sColor: sColor, sLabel: sLabel, clusters: clusters,
        esxi: [], triggers: [], vms: { on: 0, off: 0 } })
      return
    }

    Promise.all([
      // PF — items dos ESXi (CPU, RAM, VMs, Uptime, Cluster name)
      zpost('item.get', {
        hostids: myESXiIds,
        search:  { name: ['CPU usage in percent','Total memory','Used memory',
                           'Number of guest VMs','Cluster name','Uptime','Power usage','Connection state'] },
        searchByAny: true,
        output: ['hostid','name','lastvalue','lastclock'],
        monitored: true, limit: 5000
      }),
      // PG — triggers activos dos ESXi
      zpost('trigger.get', {
        hostids:       myESXiIds,
        only_true:     true, monitored: true, skipDependent: true,
        expandDescription: true,
        output:        ['triggerid','description','priority','lastchange'],
        selectHosts:   ['hostid','name'],
        sortfield:     'priority', sortorder: 'DESC',
        limit:         200
      }),
      // PH — VMs do grupo 609 com {$VMWARE.URL} matching este vCenter
      zpost('host.get', {
        groupids:     [CFG_VMW_VCD.groupIdVMs],
        output:       ['hostid','name'],
        selectMacros: ['macro','value'],
        limit:        2000
      }),
      // PI — powerstate das VMs do grupo 609
      zpost('item.get', {
        groupids: [CFG_VMW_VCD.groupIdVMs],
        search:   { key_: 'vmware.vm.powerstate' },
        output:   ['hostid','lastvalue','lastclock'],
        limit:    2000
      }),
    ]).then(function(pb) {
      var esxiItems   = pb[0]
      var triggers    = pb[1]
      var vmHosts     = pb[2]
      var vmPower     = pb[3]

      // Indexar items por ESXi host
      var byHost = {}
      esxiItems.forEach(function(i) {
        if (!byHost[i.hostid]) byHost[i.hostid] = {}
        byHost[i.hostid][i.name] = i.lastvalue
      })

      // ESXi count por cluster
      myESXi.forEach(function(h) {
        var cls = byHost[h.hostid] && byHost[h.hostid]['Cluster name']
        if (cls && clusters[cls]) clusters[cls].esxiCount++
      })

      // Linha por ESXi
      var esxiRows = myESXi.map(function(h) {
        var hd   = byHost[h.hostid] || {}
        var cpu  = parseFloat(hd['CPU usage in percent'])
        var ramU = parseFloat(hd['Used memory'])
        var ramT = parseFloat(hd['Total memory'])
        var ramPct = (!isNaN(ramU) && !isNaN(ramT) && ramT > 0) ? (ramU / ramT * 100) : null
        var vms  = parseFloat(hd['Number of guest VMs'])
        return {
          hostid:  h.hostid,
          name:    h.name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i, ''),
          cluster: hd['Cluster name'] || '—',
          cpu:     isNaN(cpu) ? null : cpu,
          ramPct:  ramPct,
          ramGb:   isNaN(ramU) ? null : Math.round(ramU / 1073741824),
          ramTGb:  isNaN(ramT) ? null : Math.round(ramT / 1073741824),
          vms:     isNaN(vms) ? null : Math.round(vms),
          uptime:  parseFloat(hd['Uptime']) || null,
          power:   parseFloat(hd['Power usage']) || null,
        }
      }).sort(function(a, b) { return (a.cluster + a.name).localeCompare(b.cluster + b.name) })

      // VMs deste vCenter
      var vmPowerIdx = {}
      vmPower.forEach(function(i) { vmPowerIdx[i.hostid] = i.lastvalue === '1' })
      var vmsOn = 0, vmsOff = 0
      vmHosts.forEach(function(h) {
        var m = (h.macros || []).find(function(x) { return x.macro === '{$VMWARE.URL}' })
        if (!m || vcd_normalizeUrl(m.value) !== vcUrl) return
        if (vmPowerIdx[h.hostid]) vmsOn++; else vmsOff++
      })
      // VMs por cluster (se tiver dados de powerstate via PH)
      vmHosts.forEach(function(h) {
        var m = (h.macros || []).find(function(x) { return x.macro === '{$VMWARE.URL}' })
        if (!m || vcd_normalizeUrl(m.value) !== vcUrl) return
        // cluster da VM não disponível via grupo 609 sem join adicional
      })

      vcd_render(el, {
        vcHost:   vcHost,
        vcIp:     vcIp,
        version:  version,
        stale:    stale,
        status:   status,
        sColor:   sColor,
        sLabel:   sLabel,
        clusters: clusters,
        esxi:     esxiRows,
        triggers: triggers,
        vms:      { on: vmsOn, off: vmsOff },
        vcUrl:    vcUrl,
      })
    })
  }).catch(function(err) {
    el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">Erro: ' + err.message + '</div>'
  })
}

// ─── render ───────────────────────────────────────────────────────────────────

function vcd_render(el, d) {
  var SH  = window.BPC_SHARED
  var S   = window.BPC.state

  var css = '<style>' +
    '#bpc-vmw-vc-detalhe{font-family:"JetBrains Mono",monospace;color:#CDD9E5}' +
    '.vcd-wrap{padding:12px 14px 16px}' +

    /* ── TOPO: info + stats + links ── */
    '.vcd-top{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start;margin-bottom:16px}' +
    '.vcd-title{font-size:20px;font-weight:700;color:#E6EDF3;margin-bottom:4px}' +
    '.vcd-ip{font-size:13px;color:#6E7681;margin-bottom:6px}' +
    '.vcd-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}' +
    '.vcd-stale{font-size:11px;color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.2);border-radius:4px;padding:2px 8px;margin-top:6px;display:inline-block}' +
    '.vcd-stats{display:flex;gap:20px;margin-top:12px}' +
    '.vcd-stat{text-align:center}' +
    '.vcd-stat-num{font-size:28px;font-weight:700;line-height:1;margin-bottom:3px}' +
    '.vcd-stat-lbl{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.6px}' +
    '.vcd-links{display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
    '.vcd-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;border:1px solid}' +
    '.vcd-btn-detail{color:#58A6FF;border-color:rgba(88,166,255,.3);background:rgba(88,166,255,.07)}' +
    '.vcd-btn-detail:hover{background:rgba(88,166,255,.15)}' +
    '.vcd-btn-vcenter{color:#3FB950;border-color:rgba(63,185,80,.3);background:rgba(63,185,80,.07)}' +
    '.vcd-btn-vcenter:hover{background:rgba(63,185,80,.15)}' +

    /* ── CLUSTERS ── */
    '.vcd-section-title{font-size:11px;font-weight:700;color:#6E7681;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}' +
    '.vcd-cls-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-bottom:16px}' +
    '.vcd-cls-card{background:rgba(255,255,255,0.03);border:1px solid #21262D;border-radius:6px;padding:10px 12px}' +
    '.vcd-cls-name{font-size:13px;font-weight:700;color:#E6EDF3;margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.vcd-cls-meta{display:flex;gap:12px}' +
    '.vcd-cls-kv{display:flex;flex-direction:column;align-items:center}' +
    '.vcd-cls-val{font-size:18px;font-weight:700;color:#58A6FF}' +
    '.vcd-cls-key{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.4px}' +

    /* ── ESXi TABLE ── */
    '.vcd-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px}' +
    '.vcd-tbl th{text-align:left;padding:7px 10px;color:#6E7681;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid rgba(255,255,255,0.1);white-space:nowrap}' +
    '.vcd-tbl td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.05);white-space:nowrap}' +
    '.vcd-tbl tr:hover td{background:rgba(255,255,255,0.02)}' +
    '.vcd-pbar{height:3px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:3px;overflow:hidden}' +
    '.vcd-pbar-fill{height:100%;border-radius:2px}' +

    /* ── TRIGGERS ── */
    '.vcd-trg-row{display:flex;align-items:flex-start;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05)}' +
    '.vcd-trg-sev{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;white-space:nowrap;flex-shrink:0}' +
    '.vcd-trg-host{font-size:11px;color:#6E7681;white-space:nowrap;width:130px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}' +
    '.vcd-trg-desc{font-size:12px;color:#CDD9E5;flex:1}' +
    '.vcd-trg-age{font-size:11px;color:#6E7681;white-space:nowrap;flex-shrink:0}' +
    '</style>'

  var sColor = d.sColor
  var pillBg = { 0:'rgba(110,118,129,.18)',1:'rgba(63,185,80,.15)',2:'rgba(210,153,34,.15)',3:'rgba(248,81,73,.15)' }[d.status] || 'rgba(110,118,129,.18)'

  // ── TOPO ──
  var clsNames  = Object.keys(d.clusters).sort()
  var totalVMs  = d.vms.on + d.vms.off

  // Links
  var n2Url     = 'http://10.10.126.22:3000/d/a967e936-99a3-47c8-af98-052d7a80beb8/n2-infraestrutura-vmware'
  var vcWebUrl  = (d.vcUrl ? d.vcUrl.replace(/^https?:\/\//, 'https://') : '#') + '/ui/'

  var links = '<div class="vcd-links">' +
    '<a class="vcd-btn vcd-btn-detail" href="' + n2Url + '">← N2 Infraestrutura</a>' +
    '<a class="vcd-btn vcd-btn-vcenter" href="' + vcWebUrl + '" target="_blank" rel="noopener">⎋ Abrir vCenter</a>' +
  '</div>'

  var staleTag = d.stale ? '<div class="vcd-stale">⚠ dados desactualizados</div>' : ''
  var pill = '<span class="vcd-pill" style="background:' + pillBg + ';color:' + sColor + ';border:1px solid ' + sColor + '33">' +
    '<span style="width:7px;height:7px;border-radius:50%;background:' + sColor + ';display:inline-block"></span>' +
    d.sLabel + '</span>'

  var statsHtml = '<div class="vcd-stats">' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#58A6FF">' + d.esxi.length + '</div><div class="vcd-stat-lbl">Hosts ESXi</div></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#A5D6FF">' + clsNames.length + '</div><div class="vcd-stat-lbl">Clusters</div></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#' + (totalVMs > 0 ? '3FB950' : '6E7681') + '">' + (totalVMs > 0 ? d.vms.on : '—') + '</div><div class="vcd-stat-lbl">VMs Ligadas</div></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#' + (d.vms.off > 0 ? 'F85149' : '6E7681') + '">' + (d.vms.off > 0 ? d.vms.off : '—') + '</div><div class="vcd-stat-lbl">VMs Deslig.</div></div>' +
  '</div>'

  var topo = '<div class="vcd-top">' +
    '<div>' +
      '<div class="vcd-title">' + SH.esc(d.vcHost.name) + '</div>' +
      '<div class="vcd-ip">' + SH.esc(d.vcIp) + (d.version ? ' · vCenter ' + SH.esc(d.version) : '') + '</div>' +
      pill + staleTag +
      statsHtml +
    '</div>' +
    links +
  '</div>'

  // ── CLUSTERS ──
  var clsCards = clsNames.length
    ? clsNames.map(function(cls) {
        var c      = d.clusters[cls]
        var cColor = CFG_VMW_VCD.statusColor[c.status] || CFG_VMW_VCD.statusColor[0]
        var badgeSt = c.status > 1
          ? '<span style="font-size:10px;font-weight:700;color:' + cColor + ';margin-left:6px">' + CFG_VMW_VCD.statusLabel[c.status] + '</span>'
          : ''
        return '<div class="vcd-cls-card" style="border-color:' + (c.status > 1 ? cColor + '44' : '#21262D') + '">' +
          '<div class="vcd-cls-name"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + cColor + ';margin-right:6px;vertical-align:middle"></span>' + SH.esc(cls) + badgeSt + '</div>' +
          '<div class="vcd-cls-meta">' +
            '<div class="vcd-cls-kv"><div class="vcd-cls-val">' + (c.esxiCount || '—') + '</div><div class="vcd-cls-key">ESXi</div></div>' +
          '</div>' +
        '</div>'
      }).join('')
    : '<div style="color:#6E7681;font-size:12px;font-style:italic">sem dados de clusters</div>'

  var clsSec = '<div class="vcd-section-title">Clusters</div>' +
    '<div class="vcd-cls-grid">' + clsCards + '</div>'

  // ── ESXi TABLE ──
  function pbar(pct, color) {
    var w = Math.min(pct || 0, 100).toFixed(1)
    return '<div class="vcd-pbar"><div class="vcd-pbar-fill" style="width:' + w + '%;background:' + color + '"></div></div>'
  }
  function stateColor(val, warn, crit) {
    if (val == null) return '#6E7681'
    return val >= crit ? '#F85149' : val >= warn ? '#D29922' : '#3FB950'
  }

  var esxiRows = d.esxi.map(function(h) {
    var cpuC = stateColor(h.cpu, 75, 90)
    var ramC = stateColor(h.ramPct, 70, 85)
    return '<tr>' +
      '<td style="font-size:12px;font-weight:600;color:#E6EDF3">' + SH.esc(h.name) + '</td>' +
      '<td style="color:#6E7681">' + SH.esc(h.cluster) + '</td>' +
      '<td>' +
        (h.cpu != null ? '<span style="font-size:13px;font-weight:700;color:' + cpuC + '">' + h.cpu.toFixed(1) + '%</span>' + pbar(h.cpu, cpuC) : '<span style="color:#6E7681">—</span>') +
      '</td>' +
      '<td>' +
        (h.ramPct != null ? '<span style="font-size:13px;font-weight:700;color:' + ramC + '">' + h.ramPct.toFixed(1) + '%</span><div style="font-size:10px;color:#6E7681">' + (h.ramGb || '?') + '/' + (h.ramTGb || '?') + ' GB</div>' + pbar(h.ramPct, ramC) : '<span style="color:#6E7681">—</span>') +
      '</td>' +
      '<td style="text-align:center;color:#58A6FF;font-weight:700">' + (h.vms != null ? h.vms : '—') + '</td>' +
      '<td style="color:#6E7681">' + vcd_fmtUptime(h.uptime) + '</td>' +
      '<td style="color:#6E7681">' + (h.power ? h.power.toFixed(0) + ' W' : '—') + '</td>' +
    '</tr>'
  }).join('')

  var esxiSec = '<div class="vcd-section-title">Hosts ESXi · ' + d.esxi.length + '</div>' +
    '<table class="vcd-tbl">' +
    '<thead><tr>' +
      '<th>Host</th><th>Cluster</th><th>CPU</th><th>RAM</th><th>VMs</th><th>Uptime</th><th>Power</th>' +
    '</tr></thead>' +
    '<tbody>' + (esxiRows || '<tr><td colspan="7" style="color:#6E7681;padding:12px 10px;font-style:italic">Sem hosts ESXi associados a este vCenter.</td></tr>') + '</tbody>' +
    '</table>'

  // ── TRIGGERS ──
  var sevLabel = ['N/C','Info','Aviso','Média','Alto','Desastre']
  var sevColor = ['#6E7681','#6E7681','#D29922','#D29922','#F85149','#F85149']

  function fmtAge(epoch) {
    var s = Math.floor(Date.now() / 1000) - parseInt(epoch || 0)
    if (s < 60) return s + 's'
    if (s < 3600) return Math.floor(s / 60) + 'm'
    if (s < 86400) return Math.floor(s / 3600) + 'h'
    return Math.floor(s / 86400) + 'd'
  }

  var trgRows = (d.triggers || []).map(function(t) {
    var sev   = parseInt(t.priority) || 0
    var color = sevColor[sev] || '#6E7681'
    var host  = t.hosts && t.hosts[0] ? t.hosts[0].name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i, '') : '—'
    return '<div class="vcd-trg-row">' +
      '<span class="vcd-trg-sev" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44">' + sevLabel[sev] + '</span>' +
      '<span class="vcd-trg-host">' + SH.esc(host) + '</span>' +
      '<span class="vcd-trg-desc">' + SH.esc(t.description) + '</span>' +
      '<span class="vcd-trg-age">' + fmtAge(t.lastchange) + '</span>' +
    '</div>'
  }).join('')

  var trgSec = '<div class="vcd-section-title">Triggers Activos · ' + (d.triggers || []).length + '</div>' +
    (trgRows || '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#3FB950"><span style="width:8px;height:8px;border-radius:50%;background:#3FB950;display:inline-block"></span><span style="font-size:13px;font-weight:600">Sem triggers activos</span></div>')

  el.innerHTML = css +
    '<div class="vcd-wrap">' +
      topo +
      '<hr style="border:none;border-top:1px solid #21262D;margin:0 0 14px">' +
      clsSec +
      '<hr style="border:none;border-top:1px solid #21262D;margin:0 0 14px">' +
      esxiSec +
      '<hr style="border:none;border-top:1px solid #21262D;margin:0 0 14px">' +
      trgSec +
    '</div>'

  if (CFG_VMW_VCD._timer) clearTimeout(CFG_VMW_VCD._timer)
  CFG_VMW_VCD._timer = setTimeout(function() {
    if (typeof window.waitForBPC === 'function') window.waitForBPC(start_vcd)
  }, CFG_VMW_VCD.refreshMs)
}

// ─── bootstrap ────────────────────────────────────────────────────────────────

function initWithRetry_vcd(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start_vcd); return }
  if (attempt > 50) { console.error('[BPC] l3-vcenter-detalhe: waitForBPC indisponivel'); return }
  setTimeout(function() { initWithRetry_vcd(attempt + 1) }, 100)
}

initWithRetry_vcd()
