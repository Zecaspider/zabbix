// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · SERVIDORES VIRTUAIS · TABELA DE VMs                    ║
// ║  v2.0 · Framework BPC-UI v9 · waitForBPC bootstrap                     ║
// ║                                                                          ║
// ║  Fonte principal: Agente Zabbix (system.cpu.util / vm.memory.size)      ║
// ║  Fallback: VMware (vmware.vm.cpu.usage / vmware.vm.memory.size.*)       ║
// ║  Filtro padrão: tag ambiente IN ["Produção", "producao"]                ║
// ║                                                                          ║
// ║  Colunas: Estado · VM · Fonte · CPU · RAM · Power · Triggers · →        ║
// ║                                                                          ║
// ║  [1] CFG   [2] FETCH   [3] COMPUTE   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_VMTAB = {
  elementId:  'bpc-sv-tabela',
  groupId:    '609',
  refreshMs:  60000,
  maxAgeSec:  600,   // dados mais velhos que 10m = stale
  grafanaL3:  'http://10.10.126.22:3000/d/ad040c90-01ae-45f9-b537-44580fd75d03/n3-servidores-virtuais-detalhe-vm',

  // Filtro ambiente padrão (OR): normalizar "producao" → "Produção" é acção Zabbix pendente
  ambienteTags: ['Produção', 'producao'],

  thresholds: {
    cpu: { warn: 75, crit: 90 },
    ram: { warn: 75, crit: 90 },
  },

  // Keys Zabbix — agente (primário)
  agentKeys: {
    cpu:      'system.cpu.util',
    memAvail: 'vm.memory.size[available]',
    memTotal: 'vm.memory.size[total]',
    ping:     'agent.ping',
  },

  // Keys Zabbix — VMware (fallback)
  vmwareKeys: {
    cpu:      'vmware.vm.cpu.usage',
    memUsed:  'vmware.vm.memory.size.usage.guest',
    memTotal: 'vmware.vm.memory.size',
    power:    'vmware.vm.powerstate',
  },

  fs: {
    header:  '13px',
    cell:    '14px',
    value:   '17px',
    sub:     '11px',
    badge:   '10px',
    name:    '14px',
    nameSub: '11px',
  },
}

var _vmHostCache = null


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function vmGetHosts(rpc) {
  if (_vmHostCache && _vmHostCache.length) return Promise.resolve(_vmHostCache)
  // Filtrar por tag ambiente (OR entre os dois valores)
  return rpc('host.get', {
    groupids:   [CFG_VMTAB.groupId],
    output:     ['hostid', 'name', 'host'],
    filter:     { status: 0 },
    tags:       CFG_VMTAB.ambienteTags.map(function (v) {
      return { tag: 'ambiente', value: v, operator: '1' }
    }),
    evaltype:   '2',   // OR entre as tags
  }).then(function (hosts) {
    _vmHostCache = hosts
    return hosts
  })
}

