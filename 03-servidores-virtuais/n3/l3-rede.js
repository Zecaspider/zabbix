(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · REDE  v1.0                                            ║
  // ║  Autor: BPC                                                              ║
  // ║                                                                          ║
  // ║  FONTES (fallback em cascata):                                           ║
  // ║    1. Agente Windows  → net.if.in/out + erros + drops + speed + status  ║
  // ║    2. Agente Linux    → net.if.in/out (mesmo padrão de key)             ║
  // ║    3. ICMP            → ping + RTT + loss + jitter + avail 1h/24h/7d/30d║
  // ║    4. Sem dados       → mensagem                                         ║
  // ║                                                                          ║
  // ║  SPARKLINES: history.get real (60 pontos, history type por value_type)  ║
  // ║  POLLING: item.get a cada 30s → append ao buffer local                  ║
  // ║                                                                          ║
  // ║  HTML root: <div id="bt-kpi-rede"></div>                                ║
  // ╚══════════════════════════════════════════════════════════════════════════╝


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 1 · CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  var CFG = {
    grafanaUrl:     'http://10.10.126.22:3000',
    datasourceUid:  '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId:         'bt-kpi-rede',
    pollInterval:   30000,   // ms entre polls de lastvalue
    sparkPoints:    60,      // pontos históricos iniciais
    sparkMaxBuffer: 120,     // máximo de pontos no buffer local
    maxAgeSec:      300,     // item considerado stale se age > 5min
    abortDelayMs:   80,      // absorve o double-fire do Business Text v6.x
    debug:          false,
    apiLimits:      { items: 50000, history: 10000, triggers: 20000 },
    retry:          { maxAttempts: 3, baseDelayMs: 1000 },

    colors: {
      rx:     '#3FB950',   // verde — recebido
      tx:     '#58A6FF',   // azul  — enviado
      ok:     '#3FB950',
      warn:   '#D29922',
      crit:   '#F85149',
      info:   '#58A6FF',
      sub:    '#6E7681',
      text:   '#CDD9E5',
      brd:    '#1C2128',
      mute:   '#2D333B',
      bg:     'rgba(255,255,255,0.015)',
    },
  };

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 2 · UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  // PROXY construído a partir do CFG — nunca hardcoded
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    var maxAttempts = CFG.retry ? CFG.retry.maxAttempts : 3;
    var baseDelayMs = CFG.retry ? CFG.retry.baseDelayMs : 1000;

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

  var U = {

    esc: function (s) {
      return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    dbg: function () {
      if (!CFG.debug) return;
      console.log.apply(console, Array.prototype.slice.call(arguments));
    },

    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },

    // Formata bytes/bits para escala humana
    fmtBps: function (bps) {
      bps = parseFloat(bps) || 0;
      if (bps >= 1e9)  return (bps / 1e9).toFixed(2) + ' Gbps';
      if (bps >= 1e6)  return (bps / 1e6).toFixed(2) + ' Mbps';
      if (bps >= 1e3)  return (bps / 1e3).toFixed(1) + ' Kbps';
      return Math.round(bps) + ' bps';
    },

    fmtMs: function (s) {
      var ms = parseFloat(s) * 1000;
      if (isNaN(ms)) return '—';
      return ms.toFixed(2) + ' ms';
    },

    fmtPct: function (v) {
      var n = parseFloat(v);
      if (isNaN(n)) return '—';
      return n.toFixed(1) + '%';
    },

    pad: function (n) { return n < 10 ? '0' + n : n; },

    fmtTime: function (ts) {
      if (!ts) return '—';
      var d = new Date(parseInt(ts, 10) * 1000);
      return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) + ':' + U.pad(d.getSeconds());
    },

    // Gera SVG sparkline a partir de array de valores numéricos
    sparkline: function (data, color, width, height) {
      width  = width  || 120;
      height = height || 28;
      if (!data || data.length < 2) {
        return '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">'
          + '<line x1="0" y1="' + (height/2) + '" x2="' + width + '" y2="' + (height/2) + '" stroke="' + CFG.colors.mute + '" stroke-width="1" stroke-dasharray="3,3"/>'
          + '</svg>';
      }

      var vals = data.map(function (v) { return parseFloat(v) || 0; });
      var min  = Math.min.apply(null, vals);
      var max  = Math.max.apply(null, vals);
      var range = max - min || 1;
      var pad   = 2;

      var pts = vals.map(function (v, i) {
        var x = pad + (i / (vals.length - 1)) * (width - pad * 2);
        var y = height - pad - ((v - min) / range) * (height - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });

      // Área preenchida
      var areaFirst = pad + ',0 ' + pad + ',' + (height - pad);
      var areaLast  = (width - pad).toFixed(1) + ',' + (height - pad);
      var areaPath  = areaFirst + ' ' + pts.join(' ') + ' ' + areaLast;

      // Cor com alpha para área
      var fillColor = color.replace(')', ', 0.12)').replace('rgb(', 'rgba(');
      // Se já é hex, usa diretamente com opacidade baixa
      var fillOpacity = '0.12';

      return '<svg width="' + width + '" height="' + height
        + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none">'
        + '<defs>'
        + '<linearGradient id="sg-' + color.replace(/[^a-z0-9]/gi,'') + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.3"/>'
        + '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>'
        + '</linearGradient>'
        + '</defs>'
        + '<polygon points="' + areaPath + '" fill="url(#sg-' + color.replace(/[^a-z0-9]/gi,'') + ')"/>'
        + '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'
        + '<circle cx="' + pts[pts.length-1].split(',')[0] + '" cy="' + pts[pts.length-1].split(',')[1] + '" r="2.5" fill="' + color + '"/>'
        + '</svg>';
    },

    // Card de erro explícito (causa + acção correctiva)
    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:\'IBM Plex Mono\',monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">⚠ ERRO · REDE</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },

    // Barras de disponibilidade coloridas
    availBar: function (pct) {
      var n   = parseFloat(pct) || 0;
      var col = n >= 99.9 ? CFG.colors.ok : n >= 95 ? CFG.colors.warn : CFG.colors.crit;
      var lbl = n >= 99.9 ? '✓' : n >= 95 ? '~' : '✗';
      return { color: col, label: lbl, pct: n.toFixed(1) + '%' };
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 3 · CSS
  // ════════════════════════════════════════════════════════════════════════════

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',
      '#bt-kpi-rede *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-kpi-rede{font-family:\'IBM Plex Mono\',\'Segoe UI\',monospace;height:100%;width:100%;}',

      // Root
      '#bt-kpi-rede .nr-root{display:flex;flex-direction:column;gap:0;height:100%;}',

      // Card
      '#bt-kpi-rede .nr-card{background:' + C.bg + ';border:1px solid ' + C.brd + ';border-radius:6px;padding:10px 13px 9px;display:flex;flex-direction:column;gap:8px;height:100%;}',

      // Header
      '#bt-kpi-rede .nr-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-shrink:0;}',
      '#bt-kpi-rede .nr-title-block{display:flex;flex-direction:column;gap:3px;}',
      '#bt-kpi-rede .nr-panel-title{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:' + C.sub + ';}',
      '#bt-kpi-rede .nr-iface-name{font-size:10px;font-weight:600;color:' + C.text + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;}',
      '#bt-kpi-rede .nr-iface-meta{font-size:8.5px;color:' + C.sub + ';}',
      '#bt-kpi-rede .nr-badges{display:flex;gap:4px;align-items:center;flex-shrink:0;}',
      '#bt-kpi-rede .nr-badge{font-size:8px;font-weight:700;letter-spacing:.08em;padding:2px 7px;border-radius:3px;white-space:nowrap;}',
      '#bt-kpi-rede .nr-badge.agent{background:rgba(63,185,80,.15);border:1px solid rgba(63,185,80,.35);color:' + C.ok + ';}',
      '#bt-kpi-rede .nr-badge.icmp{background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.3);color:' + C.info + ';}',
      '#bt-kpi-rede .nr-badge.nodata{background:rgba(110,118,129,.12);border:1px solid rgba(110,118,129,.25);color:' + C.sub + ';}',
      '#bt-kpi-rede .nr-badge.status-ok{background:rgba(63,185,80,.12);border:1px solid rgba(63,185,80,.3);color:' + C.ok + ';}',
      '#bt-kpi-rede .nr-badge.status-err{background:rgba(248,81,73,.15);border:1px solid rgba(248,81,73,.4);color:' + C.crit + ';}',

      // Separator
      '#bt-kpi-rede .nr-sep{height:1px;background:rgba(255,255,255,0.05);flex-shrink:0;}',

      // Section title
      '#bt-kpi-rede .nr-section-title{font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:' + C.sub + ';margin-bottom:6px;}',

      // Throughput block
      '#bt-kpi-rede .nr-throughput{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex-shrink:0;}',
      '#bt-kpi-rede .nr-thr-card{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:5px;padding:7px 9px 5px;}',
      '#bt-kpi-rede .nr-thr-label{font-size:8px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;}',
      '#bt-kpi-rede .nr-thr-val{font-size:16px;font-weight:700;letter-spacing:-.02em;line-height:1;margin-bottom:5px;}',
      '#bt-kpi-rede .nr-thr-val.rx{color:' + C.rx + ';}',
      '#bt-kpi-rede .nr-thr-val.tx{color:' + C.tx + ';}',
      '#bt-kpi-rede .nr-thr-spark{width:100%;overflow:hidden;}',
      '#bt-kpi-rede .nr-thr-spark svg{width:100%;height:28px;display:block;}',

      // Erros & drops
      '#bt-kpi-rede .nr-erros{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex-shrink:0;}',
      '#bt-kpi-rede .nr-err-cell{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:4px;padding:5px 7px;}',
      '#bt-kpi-rede .nr-err-label{font-size:7.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + C.sub + ';margin-bottom:3px;}',
      '#bt-kpi-rede .nr-err-val{font-size:13px;font-weight:700;}',
      '#bt-kpi-rede .nr-err-val.zero{color:' + C.ok + ';}',
      '#bt-kpi-rede .nr-err-val.nonzero{color:' + C.crit + ';}',

      // ICMP block
      '#bt-kpi-rede .nr-icmp{display:grid;grid-template-columns:1fr 1fr;gap:8px;flex-shrink:0;}',
      '#bt-kpi-rede .nr-icmp-left{display:flex;flex-direction:column;gap:5px;}',
      '#bt-kpi-rede .nr-icmp-right{display:flex;flex-direction:column;gap:4px;}',

      '#bt-kpi-rede .nr-icmp-stat{display:flex;align-items:baseline;justify-content:space-between;gap:8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:4px;padding:5px 8px;}',
      '#bt-kpi-rede .nr-icmp-stat-label{font-size:8px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + C.sub + ';}',
      '#bt-kpi-rede .nr-icmp-stat-val{font-size:13px;font-weight:700;color:' + C.text + ';}',

      '#bt-kpi-rede .nr-icmp-spark-wrap{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:4px;padding:6px 8px 5px;}',
      '#bt-kpi-rede .nr-icmp-spark-label{font-size:7.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + C.sub + ';margin-bottom:3px;}',
      '#bt-kpi-rede .nr-icmp-spark svg{width:100%;height:24px;display:block;}',

      // Disponibilidade
      '#bt-kpi-rede .nr-avail{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;flex-shrink:0;}',
      '#bt-kpi-rede .nr-avail-cell{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:4px;padding:5px 7px;text-align:center;}',
      '#bt-kpi-rede .nr-avail-period{font-size:7.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + C.sub + ';margin-bottom:3px;}',
      '#bt-kpi-rede .nr-avail-pct{font-size:13px;font-weight:700;}',
      '#bt-kpi-rede .nr-avail-lbl{font-size:8px;font-weight:700;}',

      // Mensagem sem dados
      '#bt-kpi-rede .nr-nodata{font-size:10px;color:' + C.sub + ';padding:20px 4px;text-align:center;flex:1;display:flex;align-items:center;justify-content:center;}',

      // Pulse
      '@keyframes nr-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}',
      '#bt-kpi-rede .nr-pulse{animation:nr-pulse 2s ease-in-out infinite;}',

      // Timestamp
      '#bt-kpi-rede .nr-timestamp{font-size:7.5px;color:' + C.sub + ';opacity:.5;text-align:right;flex-shrink:0;margin-top:auto;}',

      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 4 · ESTADO GLOBAL (buffer de sparklines)
  // ════════════════════════════════════════════════════════════════════════════

  var STATE = {
    hostid:    null,
    hostName:  null,
    source:    null,   // 'agent' | 'icmp' | 'none'
    items:     {},     // itemid → { name, key_, lastvalue, value_type, units }
    buffers:   {},     // itemid → [ val, val, ... ] (buffer local de polling)
    history:   {},     // itemid → [ val, val, ... ] (pontos do history.get)
    pollTimer: null,
    ifaces:    [],     // interfaces detectadas
    icmpItems: {},     // mapa key → itemid para ICMP
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 5 · API ZABBIX
  // ════════════════════════════════════════════════════════════════════════════

  var ZbxApi = {

    call: function (method, params) {
      var body = { jsonrpc: '2.0', id: 1, method: method, params: params };
      return fetchWithRetry(PROXY, body, undefined)
        .then(function (j) {
          if (j && j.error) throw new Error(j.error.data || j.error.message);
          return (j && j.result) || [];
        });
    },

    getHostId: function (hostName) {
      return ZbxApi.call('host.get', {
        output: ['hostid'],
        filter: { host: [hostName] },
      }).then(function (hosts) {
        if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
        return hosts[0].hostid;
      });
    },

    // Todos os items do host — filtragem no cliente
    getAllItems: function (hostid) {
      return ZbxApi.call('item.get', {
        hostids: [hostid],
        output:  ['itemid', 'name', 'key_', 'lastvalue', 'value_type', 'units', 'lastclock'],
        limit:   300,
      });
    },

    // Histórico real para um item
    getHistory: function (itemid, valueType, limit) {
      return ZbxApi.call('history.get', {
        itemids:   [itemid],
        history:   parseInt(valueType, 10),
        output:    'extend',
        sortfield: 'clock',
        sortorder: 'ASC',
        limit:     limit || CFG.sparkPoints,
      });
    },

    // Refresca lastvalue de múltiplos items
    refreshItems: function (itemids) {
      return ZbxApi.call('item.get', {
        itemids: itemids,
        output:  ['itemid', 'lastvalue', 'lastclock'],
      });
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 6 · DETECÇÃO DE FONTE E ITEMS
  // ════════════════════════════════════════════════════════════════════════════

  var Detect = {

    // Retorna items de rede do agente (net.if.*) agrupados por interface
    agentIfaces: function (items) {
      var ifaces = {};
      items.forEach(function (it) {
        var k = it.key_;
        if (k.indexOf('net.if.in[') === 0 || k.indexOf('net.if.out[') === 0 ||
            k.indexOf('net.if.speed[') === 0 || k.indexOf('net.if.status[') === 0 ||
            k.indexOf('net.if.type[') === 0) {
          // Extrai GUID ou nome da interface da key
          var m = k.match(/\[["']?([^"'\],]+)["']?/);
          var guid = m ? m[1] : 'unknown';
          if (!ifaces[guid]) ifaces[guid] = { guid: guid, items: {} };
          // Classifica o item
          if (k.indexOf(',dropped]') !== -1) {
            ifaces[guid].items[k.indexOf('net.if.in') === 0 ? 'in_drop' : 'out_drop'] = it;
          } else if (k.indexOf(',errors]') !== -1) {
            ifaces[guid].items[k.indexOf('net.if.in') === 0 ? 'in_err' : 'out_err'] = it;
          } else if (k.indexOf('net.if.in[') === 0) {
            ifaces[guid].items['in'] = it;
          } else if (k.indexOf('net.if.out[') === 0) {
            ifaces[guid].items['out'] = it;
          } else if (k.indexOf('net.if.speed') === 0) {
            ifaces[guid].items['speed'] = it;
          } else if (k.indexOf('net.if.status') === 0) {
            ifaces[guid].items['status'] = it;
          }
          // Nome legível da interface a partir do item name
          if (it.name && it.name.indexOf('Interface ') === 0) {
            var namePart = it.name.replace('Interface ', '').split(':')[0].trim();
            ifaces[guid].displayName = namePart;
          }
        }
      });
      return Object.values ? Object.values(ifaces) : Object.keys(ifaces).map(function (k) { return ifaces[k]; });
    },

    // Items ICMP
    icmpItems: function (items) {
      var map = {};
      items.forEach(function (it) {
        var k = it.key_;
        if (k === 'icmpping')        map.ping    = it;
        if (k === 'icmppingloss')    map.loss    = it;
        if (k === 'icmppingsec')     map.rtt     = it;
        if (k === 'bpc.icmp.jitter') map.jitter  = it;
        if (k === 'bpc.icmp.rtt.ms') map.rtt_ms  = it;
        if (k === 'bpc.icmp.avail.1h')  map.avail1h  = it;
        if (k === 'bpc.icmp.avail.24h') map.avail24h = it;
        if (k === 'bpc.icmp.avail.7d')  map.avail7d  = it;
        if (k === 'bpc.icmp.avail.30d') map.avail30d = it;
      });
      return map;
    },

    hasAgentNet: function (ifaces) {
      return ifaces.length > 0 && ifaces.some(function (ifc) {
        return ifc.items && (ifc.items.in || ifc.items.out);
      });
    },

    hasIcmp: function (icmp) {
      return !!(icmp.ping || icmp.rtt || icmp.loss);
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 7 · RENDER
  // ════════════════════════════════════════════════════════════════════════════

  var Render = {

    run: function () {
      var root = document.getElementById(CFG.rootId);
      if (!root) return;

      var source = STATE.source;
      var ifaces = STATE.ifaces;
      var icmp   = STATE.icmpItems;

      var html = CSS + '<div class="nr-root"><div class="nr-card">';

      // ── Cabeçalho ──────────────────────────────────────────────────────────
      html += Render._head(source, ifaces, icmp);
      html += '<div class="nr-sep"></div>';

      if (source === 'agent' && ifaces.length > 0) {
        html += Render._agentSection(ifaces, icmp);
      } else if (source === 'icmp') {
        html += Render._icmpSection(icmp);
      } else {
        html += '<div class="nr-nodata">Sem dados de rede disponíveis para este host.</div>';
      }

      html += '<div class="nr-timestamp">atualizado ' + U.fmtTime(Math.floor(Date.now()/1000)) + '</div>';
      html += '</div></div>';

      root.innerHTML = html;
    },

    _head: function (source, ifaces, icmp) {
      var sourceBadge = '';
      var ifaceName   = '';
      var ifaceMeta   = '';
      var statusBadge = '';

      if (source === 'agent' && ifaces.length > 0) {
        var ifc = ifaces[0];
        sourceBadge = '<span class="nr-badge agent">AGENTE</span>';
        ifaceName   = U.esc(ifc.displayName || ifc.guid);

        // Speed
        var speedItem = ifc.items.speed;
        var speedStr  = '';
        if (speedItem && speedItem.lastvalue) {
          speedStr = U.fmtBps(speedItem.lastvalue);
        }

        // Status
        var statusItem = ifc.items.status;
        var connected  = statusItem && parseInt(statusItem.lastvalue, 10) === 2;
        if (statusItem) {
          statusBadge = connected
            ? '<span class="nr-badge status-ok">● CONNECTED</span>'
            : '<span class="nr-badge status-err nr-pulse">● DISCONNECTED</span>';
        }

        ifaceMeta = speedStr ? speedStr : '';

      } else if (source === 'icmp') {
        sourceBadge = '<span class="nr-badge icmp">ICMP</span>';
        ifaceName   = 'Conectividade de rede';
        var pingUp  = icmp.ping && parseInt(icmp.ping.lastvalue, 10) === 1;
        statusBadge = pingUp
          ? '<span class="nr-badge status-ok">● UP</span>'
          : '<span class="nr-badge status-err nr-pulse">● DOWN</span>';
      } else {
        sourceBadge = '<span class="nr-badge nodata">SEM DADOS</span>';
        ifaceName   = '—';
      }

      return '<div class="nr-head">'
        + '<div class="nr-title-block">'
          + '<span class="nr-panel-title">REDE · INTERFACE</span>'
          + '<span class="nr-iface-name">' + ifaceName + '</span>'
          + (ifaceMeta ? '<span class="nr-iface-meta">' + U.esc(ifaceMeta) + '</span>' : '')
        + '</div>'
        + '<div class="nr-badges">' + statusBadge + sourceBadge + '</div>'
        + '</div>';
    },

    _agentSection: function (ifaces, icmp) {
      var html = '';
      var ifc  = ifaces[0]; // Primeira interface (principal)
      var inIt  = ifc.items.in;
      var outIt = ifc.items.out;

      // Sparkline buffers
      var rxData = Render._sparkData(inIt  ? inIt.itemid  : null);
      var txData = Render._sparkData(outIt ? outIt.itemid : null);

      var rxVal = inIt  ? U.fmtBps(inIt.lastvalue)  : '—';
      var txVal = outIt ? U.fmtBps(outIt.lastvalue) : '—';

      // ── Throughput ────────────────────────────────────────────────────────
      html += '<div class="nr-section-title">THROUGHPUT</div>';
      html += '<div class="nr-throughput">';

      // RX
      html += '<div class="nr-thr-card">'
        + '<div class="nr-thr-label" style="color:' + CFG.colors.rx + ';">↓ RECEBIDO</div>'
        + '<div class="nr-thr-val rx">' + U.esc(rxVal) + '</div>'
        + '<div class="nr-thr-spark">'
          + U.sparkline(rxData, CFG.colors.rx)
        + '</div>'
        + '</div>';

      // TX
      html += '<div class="nr-thr-card">'
        + '<div class="nr-thr-label" style="color:' + CFG.colors.tx + ';">↑ ENVIADO</div>'
        + '<div class="nr-thr-val tx">' + U.esc(txVal) + '</div>'
        + '<div class="nr-thr-spark">'
          + U.sparkline(txData, CFG.colors.tx)
        + '</div>'
        + '</div>';

      html += '</div>'; // nr-throughput

      // ── Erros & Drops ─────────────────────────────────────────────────────
      html += '<div class="nr-sep"></div>';
      html += '<div class="nr-section-title">ERROS & DROPS</div>';
      html += '<div class="nr-erros">';

      var errCells = [
        { label: 'IN ERR',  item: ifc.items.in_err  },
        { label: 'OUT ERR', item: ifc.items.out_err  },
        { label: 'IN DROP', item: ifc.items.in_drop  },
        { label: 'OUT DROP',item: ifc.items.out_drop },
      ];
      errCells.forEach(function (ec) {
        var val = ec.item ? parseInt(ec.item.lastvalue, 10) : null;
        var cls = val === null ? '' : val === 0 ? 'zero' : 'nonzero';
        var str = val === null ? '—' : String(val);
        html += '<div class="nr-err-cell">'
          + '<div class="nr-err-label">' + ec.label + '</div>'
          + '<div class="nr-err-val ' + cls + '">' + str + '</div>'
          + '</div>';
      });
      html += '</div>'; // nr-erros

      // ── ICMP se disponível ────────────────────────────────────────────────
      if (Detect.hasIcmp(icmp)) {
        html += '<div class="nr-sep"></div>';
        html += Render._icmpSection(icmp);
      }

      return html;
    },

    _icmpSection: function (icmp) {
      var html = '';
      html += '<div class="nr-section-title">ICMP · CONECTIVIDADE</div>';
      html += '<div class="nr-icmp">';

      // Esquerda: stats
      html += '<div class="nr-icmp-left">';

      var rttVal = icmp.rtt
        ? U.fmtMs(icmp.rtt.lastvalue)
        : (icmp.rtt_ms ? (parseFloat(icmp.rtt_ms.lastvalue) || 0).toFixed(2) + ' ms' : '—');

      var lossVal   = icmp.loss   ? U.fmtPct(icmp.loss.lastvalue)   : '—';
      var jitterVal = icmp.jitter ? (parseFloat(icmp.jitter.lastvalue) || 0).toFixed(2) + ' ms' : '—';

      [
        { label: 'RTT',    val: rttVal },
        { label: 'LOSS',   val: lossVal },
        { label: 'JITTER', val: jitterVal },
      ].forEach(function (s) {
        html += '<div class="nr-icmp-stat">'
          + '<span class="nr-icmp-stat-label">' + s.label + '</span>'
          + '<span class="nr-icmp-stat-val">' + U.esc(s.val) + '</span>'
          + '</div>';
      });

      // Sparkline RTT
      var rttItem = icmp.rtt || icmp.rtt_ms;
      if (rttItem) {
        var rttData = Render._sparkData(rttItem.itemid);
        html += '<div class="nr-icmp-spark-wrap">'
          + '<div class="nr-icmp-spark-label">RTT histórico</div>'
          + '<div class="nr-icmp-spark">' + U.sparkline(rttData, CFG.colors.info) + '</div>'
          + '</div>';
      }

      html += '</div>'; // nr-icmp-left

      // Direita: disponibilidade
      html += '<div class="nr-icmp-right">';
      html += '<div class="nr-section-title" style="margin-bottom:4px;">DISPONIBILIDADE</div>';
      html += '<div class="nr-avail">';

      var availPeriods = [
        { label: '1H',  item: icmp.avail1h  },
        { label: '24H', item: icmp.avail24h },
        { label: '7D',  item: icmp.avail7d  },
        { label: '30D', item: icmp.avail30d },
      ];
      availPeriods.forEach(function (ap) {
        var pct = ap.item ? ap.item.lastvalue : null;
        var ab  = pct !== null ? U.availBar(pct) : { color: CFG.colors.sub, label: '—', pct: '—' };
        html += '<div class="nr-avail-cell">'
          + '<div class="nr-avail-period">' + ap.label + '</div>'
          + '<div class="nr-avail-pct" style="color:' + ab.color + ';">' + ab.pct + '</div>'
          + '<div class="nr-avail-lbl" style="color:' + ab.color + ';">' + ab.label + '</div>'
          + '</div>';
      });
      html += '</div>'; // nr-avail
      html += '</div>'; // nr-icmp-right

      html += '</div>'; // nr-icmp
      return html;
    },

    // Combina history.get com buffer de polling local
    _sparkData: function (itemid) {
      if (!itemid) return [];
      var hist = STATE.history[itemid]  || [];
      var buf  = STATE.buffers[itemid]  || [];
      var combined = hist.concat(buf);
      // Mantém os últimos sparkMaxBuffer pontos
      if (combined.length > CFG.sparkMaxBuffer) {
        combined = combined.slice(combined.length - CFG.sparkMaxBuffer);
      }
      return combined;
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 8 · POLLING
  // ════════════════════════════════════════════════════════════════════════════

  var Poll = {

    // IDs a refrescar: in, out, rtt, rtt_ms
    _watchIds: function () {
      var ids = [];
      STATE.ifaces.forEach(function (ifc) {
        if (ifc.items.in)  ids.push(ifc.items.in.itemid);
        if (ifc.items.out) ids.push(ifc.items.out.itemid);
      });
      var icmp = STATE.icmpItems;
      if (icmp.rtt)    ids.push(icmp.rtt.itemid);
      if (icmp.rtt_ms) ids.push(icmp.rtt_ms.itemid);
      return ids;
    },

    start: function () {
      if (STATE.pollTimer) clearInterval(STATE.pollTimer);
      STATE.pollTimer = setInterval(function () {
        Poll._tick();
      }, CFG.pollInterval);
    },

    _tick: function () {
      var ids = Poll._watchIds();
      if (!ids.length) return;

      ZbxApi.refreshItems(ids)
        .then(function (items) {
          items.forEach(function (it) {
            var id  = it.itemid;
            var val = parseFloat(it.lastvalue);
            if (isNaN(val)) return;
            if (!STATE.buffers[id]) STATE.buffers[id] = [];
            STATE.buffers[id].push(val);
            // Limita buffer
            if (STATE.buffers[id].length > CFG.sparkMaxBuffer) {
              STATE.buffers[id] = STATE.buffers[id].slice(-CFG.sparkMaxBuffer);
            }
            // Actualiza lastvalue no STATE
            if (STATE.ifaces) {
              STATE.ifaces.forEach(function (ifc) {
                Object.keys(ifc.items).forEach(function (role) {
                  if (ifc.items[role] && ifc.items[role].itemid === id) {
                    ifc.items[role].lastvalue = it.lastvalue;
                  }
                });
              });
            }
            var icmp = STATE.icmpItems;
            Object.keys(icmp).forEach(function (k) {
              if (icmp[k] && icmp[k].itemid === id) icmp[k].lastvalue = it.lastvalue;
            });
          });
          U.dbg('[REDE v1.0][poll] refreshed', items.length, 'items');
          Render.run();
        })
        .catch(function (e) {
          U.dbg('[REDE v1.0][poll] erro:', e.message);
        });
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 9 · BOOTSTRAP
  // ════════════════════════════════════════════════════════════════════════════

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  U.dbg('[REDE v1.0] hostRaw:', hostRaw, '→', hostName);

  if (!hostName) {
    root.innerHTML = '<span style="color:#6E7681;font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:#6E7681;font-size:11px;">A carregar dados de rede…</span>';

  ZbxApi.getHostId(hostName)
    .then(function (hostid) {
      STATE.hostid   = hostid;
      STATE.hostName = hostName;
      U.dbg('[REDE v1.0] hostid:', hostid);
      return ZbxApi.getAllItems(hostid);
    })
    .then(function (allItems) {
      U.dbg('[REDE v1.0] total items:', allItems.length);

      // Indexa por itemid
      allItems.forEach(function (it) { STATE.items[it.itemid] = it; });

      // Detecta interfaces de agente e items ICMP
      var ifaces     = Detect.agentIfaces(allItems);
      var icmpItems  = Detect.icmpItems(allItems);

      U.dbg('[REDE v1.0] ifaces agente:', ifaces.length, '| icmp keys:', Object.keys(icmpItems).length);

      STATE.ifaces    = ifaces;
      STATE.icmpItems = icmpItems;

      if (Detect.hasAgentNet(ifaces)) {
        STATE.source = 'agent';
      } else if (Detect.hasIcmp(icmpItems)) {
        STATE.source = 'icmp';
      } else {
        STATE.source = 'none';
      }

      U.dbg('[REDE v1.0] source:', STATE.source);

      // Recolhe itemids para history.get
      var historyRequests = [];

      if (STATE.source === 'agent') {
        ifaces.forEach(function (ifc) {
          if (ifc.items.in)  historyRequests.push({ item: ifc.items.in,  role: 'in'  });
          if (ifc.items.out) historyRequests.push({ item: ifc.items.out, role: 'out' });
        });
      }
      // Sempre pede RTT se disponível
      if (icmpItems.rtt)    historyRequests.push({ item: icmpItems.rtt,    role: 'rtt'    });
      if (icmpItems.rtt_ms) historyRequests.push({ item: icmpItems.rtt_ms, role: 'rtt_ms' });

      // Faz history.get para cada item relevante
      var histPromises = historyRequests.map(function (req) {
        return ZbxApi.getHistory(req.item.itemid, req.item.value_type, CFG.sparkPoints)
          .then(function (pts) {
            STATE.history[req.item.itemid] = pts.map(function (p) { return parseFloat(p.value); });
            U.dbg('[REDE v1.0][history]', req.role, '→', pts.length, 'pontos para itemid', req.item.itemid);
          })
          .catch(function (e) {
            U.dbg('[REDE v1.0][history] erro para', req.role, ':', e.message);
            STATE.history[req.item.itemid] = [];
          });
      });

      return Promise.all(histPromises);
    })
    .then(function () {
      // Render inicial
      Render.run();
      // Inicia polling
      Poll.start();
    })
    .catch(function (e) {
      console.error('[REDE v1.0] Erro:', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que a VM tem items de rede ou ICMP no Zabbix e que o proxy Grafana responde.');
    });

})();