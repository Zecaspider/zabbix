// N2 VMware — vCenter Overview
// Dashboard: n2-infraestrutura-vmware (a967e936)
// Painel: bpc-vmw-vcenter
// v3.0 — 2-phase parallel fetch; vCenters identificados por dado (vmware.fullname),
//         não por nome; clusters de LLD keys; VM on/off com tabela de problemáticas;
//         window.BPC_VMW exposto para painéis irmãos

var CFG_VMW_VC = {
  elementId:      'bpc-vmw-vcenter',
  groupIdESXi:    '608',
  refreshMs:      60000,
  staleThreshold: 3600,    // segundos — item com lastclock > isto é considerado stale
  vmTableDefault: 15,      // VMs desligadas visíveis antes do toggle "ver todas"
  statusColor:    ['#6E7681','#3FB950','#D29922','#F85149'],
  statusLabel:    ['?','OK','WARN','CRIT'],
  PROXY: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function vmw_normalizeUrl(url) {
  return (url || '').toLowerCase().replace(/\/sdk$/, '').replace(/\/$/, '').trim()
}

function vmw_extractUuid(key) {
  // vmware.vm.powerstate[https://host/sdk,uuid]  →  uuid
  var i = key.lastIndexOf(',')
  if (i < 0) return null
  return key.slice(i + 1).replace(']', '').trim()
}

function vmw_extractClusterFromKey(key) {
  // vmware.cluster.status[https://host/sdk,ClusterName]  →  ClusterName
  var match = key.match(/vmware\.cluster\.status\[[^\]]+?,(.+)\]/)
  return match ? match[1].trim() : null
}

function vmw_vmNameFromItemName(itemName) {
  // "VM-PROD-001: Power state"  →  "VM-PROD-001"
  return (itemName || '').replace(/:\s*Power state\s*$/i, '').trim()
}

// ─── fetch ────────────────────────────────────────────────────────────────────

