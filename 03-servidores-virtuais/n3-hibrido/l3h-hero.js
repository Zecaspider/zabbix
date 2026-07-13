// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 HÍBRIDO · VM — HERO de identidade (topo do fluxo top-down)             ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid (nome visível da VM)             ║
// ║  Standalone ES5 + guard anti-double-fire (padrão _l3-base.js).             ║
// ║  Responde a "QUE máquina é esta e está viva?" num relance: nome grande,    ║
// ║  farol de estado (pior severidade de problema activo), badges de power/    ║
// ║  agente, chips de tags de negócio e factos rápidos (IP·SO·RAM·uptime·      ║
// ║  hypervisor·cluster). O detalhe numérico vive nos painéis nativos abaixo.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-hero',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    maxAgeSec: { agent: 7200, vmware: 600 },
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128', mute: '#2D333B',
      chipBg: 'rgba(88,166,255,.10)',
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
    byKeyPrefix: function (items, pfx) { for (var i = 0; i < items.length; i++) if ((items[i].key_ || '').indexOf(pfx) === 0 && items[i].lastvalue !== '') return items[i]; return null; },
    fresh: function (it, maxAge) { if (!it) return false; var c = parseInt(it.lastclock) || 0; return c > 0 && (Date.now() / 1000 - c) <= maxAge; },
    upt: function (secs) {
      if (secs == null || isNaN(secs)) return '—';
      var d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
      return d > 0 ? d + 'd ' + h + 'h' : h + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
    },
    gb: function (b) { var n = parseFloat(b); return isNaN(n) ? '—' : (n / 1073741824).toFixed(0) + ' GB'; },
    renderErro: function (causa) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);border-radius:8px;padding:12px 16px;font-family:monospace">'
        + '<span style="color:' + CFG.colors.crit + ';font-size:12px;font-weight:700">&#9888; </span>'
        + '<span style="color:' + CFG.colors.text + ';font-size:12px">' + U.esc(causa) + '</span></div>';
    },
  };

  var SEV_STATE = { 5: 'crit', 4: 'crit', 3: 'warn', 2: 'warn', 1: 'info', 0: 'info' };

  function chip(label, value, color) {
    if (!value) return '';
    return '<span style="display:inline-flex;align-items:center;gap:6px;background:' + CFG.colors.chipBg + ';'
      + 'border:1px solid rgba(88,166,255,.25);border-radius:999px;padding:3px 12px;margin:0 6px 6px 0">'
      + '<span style="font-size:10px;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.05em">' + label + '</span>'
      + '<span style="font-size:12px;color:' + (color || CFG.colors.text) + ';font-weight:600">' + U.esc(value) + '</span></span>';
  }
  function badge(text, color) {
    return '<span style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '44;'
      + 'font-size:11px;font-weight:700;padding:3px 12px;border-radius:6px;letter-spacing:.03em;white-space:nowrap">' + text + '</span>';
  }
  function fact(label, value) {
    return '<div style="min-width:0">'
      + '<div style="font-size:9.5px;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">' + label + '</div>'
      + '<div style="font-size:13px;color:' + CFG.colors.text + ';font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + value + '</div></div>';
  }

  function render(host, items, problems) {
    var c = CFG.colors;
    // farol = pior severidade activa
    var worst = -1;
    for (var i = 0; i < problems.length; i++) { var s = parseInt(problems[i].severity) || 0; if (s > worst) worst = s; }
    var farolColor = worst < 0 ? c.ok : (worst >= 4 ? c.crit : (worst >= 2 ? c.warn : c.info));
    var farolText = worst < 0 ? 'SAUDÁVEL' : (problems.length + ' PROBLEMA' + (problems.length > 1 ? 'S' : '') + ' ACTIVO' + (problems.length > 1 ? 'S' : ''));

    var os = U.byKeyPrefix(items, 'system.sw.os');
    var arch = U.byKeyPrefix(items, 'system.sw.arch');
    var upt = U.byKeyPrefix(items, 'system.uptime');
    var mem = U.byKeyPrefix(items, 'vm.memory.size[total]');
    var hv = U.byKeyPrefix(items, 'vmware.vm.hv.name');
    var cluster = U.byKeyPrefix(items, 'vmware.vm.cluster.name');
    var power = U.byKeyPrefix(items, 'vmware.vm.powerstate');

    var agentAlive = U.fresh(upt, CFG.maxAgeSec.agent);
    var powerOn = power ? parseFloat(power.lastvalue) === 1 : null;

    var badges = '';
    if (powerOn === true) badges += badge('⏻ LIGADA', c.ok) + ' ';
    else if (powerOn === false) badges += badge('⏻ DESLIGADA', c.crit) + ' ';
    badges += agentAlive ? badge('AGENTE OK', c.ok) : badge('SEM AGENTE', c.warn);

    var ip = (host.interfaces && host.interfaces.length) ? host.interfaces[0].ip : '—';
    var osTxt = os ? String(os.lastvalue).slice(0, 44) : '—';
    if (arch && osTxt !== '—') osTxt += ' · ' + arch.lastvalue;
    else if (arch && osTxt === '—') osTxt = arch.lastvalue;

    var sysTag = U.tag(host.tags, 'servico'), deptTag = U.tag(host.tags, 'departamento');
    var ambTag = U.tag(host.tags, 'ambiente'), camTag = U.tag(host.tags, 'camada');

    return ''
      + '<div style="display:flex;flex-direction:column;gap:12px;font-family:Inter,-apple-system,\'Segoe UI\',sans-serif">'

      // linha 1: farol + nome + badges
      + '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
      +   '<span style="width:14px;height:14px;border-radius:50%;background:' + farolColor + ';box-shadow:0 0 12px ' + farolColor + '88;flex:none"></span>'
      +   '<span style="font-size:26px;font-weight:800;color:#E6EDF3;font-family:\'JetBrains Mono\',Consolas,monospace;letter-spacing:.01em">' + U.esc(host.host) + '</span>'
      +   '<span style="font-size:12px;font-weight:700;color:' + farolColor + ';letter-spacing:.04em">' + farolText + '</span>'
      +   '<span style="flex:1"></span>'
      +   '<span style="display:flex;gap:8px">' + badges + '</span>'
      + '</div>'

      // linha 2: chips de negócio
      + '<div style="display:flex;flex-wrap:wrap">'
      +   chip('Sistema', sysTag, c.info) + chip('Dept', deptTag) + chip('Ambiente', ambTag) + chip('Camada', camTag)
      + '</div>'

      // linha 3: factos rápidos
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 22px;'
      +   'background:rgba(255,255,255,.015);border:1px solid ' + c.brd + ';border-radius:10px;padding:12px 18px">'
      +   fact('Endereço IP', U.esc(ip))
      +   fact('Sistema operativo', U.esc(osTxt))
      +   fact('Memória', U.gb(mem ? mem.lastvalue : null))
      +   fact('Uptime', U.upt(upt ? parseFloat(upt.lastvalue) : null))
      +   fact('Hypervisor', hv ? U.esc(hv.lastvalue) : '—')
      +   fact('Cluster', cluster ? U.esc(cluster.lastvalue) : '—')
      + '</div>'
      + '</div>';
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
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma VM no selector acima.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar identidade…</span>';

  zbx('host.get', { output: ['hostid', 'host', 'name'], selectTags: 'extend', selectInterfaces: ['ip'], filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var host = hosts[0];
      return Promise.all([
        zbx('item.get', { hostids: [host.hostid], output: ['name', 'key_', 'lastvalue', 'lastclock'], searchByAny: true, search: { key_: 'system.' } }),
        zbx('item.get', { hostids: [host.hostid], output: ['name', 'key_', 'lastvalue', 'lastclock'], search: { key_: 'vmware.vm.' } }),
        zbx('item.get', { hostids: [host.hostid], output: ['key_', 'lastvalue', 'lastclock'], filter: { key_: ['vm.memory.size[total]'] } }),
        zbx('problem.get', { hostids: [host.hostid], output: ['severity'], suppressed: false }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        var items = (res[0] || []).concat(res[1] || []).concat(res[2] || []);
        root.innerHTML = render(host, items, res[3] || []);
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
