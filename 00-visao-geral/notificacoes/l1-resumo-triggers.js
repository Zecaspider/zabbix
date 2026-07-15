// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Notificações — Resumo de triggers por domínio            v1.0      ║
// ║                                                                          ║
// ║  F2 do plano-melhorias-observabilidade-20260712.md.                      ║
// ║  1 secção por domínio (mesmos groupids do n1-cards.js): contadores       ║
// ║  Crít/Aviso + lista dos piores problemas activos (host, problema,        ║
// ║  idade), sem ter de ir pesquisar ao Zabbix.                              ║
// ║                                                                          ║
// ║  Dados: problem.get (contagem+lista) e trigger.get (nome do host dos     ║
// ║  problemas listados) — Infra via BPC.rpc, Rede via fetch directo ao      ║
// ║  proxy Network (mesmo padrão do n1-cards.js).                            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-nt-resumo-triggers',
  refreshMs: 60000,
  maxProblemas: 5, // por domínio

  networkProxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',

  domains: [
    { id: 'vmware',   label: 'Infraestrutura VMware',        groupids: ['608'],                 datasource: 'infra',   dashUid: 'a967e936-99a3-47c8-af98-052d7a80beb8' },
    { id: 'vms',      label: 'Servidores Virtuais',          groupids: ['609'],                 datasource: 'infra',   dashUid: '0758c24e-d2b1-4a81-bb14-1788ac8bec68' },
    { id: 'storage',  label: 'Armazenamento',                groupids: ['602', '605'],          datasource: 'infra',   dashUid: '993834a3-6bd3-4d25-88f5-0a59eab171fe' },
    { id: 'rede',     label: 'Rede',                         groupids: ['26', '27', '28', '29'], datasource: 'network', dashUid: 'rede-n2-segmentos' },
    { id: 'bd',       label: 'Bases de Dados',               groupids: ['355'],                 datasource: 'infra',   dashUid: 'bd-n2' },
    { id: 'apis',     label: 'APIs e Serviços de Negócio',   groupids: ['663', '345', '391'],   datasource: 'infra',   dashUid: 'apis-n2' },
    { id: 'seg',      label: 'Segurança',                    groupids: ['656'],                 datasource: 'infra',   dashUid: null },
  ],
};

