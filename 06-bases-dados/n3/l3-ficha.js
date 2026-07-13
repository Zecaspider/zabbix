// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 · BASES DE DADOS — Ficha do servidor (identidade)                      ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid                                  ║
// ║  Standalone ES5. Única secção que aparece SEMPRE, independente do tier:    ║
// ║  SO, IP, uptime, cluster/hypervisor (VMware), e templates Zabbix ligados   ║
// ║  (mostra que fonte de dados de BD o host tem hoje).                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-bd-ficha',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    colors: { text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128', info: '#58A6FF', ok: '#3FB950' },
  };
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  var _sig = null, _myToken = null;
  function _isCurrent() { return window.__bpc_ns && window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken; }
  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal || _sig })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) { if (err.name === 'AbortError') throw err; if (attempt >= 2) throw err;
        return new Promise(function (res) { setTimeout(res, 1000 * Math.pow(2, attempt)); }).then(function () { return fetchWithRetry(url, body, signal, attempt + 1); }); });
  }
  function zbx(m, p) { return fetchWithRetry(PROXY, { jsonrpc: '2.0', id: 1, method: m, params: p }, _sig).then(function (j) { if (j.error) throw new Error(j.error.data || j.error.message); return j.result; }); }

  var U = {
    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    extractHostName: function (raw) { var s = raw.split('(')[0].trim(); var p = s.split(/\s*-\s*/); return p[p.length - 1].trim(); },
    findVal: function (items, name) { for (var i = 0; i < items.length; i++) if (items[i].name === name && items[i].lastvalue !== '') return items[i].lastvalue; return null; },
    findByKeySub: function (items, sub) { for (var i = 0; i < items.length; i++) if ((items[i].key_ || '').indexOf(sub) === 0 && items[i].lastvalue !== '') return items[i].lastvalue; return null; },
    upt: function (secs) { if (secs == null) return '—'; var d = Math.floor(secs / 86400); return d + 'd'; },
    renderErro: function (c) { return '<div style="color:#F85149;font-size:11px;font-family:monospace">&#9888; ' + U.esc(c) + '</div>'; },
  };

  function rowKV(k, v) {
    return '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.05)">'
      + '<span style="font-size:.74rem;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.02em">' + k + '</span>'
      + '<span style="font-size:.82rem;color:' + CFG.colors.text + ';text-align:right;max-width:65%">' + v + '</span></div>';
  }

  function render(host, items, tpls) {
    var os = U.findByKeySub(items, 'system.sw.os') || U.findVal(items, 'Operating system') || '—';
    var arch = U.findByKeySub(items, 'system.sw.arch') || '';
    var uptime = U.findByKeySub(items, 'system.uptime');
    var totMem = U.findByKeySub(items, 'vm.memory.size[total]');
    var hv = U.findByKeySub(items, 'vmware.vm.hv.name') || null;
    var cluster = U.findByKeySub(items, 'vmware.vm.cluster.name') || null;
    var ip = (host.interfaces && host.interfaces.length) ? host.interfaces[0].ip : '—';

    var tplNames = (tpls || []).map(function (t) { return t.name; });
    var dbTpls = tplNames.filter(function (n) { return /MSSQL|Oracle|MySQL|DB Engine|Perfmon/i.test(n); });

    var html = rowKV('Sistema operativo', U.esc(os) + (arch ? ' · ' + U.esc(arch) : ''));
    html += rowKV('Endereço IP', U.esc(ip));
    if (totMem) html += rowKV('Memória total', (parseFloat(totMem) / 1073741824).toFixed(1) + ' GB');
    html += rowKV('Uptime', U.upt(uptime ? parseFloat(uptime) : null));
    if (hv) html += rowKV('Hypervisor', U.esc(hv));
    if (cluster) html += rowKV('Cluster', U.esc(cluster));
    html += rowKV('Templates de BD', dbTpls.length
      ? dbTpls.map(function (n) { return '<span style="color:' + CFG.colors.info + '">' + U.esc(n) + '</span>'; }).join('<br>')
      : '<span style="color:' + CFG.colors.sub + '">nenhum específico de BD</span>');
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
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma instância.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar…</span>';

  zbx('host.get', { output: ['hostid', 'host'], selectInterfaces: ['ip'], selectParentTemplates: ['name'], filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var host = hosts[0], hid = host.hostid;
      return zbx('item.get', {
        hostids: [hid],
        search: { key_: 'system.' }, searchByAny: true,
        output: ['name', 'key_', 'lastvalue'],
      }).then(function (sysItems) {
        // + itens VMware e memória por chave
        return zbx('item.get', { hostids: [hid], output: ['name', 'key_', 'lastvalue'],
          filter: { key_: ['vm.memory.size[total]'] } }).then(function (memItems) {
          return zbx('item.get', { hostids: [hid], search: { key_: 'vmware.vm.' }, searchByAny: true, output: ['name', 'key_', 'lastvalue'] })
            .then(function (vmwItems) {
              if (!_isCurrent()) return;
              var all = (sysItems || []).concat(memItems || []).concat(vmwItems || []);
              root.innerHTML = render(host, all, host.parentTemplates);
            });
        });
      });
    })
    .catch(function (e) { if (e.name === 'AbortError' || !_isCurrent()) return; root.innerHTML = U.renderErro(e.message); });

})();
