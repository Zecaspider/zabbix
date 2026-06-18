// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · SERVIDORES VIRTUAIS · TABELA DE VMs                    ║
// ║  v3.1 · Framework BPC-UI v9 · waitForBPC bootstrap                     ║
// ║                                                                          ║
// ║  Fonte principal: Agente Zabbix (system.cpu.util / vm.memory.size)      ║
// ║  Fallback: VMware (vmware.vm.cpu.usage.perf / vmware.vm.memory.size.*)  ║
// ║  Filtro: variável Grafana var-ambiente (dropdown nativo)                ║
// ║                                                                          ║
// ║  Colunas: Estado · VM · Fonte · CPU · RAM · Disco · Power/Uptime ·      ║
// ║           Triggers · Ver Detalhe                                         ║
// ║                                                                          ║
// ║  [1] CFG   [2] SORT   [3] FETCH   [4] COMPUTE   [5] RENDER   [6] BOOT  ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_VMTAB = {
  elementId:  'bpc-sv-tabela',
  groupId:    '609',
  refreshMs:  60000,

  maxAgeSec: {
    agent:  7200,
    vmware: 600,
  },

  grafanaL3: 'http://10.10.126.22:3000/d/0ae673a3-44c8-41e0-98f5-f5c53473ad54/n3-sv-versao-a-bt',

  ambienteTags: ['Produção', 'producao'],

  // Keys RAM do agente — este ambiente usa [used]+[total], não [available]+[total]
  agentMemKeys: { used: 'vm.memory.size[used]', total: 'vm.memory.size[total]' },

  thresholds: {
    cpu:  { warn: 75, crit: 90 },
    ram:  { warn: 75, crit: 90 },
    disk: { warn: 70, crit: 85 },
  },

  fs: {
    header:  '12px',
    cell:    '15px',
    value:   '18px',
    sub:     '12px',
    badge:   '11px',
    name:    '15px',
    nameSub: '12px',
  },
}

var _vmHostCache  = null
var _vmLastRows   = null                         // rows computadas (sem sort display)
var _vmSortState  = { col: 'state', dir: 1 }    // padrão: pior primeiro
var _vmEl         = null                         // referência ao elemento para re-render


// ────────────────────────────────────────────────────────────────────────────
// [2] SORT — helpers a nível de módulo (usados no compute e no click handler)
// ────────────────────────────────────────────────────────────────────────────

function stateOrder(s)  { return s === 'crit' ? 0 : s === 'warn' ? 1 : 2 }
function srcOrder(s)    { return s === 'agent' ? 0 : s === 'vmware' ? 1 : 2 }
function prio2state(p)  { p = parseInt(p); return p >= 4 ? 'crit' : p >= 2 ? 'warn' : 'ok' }

