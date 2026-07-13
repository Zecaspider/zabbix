// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 · BASES DE DADOS — Instância (header + contexto + saúde tiered)        ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid (host Zabbix seleccionado)       ║
// ║  Standalone (ES5, eval) — padrão _l3-base.js. Reage a var-hostid sem       ║
// ║  estado residual. Muda de conteúdo consoante o tier da fonte de dados      ║
// ║  (ver 06-bases-dados/CLAUDE.md §2). Sobe sozinho para "ODBC completo"      ║
// ║  quando a credencial zbx_monitor for criada no host.                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-bd-instancia',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    odbcKeyPrefix: 'db.odbc.select[mssql.business.master',
    logUsadoAlertPct: 90,
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      mssql: '#A371F7', oracle: '#F0883E',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128',
    },
    thr: { ple: { warn: 300, crit: 100 }, cacheHit: { warn: 95, crit: 90 } },
  };
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  // ── guard anti-double-fire ──
  var _sig = null, _myToken = null;
  function _isCurrent() {
    return window.__bpc_ns && window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken;
  }
  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal || _sig })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) {
        if (err.name === 'AbortError') throw err;
        if (attempt >= 2) throw err;
        return new Promise(function (res) { setTimeout(res, 1000 * Math.pow(2, attempt)); })
          .then(function () { return fetchWithRetry(url, body, signal, attempt + 1); });
      });
  }
  function zbx(method, params) {
    return fetchWithRetry(PROXY, { jsonrpc: '2.0', id: 1, method: method, params: params }, _sig)
      .then(function (j) { if (j.error) throw new Error(j.error.data || j.error.message); return j.result; });
  }

  var U = {
    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    extractHostName: function (raw) { var s = raw.split('(')[0].trim(); var p = s.split(/\s*-\s*/); return p[p.length - 1].trim(); },
    num: function (it) { return it ? parseFloat(it.lastvalue) : null; },
    fmtSize: function (mb) {
      if (mb == null || isNaN(mb) || mb === 0) return '—';
      if (mb >= 1048576) return (mb / 1048576).toFixed(1) + ' TB';
      if (mb >= 1024) return (mb / 1024).toFixed(0) + ' GB';
      return Math.round(mb) + ' MB';
    },
    tag: function (tags, k) { for (var i = 0; i < (tags || []).length; i++) if (tags[i].tag === k) return tags[i].value; return ''; },
    renderErro: function (causa) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);border-radius:6px;padding:12px 14px;font-family:monospace">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:12px;font-weight:700;margin-bottom:4px">&#9888; ERRO</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:11px">' + U.esc(causa) + '</div></div>';
    },
  };

  function svcName(key) { var m = (key || '').match(/service\.info\[\s*"?([^",\]]+)"?/); return m ? m[1] : (key || ''); }
  function isPrimaryEngineSvc(name) {
    if (/RMAN|Backup/i.test(name)) return false;
    if (/^OracleService/i.test(name)) return true;
    if (/^MSSQLSERVER$/i.test(name)) return true;
    if (/^MSSQL\$/i.test(name)) return true;
    return false;
  }
  function isAuxSvc(name) { return /FDLauncher|Launchpad|OLAPService|SQLBrowser|SQLSERVERAGENT|SQLAgent|RMAN|Reporting|IntegrationServices/i.test(name); }
  // proc.num[] sem args (template Windows) conta TODOS os processos — só é
  // sinal de motor se o key nomear um processo de BD (fix 2026-07-13)
  function isDbProcItem(it) {
    return /proc\.num\[[^\]]*(sqlservr|oracle|sqlbrowser|mysqld|postgres)/i.test(it.key_ || '')
      || /^Processo .+ activo$/.test(it.name || '');
  }
  function motorFrom(names, hasOdbc) {
    for (var i = 0; i < names.length; i++) if (/oracle/i.test(names[i])) return 'Oracle';
    for (var j = 0; j < names.length; j++) if (/mssql|sqlserver/i.test(names[j])) return 'MSSQL';
    return hasOdbc ? 'MSSQL' : '?';
  }
  function findByName(items, name) { for (var i = 0; i < items.length; i++) if (items[i].name === name && !items[i].error && items[i].lastvalue !== '') return items[i]; return null; }

  // ── classificação de tier ──
  function classify(host, odbcItem, perf, svcAll, procAll) {
    var svcNames = []; for (var i = 0; i < svcAll.length; i++) svcNames.push(svcName(svcAll[i].key_));
    var hasOdbc = !!odbcItem;
    var motor = motorFrom(svcNames, hasOdbc);

    // ODBC completo
    if (odbcItem && !odbcItem.error && odbcItem.lastvalue) {
      var raw = odbcItem.lastvalue.trim();
      if (raw.charAt(raw.length - 1) === '}' || raw.charAt(raw.length - 1) === ']') {
        var d = null; try { d = JSON.parse(raw); } catch (e) { d = null; }
        if (d) return { tier: 'odbc', motor: motor === '?' ? 'MSSQL' : motor, odbc: d };
      }
    }
    // Perfmon + WMI
    var pPle = findByName(perf, 'MSSQL Page life expectancy');
    var pConn = findByName(perf, 'MSSQL User Connections');
    var pDead = findByName(perf, 'MSSQL Number of Deadlocks/sec');
    var pCache = findByName(perf, 'MSSQL Buffer cache hit ratio') || findByName(perf, 'MSSQL Cache hit ratio');
    var wmiData = perf.filter(function (i) { return /^MSSQL DB .+: Tamanho dados/.test(i.name); });
    if (pPle || pConn || pDead || wmiData.length) {
      return { tier: 'perfmon', motor: motor === '?' ? 'MSSQL' : motor, perf: { pPle: pPle, pConn: pConn, pDead: pDead, pCache: pCache, wmiData: wmiData }, svcAll: svcAll };
    }
    // Serviço
    var primary = svcAll.filter(function (i) { return isPrimaryEngineSvc(svcName(i.key_)); });
    if (primary.length) return { tier: 'servico', motor: motor, primary: primary, svcAll: svcAll };
    var procFound = procAll.filter(function (i) { return isDbProcItem(i) && (U.num(i) || 0) > 0; });
    if (procFound.length) return { tier: 'servico', motor: motor, procFound: procFound };
    // Sem sinal (com erro ODBC = motivo)
    return { tier: 'nd', motor: motor === '?' ? (hasOdbc ? 'MSSQL' : '?') : motor, odbcError: odbcItem ? odbcItem.error : null };
  }

  // ── render ──
  var TIER_BADGE = {
    odbc: ['#3FB950', '● ODBC completo'],
    perfmon: ['#58A6FF', '◐ Perfmon local'],
    servico: ['#D29922', '◑ Serviço'],
    nd: ['#8B949E', '○ Sem sinal'],
  };
  function motorBadge(m) {
    if (!m || m === '?') return '<span style="color:' + CFG.colors.sub + '">—</span>';
    var c = /oracle/i.test(m) ? CFG.colors.oracle : CFG.colors.mssql;
    return '<span style="color:' + c + ';font-weight:700">' + U.esc(m) + '</span>';
  }
  function kpi(label, value, color) {
    return '<div style="flex:1;min-width:90px;text-align:center;padding:8px 6px">'
      + '<div style="font-size:1.25rem;font-weight:700;color:' + (color || CFG.colors.text) + '">' + value + '</div>'
      + '<div style="font-size:.6rem;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.03em;margin-top:2px">' + label + '</div></div>';
  }
  function pleColor(v) { if (v == null) return CFG.colors.sub; if (v <= CFG.thr.ple.crit) return CFG.colors.crit; if (v <= CFG.thr.ple.warn) return CFG.colors.warn; return CFG.colors.ok; }

  function render(host, c) {
    var tb = TIER_BADGE[c.tier] || TIER_BADGE.nd;
    var sistema = U.tag(host.tags, 'servico') || '—';
    var dept = U.tag(host.tags, 'departamento') || '—';
    var amb = U.tag(host.tags, 'ambiente') || '—';

    // HEADER
    var html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
      + '<div><div style="font-size:1.3rem;font-weight:700;color:#E6EDF3;font-family:monospace">' + U.esc(host.host) + '</div>'
      + '<div style="font-size:.78rem;color:' + CFG.colors.sub + ';margin-top:2px">' + U.esc(sistema) + ' · ' + U.esc(dept) + ' · ' + U.esc(amb) + '</div></div>'
      + '<div style="display:flex;gap:8px;align-items:center">'
      + '<span style="font-size:.85rem">Motor: ' + motorBadge(c.motor) + '</span>'
      + '<span style="background:' + tb[0] + '22;color:' + tb[0] + ';font-size:.75rem;font-weight:700;padding:3px 12px;border-radius:999px">' + tb[1] + '</span>'
      + '</div></div>';

    var sect = function (t) { return '<div style="font-size:.66rem;color:' + CFG.colors.sub + ';text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px">' + t + '</div>'; };
    var row = function (inner) { return '<div style="display:flex;gap:4px;flex-wrap:wrap;background:rgba(255,255,255,.02);border:1px solid ' + CFG.colors.brd + ';border-radius:8px;padding:6px 4px">' + inner + '</div>'; };

    if (c.tier === 'odbc') {
      var d = c.odbc;
      var nb = d.db_online != null ? d.db_online : (d.databases ? d.databases.length : '—');
      html += sect('Contexto') + row(
        kpi('Bases online', nb, CFG.colors.info)
        + kpi('Tamanho', U.fmtSize((d.total_data_mb || 0) + (d.total_log_mb || 0)), CFG.colors.text)
        + kpi('Ligações', d.user_connections != null ? d.user_connections : '—', CFG.colors.text)
        + kpi('Pedidos activos', d.active_requests != null ? d.active_requests : '—', CFG.colors.text)
      );
      html += sect('Saúde da instância') + row(
        kpi('PLE', d.ple != null ? d.ple + 's' : '—', pleColor(d.ple))
        + kpi('Bases suspect', d.db_suspect != null ? d.db_suspect : '—', d.db_suspect > 0 ? CFG.colors.crit : CFG.colors.ok)
        + kpi('Bloqueados', d.blocked_processes != null ? d.blocked_processes : '—', d.blocked_processes > 0 ? CFG.colors.warn : CFG.colors.text)
        + kpi('Deadlocks/s', d.deadlocks_per_sec != null ? d.deadlocks_per_sec : '—', d.deadlocks_per_sec > 0 ? CFG.colors.warn : CFG.colors.text)
        + kpi('Jobs falhados', d.failed_jobs_today != null ? d.failed_jobs_today : '—', d.failed_jobs_today > 0 ? CFG.colors.warn : CFG.colors.ok)
        + kpi('Backups 24h', d.backups_24h != null ? d.backups_24h : '—', d.backups_24h === 0 ? CFG.colors.warn : CFG.colors.ok)
      );
    } else if (c.tier === 'perfmon') {
      var p = c.perf;
      var ple = U.num(p.pPle), conn = U.num(p.pConn), dead = U.num(p.pDead), cache = U.num(p.pCache);
      html += sect('Contexto') + row(
        kpi('Bases (WMI)', p.wmiData.length || '—', CFG.colors.info)
        + kpi('Ligações', conn != null ? conn : '—', CFG.colors.text)
        + kpi('Fonte', 'perfmon local', CFG.colors.sub)
      );
      html += sect('Saúde da instância (sem credencial SQL — contador de desempenho)') + row(
        kpi('PLE', ple != null ? ple + 's' : '—', pleColor(ple))
        + kpi('Cache hit', cache != null ? cache + '%' : '—', cache != null && cache < CFG.thr.cacheHit.crit ? CFG.colors.warn : CFG.colors.ok)
        + kpi('Deadlocks/s', dead != null ? dead : '—', dead > 0 ? CFG.colors.warn : CFG.colors.text)
      );
    } else if (c.tier === 'servico') {
      var svcHtml = '';
      if (c.primary) {
        for (var i = 0; i < c.primary.length; i++) {
          var running = U.num(c.primary[i]) === 0;
          var nm = svcName(c.primary[i].key_);
          svcHtml += kpi(nm, running ? 'A correr' : 'PARADO', running ? CFG.colors.ok : CFG.colors.crit);
        }
      } else if (c.procFound) {
        for (var k = 0; k < c.procFound.length; k++) svcHtml += kpi(c.procFound[k].name.replace(/^Processo /, ''), 'presente', CFG.colors.warn);
      }
      html += sect('Estado do motor (só serviço — sem métricas SQL)') + row(svcHtml || kpi('Estado', '—', CFG.colors.sub));
      // Auxiliares como contexto
      if (c.svcAll) {
        var aux = c.svcAll.filter(function (x) { return isAuxSvc(svcName(x.key_)); });
        if (aux.length) {
          var auxHtml = '';
          for (var a = 0; a < aux.length; a++) {
            var r2 = U.num(aux[a]) === 0;
            auxHtml += '<span style="font-size:.72rem;color:' + (r2 ? CFG.colors.sub : CFG.colors.warn) + ';margin-right:10px">' + U.esc(svcName(aux[a].key_)) + (r2 ? '' : ' (parado)') + '</span>';
          }
          html += sect('Serviços auxiliares') + '<div style="padding:4px 2px">' + auxHtml + '</div>';
        }
      }
    } else {
      var motivo = 'Sem sinal do motor.';
      if (c.odbcError) {
        if (/login failed|28000|18456/i.test(c.odbcError)) motivo = 'Motor responde mas falta a credencial zbx_monitor (login failed). Pedir criação à infra.';
        else if (/HYT00|timeout/i.test(c.odbcError)) motivo = 'Instância nomeada / porta dinâmica — o template ODBC não liga. Usar perfmon local.';
        else motivo = 'Erro ODBC: ' + c.odbcError.slice(0, 120);
      }
      html += sect('Estado') + '<div style="background:rgba(210,153,34,.08);border:1px solid rgba(210,153,34,.4);border-radius:8px;padding:12px 14px;color:' + CFG.colors.text + ';font-size:.85rem">' + U.esc(motivo) + '</div>';
    }

    return html;
  }

  // ── bootstrap ──
  if (!window.__bpc_ns) window.__bpc_ns = {};
  var _ns = window.__bpc_ns[CFG.rootId] || {};
  window.__bpc_ns[CFG.rootId] = _ns;
  if (_ns.abortTimer) { clearTimeout(_ns.abortTimer); _ns.abortTimer = null; }
  var _prev = _ns.controller;
  if (_prev) { _ns.abortTimer = setTimeout(function () { _prev.abort(); _ns.abortTimer = null; }, CFG.abortDelayMs); }
  var _ctrl = new AbortController();
  _ns.controller = _ctrl; _sig = _ctrl.signal;
  _myToken = Date.now() + Math.random(); _ns.token = _myToken;

  var root = document.getElementById(CFG.rootId);
  if (!root) return;
  var hostRaw = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma instância no selector acima.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar…</span>';

  zbx('host.get', { output: ['hostid', 'host', 'name'], selectTags: 'extend', filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var host = hosts[0], hid = host.hostid;
      return Promise.all([
        zbx('item.get', { hostids: [hid], search: { key_: CFG.odbcKeyPrefix }, output: ['lastvalue', 'lastclock', 'error'] }),
        zbx('item.get', { hostids: [hid], search: { name: 'MSSQL ' }, output: ['name', 'lastvalue', 'lastclock', 'error'] }),
        zbx('item.get', { hostids: [hid], search: { key_: 'service.info' }, output: ['name', 'key_', 'lastvalue', 'lastclock', 'error'] }),
        zbx('item.get', { hostids: [hid], search: { key_: 'proc.num' }, output: ['name', 'key_', 'lastvalue', 'error'] }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        var c = classify(host, res[0][0], res[1] || [], res[2] || [], res[3] || []);
        root.innerHTML = render(host, c);
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
