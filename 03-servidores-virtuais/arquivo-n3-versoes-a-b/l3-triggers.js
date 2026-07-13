(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · ROW 4 · TRIGGERS  v1.1                                ║
  // ║  Autor: BPC                                                              ║
  // ║                                                                          ║
  // ║  CHANGELOG v1.1:                                                         ║
  // ║    [FIX 1] lastval=0 sem unidades suprimido (agent.ping, disponib.)     ║
  // ║    [FIX 2] texto duplicado na linha inferior eliminado                  ║
  // ║    [FIX 3] lastEvent.name usado como nome principal (mais informativo)  ║
  // ║    [DBG]   logs de debug detalhados mantidos para diagnóstico           ║
  // ║                                                                          ║
  // ║  LAYOUT:                                                                 ║
  // ║  ┌──────────────────────────────────────────────────────────────────┐   ║
  // ║  │  Cabeçalho: contadores por severidade  [DISASTER][HIGH][WARN]…  │   ║
  // ║  ├──────────────────────────────────────────────────────────────────┤   ║
  // ║  │  PROBLEMAS ACTIVOS                                               │   ║
  // ║  │  [SEV] Trigger name            last val   duração   [PROBLEM]   │   ║
  // ║  │        descrição / url                                           │   ║
  // ║  ├──────────────────────────────────────────────────────────────────┤   ║
  // ║  │  RESOLVIDOS RECENTES (últimas 6h)                                │   ║
  // ║  │  [SEV] Trigger name            last val   duração   [OK]        │   ║
  // ║  └──────────────────────────────────────────────────────────────────┘   ║
  // ║                                                                          ║
  // ║  API Zabbix:                                                             ║
  // ║    trigger.get  → problemas activos                                      ║
  // ║    trigger.get  → histórico recente (lastChangeSince + value=0)         ║
  // ║                                                                          ║
  // ║  HTML root: <div id="bt-kpi-triggers"></div>                            ║
  // ╚══════════════════════════════════════════════════════════════════════════╝


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 1 · CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  var CFG = {

    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId: 'bt-kpi-triggers',

    // Janela para problemas recentes resolvidos
    recentWindowSecs: 21600,   // 6 horas

    // Máximo de triggers a mostrar por secção
    maxActive:   50,
    maxRecent:   30,

    // Limites de resultados das chamadas API
    apiLimits: { triggers: 20000 },

    // Retry com backoff exponencial (sem circuit breaker do BPC Runtime)
    retry: { maxAttempts: 3, baseDelayMs: 1000 },

    // Debug: true = imprime detalhes no console
    debug: false,

    // Severidades Zabbix (0-5)
    severities: {
      0: { label: 'NOT CLASSIFIED', short: 'N/C',      color: '#6E7681', bg: 'rgba(110,118,129,.15)', border: 'rgba(110,118,129,.3)'  },
      1: { label: 'INFORMATION',    short: 'INFO',      color: '#58A6FF', bg: 'rgba(88,166,255,.12)',  border: 'rgba(88,166,255,.3)'   },
      2: { label: 'WARNING',        short: 'WARN',      color: '#D29922', bg: 'rgba(210,153,34,.15)',  border: 'rgba(210,153,34,.35)'  },
      3: { label: 'AVERAGE',        short: 'AVG',       color: '#E8A020', bg: 'rgba(232,160,32,.15)',  border: 'rgba(232,160,32,.35)'  },
      4: { label: 'HIGH',           short: 'HIGH',      color: '#F85149', bg: 'rgba(248,81,73,.15)',   border: 'rgba(248,81,73,.35)'   },
      5: { label: 'DISASTER',       short: 'DISASTER',  color: '#FF0000', bg: 'rgba(255,0,0,.18)',     border: 'rgba(255,0,0,.45)'     },
    },

    colors: {
      ok:   '#3FB950',
      crit: '#F85149',
      warn: '#D29922',
      info: '#58A6FF',
      sub:  '#6E7681',
      text: '#CDD9E5',
      brd:  '#1C2128',
      mute: '#2D333B',
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 2 · UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  // PROXY construído a partir do CFG — nunca hardcoded
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
    var maxAttempts = CFG.retry ? CFG.retry.maxAttempts : 3;
    var baseDelayMs = CFG.retry ? CFG.retry.baseDelayMs : 1000;

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

  var U = {

    esc: function (s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    // Card de erro explícito (causa + acção correctiva)
    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:\'IBM Plex Mono\',monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">⚠ ERRO · TRIGGERS</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },

    // Duração legível desde um unix timestamp
    duration: function (since) {
      var secs = Math.floor(Date.now() / 1000) - parseInt(since || 0, 10);
      if (secs < 0) secs = 0;
      if (secs < 60)   return secs + 's';
      if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
      var h = Math.floor(secs / 3600);
      var m = Math.floor((secs % 3600) / 60);
      if (h < 24) return h + 'h ' + m + 'm';
      var d = Math.floor(h / 24);
      return d + 'd ' + (h % 24) + 'h';
    },

    // Data/hora legível
    fmtTime: function (ts) {
      if (!ts) return '—';
      var d = new Date(parseInt(ts, 10) * 1000);
      var pad = function (n) { return n < 10 ? '0' + n : n; };
      return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' '
           + pad(d.getHours()) + ':' + pad(d.getMinutes());
    },

    sev: function (s) {
      return CFG.severities[parseInt(s, 10)] || CFG.severities[0];
    },

    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },

    // Trunca string longa
    trunc: function (s, max) {
      s = String(s || '');
      return s.length > max ? s.slice(0, max) + '…' : s;
    },

    // Log de debug condicional
    dbg: function () {
      if (!CFG.debug) return;
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, args);
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 3 · CSS
  // Prefixo .kt- (kpi-triggers)
  // ════════════════════════════════════════════════════════════════════════════

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',

      // Reset & base
      '#bt-kpi-triggers *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-kpi-triggers{font-family:\'IBM Plex Mono\',\'Segoe UI\',monospace;height:100%;}',

      // Raiz: coluna única full-width
      '#bt-kpi-triggers .kt-root{display:flex;flex-direction:column;gap:8px;height:100%;}',

      // Card base
      '#bt-kpi-triggers .kt-card{background:rgba(255,255,255,0.015);border:1px solid '+C.brd+';border-radius:6px;padding:10px 13px 9px;position:relative;overflow:hidden;display:flex;flex-direction:column;}',

      // ── Cabeçalho do painel ───────────────────────────────────────────────
      '#bt-kpi-triggers .kt-panel-head{display:flex;justify-content:space-between;align-items:center;flex-shrink:0;margin-bottom:10px;}',
      '#bt-kpi-triggers .kt-panel-title{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:'+C.sub+';}',

      // Contadores de severidade no cabeçalho
      '#bt-kpi-triggers .kt-sev-counters{display:flex;gap:5px;align-items:center;flex-wrap:wrap;}',
      '#bt-kpi-triggers .kt-sev-pill{font-size:9px;font-weight:700;letter-spacing:.05em;padding:2px 7px;border-radius:3px;white-space:nowrap;}',

      // ── Secções (activos / resolvidos) ────────────────────────────────────
      '#bt-kpi-triggers .kt-section{flex-shrink:0;}',
      '#bt-kpi-triggers .kt-section-title{font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:'+C.sub+';margin-bottom:6px;display:flex;align-items:center;gap:6px;}',
      '#bt-kpi-triggers .kt-section-count{font-size:9px;font-weight:700;color:'+C.sub+';background:rgba(255,255,255,.06);border-radius:3px;padding:1px 5px;}',
      '#bt-kpi-triggers .kt-sep{height:1px;background:rgba(255,255,255,0.06);margin:8px 0;}',

      // ── Linha de trigger ──────────────────────────────────────────────────
      '#bt-kpi-triggers .kt-list{display:flex;flex-direction:column;gap:4px;}',

      '#bt-kpi-triggers .kt-row{display:flex;flex-direction:column;gap:3px;padding:7px 9px 7px;border-radius:5px;border-left:3px solid transparent;}',
      '#bt-kpi-triggers .kt-row.active{background:rgba(255,255,255,.03);}',
      '#bt-kpi-triggers .kt-row.resolved{background:rgba(255,255,255,.015);opacity:.75;}',

      // Linha superior: sev badge + nome + valor + duração + estado
      '#bt-kpi-triggers .kt-row-top{display:flex;align-items:center;gap:7px;}',
      '#bt-kpi-triggers .kt-sev-badge{font-size:8px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:3px;white-space:nowrap;flex-shrink:0;}',
      '#bt-kpi-triggers .kt-name{font-size:11px;font-weight:600;color:'+C.text+';flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#bt-kpi-triggers .kt-lastval{font-size:10px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+C.text+';white-space:nowrap;flex-shrink:0;}',
      '#bt-kpi-triggers .kt-duration{font-size:9px;color:'+C.sub+';white-space:nowrap;flex-shrink:0;min-width:52px;text-align:right;}',
      '#bt-kpi-triggers .kt-state-badge{font-size:8.5px;font-weight:700;letter-spacing:.05em;padding:2px 7px;border-radius:3px;white-space:nowrap;flex-shrink:0;}',
      '#bt-kpi-triggers .kt-state-badge.problem{border:1px solid rgba(248,81,73,.4);background:rgba(248,81,73,.15);color:'+C.crit+';}',
      '#bt-kpi-triggers .kt-state-badge.ok     {border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.12);color:'+C.ok+';}',

      // Linha inferior: descrição + timestamp + url
      '#bt-kpi-triggers .kt-row-bottom{display:flex;align-items:baseline;gap:8px;padding-left:2px;}',
      '#bt-kpi-triggers .kt-desc{font-size:9px;color:'+C.sub+';flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#bt-kpi-triggers .kt-time{font-size:8.5px;color:'+C.sub+';white-space:nowrap;flex-shrink:0;opacity:.7;}',
      '#bt-kpi-triggers .kt-url{font-size:8.5px;color:'+C.info+';text-decoration:none;white-space:nowrap;flex-shrink:0;}',
      '#bt-kpi-triggers .kt-url:hover{text-decoration:underline;}',

      // Vazio
      '#bt-kpi-triggers .kt-empty{font-size:10px;color:'+C.sub+';padding:10px 4px;text-align:center;}',

      // Pulso crítico
      '@keyframes kt-pulse{0%,100%{opacity:1;}50%{opacity:.45;}}',
      '#bt-kpi-triggers .kt-pulse{animation:kt-pulse 1.8s ease-in-out infinite;}',

      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 4 · CARD HTML
  // ════════════════════════════════════════════════════════════════════════════

  var Card = {

    render: function (active, recent) {
      // Contadores por severidade (só activos)
      var counts = {};
      active.forEach(function (t) {
        var s = parseInt(t.priority, 10);
        counts[s] = (counts[s] || 0) + 1;
      });

      var pillsHtml = '';
      // Mostra pills de severidade da mais alta para a mais baixa
      [5, 4, 3, 2, 1, 0].forEach(function (s) {
        if (!counts[s]) return;
        var sv = CFG.severities[s];
        pillsHtml += '<span class="kt-sev-pill" style="background:' + sv.bg + ';border:1px solid '
          + sv.border + ';color:' + sv.color + ';">'
          + U.esc(sv.short) + ' ' + counts[s]
          + '</span>';
      });
      if (!pillsHtml) {
        pillsHtml = '<span style="font-size:9px;color:' + CFG.colors.ok + ';">✓ SEM PROBLEMAS ACTIVOS</span>';
      }

      var activeHtml  = Card._list(active, 'active');
      var recentHtml  = Card._list(recent, 'resolved');

      return '<div class="kt-root">'
        + '<div class="kt-card">'

        // Cabeçalho do painel
        + '<div class="kt-panel-head">'
          + '<span class="kt-panel-title">TRIGGERS · ALERTAS DO HOST</span>'
          + '<div class="kt-sev-counters">' + pillsHtml + '</div>'
        + '</div>'

        // Secção activos
        + '<div class="kt-section">'
          + '<div class="kt-section-title">'
            + 'PROBLEMAS ACTIVOS'
            + '<span class="kt-section-count">' + active.length + '</span>'
          + '</div>'
          + '<div class="kt-list">'
            + (active.length ? activeHtml : '<div class="kt-empty">Nenhum problema activo.</div>')
          + '</div>'
        + '</div>'

        + '<div class="kt-sep"></div>'

        // Secção recentes resolvidos
        + '<div class="kt-section">'
          + '<div class="kt-section-title">'
            + 'RESOLVIDOS RECENTES · ÚLTIMAS 6H'
            + '<span class="kt-section-count">' + recent.length + '</span>'
          + '</div>'
          + '<div class="kt-list">'
            + (recent.length ? recentHtml : '<div class="kt-empty">Nenhum evento resolvido nas últimas 6h.</div>')
          + '</div>'
        + '</div>'

        + '</div>'
        + '</div>';
    },

    _list: function (triggers, type) {
      return triggers.map(function (t) {
        return Card._row(t, type);
      }).join('');
    },

    _row: function (t, type) {
      var sv      = U.sev(t.priority);
      var isActive = type === 'active';

      // Timestamp relevante e duração
      var since   = t.lastEvent ? (t.lastEvent.clock || t.lastchange) : t.lastchange;
      var dur     = U.duration(since);
      var timeStr = U.fmtTime(since);

      // ── [FIX 1] lastval: suprime 0 sem unidades (agent.ping, disponib.) ──
      var lastVal = '';
      if (t.items && t.items.length) {
        var item = t.items[0];
        var lv   = String(item.lastvalue !== undefined ? item.lastvalue : '');
        var num  = parseFloat(lv);

        // Valor 0 sem unidades = sem semântica útil (ping, disponibilidade)
        var isMeaningless = (lv === '0' || lv === '') && !item.units;

        if (!isMeaningless && lv !== '') {
          if (!isNaN(num)) {
            lastVal = num % 1 === 0 ? String(Math.round(num)) : num.toFixed(2);
            if (item.units) lastVal += ' ' + item.units;
          } else {
            lastVal = lv;
          }
        }

        U.dbg('[TRIGGERS v1.1][lastval] trigger:', t.description,
              '| item:', item.name,
              '| lv:', lv,
              '| units:', item.units || '(none)',
              '| isMeaningless:', isMeaningless,
              '| lastVal final:', lastVal || '(suprimido)');
      }

      // ── [FIX 3] Nome principal: lastEvent.name se disponível ─────────────
      var displayName = (t.lastEvent && t.lastEvent.name)
        ? t.lastEvent.name
        : t.description;

      U.dbg('[TRIGGERS v1.1][name] description:', t.description,
            '| lastEvent.name:', (t.lastEvent && t.lastEvent.name) || '(n/a)',
            '| displayName:', displayName);

      // ── [FIX 2] desc: só mostra se comments ≠ description ────────────────
      var rawDesc    = String(t.comments || '').trim();
      var rawDescRef = String(t.description || '').trim();
      var desc       = (rawDesc && rawDesc !== rawDescRef) ? rawDesc : '';

      U.dbg('[TRIGGERS v1.1][desc] description:', rawDescRef,
            '| comments:', rawDesc || '(vazio)',
            '| desc final:', desc || '(suprimido — igual ou vazio)');

      // URL
      var urlHtml = '';
      if (t.url && t.url.trim()) {
        urlHtml = '<a class="kt-url" href="' + U.esc(t.url) + '" target="_blank">↗ link</a>';
      }

      // Pulse para disaster/high activos
      var pulse = isActive && (parseInt(t.priority, 10) >= 4) ? ' kt-pulse' : '';

      // Estado
      var stateCls  = isActive ? 'problem' : 'ok';
      var stateText = isActive ? 'PROBLEM' : 'OK';

      return '<div class="kt-row ' + type + '" style="border-left-color:' + sv.color + ';background:' + sv.bg + '08;">'

        // Linha superior
        + '<div class="kt-row-top">'
          + '<span class="kt-sev-badge' + pulse + '" style="background:' + sv.bg + ';border:1px solid ' + sv.border + ';color:' + sv.color + ';">'
            + U.esc(sv.short)
          + '</span>'
          + '<span class="kt-name" title="' + U.esc(displayName) + '">' + U.esc(U.trunc(displayName, 80)) + '</span>'
          + (lastVal ? '<span class="kt-lastval">' + U.esc(lastVal) + '</span>' : '')
          + '<span class="kt-duration">' + U.esc(dur) + '</span>'
          + '<span class="kt-state-badge ' + stateCls + '">' + stateText + '</span>'
        + '</div>'

        // Linha inferior (só se houver conteúdo)
        + (desc || timeStr || urlHtml
          ? '<div class="kt-row-bottom">'
              + (desc ? '<span class="kt-desc" title="' + U.esc(desc) + '">' + U.esc(U.trunc(desc, 100)) + '</span>' : '')
              + '<span class="kt-time">' + U.esc(timeStr) + '</span>'
              + urlHtml
            + '</div>'
          : '')

        + '</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 5 · API ZABBIX
  // ════════════════════════════════════════════════════════════════════════════

  var ZbxApi = {

    call: function (method, params) {
      U.dbg('[TRIGGERS v1.1][API] →', method, params);
      var body = { jsonrpc: '2.0', id: 1, method: method, params: params };
      return fetchWithRetry(PROXY, body, undefined)
        .then(function (j) {
          if (j.error) throw new Error(j.error.data || j.error.message);
          U.dbg('[TRIGGERS v1.1][API] ←', method, '| resultados:', Array.isArray(j.result) ? j.result.length : j.result);
          return j.result;
        });
    },

    getHostId: function (hostName) {
      return ZbxApi.call('host.get', {
        output: ['hostid'],
        filter: { host: [hostName] },
      }).then(function (hosts) {
        if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
        U.dbg('[TRIGGERS v1.1] hostid resolvido:', hosts[0].hostid, 'para host:', hostName);
        return hosts[0].hostid;
      });
    },

    // Triggers activos do host
    getActiveTriggers: function (hostid) {
      return ZbxApi.call('trigger.get', {
        hostids:         [hostid],
        output:          ['triggerid', 'description', 'priority', 'lastchange',
                          'value', 'comments', 'url', 'status'],
        selectLastEvent: ['clock', 'name', 'value', 'eventid'],
        selectItems:     ['itemid', 'name', 'lastvalue', 'units'],
        only_true:       true,
        monitored:       true,
        active:          true,
        skipDependent:   true,
        sortfield:       'priority',
        sortorder:       'DESC',
        limit:           CFG.maxActive,
      });
    },

    // Triggers recentemente resolvidos (últimas 6h)
    getRecentResolved: function (hostid) {
      var timeFrom = Math.floor(Date.now() / 1000) - CFG.recentWindowSecs;
      U.dbg('[TRIGGERS v1.1] getRecentResolved: timeFrom=', timeFrom, U.fmtTime ? '' : '', new Date(timeFrom * 1000).toISOString());
      return ZbxApi.call('trigger.get', {
        hostids:         [hostid],
        output:          ['triggerid', 'description', 'priority', 'lastchange',
                          'value', 'comments', 'url', 'status'],
        selectLastEvent: ['clock', 'name', 'value', 'eventid'],
        selectItems:     ['itemid', 'name', 'lastvalue', 'units'],
        monitored:       true,
        active:          true,
        skipDependent:   true,
        lastChangeSince: timeFrom,
        filter:          { value: 0 },
        sortfield:       'lastchange',
        sortorder:       'DESC',
        limit:           CFG.maxRecent,
      });
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 6 · BOOTSTRAP
  // ════════════════════════════════════════════════════════════════════════════

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

  U.dbg('[TRIGGERS v1.1] hostRaw:', hostRaw, '→', hostName);

  if (!hostName) {
    root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">A carregar triggers…</span>';

  ZbxApi.getHostId(hostName)
    .then(function (hostid) {

      return Promise.all([
        ZbxApi.getActiveTriggers(hostid),
        ZbxApi.getRecentResolved(hostid),
      ]);
    })
    .then(function (results) {
      if (!_isCurrent()) return;
      var active = results[0] || [];
      var recent = results[1] || [];

      U.dbg('[TRIGGERS v1.1] activos:', active.length, '| resolvidos recentes:', recent.length);
      U.dbg('[TRIGGERS v1.1][activos]',   active);
      U.dbg('[TRIGGERS v1.1][recentes]',  recent);

      root.innerHTML = CSS + Card.render(active, recent);
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      console.error('[TRIGGERS v1.1] Erro:', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que o host existe no Zabbix e que o proxy Grafana responde.');
    });

})();