var SEV = {
  5: { label: 'Desastre', color: '#f85149' },
  4: { label: 'Alta',     color: '#f85149' },
  3: { label: 'Média',    color: '#e3742f' },
  2: { label: 'Aviso',    color: '#d29922' },
  1: { label: 'Info',     color: '#58a6ff' },
  0: { label: 'N/class',  color: '#64748B' },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function idade(clock) {
  var s = Math.max(0, Math.floor(Date.now() / 1000) - parseInt(clock, 10));
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// ── FETCH ─────────────────────────────────────────────────────────────────────

function rpcNetwork(method, params) {
  return fetch(CFG.networkProxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-grafana-org-id': '1' },
    credentials: 'include',
    body: JSON.stringify({ method: method, params: params }),
  })
  .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(function(json) {
    if (json.error) throw new Error(json.error.data || json.error.message);
    return json.result;
  });
}

// problemas + nome do host dos piores (2 chamadas por domínio)
function fetchDominio(rpc, domain) {
  var call = domain.datasource === 'network'
    ? rpcNetwork
    : function(m, p) { return rpc(m, p); };

  return call('problem.get', {
    groupids: domain.groupids,
    output: ['eventid', 'objectid', 'name', 'severity', 'clock'],
    suppressed: false,
    sortfield: ['eventid'],
    sortorder: 'DESC',
  }).then(function(problems) {
    problems.sort(function(a, b) {
      return (parseInt(b.severity, 10) - parseInt(a.severity, 10))
          || (parseInt(b.clock, 10) - parseInt(a.clock, 10));
    });
    var top = problems.slice(0, CFG.maxProblemas);
    var trigIds = top.map(function(p) { return p.objectid; });
    if (!trigIds.length) return { problems: problems, top: top, hosts: {} };
    return call('trigger.get', {
      triggerids: trigIds,
      output: ['triggerid'],
      selectHosts: ['name'],
    }).then(function(trigs) {
      var hosts = {};
      trigs.forEach(function(t) {
        hosts[t.triggerid] = (t.hosts && t.hosts[0] && t.hosts[0].name) || '?';
      });
      return { problems: problems, top: top, hosts: hosts };
    });
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderDominio(domain, r) {
  if (!r) {
    return '<div class="bpc bpc-card" style="--card-accent:#64748B;padding:16px 18px;">'
      + '<div style="font-size:1.05rem;font-weight:700;color:#E6EDF3;">' + esc(domain.label) + '</div>'
      + '<div class="bpc-error-msg" style="margin-top:8px;">Sem dados</div></div>';
  }
  var nCrit = 0, nWarn = 0;
  r.problems.forEach(function(p) {
    var sev = parseInt(p.severity, 10) || 0;
    if (sev >= 4) nCrit++; else if (sev >= 2) nWarn++;
  });
  var state = nCrit > 0 ? 'crit' : nWarn > 0 ? 'warn' : 'ok';
  var accent = { ok: '#22C55E', warn: '#d29922', crit: '#f85149' }[state];

  var titulo = domain.dashUid
    ? '<a href="/d/' + domain.dashUid + '" style="color:#E6EDF3;text-decoration:none;">' + esc(domain.label) + ' <span style="color:var(--bpc-cyan);font-size:.85rem;">↗</span></a>'
    : esc(domain.label);

  var linhas = r.top.map(function(p) {
    var sev = SEV[parseInt(p.severity, 10)] || SEV[0];
    var host = r.hosts[p.objectid] || '?';
    return '<tr>'
      + '<td style="padding:4px 8px 4px 0;white-space:nowrap;"><span style="display:inline-block;min-width:56px;text-align:center;font-size:.70rem;font-weight:700;padding:2px 6px;border-radius:8px;background:' + sev.color + '22;color:' + sev.color + ';border:1px solid ' + sev.color + '55;">' + sev.label + '</span></td>'
      + '<td style="padding:4px 10px 4px 0;font-size:.86rem;color:rgba(255,255,255,.80);white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;">' + esc(host) + '</td>'
      + '<td style="padding:4px 10px 4px 0;font-size:.86rem;color:rgba(255,255,255,.58);white-space:nowrap;max-width:0;overflow:hidden;text-overflow:ellipsis;">' + esc(p.name) + '</td>'
      + '<td style="padding:4px 0;font-size:.80rem;color:rgba(255,255,255,.38);text-align:right;white-space:nowrap;">' + idade(p.clock) + '</td>'
      + '</tr>';
  }).join('');

  var resto = r.problems.length - r.top.length;
  var rodape = resto > 0
    ? '<div style="font-size:.76rem;color:rgba(255,255,255,.32);margin-top:4px;">+ ' + resto + ' problema(s) de menor severidade</div>'
    : '';
  var corpo = r.top.length
    ? '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:8px;">'
      + '<colgroup><col style="width:66px;"><col style="width:175px;"><col><col style="width:44px;"></colgroup>'
      + linhas + '</table>' + rodape
    : '<div style="margin-top:10px;font-size:.88rem;color:#22C55E;">Sem problemas activos</div>';

  return '<div class="bpc bpc-card" style="--card-accent:' + accent + ';padding:14px 18px;display:flex;flex-direction:column;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
    +   '<div style="font-size:1.05rem;font-weight:700;">' + titulo + '</div>'
    +   '<div style="display:flex;gap:14px;align-items:baseline;">'
    +     '<span style="font-size:1.3rem;font-weight:700;color:' + (nCrit ? '#f85149' : 'rgba(255,255,255,.25)') + ';">' + nCrit + '<span style="font-size:.7rem;font-weight:600;margin-left:4px;">CRÍT</span></span>'
    +     '<span style="font-size:1.3rem;font-weight:700;color:' + (nWarn ? '#d29922' : 'rgba(255,255,255,.25)') + ';">' + nWarn + '<span style="font-size:.7rem;font-weight:600;margin-left:4px;">AVISO</span></span>'
    +   '</div>'
    + '</div>'
    + corpo
    + '</div>';
}

function renderGrid(results) {
  var cards = CFG.domains.map(function(d, i) { return renderDominio(d, results[i]); });
  // 3 colunas em ecrã largo (era 2 → o painel ocupava h=27 e empurrava o resto)
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(480px,1fr));gap:12px;padding:2px 0;">'
    + cards.join('') + '</div>';
}

function loadAndRender(rpc, root, ns) {
  var fetches = CFG.domains.map(function(domain) {
    return fetchDominio(rpc, domain).catch(function(err) {
      console.warn('[BPC] nt-resumo-triggers: erro no domínio ' + domain.id, err);
      return null;
    });
  });
  Promise.all(fetches).then(function(results) {
    root.innerHTML = renderGrid(results);
    ns.html = root.innerHTML; // alimenta o stale-while-revalidate
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    if (!window.__bpc_ns) window.__bpc_ns = {};
    var ns = window.__bpc_ns[CFG.rootId] = window.__bpc_ns[CFG.rootId] || {};
    // stale-while-revalidate: repinta o último render em vez de piscar o skeleton
    if (ns.html) root.innerHTML = ns.html;
    else root.innerHTML = '<div class="bpc-skeleton" style="height:220px;"></div>';
    loadAndRender(rpc, root, ns);
    // timer único por rootId (antes acumulava 1 setInterval por re-render)
    if (ns.timer) clearInterval(ns.timer);
    ns.timer = setInterval(function() {
      var el = document.getElementById(CFG.rootId);
      if (el) loadAndRender(rpc, el, ns);
    }, CFG.refreshMs);
  });
}

function initWithRetry(attempt) {
  attempt = attempt || 0;
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start);
    return;
  }
  if (attempt > 50) {
    console.error('[BPC] nt-resumo-triggers: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
