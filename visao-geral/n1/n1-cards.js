// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Portal NOC — Cards de Domínio                          v1.0       ║
// ║                                                                          ║
// ║  9 cards (3 colunas × 3 linhas) com estado de saúde por domínio.       ║
// ║  Estado calculado via problem.get (triggers activos) por groupids.      ║
// ║  Domínios sem N2 mostram badge "Em Construção" e sem link.              ║
// ║                                                                          ║
// ║  DATASOURCES                                                             ║
// ║  Infra  (3_KgG43nz)         → VMware, VMs, Storage, Seg, BD, APIs, SN  ║
// ║  Network (ffo8sp8zllog0e)   → Rede, Agências (fetch directo)            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── CFG ───────────────────────────────────────────────────────────────────────

var CFG = {
  rootId: 'bpc-n1-cards',
  refreshMs: 60000,

  // Proxy para o Zabbix Network (usado directamente nas 2 chamadas de rede/agências)
  networkProxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',

  // Definição dos 9 domínios. Ordem = posição no grid (esq→dir, cima→baixo).
  // dashUid: null → domínio em construção (sem link, badge visível)
  domains: [
    {
      id: 'vmware',
      label: 'Infraestrutura VMware',
      sublabel: 'vCenters · ESXi · Clusters',
      groupids: ['608'],
      datasource: 'infra',
      dashUid: 'a967e936-99a3-47c8-af98-052d7a80beb8',
      dashSlug: 'n2-vmware',
    },
    {
      id: 'vms',
      label: 'Servidores Virtuais',
      sublabel: 'VMs em produção',
      groupids: ['609'],
      datasource: 'infra',
      dashUid: '0758c24e-d2b1-4a81-bb14-1788ac8bec68',
      dashSlug: 'n2-vms',
    },
    {
      id: 'storage',
      label: 'Armazenamento',
      sublabel: 'Storage · Tape Library',
      groupids: ['602', '605'],
      datasource: 'infra',
      dashUid: '993834a3-6bd3-4d25-88f5-0a59eab171fe',
      dashSlug: 'n2-armazenamento',
    },
    {
      id: 'rede',
      label: 'Rede',
      sublabel: 'DC · Edifícios · WAN',
      groupids: ['26', '27', '28', '29'],
      datasource: 'network',
      dashUid: 'ec590abd-c1ab-4b83-ac26-2b998aa80556',
      dashSlug: 'n2-rede',
    },
    {
      id: 'seguranca',
      label: 'Segurança',
      sublabel: 'Firewalls · WAF · Darktrace',
      groupids: ['656'],
      datasource: 'infra',
      dashUid: null,
      dashSlug: null,
    },
    {
      id: 'bd',
      label: 'Bases de Dados',
      sublabel: 'Instâncias DB',
      groupids: ['355'],
      datasource: 'infra',
      dashUid: null,
      dashSlug: null,
    },
    {
      id: 'apis',
      label: 'APIs & Serviços',
      sublabel: 'Sintéticos · Camada Aplicacional',
      groupids: ['663', '345'],
      datasource: 'infra',
      dashUid: null,
      dashSlug: null,
    },
    {
      id: 'negocio',
      label: 'Serviços de Negócio',
      sublabel: 'eBankit · Jornadas',
      groupids: ['391'],
      datasource: 'infra',
      dashUid: null,
      dashSlug: null,
    },
    {
      id: 'agencias',
      label: 'Agências',
      sublabel: 'Routers · Links WAN',
      groupids: ['24'],
      datasource: 'network',
      dashUid: null,
      dashSlug: null,
    },
  ],
};


// ── UTILS ─────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Classifica um array de problemas activos → { ok, warn, crit, state, nWarn, nCrit }
function classifyProblems(problems) {
  var nCrit = 0, nWarn = 0;
  problems.forEach(function(p) {
    var sev = parseInt(p.severity, 10) || 0;
    if (sev >= 4) nCrit++;
    else if (sev >= 2) nWarn++;
  });
  var state = nCrit > 0 ? 'crit' : nWarn > 0 ? 'warn' : 'ok';
  return { nWarn: nWarn, nCrit: nCrit, state: state };
}

function stateColor(state) {
  return { ok: '#22C55E', warn: '#d29922', crit: '#f85149' }[state] || '#64748B';
}

function pillClass(state) {
  return { ok: 'ok', warn: 'warn', crit: 'down' }[state] || 'ok';
}

function pillLabel(state) {
  return { ok: 'OK', warn: 'Degradado', crit: 'Crítico' }[state] || 'OK';
}

function cardClass(state) {
  return { ok: 'state-ok', warn: 'state-warn', crit: 'state-down' }[state] || 'state-ok';
}


// ── FETCH ─────────────────────────────────────────────────────────────────────

// Busca problemas activos para um ou mais groupids via BPC rpc (Infra)
function fetchProblemsInfra(rpc, groupids) {
  return rpc('problem.get', {
    groupids: groupids,
    output: ['eventid', 'severity'],
    suppressed: false,
  });
}

// Busca problemas activos para groupids via fetch directo ao proxy Network
function fetchProblemsNetwork(groupids) {
  return fetch(CFG.networkProxy, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-grafana-org-id': '1' },
    credentials: 'include',
    body: JSON.stringify({
      method: 'problem.get',
      params: {
        groupids: groupids,
        output: ['eventid', 'severity'],
        suppressed: false,
      },
    }),
  })
  .then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function(json) {
    if (json.error) throw new Error(json.error.data || json.error.message);
    return json.result;
  });
}


