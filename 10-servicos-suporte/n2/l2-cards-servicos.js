// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N2 · Serviços de Suporte — Estado por serviço                  v2.0     ║
// ║                                                                          ║
// ║  F4 do plano-melhorias-observabilidade-20260712.md. Os serviços que      ║
// ║  nunca têm dono e cuja falha "parece outra coisa": DNS, DHCP, AD,        ║
// ║  WSUS, Exchange, IAM, NTP.                                               ║
// ║                                                                          ║
// ║  Sem escrita no Zabbix: cada card agrega hosts pela tag `servico` já     ║
// ║  existente. Modelo de tier do domínio 06: cada card mostra o sinal que   ║
// ║  existe (serviços Windows > agente > só ping) e os gaps ficam visíveis.  ║
// ║                                                                          ║
// ║  v2.0 (2026-07-13, auditoria da 2ª sessão — 23 hosts, era 16):           ║
// ║  · cards clicáveis → drill N3 (suporte-n3?var-servico=<tag>)             ║
// ║  · frescura do agente (agent.ping lastclock >2h = "sem reportar")        ║
// ║  · Exchange passou de 1 para 6 hosts (390-393 mailbox PowerFlex + 394    ║
// ║    edge + 220 ARR, este DOWN desde 2026-05-22 — em confirmação c/ DTI)   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-sup-cards',
  refreshMs: 60000,
  n3Url: '/d/suporte-n3/n3-servicos-de-suporte-servico',
  agentStaleSec: 7200, // 2h — mesmo maxAgeSec.agent do domínio 03 (§4C.6)

  // 1 card = 1 serviço de suporte; hosts resolvidos pela tag `servico` (Infra).
  // tagValues casa por igualdade case-insensitive; tagLink é o valor REAL
  // (casing exacto) usado no drill ?var-servico= do N3.
  services: [
    { id: 'dns-interno', label: 'DNS Interno (AD)',   sub: 'Resolução interna — corre nos DCs',        tagValues: ['domain controller'], tagLink: 'DOMAIN CONTROLLER', svcKeys: ['DNS'] },
    { id: 'dns-externo', label: 'DNS Externo',        sub: 'NS3 · NS4 — zona pública',                  tagValues: ['dns externo'], tagLink: 'DNS EXTERNO' },
    { id: 'dhcp',        label: 'DHCP',               sub: 'Atribuição de endereços — 5 VMs',           tagValues: ['dhcp server'], tagLink: 'DHCP Server', svcKeys: ['Dhcp'] },
    { id: 'ad',          label: 'Active Directory',   sub: 'Domain Controllers — autenticação',         tagValues: ['domain controller'], tagLink: 'DOMAIN CONTROLLER', svcKeys: ['NTDS', 'Netlogon'] },
    { id: 'ntp',         label: 'NTP / Hora',         sub: 'Sincronização de relógio (W32Time nos DCs)', tagValues: ['domain controller'], tagLink: 'DOMAIN CONTROLLER', svcKeys: ['W32Time'], gapNote: 'Só o W32Time dos DCs é visível — não há checks de NTP nos restantes 600+ hosts (drift silencioso possível).' },
    { id: 'wsus',        label: 'WSUS',               sub: 'Actualizações Windows',                     tagValues: ['wsus'], tagLink: 'WSUS' },
    { id: 'aad',         label: 'Azure AD Connect',   sub: 'Sincronização identidades cloud',           tagValues: ['azure ad connet'], tagLink: 'AZURE AD CONNET' },
    { id: 'adaudit',     label: 'AD Audit',           sub: 'Auditoria do directório',                   tagValues: ['ad audit'], tagLink: 'AD AUDIT' },
    { id: 'mail',        label: 'Email / Exchange',   sub: 'Mailbox ×4 · Edge · ARR',                   tagValues: ['exchange'], tagLink: 'EXCHANGE' },
    { id: 'iam',         label: 'Acesso / IAM',       sub: 'SRV-JUMP01 · SRV-JUMP02',                   tagValues: ['iam'], tagLink: 'IAM' },
  ],
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// ── FETCH ─────────────────────────────────────────────────────────────────────
// 4 chamadas no total (não 4×card): hosts por tag, problemas, pings, service.info

