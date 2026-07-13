// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 HÍBRIDO · VM — FICHA completa (contexto + inventário, fim do fluxo)    ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid                                  ║
// ║  Standalone ES5 + guard. 3 cartões lado a lado: IDENTIDADE (SO/IP/HW),     ║
// ║  VIRTUALIZAÇÃO (datacenter/cluster/hypervisor/power/consumo) e NEGÓCIO &   ║
// ║  MONITORIZAÇÃO (tags, grupos, templates). Tipografia limpa, key-value      ║
// ║  alinhado, sem ruído — o "bilhete de identidade" da VM para handover/NOC.  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-ficha',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    groupsIgnore: ['Linux servers', 'Windows servers', 'Discovered hosts', 'Virtual machines', 'Zabbix servers', 'Applications'],
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128',
      cardBg: 'rgba(255,255,255,.015)',
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
    byKeyPrefix: function (items, pfx) { for (var i = 0; i < items.length; i++) if ((items[i].key_ || '').indexOf(pfx) === 0 && items[i].lastvalue !== '') return items[i]; return null; },
    upt: function (secs) {
      if (secs == null || isNaN(secs)) return '—';
      var d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600);
      return d > 0 ? d + ' dias ' + h + 'h' : h + 'h ' + Math.floor((secs % 3600) / 60) + 'm';
    },
    gb: function (b) { var n = parseFloat(b); return isNaN(n) ? '—' : (n / 1073741824).toFixed(1) + ' GB'; },
    renderErro: function (causa) {
      return '<div style="color:' + CFG.colors.crit + ';font-size:12px;font-family:monospace">&#9888; ' + U.esc(causa) + '</div>';
    },
  };

  function kv(label, value, mono) {
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.045)">'
      + '<span style="font-size:10.5px;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.05em;flex:none">' + label + '</span>'
      + '<span style="font-size:12.5px;color:' + CFG.colors.text + ';text-align:right;' + (mono ? 'font-family:Consolas,monospace;' : '') + 'min-width:0;overflow-wrap:anywhere">' + value + '</span></div>';
  }
  function card(title, accent, inner) {
    return '<div style="flex:1;min-width:280px;background:' + CFG.colors.cardBg + ';border:1px solid ' + CFG.colors.brd + ';'
      + 'border-top:2px solid ' + accent + ';border-radius:10px;padding:14px 18px 10px">'
      + '<div style="font-size:11px;font-weight:700;color:' + accent + ';text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">' + title + '</div>'
      + inner + '</div>';
  }
  function pillList(arr, color) {
    if (!arr || !arr.length) return '<span style="color:' + CFG.colors.sub + '">—</span>';
    var out = '';
    for (var i = 0; i < arr.length; i++) {
      out += '<span style="display:inline-block;background:' + color + '18;color:' + color + ';border:1px solid ' + color + '33;'
        + 'font-size:11px;padding:2px 9px;border-radius:999px;margin:0 5px 5px 0">' + U.esc(arr[i]) + '</span>';
    }
    return out;
  }

  function render(host, items) {
    var c = CFG.colors;
    var os = U.byKeyPrefix(items, 'system.sw.os');
    var arch = U.byKeyPrefix(items, 'system.sw.arch');
    var upt = U.byKeyPrefix(items, 'system.uptime');
    var memT = U.byKeyPrefix(items, 'vm.memory.size[total]');
    var cpuN = U.byKeyPrefix(items, 'system.cpu.num') || U.byKeyPrefix(items, 'wmi.get[root/cimv2,select NumberOfLogicalProcessors');
    var hv = U.byKeyPrefix(items, 'vmware.vm.hv.name');
    var cluster = U.byKeyPrefix(items, 'vmware.vm.cluster.name');
    var dc = U.byKeyPrefix(items, 'vmware.vm.datacenter.name');
    var power = U.byKeyPrefix(items, 'vmware.vm.powerstate');
    var vmwMem = U.byKeyPrefix(items, 'vmware.vm.memory.size[');
    var vmwUpt = U.byKeyPrefix(items, 'vmware.vm.uptime');

    var ips = [];
    for (var i = 0; i < (host.interfaces || []).length; i++) if (host.interfaces[i].ip) ips.push(host.interfaces[i].ip);

    var tags = {};
    for (var t = 0; t < (host.tags || []).length; t++) tags[host.tags[t].tag] = host.tags[t].value;

    var groups = [];
    for (var g = 0; g < (host.hostgroups || host.groups || []).length; g++) {
      var gn = (host.hostgroups || host.groups)[g].name;
      var ignore = false;
      for (var x = 0; x < CFG.groupsIgnore.length; x++) if (gn.toLowerCase().indexOf(CFG.groupsIgnore[x].toLowerCase()) === 0) { ignore = true; break; }
      if (!ignore) groups.push(gn);
    }
    var templates = [];
    for (var p = 0; p < (host.parentTemplates || []).length; p++) templates.push(host.parentTemplates[p].name);

    var powerTxt = power == null ? '—'
      : (parseFloat(power.lastvalue) === 1 ? '<span style="color:' + c.ok + ';font-weight:700">Ligada</span>'
        : '<span style="color:' + c.crit + ';font-weight:700">Desligada</span>');

    var ident =
      kv('Host técnico', U.esc(host.host), true)
      + kv('Nome completo', U.esc(host.name))
      + kv('Endereço(s) IP', ips.length ? U.esc(ips.join(' · ')) : '—', true)
      + kv('Sistema operativo', os ? U.esc(String(os.lastvalue).slice(0, 60)) : '—')
      + kv('Arquitectura', arch ? U.esc(arch.lastvalue) : '—')
      + (cpuN ? kv('CPUs lógicos', U.esc(cpuN.lastvalue)) : '')
      + kv('Memória total', U.gb(memT ? memT.lastvalue : null))
      + kv('Uptime (SO)', U.upt(upt ? parseFloat(upt.lastvalue) : null));

    var virt =
      kv('Estado de energia', powerTxt)
      + kv('Datacenter', dc ? U.esc(dc.lastvalue) : '—')
      + kv('Cluster', cluster ? U.esc(cluster.lastvalue) : '—')
      + kv('Hypervisor', hv ? U.esc(hv.lastvalue) : '—', true)
      + (vmwMem ? kv('Memória atribuída (vSphere)', U.gb(vmwMem.lastvalue)) : '')
      + (vmwUpt && parseFloat(vmwUpt.lastvalue) > 0 ? kv('Uptime (vSphere)', U.upt(parseFloat(vmwUpt.lastvalue))) : '');

    var negTags = [];
    if (tags.servico) negTags.push('servico: ' + tags.servico);
    if (tags.departamento) negTags.push('departamento: ' + tags.departamento);
    if (tags.ambiente) negTags.push('ambiente: ' + tags.ambiente);
    if (tags.camada) negTags.push('camada: ' + tags.camada);
    for (var k in tags) if (tags.hasOwnProperty(k) && ['servico', 'departamento', 'ambiente', 'camada'].indexOf(k) === -1) negTags.push(k + ': ' + tags[k]);

    var neg =
      '<div style="margin-bottom:6px">' + pillList(negTags, c.info) + '</div>'
      + '<div style="font-size:10.5px;color:' + c.sub + ';text-transform:uppercase;letter-spacing:.05em;margin:8px 0 4px">Grupos Zabbix</div>'
      + '<div>' + pillList(groups.slice(0, 6), c.warn) + '</div>'
      + '<div style="font-size:10.5px;color:' + c.sub + ';text-transform:uppercase;letter-spacing:.05em;margin:8px 0 4px">Templates (' + templates.length + ')</div>'
      + '<div style="font-size:11.5px;color:' + c.text + ';line-height:1.7">' + U.esc(templates.join('  ·  ')) + '</div>';

    return '<div style="display:flex;gap:14px;flex-wrap:wrap;font-family:Inter,-apple-system,\'Segoe UI\',sans-serif;align-items:stretch">'
      + card('Identidade', c.info, ident)
      + card('Virtualização', '#7C4DFF', virt)
      + card('Negócio & monitorização', c.ok, neg)
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
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma VM.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar ficha…</span>';

  zbx('host.get', {
    output: ['hostid', 'host', 'name'],
    selectTags: 'extend', selectInterfaces: ['ip'],
    selectParentTemplates: ['name'], selectHostGroups: ['name'],
    filter: { host: [hostName] },
  })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var host = hosts[0];
      return Promise.all([
        zbx('item.get', { hostids: [host.hostid], output: ['name', 'key_', 'lastvalue', 'lastclock'], searchByAny: true, search: { key_: 'system.' } }),
        zbx('item.get', { hostids: [host.hostid], output: ['name', 'key_', 'lastvalue', 'lastclock'], search: { key_: 'vmware.vm.' } }),
        zbx('item.get', { hostids: [host.hostid], output: ['key_', 'lastvalue'], filter: { key_: ['vm.memory.size[total]'] } }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        root.innerHTML = render(host, (res[0] || []).concat(res[1] || []).concat(res[2] || []));
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