// ── RENDER ────────────────────────────────────────────────────────────────────

// Skeleton de loading (9 cards)
function renderSkeleton() {
  var cards = '';
  for (var i = 0; i < 9; i++) {
    cards += '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);display:flex;flex-direction:column;gap:10px;">'
      + '<div class="bpc-skeleton" style="height:10px;width:55%"></div>'
      + '<div class="bpc-skeleton" style="height:8px;width:70%;margin-top:2px"></div>'
      + '<div class="bpc-skeleton" style="height:22px;width:40%;margin-top:6px"></div>'
      + '<div class="bpc-skeleton" style="height:10px;width:55%;margin-top:auto"></div>'
      + '</div>';
  }
  return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 0;">' + cards + '</div>';
}

// Card de um domínio com dados reais
function renderDomainCard(domain, result) {
  var classified = classifyProblems(result.problems || []);
  var state = classified.state;
  var accent = stateColor(state);
  var hasN2 = !!domain.dashUid;

  var headerBadge = hasN2
    ? '<span class="bpc-pill ' + pillClass(state) + '">' + pillLabel(state) + '</span>'
    : '<span style="font-size:.60rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:8px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.30);border:1px solid rgba(255,255,255,0.10);">Em Construção</span>';

  var counters = hasN2
    ? '<div style="display:flex;gap:16px;margin-top:10px;">'
        + '<div style="display:flex;flex-direction:column;gap:3px;">'
        +   '<span style="font-size:1.50rem;font-weight:700;color:#E6EDF3;line-height:1;">' + classified.nCrit + '</span>'
        +   '<span class="bpc-label bpc-crit">Crít.</span>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:3px;">'
        +   '<span style="font-size:1.50rem;font-weight:700;color:#E6EDF3;line-height:1;">' + classified.nWarn + '</span>'
        +   '<span class="bpc-label bpc-warn">Aviso</span>'
        + '</div>'
      + '</div>'
    : '<div style="margin-top:10px;font-size:.72rem;color:rgba(255,255,255,0.22);">Dashboard em desenvolvimento</div>';

  var footer = hasN2
    ? '<a href="/d/' + domain.dashUid + '/' + domain.dashSlug + '" '
        + 'style="font-size:.70rem;color:var(--bpc-cyan);text-decoration:none;margin-top:auto;padding-top:8px;display:block;">'
        + 'Ver N2 →</a>'
    : '<span style="font-size:.70rem;color:rgba(255,255,255,0.15);margin-top:auto;padding-top:8px;display:block;">—</span>';

  var errorNote = result.error
    ? '<div style="font-size:.62rem;color:rgba(239,68,68,0.70);margin-top:4px;">Erro ao carregar dados</div>'
    : '';

  var cardInner = '<div class="bpc bpc-card ' + cardClass(state) + '" '
    + 'style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;">'
    +   '<div>'
    +     '<div style="font-size:.95rem;font-weight:700;color:#E6EDF3;line-height:1.2;">' + esc(domain.label) + '</div>'
    +     '<div style="font-size:.68rem;color:rgba(255,255,255,0.35);margin-top:2px;">' + esc(domain.sublabel) + '</div>'
    +   '</div>'
    +   headerBadge
    + '</div>'
    + counters
    + errorNote
    + footer
    + '</div>';

  return hasN2
    ? cardInner
    : cardInner; // sem wrapper <a> nos em-construção — o footer já não tem link
}

// Card de erro (quando o fetch falha completamente)
function renderErrorCard(domain) {
  return '<div class="bpc bpc-card state-ok" style="--card-accent:var(--bpc-mute);height:100%;display:flex;flex-direction:column;">'
    + '<div style="font-size:.90rem;font-weight:700;color:#E6EDF3;">' + esc(domain.label) + '</div>'
    + '<div style="font-size:.68rem;color:rgba(255,255,255,0.30);margin-top:2px;">' + esc(domain.sublabel) + '</div>'
    + '<div class="bpc-error-msg" style="margin-top:10px;">Sem dados</div>'
    + '</div>';
}

// Grid final com todos os cards
function renderGrid(results) {
  var cards = CFG.domains.map(function(domain, i) {
    var r = results[i];
    if (!r) return renderErrorCard(domain);
    return renderDomainCard(domain, r);
  });
  return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:4px 0;">'
    + cards.join('')
    + '</div>';
}


// ── CARGA E REFRESH ───────────────────────────────────────────────────────────

function loadAndRender(rpc, root) {
  var fetches = CFG.domains.map(function(domain) {
    var fetchFn = domain.datasource === 'network'
      ? fetchProblemsNetwork(domain.groupids)
      : fetchProblemsInfra(rpc, domain.groupids);

    return fetchFn
      .then(function(problems) { return { problems: problems, error: null }; })
      .catch(function(err) {
        console.warn('[BPC] n1-cards: erro no domínio ' + domain.id, err);
        return { problems: [], error: err.message };
      });
  });

  Promise.all(fetches).then(function(results) {
    root.innerHTML = renderGrid(results);
  });
}


// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    root.innerHTML = renderSkeleton();
    loadAndRender(rpc, root);
    BPC.utils.startRefresh(root, function() { loadAndRender(rpc, root); }, CFG.refreshMs);
  });
}

function initWithRetry(attempt) {
  attempt = attempt || 0;
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start);
    return;
  }
  if (attempt > 50) {
    console.error('[BPC] n1-cards: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