function vmApplySort(rows, col, dir) {
  var S = window.BPC.state
  return rows.slice().sort(function (a, b) {
    var av, bv
    switch (col) {
      case 'state':  av = stateOrder(a.rowState);      bv = stateOrder(b.rowState);      break
      case 'vm':     av = a.techName.toLowerCase();    bv = b.techName.toLowerCase();    break
      case 'source': av = srcOrder(a.dataSource);      bv = srcOrder(b.dataSource);      break
      case 'cpu':    av = a.cpu    != null ? a.cpu    : -1; bv = b.cpu    != null ? b.cpu    : -1; break
      case 'ram':    av = a.ramPct != null ? a.ramPct : -1; bv = b.ramPct != null ? b.ramPct : -1; break
      case 'disk':   av = a.disk   ? a.disk.pused     : -1; bv = b.disk   ? b.disk.pused     : -1; break
      case 'power':  av = a.powerOn === true ? 0 : a.powerOn === false ? 2 : 1
                     bv = b.powerOn === true ? 0 : b.powerOn === false ? 2 : 1; break
      case 'trigs':  av = a.trigs.length; bv = b.trigs.length; break
      default: return 0
    }
    if (av < bv) return -1 * dir
    if (av > bv) return  1 * dir
    // desempate: agente antes vmware, depois CPU desc
    var dd = srcOrder(a.dataSource) - srcOrder(b.dataSource)
    if (dd !== 0) return dd
    return (b.cpu != null ? b.cpu : -1) - (a.cpu != null ? a.cpu : -1)
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function getUrlVar(name) {
  var params = (window.location.search || '').slice(1).split('&')
  for (var i = 0; i < params.length; i++) {
    var p = params[i].split('=')
    if (decodeURIComponent(p[0]) === 'var-' + name) return decodeURIComponent(p[1] || '')
  }
  return null
}

function resolveAmbienteTags() {
  var sel = getUrlVar('ambiente') || 'Todos'
  if (sel === 'Todos' || sel === '') return null
  if (sel === 'Producao' || sel === 'Produção') return ['Produção', 'producao']
  return [sel]
}

function vmGetHosts(rpc) {
  var tags     = resolveAmbienteTags()
  var cacheKey = tags ? tags.join(',') : '__all__'
  if (_vmHostCache && _vmHostCache._key === cacheKey && _vmHostCache.length) {
    return Promise.resolve(_vmHostCache)
  }
  var query = { groupids: [CFG_VMTAB.groupId], output: ['hostid', 'name', 'host'], filter: { status: 0 } }
  if (tags) { query.tags = tags.map(function (v) { return { tag: 'ambiente', value: v, operator: '1' } }); query.evaltype = '2' }
  return rpc('host.get', query).then(function (hosts) {
    hosts._key = cacheKey; _vmHostCache = hosts; return hosts
  })
}

function vmFetch(rpc) {
  return vmGetHosts(rpc).then(function (hosts) {
    if (!hosts.length) return { hosts: [], agentCpu: [], agentMem: [], agentUptime: [], diskItems: [], vmwareCpu: [], vmwareMemTotal: [], vmwareMemUsed: [], vmwarePower: [], triggers: [] }
    var ids = hosts.map(function (h) { return h.hostid })
    return Promise.all([
      rpc('item.get', { hostids: ids, search: { key_: 'system.cpu.util' },              output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('item.get', { hostids: ids, search: { key_: 'vm.memory.size' },               output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('item.get', { hostids: ids, search: { key_: 'system.uptime' },                output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('item.get', { hostids: ids, search: { key_: 'vfs.fs.size[' },                 output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 20000 }),
      rpc('item.get', { hostids: ids, search: { key_: 'vmware.vm.cpu.usage.perf' },     output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('item.get', { hostids: ids, search: { key_: 'vmware.vm.memory.size[' },       output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('item.get', { hostids: ids, search: { key_: 'vmware.vm.memory.size.usage.guest' }, output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000 }),
      rpc('item.get', { hostids: ids, search: { key_: 'vmware.vm.powerstate' },         output: ['hostid','key_','lastvalue','lastclock'], monitored: true, limit: 5000  }),
      rpc('trigger.get', { hostids: ids, only_true: true, monitored: true, skipDependent: true, expandDescription: true,
        output: ['triggerid','description','priority','lastchange'], selectHosts: ['hostid'], sortfield: 'priority', sortorder: 'DESC', limit: 500 }),
    ]).then(function (res) {
      return { hosts: hosts, agentCpu: res[0], agentMem: res[1], agentUptime: res[2], diskItems: res[3],
               vmwareCpu: res[4], vmwareMemTotal: res[5], vmwareMemUsed: res[6], vmwarePower: res[7], triggers: res[8] }
    })
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function vmCompute(data) {
  var S   = window.BPC.state
  var now = Math.floor(Date.now() / 1000)

  function freshAgent(item)  { return item && parseInt(item.lastclock) > 0 && (now - parseInt(item.lastclock)) <= CFG_VMTAB.maxAgeSec.agent  }
  function freshVmware(item) { return item && parseInt(item.lastclock) > 0 && (now - parseInt(item.lastclock)) <= CFG_VMTAB.maxAgeSec.vmware }

  var agentCpuIdx = {};   (data.agentCpu || []).forEach(function (i) { agentCpuIdx[i.hostid] = i })
  var agentMemIdx = {};   (data.agentMem || []).forEach(function (i) { if (!agentMemIdx[i.hostid]) agentMemIdx[i.hostid] = {}; agentMemIdx[i.hostid][i.key_] = i })
  var uptimeIdx   = {};   (data.agentUptime || []).forEach(function (i) { uptimeIdx[i.hostid] = i })
  var vmwCpuIdx   = {};   (data.vmwareCpu || []).forEach(function (i) { vmwCpuIdx[i.hostid] = i })
  var vmwMemTotalIdx = {}; (data.vmwareMemTotal || []).forEach(function (i) { vmwMemTotalIdx[i.hostid] = i })
  var vmwMemUsedIdx  = {}; (data.vmwareMemUsed  || []).forEach(function (i) { vmwMemUsedIdx[i.hostid]  = i })
  var vmwPowerIdx    = {}; (data.vmwarePower    || []).forEach(function (i) { vmwPowerIdx[i.hostid]    = i })

  var diskWorstIdx = {}
  ;(data.diskItems || []).forEach(function (i) {
    if (i.key_.indexOf(',pused]') === -1 || !freshAgent(i)) return
    var val = parseFloat(i.lastvalue); if (isNaN(val)) return
    var m = i.key_.match(/vfs\.fs\.size\[([^,\]]+)/); var part = m ? m[1] : '?'
    if (!diskWorstIdx[i.hostid] || val > diskWorstIdx[i.hostid].pused) diskWorstIdx[i.hostid] = { part: part, pused: val }
  })

  var trgByHost = {}
  ;(data.triggers || []).forEach(function (t) {
    ;(t.hosts || []).forEach(function (h) { if (!trgByHost[h.hostid]) trgByHost[h.hostid] = []; trgByHost[h.hostid].push(t) })
  })

  function fmtUptime(secs) { secs = parseInt(secs) || 0; var d = Math.floor(secs/86400), h = Math.floor((secs%86400)/3600); return d > 0 ? d+'d '+h+'h' : h+'h' }

  var rows = data.hosts.map(function (host) {
    var hid = host.hostid

    // CPU
    var agentCpuItem = agentCpuIdx[hid], vmwareCpuItem = vmwCpuIdx[hid]
    var cpu = null, cpuSource = 'none', stale = false
    if (freshAgent(agentCpuItem))        { cpu = parseFloat(agentCpuItem.lastvalue);  cpuSource = 'agent'  }
    else if (freshVmware(vmwareCpuItem)) { cpu = parseFloat(vmwareCpuItem.lastvalue); cpuSource = 'vmware' }
    else if (agentCpuItem && parseInt(agentCpuItem.lastclock))  { cpu = parseFloat(agentCpuItem.lastvalue);  cpuSource = 'agent';  stale = true }
    else if (vmwareCpuItem && parseInt(vmwareCpuItem.lastclock)){ cpu = parseFloat(vmwareCpuItem.lastvalue); cpuSource = 'vmware'; stale = true }
    if (isNaN(cpu)) { cpu = null; stale = false }

    // RAM — template usa vm.memory.size[used] (não [available])
    var memH = agentMemIdx[hid] || {}, memAvailItem = memH['vm.memory.size[used]'], memTotalItem = memH['vm.memory.size[total]']
    var vmMemUsedItem = vmwMemUsedIdx[hid], vmMemTotalItem = vmwMemTotalIdx[hid]
    var ramPct = null, ramGb = null, ramTGb = null, ramSource = 'none'
    if (freshAgent(memAvailItem) && freshAgent(memTotalItem)) {
      var avail = parseFloat(memAvailItem.lastvalue), total = parseFloat(memTotalItem.lastvalue)
      if (!isNaN(avail) && !isNaN(total) && total > 0) { ramPct = avail/total*100; ramGb = +(avail/1073741824).toFixed(1); ramTGb = +(total/1073741824).toFixed(1); ramSource = 'agent' }
    } else if (freshVmware(vmMemUsedItem) && freshVmware(vmMemTotalItem)) {
      var used = parseFloat(vmMemUsedItem.lastvalue), total2 = parseFloat(vmMemTotalItem.lastvalue)
      if (!isNaN(used) && !isNaN(total2) && total2 > 0) { ramPct = used/total2*100; ramGb = +(used/1073741824).toFixed(1); ramTGb = +(total2/1073741824).toFixed(1); ramSource = 'vmware' }
    }

    // Disco
    var disk = diskWorstIdx[hid] || null

    // Power / Uptime
    var powerOn = null, powerStr = '?'
    if (freshAgent(agentCpuItem)) {
      powerOn = true
      var utItem = uptimeIdx[hid]
      var utStr  = (utItem && freshAgent(utItem)) ? fmtUptime(utItem.lastvalue) : null
      powerStr = utStr || 'ON'
    } else {
      var pwItem = vmwPowerIdx[hid], hasData = pwItem && parseInt(pwItem.lastclock || 0) > 0
      if (hasData) { powerOn = parseInt(pwItem.lastvalue) === 1; powerStr = powerOn ? 'ON' : 'OFF' }
    }

    // Estados
    var cpuState  = cpu    != null ? S.metric(cpu,       CFG_VMTAB.thresholds.cpu)  : 'ok'
    var ramState  = ramPct != null ? S.metric(ramPct,    CFG_VMTAB.thresholds.ram)  : 'ok'
    var diskState = disk   != null ? S.metric(disk.pused,CFG_VMTAB.thresholds.disk) : 'ok'
    if (stale) cpuState = 'warn'
    var hostTrigs     = trgByHost[hid] || []
    var trgWorstState = hostTrigs.length ? prio2state(hostTrigs[0].priority) : 'ok'
    var rowState      = (powerOn === false) ? 'ok' : S.worst([cpuState, ramState, diskState, trgWorstState])
    var dataSource    = cpuSource !== 'none' ? cpuSource : ramSource !== 'none' ? ramSource : 'none'
    var visName       = host.name.replace(/^VIRT\s*-\s*VM\s*-\s*/i,'').replace(/^VM\s*-\s*/i,'')

    return { hostid: hid, hostName: host.name, techName: host.host || host.name, visName: visName,
             cpu: cpu, cpuState: cpuState, cpuSource: cpuSource,
             ramPct: ramPct, ramGb: ramGb, ramTGb: ramTGb, ramState: ramState,
             disk: disk, diskState: diskState,
             powerOn: powerOn, powerStr: powerStr,
             dataSource: dataSource, stale: stale, noData: cpu==null && ramPct==null,
             trigs: hostTrigs, trgWorstState: trgWorstState, rowState: rowState }
  })

  // Guardar rows sem sort para que o click handler possa re-ordenar
  _vmLastRows = rows
  return vmApplySort(rows, _vmSortState.col, _vmSortState.dir)
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function vmRender(el, rows, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var u  = window.BPC.utils
  var FS = CFG_VMTAB.fs

  _vmEl = el

  if (err)            { el.innerHTML = u.buildError('Tabela VMs', err); return }
  if (!rows || !rows.length) { el.innerHTML = u.buildError('Tabela VMs', 'Sem VMs no grupo 609.'); return }

  function stateDot(state) {
    var color = S.color(state), label = { ok:'OK', warn:'WARN', crit:'CRIT' }[state] || '?'
    return '<div style="display:flex;align-items:center;gap:5px">'
      + '<span style="width:11px;height:11px;border-radius:50%;background:'+color+';flex-shrink:0;box-shadow:0 0 5px '+color+'55"></span>'
      + '<span style="font-size:'+FS.badge+';font-weight:700;letter-spacing:.08em;color:'+color+'">'+label+'</span>'
      + '</div>'
  }

  function pctBar(pct, state, w) {
    var fill = Math.min(pct != null ? pct : 0, 100).toFixed(1)
    return '<div style="width:'+(w||65)+'px;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:4px">'
      + '<div style="height:100%;width:'+fill+'%;background:'+S.color(state)+';border-radius:2px"></div></div>'
  }

  function sourceBadge(src) {
    if (src === 'agent')  return '<span style="font-size:'+FS.badge+';padding:2px 6px;border-radius:8px;background:rgba(63,185,80,0.15);color:var(--bpc-ok);border:1px solid rgba(63,185,80,0.3)">agente</span>'
    if (src === 'vmware') return '<span style="font-size:'+FS.badge+';padding:2px 6px;border-radius:8px;background:rgba(88,166,255,0.15);color:var(--bpc-info);border:1px solid rgba(88,166,255,0.3)">vmware</span>'
    return '<span style="font-size:'+FS.badge+';color:var(--bpc-mute)">—</span>'
  }

  function drillUrl(hostName) {
    return CFG_VMTAB.grafanaL3 ? CFG_VMTAB.grafanaL3 + '?var-hostid=' + encodeURIComponent(hostName) : '#'
  }

  // Indicador de sort no header
  function sortArrow(col) {
    if (_vmSortState.col !== col) return '<span style="opacity:.3;margin-left:4px">⇅</span>'
    return '<span style="margin-left:4px;color:var(--bpc-info)">' + (_vmSortState.dir === 1 ? '↑' : '↓') + '</span>'
  }

  var TH_BASE = 'text-align:left;padding:7px 8px;font-size:'+FS.header+';font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);border-bottom:2px solid rgba(255,255,255,0.1);white-space:nowrap;cursor:pointer;user-select:none'
  var TH_ACT  = TH_BASE + ';color:#CDD9E5'  // coluna activa fica mais clara
  var TD      = 'padding:7px 8px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,0.05)'

  function th(col, label) {
    var style = _vmSortState.col === col ? TH_ACT : TH_BASE
    return '<th data-sort="'+col+'" style="'+style+'">'+label+sortArrow(col)+'</th>'
  }

  var thead = '<tr>'
    + th('state',  'Estado')
    + th('vm',     'VM')
    + th('source', 'Fonte')
    + th('cpu',    'CPU')
    + th('ram',    'RAM')
    + th('disk',   'Disco')
    + th('power',  'Power / Uptime')
    + th('trigs',  'Triggers')
    + '<th style="'+TH_BASE+';cursor:default"></th>'
    + '</tr>'

  var tbody = rows.map(function (r) {
    var rowBg = r.rowState === 'crit' ? 'rgba(248,81,73,0.05)' : r.rowState === 'warn' ? 'rgba(210,153,34,0.04)' : ''

    var colHost = '<td style="'+TD+';min-width:160px">'
      + '<div style="font-size:'+FS.name+';font-weight:600;color:#E6EDF3;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">'+SH.esc(r.techName)+'</div>'
      + (r.visName !== r.techName ? '<div style="font-size:'+FS.nameSub+';color:var(--bpc-mute);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">'+SH.esc(r.visName)+'</div>' : '')
      + '</td>'

    var colCpu = '<td style="'+TD+';min-width:90px">'
    if (r.cpu == null) { colCpu += '<span style="color:var(--bpc-mute);font-size:'+FS.cell+'">—</span>' }
    else { colCpu += '<span style="font-size:'+FS.value+';font-weight:700;color:'+S.color(r.cpuState)+';font-family:monospace">'+r.cpu.toFixed(1)+'%</span>'
      + (r.stale ? '<span style="font-size:'+FS.badge+';color:var(--bpc-warn);margin-left:4px">stale</span>' : '') + pctBar(r.cpu, r.cpuState) }
    colCpu += '</td>'

    var colRam = '<td style="'+TD+';min-width:110px">'
    if (r.ramPct == null) { colRam += '<span style="color:var(--bpc-mute);font-size:'+FS.cell+'">—</span>' }
    else { colRam += '<span style="font-size:'+FS.value+';font-weight:700;color:'+S.color(r.ramState)+';font-family:monospace">'+r.ramPct.toFixed(1)+'%</span>' + pctBar(r.ramPct, r.ramState)
      + '<div style="font-size:'+FS.sub+';color:var(--bpc-mute);margin-top:2px">'+(r.ramGb!=null ? r.ramGb+'/'+(r.ramTGb||'?')+' GB' : '')+'</div>' }
    colRam += '</td>'

    var colDisk = '<td style="'+TD+';min-width:100px">'
    if (!r.disk) { colDisk += '<span style="color:var(--bpc-mute);font-size:'+FS.cell+'">—</span>' }
    else { colDisk += '<span style="font-size:'+FS.value+';font-weight:700;color:'+S.color(r.diskState)+';font-family:monospace">'+r.disk.pused.toFixed(0)+'%</span>' + pctBar(r.disk.pused, r.diskState)
      + '<div style="font-size:'+FS.sub+';color:var(--bpc-mute);margin-top:2px">'+SH.esc(r.disk.part)+'</div>' }
    colDisk += '</td>'

    var pwColor = r.powerOn === true ? 'var(--bpc-ok)' : r.powerOn === false ? 'var(--bpc-mute)' : 'var(--bpc-warn)'
    var colPower = '<td style="'+TD+';font-size:'+FS.cell+';font-weight:700;color:'+pwColor+';white-space:nowrap">'+SH.esc(r.powerStr)+'</td>'

    var colTrg = '<td style="'+TD+';min-width:90px">'
    if (!r.trigs || !r.trigs.length) { colTrg += '<span style="font-size:'+FS.cell+';color:var(--bpc-ok)">OK</span>' }
    else {
      var nCrit = r.trigs.filter(function(t){return parseInt(t.priority)>=4}).length, nWarn = r.trigs.length - nCrit
      colTrg += (nCrit ? '<div style="font-size:'+FS.cell+';font-weight:700;color:var(--bpc-crit)">▲ '+nCrit+'</div>' : '')
             + (nWarn ? '<div style="font-size:'+FS.cell+';font-weight:700;color:var(--bpc-warn)">● '+nWarn+'</div>' : '')
      var desc = r.trigs[0].description; desc = desc.length > 28 ? desc.slice(0,27)+'…' : desc
      colTrg += '<div style="font-size:'+FS.sub+';color:var(--bpc-mute)">'+SH.esc(desc)+'</div>'
    }
    colTrg += '</td>'

    var colDrill = '<td style="'+TD+';text-align:center">'
      + '<a href="'+SH.esc(drillUrl(r.hostName))+'" target="_blank" class="bpc-link"'
      + ' style="font-size:'+FS.badge+';white-space:nowrap;padding:4px 10px;border-radius:4px;'
      + 'border:1px solid rgba(88,166,255,0.3);color:var(--bpc-info);text-decoration:none">'
      + 'ver detalhes</a></td>'

    return '<tr style="background:'+rowBg+'">'
      + '<td style="'+TD+'">'+stateDot(r.rowState)+'</td>'
      + colHost
      + '<td style="'+TD+'">'+sourceBadge(r.dataSource)+'</td>'
      + colCpu + colRam + colDisk + colPower + colTrg + colDrill
      + '</tr>'
  }).join('')

  var nCrit   = rows.filter(function(r){return r.rowState==='crit'}).length
  var nWarn   = rows.filter(function(r){return r.rowState==='warn'}).length
  var nAgent  = rows.filter(function(r){return r.dataSource==='agent'}).length
  var nVmware = rows.filter(function(r){return r.dataSource==='vmware'}).length
  var nNoData = rows.filter(function(r){return r.dataSource==='none'}).length
  var ambSel  = getUrlVar('ambiente') || 'Todos'
  var ambLabel = (ambSel === 'Todos' || ambSel === '') ? 'Todos os ambientes' : ambSel

  var summary = '<div style="display:flex;align-items:center;gap:14px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap">'
    + '<span style="font-size:'+FS.badge+';font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);text-transform:uppercase">'+SH.esc(ambLabel)+' · '+rows.length+' VMs</span>'
    + (nCrit  ? '<span style="font-size:'+FS.badge+';font-weight:700;color:var(--bpc-crit)">▲ '+nCrit+' críticos</span>' : '')
    + (nWarn  ? '<span style="font-size:'+FS.badge+';font-weight:700;color:var(--bpc-warn)">● '+nWarn+' degradados</span>' : '')
    + '<span style="font-size:'+FS.badge+';color:var(--bpc-ok)">agente: '+nAgent+'</span>'
    + '<span style="font-size:'+FS.badge+';color:var(--bpc-info)">vmware: '+nVmware+'</span>'
    + (nNoData ? '<span style="font-size:'+FS.badge+';color:var(--bpc-mute)">sem dados: '+nNoData+'</span>' : '')
    + '</div>'

  el.innerHTML = '<div class="bpc" style="font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif">'
    + summary
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + '<thead id="vmtab-head">'+thead+'</thead>'
    + '<tbody id="vmtab-body">'+tbody+'</tbody>'
    + '</table></div></div>'

  // Click handler nos headers — re-ordena sem re-fetch
  var thead_el = el.querySelector('#vmtab-head')
  if (thead_el) {
    thead_el.addEventListener('click', function (e) {
      var th_el = e.target.closest ? e.target.closest('[data-sort]') : null
      if (!th_el) {
        // fallback IE: subir manualmente
        var t = e.target; while (t && t !== thead_el) { if (t.getAttribute && t.getAttribute('data-sort')) { th_el = t; break } t = t.parentNode }
      }
      if (!th_el || !_vmLastRows) return
      var col = th_el.getAttribute('data-sort')
      if (!col) return
      _vmSortState.dir = (_vmSortState.col === col) ? -_vmSortState.dir : 1
      _vmSortState.col = col
      vmRender(_vmEl, vmApplySort(_vmLastRows, _vmSortState.col, _vmSortState.dir), null)
    })
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
// ────────────────────────────────────────────────────────────────────────────

function startVmTabela(rpc) {
  window.BPC.utils.waitForElement(CFG_VMTAB.elementId, function (el) {
    el.innerHTML = window.BPC.utils.buildSkeleton()

    function load() {
      vmFetch(rpc).then(function (data) {
        vmRender(el, vmCompute(data), null)
      }).catch(function (e) {
        vmRender(el, null, e.message || String(e))
      })
    }

    load()
    window.BPC.utils.startRefresh(el, load, CFG_VMTAB.refreshMs)
  })
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(startVmTabela); return }
  if (attempt > 50) { console.error('[BPC] l2-tabela servidores-virtuais: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
