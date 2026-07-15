// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 · Serviços de Suporte · Serviço — Serviços Windows          v1 · ES5  ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                            ║
// ║    var-servico — valor da tag `servico` (ex.: DOMAIN CONTROLLER)         ║
// ║                                                                          ║
// ║  Para cada host do serviço: os items service.info existentes e o seu     ║
// ║  estado real (0=running verde, resto vermelho). Hosts sem service.info   ║
// ║  aparecem com o gap explícito (modelo de tier do domínio 06 — mostrar    ║
// ║  o sinal que existe, nunca esconder o que falta).                        ║
// ║  Padrão Standalone ES5 + guard §4C.7 (03-servidores-virtuais/_l3-base).  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  // ── [1] CFG ────────────────────────────────────────────────────────────────
  var CFG = {
    rootId: 'bt-sup3-svcwin',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    refreshMs: 60000,
    debug: false,
    apiLimits: { hosts: 200, items: 2000 },
    // estados Windows service.info: 0=Running; 1-255 variantes de parado/pausa
    abortDelayMs: 80,
  };
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  // ── guard §4C.7 (bloco A/C) ────────────────────────────────────────────────
  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;
  var _prev = _ns.controller;
  if (_prev) setTimeout(function () { _prev.abort(); }, CFG.abortDelayMs);
  var _ctrl = new AbortController();
  _ns.controller = _ctrl;
  var _myToken = Date.now() + Math.random();
  _ns.token = _myToken;
  function _isCurrent() {
    return window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken;
  }

  // ── [2] UTILS ──────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getServico() {
    return new URLSearchParams(window.location.search).get('var-servico') || '';
  }
  function svcNameFromKey(key) {
    // service.info["DNS"] / service.info[Dhcp,state] -> DNS / Dhcp
    return key.replace(/^service\.info\[\"?/, '').replace(/\"?[,\]].*$/, '');
  }

  // ── [7] API/FETCH (fetchWithRetry §4C.8) ──────────────────────────────────
  function zbx(method, params, attempt) {
    attempt = attempt || 0;
    return fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: 1 }),
      signal: _ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      if (j.error) throw new Error(j.error.message || 'erro Zabbix');
      return j.result;
    }).catch(function (err) {
      if (err.name === 'AbortError') throw err;
      if (attempt >= 2) throw err;
      return new Promise(function (res) { setTimeout(res, 1000 * Math.pow(2, attempt)); })
        .then(function () { return zbx(method, params, attempt + 1); });
    });
  }

  function fetchTudo(servico) {
    return zbx('host.get', {
      output: ['hostid', 'host', 'name'],
      filter: { status: '0' },
      tags: [{ tag: 'servico', value: servico, operator: '0' }],
      limit: CFG.apiLimits.hosts
    }).then(function (hosts) {
      if (!hosts.length) return [hosts, []];
      return zbx('item.get', {
        hostids: hosts.map(function (h) { return h.hostid; }),
        search: { key_: 'service.info' },
        filter: { status: '0' },
        output: ['hostid', 'key_', 'name', 'lastvalue', 'lastclock'],
        limit: CFG.apiLimits.items
      }).then(function (items) { return [hosts, items]; });
    });
  }

  // ── [6] RENDER ─────────────────────────────────────────────────────────────
  function render(hosts, items) {
    var byHost = {};
    items.forEach(function (it) {
      (byHost[it.hostid] = byHost[it.hostid] || []).push(it);
    });

    var linhas = hosts.map(function (h) {
      var svcs = byHost[h.hostid] || [];
      var chips;
      if (!svcs.length) {
        chips = '<span style="font-size:.74rem;color:#d29922;">⚠ sem service.info — só agente/ping (gap de coleta)</span>';
      } else {
        chips = svcs.map(function (it) {
          var running = it.lastvalue === '0';
          var cor = running ? '#3FB950' : '#F85149';
          var estado = running ? 'running' : 'PARADO(' + esc(it.lastvalue) + ')';
          return '<span style="display:inline-block;font-size:.72rem;font-weight:600;padding:2px 9px;margin:2px 4px 2px 0;'
            + 'border-radius:9px;background:' + cor + '1a;color:' + cor + ';border:1px solid ' + cor + '44;white-space:nowrap;">'
            + esc(svcNameFromKey(it.key_)) + ' · ' + estado + '</span>';
        }).join('');
      }
      return '<div style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.05);">'
        + '<div style="display:flex;align-items:baseline;gap:10px;">'
        + '<span style="font-size:.88rem;font-weight:700;color:#E6EDF3;font-family:monospace;">' + esc(h.host) + '</span>'
        + '<span style="font-size:.70rem;color:rgba(255,255,255,.30);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(h.name) + '</span>'
        + '</div>'
        + '<div style="margin-top:5px;">' + chips + '</div>'
        + '</div>';
    });

    return '<div style="font-family:Inter,\'Segoe UI\',sans-serif;">' + linhas.join('') + '</div>';
  }

  function renderErro(causa) {
    return '<div style="padding:14px;font-size:.85rem;color:#F85149;border:1px solid #F8514933;border-radius:8px;">'
      + 'Falha a carregar serviços Windows: ' + esc(causa) + '</div>';
  }

  // ── [8] BOOTSTRAP ──────────────────────────────────────────────────────────
  function boot(attempt) {
    attempt = attempt || 0;
    var root = document.getElementById(CFG.rootId);
    if (!root) {
      if (attempt > 50) return;
      setTimeout(function () { boot(attempt + 1); }, 100);
      return;
    }
    var servico = getServico();
    if (!servico) {
      root.innerHTML = renderErro('variável var-servico ausente no URL');
      return;
    }
    root.innerHTML = '<div style="padding:14px;font-size:.8rem;color:rgba(255,255,255,.35);">A carregar…</div>';

    function load() {
      fetchTudo(servico).then(function (res) {
        if (!_isCurrent()) return;
        var root2 = document.getElementById(CFG.rootId);
        if (!root2) return;
        if (!res[0].length) { root2.innerHTML = renderErro('nenhum host com tag servico=' + servico); return; }
        root2.innerHTML = render(res[0], res[1]);
      }).catch(function (err) {
        if (err.name === 'AbortError' || !_isCurrent()) return;
        var root2 = document.getElementById(CFG.rootId);
        if (root2) root2.innerHTML = renderErro(err.message);
      });
    }
    load();
    if (_ns.refreshTimer) clearInterval(_ns.refreshTimer);
    _ns.refreshTimer = setInterval(function () {
      if (!_isCurrent()) { clearInterval(_ns.refreshTimer); return; }
      load();
    }, CFG.refreshMs);
  }

  boot();
}());
