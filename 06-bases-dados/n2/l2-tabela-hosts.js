// ══════════════════════════════════════════════════════════════════════════
//  N2 · BASES DE DADOS — Tabela por host
//
//  v2 (2026-07-12) — modelo de "fonte de dados" (tier), sem mudar de padrão
//  (continua BPC Runtime / window.BPC.rpc — já faz host.get sem problema
//  neste dashboard, ver 03-servidores-virtuais/CLAUDE.md §3.1 para o porquê
//  de N3 ser diferente).
//
//  Verifica sempre o item ODBC PRIMEIRO; só cai para perfmon/serviço se o
//  ODBC falhar ou não existir. No dia em que a credencial zbx_monitor for
//  criada num host, este painel troca sozinho para "ODBC completo" — zero
//  alterações de código (mecanismo documentado no plano da sessão).
//
//  4 tiers:
//   odbc       — db.odbc.select[mssql.business.master,...] com dados válidos
//   perfmon    — sem ODBC, mas com os 6 items "MSSQL ..." (perf_counter_en)
//                criados em 2026-07-12 nos hosts de instância nomeada
//   servico    — só service.info/proc.num (ex. Oracle parado, pilotos)
//   sem_sinal  — nada disto existe
// ══════════════════════════════════════════════════════════════════════════