function start_vcenter(rpc) {
  var el = document.getElementById(CFG_VMW_VC.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:12px;color:#6E7681;font-size:11px;font-family:monospace">A carregar vCenters…</div>'

  var now = Math.floor(Date.now() / 1000)

  function zpost(method, params) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest()
      xhr.open('POST', CFG_VMW_VC.PROXY, true)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.onload = function() {
        try { resolve(JSON.parse(xhr.responseText).result || []) }
        catch(e) { reject(e) }
      }
      xhr.onerror = function() { reject(new Error('XHR error')) }
      xhr.send(JSON.stringify({ jsonrpc:'2.0', method:method, params:params, id:1 }))
    })
  }

  // ── FASE 1 — paralelo, sem dependências ──────────────────────────────────
  // P1A identifica vCenters pelo único item que só eles têm: vmware.fullname[
  // P1B traz ESXi do grupo 608 com a macro {$VMWARE.URL} (chave de join)
  Promise.all([
    zpost('item.get', {
      search:  { key_: 'vmware.fullname[' },
      output:  ['hostid','lastvalue','lastclock'],
      limit:   50
    }),
    zpost('host.get', {
      groupids:     [CFG_VMW_VC.groupIdESXi],
      output:       ['hostid','name'],
      selectMacros: ['macro','value'],
      limit:        500
    })
  ]).then(function(p1) {
    var fullnameItems = p1[0]
    var esxiHosts     = p1[1]

    if (!fullnameItems.length) {
      el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">Nenhum vCenter encontrado — item vmware.fullname ausente</div>'
      return
    }

    // Indexar fullname e lastclock por hostid
    var vcFullname  = {}
    var vcLastclock = {}
    var vcIdsRaw    = []
    fullnameItems.forEach(function(i) {
      vcFullname[i.hostid]  = i.lastvalue
      vcLastclock[i.hostid] = parseInt(i.lastclock) || 0
      vcIdsRaw.push(i.hostid)
    })
    // Dedup de hostids (vmware.fullname pode ter mais de um item por host em alguns templates)
    var vcIds = vcIdsRaw.filter(function(v, i, a) { return a.indexOf(v) === i })

    // Mapa URL→hostid dos ESXi
    var esxiUrlMap = {}
    esxiHosts.forEach(function(h) {
      var m = (h.macros || []).find(function(x) { return x.macro === '{$VMWARE.URL}' })
      if (m && m.value) esxiUrlMap[h.hostid] = vmw_normalizeUrl(m.value)
    })

    // ── FASE 2 — paralelo, usa vcIds + grupo 609 ────────────────────────────
    // Powerstate: fonte primária = items no host vCenter (LLD); fallback = hosts grupo 609
    // Os items vmware.vm.powerstate vivem nos hosts VM (grupo 609), não no vCenter host.
    // A fonte primária cobre o caso em que o LLD do vCenter gerou items próprios.
    Promise.all([
      // P2A — nome Zabbix + macro URL dos hosts vCenter
      zpost('host.get', {
        hostids:      vcIds,
        output:       ['hostid','name'],
        selectMacros: ['macro','value']
      }),
      // P2B — estado global do vCenter
      zpost('item.get', {
        hostids: vcIds,
        search:  { key_: 'vmware.status[' },
        output:  ['hostid','lastvalue','lastclock'],
        limit:   20
      }),
      // P2C — clusters: nome no KEY, estado no VALUE (imunes a Z.8)
      zpost('item.get', {
        hostids: vcIds,
        search:  { key_: 'vmware.cluster.status[' },
        output:  ['hostid','key_','lastvalue'],
        limit:   200
      }),
      // P2D — primário: powerstate nos items do host vCenter (se LLD correu no vCenter)
      zpost('item.get', {
        hostids: vcIds,
        search:  { key_: 'vmware.vm.powerstate[' },
        output:  ['hostid','key_','name','lastvalue','lastclock'],
        limit:   2000
      }),
      // P2E — fallback: hosts VM do grupo 609 com macro {$VMWARE.URL} (join ao vCenter)
      zpost('host.get', {
        groupids:     ['609'],
        output:       ['hostid','name'],
        selectMacros: ['macro','value'],
        limit:        2000
      }),
      // P2F — fallback: powerstate nos hosts VM do grupo 609
      zpost('item.get', {
        groupids: ['609'],
        search:   { key_: 'vmware.vm.powerstate' },
        output:   ['hostid','lastvalue','lastclock'],
        limit:    2000
      }),
      // P2G — cluster de cada ESXi (grupo 608) → para contar ESXi por cluster
      zpost('item.get', {
        groupids: [CFG_VMW_VC.groupIdESXi],
        search:   { name: 'Cluster name' },
        output:   ['hostid','lastvalue'],
        monitored: true,
        limit:    500
      })
    ]).then(function(p2) {
      var vcHosts       = p2[0]
      var statusItems   = p2[1]
      var clusterItems  = p2[2]
      var powerItemsVC  = p2[3]  // primário — items no host vCenter
      var vmHosts       = p2[4]  // fallback — hosts do grupo 609
      var powerItemsG9  = p2[5]  // fallback — powerstate por host VM
      var hvClusterItems= p2[6]  // ESXi → nome do cluster

      // Índice grupo 609: hostid → {name, vcUrl}
      var vmHostMap = {}
      vmHosts.forEach(function(h) {
        var urlM = (h.macros||[]).find(function(m){ return m.macro === '{$VMWARE.URL}' })
        vmHostMap[h.hostid] = { name: h.name, vcUrl: urlM ? vmw_normalizeUrl(urlM.value) : null }
      })

      // Índice powerstate grupo 609: hostid → {on, lastclock}
      var g9PowerIdx = {}
      powerItemsG9.forEach(function(i){ g9PowerIdx[i.hostid] = { on: i.lastvalue==='1', lck: parseInt(i.lastclock)||0 } })

      // Fonte primária válida por vCenter: tem items com lastclock > 0
      var vcHasPrimary = {}
      powerItemsVC.forEach(function(i){ if (parseInt(i.lastclock||0)>0) vcHasPrimary[i.hostid] = true })

      // Variáveis unificadas para a reconciliação (mesmo contrato de antes)
      var powerItems   = powerItemsVC   // primário usado na reconciliação se vcHasPrimary
      var clsNameItems = []
      var hvNameItems  = []

      // ── RECONCILIAÇÃO ────────────────────────────────────────────────────

      // 1. Construir mapa de vCenters indexado por hostid
      var vcMap = {}
      vcHosts.forEach(function(h) {
        var urlMacro = (h.macros || []).find(function(m) { return m.macro === '{$VMWARE.URL}' })
        var url = urlMacro ? vmw_normalizeUrl(urlMacro.value) : ''
        vcMap[h.hostid] = {
          hostid:    h.hostid,
          name:      h.name,
          fullname:  vcFullname[h.hostid] || '',
          url:       url,
          status:    0,
          stale:     (now - (vcLastclock[h.hostid] || 0)) > CFG_VMW_VC.staleThreshold,
          clusters:  {},
          vms:       { on: [], off: [] },
          esxiCount: 0,
        }
      })

      // 2. Deduplicar vCenters por URL normalizado (manter primeiro por hostid mais baixo)
      var urlToVcId = {}
      Object.keys(vcMap).sort().forEach(function(hid) {
        var url = vcMap[hid].url
        if (!url) return
        if (!urlToVcId[url]) {
          urlToVcId[url] = hid
        } else {
          vcMap[hid]._dup = true
        }
      })

      // 3. Status do vCenter
      statusItems.forEach(function(i) {
        var vc = vcMap[i.hostid]
        if (!vc || vc._dup) return
        vc.status = parseInt(i.lastvalue) || 0
        vc.stale  = (now - parseInt(i.lastclock || 0)) > CFG_VMW_VC.staleThreshold
      })

      // 4. Clusters: nome extraído do KEY (robusto mesmo com Z.8)
      clusterItems.forEach(function(i) {
        var vc = vcMap[i.hostid]
        if (!vc || vc._dup) return
        var clsName = vmw_extractClusterFromKey(i.key_)
        if (!clsName) return
        vc.clusters[clsName] = { status: parseInt(i.lastvalue) || 0 }
      })

      // 5. Mapas auxiliares VM→cluster e VM→ESXi (por hostid+uuid)
      var vmClusterMap = {}
      clsNameItems.forEach(function(i) {
        var uuid = vmw_extractUuid(i.key_)
        if (uuid && i.lastvalue) vmClusterMap[i.hostid + ':' + uuid] = i.lastvalue
      })
      var vmHvMap = {}
      hvNameItems.forEach(function(i) {
        var uuid = vmw_extractUuid(i.key_)
        if (uuid && i.lastvalue) vmHvMap[i.hostid + ':' + uuid] = i.lastvalue
      })

      // 6. VMs: powerstate — primário (vCenter LLD) ou fallback (grupo 609)
      // Primário: item por UUID, hostid = vCenter hostid, nome via item.name
      var vcPrimaryDone = {}
      powerItems.forEach(function(i) {
        var vc = vcMap[i.hostid]
        if (!vc || vc._dup) return
        if (!vcHasPrimary[i.hostid]) return   // dados stale — usa fallback
        var uuid   = vmw_extractUuid(i.key_)
        var vmName = vmw_vmNameFromItemName(i.name)
        var cluster = uuid ? (vmClusterMap[i.hostid + ':' + uuid] || null) : null
        var esxi    = uuid ? (vmHvMap[i.hostid    + ':' + uuid] || null) : null
        var vm = { name: vmName, cluster: cluster, esxi: esxi }
        if (i.lastvalue === '1') vc.vms.on.push(vm)
        else                     vc.vms.off.push(vm)
        vcPrimaryDone[i.hostid] = true
      })

      // Fallback: um item por host VM do grupo 609; join ao vCenter via {$VMWARE.URL}
      vmHosts.forEach(function(h) {
        var info  = vmHostMap[h.hostid]
        if (!info || !info.vcUrl) return
        var vcId  = urlToVcId[info.vcUrl]
        if (!vcId || vcPrimaryDone[vcId]) return   // primário já cobriu este vCenter
        var vc    = vcMap[vcId]
        if (!vc || vc._dup) return
        var ps    = g9PowerIdx[h.hostid]
        var isOn  = ps ? ps.on : false
        var vm    = { name: info.name, cluster: null, esxi: null, staleData: !ps || ps.lck === 0 }
        if (isOn) vc.vms.on.push(vm)
        else      vc.vms.off.push(vm)
      })

      // 7. Contagem de ESXi por vCenter + por cluster (via URL + P2G)
      var esxiClusterMap = {}   // hostid → clusterName
      hvClusterItems.forEach(function(i) {
        if (i.lastvalue) esxiClusterMap[i.hostid] = i.lastvalue
      })
      esxiHosts.forEach(function(h) {
        var url  = esxiUrlMap[h.hostid]
        var vcId = url ? urlToVcId[url] : null
        if (!vcId || !vcMap[vcId]) return
        vcMap[vcId].esxiCount++
        var clsName = esxiClusterMap[h.hostid]
        if (clsName && vcMap[vcId].clusters[clsName]) {
          vcMap[vcId].clusters[clsName].esxiCount = (vcMap[vcId].clusters[clsName].esxiCount || 0) + 1
        }
      })

      // 7b. Contagem de VMs por cluster (de vms.on + vms.off, quando cluster disponível)
      Object.keys(vcMap).forEach(function(vcId) {
        var vc = vcMap[vcId]
        vc.vms.on.concat(vc.vms.off).forEach(function(vm) {
          if (vm.cluster && vc.clusters[vm.cluster]) {
            vc.clusters[vm.cluster].vmCount = (vc.clusters[vm.cluster].vmCount || 0) + 1
          }
        })
      })

      // 8. Expor dados partilhados para painéis irmãos (l2-tabela, l2-triggers)
      window.BPC_VMW = {
        vcenters:   vcMap,
        urlToVcId:  urlToVcId,
        esxiHosts:  esxiHosts,
        esxiUrlMap: esxiUrlMap,
      }

      vmw_render(el, vcMap)
    })
  }).catch(function(err) {
    el.innerHTML = '<div style="padding:16px;color:#F85149;font-family:monospace">Erro: ' + err.message + '</div>'
  })
}

