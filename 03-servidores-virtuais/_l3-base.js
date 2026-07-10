// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — _l3-base.js — FONTE CANÓNICA do boilerplate dos painéis L3     ║
// ║                                                                          ║
// ║  NÃO é implantado num painel. É a fonte-de-verdade (como _comum/utils.js) ║
// ║  de onde se COPIAM os blocos partilhados para cada painel L3 standalone:  ║
// ║    · paleta canónica (CLAUDE.md §8)                                       ║
// ║    · fetchWithRetry / zbx (com threading de AbortSignal)                  ║
// ║    · U.esc / renderErro                                                   ║
// ║    · guard anti-double-fire (CLAUDE.md §4C.7) — os 3 blocos A/B/C         ║
// ║                                                                          ║
// ║  Melhorias ao runtime L3 fazem-se AQUI primeiro; só depois se propagam    ║
// ║  às cópias nos l3-*.js — nunca divergir uma cópia à mão.                  ║
// ║                                                                          ║
// ║  Regra: ES5 obrigatório (var/function) — o Dynamic Text corre em eval().  ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════
  // [1] CFG — paleta canónica (CLAUDE.md §8). Copiar `colors` tal e qual.
  // ════════════════════════════════════════════════════════════════════════

  var CFG = {
    rootId:        'bt-EXEMPLO',            // ÚNICO por painel — nunca reutilizar
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs:  80,                      // absorve o double-fire do BT v6.2.0
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    apiLimits: { items: 50000, history: 1000 },

    colors: {
      ok:   '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      cpu:  '#E8A020', mem:  '#7C4DFF',  net:  '#00BCD4', io: '#F44336', hlth: '#58A6FF',
      text: '#CDD9E5', sub:  '#6E7681',  brd:  '#1C2128', mute: '#2D333B',
    },
  };

  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';


  // ════════════════════════════════════════════════════════════════════════
  // [BLOCO A] Guard anti-double-fire — estado a nível de módulo
  //           COPIAR logo a seguir à declaração de `var PROXY = ...`
  // ════════════════════════════════════════════════════════════════════════

  var _sig = null;          // AbortSignal do fetch em curso (definido no bootstrap)
  var _myToken = null;      // token desta execução do script
  function _isCurrent() {
    return window.__bpc_ns && window.__bpc_ns[CFG.rootId] &&
           window.__bpc_ns[CFG.rootId].token === _myToken;
  }


  // ════════════════════════════════════════════════════════════════════════
  // [2] FETCH — fetchWithRetry usa `signal || _sig`, para o abort do BLOCO C
  //             cortar qualquer fetch em curso mesmo quando o chamador não
  //             passa signal (ex.: objectos ZbxApi.call/zbx legados).
  // ════════════════════════════════════════════════════════════════════════

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal || _sig
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


  // ════════════════════════════════════════════════════════════════════════
  // [3] UTILS — esc + renderErro
  // ════════════════════════════════════════════════════════════════════════

  var U = {
    esc: function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },
    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">&#9888; ERRO</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════
  // [BLOCO C] BOOTSTRAP — inserir ANTES de `var root = ...` no painel real
  //           Aborta o fetch anterior (com delay) e marca este como corrente.
  // ════════════════════════════════════════════════════════════════════════

  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;
  if (_ns.abortTimer) { clearTimeout(_ns.abortTimer); _ns.abortTimer = null; }
  var _prev = _ns.controller;
  if (_prev) {
    _ns.abortTimer = setTimeout(function () { _prev.abort(); _ns.abortTimer = null; }, (CFG.abortDelayMs || 80));
  }
  var _ctrl = new AbortController();
  _ns.controller = _ctrl;
  _sig = _ctrl.signal;
  _myToken = Date.now() + Math.random();
  _ns.token = _myToken;

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  if (!hostName) {
    root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">A carregar…</span>';

  // ── Padrão de consumo: guardar CADA escrita ao DOM com _isCurrent() ──
  zbx('host.get', { output: ['hostid'], filter: { host: [hostName] } }, _sig)
    .then(function (hosts) {
      if (!_isCurrent()) return;                       // descarta resultado obsoleto
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      // ... fetch de items/history/triggers, sempre passando _sig ...
      // if (_isCurrent()) root.innerHTML = render(...);
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;   // ignora abort e execuções obsoletas
      root.innerHTML = U.renderErro(e.message);
    });

})();
