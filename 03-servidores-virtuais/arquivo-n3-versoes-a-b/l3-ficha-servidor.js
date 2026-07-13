(function () {

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ════════════════════════════════════════════════════════════
  // D5-Detalhe-VM · FICHA DO SERVIDOR  v1.0
  // Business Text — ES5, sem dependências externas
  //<div id="bt-ficha-servidor"></div>
  // Reactividade: query dumb força re-render do BT quando a
  // variável Grafana muda. O JS lê var-hostid do URL em cada
  // execução — sem eventos, sem polling, sem listeners.
  //
  // Estrutura:
  //   [1] CFG
  //   [2] UTILS
  //   [3] CSS
  //   [4] ICONS
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
    rootId: 'bt-ficha-servidor',

    groupsIgnore: ['Linux Servers', 'Windows Servers', 'Discovered', 'Virtual machines', 'Zabbix'],

    apiLimits: { items: 1000, hosts: 10 },

    retry: { maxAttempts: 3, baseDelayMs: 1000 },

    itemNames: [
      'System name',
      'Operating system',
      'Operating system architecture',
      'System description',
      'Total memory',
      'Number of cores',
      'System hostname',
      'VMware: Power state',
      'VMware: Guest OS ID',
      'VMware: Number of virtual CPUs',
      'VMware: Memory size',
      'VMware: Hypervisor name',
      'VMware: VM UUID',
      'Host name of Zabbix agent running',
      'Version of Zabbix agent running',
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
      panel:'#0d1117',
      border:'rgba(255,255,255,.07)',
    },
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

  var IGNORE_RE = new RegExp('^(' + CFG.groupsIgnore.join('|') + ')', 'i');

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
        + '<div style="color:' + CFG.colors.crit + ';font-size:15.5px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; FICHA DO SERVIDOR</div>'
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

    getVal: function (items, name) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].name === name) return items[i].lastvalue;
      }
      return null;
    },

    getFirst: function (items, names) {
      for (var n = 0; n < names.length; n++) {
        var v = U.getVal(items, names[n]);
        if (v !== null && v !== '') return v;
      }
      return null;
    },

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
    '#bt-ficha-servidor *{box-sizing:border-box;margin:0;padding:0;}',
    '#bt-ficha-servidor{font-family:\'IBM Plex Sans\',\'Segoe UI\',sans-serif;}',

    '#bt-ficha-servidor .fs-grid{',
    '  display:grid;grid-template-columns:repeat(4,1fr);gap:10px;',
    '  padding:14px 16px;',
    '  background:linear-gradient(135deg,#0d1117 0%,#0f1923 100%);',
    '  border:1px solid ' + CFG.colors.border + ';border-radius:6px;',
    '}',

    '#bt-ficha-servidor .fs-block{',
    '  background:rgba(255,255,255,.02);border:1px solid ' + CFG.colors.border + ';',
    '  border-radius:5px;padding:10px 12px;min-width:0;',
    '}',

    '#bt-ficha-servidor .fs-block-title{',
    '  font-size:12.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;',
    '  color:' + CFG.colors.mute + ';margin-bottom:8px;display:flex;align-items:center;gap:6px;',
    '}',

    '#bt-ficha-servidor .fs-os-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;}',
    '#bt-ficha-servidor .fs-os-logo{flex-shrink:0;width:28px;height:28px;}',

    '#bt-ficha-servidor .fs-kv{display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-size:15.5px;}',
    '#bt-ficha-servidor .fs-kv-key{color:' + CFG.colors.mute + ';white-space:nowrap;}',
    '#bt-ficha-servidor .fs-kv-val{color:' + CFG.colors.text + ';font-family:monospace;text-align:right;overflow:hidden;text-overflow:ellipsis;}',

    '#bt-ficha-servidor .fs-tag{',
    '  display:inline-block;font-size:13.5px;font-weight:600;padding:2px 8px;',
    '  border-radius:3px;margin:2px 3px 0 0;white-space:nowrap;',
    '}',

    '</style>',
  ].join('');


  // ────────────────────────────────────────────────────────────
  // [4] ICONS — logos inline SVG por família de SO (sem deps externas)
  // ────────────────────────────────────────────────────────────

  var ICONS = {

    win: '<svg class="fs-os-logo" viewBox="0 0 24 24" fill="' + CFG.colors.win + '">'
      + '<path d="M0 3.5L9.8 2.2v9.3H0V3.5zm10.9-1.4L24 0v11.4H10.9V2.1zM0 12.7h9.8V22L0 20.6V12.7zm10.9 0H24V24l-13.1-1.8V12.7z"/></svg>',

    lnx: '<svg class="fs-os-logo" viewBox="0 0 24 24" fill="' + CFG.colors.lnx + '">'
      + '<circle cx="12" cy="12" r="11" fill="none" stroke="' + CFG.colors.lnx + '" stroke-width="1.6"/>'
      + '<circle cx="8.5" cy="9.5" r="1.4"/><circle cx="15.5" cy="9.5" r="1.4"/>'
      + '<path d="M6.5 15c1.7 2.2 3.5 3 5.5 3s3.8-.8 5.5-3" fill="none" stroke="' + CFG.colors.lnx + '" stroke-width="1.6" stroke-linecap="round"/></svg>',

    bsd: '<svg class="fs-os-logo" viewBox="0 0 24 24" fill="none" stroke="' + CFG.colors.bsd + '" stroke-width="1.6">'
      + '<rect x="2" y="2" width="20" height="20" rx="3"/><path d="M7 16c2-4 8-4 10 0M9 9h0M15 9h0" stroke-linecap="round"/></svg>',

    vm: '<svg class="fs-os-logo" viewBox="0 0 24 24" fill="none" stroke="' + CFG.colors.vm + '" stroke-width="1.6">'
      + '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4" stroke-linecap="round"/></svg>',
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
      output: ['hostid', 'host', 'name', 'status'],
      filter: { host: [hostName] },
      selectGroups: ['name'],
      selectInterfaces: ['ip', 'dns', 'type', 'main'],
      selectInventory: ['location', 'notes', 'host_networks', 'asset_tag', 'contact'],
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
      ]);
    });
  }


  // ────────────────────────────────────────────────────────────
  // [6] COMPUTE
  // ────────────────────────────────────────────────────────────

  function compute(results) {
    var host  = results[0];
    var items = results[1];

    var iface = null;
    for (var i = 0; i < (host.interfaces || []).length; i++) {
      if (host.interfaces[i].main === '1') { iface = host.interfaces[i]; break; }
    }
    if (!iface && host.interfaces && host.interfaces.length) iface = host.interfaces[0];

    var groups = (host.groups || [])
      .map(function (g) { return g.name; })
      .filter(function (n) { return !IGNORE_RE.test(n); });

    var guestId = U.getVal(items, 'VMware: Guest OS ID') || '';
    var osFull  = U.getFirst(items, ['Operating system', 'System description']) || '';
    var osStr   = (guestId + ' ' + osFull).toLowerCase();

    var osFamily, osLabel;
    if (osStr.indexOf('windows') >= 0) {
      var winMatch = (guestId + osFull).match(/(\d{4}|\d \w+)/);
      osFamily = 'win'; osLabel = 'Windows' + (winMatch ? ' ' + winMatch[1] : '');
    } else if (osStr.match(/linux|ubuntu|centos|rhel|debian/)) {
      osFamily = 'lnx'; osLabel = osFull || 'Linux';
    } else if (osStr.indexOf('freebsd') >= 0) {
      osFamily = 'bsd'; osLabel = osFull || 'FreeBSD';
    } else {
      osFamily = 'vm'; osLabel = osFull || guestId || 'Desconhecido';
    }

    return {
      hostTech:    host.host || '—',
      hostDisplay: (host.name && host.name !== host.host) ? host.name : null,
      status:      host.status === '0' ? 'Monitorizado' : 'Não monitorizado',
      groups:      groups,
      ip:          iface ? iface.ip : null,
      dns:         iface ? iface.dns : null,
      location:    (host.inventory && host.inventory.location) || null,
      notes:       (host.inventory && host.inventory.notes) || null,
      assetTag:    (host.inventory && host.inventory.asset_tag) || null,
      osFamily:    osFamily,
      osLabel:     osLabel,
      arch:        U.getVal(items, 'Operating system architecture'),
      hostname:    U.getVal(items, 'System name'),
      cores:       U.getFirst(items, ['Number of cores', 'VMware: Number of virtual CPUs']),
      ram:         U.fmtRam(U.getFirst(items, ['Total memory', 'VMware: Memory size'])),
      hvName:      U.getVal(items, 'VMware: Hypervisor name'),
      vmUuid:      U.getVal(items, 'VMware: VM UUID'),
      agentHost:   U.getVal(items, 'Host name of Zabbix agent running'),
      agentVer:    U.getVal(items, 'Version of Zabbix agent running'),
    };
  }


  // ────────────────────────────────────────────────────────────
  // [7] RENDER
  // ────────────────────────────────────────────────────────────

  function kv(key, val) {
    if (val === null || val === undefined || val === '') return '';
    return '<div class="fs-kv"><span class="fs-kv-key">' + U.esc(key) + '</span>'
      + '<span class="fs-kv-val" title="' + U.esc(String(val)) + '">' + U.esc(String(val)) + '</span></div>';
  }

  function renderIdentidade(d) {
    return '<div class="fs-block">'
      + '<div class="fs-block-title">Identidade</div>'
      + kv('Nome técnico', d.hostTech)
      + kv('Nome visível', d.hostDisplay)
      + kv('Hostname (SO)', d.hostname)
      + kv('Estado Zabbix', d.status)
      + kv('Asset tag', d.assetTag)
      + '</div>';
  }

  function renderOS(d) {
    return '<div class="fs-block">'
      + '<div class="fs-block-title">Sistema operativo</div>'
      + '<div class="fs-os-row">' + (ICONS[d.osFamily] || ICONS.vm)
      + '<span style="font-size:18px;font-weight:700;color:' + CFG.colors.text + ';">' + U.esc(d.osLabel) + '</span></div>'
      + kv('Arquitectura', d.arch)
      + kv('vCPUs', d.cores)
      + kv('RAM', d.ram)
      + '</div>';
  }

  function renderRede(d) {
    return '<div class="fs-block">'
      + '<div class="fs-block-title">Rede</div>'
      + kv('IP', d.ip)
      + kv('DNS', d.dns)
      + kv('Hypervisor', d.hvName ? d.hvName.split('.')[0] : null)
      + kv('VM UUID', d.vmUuid ? d.vmUuid.slice(0, 13) + '…' : null)
      + '</div>';
  }

  function renderInventario(d) {
    var tags = d.groups.map(function (g) {
      var rgb = U.hexRgb(CFG.colors.info);
      return '<span class="fs-tag" style="color:' + CFG.colors.info + ';background:rgba(' + rgb + ',.12);border:1px solid rgba(' + rgb + ',.28);">' + U.esc(g) + '</span>';
    }).join('');

    return '<div class="fs-block">'
      + '<div class="fs-block-title">Inventário</div>'
      + kv('Localização', d.location)
      + kv('Notas', d.notes)
      + kv('Agente Zabbix', d.agentVer ? d.agentHost + ' v' + d.agentVer : null)
      + (tags ? '<div style="margin-top:6px;">' + tags + '</div>' : '')
      + '</div>';
  }

  function render(d) {
    return CSS + '<div class="fs-grid">'
      + renderIdentidade(d)
      + renderOS(d)
      + renderRede(d)
      + renderInventario(d)
      + '</div>';
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
      console.error('[BPC ficha-servidor]', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que o host existe no Zabbix e que o proxy Grafana responde.');
    });

})();
