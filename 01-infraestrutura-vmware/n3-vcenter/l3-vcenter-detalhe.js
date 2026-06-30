// N3 VMware — Detalhe de vCenter  v2.0
// Dashboard: n3-vcenter-detalhe (59e7e4b2)
// Painel: bpc-vmw-vc-detalhe
// Lê ?var-vcenter_hostid=<hostid> do URL para filtrar ao vCenter seleccionado.

var CFG_VMW_VCD = {
  elementId:      'bpc-vmw-vc-detalhe',
  groupIdESXi:    '608',
  groupIdVMs:     '609',
  refreshMs:      60000,
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
  try { return new URLSearchParams(window.location.search).get(name) || '' }
  catch(e) { return '' }
}
function vcd_fmtUptime(sec) {
  if (!sec) return '—'
  var d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}
function vcd_fmtAge(epoch) {
  var s = Math.floor(Date.now() / 1000) - parseInt(epoch || 0)
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm'
  if (s < 86400) return Math.floor(s / 3600) + 'h'
  return Math.floor(s / 86400) + 'd'
}
function vcd_stateColor(val, warn, crit) {
  if (val == null) return '#6E7681'
  return val >= crit ? '#F85149' : val >= warn ? '#D29922' : '#3FB950'
}

// ─── fetch ────────────────────────────────────────────────────────────────────