// ─── render ───────────────────────────────────────────────────────────────────

function vmw_render(el, vcMap) {
  var C = CFG_VMW_VC

  var css = '<style>' +
    '#bpc-vmw-vcenter{font-family:"JetBrains Mono",monospace;color:#CDD9E5}' +

    /* grid de cards — mínimo 380px para caber num painel médio */
    '.vmw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px;padding:12px 12px 8px}' +
    '.vc-card{background:rgba(255,255,255,0.03);border:1px solid #21262D;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}' +
    '.vc-card:hover{border-color:#30363D}' +

    /* ── HEADER ── */
    '.vc-hdr{padding:14px 16px 12px;border-bottom:1px solid #21262D}' +
    '.vc-hdr-top{display:flex;align-items:flex-start;gap:10px;margin-bottom:6px}' +
    '.vc-status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:.3px;white-space:nowrap;flex-shrink:0}' +
    '.vc-name{font-size:17px;font-weight:700;color:#E6EDF3;flex:1;line-height:1.3;word-break:break-word}' +
    '.vc-fullname{font-size:11px;color:#6E7681;line-height:1.4;margin-top:2px}' +
    '.vc-stale{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.2);border-radius:4px;padding:2px 8px;margin-top:6px;white-space:nowrap}' +

    /* ── STATS ROW — ESXi + Clusters + VMs ── */
    '.vc-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1px;background:#21262D;border-top:1px solid #21262D;border-bottom:1px solid #21262D}' +
    '.vc-stat{background:#0D1117;padding:14px 14px;text-align:center}' +
    '.vc-stat-num{font-size:32px;font-weight:700;line-height:1;margin-bottom:5px;color:#E6EDF3}' +
    '.vc-stat-lbl{font-size:13px;color:#8B949E;text-transform:uppercase;letter-spacing:.5px;font-weight:600}' +

    /* ── CLUSTERS — layout de tabela ── */
    '.vc-cls-section{padding:10px 16px 8px}' +
    '.vc-cls-title{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}' +
    '.vc-cls-list{display:table;width:100%;border-collapse:separate;border-spacing:0 4px}' +
    '.vc-cls-hdr{display:table-row}' +
    '.vc-cls-hdr-cell{display:table-cell;font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.5px;padding:0 10px 4px;border-bottom:1px solid rgba(255,255,255,0.07)}' +
    '.vc-cls-hdr-cell:first-child{padding-left:0}' +
    '.vc-cls-row{display:table-row}' +
    '.vc-cls-row.vc-cls-warn .vc-cls-cell{background:rgba(210,153,34,.04)}' +
    '.vc-cls-row.vc-cls-crit .vc-cls-cell{background:rgba(248,81,73,.04)}' +
    '.vc-cls-cell{display:table-cell;padding:5px 10px;vertical-align:middle;border-top:1px solid transparent;border-bottom:1px solid transparent;white-space:nowrap}' +
    '.vc-cls-cell:first-child{padding-left:0;border-radius:5px 0 0 5px}' +
    '.vc-cls-cell:last-child{border-radius:0 5px 5px 0}' +
    '.vc-cls-sep{display:table-cell;padding:5px 6px;vertical-align:middle;color:rgba(255,255,255,0.1);font-size:14px;user-select:none}' +
    '.vc-cls-dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex-shrink:0;vertical-align:middle;margin-right:7px}' +
    '.vc-cls-name{font-size:13px;color:#CDD9E5;font-weight:600;vertical-align:middle}' +
    '.vc-cls-stat{font-size:14px;font-weight:700;color:#8B949E;text-align:center;min-width:36px}' +
    '.vc-cls-badge{font-size:11px;font-weight:700;padding:2px 7px;border-radius:3px;white-space:nowrap}' +

    /* ── DRILL LINK ── */
    '.vc-drill{display:flex;align-items:center;justify-content:flex-end;padding:8px 16px 10px;border-top:1px solid #21262D;margin-top:auto}' +
    '.vc-drill-link{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#58A6FF;text-decoration:none;padding:4px 10px;border:1px solid rgba(88,166,255,.2);border-radius:5px;background:rgba(88,166,255,.05)}' +
    '.vc-drill-link:hover{background:rgba(88,166,255,.12);border-color:rgba(88,166,255,.4)}' +

    /* ── VMs FOOTER ── */
    '.vc-vms{display:flex;align-items:center;gap:10px;padding:10px 16px 8px}' +
    '.vc-vm-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:5px;font-size:14px;font-weight:700}' +
    '.vc-vm-on{background:rgba(63,185,80,.12);color:#3FB950;border:1px solid rgba(63,185,80,.2)}' +
    '.vc-vm-off{background:rgba(248,81,73,.12);color:#F85149;border:1px solid rgba(248,81,73,.2)}' +
    '.vc-vm-total{margin-left:auto;font-size:12px;color:#6E7681}' +
    '.vc-vm-nodata{font-size:11px;color:#6E7681;font-style:italic}' +

    /* tabela de problemáticas */
    '.vmw-tbl-section{margin:0 10px 10px;border:1px solid #1C2128;border-radius:8px;overflow:hidden}' +
    '.vmw-tbl-hdr{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid #1C2128;font-size:13px;font-weight:600;color:#CDD9E5}' +
    '.vmw-badge{background:#F85149;color:#fff;border-radius:3px;padding:2px 8px;font-size:12px;font-weight:700}' +
    '.vmw-toggle{margin-left:auto;background:none;border:1px solid #30363D;border-radius:3px;color:#8B949E;font-size:12px;padding:3px 10px;cursor:pointer;font-family:inherit}' +
    '.vmw-toggle:hover{border-color:#58A6FF;color:#58A6FF}' +
    '.vmw-tbl{width:100%;border-collapse:collapse;font-size:13px}' +
    '.vmw-tbl th{text-align:left;padding:7px 14px;color:#6E7681;font-weight:400;font-size:11px;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #0D1117;white-space:nowrap}' +
    '.vmw-tbl td{padding:6px 14px;border-bottom:1px solid #0D1117;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}' +
    '.vmw-tbl tr:last-child td{border-bottom:none}' +
    '.vmw-tbl tr:hover td{background:rgba(255,255,255,0.02)}' +
    '.vmw-hidden{display:none}' +
    '.vmw-off-dot{color:#F85149;font-size:15px}' +
    '.vmw-na{color:#6E7681}' +
    '</style>'

  // ── Cards ────────────────────────────────────────────────────────────────
  var activeIds = Object.keys(vcMap)
    .filter(function(id) { return !vcMap[id]._dup })
    .sort(function(a, b) { return vcMap[a].name.localeCompare(vcMap[b].name) })

  // Calcular máximo de clusters para alinhar altura da secção
  var maxCls = activeIds.reduce(function(m, id) {
    return Math.max(m, Object.keys(vcMap[id].clusters).length)
  }, 0)

  var cards = activeIds.map(function(vcId) {
    var vc     = vcMap[vcId]
    var sColor = C.statusColor[vc.status] || C.statusColor[0]
    var sLabel = C.statusLabel[vc.status] || '?'
    var clsNames = Object.keys(vc.clusters).sort()
    var onCount  = vc.vms.on.length
    var offCount = vc.vms.off.length
    var total    = onCount + offCount

    // ── HEADER ──
    var pillBg = {
      0: 'rgba(110,118,129,.18)', 1: 'rgba(63,185,80,.15)',
      2: 'rgba(210,153,34,.15)', 3: 'rgba(248,81,73,.15)'
    }[vc.status] || 'rgba(110,118,129,.18)'
    var statusPill = '<span class="vc-status-pill" style="background:' + pillBg + ';color:' + sColor + ';border:1px solid ' + sColor + '33">' +
      '<span style="width:7px;height:7px;border-radius:50%;background:' + sColor + ';flex-shrink:0;display:inline-block"></span>' +
      sLabel + '</span>'

    var staleTag = vc.stale
      ? '<div class="vc-stale">⚠ dados desactualizados</div>'
      : ''

    // Subtítulo: IP do vCenter (extraído do URL normalizado)
    var vcIp = vc.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || ''

    var hdr = '<div class="vc-hdr">' +
      '<div class="vc-hdr-top">' +
        '<div class="vc-name">' + vc.name + '</div>' +
        statusPill +
      '</div>' +
      (vcIp ? '<div class="vc-fullname">' + vcIp + '</div>' : '') +
      staleTag +
    '</div>'

    // ── STATS ROW ──
    var stats = '<div class="vc-stats">' +
      '<div class="vc-stat">' +
        '<div class="vc-stat-num" style="color:#58A6FF">' + vc.esxiCount + '</div>' +
        '<div class="vc-stat-lbl">Hosts ESXi</div>' +
      '</div>' +
      '<div class="vc-stat">' +
        '<div class="vc-stat-num" style="color:#A5D6FF">' + clsNames.length + '</div>' +
        '<div class="vc-stat-lbl">Clusters</div>' +
      '</div>' +
      '<div class="vc-stat">' +
        '<div class="vc-stat-num" style="color:#' + (total > 0 ? 'E6EDF3' : '6E7681') + '">' + (total > 0 ? total : '—') + '</div>' +
        '<div class="vc-stat-lbl">VMs Total</div>' +
      '</div>' +
    '</div>'

    // ── CLUSTERS — tabela com colunas Cluster | ESXi | VMs ──
    var clsHeader = '<div class="vc-cls-hdr">' +
      '<div class="vc-cls-hdr-cell" style="padding-left:0">Cluster</div>' +
      '<div class="vc-cls-sep"></div>' +
      '<div class="vc-cls-hdr-cell" style="text-align:center">ESXi</div>' +
      '<div class="vc-cls-sep"></div>' +
      '<div class="vc-cls-hdr-cell" style="text-align:center">VMs</div>' +
      '<div class="vc-cls-hdr-cell"></div>' +
    '</div>'

    var clsRows = clsNames.length
      ? clsNames.map(function(cls) {
          var c      = vc.clusters[cls]
          var cColor = C.statusColor[c.status] || C.statusColor[0]
          var rowCls = c.status === 3 ? 'vc-cls-crit' : c.status === 2 ? 'vc-cls-warn' : ''
          var badge  = c.status > 1
            ? '<span class="vc-cls-badge" style="background:' + cColor + '1A;color:' + cColor + '">' + C.statusLabel[c.status] + '</span>'
            : ''
          var esxiVal = c.esxiCount != null && c.esxiCount > 0 ? c.esxiCount : '—'
          var vmVal   = c.vmCount   != null && c.vmCount   > 0 ? c.vmCount   : '—'
          return '<div class="vc-cls-row ' + rowCls + '">' +
            '<div class="vc-cls-cell">' +
              '<span class="vc-cls-dot" style="background:' + cColor + '"></span>' +
              '<span class="vc-cls-name" title="' + cls + '">' + cls + '</span>' +
            '</div>' +
            '<div class="vc-cls-sep">|</div>' +
            '<div class="vc-cls-cell vc-cls-stat">' + esxiVal + '</div>' +
            '<div class="vc-cls-sep">|</div>' +
            '<div class="vc-cls-cell vc-cls-stat">' + vmVal + '</div>' +
            '<div class="vc-cls-cell">' + badge + '</div>' +
          '</div>'
        }).join('')
      : '<div style="font-size:11px;color:#6E7681;font-style:italic;padding:4px 2px">sem dados de clusters</div>'

    // Preencher até maxCls para alinhar altura entre cards
    var emptyCount = maxCls - clsNames.length
    var emptyRows  = ''
    for (var ei = 0; ei < emptyCount; ei++) {
      emptyRows += '<div class="vc-cls-row" style="opacity:0;pointer-events:none">' +
        '<div class="vc-cls-cell">&nbsp;</div>' +
        '<div class="vc-cls-sep"></div>' +
        '<div class="vc-cls-cell vc-cls-stat"></div>' +
        '<div class="vc-cls-sep"></div>' +
        '<div class="vc-cls-cell vc-cls-stat"></div>' +
        '<div class="vc-cls-cell"></div>' +
      '</div>'
    }

    var clsSec = '<div class="vc-cls-section">' +
      '<div class="vc-cls-list">' + clsHeader + clsRows + emptyRows + '</div>' +
    '</div>'

    // ── VMs FOOTER ──
    var vmsSec = '<div class="vc-vms">' +
      (total > 0
        ? '<span class="vc-vm-badge vc-vm-on">▲ ' + onCount + ' ligadas</span>' +
          '<span class="vc-vm-badge vc-vm-off">▼ ' + offCount + ' desligadas</span>' +
          '<span class="vc-vm-total">' + total + ' total</span>'
        : '<span class="vc-vm-nodata">sem dados de VMs (Z.8)</span>'
      ) +
    '</div>'

    // ── DRILL LINKS ──
    var n3Url   = 'http://10.10.126.22:3000/d/59e7e4b2-2ccd-4c97-b523-e7b50b705666/n3-vcenter-detalhe?var-vcenter_hostid=' + vcId
    var vcWebUrl = (vc.url ? vc.url.replace(/^https?:\/\//, 'https://') : '#') + '/ui/'
    var drillSec = '<div class="vc-drill">' +
      '<a class="vc-drill-link" href="' + n3Url + '" target="_blank" rel="noopener" style="margin-right:6px">' +
        '↗ Ver detalhes' +
      '</a>' +
      '<a class="vc-drill-link" href="' + vcWebUrl + '" target="_blank" rel="noopener" style="color:#3FB950;border-color:rgba(63,185,80,.2);background:rgba(63,185,80,.05)">' +
        '⎋ Abrir vCenter' +
      '</a>' +
    '</div>'

    return '<div class="vc-card">' + hdr + stats + clsSec + vmsSec + drillSec + '</div>'
  }).join('')

  el.innerHTML = css + '<div class="vmw-grid">' + cards + '</div>'

  // Auto-refresh
  if (CFG_VMW_VC._timer) clearTimeout(CFG_VMW_VC._timer)
  CFG_VMW_VC._timer = setTimeout(function() {
    if (typeof window.waitForBPC === 'function') window.waitForBPC(start_vcenter)
  }, CFG_VMW_VC.refreshMs)
}

// ─── bootstrap ────────────────────────────────────────────────────────────────

function initWithRetry_vcenter(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start_vcenter)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-vcenter: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function() { initWithRetry_vcenter(attempt + 1) }, 100)
}

initWithRetry_vcenter()
