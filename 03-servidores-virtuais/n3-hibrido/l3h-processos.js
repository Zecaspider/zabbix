// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 HÍBRIDO · VM — TOP PROCESSOS (piloto proc.get)                         ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS: var-hostid (host técnico)                   ║
// ║  Standalone ES5 + guard. Responde a "O QUE está a consumir?":              ║
// ║  lê o item proc.get[,,,summary] (JSON, processos agrupados por nome) e     ║
// ║  mostra Top-8 por CPU e por MEMÓRIA.                                       ║
// ║                                                                          ║
// ║  CPU%: o proc.get dá cputime ACUMULADO (segundos desde o arranque) — a     ║
// ║  percentagem calcula-se com o DELTA entre as 2 últimas amostras do          ║
// ║  histórico: Δ(cputime_user+system) / Δt / nCores × 100.                    ║
// ║  RAM: wkset (working set) vem em KB.                                       ║
// ║                                                                          ║
// ║  PILOTO (2026-07-13, aprovado): item só existe na VS8000345 — nas          ║
// ║  restantes VMs o painel explica como alargar (item proc.get, sem           ║
// ║  triggers). value_type do item é texto → history.get com history:4.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

(function () {
  'use strict';

  var CFG = {
    rootId: 'bt-vmh-processos',
    version: 'v1.0',
    grafanaUrl: 'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    abortDelayMs: 80,
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    topN: 8,
    cpuWarnPct: 30, cpuCritPct: 60,     // por processo (fallback local — sem trigger Zabbix por processo)
    colors: {
      ok: '#3FB950', warn: '#D29922', crit: '#F85149', info: '#58A6FF',
      cpu: '#E8A020', mem: '#7C4DFF',
      text: '#CDD9E5', sub: '#6E7681', brd: '#1C2128', track: '#21262D',
    },
  };
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  var _sig = null, _myToken = null;
  function _isCurrent() { return window.__bpc_ns && window.__bpc_ns[CFG.rootId] && window.__bpc_ns[CFG.rootId].token === _myToken; }
  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: signal || _sig })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function (err) {
        if (err.name === 'AbortError') throw err;
        if (attempt >= CFG.retry.maxAttempts - 1) throw err;
        return new Promise(function (res) { setTimeout(res, CFG.retry.baseDelayMs * Math.pow(2, attempt)); })
          .then(function () { return fetchWithRetry(url, body, signal, attempt + 1); });
      });
  }
  function zbx(m, p) { return fetchWithRetry(PROXY, { jsonrpc: '2.0', id: 1, method: m, params: p }, _sig).then(function (j) { if (j.error) throw new Error(j.error.data || j.error.message); return j.result; }); }

  var U = {
    esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
    extractHostName: function (raw) { var s = raw.split('(')[0].trim(); var p = s.split(/\s*-\s*/); return p[p.length - 1].trim(); },
    mb: function (kb) { if (kb == null) return '—'; var m = kb / 1024; return m >= 1024 ? (m / 1024).toFixed(1) + ' GB' : Math.round(m) + ' MB'; },
    renderErro: function (c) { return '<div style="color:' + CFG.colors.crit + ';font-size:12px;font-family:monospace">&#9888; ' + U.esc(c) + '</div>'; },
  };

  function bar(pct, color, w) {
    var p = Math.max(0, Math.min(100, pct || 0));
    return '<div style="width:' + (w || 120) + 'px;height:6px;background:' + CFG.colors.track + ';border-radius:3px;overflow:hidden;flex:none">'
      + '<div style="height:100%;width:' + p.toFixed(1) + '%;background:' + color + ';border-radius:3px"></div></div>';
  }

  function rowHtml(name, barHtml, val, valColor, extra) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">'
      + '<span style="flex:1;min-width:0;font-family:Consolas,monospace;font-size:12px;color:' + CFG.colors.text + ';'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U.esc(name) + '</span>'
      + barHtml
      + '<span style="width:74px;text-align:right;font-size:12.5px;font-weight:700;color:' + valColor + ';flex:none">' + val + '</span>'
      + '<span style="width:88px;text-align:right;font-size:10px;color:' + CFG.colors.sub + ';flex:none">' + extra + '</span>'
      + '</div>';
  }

  function col(title, accent, inner, foot) {
    return '<div style="flex:1;min-width:330px;background:rgba(255,255,255,.015);border:1px solid ' + CFG.colors.brd + ';'
      + 'border-top:2px solid ' + accent + ';border-radius:10px;padding:12px 16px">'
      + '<div style="font-size:11px;font-weight:700;color:' + accent + ';text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">' + title + '</div>'
      + inner
      + (foot ? '<div style="font-size:10px;color:' + CFG.colors.sub + ';margin-top:7px">' + foot + '</div>' : '')
      + '</div>';
  }

  function parse(v) { try { var d = JSON.parse(v); return Array.isArray(d) ? d : null; } catch (e) { return null; } }

  function render(sampleNew, sampleOld, dtSec, nCores, totalRamKb) {
    var c = CFG.colors;

    // ── TOP MEMÓRIA (working set da amostra mais recente) ──
    var byMem = sampleNew.slice().sort(function (a, b) { return (b.wkset || 0) - (a.wkset || 0); }).slice(0, CFG.topN);
    var maxW = byMem.length ? (byMem[0].wkset || 1) : 1;
    var memRows = '';
    for (var i = 0; i < byMem.length; i++) {
      var p = byMem[i];
      var pctTot = totalRamKb ? (p.wkset / totalRamKb * 100) : null;
      memRows += rowHtml(p.name, bar(p.wkset / maxW * 100, c.mem),
        U.mb(p.wkset),
        c.text,
        (pctTot != null ? pctTot.toFixed(1) + '% RAM · ' : '') + (p.processes || 1) + 'p/' + (p.threads || 0) + 't');
    }

    // ── TOP CPU (delta de cputime entre as 2 amostras) ──
    var cpuInner, cpuFoot;
    if (!sampleOld || !dtSec || dtSec <= 0) {
      cpuInner = '<div style="font-size:11.5px;color:' + c.sub + ';padding:6px 0">'
        + 'A calcular — o CPU por processo precisa de 2 amostras (Δcputime). '
        + 'Disponível na próxima recolha (~2 min após a primeira).</div>';
      cpuFoot = '';
    } else {
      var oldByName = {};
      for (var o = 0; o < sampleOld.length; o++) oldByName[sampleOld[o].name] = sampleOld[o];
      var rows = [];
      for (var n = 0; n < sampleNew.length; n++) {
        var pn = sampleNew[n], po = oldByName[pn.name];
        if (!po) continue;
        var du = (pn.cputime_user || 0) - (po.cputime_user || 0);
        var ds = (pn.cputime_system || 0) - (po.cputime_system || 0);
        var d = du + ds;
        if (d < 0) continue;                       // processo reiniciado — delta inválido
        var pct = d / dtSec / (nCores || 1) * 100;
        rows.push({ name: pn.name, pct: pct, procs: pn.processes || 1, thr: pn.threads || 0 });
      }
      rows.sort(function (a, b) { return b.pct - a.pct; });
      rows = rows.slice(0, CFG.topN);
      var maxP = rows.length ? Math.max(rows[0].pct, 0.001) : 1;
      cpuInner = '';
      for (var r = 0; r < rows.length; r++) {
        var rr = rows[r];
        var vc = rr.pct >= CFG.cpuCritPct ? c.crit : (rr.pct >= CFG.cpuWarnPct ? c.warn : c.text);
        cpuInner += rowHtml(rr.name, bar(rr.pct / maxP * 100, c.cpu), rr.pct.toFixed(1) + '%', vc,
          rr.procs + 'p/' + rr.thr + 't');
      }
      cpuFoot = 'Δ entre 2 amostras (' + Math.round(dtSec) + 's)' + (nCores ? ' · ' + nCores + ' cores' : ' · % de 1 core (nº de cores indisponível)');
    }

    return '<div style="display:flex;gap:14px;flex-wrap:wrap;font-family:Inter,\'Segoe UI\',sans-serif">'
      + col('Top ' + CFG.topN + ' — CPU', c.cpu, cpuInner, cpuFoot)
      + col('Top ' + CFG.topN + ' — Memória (working set)', c.mem, memRows,
          totalRamKb ? '% calculada sobre ' + U.mb(totalRamKb) + ' de RAM total' : '')
      + '</div>';
  }

  function renderPilotNote(itemExists) {
    var c = CFG.colors;
    if (itemExists) {
      // template aplicado mas ainda sem 1º valor (recolha 5m + refresh do
      // agente activo) — não confundir com "sem recolha"
      return '<div style="font-size:12px;color:' + c.sub + ';padding:4px 0;font-family:Inter,\'Segoe UI\',sans-serif">'
        + 'Template <b style="color:' + c.text + '">BPC Top Processos</b> aplicado — '
        + '<b style="color:' + c.warn + '">primeira recolha pendente</b> (intervalo 5 min + refresh do agente). '
        + 'Se persistir &gt;15 min, verificar o estado do item no Zabbix.</div>';
    }
    return '<div style="font-size:12px;color:' + c.sub + ';padding:4px 0;font-family:Inter,\'Segoe UI\',sans-serif">'
      + 'Sem recolha por processo nesta VM. O template <b style="color:' + c.text + '">BPC Top Processos</b> '
      + 'está aplicado às VMs de <b>Produção com agente activo</b> (2026-07-13); esta VM ficou de fora '
      + '(sem agente vivo na altura, QA, ou entrou depois). Para incluir: ligar o template ao host '
      + '(sem triggers — decisão registada em 03-servidores-virtuais/CLAUDE.md).</div>';
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
  if (!hostName) { root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">Selecciona uma VM.</span>'; return; }
  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:12px">A carregar processos…</span>';

  zbx('host.get', { output: ['hostid', 'host'], filter: { host: [hostName] } })
    .then(function (hosts) {
      if (!_isCurrent()) return;
      if (!hosts || !hosts.length) throw new Error('Host não encontrado: ' + hostName);
      var hid = hosts[0].hostid;
      return Promise.all([
        // preferir a variante TRIMMED (bpc.proc.top12, ~2KB) com fallback ao
        // proc.get completo (~15KB) — permite migrar host a host sem partir nada
        zbx('item.get', { hostids: [hid], filter: { status: 0, key_: ['bpc.proc.top12', 'proc.get[,,,summary]'] }, output: ['itemid', 'key_', 'lastvalue', 'lastclock'] }),
        zbx('item.get', { hostids: [hid], filter: { name: ['Number of logical processors', 'Number of CPUs', 'Total memory'] }, output: ['name', 'lastvalue'] }),
      ]).then(function (res) {
        if (!_isCurrent()) return;
        var cand = res[0] || [];
        var pg = null;
        for (var ci = 0; ci < cand.length; ci++) if (cand[ci].key_ === 'bpc.proc.top12' && cand[ci].lastvalue) { pg = cand[ci]; break; }
        if (!pg) for (var cj = 0; cj < cand.length; cj++) if (cand[cj].lastvalue) { pg = cand[cj]; break; }
        if (!pg || !pg.lastvalue) { root.innerHTML = renderPilotNote(cand.length > 0); return; }
        var nCores = null, totalRamKb = null;
        for (var i = 0; i < (res[1] || []).length; i++) {
          var it = res[1][i], v = parseFloat(it.lastvalue);
          if (isNaN(v)) continue;
          if (it.name === 'Total memory') totalRamKb = v / 1024;   // bytes → KB (wkset vem em KB)
          else nCores = v;
        }
        // 2 últimas amostras para o delta de CPU (value_type texto → history:4)
        return zbx('history.get', {
          itemids: [pg.itemid], history: 4,
          sortfield: 'clock', sortorder: 'DESC', limit: 2,
          output: 'extend',
        }).then(function (h) {
          if (!_isCurrent()) return;
          var sNew = h && h[0] ? parse(h[0].value) : parse(pg.lastvalue);
          var sOld = h && h[1] ? parse(h[1].value) : null;
          var dt = (h && h[0] && h[1]) ? (parseInt(h[0].clock) - parseInt(h[1].clock)) : null;
          if (!sNew) { root.innerHTML = U.renderErro('JSON do proc.get inválido'); return; }
          root.innerHTML = render(sNew, sOld, dt, nCores, totalRamKb);
        });
      });
    })
    .catch(function (e) {
      if (e.name === 'AbortError' || !_isCurrent()) return;
      root.innerHTML = U.renderErro(e.message);
    });

})();
