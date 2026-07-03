; (function () {

  // ══════════════════════════════════════════════════════════════════
  // BPC NOC — Event Correlation · CPU + RAM  v1.1
  // Framework: BPC-UI v7  |  waitForBPC bootstrap
  //
  // Propósito:
  //   Dado uma VM seleccionada (var $vm / var-hostid), mostrar numa
  //   linha de tempo o que aconteceu primeiro — degradação no ESXi
  //   hospedeiro ou na VM — para CPU e RAM.
  //
  // v1.1: convertido para ES5 (sem const/let/arrow/template-literals/??/?.)
  //       para compatibilidade total com o contexto eval() do Business Text.
  //       THEME unificado dentro de CFG.colors / CFG.thresholds.
  //
  // Estrutura:
  //   [1] CFG (cores + thresholds unificados)
  //   [2] PALETTE + STYLES
  //   [3] TEMPLATES
  //   [4] DATA UTILS
  //   [5] FETCH  ← dois grupos em paralelo: 609 (VMs) e 603 (ESXi)
  //   [6] COMPUTE ← detecção automática de causa raiz
  //   [7] RENDER  ← timeline lanes + sequência eventos + acção
  //   [8] BOOTSTRAP
  // ══════════════════════════════════════════════════════════════════


  // ────────────────────────────────────────────────────────────────
  // [1] CFG
  // ────────────────────────────────────────────────────────────────

  var CFG = {
    elementId: 'bpc-event-correlation',
    vmGroupId: '609',   // VMs
    esxiGroupId: '603',   // ESXi hosts
    refreshMs: 60000,
    historyMinutes: 360,   // 6h de janela temporal
    bucketMinutes: 5,     // resolução da sparkline (5 min por ponto)
    debug: false,

    zabbixUrl: 'http://10.10.126.22',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',   // datasource Zabbix (consistente com os painéis L3)

    // Cores de estado unificadas (mesma paleta dos L3)
    colors: {
      ok:   '#3FB950',
      warn: '#D29922',
      crit: '#F85149',
      info: '#58A6FF',
      mute: '#6E7681',
      purp: '#BC8CFF',
    },

    // Thresholds unificados (estrutura aninhada)
    thresholds: {
      cpuReady: { warn: 5,  crit: 15 },   // % CPU ready
      cpuHost:  { warn: 70, crit: 90 },   // % CPU ESXi — canónico engenharia-do-sistema.md §6.2
      ramHost:  { warn: 70, crit: 85 },   // % RAM ESXi
      balloon:  { warn: 0.1 },            // GB balloon VM
    },

    fontBody: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontMono: "'IBM Plex Mono', 'Courier New', monospace",

    // IDs das variáveis Grafana — lidas de window.location ou
    // injectadas pelo BPC bootstrap como CFG.hostId / CFG.hvName
    // Fallback: primeira VM com CPU ready > 0 no grupo
    vmHostId: null,   // preenchido no bootstrap
    hvName: null,   // preenchido após fetch do item "VMware: Hypervisor name"

    itemNamesVm: [
      'CPU utilization',
      'VMware: CPU usage in percents',
      'VMware: CPU ready',           // % tempo à espera de CPU no hypervisor
      'VMware: Memory size',
      'VMware: Host memory usage',
      'VMware: Host memory usage in percents',
      'VMware: Ballooned memory',
      'VMware: Swapped memory',
      'VMware: Power state',
      'VMware: Hypervisor name',
    ],

    itemNamesEsxi: [
      'VMware: CPU usage in percents',
      'VMware: Memory used percentage',
      'VMware: Ballooned memory',
      'VMware: Uptime',
    ],

    grafanaDash: {
      vmDetail:   '/d/0ae673a3-44c8-41e0-98f5-f5c53473ad54/n3-sv-versao-a-bt',
      esxiDetail: '/d/b55d5481-9f82-4371-a7ca-e83ceb3064cc/n3-servidores-fisicos-esxi-detalhe',
    },
  };


  // ────────────────────────────────────────────────────────────────
  // [2] PALETTE + STYLES
  // ────────────────────────────────────────────────────────────────

  var C = {
    ok: CFG.colors.ok,
    warn: CFG.colors.warn,
    crit: CFG.colors.crit,
    info: CFG.colors.info,
    mute: CFG.colors.mute,
    purp: CFG.colors.purp,
  };

  var STYLES = [
    '.ec-wrap *, .ec-wrap *::before, .ec-wrap *::after { box-sizing: border-box; }',
    '.ec-wrap {',
    '  height: 100%; min-height: 560px; display: flex; flex-direction: column; gap: 0;',
    '  font-family: ' + CFG.fontBody + ';',
    '  background: rgba(13,17,23,0.98);',
    '  color: #E6EDF3; overflow: auto;',
    '}',

    '.ec-topbar {',
    '  flex-shrink: 0; display: flex; align-items: center; gap: 10px;',
    '  padding: 7px 14px; border-bottom: 1px solid rgba(255,255,255,0.07);',
    '  flex-wrap: wrap;',
    '}',
    '.ec-topbar-title {',
    '  font-size: 11px; font-weight: 600; letter-spacing: .12em;',
    '  text-transform: uppercase; color: ' + C.mute + ';',
    '}',
    '.ec-pill {',
    '  font-size: 11px; font-weight: 600; padding: 3px 10px;',
    '  border-radius: 20px; white-space: nowrap;',
    '}',
    '.ec-pill-vm   { background: rgba(88,166,255,.15); color: ' + C.info + ';',
    '                border: 1px solid rgba(88,166,255,.3); }',
    '.ec-pill-esxi { background: rgba(255,255,255,.05); color: ' + C.mute + ';',
    '                border: 1px solid rgba(255,255,255,.12); }',
    '.ec-stat-group { display: flex; gap: 14px; margin-left: auto; flex-wrap: wrap; }',
    '.ec-stat { text-align: right; }',
    '.ec-stat-val { font-family: ' + CFG.fontMono + '; font-size: 16px; font-weight: 700; line-height: 1; }',
    '.ec-stat-lbl { font-size: 9px; color: ' + C.mute + '; letter-spacing: .06em; text-transform: uppercase; }',
    '.ec-badge {',
    '  font-size: 9.5px; font-weight: 700; letter-spacing: .07em;',
    '  padding: 3px 9px; border-radius: 4px; text-transform: uppercase;',
    '}',

    '.ec-finding {',
    '  flex-shrink: 0; display: flex; gap: 10px; align-items: flex-start;',
    '  padding: 9px 14px; font-size: 12px; line-height: 1.5;',
    '  border-bottom: 1px solid rgba(255,255,255,0.07);',
    '}',
    '.ec-finding-icon { font-size: 15px; flex-shrink: 0; margin-top: 1px; }',
    '.ec-finding strong { font-weight: 600; }',

    '.ec-body {',
    '  flex: 1; display: grid;',
    '  grid-template-columns: 1fr 280px;',
    '  min-height: 320px;',
    '}',

    '.ec-timeline {',
    '  display: flex; flex-direction: column; padding: 12px 16px;',
    '  border-right: 1px solid rgba(255,255,255,0.07);',
    '  gap: 8px;',
    '}',
    '.ec-tl-title {',
    '  font-size: 9px; font-weight: 600; letter-spacing: .12em;',
    '  text-transform: uppercase; color: ' + C.mute + '; flex-shrink: 0;',
    '  margin-bottom: 4px;',
    '}',
    '.ec-lane { flex-shrink: 0; }',
    '.ec-lane-header {',
    '  display: flex; align-items: center; gap: 6px; margin-bottom: 4px;',
    '}',
    '.ec-lane-label {',
    '  font-size: 11px; font-weight: 600; min-width: 140px;',
    '  letter-spacing: .03em;',
    '}',
    '.ec-lane-source { font-size: 9.5px; color: ' + C.mute + '; }',
    '.ec-lane-badge  { margin-left: auto; font-size: 9.5px; font-weight: 700;',
    '  padding: 2px 8px; border-radius: 3px; white-space: nowrap; }',
    '.ec-lane-bar {',
    '  position: relative; height: 40px;',
    '  background: rgba(255,255,255,0.04);',
    '  border-radius: 4px; overflow: hidden;',
    '}',
    '.ec-lane-bar svg { display: block; width: 100%; height: 100%; }',
    '.ec-sep {',
    '  height: 1px; background: rgba(255,255,255,0.06);',
    '  flex-shrink: 0; margin: 4px 0;',
    '}',
    '.ec-axis {',
    '  display: flex; justify-content: space-between;',
    '  padding: 0 2px; flex-shrink: 0; margin-top: 4px;',
    '}',
    '.ec-axis-tick { font-size: 9.5px; color: ' + C.mute + '; font-family: ' + CFG.fontMono + '; }',

    '.ec-sidebar {',
    '  display: flex; flex-direction: column;',
    '}',
    '.ec-side-section {',
    '  flex: 1; padding: 12px 14px; display: flex;',
    '  flex-direction: column; gap: 6px; min-height: 120px;',
    '}',
    '.ec-side-section + .ec-side-section {',
    '  border-top: 1px solid rgba(255,255,255,0.07);',
    '}',
    '.ec-side-title {',
    '  font-size: 9.5px; font-weight: 600; letter-spacing: .12em;',
    '  text-transform: uppercase; color: ' + C.mute + '; flex-shrink: 0;',
    '  margin-bottom: 2px;',
    '}',
    '.ec-ev-list { display: flex; flex-direction: column; gap: 5px; }',
    '.ec-ev-row {',
    '  display: flex; align-items: baseline; gap: 6px;',
    '  padding: 6px 8px; border-radius: 5px;',
    '  background: rgba(255,255,255,0.03);',
    '  border: 1px solid rgba(255,255,255,0.06);',
    '  flex-shrink: 0;',
    '}',
    '.ec-ev-row.crit { border-color: rgba(248,81,73,.35); }',
    '.ec-ev-row.warn { border-color: rgba(210,153,34,.25); }',
    '.ec-ev-time {',
    '  font-size: 10.5px; font-family: ' + CFG.fontMono + ';',
    '  color: ' + C.mute + '; min-width: 40px; flex-shrink: 0;',
    '}',
    '.ec-ev-layer { font-size: 9.5px; font-weight: 700; min-width: 36px;',
    '  text-transform: uppercase; letter-spacing: .06em; flex-shrink: 0; }',
    '.ec-ev-desc { font-size: 11px; line-height: 1.35; flex: 1; }',
    '.ec-ev-delta {',
    '  font-size: 9.5px; color: ' + C.mute + '; font-family: ' + CFG.fontMono + ';',
    '  margin-left: auto; white-space: nowrap; flex-shrink: 0;',
    '}',

    '.ec-vm-list { display: flex; flex-direction: column; gap: 5px; }',
    '.ec-vm-row {',
    '  display: flex; align-items: center; gap: 6px;',
    '  padding: 5px 8px; border-radius: 4px;',
    '  background: rgba(255,255,255,0.03);',
    '  border: 1px solid rgba(255,255,255,0.05);',
    '  flex-shrink: 0;',
    '}',
    '.ec-vm-name { font-family: ' + CFG.fontMono + '; font-size: 10.5px;',
    '  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
    '.ec-vm-val  { font-family: ' + CFG.fontMono + '; font-size: 10.5px;',
    '  font-weight: 700; white-space: nowrap; flex-shrink: 0; }',
    '.ec-vm-bar  { width: 50px; height: 4px; background: rgba(255,255,255,0.07);',
    '  border-radius: 2px; overflow: hidden; flex-shrink: 0; }',
    '.ec-vm-bar-fill { height: 100%; border-radius: 2px; }',

    '.ec-action {',
    '  flex-shrink: 0; display: grid; grid-template-columns: repeat(3,1fr);',
    '  gap: 6px; padding: 8px 14px;',
    '  border-top: 1px solid rgba(255,255,255,0.07);',
    '}',
    '.ec-action-card {',
    '  padding: 7px 10px; border-radius: 5px;',
    '  background: rgba(255,255,255,0.03);',
    '  border: 1px solid rgba(255,255,255,0.07);',
    '}',
    '.ec-action-title {',
    '  font-size: 9.5px; font-weight: 600; margin-bottom: 3px;',
    '  letter-spacing: .04em;',
    '}',
    '.ec-action-body { font-size: 9px; color: ' + C.mute + '; line-height: 1.45; }',

    '.ec-center {',
    '  flex: 1; display: flex; align-items: center; justify-content: center;',
    '  font-size: 12px; color: ' + C.mute + ';',
    '}',

    'a.ec-link {',
    '  color: ' + C.info + '; text-decoration: none; font-size: 9px;',
    '  padding: 1px 6px; border-radius: 3px;',
    '  border: 1px solid rgba(88,166,255,.25);',
    '  background: rgba(88,166,255,.07);',
    '  white-space: nowrap;',
    '}',
    'a.ec-link:hover { background: rgba(88,166,255,.14); }',
  ].join('\n');


  // ────────────────────────────────────────────────────────────────
  // [3] TEMPLATES
  // ────────────────────────────────────────────────────────────────

  var T = {
    esc: function (s) {
      return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    rgb: function (h) {
      h = h.trim().replace('#', '');
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return parseInt(h.slice(0, 2), 16) + ',' + parseInt(h.slice(2, 4), 16) + ',' + parseInt(h.slice(4, 6), 16);
    },

    badge: function (txt, col) {
      var r = T.rgb(col);
      return '<span class="ec-badge" style="background:rgba(' + r + ',.14);color:' + col + ';border:1px solid rgba(' + r + ',.3);">' + T.esc(txt) + '</span>';
    },

    laneBadge: function (txt, col) {
      var r = T.rgb(col);
      return '<span class="ec-lane-badge" style="background:rgba(' + r + ',.14);color:' + col + ';border:1px solid rgba(' + r + ',.3);">' + T.esc(txt) + '</span>';
    },

    // Sparkline SVG com marcadores de evento
    spark: function (points, col, markers, threshW, threshC) {
      if (!points || !points.length) return '<svg viewBox="0 0 400 32" preserveAspectRatio="none"></svg>';
      var n = points.length;
      var mn = 0;
      var mx = Math.max.apply(null, points.concat([threshC || threshW || 10, 1]));
      var rng = mx - mn || 1;
      var W = 400, H = 32, PAD = 3;

      var px = function (i) { return (i / (n - 1)) * W; };
      var py = function (v) { return H - PAD - ((v - mn) / rng) * (H - PAD * 2); };

      var pts = points.map(function (v, i) { return px(i).toFixed(1) + ',' + py(v).toFixed(1); }).join(' ');
      var areaBot = px(0).toFixed(1) + ',' + H + ' ';
      var areaTop = pts;
      var areaClose = ' ' + px(n - 1).toFixed(1) + ',' + H;
      var gid = 'sg' + Math.random().toString(36).slice(2, 6);
      var r = T.rgb(col);

      var threshLines = [];
      if (threshW != null) {
        var yw = py(threshW).toFixed(1);
        threshLines.push('<line x1="0" y1="' + yw + '" x2="' + W + '" y2="' + yw + '" stroke="' + C.warn + '" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.5"/>');
      }
      if (threshC != null) {
        var yc = py(threshC).toFixed(1);
        threshLines.push('<line x1="0" y1="' + yc + '" x2="' + W + '" y2="' + yc + '" stroke="' + C.crit + '" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.5"/>');
      }

      var markerSvg = (markers || []).map(function (m) {
        var x = (m.pct * W).toFixed(1);
        var mc = m.type === 'crit' ? C.crit : m.type === 'warn' ? C.warn : C.info;
        return '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" stroke="' + mc + '" stroke-width="1" opacity="0.7"/>'
          + '<circle cx="' + x + '" cy="' + py(m.val || 0).toFixed(1) + '" r="3" fill="' + mc + '" stroke="rgba(13,17,23,.8)" stroke-width="1.5"/>';
      }).join('');

      return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">'
        + '<defs>'
        + '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0%" stop-color="rgba(' + r + ',.35)"/>'
        + '<stop offset="100%" stop-color="rgba(' + r + ',0)"/>'
        + '</linearGradient>'
        + '</defs>'
        + threshLines.join('')
        + '<polygon points="' + areaBot + areaTop + areaClose + '" fill="url(#' + gid + ')"/>'
        + '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
        + markerSvg
        + '</svg>';
    },

    // Lane na timeline
    lane: function (label, source, col, currentVal, unit, sparkSvg, badgeText) {
      return '<div class="ec-lane">'
        + '<div class="ec-lane-header">'
        + '<span class="ec-lane-label" style="color:' + col + ';">' + T.esc(label) + '</span>'
        + '<span class="ec-lane-source">' + T.esc(source) + '</span>'
        + (badgeText ? T.laneBadge(badgeText, col) : '')
        + '</div>'
        + '<div class="ec-lane-bar">' + sparkSvg + '</div>'
        + '</div>';
    },

    // Linha de evento
    evRow: function (time, layer, layerCol, desc, delta, severity) {
      return '<div class="ec-ev-row ' + (severity || '') + '">'
        + '<span class="ec-ev-time">' + T.esc(time) + '</span>'
        + '<span class="ec-ev-layer" style="color:' + layerCol + ';">' + T.esc(layer) + '</span>'
        + '<span class="ec-ev-desc">' + T.esc(desc) + '</span>'
        + (delta != null ? '<span class="ec-ev-delta">+' + T.esc(String(delta)) + 'm</span>' : '')
        + '</div>';
    },

    // Linha de VM afectada
    vmRow: function (name, val, unit, col, pct) {
      return '<div class="ec-vm-row">'
        + '<span class="ec-vm-name" title="' + T.esc(name) + '">' + T.esc(name) + '</span>'
        + '<div class="ec-vm-bar"><div class="ec-vm-bar-fill" style="width:' + Math.min(100, pct || 0).toFixed(0) + '%;background:' + col + ';"></div></div>'
        + '<span class="ec-vm-val" style="color:' + col + ';">' + T.esc(val) + T.esc(unit) + '</span>'
        + '</div>';
    },

    // Card de acção
    actionCard: function (icon, title, body, col) {
      return '<div class="ec-action-card" style="border-color:rgba(' + T.rgb(col) + ',.25);">'
        + '<div class="ec-action-title" style="color:' + col + ';">' + icon + ' ' + T.esc(title) + '</div>'
        + '<div class="ec-action-body">' + T.esc(body) + '</div>'
        + '</div>';
    },

    // Diagnóstico automático
    finding: function (text, col, icon) {
      var r = T.rgb(col);
      return '<div class="ec-finding" style="background:rgba(' + r + ',.07);border-bottom:1px solid rgba(' + r + ',.2);">'
        + '<span class="ec-finding-icon" style="color:' + col + ';">' + (icon || '⚠') + '</span>'
        + '<span style="color:#E6EDF3;">' + text + '</span>'
        + '</div>';
    },
  };


  // ────────────────────────────────────────────────────────────────
  // [4] DATA UTILS
  // ────────────────────────────────────────────────────────────────

  function pad2(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function fmtTime(ts) {
    var d = new Date(ts * 1000);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function fmtVal(v, d) {
    if (d == null) d = 1;
    return (v == null || isNaN(v)) ? '—' : v.toFixed(d);
  }

  function gbOf(bytes) { return bytes ? +(bytes / 1073741824).toFixed(2) : 0; }

  function isPoweredOn(val) {
    if (val == null || val === '') return false;
    var s = String(val).trim().toLowerCase();
    return s === '1' || s === 'poweredon' || s === 'true' || s === 'on' || parseFloat(val) === 1;
  }

  function dbg() {
    if (!CFG.debug) return;
    var args = ['[BPC-EC v1.1]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  // Agrupa histórico por itemid, devolve mapa de arrays ordenados por tempo
  function histByItem(history) {
    var m = {};
    history.forEach(function (h) {
      if (!m[h.itemid]) m[h.itemid] = [];
      m[h.itemid].push({ t: parseInt(h.clock, 10), v: parseFloat(h.value) });
    });
    Object.keys(m).forEach(function (k) {
      m[k].sort(function (x, y) { return x.t - y.t; });
    });
    return m;
  }

  // Reduz série histórica a N pontos por média de bucket
  function downsample(series, bucketSec) {
    if (!series || !series.length) return [];
    var result = [];
    var bucket = [], bucketStart = series[0].t;
    series.forEach(function (p) {
      if (p.t - bucketStart >= bucketSec) {
        if (bucket.length) result.push(bucket.reduce(function (a, b) { return a + b; }, 0) / bucket.length);
        bucket = [p.v];
        bucketStart = p.t;
      } else {
        bucket.push(p.v);
      }
    });
    if (bucket.length) result.push(bucket.reduce(function (a, b) { return a + b; }, 0) / bucket.length);
    return result;
  }

  // Dado uma série, devolve o timestamp em que o valor ultrapassou o threshold
  function firstCross(series, threshold) {
    for (var i = 0; i < series.length; i++) {
      if (series[i].v >= threshold) return series[i].t;
    }
    return null;
  }

  // Detecta causa raiz: devolve { cause, deltaMin }
  function detectCause(esxiCrossTs, vmCrossTs) {
    if (!esxiCrossTs && !vmCrossTs) return { cause: 'unknown', deltaMin: null };
    if (!esxiCrossTs) return { cause: 'vm', deltaMin: null };
    if (!vmCrossTs) return { cause: 'esxi_only', deltaMin: null };
    var delta = Math.round((vmCrossTs - esxiCrossTs) / 60);
    if (delta > 2) return { cause: 'esxi', deltaMin: delta };
    if (delta < -2) return { cause: 'vm', deltaMin: -delta };
    return { cause: 'simultaneous', deltaMin: Math.abs(delta) };
  }

  // Ler variável da URL Grafana: ?var-hostid=XXXX
  function urlVar(name) {
    var m = window.location.search.match(new RegExp('[?&]var-' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // Gerar ticks de eixo temporal (6 ticks para 6h)
  function axisTicks(fromTs, toTs, n) {
    if (n == null) n = 6;
    var step = (toTs - fromTs) / (n - 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(fmtTime(Math.round(fromTs + i * step)));
    return out;
  }

  // Marcadores para sparkline: onde o threshold foi cruzado
  function buildMarkers(series, threshold, type, bucketSec) {
    var ts = firstCross(series, threshold);
    if (!ts) return [];
    var total = series[series.length - 1].t - series[0].t || 1;
    var pct = (ts - series[0].t) / total;
    var crossPoint = null;
    for (var i = 0; i < series.length; i++) { if (series[i].t >= ts) { crossPoint = series[i]; break; } }
    var vAtCross = crossPoint ? crossPoint.v : threshold;
    return [{ pct: pct, val: vAtCross, type: type }];
  }


  // ────────────────────────────────────────────────────────────────
  // [5] FETCH
  // ────────────────────────────────────────────────────────────────

  function fetchData(rpc, vmHostId, hvName) {
    var ts = nowSec();
    var from = ts - CFG.historyMinutes * 60;
    var bucketSec = CFG.bucketMinutes * 60;

    // ── Dados da VM ──────────────────────────────────────────────
    var vmItemsP = rpc('item.get', {
      hostids: [vmHostId],
      search: { name: CFG.itemNamesVm },
      searchByAny: true,
      output: ['hostid', 'itemid', 'name', 'lastvalue', 'lastclock'],
      selectHosts: ['hostid', 'host', 'name'],
      monitored: true,
    });

    // ── Dados do ESXi (por nome do host) ─────────────────────────
    var esxiItemsP = hvName
      ? rpc('item.get', {
        groupids: [CFG.esxiGroupId],
        host: hvName,
        search: { name: CFG.itemNamesEsxi },
        searchByAny: true,
        output: ['hostid', 'itemid', 'name', 'lastvalue', 'lastclock'],
        selectHosts: ['hostid', 'host', 'name'],
        monitored: true,
      })
      : Promise.resolve([]);

    // ── Histórico VM (CPU + RAM) ──────────────────────────────────
    var vmHistP = rpc('history.get', {
      hostids: [vmHostId],
      history: 0,
      time_from: from,
      time_till: ts,
      output: ['itemid', 'value', 'clock'],
      sortfield: 'clock',
      sortorder: 'ASC',
      limit: 10000,
    }).catch(function () { return []; });

    // ── Histórico ESXi (CPU + RAM) ───────────────────────────────
    var esxiHistP = hvName
      ? rpc('history.get', {
        groupids: [CFG.esxiGroupId],
        hosts: [{ host: hvName }],
        history: 0,
        time_from: from,
        time_till: ts,
        output: ['itemid', 'value', 'clock'],
        sortfield: 'clock',
        sortorder: 'ASC',
        limit: 10000,
      }).catch(function () { return []; })
      : Promise.resolve([]);

    // ── Triggers activos (VM + ESXi) ─────────────────────────────
    var triggersP = rpc('trigger.get', {
      hostids: [vmHostId],
      filter: { value: 1 },
      monitored: true,
      only_true: true,
      expandDescription: true,
      output: ['triggerid', 'priority', 'description', 'lastchange'],
      selectHosts: ['hostid', 'host'],
    }).catch(function () { return []; });

    // ── Todas as VMs no mesmo ESXi ───────────────────────────────
    var siblingVmsP = hvName
      ? rpc('item.get', {
        groupids: [CFG.vmGroupId],
        search: { name: 'VMware: CPU ready' },
        output: ['hostid', 'itemid', 'name', 'lastvalue'],
        selectHosts: ['hostid', 'host', 'name'],
        monitored: true,
        limit: 1000,
      }).then(function (items) {
        // incluir todas e filtrar no compute pelo hvName
        return items;
      }).catch(function () { return []; })
      : Promise.resolve([]);

    // Item "VMware: Hypervisor name" de TODAS as VMs com esse host
    var hvNamesP = rpc('item.get', {
      groupids: [CFG.vmGroupId],
      search: { name: 'VMware: Hypervisor name' },
      output: ['hostid', 'lastvalue'],
      monitored: true,
      limit: 5000,
    }).catch(function () { return []; });

    return Promise.all([vmItemsP, esxiItemsP, vmHistP, esxiHistP, triggersP, siblingVmsP, hvNamesP])
      .then(function (res) {
        return {
          vmItems: res[0], esxiItems: res[1], vmHist: res[2], esxiHist: res[3],
          triggers: res[4], siblingCpuReady: res[5], hvNames: res[6],
          fromTs: from, toTs: ts, bucketSec: bucketSec, hvName: hvName, vmHostId: vmHostId,
        };
      });
  }


  // ────────────────────────────────────────────────────────────────
  // [6] COMPUTE
  // ────────────────────────────────────────────────────────────────

  function firstHost(item) { return (item && item.hosts && item.hosts[0]) ? item.hosts[0] : null; }
  function hostLabel(h) { return (h && h.name && h.name.trim()) || (h && h.host) || null; }

  function compute(data) {
    var vmItems = data.vmItems, esxiItems = data.esxiItems, vmHist = data.vmHist, esxiHist = data.esxiHist;
    var triggers = data.triggers, siblingCpuReady = data.siblingCpuReady, hvNames = data.hvNames;
    var fromTs = data.fromTs, toTs = data.toTs, bucketSec = data.bucketSec, hvName = data.hvName, vmHostId = data.vmHostId;

    var TR = CFG.thresholds;

    // ── VM: itens actuais ────────────────────────────────────────
    var vmByName = {};
    var vmItemIds = {};
    var vmHostObj = null;
    vmItems.forEach(function (i) {
      vmByName[i.name] = parseFloat(i.lastvalue);
      vmItemIds[i.name] = i.itemid;
      if (!vmHostObj) vmHostObj = firstHost(i);
    });

    function pick(name, fallbackName) {
      if (vmByName[name] != null && !isNaN(vmByName[name])) return vmByName[name];
      if (fallbackName && vmByName[fallbackName] != null && !isNaN(vmByName[fallbackName])) return vmByName[fallbackName];
      return null;
    }

    var vmName = hostLabel(vmHostObj) || 'VM';
    var cpuReadyCurrent = (vmByName['VMware: CPU ready'] != null && !isNaN(vmByName['VMware: CPU ready'])) ? vmByName['VMware: CPU ready'] : null;
    var cpuVmCurrent = pick('CPU utilization', 'VMware: CPU usage in percents');
    var ramPctCurrent = (vmByName['VMware: Host memory usage in percents'] != null && !isNaN(vmByName['VMware: Host memory usage in percents'])) ? vmByName['VMware: Host memory usage in percents'] : null;
    var balloonCurrent = gbOf(vmByName['VMware: Ballooned memory'] || 0);
    var swapCurrent = gbOf(vmByName['VMware: Swapped memory'] || 0);

    var hvItem = null;
    for (var hi = 0; hi < vmItems.length; hi++) { if (vmItems[hi].name === 'VMware: Hypervisor name') { hvItem = vmItems[hi]; break; } }
    var hvNameFound = (hvItem && hvItem.lastvalue ? String(hvItem.lastvalue).split('.')[0] : null) || hvName;

    // ── ESXi: itens actuais ──────────────────────────────────────
    var esxiByName = {};
    var esxiItemIds = {};
    var esxiHostObj = null;
    esxiItems.forEach(function (i) {
      esxiByName[i.name] = parseFloat(i.lastvalue);
      esxiItemIds[i.name] = i.itemid;
      if (!esxiHostObj) esxiHostObj = firstHost(i);
    });

    var cpuEsxiCurrent = (esxiByName['VMware: CPU usage in percents'] != null && !isNaN(esxiByName['VMware: CPU usage in percents'])) ? esxiByName['VMware: CPU usage in percents'] : null;
    var ramEsxiPct = (esxiByName['VMware: Memory used percentage'] != null && !isNaN(esxiByName['VMware: Memory used percentage'])) ? esxiByName['VMware: Memory used percentage'] : null;
    var balloonEsxiGb = gbOf(esxiByName['VMware: Ballooned memory'] || 0);

    // ── Histórico: séries temporais ──────────────────────────────
    var vmH = histByItem(vmHist);
    var esxiH = histByItem(esxiHist);

    function serieOf(itemMap, histMap, name) {
      var id = itemMap[name];
      return id ? (histMap[id] || []) : [];
    }

    var serieCpuReady = serieOf(vmItemIds, vmH, 'VMware: CPU ready');
    var serieCpuVm = serieOf(vmItemIds, vmH, 'CPU utilization')
      .concat(serieOf(vmItemIds, vmH, 'VMware: CPU usage in percents'))
      .sort(function (a, b) { return a.t - b.t; });
    var serieRamVm = serieOf(vmItemIds, vmH, 'VMware: Host memory usage in percents');
    var serieBalloonVm = serieOf(vmItemIds, vmH, 'VMware: Ballooned memory');
    var serieCpuEsxi = serieOf(esxiItemIds, esxiH, 'VMware: CPU usage in percents');
    var serieRamEsxi = serieOf(esxiItemIds, esxiH, 'VMware: Memory used percentage');
    var serieBallEsxi = serieOf(esxiItemIds, esxiH, 'VMware: Ballooned memory');

    dbg('Séries — cpuReady:', serieCpuReady.length, 'cpuEsxi:', serieCpuEsxi.length);

    // ── Downsample para sparklines ───────────────────────────────
    function ds(s) { return downsample(s, bucketSec); }

    // ── Detecção de causa raiz ───────────────────────────────────
    var esxiWarnTs = firstCross(serieCpuEsxi, TR.cpuHost.warn);
    var vmCritTs = firstCross(serieCpuReady, TR.cpuReady.crit);
    var ramEsxiTs = firstCross(serieRamEsxi, TR.ramHost.warn);
    var balloonTs = firstCross(serieBalloonVm.map(function (p) { return { t: p.t, v: gbOf(p.v) }; }), TR.balloon.warn);

    var cpuCause = detectCause(esxiWarnTs, vmCritTs);
    var ramCause = detectCause(ramEsxiTs, balloonTs);

    // ── Markers para sparklines ──────────────────────────────────
    function markerPct(ts, f, t) { return ts ? (ts - f) / (t - f) : null; }

    var mkCpuEsxi = esxiWarnTs ? [{ pct: markerPct(esxiWarnTs, fromTs, toTs), val: cpuEsxiCurrent || TR.cpuHost.warn, type: 'warn' }] : [];
    var mkCpuReady = vmCritTs ? [{ pct: markerPct(vmCritTs, fromTs, toTs), val: cpuReadyCurrent || TR.cpuReady.crit, type: 'crit' }] : [];
    var mkRamEsxi = ramEsxiTs ? [{ pct: markerPct(ramEsxiTs, fromTs, toTs), val: ramEsxiPct || TR.ramHost.warn, type: 'warn' }] : [];
    var mkBalloon = balloonTs ? [{ pct: markerPct(balloonTs, fromTs, toTs), val: balloonCurrent, type: 'warn' }] : [];

    // ── VMs irmãs no mesmo ESXi ──────────────────────────────────
    var hvHostIds = {};
    hvNames.forEach(function (i) {
      if (String(i.lastvalue || '').split('.')[0] === hvNameFound) hvHostIds[i.hostid] = true;
    });
    var siblingList = siblingCpuReady
      .filter(function (i) { return hvHostIds[i.hostid]; })
      .map(function (i) {
        var h = firstHost(i);
        return { name: hostLabel(h) || '—', hostid: i.hostid, cpuReady: parseFloat(i.lastvalue) || 0 };
      })
      .sort(function (a, b) { return b.cpuReady - a.cpuReady; })
      .slice(0, 8);

    dbg('Siblings:', siblingList.length, 'hvHostIds:', Object.keys(hvHostIds).length);

    // ── Sequência de eventos ─────────────────────────────────────
    var events = [];
    function addEv(ts, layer, layerCol, desc, severity) {
      if (ts) events.push({ ts: ts, layer: layer, layerCol: layerCol, desc: desc, severity: severity });
    }

    addEv(esxiWarnTs, 'ESXi', C.info,
      (hvNameFound || 'ESXi') + ' CPU sobe para ' + fmtVal(cpuEsxiCurrent, 0) + '% (threshold ' + TR.cpuHost.warn + '%)', 'warn');
    addEv(ramEsxiTs, 'ESXi', C.info,
      (hvNameFound || 'ESXi') + ' RAM ultrapassa ' + TR.ramHost.warn + '% de utilização', 'warn');
    addEv(balloonTs, 'VM', C.warn,
      vmName + ' balloon RAM começa (' + balloonCurrent.toFixed(2) + ' GB actual)', 'warn');
    addEv(vmCritTs, 'VM', C.warn,
      vmName + ' CPU ready atinge ' + fmtVal(cpuReadyCurrent, 1) + '% (crítico >' + TR.cpuReady.crit + '%)', 'crit');

    triggers.forEach(function (t) {
      var ts2 = parseInt(t.lastchange, 10);
      var sev = parseInt(t.priority, 10) >= 4 ? 'crit' : 'warn';
      addEv(ts2, 'TRIG', C.crit, t.description, sev);
    });

    events.sort(function (a, b) { return a.ts - b.ts; });
    var firstTs = events.length ? events[0].ts : fromTs;
    events.forEach(function (e) { e.deltaMin = e.ts === firstTs ? null : Math.round((e.ts - firstTs) / 60); });

    // ── Diagnóstico ──────────────────────────────────────────────
    var findingText, findingCol, findingIcon;
    if (cpuCause.cause === 'esxi') {
      findingText = '<strong>Causa provável: contenção no ESXi.</strong> O host <strong>' + (hvNameFound || 'ESXi') + '</strong> superou ' + TR.cpuHost.warn + '% CPU ' + cpuCause.deltaMin + ' min antes do CPU ready da VM <strong>' + vmName + '</strong> entrar em estado crítico. A VM é vítima, não origem.';
      findingCol = C.warn;
      findingIcon = '⚠';
    } else if (cpuCause.cause === 'vm') {
      findingText = '<strong>Causa provável: carga interna na VM.</strong> O CPU ready de <strong>' + vmName + '</strong> subiu antes de qualquer anomalia no ESXi <strong>' + (hvNameFound || '—') + '</strong>. Investigar processos dentro da VM.';
      findingCol = C.crit;
      findingIcon = '🔴';
    } else if (cpuCause.cause === 'simultaneous') {
      findingText = '<strong>Evento simultâneo.</strong> CPU da VM e do ESXi subiram quase ao mesmo tempo (±' + cpuCause.deltaMin + ' min). Pode ser pico de carga coordenado ou evento externo (storage, rede).';
      findingCol = C.warn;
      findingIcon = '⚡';
    } else {
      var missing = [];
      if (cpuReadyCurrent == null) missing.push('item VMware: CPU ready ausente na VM (não monitorizado ou nome diferente)');
      if (!hvNameFound) missing.push('item VMware: Hypervisor name ausente — ESXi não resolvido');
      else if (cpuEsxiCurrent == null) missing.push('CPU do ESXi ' + hvNameFound + ' não encontrado no grupo ' + CFG.esxiGroupId + ' — verificar template');
      if (!serieCpuReady.length && cpuReadyCurrent != null) missing.push('sem histórico de CPU ready nas últimas ' + (CFG.historyMinutes / 60) + 'h');
      if (!serieCpuEsxi.length && cpuEsxiCurrent != null) missing.push('sem histórico de CPU ESXi nas últimas ' + (CFG.historyMinutes / 60) + 'h');

      if (missing.length) {
        findingText = '<strong>Dados insuficientes para correlação.</strong> O que está em falta: ' + missing.join(' · ') + '. Verificar CFG.vmGroupId=' + CFG.vmGroupId + ' e CFG.esxiGroupId=' + CFG.esxiGroupId + ' e activar CFG.debug=true para mais detalhe.';
        findingCol = C.warn;
        findingIcon = '⚙';
      } else {
        findingText = '<strong>Situação normal nas últimas ' + (CFG.historyMinutes / 60) + 'h.</strong> VM <strong>' + vmName + '</strong> no ESXi <strong>' + (hvNameFound || '—') + '</strong> — CPU ready e RAM abaixo dos thresholds. Sem incidente activo.';
        findingCol = C.ok;
        findingIcon = '✓';
      }
    }

    // ── Acções recomendadas ──────────────────────────────────────
    var actions = [];
    if (cpuCause.cause === 'esxi') {
      actions.push({ icon: '🖥', title: 'Verificar ' + (hvNameFound || 'ESXi'), body: 'CPU a ' + fmtVal(cpuEsxiCurrent, 0) + '% com ' + siblingList.length + ' VMs — avaliar vMotion de VMs com maior CPU ready', col: C.warn });
      actions.push({ icon: '↗', title: 'vMotion ' + vmName, body: 'Migrar para host com mais headroom. Verificar DRS ou acção manual via vCenter.', col: C.info });
    } else if (cpuCause.cause === 'vm') {
      actions.push({ icon: '🔍', title: 'Investigar processos VM', body: 'Aceder ao D5 de ' + vmName + ' e verificar CPU breakdown — user/privileged/DPC. Usar Task Manager ou PerfMon.', col: C.crit });
      actions.push({ icon: '⚙', title: 'Verificar aplicação', body: 'Contactar equipa de aplicações. CPU ready baixo descarta contenção no ESXi.', col: C.warn });
    } else {
      actions.push({ icon: '📊', title: 'Ampliar janela temporal', body: 'Mudar para 24h ou 7d para ver se o padrão é recorrente ou pontual.', col: C.mute });
    }
    if (balloonCurrent > TR.balloon.warn || swapCurrent > 0.1) {
      actions.push({ icon: '💾', title: 'Pressão de RAM activa', body: 'Balloon: ' + balloonCurrent.toFixed(2) + ' GB · Swap: ' + swapCurrent.toFixed(2) + ' GB. Verificar RAM alocada vs usada no host.', col: C.crit });
    }
    if (actions.length < 3) {
      actions.push({ icon: '🔗', title: 'Escalar se necessário', body: cpuCause.cause === 'esxi' ? 'Causa no ESXi → equipa de infra/virtualização.' : 'Causa na VM → equipa de sistemas.', col: C.mute });
    }

    // ── Axis ticks ───────────────────────────────────────────────
    var ticks = axisTicks(fromTs, toTs, 6);

    return {
      vmName: vmName, hvNameFound: hvNameFound,
      cpuReadyCurrent: cpuReadyCurrent, cpuVmCurrent: cpuVmCurrent, cpuEsxiCurrent: cpuEsxiCurrent,
      ramPctCurrent: ramPctCurrent, ramEsxiPct: ramEsxiPct, balloonCurrent: balloonCurrent,
      swapCurrent: swapCurrent, balloonEsxiGb: balloonEsxiGb,
      dsCpuReady: ds(serieCpuReady),
      dsCpuVm: ds(serieCpuVm),
      dsCpuEsxi: ds(serieCpuEsxi),
      dsRamVm: ds(serieRamVm),
      dsRamEsxi: ds(serieRamEsxi),
      dsBalloonVm: ds(serieBalloonVm.map(function (p) { return { t: p.t, v: gbOf(p.v) }; })),
      mkCpuEsxi: mkCpuEsxi, mkCpuReady: mkCpuReady, mkRamEsxi: mkRamEsxi, mkBalloon: mkBalloon,
      cpuCause: cpuCause, ramCause: ramCause,
      findingText: findingText, findingCol: findingCol, findingIcon: findingIcon,
      events: events, ticks: ticks,
      siblingList: siblingList,
      actions: actions,
      esxiHostId: esxiHostObj ? esxiHostObj.hostid : null,
    };
  }


  // ────────────────────────────────────────────────────────────────
  // [7] RENDER
  // ────────────────────────────────────────────────────────────────

  function render(d, vmHostId) {
    var TR = CFG.thresholds;

    function cpuReadyCol(v) {
      return v >= TR.cpuReady.crit ? C.crit : v >= TR.cpuReady.warn ? C.warn : C.ok;
    }
    function cpuEsxiCol(v) {
      return v >= TR.cpuHost.crit ? C.crit : v >= TR.cpuHost.warn ? C.warn : C.ok;
    }
    function ramCol(v) {
      return v >= TR.ramHost.crit ? C.crit : v >= TR.ramHost.warn ? C.warn : C.ok;
    }

    var crCol = cpuReadyCol(d.cpuReadyCurrent || 0);
    var ceCol = cpuEsxiCol(d.cpuEsxiCurrent || 0);
    var reCol = ramCol(d.ramEsxiPct || 0);
    var rvCol = ramCol(d.ramPctCurrent || 0);
    var balCol = d.balloonCurrent > TR.balloon.warn ? C.warn : C.ok;

    var stateLabel = d.cpuCause.cause === 'esxi' || d.cpuCause.cause === 'vm' ? 'INCIDENTE' : 'NORMAL';
    var stateCol = d.cpuCause.cause === 'esxi' ? C.warn : d.cpuCause.cause === 'vm' ? C.crit : C.ok;

    var spCpuReady = T.spark(d.dsCpuReady, crCol, d.mkCpuReady, TR.cpuReady.warn, TR.cpuReady.crit);
    var spCpuVm = T.spark(d.dsCpuVm, C.mute, [], null, null);
    var spCpuEsxi = T.spark(d.dsCpuEsxi, ceCol, d.mkCpuEsxi, TR.cpuHost.warn, TR.cpuHost.crit);
    var spRamVm = T.spark(d.dsRamVm, rvCol, [], TR.ramHost.warn, TR.ramHost.crit);
    var spRamEsxi = T.spark(d.dsRamEsxi, reCol, d.mkRamEsxi, TR.ramHost.warn, TR.ramHost.crit);
    var spBalloon = T.spark(d.dsBalloonVm, balCol, d.mkBalloon, TR.balloon.warn, null);

    var crBadge = d.cpuReadyCurrent != null ? fmtVal(d.cpuReadyCurrent, 1) + '% ready' : 'sem dados';
    var ceBadge = d.cpuEsxiCurrent != null ? fmtVal(d.cpuEsxiCurrent, 0) + '% CPU' : 'sem dados';
    var reBadge = d.ramEsxiPct != null ? fmtVal(d.ramEsxiPct, 0) + '% RAM' : 'sem dados';
    var rvBadge = d.ramPctCurrent != null ? fmtVal(d.ramPctCurrent, 0) + '% RAM' : 'sem dados';
    var blBadge = d.balloonCurrent.toFixed(2) + ' GB';

    var vmLink = CFG.grafanaUrl + CFG.grafanaDash.vmDetail + '?var-hostid=' + vmHostId;
    var esxiLink = d.esxiHostId
      ? CFG.grafanaUrl + CFG.grafanaDash.esxiDetail + '?var-hostid=' + d.esxiHostId
      : CFG.grafanaUrl + CFG.grafanaDash.esxiDetail;

    var evRows = d.events.length
      ? d.events.map(function (e) {
        return T.evRow(fmtTime(e.ts), e.layer, e.layerCol, e.desc, e.deltaMin, e.severity);
      }).join('')
      : '<div style="font-size:11px;color:' + C.mute + ';padding:6px;">Sem eventos nos últimos ' + (CFG.historyMinutes / 60) + 'h</div>';

    var vmRows = d.siblingList.length
      ? d.siblingList.map(function (v) {
        var col = v.cpuReady >= TR.cpuReady.crit ? C.crit : v.cpuReady >= TR.cpuReady.warn ? C.warn : C.ok;
        return T.vmRow(v.name, fmtVal(v.cpuReady, 1), '%', col, v.cpuReady * 3);
      }).join('')
      : '<div style="font-size:11px;color:' + C.mute + ';padding:6px;">Sem dados de VMs no mesmo ESXi</div>';

    var actionCards = d.actions.slice(0, 3)
      .map(function (a) { return T.actionCard(a.icon, a.title, a.body, a.col); }).join('');

    var ticksHtml = d.ticks.map(function (t) { return '<span class="ec-axis-tick">' + T.esc(t) + '</span>'; }).join('');

    return '<style>' + STYLES + '</style>'
      + '<div class="ec-wrap">'
      + '<div class="ec-topbar">'
      + '<span class="ec-topbar-title">Event Correlation</span>'
      + '<span class="ec-pill ec-pill-vm">VM&nbsp; ' + T.esc(d.vmName) + '</span>'
      + '<span class="ec-pill ec-pill-esxi">ESXi&nbsp; ' + T.esc(d.hvNameFound || '—') + '</span>'
      + T.badge(stateLabel, stateCol)
      + '<div class="ec-stat-group">'
      + '<div class="ec-stat"><div class="ec-stat-val" style="color:' + crCol + ';">' + fmtVal(d.cpuReadyCurrent, 1) + '%</div><div class="ec-stat-lbl">CPU ready</div></div>'
      + '<div class="ec-stat"><div class="ec-stat-val">' + fmtVal(d.cpuVmCurrent, 0) + '%</div><div class="ec-stat-lbl">CPU VM</div></div>'
      + '<div class="ec-stat"><div class="ec-stat-val" style="color:' + ceCol + ';">' + fmtVal(d.cpuEsxiCurrent, 0) + '%</div><div class="ec-stat-lbl">CPU ESXi</div></div>'
      + '<div class="ec-stat"><div class="ec-stat-val" style="color:' + balCol + ';">' + d.balloonCurrent.toFixed(2) + '</div><div class="ec-stat-lbl">balloon GB</div></div>'
      + '<div style="display:flex;gap:5px;align-items:center;margin-left:4px;">'
      + '<a class="ec-link" href="' + T.esc(vmLink) + '" target="_blank">VM ↗</a>'
      + '<a class="ec-link" href="' + T.esc(esxiLink) + '" target="_blank">ESXi ↗</a>'
      + '</div>'
      + '</div>'
      + '</div>'

      + T.finding(d.findingText, d.findingCol, d.findingIcon)

      + '<div class="ec-body">'
      + '<div class="ec-timeline">'
      + '<div class="ec-tl-title">Linha de tempo · últimas ' + (CFG.historyMinutes / 60) + 'h · resolução ' + CFG.bucketMinutes + 'min</div>'
      + T.lane('CPU ready · VM', d.vmName + ' · contenção hypervisor', crCol, d.cpuReadyCurrent, '%', spCpuReady, crBadge)
      + T.lane('CPU utilização · VM', d.vmName + ' · agente/VMware', C.mute, d.cpuVmCurrent, '%', spCpuVm, fmtVal(d.cpuVmCurrent, 0) + '% util')
      + T.lane('CPU host · ESXi', (d.hvNameFound || '—') + ' · VMware', ceCol, d.cpuEsxiCurrent, '%', spCpuEsxi, ceBadge)
      + '<div class="ec-sep"></div>'
      + T.lane('RAM % · VM', d.vmName + ' · VMware', rvCol, d.ramPctCurrent, '%', spRamVm, rvBadge)
      + T.lane('Balloon · VM', d.vmName + ' · GB', balCol, d.balloonCurrent, 'GB', spBalloon, blBadge)
      + T.lane('RAM % · ESXi', (d.hvNameFound || '—') + ' · VMware', reCol, d.ramEsxiPct, '%', spRamEsxi, reBadge)
      + '<div class="ec-axis">' + ticksHtml + '</div>'
      + '</div>'

      + '<div class="ec-sidebar">'
      + '<div class="ec-side-section"><div class="ec-side-title">Sequência de eventos</div><div class="ec-ev-list">' + evRows + '</div></div>'
      + '<div class="ec-side-section"><div class="ec-side-title">VMs no mesmo ESXi · CPU ready</div><div class="ec-vm-list">' + vmRows + '</div></div>'
      + '</div>'

      + '</div>'

      + '<div class="ec-action">' + actionCards + '</div>'
      + '</div>';
  }


  // ────────────────────────────────────────────────────────────────
  // [8] BOOTSTRAP
  //
  // Resiliente: não depende de waitForBPC estar pré-carregado.
  // Constrói o seu próprio rpc() a partir do datasource Grafana-Zabbix
  // e faz retry até o elemento DOM estar disponível.
  // ────────────────────────────────────────────────────────────────

  function buildRpc() {
    // Tenta usar o BPC rpc se já disponível — evita duplicar auth
    if (typeof window.waitForBPC === 'function' && window.BPC && window.BPC.rpc) {
      return Promise.resolve(window.BPC.rpc);
    }

    // Fallback: descobrir datasource Zabbix via API Grafana
    return fetch(CFG.grafanaUrl + '/api/datasources', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
      .then(function (r) { return r.json(); })
      .then(function (sources) {
        var ds = (sources || []).filter(function (s) {
          return s.type === 'alexanderzobnin-zabbix-datasource' ||
            (s.type && s.type.indexOf('zabbix') >= 0);
        })[0];
        if (!ds) throw new Error('Datasource Zabbix não encontrada. Verificar Grafana → Connections → Data sources.');

        var dsUid = ds.uid || ds.id;
        dbg('Datasource Zabbix encontrada:', ds.name, 'uid:', dsUid);

        // Chamar directamente a API Zabbix via endpoint de proxy do datasource Grafana
        var rpcDirect = function (method, params) {
          return fetch(
            CFG.grafanaUrl + '/api/datasources/proxy/uid/' + dsUid + '/api_jsonrpc.php',
            {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: Date.now() }),
            }
          ).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status + ' ao chamar ' + method);
            return r.json();
          }).then(function (res) {
            if (res.error) throw new Error('Zabbix API error ' + res.error.code + ': ' + (res.error.data || res.error.message));
            return res.result || [];
          });
        };

        return rpcDirect;
      });
  }

  // ── Aguardar elemento DOM ─────────────────────────────────────
  function waitForEl(id, cb, maxMs) {
    if (maxMs == null) maxMs = 15000;
    var el = document.getElementById(id);
    if (el) { cb(el); return; }
    var t0 = Date.now();
    var iv = setInterval(function () {
      var el2 = document.getElementById(id);
      if (el2) { clearInterval(iv); cb(el2); return; }
      if (Date.now() - t0 > maxMs) {
        clearInterval(iv);
        console.warn('[BPC-EC] elemento #' + id + ' não encontrado após ' + maxMs + 'ms');
      }
    }, 200);
  }

  // ── Card de erro standalone ───────────────────────────────────
  function errorCard(msg, hint) {
    return '<style>' + STYLES + '</style>'
      + '<div class="ec-wrap">'
      + '<div class="ec-center" style="flex-direction:column;gap:8px;">'
      + '<div style="font-size:22px;color:' + C.crit + ';">⚠</div>'
      + '<div style="font-size:13px;font-weight:600;color:' + C.crit + ';">' + T.esc(msg) + '</div>'
      + (hint ? '<div style="font-size:11px;color:' + C.mute + ';max-width:440px;text-align:center;">' + T.esc(hint) + '</div>' : '')
      + '</div>'
      + '</div>';
  }

  // ── Aguardar BPC ou arrancar standalone ───────────────────────
  function initWithRetry(attempt) {
    attempt = attempt || 0;
    if (typeof window.waitForBPC === 'function') {
      window.waitForBPC(startDashboard);
      return;
    }
    if (attempt < 25) {
      setTimeout(function () { initWithRetry(attempt + 1); }, 200);
      return;
    }
    dbg('BPC não disponível — modo standalone');
    buildRpc()
      .then(function (rpc) { startDashboard(rpc); })
      .catch(function (err) {
        console.error('[BPC-EC] Falha no modo standalone:', err);
        var el = document.getElementById(CFG.elementId);
        if (el) {
          el.innerHTML = errorCard('Sem ligação ao Grafana/Zabbix',
            (err && err.message ? err.message : String(err))
            + ' — Verificar: (1) sessão Grafana activa em ' + CFG.grafanaUrl
            + '; (2) datasource Zabbix configurada; (3) sem erros de CORS na consola (F12 → Network).');
        }
      });
  }

  // ── Função principal do dashboard ─────────────────────────────
  function startDashboard(rpc) {
    waitForEl(CFG.elementId, function (el) {

      el.innerHTML = '<style>' + STYLES + '</style>'
        + '<div class="ec-wrap"><div class="ec-center" style="flex-direction:column;gap:8px;">'
        + '<div style="font-size:13px;color:' + C.mute + ';">A carregar correlação…</div>'
        + '</div></div>';

      var vmHostId = urlVar('hostid') || urlVar('var-hostid') || CFG.vmHostId || null;

      if (!vmHostId) {
        renderSelector(el, rpc);
        return;
      }

      startCorrelation(el, rpc, vmHostId);
    });
  }

  // ── Selector de VM (standalone / sem variável URL) ─────────────
  function renderSelector(el, rpc) {
    el.innerHTML = '<style>' + STYLES + '</style>'
      + '<div class="ec-wrap"><div class="ec-center" style="flex-direction:column;gap:12px;">'
      + '<div style="font-size:13px;font-weight:600;">Seleccionar VM</div>'
      + '<div style="font-size:11px;color:' + C.mute + ';" id="ec-sel-status">A carregar lista de VMs do grupo ' + CFG.vmGroupId + '…</div>'
      + '<div id="ec-sel-wrap" style="display:none;flex-direction:column;gap:8px;align-items:center;">'
      + '<select id="ec-sel-vm" style="background:#161b22; color:#E6EDF3; border:1px solid rgba(255,255,255,0.15); border-radius:6px; padding:7px 12px; font-size:12px; font-family:' + CFG.fontMono + '; min-width:320px; cursor:pointer;">'
      + '<option value="">— escolher VM —</option>'
      + '</select>'
      + '<button id="ec-sel-btn" style="background:rgba(88,166,255,.15); color:' + C.info + '; border:1px solid rgba(88,166,255,.3); border-radius:6px; padding:7px 20px; font-size:12px; cursor:pointer; font-family:' + CFG.fontBody + '; font-weight:600;">Analisar correlação →</button>'
      + '</div>'
      + '</div></div>';

    rpc('item.get', {
      groupids: [CFG.vmGroupId],
      search: { name: 'VMware: Power state' },
      output: ['hostid', 'lastvalue'],
      selectHosts: ['hostid', 'host', 'name'],
      monitored: true,
      limit: 5000,
    })
      .then(function (items) {
        var vms = items
          .filter(function (i) {
            var v = String(i.lastvalue || '').toLowerCase();
            return v === '1' || v === 'poweredon';
          })
          .map(function (i) {
            var h = firstHost(i);
            return { hostid: i.hostid, label: hostLabel(h) || i.hostid, host: (h && h.host) || '' };
          })
          .sort(function (a, b) { return a.label.localeCompare(b.label); });

        var status = document.getElementById('ec-sel-status');
        var wrap = document.getElementById('ec-sel-wrap');
        var sel = document.getElementById('ec-sel-vm');
        var btn = document.getElementById('ec-sel-btn');
        if (!status || !wrap || !sel || !btn) return;

        if (!vms.length) {
          status.textContent = 'Sem VMs activas no grupo ' + CFG.vmGroupId + '. Verificar CFG.vmGroupId.';
          return;
        }

        status.textContent = vms.length + ' VMs activas disponíveis';
        vms.forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = v.hostid;
          opt.textContent = v.label + '  [' + v.host + ']';
          sel.appendChild(opt);
        });
        wrap.style.display = 'flex';

        btn.addEventListener('click', function () {
          var chosen = sel.value;
          if (!chosen) return;
          startCorrelation(el, rpc, chosen);
        });
      })
      .catch(function (err) {
        var status = document.getElementById('ec-sel-status');
        if (status) status.textContent = 'Erro ao carregar VMs: ' + (err && err.message ? err.message : err);
      });
  }

  // ── Correlação principal ──────────────────────────────────────
  function startCorrelation(el, rpc, vmHostId) {
    var pending = false;
    var refreshTimer = null;

    function resolveHvName() {
      return rpc('item.get', {
        hostids: [vmHostId],
        search: { name: 'VMware: Hypervisor name' },
        output: ['lastvalue'],
        limit: 1,
      }).then(function (items) {
        var raw = (items && items[0] && items[0].lastvalue) || '';
        return raw.split('.')[0] || null;
      }).catch(function () { return null; });
    }

    function load() {
      if (pending) return;
      pending = true;

      resolveHvName()
        .then(function (hvName) {
          dbg('hvName resolvido:', hvName);
          return fetchData(rpc, vmHostId, hvName);
        })
        .then(function (data) {
          var d = compute(data);
          el.innerHTML = render(d, vmHostId);

          // Botão "← Escolher outra VM" — só no modo standalone
          if (!urlVar('hostid') && !urlVar('var-hostid')) {
            var bar = el.querySelector('.ec-topbar');
            if (bar) {
              var btn = document.createElement('button');
              btn.textContent = '← Escolher VM';
              btn.style.cssText = 'background:rgba(255,255,255,.05); color:' + C.mute + '; border:1px solid rgba(255,255,255,.1); border-radius:4px; padding:2px 9px; font-size:10px; cursor:pointer; font-family:' + CFG.fontBody + '; margin-left:8px;';
              btn.addEventListener('click', function () {
                if (refreshTimer) clearInterval(refreshTimer);
                renderSelector(el, rpc);
              });
              bar.appendChild(btn);
            }
          }
        })
        .catch(function (err) {
          if (CFG.debug) console.error('[BPC-EC v1.1]', err);
          el.innerHTML = errorCard('Erro ao carregar correlação', (err && err.message ? err.message : String(err)));
        })
        .then(function () { pending = false; }, function () { pending = false; });
    }

    load();
    refreshTimer = setInterval(load, CFG.refreshMs);
  }

  // ── Arranque ──────────────────────────────────────────────────
  initWithRetry();

}());
