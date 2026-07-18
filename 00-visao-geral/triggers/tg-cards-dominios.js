// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Triggers — Cards por domínio                              v1.0     ║
// ║                                                                          ║
// ║  1 card grande por domínio (8 Infra + Rede/Network): contadores por      ║
// ║  severidade (Desastre/Alta/Média/Aviso), pior problema activo com host   ║
// ║  e idade, idade do problema mais antigo, e drill-down para o N2.         ║
// ║                                                                          ║
// ║  Groupids resolvidos DINAMICAMENTE por nome (hostgroup.get) — sobrevive  ║
// ║  a renames de grupos: Infra por prefixo "BPC/DOMINIO/NN", Network por    ║
// ║  prefixo "HG_". Problem.get com suppressed:false (não conta o que está   ║
// ║  em maintenance). Nota: BPC.rpc tem cache ~30min p/ os mesmos params —   ║
// ║  os painéis nativos por baixo são a fonte "ao segundo"; os cards são o   ║
// ║  sumário executivo.                                                      ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-tg-cards',
  refreshMs: 60000,

  networkProxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',

  // domínios Infra: casados por prefixo do nome do grupo BPC/DOMINIO/*
  infraDomains: [
    { prefix: '01', label: 'Infraestrutura VMware', dashUid: 'a967e936-99a3-47c8-af98-052d7a80beb8' },
    { prefix: '02', label: 'Armazenamento',         dashUid: '993834a3-6bd3-4d25-88f5-0a59eab171fe' },
    { prefix: '03', label: 'Servidores Virtuais',   dashUid: '0758c24e-d2b1-4a81-bb14-1788ac8bec68' },
    { prefix: '05', label: 'Segurança',             dashUid: null },
    { prefix: '06', label: 'Bases de Dados',        dashUid: 'bd-n2' },
    { prefix: '07', label: 'Serviços de Negócio',   dashUid: 'apis-n2' },
    { prefix: '09', label: 'Integração e APIs',     dashUid: null },
    { prefix: '08', label: 'Datacenter Físico',     dashUid: null },
    { prefix: '10', label: 'Serviços de Suporte',   dashUid: 'suporte-n2' },
  ],
  // Rede vem da instância Network: grupos por prefixo do nome
  redeCard: { label: 'Rede (Network)', dashUid: 'rede-n2-segmentos', groupPrefixes: ['HG_'] },
};

var SEV = {
  5: { key: 'dis',  label: 'Desastre', color: '#f85149' },
  4: { key: 'high', label: 'Alta',     color: '#f85149' },
  3: { key: 'avg',  label: 'Média',    color: '#e3742f' },
  2: { key: 'warn', label: 'Aviso',    color: '#d29922' },
  1: { key: 'info', label: 'Info',     color: '#58a6ff' },
  0: { key: 'ncl',  label: 'N/class',  color: '#64748B' },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
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
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (json) {
      if (json.error) throw new Error(json.error.data || json.error.message);
      return json.result;
    });
}

// resolve groupids por nome, 1 chamada por instância (cacheado no namespace)
function resolveGroups(rpc, ns) {
  if (ns.groups) return Promise.resolve(ns.groups);
  var pInfra = rpc('hostgroup.get', { search: { name: 'BPC/DOMINIO' }, output: ['groupid', 'name'] });
  var pNet = rpcNetwork('hostgroup.get', { output: ['groupid', 'name'] })
    .catch(function () { return []; });
  return Promise.all([pInfra, pNet]).then(function (res) {
    var infra = res[0] || [], network = res[1] || [];
    var map = { infra: {}, rede: [] };
    infra.forEach(function (g) {
      var m = /BPC\/DOMINIO\/(\d\d)\s/.exec(g.name + ' ');
      if (m) map.infra[m[1]] = (map.infra[m[1]] || []).concat(g.groupid);
    });
    network.forEach(function (g) {
      var ok = CFG.redeCard.groupPrefixes.some(function (p) { return g.name.indexOf(p) === 0; });
      if (ok) map.rede.push(g.groupid);
    });
    ns.groups = map;
    return map;
  });
}