function vmFetch(rpc) {
  return vmGetHosts(rpc).then(function (hosts) {
    if (!hosts.length) return { hosts: [], agentItems: [], vmwareItems: [], triggers: [] }
    var ids = hosts.map(function (h) { return h.hostid })

    return Promise.all([
      // Agente — primário
      rpc('item.get', {
        hostids:   ids,
        search:    { key_: 'system.cpu.util' },
        output:    ['hostid', 'key_', 'lastvalue', 'lastclock'],
        monitored: true, limit: 5000,
      }),
      rpc('item.get', {
        hostids:   ids,
        search:    { key_: 'vm.memory.size' },
        output:    ['hostid', 'key_', 'lastvalue', 'lastclock'],
        monitored: true, limit: 5000,
      }),
      // VMware — fallback
      rpc('item.get', {
        hostids:   ids,
        search:    { key_: 'vmware.vm.cpu.usage' },
        output:    ['hostid', 'key_', 'lastvalue', 'lastclock'],
        monitored: true, limit: 5000,
      }),
      rpc('item.get', {
        hostids:   ids,
        search:    { key_: 'vmware.vm.memory.size' },
        searchByAny: true,
        output:    ['hostid', 'key_', 'lastvalue', 'lastclock'],
        monitored: true, limit: 5000,
      }),
      rpc('item.get', {
        hostids:   ids,
        search:    { key_: 'vmware.vm.powerstate' },
        output:    ['hostid', 'key_', 'lastvalue', 'lastclock'],
        monitored: true, limit: 5000,
      }),
      // Triggers
      rpc('trigger.get', {
        hostids:           ids,
        only_true:         true,
        monitored:         true,
        skipDependent:     true,
        expandDescription: true,
        output:            ['triggerid', 'description', 'priority', 'lastchange'],
        selectHosts:       ['hostid'],
        sortfield:         'priority',
        sortorder:         'DESC',
        limit:             500,
      }),
    ]).then(function (res) {
      return {
        hosts:        hosts,
        agentCpu:     res[0],
        agentMem:     res[1],
        vmwareCpu:    res[2],
        vmwareMem:    res[3],
        vmwarePower:  res[4],
        triggers:     res[5],
      }
    })
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function vmCompute(data) {
  var S   = window.BPC.state
  var now = Math.floor(Date.now() / 1000)

  // Indexar por hostid
  function idx(items) {
    var m = {}
    ;(items || []).forEach(function (i) {
      if (!m[i.hostid]) m[i.hostid] = {}
      m[i.hostid][i.key_] = i
    })
    return m
  }

  var agentCpuIdx    = {}
  ;(data.agentCpu || []).forEach(function (i) { agentCpuIdx[i.hostid] = i })

  var agentMemIdx    = {}
  ;(data.agentMem || []).forEach(function (i) {
    if (!agentMemIdx[i.hostid]) agentMemIdx[i.hostid] = {}
    agentMemIdx[i.hostid][i.key_] = i
  })

  var vmwCpuIdx = {}
  ;(data.vmwareCpu || []).forEach(function (i) { vmwCpuIdx[i.hostid] = i })

  var vmwMemIdx = {}
  ;(data.vmwareMem || []).forEach(function (i) {
    if (!vmwMemIdx[i.hostid]) vmwMemIdx[i.hostid] = {}
    // key_ é tipo vmware.vm.memory.size.usage.guest[...] — normalizar para sufixo
    var suffix = i.key_.replace(/\[.*\]/, '')
    vmwMemIdx[i.hostid][suffix] = i
  })

  var vmwPowerIdx = {}
  ;(data.vmwarePower || []).forEach(function (i) { vmwPowerIdx[i.hostid] = i })

  var trgByHost = {}
  ;(data.triggers || []).forEach(function (t) {
    ;(t.hosts || []).forEach(function (h) {
      if (!trgByHost[h.hostid]) trgByHost[h.hostid] = []
      trgByHost[h.hostid].push(t)
    })
  })

  function fresh(item) {
    if (!item) return false
    var age = now - parseInt(item.lastclock || 0)
    return age <= CFG_VMTAB.maxAgeSec
  }

  function stateOrder(s) { return s === 'crit' ? 0 : s === 'warn' ? 1 : 2 }
  function prio2state(p) { p = parseInt(p); return p >= 4 ? 'crit' : p >= 2 ? 'warn' : 'ok' }

  var rows = data.hosts.map(function (host) {
    var hid = host.hostid

    // ── CPU ──────────────────────────────────────────────────────────────────
    var agentCpuItem  = agentCpuIdx[hid]
    var vmwareCpuItem = vmwCpuIdx[hid]
    var cpu = null, cpuSource = 'none'

    if (fresh(agentCpuItem)) {
      cpu = parseFloat(agentCpuItem.lastvalue)
      cpuSource = 'agent'
    } else if (fresh(vmwareCpuItem)) {
      cpu = parseFloat(vmwareCpuItem.lastvalue)
      cpuSource = 'vmware'
    } else if (agentCpuItem) {
      cpu = parseFloat(agentCpuItem.lastvalue)
      cpuSource = 'agent-stale'
    } else if (vmwareCpuItem) {
      cpu = parseFloat(vmwareCpuItem.lastvalue)
      cpuSource = 'vmware-stale'
    }
    if (isNaN(cpu)) cpu = null

    // ── RAM ──────────────────────────────────────────────────────────────────
    var memH = agentMemIdx[hid] || {}
    var memAvailItem = memH['vm.memory.size[available]']
    var memTotalItem = memH['vm.memory.size[total]']

    var vmH = vmwMemIdx[hid] || {}
    var vmMemUsedItem  = vmH['vmware.vm.memory.size.usage.guest']
    var vmMemTotalItem = vmH['vmware.vm.memory.size']

    var ramPct = null, ramGb = null, ramTGb = null, ramSource = 'none'

    if (fresh(memAvailItem) && fresh(memTotalItem)) {
      var avail = parseFloat(memAvailItem.lastvalue)
      var total = parseFloat(memTotalItem.lastvalue)
      if (!isNaN(avail) && !isNaN(total) && total > 0) {
        ramPct    = ((total - avail) / total) * 100
        ramGb     = +((total - avail) / 1073741824).toFixed(0)
        ramTGb    = +(total / 1073741824).toFixed(0)
        ramSource = 'agent'
      }
    } else if (fresh(vmMemUsedItem) && fresh(vmMemTotalItem)) {
      var used  = parseFloat(vmMemUsedItem.lastvalue)
      var total2 = parseFloat(vmMemTotalItem.lastvalue)
      if (!isNaN(used) && !isNaN(total2) && total2 > 0) {
        ramPct    = (used / total2) * 100
        ramGb     = +(used  / 1048576).toFixed(0)   // vmware devolve em KB
        ramTGb    = +(total2 / 1048576).toFixed(0)
        ramSource = 'vmware'
      }
    }

    // ── Power ─────────────────────────────────────────────────────────────────
    // Só confiar no powerstate se o lastclock for recente — lastclock=0 significa
    // que o poller VMware nunca recolheu (Z.8), não que a VM está desligada.
    var pwItem      = vmwPowerIdx[hid]
    var pwFresh     = pwItem && (now - parseInt(pwItem.lastclock || 0)) <= 7200  // 2h
    var powerOn     = pwFresh ? (+pwItem.lastvalue === 1) : null  // null = desconhecido
    var powerStr    = pwFresh ? (powerOn ? 'ON' : 'OFF') : '?'

    // ── Estados ───────────────────────────────────────────────────────────────
    var cpuState = cpu != null ? S.metric(cpu, CFG_VMTAB.thresholds.cpu) : 'ok'
    var ramState = ramPct != null ? S.metric(ramPct, CFG_VMTAB.thresholds.ram) : 'ok'
    var stale    = (cpuSource === 'agent-stale' || cpuSource === 'vmware-stale')
    if (stale) cpuState = 'warn'

    var hostTrigs     = trgByHost[hid] || []
    var trgWorstState = hostTrigs.length ? prio2state(hostTrigs[0].priority) : 'ok'

    var rowState = (powerOn === false) ? 'ok' : S.worst([cpuState, ramState, trgWorstState])
    var noData   = cpu == null && ramPct == null

    // Fonte dominante para badge
    var dataSource = cpuSource.replace('-stale', '') !== 'none' ? cpuSource.replace('-stale', '')
                   : ramSource !== 'none' ? ramSource : 'none'

    var visName = host.name
      .replace(/^VIRT\s*-\s*VM\s*-\s*/i, '')
      .replace(/^VM\s*-\s*/i, '')

    return {
      hostid: hid, hostName: host.name,
      techName: host.host || host.name, visName: visName,
      cpu: cpu, cpuState: cpuState, cpuSource: cpuSource,
      ramPct: ramPct, ramGb: ramGb, ramTGb: ramTGb, ramState: ramState,
      powerOn: powerOn, powerStr: powerStr,
      dataSource: dataSource, stale: stale, noData: noData,
      trigs: hostTrigs, trgWorstState: trgWorstState,
      rowState: rowState,
    }
  })

  rows.sort(function (a, b) {
    var od = stateOrder(a.rowState) - stateOrder(b.rowState)
    if (od !== 0) return od
    var ac = a.cpu != null ? a.cpu : -1
    var bc = b.cpu != null ? b.cpu : -1
    return bc - ac
  })

  return rows
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function vmRender(el, rows, err) {
  var SH = window.BPC_SHARED
  var S  = window.BPC.state
  var u  = window.BPC.utils
  var FS = CFG_VMTAB.fs

  if (err)  { el.innerHTML = u.buildError('Tabela VMs', err); return }
  if (!rows || !rows.length) { el.innerHTML = u.buildError('Tabela VMs', 'Sem VMs em Produção no grupo 609.'); return }

  function stateDot(state) {
    var color = S.color(state)
    var label = { ok: 'OK', warn: 'WARN', crit: 'CRIT' }[state] || '?'
    return '<div style="display:flex;align-items:center;gap:5px">'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';display:inline-block;flex-shrink:0;box-shadow:0 0 5px ' + color + '55"></span>'
      + '<span style="font-size:' + FS.badge + ';font-weight:700;letter-spacing:.08em;color:' + color + '">' + label + '</span>'
      + '</div>'
  }

  function pctBar(pct, state, w) {
    var color = S.color(state)
    var fill  = Math.min(pct != null ? pct : 0, 100).toFixed(1)
    return '<div style="width:' + (w || 60) + 'px;height:3px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:3px">'
      + '<div style="height:100%;width:' + fill + '%;background:' + color + ';border-radius:2px"></div>'
      + '</div>'
  }

  function sourceBadge(src) {
    if (src === 'agent')  return '<span style="font-size:' + FS.badge + ';padding:1px 5px;border-radius:8px;background:rgba(63,185,80,0.15);color:var(--bpc-ok);border:1px solid rgba(63,185,80,0.3)">agente</span>'
    if (src === 'vmware') return '<span style="font-size:' + FS.badge + ';padding:1px 5px;border-radius:8px;background:rgba(88,166,255,0.15);color:var(--bpc-info);border:1px solid rgba(88,166,255,0.3)">vmware</span>'
    return '<span style="font-size:' + FS.badge + ';color:var(--bpc-mute)">—</span>'
  }

  function drillUrl(hostName) {
    return CFG_VMTAB.grafanaL3 ? CFG_VMTAB.grafanaL3 + '?var-hostid=' + encodeURIComponent(hostName) : '#'
  }

  var TH = 'text-align:left;padding:6px 8px;font-size:' + FS.badge + ';font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--bpc-mute);border-bottom:2px solid rgba(255,255,255,0.1);white-space:nowrap'
  var TD = 'padding:6px 8px;vertical-align:middle;border-bottom:1px solid rgba(255,255,255,0.05)'

  var thead = '<tr>'
    + '<th style="' + TH + '">Estado</th>'
    + '<th style="' + TH + '">VM</th>'
    + '<th style="' + TH + '">Fonte</th>'
    + '<th style="' + TH + '">CPU</th>'
    + '<th style="' + TH + '">RAM</th>'
    + '<th style="' + TH + '">Power</th>'
    + '<th style="' + TH + '">Triggers</th>'
    + '<th style="' + TH + '"></th>'
    + '</tr>'

  var tbody = rows.map(function (r) {
    var rowBg = r.rowState === 'crit' ? 'rgba(248,81,73,0.05)'
              : r.rowState === 'warn' ? 'rgba(210,153,34,0.04)' : ''

    var colEstado = '<td style="' + TD + '">' + stateDot(r.rowState) + '</td>'

    var colHost = '<td style="' + TD + ';min-width:150px">'
      + '<div style="font-size:' + FS.name + ';font-weight:600;color:#E6EDF3;font-family:monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">' + SH.esc(r.techName) + '</div>'
      + (r.visName !== r.techName
        ? '<div style="font-size:' + FS.nameSub + ';color:var(--bpc-mute);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">' + SH.esc(r.visName) + '</div>'
        : '')
      + '</td>'

    var colFonte = '<td style="' + TD + '">' + sourceBadge(r.dataSource) + '</td>'

    var cpuColor = S.color(r.cpuState)
    var colCpu = '<td style="' + TD + ';min-width:80px">'
    if (r.cpu == null) {
      colCpu += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      colCpu += '<span style="font-size:' + FS.value + ';font-weight:700;color:' + cpuColor + ';font-family:monospace">' + r.cpu.toFixed(1) + '%</span>'
        + (r.stale ? '<span style="font-size:' + FS.badge + ';color:var(--bpc-warn);margin-left:3px">stale</span>' : '')
        + pctBar(r.cpu, r.cpuState, 65)
    }
    colCpu += '</td>'

    var ramColor = S.color(r.ramState)
    var colRam = '<td style="' + TD + ';min-width:100px">'
    if (r.ramPct == null) {
      colRam += '<span style="color:var(--bpc-mute);font-size:' + FS.cell + '">—</span>'
    } else {
      colRam += '<span style="font-size:' + FS.value + ';font-weight:700;color:' + ramColor + ';font-family:monospace">' + r.ramPct.toFixed(1) + '%</span>'
        + pctBar(r.ramPct, r.ramState, 65)
        + '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute);margin-top:2px">'
        + (r.ramGb != null ? r.ramGb + '/' + (r.ramTGb || '?') + 'GB' : '') + '</div>'
    }
    colRam += '</td>'

    var pwColor  = r.powerStr === 'ON' ? 'var(--bpc-ok)' : r.powerStr === 'OFF' ? 'var(--bpc-mute)' : 'var(--bpc-warn)'
    var colPower = '<td style="' + TD + ';font-size:' + FS.cell + ';font-weight:700;color:' + pwColor + '">' + r.powerStr + '</td>'

    var colTrg = '<td style="' + TD + ';min-width:80px">'
    if (!r.trigs || !r.trigs.length) {
      colTrg += '<span style="font-size:' + FS.cell + ';color:var(--bpc-ok)">OK</span>'
    } else {
      var nCrit = r.trigs.filter(function (t) { return parseInt(t.priority) >= 4 }).length
      var nWarn = r.trigs.length - nCrit
      colTrg += (nCrit ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-crit)">▲ ' + nCrit + '</div>' : '')
        + (nWarn ? '<div style="font-size:' + FS.cell + ';font-weight:700;color:var(--bpc-warn)">● ' + nWarn + '</div>' : '')
      var desc = r.trigs[0].description
      desc = desc.length > 26 ? desc.slice(0, 25) + '…' : desc
      colTrg += '<div style="font-size:' + FS.sub + ';color:var(--bpc-mute)">' + SH.esc(desc) + '</div>'
    }
    colTrg += '</td>'

    var colDrill = '<td style="' + TD + ';text-align:center">'
      + '<a href="' + SH.esc(drillUrl(r.hostName)) + '" target="_blank" class="bpc-link" style="font-size:' + FS.cell + ';white-space:nowrap">→</a>'
      + '</td>'

    return '<tr style="background:' + rowBg + '">'
      + colEstado + colHost + colFonte + colCpu + colRam + colPower + colTrg + colDrill
      + '</tr>'
  }).join('')

  var nCrit     = rows.filter(function (r) { return r.rowState === 'crit' }).length
  var nWarn     = rows.filter(function (r) { return r.rowState === 'warn' }).length
  var nAgent    = rows.filter(function (r) { return r.dataSource === 'agent' }).length
  var nVmware   = rows.filter(function (r) { return r.dataSource === 'vmware' }).length
  var nNoData   = rows.filter(function (r) { return r.dataSource === 'none' }).length

  var summary = '<div style="display:flex;align-items:center;gap:14px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap">'
    + '<span style="font-size:' + FS.badge + ';font-weight:700;letter-spacing:.08em;color:var(--bpc-mute);text-transform:uppercase">Produção · ' + rows.length + ' VMs</span>'
    + (nCrit  ? '<span style="font-size:' + FS.badge + ';font-weight:700;color:var(--bpc-crit)">▲ ' + nCrit + ' críticos</span>' : '')
    + (nWarn  ? '<span style="font-size:' + FS.badge + ';font-weight:700;color:var(--bpc-warn)">● ' + nWarn + ' degradados</span>' : '')
    + '<span style="font-size:' + FS.badge + ';color:var(--bpc-ok)">agente: ' + nAgent + '</span>'
    + '<span style="font-size:' + FS.badge + ';color:var(--bpc-info)">vmware: ' + nVmware + '</span>'
    + (nNoData ? '<span style="font-size:' + FS.badge + ';color:var(--bpc-mute)">sem dados: ' + nNoData + '</span>' : '')
    + '</div>'

  el.innerHTML = '<div class="bpc" style="font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif">'
    + summary
    + '<div style="overflow-x:auto">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead>' + thead + '</thead>'
    + '<tbody>' + tbody + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP — initWithRetry (CLAUDE.md §6)
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
