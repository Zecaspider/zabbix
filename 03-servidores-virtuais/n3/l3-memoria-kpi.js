(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · MEMÓRIA DETALHADA  v1.0                               ║
  // ║                                                                          ║
  // ║  FONTES (fallback em cascata):                                           ║
  // ║    1. Agente Zabbix → vm.memory.util + breakdown + swap/pagefile        ║
  // ║    2. VMware poller → memory.size.usage.guest + balloon                 ║
  // ║    3. VMware host % → memory.size.usage.host                            ║
  // ║                                                                          ║
  // ║  LAYOUT:                                                                 ║
  // ║  ┌────────────────┬──────────────────────────────────────────────────┐  ║
  // ║  │  Gauge 180°    │  Total: 32 GB  Usada: 26 GB  Livre: 6 GB        │  ║
  // ║  │   81.5%        │  Swap:  12.3%  Balloon: —    Cached: 4 GB       │  ║
  // ║  │  [sparkline]   │  fonte: AGENTE / VMware                          │  ║
  // ║  └────────────────┴──────────────────────────────────────────────────┘  ║
  // ╚══════════════════════════════════════════════════════════════════════════╝


  // ════════════════════════════════════════════════════════════════════════════
  // [1] CFG
  // ════════════════════════════════════════════════════════════════════════════

  var CFG = {
    rootId:        'bt-memoria-kpi',
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',

    maxAgeSec: {
      agent:  7200,
      vmware: 600,
    },

    // Valores canónicos: engenharia-do-sistema.md §6.2 (fonte de verdade única, não inventar aqui).
    // Swap medido em % neste ficheiro; canónico é ratio 0.1/0.5 = 10%/50%.
    thresholds: {
      mem:  { warn: 70, crit: 85 },
      swap: { warn: 10, crit: 50 },
    },

    sparkWindowSecs: 21600,
    sparkPoints:     60,

    apiLimits: { items: 50000, history: 1000 },
    retry:     { maxAttempts: 3, baseDelayMs: 1000 },
    abortDelayMs: 80,

    keysAgent: {
      memUtil:    'vm.memory.util',
      memUsed:    'vm.memory.size[used]',
      memTotal:   'vm.memory.size[total]',
      memAvail:   'vm.memory.size[available]',
      memCached:  'vm.memory.size[cached]',
      swapPct:    'perf_counter_en["\\Paging file(_Total)\\% Usage"]',
      swapUsed:   'system.swap.size[,used]',
      swapTotal:  'system.swap.size[,total]',
      pageFaults: 'perf_counter_en["\\Memory\\Page Faults/sec"]',
    },

    keysVmw: {
      memUsed:    'vmware.vm.memory.size.usage.guest[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memTotal:   'vmware.vm.memory.size[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memBalloon: 'vmware.vm.memory.size.ballooned[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memHostPct: 'vmware.vm.memory.size.usage.host[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memSwapped: 'vmware.vm.memory.size.swapped[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
    },

    colors: {
      ok:   '#3FB950',
      warn: '#D29922',
      crit: '#F85149',
      info: '#58A6FF',
      mem:  '#7C4DFF',
      sub:  '#6E7681',
      text: '#CDD9E5',
      brd:  '#1C2128',
      mute: '#2D333B',
    },
  };

  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';


  // ════════════════════════════════════════════════════════════════════════════
  // [2] UTILS
  // ════════════════════════════════════════════════════════════════════════════

  var U = {
    esc: function (s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },
    isValid: function (v) { return v !== null && v !== undefined && !isNaN(v); },
    fmtPct: function (v) { return U.isValid(v) ? v.toFixed(1) + '%' : '—'; },
    fmtBytes: function (b) {
      if (!U.isValid(b) || b <= 0) return '—';
      if (b >= 1099511627776) return (b / 1099511627776).toFixed(1) + ' TB';
      if (b >= 1073741824)    return (b / 1073741824).toFixed(1) + ' GB';
      if (b >= 1048576)       return (b / 1048576).toFixed(0) + ' MB';
      return (b / 1024).toFixed(0) + ' KB';
    },
    thrColor: function (v, thr) {
      if (!U.isValid(v)) return CFG.colors.sub;
      if (v >= thr.crit) return CFG.colors.crit;
      if (v >= thr.warn) return CFG.colors.warn;
      return CFG.colors.ok;
    },
    rgb: function (h) {
      h = h.replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
    },
    isActive: function (item, maxAge) {
      if (!item) return false;
      if (String(item.state) === '1') return false;
      if (!item.lastvalue || item.lastvalue === '') return false;
      var clock = parseInt(item.lastclock || 0, 10);
      if (!clock) return false;
      return (Math.floor(Date.now() / 1000) - clock) < (maxAge || 300);
    },
    byKey: function (items) {
      var idx = {};
      for (var i = 0; i < items.length; i++) {
        if (items[i].key_) idx[items[i].key_] = items[i];
      }
      return idx;
    },
    gk: function (idx, key) { return idx[key] || null; },
    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // [3] FETCH
  // ════════════════════════════════════════════════════════════════════════════

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal,
    })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch(function (err) {
      if (err.name === 'AbortError') throw err;
      if (attempt >= CFG.retry.maxAttempts - 1) throw err;
      return new Promise(function (res) {
        setTimeout(res, CFG.retry.baseDelayMs * Math.pow(2, attempt));
      }).then(function () { return fetchWithRetry(url, body, signal, attempt + 1); });
    });
  }

  function zbx(method, params, signal) {
    return fetchWithRetry(PROXY, { jsonrpc: '2.0', id: 1, method: method, params: params }, signal)
      .then(function (j) {
        if (j.error) throw new Error(j.error.data || j.error.message);
        return j.result;
      });
  }

  function getHostId(hostName, signal) {
    return zbx('host.get', {
      output: ['hostid'],
      filter: { host: [hostName] },
      selectInterfaces: ['type'],
    }, signal).then(function (hosts) {
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      return { hostid: hosts[0].hostid, interfaces: hosts[0].interfaces || [] };
    });
  }

  function getItems(hostid, signal) {
    return zbx('item.get', {
      hostids: [hostid],
      output: ['itemid', 'name', 'key_', 'lastvalue', 'lastclock', 'state'],
      monitored: true,
      limit: CFG.apiLimits.items,
    }, signal);
  }

  function getSparkline(itemid, signal) {
    if (!itemid) return Promise.resolve([]);
    var t = Math.floor(Date.now() / 1000);
    return zbx('history.get', {
      itemids: [itemid],
      output: ['value'],
      sortfield: 'clock',
      sortorder: 'ASC',
      time_from: t - CFG.sparkWindowSecs,
      time_till: t,
      limit: CFG.sparkPoints,
    }, signal).then(function (h) {
      return h.map(function (x) { return parseFloat(x.value); });
    }).catch(function () { return []; });
  }

  function getMacros(hostid, signal) {
    return zbx('usermacro.get', {
      hostids: [hostid],
      output: ['macro', 'value'],
    }, signal).then(function (macros) {
      var map = {};
      for (var i = 0; i < macros.length; i++) map[macros[i].macro] = parseFloat(macros[i].value);
      return {
        memCrit: map['{$MEM.UTIL.MAX}']  || CFG.thresholds.mem.crit,
        memWarn: map['{$MEM.UTIL.WARN}'] || CFG.thresholds.mem.warn,
      };
    }).catch(function () {
      return { memCrit: CFG.thresholds.mem.crit, memWarn: CFG.thresholds.mem.warn };
    });
  }


  // ════════════════════════════════════════════════════════════════════════════
  // [4] COMPUTE
  // ════════════════════════════════════════════════════════════════════════════

  function compute(items, macros) {
    var MA = CFG.maxAgeSec;
    var idx = U.byKey(items);

    // ── Agente ───────────────────────────────────────────────────────────────
    var utilItem  = U.gk(idx, CFG.keysAgent.memUtil);
    var usedItem  = U.gk(idx, CFG.keysAgent.memUsed);
    var totalItem = U.gk(idx, CFG.keysAgent.memTotal);
    var availItem = U.gk(idx, CFG.keysAgent.memAvail);
    var cachedItem= U.gk(idx, CFG.keysAgent.memCached);
    var swapPctItem = U.gk(idx, CFG.keysAgent.swapPct);
    var swapUsedItem= U.gk(idx, CFG.keysAgent.swapUsed);
    var swapTotItem = U.gk(idx, CFG.keysAgent.swapTotal);

    var agentUtil  = utilItem  && U.isActive(utilItem,  MA.agent) ? parseFloat(utilItem.lastvalue)  : null;
    var agentUsed  = usedItem  && U.isActive(usedItem,  MA.agent) ? parseFloat(usedItem.lastvalue)  : null;
    var agentTotal = totalItem && U.isActive(totalItem, MA.agent) ? parseFloat(totalItem.lastvalue) : null;
    var agentAvail = availItem && U.isActive(availItem, MA.agent) ? parseFloat(availItem.lastvalue) : null;
    var agentCached= cachedItem&& U.isActive(cachedItem,MA.agent) ? parseFloat(cachedItem.lastvalue): null;

    // swap: Windows = pagefile perf counter; Linux = swap.size keys
    var swapPct  = swapPctItem  && U.isActive(swapPctItem,  MA.agent) ? parseFloat(swapPctItem.lastvalue)  : null;
    var swapUsed = swapUsedItem && U.isActive(swapUsedItem, MA.agent) ? parseFloat(swapUsedItem.lastvalue) : null;
    var swapTot  = swapTotItem  && U.isActive(swapTotItem,  MA.agent) ? parseFloat(swapTotItem.lastvalue)  : null;
    if (!U.isValid(swapPct) && U.isValid(swapUsed) && U.isValid(swapTot) && swapTot > 0) {
      swapPct = (swapUsed / swapTot) * 100;
    }

    var pageFaultsItem = U.gk(idx, CFG.keysAgent.pageFaults);
    var pageFaults = pageFaultsItem && U.isActive(pageFaultsItem, MA.agent) ? parseFloat(pageFaultsItem.lastvalue) : null;

    var hasAgent = U.isValid(agentUtil);
    if (hasAgent) {
      var thr = { warn: macros.memWarn, crit: macros.memCrit };
      return {
        source:    'Agente',
        pct:       agentUtil,
        thr:       thr,
        sparkItem: utilItem,
        rows: [
          { label: 'Total',       val: U.fmtBytes(agentTotal) },
          { label: 'Usada',       val: U.fmtBytes(agentUsed),  color: U.thrColor(agentUtil, thr) },
          { label: 'Livre',       val: U.fmtBytes(agentAvail) },
          { label: 'Cached',      val: U.isValid(agentCached) ? U.fmtBytes(agentCached) : '—' },
          { label: 'Swap',        val: U.isValid(swapPct) ? U.fmtPct(swapPct) : '—',
            color: U.isValid(swapPct) ? U.thrColor(swapPct, CFG.thresholds.swap) : CFG.colors.sub,
            sub: U.isValid(swapUsed) && U.isValid(swapTot)
              ? U.fmtBytes(swapUsed) + ' / ' + U.fmtBytes(swapTot) : null },
          { label: 'Page faults', val: U.isValid(pageFaults) ? pageFaults.toFixed(0) + '/s' : '—' },
        ],
      };
    }

    // ── VMware fallback ───────────────────────────────────────────────────────
    var vmwUsedItem    = U.gk(idx, CFG.keysVmw.memUsed);
    var vmwTotalItem   = U.gk(idx, CFG.keysVmw.memTotal);
    var vmwBalloonItem = U.gk(idx, CFG.keysVmw.memBalloon);
    var vmwHostPctItem = U.gk(idx, CFG.keysVmw.memHostPct);
    var vmwSwappedItem = U.gk(idx, CFG.keysVmw.memSwapped);

    var vmwUsed    = vmwUsedItem    && U.isActive(vmwUsedItem,    MA.vmware) ? parseFloat(vmwUsedItem.lastvalue)    : null;
    var vmwTotal   = vmwTotalItem   && U.isActive(vmwTotalItem,   MA.vmware) ? parseFloat(vmwTotalItem.lastvalue)   : null;
    var vmwBalloon = vmwBalloonItem && U.isActive(vmwBalloonItem, MA.vmware) ? parseFloat(vmwBalloonItem.lastvalue) : null;
    var vmwSwapped = vmwSwappedItem && U.isActive(vmwSwappedItem, MA.vmware) ? parseFloat(vmwSwappedItem.lastvalue) : null;
    var vmwHostPct = vmwHostPctItem && U.isActive(vmwHostPctItem, MA.vmware) ? parseFloat(vmwHostPctItem.lastvalue) : null;

    if (U.isValid(vmwUsed) && U.isValid(vmwTotal) && vmwTotal > 0) {
      var vmwPct = (vmwUsed / vmwTotal) * 100;
      var thr2 = { warn: macros.memWarn, crit: macros.memCrit };
      return {
        source:    'VMware',
        pct:       vmwPct,
        thr:       thr2,
        sparkItem: vmwUsedItem,
        rows: [
          { label: 'Total',   val: U.fmtBytes(vmwTotal) },
          { label: 'Usada',   val: U.fmtBytes(vmwUsed),    color: U.thrColor(vmwPct, thr2) },
          { label: 'Livre',   val: U.fmtBytes(vmwTotal - vmwUsed) },
          { label: 'Balloon', val: U.isValid(vmwBalloon) ? U.fmtBytes(vmwBalloon) : '—',
            color: U.isValid(vmwBalloon) && vmwBalloon > 104857600 ? CFG.colors.warn : CFG.colors.sub },
          { label: 'Swapped', val: U.isValid(vmwSwapped) ? U.fmtBytes(vmwSwapped) : '—',
            color: U.isValid(vmwSwapped) && vmwSwapped > 0 ? CFG.colors.warn : CFG.colors.sub },
        ],
      };
    }

    if (U.isValid(vmwHostPct)) {
      var thr3 = { warn: macros.memWarn, crit: macros.memCrit };
      return {
        source:    'VMware (host %)',
        pct:       vmwHostPct,
        thr:       thr3,
        sparkItem: vmwHostPctItem,
        rows: [
          { label: 'Host mem %', val: U.fmtPct(vmwHostPct), color: U.thrColor(vmwHostPct, thr3) },
          { label: 'Balloon',    val: U.isValid(vmwBalloon) ? U.fmtBytes(vmwBalloon) : '—' },
        ],
      };
    }

    return { source: '—', pct: null, thr: CFG.thresholds.mem, sparkItem: null, rows: [] };
  }


  // ════════════════════════════════════════════════════════════════════════════
  // [5] CSS
  // ════════════════════════════════════════════════════════════════════════════

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',
      '#bt-memoria-kpi *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-memoria-kpi{font-family:\'IBM Plex Mono\',monospace;height:100%;}',
      '#bt-memoria-kpi .mm-wrap{display:flex;flex-direction:column;gap:4px;height:100%;padding:4px 0;}',
      '#bt-memoria-kpi .mm-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}',
      '#bt-memoria-kpi .mm-badge{font-size:12.5px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:3px;white-space:nowrap;}',
      '#bt-memoria-kpi .mm-badge.agente{border:1px solid rgba(63,185,80,.3);background:rgba(63,185,80,.13);color:'+C.ok+';}',
      '#bt-memoria-kpi .mm-badge.vmware{border:1px solid rgba(88,166,255,.3);background:rgba(88,166,255,.13);color:'+C.info+';}',
      '#bt-memoria-kpi .mm-badge.none  {border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.13);color:'+C.crit+';}',
      '#bt-memoria-kpi .mm-label{font-size:12.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:'+C.sub+';}',
      '#bt-memoria-kpi .mm-rows{display:flex;flex-direction:column;gap:0;flex:1;}',
      '#bt-memoria-kpi .mm-row{display:grid;grid-template-columns:90px 1fr;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.04);}',
      '#bt-memoria-kpi .mm-row:last-child{border-bottom:none;}',
      '#bt-memoria-kpi .mm-key{font-size:12.5px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;}',
      '#bt-memoria-kpi .mm-val{font-size:18px;font-weight:700;}',
      '#bt-memoria-kpi .mm-sub{font-size:12.5px;color:'+C.sub+';margin-top:1px;}',
      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // [6] SVG HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  function gauge180(pct, col, thr) {
    var w = 160, h = 86, cx = w / 2, cy = h - 4, r = 62, sw = 9;
    function polar(deg, rad) {
      var a = (deg - 180) * Math.PI / 180;
      return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
    }
    function arc(sD, eD) {
      var p1 = polar(sD, r), p2 = polar(eD, r), lg = (eD - sD) > 180 ? 1 : 0;
      return '<path d="M' + p1.x.toFixed(1) + ',' + p1.y.toFixed(1)
        + ' A' + r + ',' + r + ' 0 ' + lg + ' 1 ' + p2.x.toFixed(1) + ',' + p2.y.toFixed(1)
        + '" fill="none" stroke="' + col + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
    }
    function tick(pv, tc) {
      var inn = polar(pv * 180 / 100, r - sw - 3), out = polar(pv * 180 / 100, r + 3);
      return '<line x1="' + inn.x.toFixed(1) + '" y1="' + inn.y.toFixed(1)
        + '" x2="' + out.x.toFixed(1) + '" y2="' + out.y.toFixed(1)
        + '" stroke="' + tc + '" stroke-width="1.5" opacity=".7"/>';
    }
    var safe = Math.max(0, Math.min(100, pct || 0));
    var ea = safe * 180 / 100;
    var C = CFG.colors;
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;overflow:visible;">'
      + '<path d="M' + polar(0, r).x.toFixed(1) + ',' + polar(0, r).y.toFixed(1)
      + ' A' + r + ',' + r + ' 0 1 1 ' + polar(180, r).x.toFixed(1) + ',' + polar(180, r).y.toFixed(1)
      + '" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="' + sw + '" stroke-linecap="round"/>'
      + (safe > 0 ? arc(0, ea) : '')
      + tick(thr.warn, C.warn) + tick(thr.crit, C.crit)
      + '<text x="' + cx + '" y="' + (cy - 10) + '" text-anchor="middle" '
      + 'font-family="\'IBM Plex Mono\',monospace" font-size="22" font-weight="700" fill="' + col + '">'
      + safe.toFixed(1) + '%</text>'
      + '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" '
      + 'font-family="\'IBM Plex Mono\',monospace" font-size="9" fill="' + C.sub + '">MEMÓRIA</text>'
      + '</svg>';
  }

  function sparkline(vals, col) {
    if (!vals || vals.length < 2) return '';
    var w = 155, h = 22;
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rng = mx - mn || 1;
    var pts = vals.map(function (v, i) {
      return [(i / (vals.length - 1)) * w, h - ((v - mn) / rng) * (h - 4) - 2];
    });
    var ln = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L');
    var ar = 'M' + pts[0][0].toFixed(1) + ',' + h + 'L' + ln.slice(1) + 'L' + pts[pts.length - 1][0].toFixed(1) + ',' + h + 'Z';
    var gid = 'ms' + Math.random().toString(36).slice(2, 7);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block;">'
      + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0%" stop-color="' + col + '" stop-opacity=".35"/>'
      + '<stop offset="100%" stop-color="' + col + '" stop-opacity="0"/>'
      + '</linearGradient></defs>'
      + '<path d="' + ar + '" fill="url(#' + gid + ')"/>'
      + '<path d="' + ln + '" fill="none" stroke="' + col + '" stroke-width="1.5" stroke-linejoin="round"/>'
      + '</svg>';
  }


  // ════════════════════════════════════════════════════════════════════════════
  // [7] RENDER
  // ════════════════════════════════════════════════════════════════════════════

  function render(d) {
    var C = CFG.colors;

    var badgeClass = d.source === 'Agente' ? 'agente'
                   : d.source === '—'      ? 'none'
                   : 'vmware';

    var rowsHtml = d.rows.map(function (row) {
      return '<div class="mm-row">'
        + '<span class="mm-key">' + U.esc(row.label) + '</span>'
        + '<div><div class="mm-val" style="color:' + (row.color || C.text) + ';">' + U.esc(row.val) + '</div>'
        + (row.sub ? '<div class="mm-sub">' + U.esc(row.sub) + '</div>' : '')
        + '</div>'
        + '</div>';
    }).join('');

    return CSS
      + '<div class="mm-wrap">'
      + '<div class="mm-head">'
      + '  <span class="mm-label">Breakdown de memória</span>'
      + '  <span class="mm-badge ' + badgeClass + '">' + U.esc(d.source) + '</span>'
      + '</div>'
      + '<div class="mm-rows">' + rowsHtml + '</div>'
      + '</div>';
  }

  function renderErro(causa) {
    return '<div style="color:' + CFG.colors.crit + ';font-family:monospace;font-size:14px;padding:8px;">'
      + '&#9888; ERRO · MEMÓRIA: ' + U.esc(causa) + '</div>';
  }


  // ════════════════════════════════════════════════════════════════════════════
  // [8] BOOTSTRAP — double-fire protection + AbortController
  // ════════════════════════════════════════════════════════════════════════════

  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;

  if (_ns.abortTimer) { clearTimeout(_ns.abortTimer); _ns.abortTimer = null; }
  var _prev = _ns.controller;
  if (_prev) {
    _ns.abortTimer = setTimeout(function () {
      _prev.abort();
      _ns.abortTimer = null;
    }, CFG.abortDelayMs);
  }
  var _ctrl = new AbortController();
  _ns.controller = _ctrl;
  var signal = _ctrl.signal;

  var _myToken = Date.now() + Math.random();
  _ns.token = _myToken;
  function _isCurrent() {
    return window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken;
  }

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  if (!hostName) {
    root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:15.5px;">Selecciona uma VM.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:15.5px;">A carregar memória…</span>';

  getHostId(hostName, signal)
    .then(function (hostInfo) {
      if (!_isCurrent()) return;
      return Promise.all([
        getItems(hostInfo.hostid, signal),
        getMacros(hostInfo.hostid, signal),
      ]).then(function (r) {
        if (!_isCurrent()) return;
        var items  = r[0];
        var macros = r[1];
        var d = compute(items, macros);
        if (!_isCurrent()) return;
        var liveRoot = document.getElementById(CFG.rootId);
        if (!liveRoot) return;
        liveRoot.innerHTML = render(d);
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError') return;
      if (!_isCurrent()) return;
      var errRoot = document.getElementById(CFG.rootId);
      if (errRoot) errRoot.innerHTML = renderErro(e.message);
    });

})();
