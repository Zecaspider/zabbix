// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Portal NOC — Cards de Área                              v2.1       ║
// ║                                                                          ║
// ║  7 cards (4 colunas x 2 linhas, ultima incompleta com 3) com estado de   ║
// ║  saude por dominio. 1 card = 1 pasta Grafana real (confirmado por        ║
// ║  folders.get ao vivo, 2026-07-12) - nunca inventar dominios que nao      ║
// ║  batam certo com a estrutura de pastas. Estado calculado via             ║
// ║  problem.get (triggers activos) por groupids. Dominios sem N2 mostram    ║
// ║  badge "Em Construcao" e sem link.                                       ║
// ║                                                                          ║
// ║  v2.1 (2026-07-12): "APIs & Servicos" e "Servicos de Negocio" fundidos   ║
// ║  num so card - a pasta "08 Servicos de Negocio" foi apagada em           ║
// ║  2026-07-10 (estava vazia) e fundida na "07 APIs e Servicos de           ║
// ║  Negocio" (CLAUDE.md); os cards nunca tinham sido actualizados para      ║
// ║  reflectir isso, e "APIs & Servicos" continuava "Em Construcao" apesar   ║
// ║  do dashboard N2 real (apis-n2) ja existir - corrigido tambem.           ║
// ║                                                                          ║
// ║  Ordem = modelo em camadas, chao de fabrica -> aplicacoes enduser:       ║
// ║  Virtualizacao/Fisico -> Compute/Storage -> Rede -> Dados -> APIs e      ║
// ║  Servicos de Negocio, com Seguranca a parte (camada transversal).       ║
// ║  Agencias deixou de ter card proprio - e segmento de Rede (CLAUDE.md,    ║
// ║  ver 04·Rede › 04.1·Agencias); continua acessivel via Rede -> N2 -> N3.  ║
// ║                                                                          ║
// ║  DATASOURCES                                                             ║
// ║  Infra  (3_KgG43nz)         → VMware, VMs, Storage, Seg, BD, APIs/SN   ║
// ║  Network (ffo8sp8zllog0e)   → Rede (fetch directo)                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── CFG ───────────────────────────────────────────────────────────────────────