function fetchTudo(rpc) {
  var tagValues = [];
  CFG.services.forEach(function(s) {
    s.tagValues.forEach(function(v) {
      if (tagValues.indexOf(v) < 0) tagValues.push(v);
    });
  });

  return rpc('host.get', {
    output: ['hostid', 'host', 'name', 'status'],
    selectTags: 'extend',
    filter: { status: '0' },
    tags: tagValues.map(function(v) { return { tag: 'servico', value: v, operator: '0' }; }),
    evaltype: 2, // OR
  }).then(function(hosts) {
    var hostids = hosts.map(function(h) { return h.hostid; });
    return Promise.all([
      Promise.resolve(hosts),
      rpc('trigger.get', { hostids: hostids, filter: { value: 1 }, output: ['triggerid', 'priority'], selectHosts: ['hostid'], monitored: true }),
      rpc('item.get', { hostids: hostids, filter: { key_: ['icmpping', 'agent.ping'], status: '0' }, output: ['hostid', 'key_', 'lastvalue', 'lastclock'] }),
      rpc('item.get', { hostids: hostids, search: { key_: 'service.info' }, filter: { status: '0' }, output: ['hostid', 'key_', 'name', 'lastvalue'] }),
    ]);
  });
}

// ── MODELO ────────────────────────────────────────────────────────────────────

function montar(hosts, triggers, pings, svcItems) {
  var sevPorHost = {};
  triggers.forEach(function(t) {
    var pri = parseInt(t.priority, 10);
    (t.hosts || []).forEach(function(h) {
      if (!(h.hostid in sevPorHost) || pri > sevPorHost[h.hostid]) sevPorHost[h.hostid] = pri;
    });
  });

  var pingPorHost = {};
  var agentStalePorHost = {}; // hostid -> true se agent.ping não reporta há > CFG.agentStaleSec
  var agora = Math.floor(Date.now() / 1000);
  pings.forEach(function(it) {
    var v = it.lastvalue === '1';
    // icmpping tem prioridade sobre agent.ping para "up/down" de rede
    if (it.key_ === 'icmpping' || !(it.hostid in pingPorHost)) pingPorHost[it.hostid] = v;
    if (it.key_ === 'agent.ping') {
      var lc = parseInt(it.lastclock, 10) || 0;
      agentStalePorHost[it.hostid] = (agora - lc) > CFG.agentStaleSec;
    }
  });

  var svcPorHost = {};
  svcItems.forEach(function(it) {
    (svcPorHost[it.hostid] = svcPorHost[it.hostid] || []).push(it);
  });

  return CFG.services.map(function(svc) {
    var meus = hosts.filter(function(h) {
      return (h.tags || []).some(function(t) {
        return t.tag === 'servico' && svc.tagValues.indexOf(t.value.toLowerCase()) >= 0;
      });
    });

    var down = [], crit = 0, warn = 0, comAgente = 0, svcMon = 0, svcParados = [], agStale = [];
    meus.forEach(function(h) {
      if (pingPorHost[h.hostid] === false) down.push(h.host);
      if (agentStalePorHost[h.hostid] && pingPorHost[h.hostid] !== false) agStale.push(h.host);
      var sev = sevPorHost[h.hostid] || 0;
      if (sev >= 4) crit++; else if (sev >= 2) warn++;
      var svcs = svcPorHost[h.hostid] || [];
      var relevantes = svc.svcKeys
        ? svcs.filter(function(it) {
            return svc.svcKeys.some(function(k) {
              return it.key_.indexOf('[' + k + ']') >= 0 || it.key_.indexOf('["' + k + '"') >= 0
                  || it.key_.indexOf('[' + k + ',') >= 0;
            });
          })
        : svcs;
      if (relevantes.length) {
        svcMon += relevantes.length;
        relevantes.forEach(function(it) {
          if (it.lastvalue !== '' && it.lastvalue !== '0') {
            svcParados.push(h.host + ': ' + it.key_.replace(/^service\.info[\[]"?/, '').replace(/"?[,\]].*$/, ''));
          }
        });
      }
      // agente: aproximação por existir item agent.ping com valor
      // (a fonte fina lastclock fica para o N3)
    });

    var estado = 'ok';
    if (down.length || crit || svcParados.length) estado = 'crit';
    else if (warn || agStale.length) estado = 'warn';
    if (!meus.length) estado = 'gap';

    return { svc: svc, hosts: meus, down: down, crit: crit, warn: warn,
             svcMon: svcMon, svcParados: svcParados, agStale: agStale, estado: estado };
  });
}

