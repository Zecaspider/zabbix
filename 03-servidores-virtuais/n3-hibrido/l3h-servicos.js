// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 HÍBRIDO · VM — SERVIÇOS SERVIDOS POR ESTA VM (estado real)             ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid (host técnico)                   ║
// ║  Standalone ES5 + guard. Fecha o ciclo máquina→serviço:                    ║
// ║   A) SINTÉTICOS: hosts app-* com tag vm=<host técnico> (elo da Fase 7).    ║
// ║      Estado REAL do web scenario (BPC Web Monitoring v2): LEDs             ║
// ║      L1-Disponibilidade / L2-Performance / L3-Conteúdo via                 ║
// ║      web.test.fail (0=ok), tempo de resposta, código HTTP, erro e          ║
// ║      frescura. IMPORTANTE: item.get precisa de webitems:true — sem isso    ║
// ║      os items de web scenario vêm VAZIOS (apanhado na sondagem).           ║
// ║   B) SERVIÇOS WINDOWS na própria VM (discovery "... service is running",   ║
// ║      aplicado só a um subconjunto — estado honesto quando não há).         ║
// ║  Link "Ver serviço →" para o N4 do domínio 07 (var-servico).               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-servicos',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    n4Uid: 'apis-n4-sistema',
    n4Slug: 'n4-apis-sistema',
    staleSec: 900,                 // web scenario sem valor há >15min = SEM DADOS
    respTimeWarnS: 3, respTimeCritS: 8,
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128',
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
    tag: function (tags, k) { for (var i = 0; i < (tags || []).length; i++) if (tags[i].tag === k) return tags[i].value; return ''; },
    num: function (it) { if (!it) return null; var n = parseFloat(it.lastvalue); return isNaN(n) ? null : n; },
    age: function (it) { if (!it || !it.lastclock) return null; var c = parseInt(it.lastclock); return c > 0 ? (Date.now() / 1000 - c) : null; },
    agoTxt: function (s) { if (s == null) return 'nunca'; if (s < 90) return 'há ' + Math.round(s) + 's'; if (s < 5400) return 'há ' + Math.round(s / 60) + 'm'; return 'há ' + (s / 3600).toFixed(1) + 'h'; },
    renderErro: function (c) { return '<div style="color:' + CFG.colors.crit + ';font-size:12px;font-family:monospace">&#9888; ' + U.esc(c) + '</div>'; },
  };
  function stColor(st) { return st === 'crit' ? CFG.colors.crit : (st === 'warn' ? CFG.colors.warn : (st === 'ok' ? CFG.colors.ok : CFG.colors.sub)); }

  var PULSE_CSS =
    '<style>'
    + '@keyframes bpcSvcCrit{0%,100%{box-shadow:0 0 2px 0 rgba(248,81,73,.25)}50%{box-shadow:0 0 18px 4px rgba(248,81,73,.65)}}'
    + '.bpc-svc-pulse{animation:bpcSvcCrit 1.1s ease-in-out infinite}'
    + '</style>';

  // ── 1 card por sintético app-* ─────────────────────────────────
  var SCEN = [
    { id: 'L1-Disponibilidade', label: 'Disponibilidade' },
    { id: 'L2-Performance', label: 'Performance' },
    { id: 'L3-Conteudo', label: 'Conteúdo' },
  ];
  function findItem(items, keyPrefix) {
    for (var i = 0; i < items.length; i++) if ((items[i].key_ || '').indexOf(keyPrefix) === 0) return items[i];
    return null;
  }

  function appCard(app, items, problems) {
    var c = CFG.colors;
    var svc = U.tag(app.tags, 'servico') || app.host.replace(/^app-/, '').toUpperCase();
    var worst = 'ok', anyData = false;

    var leds = '';
    var errMsg = '';
    for (var s = 0; s < SCEN.length; s++) {
      var sc = SCEN[s];
      var fail = findItem(items, 'web.test.fail[' + sc.id + ']');
      var fresh = U.age(fail) != null && U.age(fail) <= CFG.staleSec;
      var st;
      if (!fail || !fresh) st = 'nd';
      else if (U.num(fail) > 0) { st = 'crit'; worst = 'crit'; }
      else { st = 'ok'; anyData = true; }
      if (st === 'crit') {
        var er = findItem(items, 'web.test.error[' + sc.id + ']');
        if (er && er.lastvalue) errMsg = er.lastvalue;
      }
      leds += '<span title="' + sc.label + '" style="display:inline-flex;align-items:center;gap:5px;margin-right:12px">'
        + '<span style="width:10px;height:10px;border-radius:50%;background:' + stColor(st) + ';'
        + 'box-shadow:0 0 7px ' + stColor(st) + (st === 'nd' ? '00' : '88') + '"></span>'
        + '<span style="font-size:10.5px;color:' + (st === 'nd' ? c.sub : c.text) + '">' + sc.label + '</span></span>';
    }

    // tempo de resposta (L2 primeiro; senão L1) + código
    var tItem = findItem(items, 'web.test.time[L2-Performance') || findItem(items, 'web.test.time[L1-Disponibilidade');
    var rt = U.num(tItem);
    var rtSt = rt == null ? 'nd' : (rt >= CFG.respTimeCritS ? 'crit' : (rt >= CFG.respTimeWarnS ? 'warn' : 'ok'));
    var code = findItem(items, 'web.test.rspcode[L1-Disponibilidade') || findItem(items, 'web.test.rspcode[L2-Performance');
    var codeV = code ? code.lastvalue : null;
    var codeSt = codeV == null ? 'nd' : (String(codeV).charAt(0) === '2' || String(codeV).charAt(0) === '3' ? 'ok' : 'crit');
    if (codeSt === 'crit') worst = 'crit';
    if (worst !== 'crit' && rtSt === 'crit') worst = 'warn';
    if (!anyData && worst === 'ok') worst = 'nd';
    // problemas activos do host sintético mandam no estado
    if (problems.length) worst = 'crit';

    var stateTxt = worst === 'crit' ? 'FALHA' : (worst === 'warn' ? 'DEGRADADO' : (worst === 'nd' ? 'SEM DADOS' : 'OPERACIONAL'));
    var freshest = null;
    for (var i = 0; i < items.length; i++) { var a = U.age(items[i]); if (a != null && (freshest == null || a < freshest)) freshest = a; }

    var link = CFG.grafanaUrl + '/d/' + CFG.n4Uid + '/' + CFG.n4Slug + '?var-servico=' + encodeURIComponent(svc);

    return '<div class="' + (worst === 'crit' ? 'bpc-svc-pulse' : '') + '" style="flex:1;min-width:300px;max-width:480px;'
      + 'background:rgba(255,255,255,.015);border:1px solid ' + (worst === 'crit' ? c.crit + '66' : c.brd) + ';'
      + 'border-left:3px solid ' + stColor(worst) + ';border-radius:10px;padding:12px 16px">'
      +  '<div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">'
      +    '<span style="font-size:16px;font-weight:800;color:#E6EDF3">' + U.esc(svc) + '</span>'
      +    '<span style="font-size:10.5px;color:' + c.sub + ';font-family:monospace">' + U.esc(app.host) + '</span>'
      +    '<span style="flex:1"></span>'
      +    '<span style="font-size:11px;font-weight:800;color:' + stColor(worst) + ';letter-spacing:.05em">' + stateTxt + '</span>'
      +  '</div>'
      +  '<div style="margin-top:8px">' + leds + '</div>'
      +  '<div style="margin-top:8px;font-size:11.5px;color:' + c.sub + '">'
      +    'resposta <b style="color:' + stColor(rtSt) + '">' + (rt != null ? (rt * 1000).toFixed(0) + ' ms' : '—') + '</b>'
      +    ' · HTTP <b style="color:' + stColor(codeSt) + '">' + (codeV != null ? U.esc(String(codeV)) : '—') + '</b>'
      +    ' · verificado ' + U.agoTxt(freshest)
      +  '</div>'
      +  (errMsg ? '<div style="margin-top:6px;font-size:11px;color:' + c.crit + ';font-family:monospace">' + U.esc(String(errMsg).slice(0, 90)) + '</div>' : '')
      +  '<div style="margin-top:8px"><a href="' + link + '" style="color:' + c.info + ';font-size:11px;text-decoration:none">Ver serviço no domínio 07 →</a></div>'
      + '</div>';
  }

  // ── serviços Windows na VM (discovery "... service is running") ─
  function winSvcBlock(svcItems) {
    var c = CFG.colors;
    if (!svcItems.length) {
      return '<span style="font-size:11.5px;color:' + c.sub + '">Sem discovery de serviços Windows aplicado a esta VM '
        + '(existe só num subconjunto — ex. as VMs do eBankit).</span>';
    }
    var out = '';
    for (var i = 0; i < Math.min(svcItems.length, 14); i++) {
      var it = svcItems[i];
      var running = U.num(it) === 0;
      var nm = it.name.replace(/ service is running.*$/i, '').replace(/^["']|["']$/g, '');
      out += '<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 11px;border-radius:999px;'
        + 'font-size:11px;font-weight:600;background:' + (running ? c.ok : c.crit) + '18;'
        + 'color:' + (running ? c.ok : c.crit) + ';border:1px solid ' + (running ? c.ok : c.crit) + '44">'
        + U.esc(nm) + (running ? '' : ' — PARADO') + '</span>';
    }
    if (svcItems.length > 14) out += '<span style="font-size:11px;color:' + c.sub + '">+' + (svcItems.length - 14) + '</span>';
    return out;
  }

  function sect(t) {
    return '<div style="font-size:10.5px;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.07em;margin:12px 0 8px">' + t + '</div>';
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
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A procurar serviços servidos por esta VM…</span>';

  zbx('host.get', { output: ['hostid', 'host'], selectTags: 'extend', filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var vm = hosts[0];
      return Promise.all([
        // sintéticos ligados pela tag vm=<host técnico> (elo canónico da Fase 7)
        zbx('host.get', { output: ['hostid', 'host', 'name'], selectTags: 'extend', filter: { status: 0 }, tags: [{ tag: 'vm', value: vm.host, operator: '0' }] }),
        // serviços Windows descobertos na própria VM
        zbx('item.get', { hostids: [vm.hostid], output: ['name', 'lastvalue', 'lastclock'], search: { name: 'service is running' }, filter: { status: 0 } }),
      ]).then(function (r1) {
        if (!_isCurrent()) return null;
        var apps = (r1[0] || []).filter(function (a) { return a.host.indexOf('app-') === 0; });
        var winSvcs = r1[1] || [];
        if (!apps.length) return { vm: vm, apps: [], appData: [], winSvcs: winSvcs };
        var appIds = apps.map(function (a) { return a.hostid; });
        return Promise.all([
          // webitems:true OBRIGATÓRIO — sem isso os items web.test vêm vazios
          zbx('item.get', { hostids: appIds, webitems: true, output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'], filter: { status: 0 } }),
          zbx('problem.get', { hostids: appIds, output: ['severity'], suppressed: false }),
        ]).then(function (r2) {
          return { vm: vm, apps: apps, items: r2[0] || [], problems: r2[1] || [], winSvcs: winSvcs };
        });
      });
    })
    .then(function (d) {
      if (!d || !_isCurrent()) return;
      var c = CFG.colors;
      var html = PULSE_CSS;

      html += sect('Serviços de negócio servidos por esta VM (sintéticos app-*, elo tag vm=' + U.esc(d.vm.host) + ')');
      if (!d.apps.length) {
        html += '<div style="font-size:12px;color:' + c.sub + ';padding:2px 0 4px">'
          + 'Nenhum sintético <code style="color:' + c.text + '">app-*</code> mapeado a esta VM. '
          + 'Ou a VM não serve um sistema do relatório diário, ou o mapeamento está por fazer '
          + '(ver reconciliação dos 50 sistemas, <code style="color:' + c.text + '">documentacao/reconciliacao-50-sistemas-excel.md</code>).</div>';
      } else {
        var cards = '';
        for (var i = 0; i < d.apps.length; i++) {
          var app = d.apps[i];
          var its = [];
          for (var j = 0; j < d.items.length; j++) if (d.items[j].hostid === app.hostid) its.push(d.items[j]);
          cards += appCard(app, its, d.problems);
        }
        html += '<div style="display:flex;gap:12px;flex-wrap:wrap">' + cards + '</div>';
      }

      html += sect('Serviços Windows monitorizados nesta VM');
      html += '<div>' + winSvcBlock(d.winSvcs) + '</div>';

      root.innerHTML = '<div style="font-family:Inter,\'Segoe UI\',sans-serif">' + html + '</div>';
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
