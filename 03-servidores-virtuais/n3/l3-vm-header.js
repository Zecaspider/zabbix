(function () {

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ════════════════════════════════════════════════════════════
  // D5-Detalhe-VM · ROW 0 · HEADER  v4.0
  // Business Text — ES5, sem dependências externas
  //<div id="bt-vm-header"></div>
  // Reactividade: query dumb força re-render do BT quando a
  // variável Grafana muda. O JS lê var-hostid do URL em cada
  // execução — sem eventos, sem polling, sem listeners.
  //
  // Estrutura:
  //   [1] CFG
  //   [2] UTILS
  //   [3] CSS
  //   [4] TEMPLATES
  //   [5] FETCH
  //   [6] COMPUTE
  //   [7] RENDER
  //   [8] BOOTSTRAP
  // ════════════════════════════════════════════════════════════


  // ────────────────────────────────────────────────────────────
  // [1] CFG
  // ────────────────────────────────────────────────────────────

  var CFG = {
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId: 'bt-vm-header',

    groupsIgnore: ['Linux Servers', 'Windows Servers', 'Discovered', 'Virtual machines', 'Zabbix'],
    groupsMax: 2,

    // Limites de resultados das chamadas API
    apiLimits: { items: 50000, history: 10000, triggers: 20000 },

    // Retry com backoff exponencial (sem circuit breaker do BPC Runtime)
    retry: { maxAttempts: 3, baseDelayMs: 1000 },

    itemNames: [
      'System name',
      'Uptime',
      'Operating system',
      'Operating system architecture',
      'Total memory',
      'Number of cores',
      'System local time',
      'System hostname',
      'System uptime',
      'VMware: Power state',
      'VMware: Uptime of guest OS',
      'VMware: Guest OS ID',
      'VMware: Number of virtual CPUs',
      'VMware: Memory size',
      'VMware: Hypervisor name',
      ': Speed',
    ],

    colors: {
      ok:   '#3FB950',
      crit: '#F85149',
      info: '#58A6FF',
      warn: '#D29922',
      mute: '#6E7681',
      win:  '#0078D4',
      lnx:  '#F0A500',
      bsd:  '#AB7967',
      vm:   '#58A6FF',
      text: '#CDD9E5',
      sub:  '#8B949E',
    },

    // Navegação: UIDs dos dashboards pai
    dashN2sv:  '0758c24e-d2b1-4a81-bb14-1788ac8bec68',
    dashN2vmw: 'a967e936-99a3-47c8-af98-052d7a80beb8',
  };


  // PROXY construído a partir do CFG — nunca hardcoded
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  // ── Guard anti-double-fire (CLAUDE.md §4C.7 / _l3-base.js BLOCO A) ──
  var _sig = null;
  var _myToken = null;
  function _isCurrent() {
    return window.__bpc_ns && window.__bpc_ns[CFG.rootId] &&
           window.__bpc_ns[CFG.rootId].token === _myToken;
  }

  // Regex de grupos a ignorar, construída a partir de CFG.groupsIgnore
  var IGNORE_RE = new RegExp('^(' + CFG.groupsIgnore.join('|') + ')', 'i');

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

    // Card de erro explícito (causa + acção correctiva)
    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:15.5px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; HEADER</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:14px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:12.5px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },

    hexRgb: function (hex) {
      var h = hex.replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ].join(',');
    },

    fmtRam: function (raw) {
      var b = parseFloat(raw);
      if (!raw || isNaN(b) || b <= 0) return null;
      if (b < 1048576) return b.toFixed(0) + ' GB';
      var gb = b / 1073741824;
      if (gb >= 1024) return (gb / 1024).toFixed(1) + ' TB';
      return gb.toFixed(0) + ' GB';
    },

    fmtSpeed: function (raw) {
      var b = parseFloat(raw);
      if (!raw || isNaN(b) || b <= 0) return null;
      if (b >= 1e9) return (b / 1e9).toFixed(0) + ' Gbps';
      if (b >= 1e6) return (b / 1e6).toFixed(0) + ' Mbps';
      if (b >= 1e3) return (b / 1e3).toFixed(0) + ' Kbps';
      return b + ' bps';
    },

    fmtUptime: function (raw) {
      var s = parseInt(raw);
      if (!raw || isNaN(s) || s <= 0) return null;
      var d = Math.floor(s / 86400);
      var h = Math.floor((s % 86400) / 3600);
      var m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
      if (h > 0) return h + 'h ' + m + 'm';
      return m + 'm';
    },

    fmtLocalTime: function (raw) {
      var ts = parseInt(raw);
      if (!raw || isNaN(ts)) return null;
      return new Date(ts * 1000)
        .toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    },

    getVal: function (items, name) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].name === name) return items[i].lastvalue;
      }
      return null;
    },

    getFirst: function (items, names) {
      for (var n = 0; n < names.length; n++) {
        var v = U.getVal(items, names[n]);
        if (v !== null) return v;
      }
      return null;
    },

    getContains: function (items, substr) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].name && items[i].name.indexOf(substr) >= 0)
          return items[i].lastvalue;
      }
      return null;
    },

    // Extrai nome técnico do valor completo da variável
    // "ACM - VM - VS8000345 (Win · QA...)" → "VS8000345"
    extractHostName: function (raw) {
      var semParentese = raw.split('(')[0].trim();
      var partes = semParentese.split(/\s*-\s*/);
      return partes[partes.length - 1].trim();
    },
  };


  // ────────────────────────────────────────────────────────────
  // [3] CSS
  // ────────────────────────────────────────────────────────────

  var CSS = [
    '<style>',
    '#bt-vm-header *{box-sizing:border-box;margin:0;padding:0;}',

    '#bt-vm-header .h-wrap{',
    '  display:flex;align-items:center;gap:14px;flex-wrap:wrap;',
    '  padding:10px 16px;',
    '  background:linear-gradient(90deg,#0d1117 0%,#0f1923 100%);',
    '  border:1px solid rgba(255,255,255,.07);',
    '  border-radius:6px;',
    '  font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif;',
    '  min-height:60px;',
    '}',

    '#bt-vm-header .h-left{',
    '  display:flex;align-items:center;gap:10px;flex:1;min-width:0;flex-wrap:wrap;',
    '}',

    '#bt-vm-header .h-os{',
    '  flex-shrink:0;width:42px;height:42px;border-radius:5px;',
    '  display:flex;align-items:center;justify-content:center;',
    '  font-size:14px;font-weight:700;letter-spacing:.05em;',
    '}',

    '#bt-vm-header .h-id{display:flex;flex-direction:column;gap:2px;min-width:0;}',

    '#bt-vm-header .h-title{',
    '  display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;',
    '}',

    '#bt-vm-header .h-tech{',
    '  font-family:monospace;font-size:21px;font-weight:700;',
    '  color:' + CFG.colors.text + ';',
    '}',

    '#bt-vm-header .h-name{font-size:18px;color:' + CFG.colors.sub + ';}',

    '#bt-vm-header .h-desc{',
    '  font-size:14px;color:' + CFG.colors.mute + ';letter-spacing:.02em;',
    '}',

    '#bt-vm-header .h-pills{',
    '  display:flex;gap:5px;flex-wrap:wrap;align-items:center;',
    '}',

    '#bt-vm-header .h-pill{',
    '  font-size:14px;font-weight:700;letter-spacing:.07em;',
    '  padding:2px 9px;border-radius:3px;white-space:nowrap;',
    '}',

    '#bt-vm-header .h-sep{',
    '  width:1px;background:rgba(255,255,255,.07);',
    '  align-self:stretch;flex-shrink:0;',
    '}',

    '#bt-vm-header .h-meta{',
    '  display:flex;gap:18px;flex-wrap:wrap;flex-shrink:0;',
    '}',

    '#bt-vm-header .h-kv{',
    '  display:flex;flex-direction:column;align-items:center;gap:1px;',
    '}',

    '#bt-vm-header .h-kv-val{',
    '  font-family:monospace;font-size:18px;font-weight:700;',
    '  color:' + CFG.colors.text + ';white-space:nowrap;',
    '}',

    '#bt-vm-header .h-kv-key{',
    '  font-size:12.5px;color:' + CFG.colors.mute + ';',
    '  text-transform:uppercase;letter-spacing:.08em;',
    '}',

    '</style>',
  ].join('');


  // ────────────────────────────────────────────────────────────
  // [4] TEMPLATES
  // ────────────────────────────────────────────────────────────

  var T = {

    pill: function (txt, color) {
      var rgb = U.hexRgb(color);
      return '<span class="h-pill" style="'
        + 'color:' + color + ';'
        + 'background:rgba(' + rgb + ',.12);'
        + 'border:1px solid rgba(' + rgb + ',.28);'
        + '">' + U.esc(txt) + '</span>';
    },

    osBadge: function (label, color) {
      var rgb = U.hexRgb(color);
      return '<div class="h-os" style="'
        + 'color:' + color + ';'
        + 'background:rgba(' + rgb + ',.10);'
        + 'border:1px solid rgba(' + rgb + ',.25);'
        + '">' + U.esc(label) + '</div>';
    },

    kv: function (val, key) {
      if (val === null || val === undefined) return '';
      return '<div class="h-kv">'
        + '<span class="h-kv-val">' + U.esc(String(val)) + '</span>'
        + '<span class="h-kv-key">' + U.esc(key) + '</span>'
        + '</div>';
    },
  };


  // ────────────────────────────────────────────────────────────
  // [5] FETCH
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
      output: ['hostid', 'host', 'name'],
      filter: { host: [hostName] },
      selectGroups: ['name'],
    })
    .then(function (hosts) {
      if (!hosts || hosts.length === 0)
        throw new Error('Host não encontrado: ' + hostName);

      var host = hosts[0];

      return Promise.all([
        host,

        zbx('item.get', {
          hostids: [host.hostid],
          output: ['name', 'lastvalue', 'key_'],
          search: { name: CFG.itemNames },
          searchByAny: true,
          monitored: true,
          limit: CFG.apiLimits.items,
        }),

        zbx('item.get', {
          hostids: [host.hostid],
          output: ['lastvalue'],
          search: { key_: 'agent.version' },
          limit: 1,
        }),
      ]);
    });
  }


  // ────────────────────────────────────────────────────────────
  // [6] COMPUTE
  // ────────────────────────────────────────────────────────────

  function compute(results) {
    var host    = results[0];
    var items   = results[1];
    var agItems = results[2];

    var hostTech    = host.host || '—';
    var hostDisplay = (host.name && host.name !== host.host) ? host.name : '';
    var groups = (host.groups || [])
      .map(function (g) { return g.name; })
      .filter(function (n) { return !IGNORE_RE.test(n); });

    var agentVersion = agItems.length > 0 ? agItems[0].lastvalue : null;
    var hasAgent     = !!agentVersion;

    var powerRaw  = U.getVal(items, 'VMware: Power state');
    var hasVmware = powerRaw !== null;
    var powerOn   = hasVmware
      ? (String(powerRaw).toLowerCase().indexOf('on') >= 0 || powerRaw === '1')
      : hasAgent ? true : null;

    var osLabel, osColor;
    var guestId = U.getVal(items, 'VMware: Guest OS ID') || '';
    var osFull  = U.getFirst(items, ['Operating system', 'System description']) || '';
    var osStr   = (guestId + ' ' + osFull).toLowerCase();

    if (osStr.indexOf('windows') >= 0) {
      var winMatch = (guestId + osFull).match(/(\d{4})/);
      osLabel = 'WIN' + (winMatch ? ' ' + winMatch[1] : '');
      osColor = CFG.colors.win;
    } else if (osStr.match(/linux|ubuntu|centos|rhel|debian/)) {
      osLabel = 'LNX';
      osColor = CFG.colors.lnx;
    } else if (osStr.indexOf('freebsd') >= 0) {
      osLabel = 'BSD';
      osColor = CFG.colors.bsd;
    } else {
      osLabel = 'VM';
      osColor = CFG.colors.vm;
    }

    var uptime    = U.getFirst(items, ['Uptime', 'VMware: Uptime of guest OS']);
    var ram       = U.getFirst(items, ['Total memory', 'VMware: Memory size']);
    var cores     = U.getFirst(items, ['Number of cores', 'VMware: Number of virtual CPUs']);
    var arch      = U.getVal(items, 'Operating system architecture');
    var hvName    = U.getVal(items, 'VMware: Hypervisor name');
    var localTime = U.getVal(items, 'System local time');
    var nicSpeed  = U.getContains(items, ': Speed');

    return {
      hostTech:     hostTech,
      hostDisplay:  hostDisplay,
      groups:       groups,
      hasAgent:     hasAgent,
      agentVersion: agentVersion,
      powerOn:      powerOn,
      osLabel:      osLabel,
      osColor:      osColor,
      uptime:       U.fmtUptime(uptime),
      ram:          U.fmtRam(ram),
      cores:        cores || null,
      arch:         arch || null,
      hvShort:      hvName ? hvName.split('.')[0] : null,
      localTime:    U.fmtLocalTime(localTime),
      nicSpeed:     U.fmtSpeed(nicSpeed),
    };
  }


  // ────────────────────────────────────────────────────────────
  // [7] RENDER
  // ────────────────────────────────────────────────────────────

  function render(d) {
    var C = CFG.colors;

    var statePill = d.powerOn === null
      ? T.pill('ESTADO DESCONHECIDO', C.mute)
      : T.pill(d.powerOn ? 'UP' : 'DOWN', d.powerOn ? C.ok : C.crit);

    var agentPill = d.hasAgent
      ? T.pill('Agente ' + d.agentVersion, C.ok)
      : T.pill('Sem agente', C.mute);

    var hvPill = d.hvShort
      ? T.pill('ESXi: ' + d.hvShort, C.info)
      : '';

    var groupPills = d.groups
      .slice(0, CFG.groupsMax)
      .map(function (g) { return T.pill(g, C.mute); })
      .join('');

    var desc = d.groups.slice(CFG.groupsMax).join(' · ');

    var metaParts = [
      T.kv(d.uptime,    'uptime'),
      T.kv(d.cores,     'cores'),
      T.kv(d.arch,      'arch'),
      T.kv(d.ram,       'RAM'),
      T.kv(d.nicSpeed,  'NIC'),
      T.kv(d.localTime, 'hora local'),
    ].join('');

    var backNav = '<div style="display:flex;gap:6px;margin-bottom:6px;align-items:center">'
      + '<a href="/d/' + CFG.dashN2sv + '/n2-servidores-virtuais" style="'
      + 'font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;'
      + 'color:' + C.info + ';text-decoration:none;letter-spacing:.05em;'
      + 'padding:2px 8px;border:1px solid rgba(88,166,255,.25);border-radius:3px;'
      + 'background:rgba(88,166,255,.06);white-space:nowrap;">'
      + '← N2 · SERVIDORES VIRTUAIS</a>'
      + '<a href="/d/' + CFG.dashN2vmw + '/n2-infraestrutura-vmware" style="'
      + 'font-family:\'IBM Plex Mono\',monospace;font-size:14px;font-weight:600;'
      + 'color:' + C.mute + ';text-decoration:none;letter-spacing:.05em;'
      + 'padding:2px 8px;border:1px solid rgba(110,118,129,.2);border-radius:3px;'
      + 'background:rgba(110,118,129,.05);white-space:nowrap;">'
      + 'N2 · INFRAESTRUTURA VMware</a>'
      + '</div>';

    return CSS + [
      backNav,
      '<div class="h-wrap">',
      '  <div class="h-left">',
      '    ' + T.osBadge(d.osLabel, d.osColor),
      '    <div class="h-id">',
      '      <div class="h-title">',
      '        <span class="h-tech">' + U.esc(d.hostTech) + '</span>',
      d.hostDisplay
        ? '<span class="h-name">· ' + U.esc(d.hostDisplay) + '</span>'
        : '',
      '      </div>',
      desc ? '<div class="h-desc">' + U.esc(desc) + '</div>' : '',
      '    </div>',
      '    <div class="h-pills">',
      '      ' + statePill,
      '      ' + agentPill,
      '      ' + hvPill,
      '      ' + groupPills,
      '    </div>',
      '  </div>',
      '  <div class="h-sep"></div>',
      '  <div class="h-meta">' + metaParts + '</div>',
      '</div>',
    ].join('');
  }


  // ────────────────────────────────────────────────────────────
  // [8] BOOTSTRAP
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
    .then(function (results) {
      if (!_isCurrent()) return;
      root.innerHTML = render(compute(results));
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      console.error('[BPC header v4]', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que o host existe no Zabbix e que o proxy Grafana responde.');
    });

})();