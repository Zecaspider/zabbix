// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 · BASES DE DADOS — Tabela por base de dados                            ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid                                  ║
// ║  Standalone ES5. Mostra cada base do host — via ODBC databases[] (nome,    ║
// ║  estado, recovery, tamanho, último backup) OU via WMI (nome, tamanho,      ║
// ║  % log usado). Ordena por % log usado / tamanho para apanhar cedo casos    ║
// ║  tipo PRISIGEP/DWDiagnostics. Se o host não tem bases mensuráveis, explica ║
// ║  porquê em vez de aparecer vazio.                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-bd-bases',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    odbcKeyPrefix: 'db.odbc.select[mssql.business.master',
    logUsadoWarn: 75, logUsadoCrit: 90,
    colors: { ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF', text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128' },
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
    num: function (it) { return it ? parseFloat(it.lastvalue) : null; },
    fmtMb: function (mb) { if (mb == null || isNaN(mb)) return '—'; if (mb >= 1048576) return (mb / 1048576).toFixed(1) + ' TB'; if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'; return Math.round(mb) + ' MB'; },
    renderErro: function (c) { return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);border-radius:6px;padding:12px 14px;font-family:monospace;color:' + CFG.colors.crit + ';font-size:11px">&#9888; ' + U.esc(c) + '</div>'; },
    note: function (msg) { return '<div style="color:' + CFG.colors.sub + ';font-size:.82rem;padding:10px 4px">' + U.esc(msg) + '</div>'; },
  };

  function logColor(pct) { if (pct == null) return CFG.colors.text; if (pct >= CFG.logUsadoCrit) return CFG.colors.crit; if (pct >= CFG.logUsadoWarn) return CFG.colors.warn; return CFG.colors.text; }

  function table(headers, rows) {
    var th = 'text-align:left;padding:6px 9px;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;color:' + CFG.colors.sub + ';border-bottom:1px solid rgba(255,255,255,.12)';
    var h = '<thead><tr>';
    for (var i = 0; i < headers.length; i++) h += '<th style="' + th + (headers[i].r ? ';text-align:right' : '') + '">' + headers[i].t + '</th>';
    h += '</tr></thead>';
    return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' + h + '<tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function td(v, extra) { return '<td style="padding:6px 9px;border-bottom:1px solid rgba(255,255,255,.06);font-size:.78rem;color:' + CFG.colors.text + (extra || '') + '">' + v + '</td>'; }

  // ODBC databases[]
  function renderOdbc(dbs) {
    dbs.sort(function (a, b) { return ((b.data_mb || 0) + (b.log_mb || 0)) - ((a.data_mb || 0) + (a.log_mb || 0)); });
    var rows = dbs.map(function (db) {
      var stateOk = /online/i.test(db.state || '');
      var bk = db.last_full_backup || '—';
      var bkOld = /never|null/i.test(bk) || bk === '—';
      return '<tr>'
        + td(U.esc(db.db_name), ';font-family:monospace;color:#E6EDF3')
        + td('<span style="color:' + (stateOk ? CFG.colors.ok : CFG.colors.crit) + '">' + U.esc(db.state || '?') + '</span>')
        + td(U.esc(db.recovery_model || '—'), ';color:' + CFG.colors.sub)
        + td(U.fmtMb(db.data_mb), ';text-align:right')
        + td(U.fmtMb(db.log_mb), ';text-align:right')
        + td(db.active_connections != null ? db.active_connections : '—', ';text-align:right;color:' + CFG.colors.sub)
        + td('<span style="color:' + (bkOld ? CFG.colors.warn : CFG.colors.sub) + '">' + U.esc(String(bk)) + '</span>', ';font-size:.72rem')
        + '</tr>';
    });
    return '<div style="font-size:.7rem;color:' + CFG.colors.sub + ';margin-bottom:6px">' + dbs.length + ' bases · ordenadas por tamanho</div>'
      + table([{ t: 'Base' }, { t: 'Estado' }, { t: 'Recovery' }, { t: 'Dados', r: 1 }, { t: 'Log', r: 1 }, { t: 'Lig', r: 1 }, { t: 'Último backup full' }], rows);
  }

  // WMI items → agrupar por base
  function renderWmi(items) {
    var byDb = {};
    items.forEach(function (it) {
      var m = it.name.match(/^MSSQL DB (.+): (Tamanho dados|Tamanho log|Percent log usado)/);
      if (!m) return;
      var name = m[1];
      byDb[name] = byDb[name] || { name: name };
      var v = U.num(it);
      if (/Tamanho dados/.test(m[2])) byDb[name].dataMb = v / 1024;
      else if (/Tamanho log/.test(m[2])) byDb[name].logMb = v / 1024;
      else if (/Percent log/.test(m[2])) byDb[name].logPct = v;
    });
    var list = Object.keys(byDb).map(function (k) { return byDb[k]; });
    if (!list.length) return null;
    list.sort(function (a, b) { return (b.logPct || 0) - (a.logPct || 0); });
    var rows = list.map(function (db) {
      return '<tr>'
        + td(U.esc(db.name), ';font-family:monospace;color:#E6EDF3')
        + td(U.fmtMb(db.dataMb), ';text-align:right')
        + td(U.fmtMb(db.logMb), ';text-align:right')
        + td('<span style="color:' + logColor(db.logPct) + ';font-weight:600">' + (db.logPct != null ? db.logPct + '%' : '—') + '</span>', ';text-align:right')
        + '</tr>';
    });
    return '<div style="font-size:.7rem;color:' + CFG.colors.sub + ';margin-bottom:6px">' + list.length + ' bases (via WMI) · ordenadas por % log usado</div>'
      + table([{ t: 'Base' }, { t: 'Dados', r: 1 }, { t: 'Log', r: 1 }, { t: '% Log usado', r: 1 }], rows);
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
  if (!hostName) { root.innerHTML = U.note('Selecciona uma instância no selector acima.'); return; }
  root.innerHTML = U.note('A carregar…');

  zbx('host.get', { output: ['hostid', 'host'], filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var hid = hosts[0].hostid;
      return Promise.all([
        zbx('item.get', { hostids: [hid], search: { key_: CFG.odbcKeyPrefix }, output: ['lastvalue', 'error'] }),
        zbx('item.get', { hostids: [hid], search: { name: 'MSSQL DB ' }, output: ['name', 'lastvalue', 'error'] }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        // ODBC primeiro
        var odbc = res[0][0];
        if (odbc && !odbc.error && odbc.lastvalue) {
          var raw = odbc.lastvalue.trim();
          if (raw.charAt(raw.length - 1) === '}') {
            var d = null; try { d = JSON.parse(raw); } catch (e) { d = null; }
            if (d && d.databases && d.databases.length) { root.innerHTML = renderOdbc(d.databases); return; }
          }
        }
        // WMI
        var wmi = renderWmi(res[1] || []);
        if (wmi) { root.innerHTML = wmi; return; }
        root.innerHTML = U.note('Sem detalhe por base neste host. A lista de bases só existe com credencial SQL (ODBC) ou descoberta WMI (instância nomeada). Ver a secção Estado da instância para o motivo.');
      });
    })
    .catch(function (e) { if (e.name === 'AbortError' || !_isCurrent()) return; root.innerHTML = U.renderErro(e.message); });

})();