function start_vcd(rpc) {
  var el = document.getElementById(CFG_VMW_VCD.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:16px;color:#6E7681;font-size:12px;font-family:monospace">A carregar detalhe do vCenter…</div>'

  var vcHostId = vcd_getParam('var-vcenter_hostid')
  if (!vcHostId) {
    el.innerHTML = '<div style="padding:20px;color:#D29922;font-family:monospace;font-size:13px">' +
      '⚠ Nenhum vCenter seleccionado.<br>Aceda via drill-down do dashboard N2 (passar ?var-vcenter_hostid=&lt;id&gt;).</div>'
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

  // Fase 1 — identidade do vCenter + inventário ESXi
  Promise.all([
    zpost('host.get', {                    // PA — host vCenter
      hostids: [vcHostId], output: ['hostid','name'], selectMacros: ['macro','value']
    }),
    zpost('item.get', {                    // PB — fullname/versão
      hostids: [vcHostId], search: { key_: 'vmware.fullname[' },
      output: ['lastvalue','lastclock'], limit: 5
    }),
    zpost('item.get', {                    // PC — status vCenter
      hostids: [vcHostId], search: { key_: 'vmware.status[' },
      output: ['lastvalue','lastclock'], limit: 5
    }),
    zpost('item.get', {                    // PD — clusters do vCenter
      hostids: [vcHostId], search: { key_: 'vmware.cluster.status[' },
      output: ['key_','lastvalue'], limit: 200
    }),
    zpost('host.get', {                    // PE — todos os ESXi (grupo 608)
      groupids: [CFG_VMW_VCD.groupIdESXi],
      output: ['hostid','name'], selectMacros: ['macro','value'], limit: 500
    }),
  ]).then(function(pa) {
    var vcHosts   = pa[0], fullItems = pa[1], statItems = pa[2]
    var clsItems  = pa[3], allESXi   = pa[4]

    if (!vcHosts.length) {
      el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">vCenter hostid=' + vcHostId + ' não encontrado.</div>'
      return
    }
    var vcHost   = vcHosts[0]
    var urlMacro = (vcHost.macros || []).find(function(m) { return m.macro === '{$VMWARE.URL}' })
    var vcUrl    = urlMacro ? vcd_normalizeUrl(urlMacro.value) : ''
    var vcIp     = vcUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    var fullname = fullItems[0] ? fullItems[0].lastvalue : ''
    var verMatch = fullname.match(/vCenter Server\s+([\d.]+)/i)
    var version  = verMatch ? verMatch[1] : ''
    var stale    = fullItems[0] ? (now - parseInt(fullItems[0].lastclock || 0)) > CFG_VMW_VCD.staleThreshold : true
    var status   = statItems[0] ? parseInt(statItems[0].lastvalue) || 0 : 0

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
      vcd_render(el, { vcHost:vcHost, vcIp:vcIp, version:version, stale:stale,
        status:status, clusters:clusters, esxi:[], triggers:[], vms:{on:0,off:0}, vcUrl:vcUrl })
      return
    }

    // Fase 2 — métricas detalhadas
    Promise.all([
      zpost('item.get', {                  // PF — items dos ESXi
        hostids: myESXiIds,
        search: { name: ['CPU usage in percent','Total memory','Used memory',
                         'Number of guest VMs','Cluster name','Uptime','Power usage',
                         'Connection state','Memory ballooning size','Memory swap used size'] },
        searchByAny: true,
        output: ['hostid','name','lastvalue','lastclock'],
        monitored: true, limit: 5000
      }),
      zpost('trigger.get', {               // PG — triggers activos dos ESXi
        hostids: myESXiIds,
        only_true: true, monitored: true, skipDependent: true,
        expandDescription: true,
        output: ['triggerid','description','priority','lastchange'],
        selectHosts: ['hostid','name'],
        sortfield: 'priority', sortorder: 'DESC', limit: 200
      }),
      zpost('host.get', {                  // PH — VMs do grupo 609
        groupids: [CFG_VMW_VCD.groupIdVMs],
        output: ['hostid','name'], selectMacros: ['macro','value'], limit: 2000
      }),
      zpost('item.get', {                  // PI — powerstate das VMs
        groupids: [CFG_VMW_VCD.groupIdVMs],
        search: { key_: 'vmware.vm.powerstate' },
        output: ['hostid','lastvalue','lastclock'], limit: 2000
      }),
    ]).then(function(pb) {
      var esxiItems = pb[0], triggers = pb[1], vmHosts = pb[2], vmPower = pb[3]

      // Index items por ESXi
      var byHost = {}
      esxiItems.forEach(function(i) {
        if (!byHost[i.hostid]) byHost[i.hostid] = {}
        byHost[i.hostid][i.name] = { v: i.lastvalue, t: i.lastclock }
      })

      // ESXi count por cluster
      myESXi.forEach(function(h) {
        var cls = byHost[h.hostid] && byHost[h.hostid]['Cluster name']
        if (cls && clusters[cls.v]) clusters[cls.v].esxiCount++
      })

      // Linhas ESXi
      var esxiRows = myESXi.map(function(h) {
        var hd    = byHost[h.hostid] || {}
        var cpu   = parseFloat(hd['CPU usage in percent'] && hd['CPU usage in percent'].v)
        var ramU  = parseFloat(hd['Used memory'] && hd['Used memory'].v)
        var ramT  = parseFloat(hd['Total memory'] && hd['Total memory'].v)
        var ramPct = (!isNaN(ramU) && !isNaN(ramT) && ramT > 0) ? (ramU / ramT * 100) : null
        var vms   = parseFloat(hd['Number of guest VMs'] && hd['Number of guest VMs'].v)
        var conn  = hd['Connection state'] ? hd['Connection state'].v : null
        var ballooning = parseFloat(hd['Memory ballooning size'] && hd['Memory ballooning size'].v)
        return {
          hostid:     h.hostid,
          name:       h.name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i, '').replace(/^ESXi\s*-\s*/i, ''),
          cluster:    (hd['Cluster name'] && hd['Cluster name'].v) || '—',
          cpu:        isNaN(cpu)   ? null : cpu,
          ramPct:     ramPct,
          ramGb:      isNaN(ramU)  ? null : Math.round(ramU  / 1073741824),
          ramTGb:     isNaN(ramT)  ? null : Math.round(ramT  / 1073741824),
          vms:        isNaN(vms)   ? null : Math.round(vms),
          uptime:     parseFloat(hd['Uptime'] && hd['Uptime'].v) || null,
          power:      parseFloat(hd['Power usage'] && hd['Power usage'].v) || null,
          ballooning: isNaN(ballooning) ? null : Math.round(ballooning / 1073741824),
          connState:  conn,
        }
      }).sort(function(a, b) { return (a.cluster + a.name).localeCompare(b.cluster + b.name) })

      // Agregados de CPU/RAM para o topo
      var cpuSamples = esxiRows.filter(function(e) { return e.cpu != null })
      var ramSamples = esxiRows.filter(function(e) { return e.ramPct != null })
      var cpuAvg     = cpuSamples.length ? cpuSamples.reduce(function(s,e){ return s+e.cpu },0)/cpuSamples.length : null
      var cpuMax     = cpuSamples.length ? Math.max.apply(null, cpuSamples.map(function(e){ return e.cpu })) : null
      var ramAvg     = ramSamples.length ? ramSamples.reduce(function(s,e){ return s+e.ramPct },0)/ramSamples.length : null
      var ramMax     = ramSamples.length ? Math.max.apply(null, ramSamples.map(function(e){ return e.ramPct })) : null

      // VMs deste vCenter
      var vmPowerIdx = {}
      vmPower.forEach(function(i) { vmPowerIdx[i.hostid] = { on: i.lastvalue === '1', t: i.lastclock } })
      var vmsOn = 0, vmsOff = 0, vmsUnknown = 0
      var myVMs = vmHosts.filter(function(h) {
        var m = (h.macros || []).find(function(x) { return x.macro === '{$VMWARE.URL}' })
        return m && vcd_normalizeUrl(m.value) === vcUrl
      })
      myVMs.forEach(function(h) {
        var ps = vmPowerIdx[h.hostid]
        if (!ps) { vmsUnknown++; return }
        if (ps.on) vmsOn++; else vmsOff++
      })

      vcd_render(el, {
        vcHost: vcHost, vcIp: vcIp, version: version, stale: stale,
        status: status, clusters: clusters,
        esxi: esxiRows, triggers: triggers,
        vms: { on: vmsOn, off: vmsOff, unknown: vmsUnknown, total: myVMs.length },
        vcUrl: vcUrl,
        agg: { cpuAvg: cpuAvg, cpuMax: cpuMax, ramAvg: ramAvg, ramMax: ramMax },
      })
    })
  }).catch(function(err) {
    el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">Erro: ' + err.message + '</div>'
  })
}