// ── RENDER ────────────────────────────────────────────────────────────────────

function renderCard(r) {
  var svc = r.svc;
  var cor = { ok: '#22C55E', warn: '#d29922', crit: '#f85149', gap: '#64748B' }[r.estado];
  var pillTxt = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', gap: 'Sem cobertura' }[r.estado];

  var sinal;
  if (!r.hosts.length) sinal = 'nenhum host com esta tag';
  else if (r.svcMon > 0) sinal = r.svcMon + ' serviço(s) Windows monitorizados';
  else sinal = 'agente/ping (sem check do serviço em si)';

  var detalhes = '';
  if (r.down.length) detalhes += '<div style="font-size:.78rem;color:#f85149;margin-top:4px;">DOWN: ' + esc(r.down.join(', ')) + '</div>';
  if (r.svcParados.length) detalhes += '<div style="font-size:.78rem;color:#f85149;margin-top:4px;">Serviço parado: ' + esc(r.svcParados.join(' · ')) + '</div>';
  if (r.agStale && r.agStale.length) detalhes += '<div style="font-size:.78rem;color:#d29922;margin-top:4px;">⚠ Agente sem reportar (&gt;2h): ' + esc(r.agStale.join(', ')) + '</div>';
  if (svc.gapNote) detalhes += '<div style="font-size:.75rem;color:#d29922;margin-top:6px;">⚠ ' + esc(svc.gapNote) + '</div>';

  var href = CFG.n3Url + '?var-servico=' + encodeURIComponent(svc.tagLink);
  return '<a href="' + esc(href) + '" style="text-decoration:none;color:inherit;display:block;cursor:pointer;" title="Abrir N3 — ' + esc(svc.label) + '">'
    + '<div class="bpc bpc-card" style="--card-accent:' + cor + ';padding:16px 18px;display:flex;flex-direction:column;">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
    +   '<div>'
    +     '<div style="font-size:1.12rem;font-weight:700;color:#E6EDF3;">' + esc(svc.label) + '</div>'
    +     '<div style="font-size:.80rem;color:rgba(255,255,255,.40);margin-top:3px;">' + esc(svc.sub) + '</div>'
    +   '</div>'
    +   '<span style="font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:10px;background:' + cor + '22;color:' + cor + ';border:1px solid ' + cor + '55;white-space:nowrap;">' + pillTxt + '</span>'
    + '</div>'
    + '<div style="display:flex;gap:22px;margin-top:12px;align-items:baseline;">'
    +   '<span style="font-size:1.6rem;font-weight:700;color:#E6EDF3;">' + r.hosts.length + '<span style="font-size:.68rem;font-weight:600;color:rgba(255,255,255,.4);margin-left:4px;">HOSTS</span></span>'
    +   '<span style="font-size:1.6rem;font-weight:700;color:' + (r.crit ? '#f85149' : 'rgba(255,255,255,.25)') + ';">' + r.crit + '<span style="font-size:.68rem;font-weight:600;margin-left:4px;">CRÍT</span></span>'
    +   '<span style="font-size:1.6rem;font-weight:700;color:' + (r.warn ? '#d29922' : 'rgba(255,255,255,.25)') + ';">' + r.warn + '<span style="font-size:.68rem;font-weight:600;margin-left:4px;">AVISO</span></span>'
    + '</div>'
    + '<div style="font-size:.75rem;color:rgba(255,255,255,.35);margin-top:10px;">Sinal: ' + esc(sinal) + '</div>'
    + detalhes
    + '</div></a>';
}

function renderGrid(results) {
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;padding:2px 0;">'
    + results.map(renderCard).join('')
    + '</div>';
}

function loadAndRender(rpc, root) {
  fetchTudo(rpc).then(function(res) {
    var results = montar(res[0], res[1], res[2], res[3]);
    root.innerHTML = renderGrid(results);
  }).catch(function(err) {
    console.error('[BPC] sup-cards: falha', err);
    root.innerHTML = '<div class="bpc-error-msg">Falha a carregar (' + esc(err.message) + ')</div>';
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    root.innerHTML = '<div class="bpc-skeleton" style="height:260px;"></div>';
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
    console.error('[BPC] sup-cards: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
