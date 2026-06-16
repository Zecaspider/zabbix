(function () {

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ════════════════════════════════════════════════════════════
  // D5-Detalhe-VM · SERVIÇOS  v1.0
  // Business Text — ES5, sem dependências externas
  //<div id="bt-kpi-servicos"></div>
  // Reactividade: query dumb força re-render do BT quando a
  // variável Grafana muda. O JS lê var-hostid do URL em cada
  // execução — sem eventos, sem polling, sem listeners.
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
      text: '#E6EDF3',
      sub:  '#8B949E',
      border:'rgba(255,255,255,.07)',
    },
  };

  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    var maxAttempts = CFG.retry.maxAttempts;
    var baseDelayMs = CFG.retry.baseDelayMs;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
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
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; SERVIÇOS</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
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
    '  font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;',
    '  color:' + CFG.colors.mute + ';margin-bottom:8px;',
    '}',

    '#bt-kpi-servicos .sv-list{display:flex;flex-wrap:wrap;gap:8px;}',

    '#bt-kpi-servicos .sv-row{',
    '  display:flex;align-items:center;gap:7px;padding:5px 12px;',
    '  background:rgba(255,255,255,.02);border:1px solid ' + CFG.colors.border + ';border-radius:5px;',
    '}',

    '#bt-kpi-servicos .sv-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}',
    '#bt-kpi-servicos .sv-name{color:' + CFG.colors.text + ';font-family:monospace;font-size:11px;}',
    '#bt-kpi-servicos .sv-state{color:' + CFG.colors.mute + ';font-size:9px;text-transform:uppercase;}',
    '#bt-kpi-servicos .sv-empty{color:' + CFG.colors.mute + ';font-size:10px;font-style:italic;}',

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
    })
    .then(function (hosts) {
      if (!hosts || hosts.length === 0)
        throw new Error('Host não encontrado: ' + hostName);

      return zbx('item.get', {
        hostids: [hosts[0].hostid],
        output: ['name', 'lastvalue', 'key_'],
        search: { name: 'service is running' },
        monitored: true,
        limit: CFG.apiLimits.items,
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

  function render(services) {
    var body = services.length
      ? '<div class="sv-list">' + services.map(renderRow).join('') + '</div>'
      : '<div class="sv-empty">Sem serviços monitorizados explicitamente neste host.</div>';

    return CSS + '<div class="sv-wrap">'
      + '<div class="sv-title">Serviços</div>'
      + body
      + '</div>';
  }


  // ────────────────────────────────────────────────────────────
  // [7] BOOTSTRAP
  // Lê var-hostid do URL — funciona porque a query dumb força
  // o BT a re-executar este JS cada vez que a variável muda.
  // ────────────────────────────────────────────────────────────

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  if (!hostName) {
    root.innerHTML = '<span style="color:' + CFG.colors.mute
      + ';font-family:monospace;font-size:11px;">'
      + 'Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.mute
    + ';font-family:monospace;font-size:11px;">A carregar...</span>';

  fetchAll(hostName)
    .then(function (items) {
      root.innerHTML = render(compute(items));
    })
    .catch(function (e) {
      console.error('[BPC servicos]', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que o host existe no Zabbix e que o proxy Grafana responde.');
    });

})();
