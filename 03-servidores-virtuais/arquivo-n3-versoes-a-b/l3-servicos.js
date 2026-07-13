(function () {

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ════════════════════════════════════════════════════════════
  // D5-Detalhe-VM · SERVIÇOS  v1.1
  // Business Text — ES5, sem dependências externas
  //<div id="bt-kpi-servicos"></div>
  // Reactividade: query dumb força re-render do BT quando a
  // variável Grafana muda. O JS lê var-hostid do URL em cada
  // execução — sem eventos, sem polling, sem listeners.
  //
  // v1.1 (2026-07-10) — acrescenta identidade de negócio (tags
  // servico/departamento/camada/ambiente) acima da lista de serviços
  // Windows. Muitas VMs não têm o discovery de serviços Windows
  // aplicado (só um subconjunto, ex. eBankit) — sem isto o painel
  // ficava "vazio" mesmo quando há informação de negócio disponível.
  //
  // Estrutura:
  //   [1] CFG
  //   [2] UTILS
  //   [3] CSS
  //   [4] FETCH
  //   [5] COMPUTE
  //   [6] RENDER
  //   [7] BOOTSTRAP
  // ════════════════════════════════════════════════════════════


  // ────────────────────────────────────────────────────────────
  // [1] CFG
  // ────────────────────────────────────────────────────────────

  var CFG = {
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId: 'bt-kpi-servicos',

    apiLimits: { items: 1000 },
    retry: { maxAttempts: 3, baseDelayMs: 1000 },

    colors: {
      ok:   '#3FB950',
      crit: '#F85149',
      mute: '#6E7681',
      text: '#CDD9E5',
      sub:  '#8B949E',
      border:'rgba(255,255,255,.07)',
    },
  };

  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  // ── Guard anti-double-fire (CLAUDE.md §4C.7 / _l3-base.js BLOCO A) ──
  var _sig = null;
  var _myToken = null;
  function _isCurrent() {
    return window.__bpc_ns && window.__bpc_ns[CFG.rootId] &&
           window.__bpc_ns[CFG.rootId].token === _myToken;
  }

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    var maxAttempts = CFG.retry.maxAttempts;
    var baseDelayMs = CFG.retry.baseDelayMs;

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
      if (attempt >= maxAttempts - 1) throw err;
      return new Promise(function (res) {
        setTimeout(res, baseDelayMs * Math.pow(2, attempt));
      }).then(function () {
        return fetchWithRetry(url, body, signal, attempt + 1);
      });
    });
  }


  // ────────────────────────────────────────────────────────────
  // [2] UTILS
  // ────────────────────────────────────────────────────────────

  var U = {

    esc: function (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:15.5px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; SERVIÇOS</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:14px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:12.5px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },

    extractHostName: function (raw) {
      var semParentese = raw.split('(')[0].trim();
      var partes = semParentese.split(/\s*-\s*/);
      return partes[partes.length - 1].trim();
    },

    extractServiceLabel: function (itemName) {
      // "HTTPS service is running" → "HTTPS"
      return itemName.replace(/\s*service is running\s*/i, '').trim();
    },

    tagVal: function (tags, key) {
      for (var i = 0; i < (tags || []).length; i++) {
        if (tags[i].tag === key) return tags[i].value;
      }
      return '';
    },
  };


  // ────────────────────────────────────────────────────────────
  // [3] CSS
  // ────────────────────────────────────────────────────────────

  var CSS = [
    '<style>',
    '#bt-kpi-servicos *{box-sizing:border-box;margin:0;padding:0;}',
    '#bt-kpi-servicos{font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif;}',

    '#bt-kpi-servicos .sv-wrap{',
    '  padding:10px 16px;background:linear-gradient(135deg,#0d1117 0%,#0f1923 100%);',
    '  border:1px solid ' + CFG.colors.border + ';border-radius:6px;',
    '}',

    '#bt-kpi-servicos .sv-title{',
    '  font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;',
    '  color:' + CFG.colors.mute + ';margin-bottom:8px;',
    '}',

    '#bt-kpi-servicos .sv-list{display:flex;flex-wrap:wrap;gap:8px;}',

    '#bt-kpi-servicos .sv-row{',
    '  display:flex;align-items:center;gap:7px;padding:5px 12px;',
    '  background:rgba(255,255,255,.02);border:1px solid ' + CFG.colors.border + ';border-radius:5px;',
    '}',

    '#bt-kpi-servicos .sv-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}',
    '#bt-kpi-servicos .sv-name{color:' + CFG.colors.text + ';font-family:monospace;font-size:15.5px;}',
    '#bt-kpi-servicos .sv-state{color:' + CFG.colors.mute + ';font-size:12.5px;text-transform:uppercase;}',
    '#bt-kpi-servicos .sv-empty{color:' + CFG.colors.mute + ';font-size:14px;font-style:italic;}',

    // Identidade de negócio (tags servico/departamento/camada/ambiente) — mostrada
    // sempre que existir, mesmo sem serviços Windows explícitos (que dependem de
    // um template de discovery só aplicado a algumas VMs).
    '#bt-kpi-servicos .sv-identity{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid ' + CFG.colors.border + ';}',
    '#bt-kpi-servicos .sv-id-item{display:flex;flex-direction:column;gap:2px;}',
    '#bt-kpi-servicos .sv-id-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + CFG.colors.mute + ';}',
    '#bt-kpi-servicos .sv-id-val{font-size:15.5px;color:' + CFG.colors.text + ';font-weight:600;}',

    '</style>',
  ].join('');


  // ────────────────────────────────────────────────────────────
  // [4] FETCH
  // ────────────────────────────────────────────────────────────

  function zbx(method, params) {
    var body = { jsonrpc: '2.0', id: 1, method: method, params: params };
    return fetchWithRetry(PROXY, body, undefined)
    .then(function (j) {
      if (j.error) throw new Error(j.error.data || j.error.message);
      return j.result;
    });
  }

  function fetchAll(hostName) {
    return zbx('host.get', {
      output: ['hostid', 'host'],
      filter: { host: [hostName] },
      selectTags: ['tag', 'value'],
    })
    .then(function (hosts) {
      if (!hosts || hosts.length === 0)
        throw new Error('Host não encontrado: ' + hostName);

      var host = hosts[0];
      return zbx('item.get', {
        hostids: [host.hostid],
        output: ['name', 'lastvalue', 'key_'],
        search: { name: 'service is running' },
        monitored: true,
        limit: CFG.apiLimits.items,
      }).then(function (items) {
        return { tags: host.tags || [], items: items };
      });
    });
  }


  // ────────────────────────────────────────────────────────────
  // [5] COMPUTE
  // ────────────────────────────────────────────────────────────

  function compute(items) {
    return items.map(function (it) {
      return {
        name:    U.extractServiceLabel(it.name),
        running: it.lastvalue === '1',
      };
    });
  }


  // ────────────────────────────────────────────────────────────
  // [6] RENDER
  // ────────────────────────────────────────────────────────────

  function renderRow(s) {
    var col = s.running ? CFG.colors.ok : CFG.colors.crit;
    return '<div class="sv-row">'
      + '<span class="sv-dot" style="background:' + col + ';"></span>'
      + '<span class="sv-name">' + U.esc(s.name) + '</span>'
      + '<span class="sv-state">' + (s.running ? 'activo' : 'parado') + '</span>'
      + '</div>';
  }

  // Identidade de negócio — tags servico/departamento/camada/ambiente, quando existirem.
  function renderIdentity(tags) {
    var wanted = [
      ['servico', 'Serviço'],
      ['departamento', 'Departamento'],
      ['camada', 'Camada'],
      ['ambiente', 'Ambiente'],
    ];
    var parts = [];
    for (var i = 0; i < wanted.length; i++) {
      var v = U.tagVal(tags, wanted[i][0]);
      if (v) {
        parts.push('<span class="sv-id-item"><span class="sv-id-label">' + U.esc(wanted[i][1])
          + '</span><span class="sv-id-val">' + U.esc(v) + '</span></span>');
      }
    }
    return parts.length ? '<div class="sv-identity">' + parts.join('') + '</div>' : '';
  }

  function render(data) {
    var services = data.services;
    var identity = renderIdentity(data.tags);
    var body = services.length
      ? '<div class="sv-list">' + services.map(renderRow).join('') + '</div>'
      : '<div class="sv-empty">Sem serviços Windows monitorizados explicitamente neste host.</div>';

    return CSS + '<div class="sv-wrap">'
      + identity
      + '<div class="sv-title">Serviços</div>'
      + body
      + '</div>';
  }


  // ────────────────────────────────────────────────────────────
  // [7] BOOTSTRAP
  // Lê var-hostid do URL — funciona porque a query dumb força
  // o BT a re-executar este JS cada vez que a variável muda.
  // ────────────────────────────────────────────────────────────

  // Double-fire guard: aborta o fetch anterior e marca este como o corrente
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
    root.innerHTML = '<span style="color:' + CFG.colors.mute
      + ';font-family:monospace;font-size:15.5px;">'
      + 'Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.mute
    + ';font-family:monospace;font-size:15.5px;">A carregar...</span>';

  fetchAll(hostName)
    .then(function (result) {
      if (!_isCurrent()) return;
      root.innerHTML = render({ services: compute(result.items), tags: result.tags });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      console.error('[BPC servicos]', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que o host existe no Zabbix e que o proxy Grafana responde.');
    });

})();