function fetchProblemas(callFn, groupids) {
  if (!groupids || !groupids.length) return Promise.resolve(null);
  return callFn('problem.get', {
    groupids: groupids,
    output: ['eventid', 'objectid', 'name', 'severity', 'clock'],
    suppressed: false,
    sortfield: ['eventid'],
    sortorder: 'DESC',
  }).then(function (problems) {
    problems.sort(function (a, b) {
      return (parseInt(b.severity, 10) - parseInt(a.severity, 10))
        || (parseInt(b.clock, 10) - parseInt(a.clock, 10));
    });
    var top = problems[0] || null;
    if (!top) return { problems: problems, worstHost: null };
    return callFn('trigger.get', {
      triggerids: [top.objectid], output: ['triggerid'], selectHosts: ['name'],
    }).then(function (trigs) {
      var h = trigs && trigs[0] && trigs[0].hosts && trigs[0].hosts[0];
      return { problems: problems, worstHost: h ? h.name : '?' };
    });
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function contar(problems) {
  var c = { dis: 0, high: 0, avg: 0, warn: 0, resto: 0, oldest: null };
  problems.forEach(function (p) {
    var s = parseInt(p.severity, 10) || 0;
    if (s === 5) c.dis++;
    else if (s === 4) c.high++;
    else if (s === 3) c.avg++;
    else if (s === 2) c.warn++;
    else c.resto++;
    var ck = parseInt(p.clock, 10);
    if (c.oldest === null || ck < c.oldest) c.oldest = ck;
  });
  return c;
}

function contador(n, label, color) {
  var on = n > 0;
  return '<div style="text-align:center;min-width:64px;">'
    + '<div style="font-size:2.1rem;font-weight:800;line-height:1;color:' + (on ? color : 'rgba(255,255,255,.18)') + ';">' + n + '</div>'
    + '<div style="font-size:.68rem;font-weight:700;letter-spacing:.5px;margin-top:3px;color:' + (on ? color : 'rgba(255,255,255,.30)') + ';">' + label + '</div>'
    + '</div>';
}

function renderCard(label, dashUid, r) {
  if (!r) {
    return '<div class="bpc bpc-card" style="--card-accent:#64748B;padding:16px 20px;">'
      + '<div style="font-size:1.1rem;font-weight:700;color:#E6EDF3;">' + esc(label) + '</div>'
      + '<div class="bpc-error-msg" style="margin-top:8px;">Sem dados</div></div>';
  }
  var c = contar(r.problems);
  var state = (c.dis + c.high) > 0 ? 'crit' : (c.avg + c.warn) > 0 ? 'warn' : 'ok';
  var accent = { ok: '#22C55E', warn: '#d29922', crit: '#f85149' }[state];

  var titulo = dashUid
    ? '<a href="/d/' + dashUid + '" style="color:#E6EDF3;text-decoration:none;">' + esc(label) + ' <span style="color:var(--bpc-cyan);font-size:.85rem;">↗</span></a>'
    : esc(label);

  var pior = '';
  var worst = r.problems[0];
  if (worst) {
    var sev = SEV[parseInt(worst.severity, 10)] || SEV[0];
    pior = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);display:flex;gap:8px;align-items:baseline;min-width:0;">'
      + '<span style="flex:none;font-size:.68rem;font-weight:700;padding:2px 7px;border-radius:8px;background:' + sev.color + '22;color:' + sev.color + ';border:1px solid ' + sev.color + '55;">' + sev.label + '</span>'
      + '<span style="flex:none;font-size:.84rem;color:rgba(255,255,255,.78);max-width:34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(r.worstHost || '?') + '</span>'
      + '<span style="flex:1;font-size:.84rem;color:rgba(255,255,255,.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(worst.name) + '</span>'
      + '<span style="flex:none;font-size:.78rem;color:rgba(255,255,255,.38);">' + idade(worst.clock) + '</span>'
      + '</div>';
  } else {
    pior = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.07);font-size:.9rem;color:#22C55E;">Sem problemas activos</div>';
  }

  var meta = [];
  if (c.oldest) meta.push('mais antigo: ' + idade(c.oldest));
  if (c.resto) meta.push('+' + c.resto + ' info/n-class');
  meta.push(r.problems.length + ' total');

  return '<div class="bpc bpc-card" style="--card-accent:' + accent + ';padding:16px 20px;display:flex;flex-direction:column;min-width:0;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">'
    +   '<div style="font-size:1.1rem;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + titulo + '</div>'
    +   '<div style="font-size:.72rem;color:rgba(255,255,255,.35);white-space:nowrap;">' + meta.join(' · ') + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px;justify-content:space-around;margin-top:12px;">'
    +   contador(c.dis,  'DESASTRE', '#f85149')
    +   contador(c.high, 'ALTA',     '#f97583')
    +   contador(c.avg,  'MÉDIA',    '#e3742f')
    +   contador(c.warn, 'AVISO',    '#d29922')
    + '</div>'
    + pior
    + '</div>';
}

function loadAndRender(rpc, root, ns) {
  resolveGroups(rpc, ns).then(function (groups) {
    var jobs = CFG.infraDomains.map(function (d) {
      return fetchProblemas(function (m, p) { return rpc(m, p); }, groups.infra[d.prefix])
        .catch(function (e) { console.warn('[BPC] tg-cards ' + d.prefix, e); return null; });
    });
    jobs.push(fetchProblemas(rpcNetwork, groups.rede)
      .catch(function (e) { console.warn('[BPC] tg-cards rede', e); return null; }));

    Promise.all(jobs).then(function (results) {
      var cards = CFG.infraDomains.map(function (d, i) { return renderCard(d.label, d.dashUid, results[i]); });
      cards.push(renderCard(CFG.redeCard.label, CFG.redeCard.dashUid, results[results.length - 1]));
      root.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:12px;padding:2px 0;">'
        + cards.join('') + '</div>';
      ns.html = root.innerHTML;
    });
  }).catch(function (e) {
    console.error('[BPC] tg-cards: resolveGroups falhou', e);
    root.innerHTML = '<div class="bpc-error-msg">Erro a resolver grupos: ' + esc(e.message) + '</div>';
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function (root) {
    if (!window.__bpc_ns) window.__bpc_ns = {};
    var ns = window.__bpc_ns[CFG.rootId] = window.__bpc_ns[CFG.rootId] || {};
    if (ns.html) root.innerHTML = ns.html;
    else root.innerHTML = '<div class="bpc-skeleton" style="height:260px;"></div>';
    loadAndRender(rpc, root, ns);
    if (ns.timer) clearInterval(ns.timer);
    ns.timer = setInterval(function () {
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
    console.error('[BPC] tg-cards-dominios: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function () { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