(function () {

  const CFG = {
    elementId: 'bpc-tabela-bases-de-dados',
    hostTag: 'camada',
    hostTagValue: 'base de dados',
    odbcKeyPrefix: 'db.odbc.select[mssql.business.master',
    refresh: 60000,
    staleThresholdSec: 300,

    // Drill "Ver Detalhe" → N3 · Bases de Dados
    grafanaUrl: 'http://10.10.126.22:3000',
    n3DashUid: 'bd-n3',
    n3DashSlug: 'n3-bases-de-dados-instancia',
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function drillUrl(hostName) {
    if (!CFG.n3DashUid) return '#';
    return CFG.grafanaUrl + '/d/' + CFG.n3DashUid + '/' + CFG.n3DashSlug
      + '?var-hostid=' + encodeURIComponent(hostName);
  }

  // ── Classificação por tier ─────────────────────────────────────
  function classifyOdbc(it) {
    if (!it) return null;
    if (it.error) return { ok: false, obs: it.error };
    const lastclock = parseInt(it.lastclock) || 0;
    if (!lastclock) return { ok: false, obs: 'Item configurado mas nunca recebeu valor' };
    let d;
    try {
      const raw = (it.lastvalue || '').trim();
      if (!raw.endsWith('}') && !raw.endsWith(']')) throw new Error('JSON truncado');
      d = JSON.parse(raw);
    } catch (e) {
      return { ok: false, obs: 'Resposta inválida: ' + e.message };
    }
    return { ok: true, data: d, lastclock };
  }

  function findByName(items, name) {
    const it = items.find(i => i.name === name);
    return it && it.error == null && it.lastvalue !== '' ? it : null;
  }

  function num(it) { return it ? parseFloat(it.lastvalue) : null; }

  async function getData(rpc) {
    const hosts = await rpc('host.get', {
      output: ['hostid', 'host', 'name'],
      tags: [{ tag: CFG.hostTag, value: CFG.hostTagValue, operator: '0' }],
      filter: { status: 0 },
    });
    if (!hosts.length) return [];

    const hostIds = hosts.map(h => h.hostid);

    const [odbcItems, otherItems] = await Promise.all([
      rpc('item.get', {
        hostids: hostIds,
        search: { key_: CFG.odbcKeyPrefix },
        filter: { status: 0 },
        output: ['hostid', 'lastvalue', 'lastclock', 'error'],
      }),
      // Cobre os 6 items perfmon ("MSSQL Page life expectancy", etc.) — pesquisa por
      // NOME em vez de key_ (a key_ real tem "$"/aspas/barras que precisariam de
      // escaping exacto; o nome é uma string simples e sem ambiguidade com os
      // items "MSSQL: ..." do template ODBC, que usam dois-pontos, não espaço)
      rpc('item.get', {
        hostids: hostIds,
        output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'error'],
        filter: { status: 0 },
        search: { name: 'MSSQL ' },
      }),
    ]);

    const otherByHost = {};
    otherItems.forEach(it => { (otherByHost[it.hostid] = otherByHost[it.hostid] || []).push(it); });
    const odbcByHost = {};
    odbcItems.forEach(it => { odbcByHost[it.hostid] = it; });

    // service.info / proc.num — pedido à parte porque não seguem o prefixo perfmon
    const svcItems = await rpc('item.get', {
      hostids: hostIds,
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'error'],
      filter: { status: 0 },
      search: { key_: 'service.info[' },
      searchWildcardsEnabled: true,
    });
    const procItems = await rpc('item.get', {
      hostids: hostIds,
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'error'],
      filter: { status: 0 },
      search: { key_: 'proc.num[' },
      searchWildcardsEnabled: true,
    });
    const svcByHost = {};
    svcItems.concat(procItems).forEach(it => { (svcByHost[it.hostid] = svcByHost[it.hostid] || []).push(it); });

    const now = Math.floor(Date.now() / 1000);

    return hosts.map(h => {
      const odbc = classifyOdbc(odbcByHost[h.hostid]);

      if (odbc && odbc.ok) {
        const stale = (now - odbc.lastclock) > CFG.staleThresholdSec;
        const d = odbc.data;
        const estado = stale ? 'warn' : (d.db_suspect > 0 ? 'crit' : 'ok');
        return {
          host: h.name, tier: 'odbc', estado, lastclock: odbc.lastclock,
          ple: d.ple, connections: d.user_connections, blocked: d.blocked_processes,
          deadlocks: d.deadlocks_per_sec, failedJobs: d.failed_jobs_today, backups: d.backups_24h,
          obs: stale ? 'Dados desactualizados (> ' + Math.round(CFG.staleThresholdSec / 60) + ' min)' : null,
        };
      }

      const perf = otherByHost[h.hostid] || [];
      const pPle = findByName(perf, 'MSSQL Page life expectancy');
      const pConn = findByName(perf, 'MSSQL User Connections');
      const pDead = findByName(perf, 'MSSQL Number of Deadlocks/sec');
      const pSvc = svcByHost[h.hostid] && svcByHost[h.hostid].find(i => i.name.indexOf('MSSQL Service state') === 0);

      if (pPle || pConn || pDead) {
        const lastclock = Math.max(...[pPle, pConn, pDead].filter(Boolean).map(i => parseInt(i.lastclock) || 0));
        const stale = lastclock ? (now - lastclock) > CFG.staleThresholdSec : true;
        const svcRunning = pSvc ? num(pSvc) === 0 : null;
        return {
          host: h.name, tier: 'perfmon', estado: stale ? 'warn' : (svcRunning === false ? 'crit' : 'ok'),
          lastclock: lastclock || null,
          ple: num(pPle), connections: num(pConn), blocked: null, deadlocks: num(pDead),
          failedJobs: null, backups: null,
          obs: 'Sem credencial SQL — métricas via contador de desempenho do Windows'
            + (svcRunning === false ? ' · serviço da instância PARADO' : ''),
        };
      }

      const svc = svcByHost[h.hostid] || [];
      if (svc.length) {
        const states = svc.map(i => ({ name: i.name, running: num(i) === 0, lastclock: parseInt(i.lastclock) || 0 }));
        const anyDown = states.some(s => !s.running);
        const lastclock = Math.max(...states.map(s => s.lastclock).filter(Boolean)) || null;
        const summary = states.map(s => s.name.replace(/^.*\(([^)]+)\).*$/, '$1') + ':' + (s.running ? 'ok' : 'parado')).join(', ');
        return {
          host: h.name, tier: 'servico', estado: anyDown ? 'crit' : 'warn', lastclock,
          ple: null, connections: null, blocked: null, deadlocks: null, failedJobs: null, backups: null,
          obs: 'Sem motor confirmado por credencial — só presença de serviço/processo (' + summary + ')',
        };
      }

      // Item ODBC existe mas falhou (credencial errada, porta fechada, etc.) — o erro em
      // si já é sinal valioso (ex.: "Login failed" prova que o motor responde), preservar
      // em vez de mostrar só a mensagem genérica de "sem sinal nenhum"
      if (odbc && !odbc.ok) {
        return {
          host: h.name, tier: 'sem_sinal', estado: 'crit', lastclock: null,
          ple: null, connections: null, blocked: null, deadlocks: null, failedJobs: null, backups: null,
          obs: odbc.obs,
        };
      }

      return {
        host: h.name, tier: 'sem_sinal', estado: 'crit', lastclock: null,
        ple: null, connections: null, blocked: null, deadlocks: null, failedJobs: null, backups: null,
        obs: 'Sem sinal nenhum — confirmar agente/WinRM ou pedir credencial zbx_monitor à infra',
      };
    });
  }

  function pill(estado) {
    const map = { ok: ['#3fb950', 'Normal'], warn: ['#d29922', 'Atenção'], crit: ['#f85149', 'Crítico'] };
    const [col, lbl] = map[estado] || map.crit;
    return '<span style="background:' + col + '22;color:' + col + ';font-size:.72rem;font-weight:700;'
      + 'padding:2px 9px;border-radius:999px;white-space:nowrap">' + lbl + '</span>';
  }

  function fontePill(tier) {
    const map = {
      odbc: ['#3fb950', 'ODBC completo'],
      perfmon: ['#58a6ff', 'Perfmon local'],
      servico: ['#d29922', 'Serviço'],
      sem_sinal: ['#8b949e', 'Sem sinal'],
    };
    const [col, lbl] = map[tier] || map.sem_sinal;
    return '<span style="background:' + col + '22;color:' + col + ';font-size:.68rem;font-weight:600;'
      + 'padding:2px 8px;border-radius:999px;white-space:nowrap">' + lbl + '</span>';
  }

  function render(el, rows) {
    const u = window.BPC.utils;
    if (!rows.length) {
      el.innerHTML = u.buildError('Bases de Dados — Hosts', 'Sem hosts com tag camada=base de dados', '#F59E0B');
      return;
    }

    const thStyle = 'text-align:left;padding:7px 10px;font-size:.68rem;text-transform:uppercase;letter-spacing:.03em;'
      + 'color:#8B949E;border-bottom:1px solid rgba(255,255,255,0.12)';
    const tdStyle = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:.80rem;color:#C9D1D9';

    const head = '<thead><tr>'
      + ['Host', 'Fonte', 'Estado', 'PLE', 'Utilizadores', 'Bloqueados', 'Deadlocks', 'Jobs falhados', 'Backups 24h', 'Actualizado', 'Observação', '']
        .map(h => '<th style="' + thStyle + '">' + h + '</th>').join('')
      + '</tr></thead>';

    const body = rows.map(r => {
      return '<tr>'
        + '<td style="' + tdStyle + ';font-family:monospace;font-weight:600;color:#E6EDF3">' + esc(r.host) + '</td>'
        + '<td style="' + tdStyle + '">' + fontePill(r.tier) + '</td>'
        + '<td style="' + tdStyle + '">' + pill(r.estado) + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.ple != null ? r.ple + ' s' : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.connections ?? '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.blocked ?? '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.deadlocks ?? '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.failedJobs ?? '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.backups ?? '—') + '</td>'
        + '<td style="' + tdStyle + '">' + (r.lastclock ? u.fmtTime(r.lastclock) : '—') + '</td>'
        + '<td style="' + tdStyle + ';font-size:.72rem;color:#8B949E;max-width:280px">' + (r.obs ? esc(r.obs) : '—') + '</td>'
        + '<td style="' + tdStyle + '"><a href="' + drillUrl(r.host) + '" style="color:#58a6ff;text-decoration:none;font-size:.72rem;white-space:nowrap">Ver detalhe →</a></td>'
        + '</tr>';
    }).join('');

    el.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">' + head + '<tbody>' + body + '</tbody></table></div>';
  }

  function start(rpc) {
    const u = window.BPC.utils;
    u.waitForElement(CFG.elementId, function (el) {
      el.innerHTML = u.buildSkeleton('#F59E0B');

      function load() {
        return getData(rpc)
          .then(rows => render(el, rows))
          .catch(e => { el.innerHTML = u.buildError('Bases de Dados — Hosts', e.message, '#F59E0B'); });
      }

      load();
      u.startRefresh(el, () => {
        getData(rpc).then(rows => render(el, rows)).catch(e => console.error('[BPC][Tabela-BD] refresh:', e));
      }, CFG.refresh);
    });
  }

  function initWithRetry(attempt) {
    attempt = attempt || 0;
    if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return; }
    if (attempt > 50) { console.error('[BPC] l2-tabela-hosts: window.waitForBPC nunca ficou disponivel'); return; }
    setTimeout(function () { initWithRetry(attempt + 1); }, 100);
  }

  initWithRetry();

})();
