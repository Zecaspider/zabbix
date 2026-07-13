// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 HÍBRIDO · VM — SINAIS VITAIS com contexto (donuts + pulso)             ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid (host técnico)                   ║
// ║  Standalone ES5 + guard. Substitui os 6 stats nativos a pedido do          ║
// ║  utilizador (2026-07-13): cada KPI mostra o NÚMERO ABSOLUTO além da %      ║
// ║  ("6.1 de 8 GB"), lê os thresholds das MACROS DO ZABBIX do host            ║
// ║  (usermacro.get — política §4A do CLAUDE.md de Servidores Virtuais;        ║
// ║  fallback = catálogo canónico §6.2) e PULSA quando warn/crit.              ║
// ║  Donut SVG por recurso; disco mostra o pior volume + mini-lista de todos.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-vitais',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    // FALLBACK — a fonte primária são as macros do host (usermacro.get).
    // Valores do catálogo canónico engenharia-do-sistema.md §6.2.
    thresholds: {
      cpu: { warn: 70, crit: 90 },
      ram: { warn: 70, crit: 85 },
      disk: { warn: 75, crit: 90 },
      swap: { warn: 10, crit: 50 },
      rttMs: { warn: 10, crit: 50 },
      lossPct: { warn: 1, crit: 10 },
    },
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128', track: '#21262D',
    },
  };
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  var _sig = null, _myToken = null;
  function _isCurrent() { return window.__bpc_ns && window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken; }
  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal || _sig })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) {
        if (err.name === 'AbortError') throw err;
        if (attempt >= CFG.retry.maxAttempts - 1) throw err;
        return new Promise(function (res) { setTimeout(res, CFG.retry.baseDelayMs * Math.pow(2, attempt)); })
          .then(function () { return fetchWithRetry(url, body, signal, attempt + 1); });
      });
  }
  function zbx(m, p) { return fetchWithRetry(PROXY, { jsonrpc: '2.0', id: 1, method: m, params: p }, _sig).then(function (j) { if (j.error) throw new Error(j.error.data || j.error.message); return j.result; }); }

  var U = {
    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    extractHostName: function (raw) { var s = raw.split('(')[0].trim(); var p = s.split(/\s*-\s*/); return p[p.length - 1].trim(); },
    byName: function (items, name) { for (var i = 0; i < items.length; i++) if (items[i].name === name && items[i].lastvalue !== '') return items[i]; return null; },
    num: function (it) { if (!it) return null; var n = parseFloat(it.lastvalue); return isNaN(n) ? null : n; },
    gb: function (b, dec) { if (b == null || isNaN(b)) return '—'; return (b / 1073741824).toFixed(dec == null ? 1 : dec); },
    renderErro: function (causa) {
      return '<div style="color:' + CFG.colors.crit + ';font-size:12px;font-family:monospace">&#9888; ' + U.esc(causa) + '</div>';
    },
  };

  function stateAbove(v, thr) { if (v == null) return 'nd'; if (v >= thr.crit) return 'crit'; if (v >= thr.warn) return 'warn'; return 'ok'; }
  function stColor(st) { return st === 'crit' ? CFG.colors.crit : (st === 'warn' ? CFG.colors.warn : (st === 'ok' ? CFG.colors.ok : CFG.colors.sub)); }

  // ── SVG donut (r=30, C≈188.5) ─────────────────────────────────
  function donut(pct, st) {
    var c = stColor(st), C = 188.5;
    var dash = pct == null ? 0 : Math.max(0, Math.min(100, pct)) / 100 * C;
    return '<svg width="86" height="86" viewBox="0 0 86 86" style="flex:none">'
      + '<circle cx="43" cy="43" r="30" fill="none" stroke="' + CFG.colors.track + '" stroke-width="9"/>'
      + '<circle cx="43" cy="43" r="30" fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round" '
      +   'stroke-dasharray="' + dash.toFixed(1) + ' ' + C + '" transform="rotate(-90 43 43)"/>'
      + '<text x="43" y="47" text-anchor="middle" font-size="17" font-weight="800" fill="' + c + '" '
      +   'font-family="Inter,\'Segoe UI\',sans-serif">' + (pct == null ? '—' : Math.round(pct) + '%') + '</text>'
      + '</svg>';
  }

  function card(st, title, donutHtml, mainLine, subLines) {
    var pulseCls = st === 'crit' ? 'bpc-vit-pulse-crit' : (st === 'warn' ? 'bpc-vit-pulse-warn' : '');
    return '<div class="' + pulseCls + '" style="flex:1;min-width:195px;display:flex;align-items:center;gap:8px;'
      + 'background:rgba(255,255,255,.015);border:1px solid ' + (st === 'crit' ? CFG.colors.crit + '66' : (st === 'warn' ? CFG.colors.warn + '55' : CFG.colors.brd)) + ';'
      + 'border-radius:12px;padding:10px 14px 10px 6px">'
      + donutHtml
      + '<div style="min-width:0">'
      +   '<div style="font-size:10px;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.06em">' + title + '</div>'
      +   '<div style="font-size:15px;font-weight:700;color:' + CFG.colors.text + ';margin-top:2px;white-space:nowrap">' + mainLine + '</div>'
      +   (subLines ? '<div style="font-size:11px;color:' + CFG.colors.sub + ';margin-top:3px;line-height:1.5">' + subLines + '</div>' : '')
      + '</div></div>';
  }

  var PULSE_CSS =
    '<style>'
    + '@keyframes bpcVitWarn{0%,100%{box-shadow:0 0 0 0 rgba(210,153,34,0)}50%{box-shadow:0 0 14px 2px rgba(210,153,34,.45)}}'
    + '@keyframes bpcVitCrit{0%,100%{box-shadow:0 0 2px 0 rgba(248,81,73,.25)}50%{box-shadow:0 0 18px 4px rgba(248,81,73,.65)}}'
    + '.bpc-vit-pulse-warn{animation:bpcVitWarn 2.4s ease-in-out infinite}'
    + '.bpc-vit-pulse-crit{animation:bpcVitCrit 1.1s ease-in-out infinite}'
    + '</style>';

  // macros → thresholds efectivos (primário Zabbix, fallback CFG)
  function effThr(macros) {
    var m = {};
    for (var i = 0; i < macros.length; i++) m[macros[i].macro] = parseFloat(macros[i].value);
    function pick(v, fb) { return (v != null && !isNaN(v)) ? v : fb; }
    var T = CFG.thresholds;
    return {
      cpu: { warn: pick(m['{$CPU.UTIL.WARN}'], T.cpu.warn), crit: pick(m['{$CPU.UTIL.CRIT}'], T.cpu.crit) },
      ram: { warn: T.ram.warn, crit: pick(m['{$MEMORY.UTIL.MAX}'], T.ram.crit) },
      disk: { warn: pick(m['{$VFS.FS.PUSED.MAX.WARN}'], T.disk.warn), crit: pick(m['{$VFS.FS.PUSED.MAX.CRIT}'], T.disk.crit) },
      swap: T.swap, rttMs: T.rttMs, lossPct: T.lossPct,
    };
  }

  function render(named, spaceUtil, spaceUsed, spaceTotal, thr) {
    var c = CFG.colors;

    // ── Disponibilidade / ICMP ──
    var ping = U.num(U.byName(named, 'ICMP ping'));
    var rtt = U.num(U.byName(named, 'ICMP response time'));
    var loss = U.num(U.byName(named, 'ICMP loss')) != null ? U.num(U.byName(named, 'ICMP loss')) : U.num(U.byName(named, 'ICMP packet loss'));
    var rttMs = rtt != null ? rtt * 1000 : null;
    var stPing = ping == null ? 'nd' : (ping >= 1 ? 'ok' : 'crit');
    var stRtt = stateAbove(rttMs, thr.rttMs), stLoss = stateAbove(loss, thr.lossPct);
    var stDisp = stPing === 'crit' ? 'crit' : (stLoss === 'crit' || stRtt === 'crit' ? 'warn' : (stLoss === 'warn' || stRtt === 'warn' ? 'warn' : stPing));
    var dispDonut = '<div style="width:86px;height:86px;display:flex;align-items:center;justify-content:center;flex:none">'
      + '<span style="width:34px;height:34px;border-radius:50%;background:' + stColor(stPing) + ';box-shadow:0 0 16px ' + stColor(stPing) + '88"></span></div>';

    // ── CPU ──
    var cpu = U.num(U.byName(named, 'CPU utilization'));
    var nCpu = U.num(U.byName(named, 'Number of logical processors')) || U.num(U.byName(named, 'Number of CPUs'));
    var queue = U.num(U.byName(named, 'CPU queue length'));
    var stCpu = stateAbove(cpu, thr.cpu);

    // ── RAM ──
    var ramPct = U.num(U.byName(named, 'Memory utilization'));
    var ramUsed = U.num(U.byName(named, 'Used memory'));
    var ramTot = U.num(U.byName(named, 'Total memory'));
    if (ramPct == null && ramUsed != null && ramTot > 0) ramPct = ramUsed / ramTot * 100;
    var stRam = stateAbove(ramPct, thr.ram);

    // ── SWAP ──
    var swapFree = U.num(U.byName(named, 'Free swap space'));
    var swapTot = U.num(U.byName(named, 'Total swap space'));
    var swapPct = U.num(U.byName(named, 'Used swap space in %'));
    var swapUsed = (swapTot != null && swapFree != null) ? swapTot - swapFree : null;
    if (swapPct == null && swapUsed != null && swapTot > 0) swapPct = swapUsed / swapTot * 100;
    var stSwap = stateAbove(swapPct, thr.swap);

    // ── DISCO — pior volume + lista ──
    function vol(name) { var m = name.match(/\(([A-Za-z]:)\)/); return m ? m[1] : name.split(':')[0]; }
    var disks = [];
    for (var i = 0; i < spaceUtil.length; i++) {
      var it = spaceUtil[i], pct = U.num(it);
      if (pct == null) continue;
      var v = vol(it.name);
      var used = null, tot = null;
      for (var a = 0; a < spaceUsed.length; a++) if (vol(spaceUsed[a].name) === v) { used = U.num(spaceUsed[a]); break; }
      for (var b = 0; b < spaceTotal.length; b++) if (vol(spaceTotal[b].name) === v) { tot = U.num(spaceTotal[b]); break; }
      if (tot != null && tot > 0) disks.push({ v: v, pct: pct, used: used, tot: tot });
    }
    disks.sort(function (a, b2) { return b2.pct - a.pct; });
    var worst = disks.length ? disks[0] : null;
    var stDisk = worst ? stateAbove(worst.pct, thr.disk) : 'nd';
    var diskList = '';
    for (var d = 0; d < Math.min(disks.length, 4); d++) {
      var dd = disks[d], sc = stColor(stateAbove(dd.pct, thr.disk));
      diskList += '<span style="color:' + sc + ';font-weight:600">' + U.esc(dd.v) + ' ' + Math.round(dd.pct) + '%</span>'
        + '<span style="color:' + c.sub + '"> (' + U.gb(dd.used, 0) + '/' + U.gb(dd.tot, 0) + 'G)</span>'
        + (d < Math.min(disks.length, 4) - 1 ? ' · ' : '');
    }

    var html = PULSE_CSS
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;font-family:Inter,\'Segoe UI\',sans-serif">'

      + card(stDisp, 'Disponibilidade · ICMP', dispDonut,
          ping == null ? '—' : (ping >= 1 ? '<span style="color:' + c.ok + '">ONLINE</span>' : '<span style="color:' + c.crit + '">EM BAIXO</span>'),
          'RTT <b style="color:' + stColor(stRtt) + '">' + (rttMs != null ? rttMs.toFixed(1) + ' ms' : '—') + '</b>'
          + ' · perda <b style="color:' + stColor(stLoss) + '">' + (loss != null ? loss.toFixed(1) + '%' : '—') + '</b>')

      + card(stCpu, 'CPU', donut(cpu, stCpu),
          (cpu != null ? cpu.toFixed(1) + '%' : '—') + (nCpu ? ' <span style="color:' + c.sub + ';font-weight:400">de ' + nCpu + ' vCPU</span>' : ''),
          (queue != null ? 'fila de execução: <b>' + Math.round(queue) + '</b> · ' : '')
          + 'limiar ' + thr.cpu.warn + '/' + thr.cpu.crit + '%')

      + card(stRam, 'Memória RAM', donut(ramPct, stRam),
          '<b>' + U.gb(ramUsed) + '</b> de <b>' + U.gb(ramTot) + ' GB</b>',
          'livre: ' + (ramTot != null && ramUsed != null ? U.gb(ramTot - ramUsed) + ' GB' : '—')
          + ' · limiar ' + thr.ram.warn + '/' + thr.ram.crit + '%')

      + card(stSwap, 'Swap', donut(swapPct, stSwap),
          '<b>' + U.gb(swapUsed) + '</b> de <b>' + U.gb(swapTot) + ' GB</b>',
          'livre: ' + (swapFree != null ? U.gb(swapFree) + ' GB' : '—')
          + ' · limiar ' + thr.swap.warn + '/' + thr.swap.crit + '%')

      + card(stDisk, 'Disco · pior volume' + (worst ? ' (' + U.esc(worst.v) + ')' : ''), donut(worst ? worst.pct : null, stDisk),
          worst ? '<b>' + U.gb(worst.used) + '</b> de <b>' + U.gb(worst.tot) + ' GB</b>' : '—',
          (diskList || 'sem volumes') + '<br>limiar ' + thr.disk.warn + '/' + thr.disk.crit + '%')

      + '</div>';
    return html;
  }

  // ── bootstrap ──
  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;
  if (_ns.abortTimer) { clearTimeout(_ns.abortTimer); _ns.abortTimer = null; }
  var _prev = _ns.controller;
  if (_prev) { _ns.abortTimer = setTimeout(function () { _prev.abort(); _ns.abortTimer = null; }, CFG.abortDelayMs); }
  var _ctrl = new AbortController(); _ns.controller = _ctrl; _sig = _ctrl.signal;
  _myToken = Date.now() + Math.random(); _ns.token = _myToken;

  var root = document.getElementById(CFG.rootId);
  if (!root) return;
  var hostRaw = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma VM.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar sinais vitais…</span>';

  var NAMES = ['ICMP ping', 'ICMP response time', 'ICMP loss', 'ICMP packet loss',
    'CPU utilization', 'CPU queue length', 'Number of logical processors', 'Number of CPUs',
    'Memory utilization', 'Used memory', 'Total memory',
    'Free swap space', 'Total swap space', 'Used swap space in %'];

  zbx('host.get', { output: ['hostid', 'host'], filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var hid = hosts[0].hostid;
      return Promise.all([
        zbx('item.get', { hostids: [hid], output: ['name', 'lastvalue', 'lastclock'], filter: { name: NAMES } }),
        zbx('item.get', { hostids: [hid], output: ['name', 'lastvalue'], search: { name: ': Space utilization' } }),
        zbx('item.get', { hostids: [hid], output: ['name', 'lastvalue'], search: { name: ': Used space' } }),
        zbx('item.get', { hostids: [hid], output: ['name', 'lastvalue'], search: { name: ': Total space' } }),
        zbx('usermacro.get', { hostids: [hid], output: ['macro', 'value'] }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        root.innerHTML = render(res[0] || [], res[1] || [], res[2] || [], res[3] || [], effThr(res[4] || []));
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