var CFG = {
  rootId: 'bpc-n1-cards',
  refreshMs: 60000,

  // Proxy para o Zabbix Network (usado directamente nas 2 chamadas de rede/agências)
  networkProxy: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',

  // Definição das 7 áreas = 7 pastas reais do Grafana (00·Visão Geral e
  // 99·Arquivo não contam; 09·Agências está vazia, ver nota acima).
  // Ordem = modelo em camadas (chão de fábrica → enduser), posição no grid
  // esq→dir, cima→baixo. dashUid: null → área em construção.
  domains: [
    {
      id: 'vmware',
      label: 'Infraestrutura VMware',
      sublabel: 'Físico · vCenters · ESXi · Clusters',
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
      sublabel: 'DC · Edifícios · WAN · Agências',
      groupids: ['26', '27', '28', '29'],
      datasource: 'network',
      dashUid: 'rede-n2-segmentos',
      dashSlug: 'n2-rede',
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
      id: 'apis-negocio',
      label: 'APIs e Serviços de Negócio',
      sublabel: 'Endpoints técnicos · Sintéticos · eBankit',
      groupids: ['663', '345', '391'],
      datasource: 'infra',
      dashUid: 'apis-n2',
      dashSlug: 'n2-apis-servicos-negocio',
    },
    {
      id: 'seguranca',
      label: 'Segurança',
      sublabel: 'Transversal · Firewalls · WAF · Darktrace',
      groupids: ['656'],
      datasource: 'infra',
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

// Skeleton de loading (7 cards) — 4x2 (ultima linha incompleta), mesma
// grelha do render final
function renderSkeleton() {
  var cards = '';
  for (var i = 0; i < 7; i++) {
    cards += '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);display:flex;flex-direction:column;gap:16px;padding:26px 24px;">'
      + '<div class="bpc-skeleton" style="height:18px;width:65%"></div>'
      + '<div class="bpc-skeleton" style="height:12px;width:80%;margin-top:2px"></div>'
      + '<div class="bpc-skeleton" style="height:42px;width:45%;margin-top:10px"></div>'
      + '<div class="bpc-skeleton" style="height:14px;width:40%;margin-top:auto"></div>'
      + '</div>';
  }
  return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:18px;padding:4px 0;height:100%">' + cards + '</div>';
}

// Card de um domínio com dados reais — dimensionado para leitura à
// distância num ecrã de NOC (parede), não para consulta ao perto.
function renderDomainCard(domain, result) {
  var classified = classifyProblems(result.problems || []);
  var state = classified.state;
  var accent = stateColor(state);
  var hasN2 = !!domain.dashUid;

  var headerBadge = hasN2
    ? '<span class="bpc-pill ' + pillClass(state) + '" style="font-size:.90rem;padding:5px 14px;border-radius:12px;">' + pillLabel(state) + '</span>'
    : '<span style="font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;padding:5px 12px;border-radius:12px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.30);border:1px solid rgba(255,255,255,0.10);">Em Construção</span>';

  var counters = hasN2
    ? '<div style="display:flex;gap:36px;margin-top:18px;">'
        + '<div style="display:flex;flex-direction:column;gap:6px;">'
        +   '<span style="font-size:3.1rem;font-weight:700;color:#E6EDF3;line-height:1;">' + classified.nCrit + '</span>'
        +   '<span class="bpc-label bpc-crit" style="font-size:.85rem;">Crít.</span>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px;">'
        +   '<span style="font-size:3.1rem;font-weight:700;color:#E6EDF3;line-height:1;">' + classified.nWarn + '</span>'
        +   '<span class="bpc-label bpc-warn" style="font-size:.85rem;">Aviso</span>'
        + '</div>'
      + '</div>'
    : '<div style="margin-top:18px;font-size:1.05rem;color:rgba(255,255,255,0.22);">Dashboard em desenvolvimento</div>';

  var footer = hasN2
    ? '<a href="/d/' + domain.dashUid + '/' + domain.dashSlug + '" '
        + 'style="font-size:1.00rem;font-weight:600;color:var(--bpc-cyan);text-decoration:none;margin-top:auto;padding-top:16px;display:block;">'
        + esc(domain.linkLabel || 'Ver N2 →') + '</a>'
    : '<span style="font-size:1.00rem;color:rgba(255,255,255,0.15);margin-top:auto;padding-top:16px;display:block;">—</span>';

  var errorNote = result.error
    ? '<div style="font-size:.80rem;color:rgba(239,68,68,0.70);margin-top:6px;">Erro ao carregar dados</div>'
    : '';

  var cardInner = '<div class="bpc bpc-card ' + cardClass(state) + '" '
    + 'style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;padding:28px 26px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">'
    +   '<div>'
    +     '<div style="font-size:1.55rem;font-weight:700;color:#E6EDF3;line-height:1.2;">' + esc(domain.label) + '</div>'
    +     '<div style="font-size:.92rem;color:rgba(255,255,255,0.40);margin-top:5px;">' + esc(domain.sublabel) + '</div>'
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
  return '<div class="bpc bpc-card state-ok" style="--card-accent:var(--bpc-mute);height:100%;display:flex;flex-direction:column;padding:28px 26px;">'
    + '<div style="font-size:1.45rem;font-weight:700;color:#E6EDF3;">' + esc(domain.label) + '</div>'
    + '<div style="font-size:.92rem;color:rgba(255,255,255,0.30);margin-top:5px;">' + esc(domain.sublabel) + '</div>'
    + '<div class="bpc-error-msg" style="margin-top:18px;font-size:1.0rem;">Sem dados</div>'
    + '</div>';
}

// Grid final com todos os cards — 4 colunas x 2 linhas (7 domínios reais,
// última linha com 3 e uma célula em branco), a esticar para preencher
// toda a altura do painel. A quebra 4+3 bate certo com o estado real:
// os 4 primeiros (VMware/VMs/Storage/Rede) já têm N2; os 3 últimos
// (BD/APIs+SN/Segurança) estão "Em Construção" - não é coincidência de
// código, é o estado actual dos dashboards.
function renderGrid(results) {
  var cards = CFG.domains.map(function(domain, i) {
    var r = results[i];
    if (!r) return renderErrorCard(domain);
    return renderDomainCard(domain, r);
  });
  return '<div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:18px;padding:4px 0;height:100%">'
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