// ─── render ───────────────────────────────────────────────────────────────────

function vcd_render(el, d) {
  var SH = window.BPC_SHARED

  var css = '<style>' +
  '#bpc-vmw-vc-detalhe{font-family:"JetBrains Mono",monospace;color:#CDD9E5;font-size:13px}' +
  '.vcd-wrap{padding:14px 16px 20px}' +

  /* ── TOPO ── */
  '.vcd-topo{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;margin-bottom:18px}' +
  '.vcd-name{font-size:22px;font-weight:700;color:#E6EDF3;line-height:1.2;margin-bottom:4px}' +
  '.vcd-sub{font-size:13px;color:#6E7681;margin-bottom:10px}' +
  '.vcd-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}' +
  '.vcd-stale{font-size:11px;color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.25);border-radius:4px;padding:2px 8px;margin-left:8px;display:inline-block;vertical-align:middle}' +
  '.vcd-stats{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.07)}' +
  '.vcd-stat{display:flex;flex-direction:column;align-items:center;min-width:60px}' +
  '.vcd-stat-num{font-size:26px;font-weight:700;line-height:1;margin-bottom:3px}' +
  '.vcd-stat-lbl{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}' +
  '.vcd-stat-sep{width:1px;background:rgba(255,255,255,0.08);align-self:stretch;margin:0 2px}' +
  '.vcd-links{display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
  '.vcd-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;border:1px solid;cursor:pointer}' +
  '.vcd-btn-back{color:#8B949E;border-color:rgba(139,148,158,.25);background:rgba(139,148,158,.07)}' +
  '.vcd-btn-back:hover{background:rgba(139,148,158,.14)}' +
  '.vcd-btn-vc{color:#3FB950;border-color:rgba(63,185,80,.3);background:rgba(63,185,80,.07)}' +
  '.vcd-btn-vc:hover{background:rgba(63,185,80,.15)}' +

  /* ── SAÚDE AGREGADA ── */
  '.vcd-health{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}' +
  '.vcd-hcard{background:rgba(255,255,255,0.03);border:1px solid #21262D;border-radius:8px;padding:12px 14px}' +
  '.vcd-hcard-title{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}' +
  '.vcd-hrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}' +
  '.vcd-hlbl{font-size:11px;color:#8B949E}' +
  '.vcd-hval{font-size:14px;font-weight:700}' +
  '.vcd-pbar{height:4px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:2px;overflow:hidden}' +
  '.vcd-pbar-fill{height:100%;border-radius:2px;transition:width .4s}' +

  /* ── SECTION HEADER ── */
  '.vcd-sh{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #21262D}' +
  '.vcd-sh-title{font-size:11px;font-weight:700;color:#6E7681;text-transform:uppercase;letter-spacing:.7px}' +
  '.vcd-sh-count{font-size:11px;color:#444D56;font-weight:600}' +

  /* ── CLUSTERS ── */
  '.vcd-cls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;margin-bottom:18px}' +
  '.vcd-cls-card{background:rgba(255,255,255,0.03);border:1px solid #21262D;border-radius:7px;padding:11px 13px}' +
  '.vcd-cls-name{font-size:13px;font-weight:700;color:#E6EDF3;margin-bottom:8px;display:flex;align-items:center;gap:6px}' +
  '.vcd-cls-name-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
  '.vcd-cls-meta{display:flex;gap:16px}' +
  '.vcd-cls-kv{display:flex;flex-direction:column;align-items:center}' +
  '.vcd-cls-val{font-size:20px;font-weight:700;color:#58A6FF;line-height:1}' +
  '.vcd-cls-key{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}' +

  /* ── ESXi TABLE ── */
  '.vcd-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px}' +
  '.vcd-tbl th{text-align:left;padding:7px 10px;color:#6E7681;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid rgba(255,255,255,.08);white-space:nowrap}' +
  '.vcd-tbl td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;vertical-align:middle}' +
  '.vcd-tbl tr:hover td{background:rgba(255,255,255,.02)}' +
  '.vcd-tbl-sep td{padding:4px 10px;background:rgba(255,255,255,.02);color:#444D56;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,.06)}' +
  '.vcd-bar{height:3px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:3px;overflow:hidden;width:80px}' +
  '.vcd-bar-f{height:100%;border-radius:2px}' +
  '.vcd-conn{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 7px;border-radius:10px;font-weight:600;white-space:nowrap}' +

  /* ── TRIGGERS ── */
  '.vcd-trg-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}' +
  '.vcd-trg-sev{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;white-space:nowrap;flex-shrink:0}' +
  '.vcd-trg-host{font-size:11px;color:#6E7681;width:130px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;white-space:nowrap}' +
  '.vcd-trg-desc{font-size:12px;color:#CDD9E5;flex:1}' +
  '.vcd-trg-age{font-size:11px;color:#6E7681;white-space:nowrap;flex-shrink:0}' +
  '</style>'

  var SC      = CFG_VMW_VCD.statusColor
  var SL      = CFG_VMW_VCD.statusLabel
  var sColor  = SC[d.status]
  var pillBg  = ['rgba(110,118,129,.18)','rgba(63,185,80,.15)','rgba(210,153,34,.15)','rgba(248,81,73,.15)'][d.status] || 'rgba(110,118,129,.18)'
  var n2Url   = 'http://10.10.126.22:3000/d/a967e936-99a3-47c8-af98-052d7a80beb8/n2-infraestrutura-vmware'
  var vcWebUrl= (d.vcUrl ? d.vcUrl.replace(/^https?:\/\//, 'https://') : '#') + '/ui/'
  var clsNames= Object.keys(d.clusters).sort()

  // ── TOPO ──────────────────────────────────────────────────────────────────

  var pill = '<span class="vcd-pill" style="background:' + pillBg + ';color:' + sColor + ';border:1px solid ' + sColor + '44">' +
    '<span style="width:7px;height:7px;border-radius:50%;background:' + sColor + ';display:inline-block"></span>' +
    SL[d.status] + '</span>'
  var staleTag = d.stale ? '<span class="vcd-stale">⚠ dados desactualizados</span>' : ''

  var stats = '<div class="vcd-stats">' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#58A6FF">' + d.esxi.length + '</div><div class="vcd-stat-lbl">ESXi</div></div>' +
    '<div class="vcd-stat-sep"></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#A5D6FF">' + clsNames.length + '</div><div class="vcd-stat-lbl">Clusters</div></div>' +
    '<div class="vcd-stat-sep"></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#3FB950">' + (d.vms.on || '—') + '</div><div class="vcd-stat-lbl">VMs Ligadas</div></div>' +
    '<div class="vcd-stat"><div class="vcd-stat-num" style="color:' + (d.vms.off > 0 ? '#F85149' : '#6E7681') + '">' + (d.vms.off || '—') + '</div><div class="vcd-stat-lbl">VMs Desl.</div></div>' +
    (d.vms.unknown > 0 ? '<div class="vcd-stat"><div class="vcd-stat-num" style="color:#6E7681">' + d.vms.unknown + '</div><div class="vcd-stat-lbl">Sem dados</div></div>' : '') +
  '</div>'

  var links = '<div class="vcd-links">' +
    '<a class="vcd-btn vcd-btn-back" href="' + n2Url + '">← N2 Infra VMware</a>' +
    '<a class="vcd-btn vcd-btn-vc" href="' + vcWebUrl + '" target="_blank" rel="noopener">⎋ Abrir vCenter</a>' +
  '</div>'

  var topo = '<div class="vcd-topo">' +
    '<div>' +
      '<div class="vcd-name">' + SH.esc(d.vcHost.name) + '</div>' +
      '<div class="vcd-sub">' + SH.esc(d.vcIp) + (d.version ? ' &nbsp;·&nbsp; vCenter ' + SH.esc(d.version) : '') + '</div>' +
      pill + staleTag +
      stats +
    '</div>' +
    links +
  '</div>'

  // ── SAÚDE AGREGADA (CPU / RAM) ─────────────────────────────────────────────

  function healthBar(pct, warn, crit) {
    var color = vcd_stateColor(pct, warn, crit)
    return '<div class="vcd-pbar"><div class="vcd-pbar-fill" style="width:' + Math.min(pct||0,100).toFixed(1) + '%;background:' + color + '"></div></div>'
  }

  var agg = d.agg || {}
  var healthHtml = (agg.cpuAvg != null || agg.ramAvg != null) ? (
    '<div class="vcd-health">' +
    '<div class="vcd-hcard">' +
      '<div class="vcd-hcard-title">CPU — ' + d.esxi.length + ' ESXi</div>' +
      (agg.cpuAvg != null ? (
        '<div class="vcd-hrow"><span class="vcd-hlbl">Média</span><span class="vcd-hval" style="color:' + vcd_stateColor(agg.cpuAvg,60,80) + '">' + agg.cpuAvg.toFixed(1) + '%</span></div>' +
        healthBar(agg.cpuAvg, 60, 80) +
        '<div class="vcd-hrow" style="margin-top:8px"><span class="vcd-hlbl">Pico (host)</span><span class="vcd-hval" style="color:' + vcd_stateColor(agg.cpuMax,75,90) + '">' + agg.cpuMax.toFixed(1) + '%</span></div>' +
        healthBar(agg.cpuMax, 75, 90)
      ) : '<div style="color:#6E7681;font-size:11px">sem dados</div>') +
    '</div>' +
    '<div class="vcd-hcard">' +
      '<div class="vcd-hcard-title">RAM — ' + d.esxi.length + ' ESXi</div>' +
      (agg.ramAvg != null ? (
        '<div class="vcd-hrow"><span class="vcd-hlbl">Média</span><span class="vcd-hval" style="color:' + vcd_stateColor(agg.ramAvg,60,80) + '">' + agg.ramAvg.toFixed(1) + '%</span></div>' +
        healthBar(agg.ramAvg, 60, 80) +
        '<div class="vcd-hrow" style="margin-top:8px"><span class="vcd-hlbl">Pico (host)</span><span class="vcd-hval" style="color:' + vcd_stateColor(agg.ramMax,70,85) + '">' + agg.ramMax.toFixed(1) + '%</span></div>' +
        healthBar(agg.ramMax, 70, 85)
      ) : '<div style="color:#6E7681;font-size:11px">sem dados</div>') +
    '</div>' +
    '</div>'
  ) : ''

  // ── CLUSTERS ──────────────────────────────────────────────────────────────

  var clsCards = clsNames.length
    ? clsNames.map(function(cls) {
        var c       = d.clusters[cls]
        var cColor  = SC[c.status] || SC[0]
        var badgeOk = c.status === 1 || c.status === 0
        return '<div class="vcd-cls-card" style="border-color:' + (c.status > 1 ? cColor + '44' : '#21262D') + '">' +
          '<div class="vcd-cls-name">' +
            '<span style="width:9px;height:9px;border-radius:50%;background:' + cColor + ';flex-shrink:0;display:inline-block"></span>' +
            '<span class="vcd-cls-name-text" title="' + SH.esc(cls) + '">' + SH.esc(cls) + '</span>' +
            (!badgeOk ? '<span style="font-size:10px;font-weight:700;color:' + cColor + ';flex-shrink:0">' + SL[c.status] + '</span>' : '') +
          '</div>' +
          '<div class="vcd-cls-meta">' +
            '<div class="vcd-cls-kv"><div class="vcd-cls-val">' + (c.esxiCount || '—') + '</div><div class="vcd-cls-key">ESXi</div></div>' +
          '</div>' +
        '</div>'
      }).join('')
    : '<div style="color:#6E7681;font-size:12px;font-style:italic;padding:8px 0">sem dados de clusters</div>'

  var clsSec = '<div class="vcd-sh"><span class="vcd-sh-title">Clusters</span><span class="vcd-sh-count">· ' + clsNames.length + '</span></div>' +
    '<div class="vcd-cls-grid">' + clsCards + '</div>'

  // ── ESXi TABLE ────────────────────────────────────────────────────────────

  function pbar(pct, color) {
    return '<div class="vcd-bar"><div class="vcd-bar-f" style="width:' + Math.min(pct||0,100).toFixed(1) + '%;background:' + color + '"></div></div>'
  }

  function connBadge(state) {
    if (!state) return '<span style="color:#6E7681">—</span>'
    var s = String(state).toLowerCase()
    if (s.indexOf('connect') >= 0 && s.indexOf('disconnect') < 0) {
      return '<span class="vcd-conn" style="color:#3FB950;background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#3FB950;display:inline-block"></span>Ligado</span>'
    }
    if (s.indexOf('maintenance') >= 0) {
      return '<span class="vcd-conn" style="color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#D29922;display:inline-block"></span>Manutenção</span>'
    }
    return '<span class="vcd-conn" style="color:#F85149;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#F85149;display:inline-block"></span>Desl.</span>'
  }

  // Agrupar ESXi por cluster para separadores visuais
  var prevCluster = null
  var esxiRowsHtml = d.esxi.map(function(h) {
    var sepRow = ''
    if (h.cluster !== prevCluster) {
      prevCluster = h.cluster
      sepRow = '<tr class="vcd-tbl-sep"><td colspan="8">' + SH.esc(h.cluster) + '</td></tr>'
    }
    var cpuC = vcd_stateColor(h.cpu, 75, 90)
    var ramC = vcd_stateColor(h.ramPct, 70, 85)
    var balloonWarn = h.ballooning != null && h.ballooning > 0
      ? '<div style="font-size:10px;color:#D29922;margin-top:2px">▲ ' + h.ballooning + ' GB balloon</div>' : ''
    return sepRow +
      '<tr>' +
      '<td style="font-size:12px;font-weight:600;color:#E6EDF3">' + SH.esc(h.name) + '</td>' +
      '<td>' + connBadge(h.connState) + '</td>' +
      '<td>' +
        (h.cpu != null
          ? '<span style="font-size:13px;font-weight:700;color:' + cpuC + '">' + h.cpu.toFixed(1) + '%</span>' + pbar(h.cpu, cpuC)
          : '<span style="color:#6E7681">—</span>') +
      '</td>' +
      '<td>' +
        (h.ramPct != null
          ? '<span style="font-size:13px;font-weight:700;color:' + ramC + '">' + h.ramPct.toFixed(1) + '%</span>' +
            '<div style="font-size:10px;color:#6E7681">' + (h.ramGb||'?') + '/' + (h.ramTGb||'?') + ' GB</div>' +
            pbar(h.ramPct, ramC) + balloonWarn
          : '<span style="color:#6E7681">—</span>') +
      '</td>' +
      '<td style="text-align:center;color:#58A6FF;font-weight:700">' + (h.vms != null ? h.vms : '—') + '</td>' +
      '<td style="color:#6E7681">' + vcd_fmtUptime(h.uptime) + '</td>' +
      '<td style="color:#6E7681;text-align:right">' + (h.power ? h.power.toFixed(0) + ' W' : '—') + '</td>' +
      '</tr>'
  }).join('')

  var esxiSec = '<div class="vcd-sh"><span class="vcd-sh-title">Hosts ESXi</span><span class="vcd-sh-count">· ' + d.esxi.length + '</span></div>' +
    '<table class="vcd-tbl">' +
    '<thead><tr>' +
      '<th>Host</th><th>Estado</th><th>CPU</th><th>RAM</th><th>VMs</th><th>Uptime</th><th style="text-align:right">Energia</th>' +
    '</tr></thead>' +
    '<tbody>' + (esxiRowsHtml || '<tr><td colspan="7" style="color:#6E7681;padding:12px 10px;font-style:italic">Sem hosts ESXi associados a este vCenter.</td></tr>') + '</tbody>' +
    '</table>'

  // ── TRIGGERS ──────────────────────────────────────────────────────────────

  var SEV_LBL   = ['N/C','Info','Aviso','Média','Alto','Desastre']
  var SEV_COLOR = ['#6E7681','#6E7681','#D29922','#D29922','#F85149','#F85149']

  var trgHtml = (d.triggers || []).map(function(t) {
    var sev   = parseInt(t.priority) || 0
    var color = SEV_COLOR[sev] || '#6E7681'
    var host  = t.hosts && t.hosts[0]
      ? t.hosts[0].name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i, '').replace(/^ESXi\s*-\s*/i, '')
      : '—'
    return '<div class="vcd-trg-row">' +
      '<span class="vcd-trg-sev" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44">' + SEV_LBL[sev] + '</span>' +
      '<span class="vcd-trg-host">' + SH.esc(host) + '</span>' +
      '<span class="vcd-trg-desc">' + SH.esc(t.description) + '</span>' +
      '<span class="vcd-trg-age">' + vcd_fmtAge(t.lastchange) + '</span>' +
    '</div>'
  }).join('')

  var trgSec = '<div class="vcd-sh"><span class="vcd-sh-title">Triggers Activos</span><span class="vcd-sh-count">· ' + (d.triggers||[]).length + '</span></div>' +
    (trgHtml || '<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#3FB950">' +
      '<span style="width:8px;height:8px;border-radius:50%;background:#3FB950;display:inline-block"></span>' +
      '<span style="font-size:13px;font-weight:600">Sem triggers activos</span></div>')

  var divider = '<div style="border-top:1px solid #21262D;margin:0 0 16px"></div>'

  el.innerHTML = css +
    '<div class="vcd-wrap">' +
      topo + divider +
      (healthHtml ? healthHtml + divider : '') +
      clsSec + divider +
      esxiSec + divider +
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
