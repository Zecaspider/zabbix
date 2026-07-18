// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Triggers por Domínio — vista SEGREGADA (tabelas BT)       v1.0     ║
// ║                                                                          ║
// ║  1 secção por domínio (10 domínios reais das 2 instâncias), cada uma     ║
// ║  com cabeçalho de estado + contadores por severidade + TABELA BT dos     ║
// ║  problemas activos desse domínio (severidade, host, problema, idade,     ║
// ║  ack). NÃO agregado — cada domínio tem a sua própria tabela, ao          ║
// ║  contrário do `visao-triggers` (que junta tudo Infra / tudo Network).    ║
// ║                                                                          ║
// ║  Groupids resolvidos DINAMICAMENTE por nome (BPC/DOMINIO/NN na Infra,    ║
// ║  HG_* na Network) — imune a rename/renumeração de grupos (foi um 608     ║
// ║  morto que mostrou o VMware a verde com 88 críticos, 2026-07-18).        ║
// ║  Rede segregada nos seus 4 segmentos reais (agências, edifícios, DC).    ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-td-dominios',
  refreshMs: 60000,
  maxLinhas: 12,          // problemas mostrados por domínio (resto sumariado)
  minSeveridade: 0,       // mostra tudo; o filtro visual é a cor

  networkProxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',

  // Ordem = camadas chão-de-fábrica → enduser (igual ao N1), Rede segregada
  // nos seus segmentos. `resolve`: 'infra' casa BPC/DOMINIO/<prefix>;
  // 'network' usa groupids fixos (estáveis) do segmento.
  dominios: [
    { id: '01', label: 'Infraestrutura VMware',   resolve: 'infra',   prefix: '01', dashUid: 'a967e936-99a3-47c8-af98-052d7a80beb8' },
    { id: '02', label: 'Armazenamento',           resolve: 'infra',   prefix: '02', dashUid: '993834a3-6bd3-4d25-88f5-0a59eab171fe' },
    { id: '03', label: 'Servidores Virtuais',     resolve: 'infra',   prefix: '03', dashUid: '0758c24e-d2b1-4a81-bb14-1788ac8bec68' },
    { id: '06', label: 'Bases de Dados',          resolve: 'infra',   prefix: '06', dashUid: 'bd-n2' },
    { id: '07', label: 'Serviços de Negócio',     resolve: 'infra',   prefix: '07', dashUid: 'apis-n2' },
    { id: '09', label: 'Integração e APIs',       resolve: 'infra',   prefix: '09', dashUid: null },
    { id: '05', label: 'Segurança',               resolve: 'infra',   prefix: '05', dashUid: null },
    { id: '08', label: 'Datacenter Físico',       resolve: 'infra',   prefix: '08', dashUid: null },
    { id: '10', label: 'Serviços de Suporte',     resolve: 'infra',   prefix: '10', dashUid: 'suporte-n2' },
    { id: 'rede-ag', label: 'Rede · Agências',    resolve: 'network', groupids: ['24', '25'], dashUid: 'rede-n3-agencias' },
    { id: 'rede-ed', label: 'Rede · Edifícios',   resolve: 'network', groupids: ['28', '29'], dashUid: 'rede-n3-edificios' },
    { id: 'rede-dc', label: 'Rede · Datacenter',  resolve: 'network', groupids: ['26', '27'], dashUid: 'rede-n3-dc-dispositivos' },
  ],
};

var SEV = {
  5: { label: 'Desastre', color: '#f85149', rank: 5 },
  4: { label: 'Alta',     color: '#f97583', rank: 4 },
  3: { label: 'Média',    color: '#e3742f', rank: 3 },
  2: { label: 'Aviso',    color: '#d29922', rank: 2 },
  1: { label: 'Info',     color: '#58a6ff', rank: 1 },
  0: { label: 'N/class',  color: '#8b949e', rank: 0 },
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
    .then(function (j) { if (j.error) throw new Error(j.error.data || j.error.message); return j.result; });
}

// resolve os prefixos BPC/DOMINIO/NN → groupids, 1 vez (cacheado no ns)
function resolveGroups(rpc, ns) {
  if (ns.byPrefix) return Promise.resolve(ns.byPrefix);
  return rpc('hostgroup.get', { search: { name: 'BPC/DOMINIO' }, output: ['groupid', 'name'] })
    .then(function (groups) {
      var byPrefix = {};
      groups.forEach(function (g) {
        var m = /BPC\/DOMINIO\/(\d\d)\s/.exec(g.name + ' ');
        if (m) (byPrefix[m[1]] = byPrefix[m[1]] || []).push(g.groupid);
      });
      ns.byPrefix = byPrefix;
      return byPrefix;
    });
}

function fetchDominio(rpc, dom, byPrefix) {
  var callFn = dom.resolve === 'network' ? rpcNetwork : function (m, p) { return rpc(m, p); };
  var gids = dom.resolve === 'network' ? dom.groupids : (byPrefix[dom.prefix] || []);
  if (!gids.length) return Promise.resolve({ problems: [], hosts: {}, empty: true });

  return callFn('problem.get', {
    groupids: gids,
    output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged'],
    suppressed: false, sortfield: ['eventid'], sortorder: 'DESC',
  }).then(function (problems) {
    problems.sort(function (a, b) {
      return (parseInt(b.severity, 10) - parseInt(a.severity, 10))
        || (parseInt(b.clock, 10) - parseInt(a.clock, 10));
    });
    var top = problems.slice(0, CFG.maxLinhas);
    var ids = top.map(function (p) { return p.objectid; });
    if (!ids.length) return { problems: problems, hosts: {} };
    return callFn('trigger.get', { triggerids: ids, output: ['triggerid'], selectHosts: ['name'] })
      .then(function (trigs) {
        var hosts = {};
        trigs.forEach(function (t) { hosts[t.triggerid] = (t.hosts && t.hosts[0] && t.hosts[0].name) || '?'; });
        return { problems: problems, hosts: hosts };
      });
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function contadores(problems) {
  var c = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
  problems.forEach(function (p) { c[parseInt(p.severity, 10) || 0]++; });
  return c;
}

function chipSev(sev, n) {
  var s = SEV[sev];
  var on = n > 0;
  return '<span style="display:inline-flex;align-items:center;gap:5px;font-size:.72rem;font-weight:700;'
    + 'padding:3px 9px;border-radius:9px;background:' + (on ? s.color + '22' : 'rgba(255,255,255,.04)')
    + ';color:' + (on ? s.color : 'rgba(255,255,255,.25)') + ';border:1px solid ' + (on ? s.color + '55' : 'rgba(255,255,255,.06)') + ';">'
    + s.label + ' <b style="font-size:.82rem;">' + n + '</b></span>';
}

function tabelaProblemas(dom, r) {
  if (r.empty) {
    return '<div style="padding:12px 4px;font-size:.85rem;color:#d29922;">Grupo não resolvido (sem hosts) — verificar taxonomia</div>';
  }
  if (!r.problems.length) {
    return '<div style="padding:14px 4px;font-size:.92rem;color:#22C55E;">✓ Sem problemas activos neste domínio</div>';
  }
  var linhas = r.problems.slice(0, CFG.maxLinhas).map(function (p) {
    var sev = SEV[parseInt(p.severity, 10)] || SEV[0];
    var host = r.hosts[p.objectid] || '?';
    var ackMark = p.acknowledged === '1'
      ? '<span title="reconhecido" style="color:#3FB950;font-size:.75rem;">✔ ack</span>'
      : '<span style="color:rgba(255,255,255,.25);font-size:.75rem;">—</span>';
    return '<tr style="border-top:1px solid rgba(255,255,255,.05);">'
      + '<td style="padding:6px 10px 6px 0;white-space:nowrap;"><span style="display:inline-block;min-width:64px;text-align:center;font-size:.68rem;font-weight:700;padding:2px 6px;border-radius:7px;background:' + sev.color + '22;color:' + sev.color + ';border:1px solid ' + sev.color + '55;">' + sev.label + '</span></td>'
      + '<td style="padding:6px 12px 6px 0;font-size:.86rem;color:rgba(255,255,255,.82);white-space:nowrap;max-width:210px;overflow:hidden;text-overflow:ellipsis;" title="' + esc(host) + '">' + esc(host) + '</td>'
      + '<td style="padding:6px 12px 6px 0;font-size:.86rem;color:rgba(255,255,255,.60);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:0;" title="' + esc(p.name) + '">' + esc(p.name) + '</td>'
      + '<td style="padding:6px 10px 6px 0;font-size:.78rem;color:rgba(255,255,255,.42);text-align:right;white-space:nowrap;">' + idade(p.clock) + '</td>'
      + '<td style="padding:6px 0;text-align:right;white-space:nowrap;">' + ackMark + '</td>'
      + '</tr>';
  }).join('');
  var resto = r.problems.length - Math.min(r.problems.length, CFG.maxLinhas);
  var rodape = resto > 0
    ? '<div style="font-size:.78rem;color:rgba(255,255,255,.35);margin-top:6px;padding-left:2px;">+ ' + resto + ' problema(s) adicionais neste domínio</div>'
    : '';
  return '<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:6px;">'
    + '<colgroup><col style="width:78px;"><col style="width:215px;"><col><col style="width:52px;"><col style="width:56px;"></colgroup>'
    + '<thead><tr style="font-size:.68rem;text-transform:uppercase;letter-spacing:.4px;color:rgba(255,255,255,.35);text-align:left;">'
    + '<th style="padding:0 10px 4px 0;">Sev.</th><th style="padding:0 12px 4px 0;">Host</th><th style="padding:0 12px 4px 0;">Problema</th><th style="padding:0 10px 4px 0;text-align:right;">Idade</th><th style="padding:0 0 4px 0;text-align:right;">Ack</th>'
    + '</tr></thead><tbody>' + linhas + '</tbody></table>' + rodape;
}

function seccaoDominio(dom, r) {
  var c = contadores(r.problems || []);
  var nCrit = c[5] + c[4], nMed = c[3] + c[2];
  var state = nCrit > 0 ? 'crit' : nMed > 0 ? 'warn' : 'ok';
  var accent = { ok: '#22C55E', warn: '#d29922', crit: '#f85149' }[state];
  var total = (r.problems || []).length;

  var titulo = dom.dashUid
    ? '<a href="/d/' + dom.dashUid + '" style="color:#E6EDF3;text-decoration:none;">' + esc(dom.label) + ' <span style="color:var(--bpc-cyan,#38bdf8);font-size:.8rem;">↗</span></a>'
    : esc(dom.label);

  return '<div class="bpc bpc-card" style="--card-accent:' + accent + ';padding:16px 20px 18px;display:flex;flex-direction:column;min-width:0;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">'
    +   '<div style="display:flex;align-items:baseline;gap:12px;min-width:0;">'
    +     '<span style="font-size:1.15rem;font-weight:700;">' + titulo + '</span>'
    +     '<span style="font-size:.75rem;color:rgba(255,255,255,.35);white-space:nowrap;">' + total + ' activo' + (total === 1 ? '' : 's') + '</span>'
    +   '</div>'
    +   '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
    +     chipSev(5, c[5]) + chipSev(4, c[4]) + chipSev(3, c[3]) + chipSev(2, c[2])
    +   '</div>'
    + '</div>'
    + tabelaProblemas(dom, r)
    + '</div>';
}

function loadAndRender(rpc, root, ns) {
  resolveGroups(rpc, ns).then(function (byPrefix) {
    var jobs = CFG.dominios.map(function (dom) {
      return fetchDominio(rpc, dom, byPrefix).catch(function (e) {
        console.warn('[BPC] td-dominios ' + dom.id, e);
        return { problems: [], hosts: {}, erro: true };
      });
    });
    Promise.all(jobs).then(function (results) {
      var seccoes = CFG.dominios.map(function (dom, i) {
        var r = results[i];
        if (r && r.erro) {
          return '<div class="bpc bpc-card" style="--card-accent:#8b949e;padding:16px 20px;">'
            + '<div style="font-size:1.15rem;font-weight:700;">' + esc(dom.label) + '</div>'
            + '<div class="bpc-error-msg" style="margin-top:8px;">Erro ao carregar</div></div>';
        }
        return seccaoDominio(dom, r);
      });
      root.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:14px;padding:2px 0;">'
        + seccoes.join('') + '</div>';
      ns.html = root.innerHTML;
    });
  }).catch(function (e) {
    console.error('[BPC] td-dominios: resolveGroups falhou', e);
    root.innerHTML = '<div class="bpc-error-msg">Erro a resolver grupos: ' + esc(e.message) + '</div>';
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function (root) {
    if (!window.__bpc_ns) window.__bpc_ns = {};
    var ns = window.__bpc_ns[CFG.rootId] = window.__bpc_ns[CFG.rootId] || {};
    if (ns.html) root.innerHTML = ns.html;
    else root.innerHTML = '<div class="bpc-skeleton" style="height:320px;"></div>';
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
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return; }
  if (attempt > 50) { console.error('[BPC] td-dominios: waitForBPC indisponivel'); return; }
  setTimeout(function () { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
