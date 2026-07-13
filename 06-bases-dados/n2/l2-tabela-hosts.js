// ══════════════════════════════════════════════════════════════════════════
//  N2 · BASES DE DADOS — Tabela por host (v4, redesenho 2026-07-12)
//
//  Mockup e design em 06-bases-dados/DESIGN-N2-N3-20260712.md.
//  Classifica cada host num de 4 tiers de fonte de dados (CLAUDE.md §2) e
//  ordena por severidade — "o que precisa de atenção primeiro".
//
//  v4 (foco Produção, pedido do utilizador):
//   · SÓ hosts com ambiente≈Produção (casing inconsistente na tag: filtro
//     case-insensitive startsWith("produ") — apanha Produção/Producao/…)
//   · Coluna MOTOR derivada dos serviços descobertos (MSSQL/Oracle) — o
//     Windows template descobre service.info["MSSQLSERVER",state] sozinho
//   · Colunas BASES e TAMANHO (ODBC db_online/total_mb ou soma WMI)
//   · CORRIGE bug v3: serviços auxiliares parados (SQLBrowser, OLAP,
//     RMAN de backup, FDLauncher) já não marcam o host como "motor parado".
//     Só o serviço PRIMÁRIO do motor conta para a saúde.
//
//  Verifica sempre o item ODBC PRIMEIRO; só cai para perfmon/serviço se o
//  ODBC falhar. Quando a credencial zbx_monitor for criada num host, este
//  painel troca sozinho para "ODBC completo" — zero alterações de código.
// ══════════════════════════════════════════════════════════════════════════

(function () {

  const CFG = {
    elementId: 'bpc-tabela-bases-de-dados',
    hostTag: 'camada',
    hostTagValue: 'base de dados',
    ambientePrefix: 'produ',       // filtro produção, case-insensitive
    odbcKeyPrefix: 'db.odbc.select[mssql.business.master',
    refresh: 60000,
    staleThresholdSec: 300,
    logUsadoAlertPct: 90,

    // Drill "Ver Detalhe" → N3 · Bases de Dados
    grafanaUrl: 'http://10.10.126.22:3000',
    n3DashUid: 'bd-n3',
    n3DashSlug: 'n3-bases-de-dados-instancia',
  };

  // Prioridade de ordenação: crit primeiro, depois warn, ok, N/D
  const SEVERITY_ORDER = { crit: 0, warn: 1, ok: 2, nd: 3 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(it) { return it ? parseFloat(it.lastvalue) : null; }

  function drillUrl(hostName) {
    if (!CFG.n3DashUid) return '#';
    return CFG.grafanaUrl + '/d/' + CFG.n3DashUid + '/' + CFG.n3DashSlug
      + '?var-hostid=' + encodeURIComponent(hostName);
  }

  function tagValue(tags, key) {
    const t = (tags || []).find(t => t.tag === key);
    return t ? t.value : '';
  }

  // ── Serviços: nome primário vs auxiliar (correcção do bug v3) ──
  // service.info["MSSQLSERVER",state]  (Windows discovery, com aspas)
  // service.info[OracleServiceSICO,state] (item directo, sem aspas)
  // service.info[MSSQL${$MSSQL.INSTANCE.NAME},state] (perfmon template, macro)
  function svcName(key) {
    const m = (key || '').match(/service\.info\[\s*"?([^",\]]+)"?/);
    return m ? m[1] : (key || '');
  }
  // Serviço PRIMÁRIO do motor (o que interessa para saúde up/down)
  function isPrimaryEngineSvc(name) {
    if (/RMAN|Backup/i.test(name)) return false;          // backup, não é o motor
    if (/^OracleService/i.test(name)) return true;
    if (/^MSSQLSERVER$/i.test(name)) return true;         // instância default
    if (/^MSSQL\$/i.test(name)) return true;              // instância nomeada
    return false;
  }
  // Auxiliares: existência é contexto, estado parado NÃO é crítico de motor
  function isAuxSvc(name) {
    return /FDLauncher|Launchpad|OLAPService|SQLBrowser|SQLSERVERAGENT|SQLAgent|RMAN|Reporting|IntegrationServices/i.test(name);
  }
  // proc.num só conta como sinal de motor se o key nomear um processo de BD.
  // O template Windows tem proc.num[] SEM argumentos (total de processos,
  // sempre >0) — sem este filtro, qualquer host Windows viraria tier "servico"
  // (falso positivo encontrado no teste ao vivo de 2026-07-13).
  function isDbProcItem(it) {
    return /proc\.num\[[^\]]*(sqlservr|oracle|sqlbrowser|mysqld|postgres)/i.test(it.key_ || '')
      || /^Processo .+ activo$/.test(it.name || '');
  }
  function motorFromSvcNames(names, hasOdbc) {
    if (names.some(n => /oracle/i.test(n))) return 'Oracle';
    if (names.some(n => /mssql|sqlserver/i.test(n))) return 'MSSQL';
    if (hasOdbc) return 'MSSQL';   // tem o template BPC MSSQL by ODBC
    return '?';
  }

  function fmtSize(mb) {
    if (mb == null || isNaN(mb)) return '—';
    if (mb >= 1024 * 1024) return (mb / 1024 / 1024).toFixed(1) + ' TB';
    if (mb >= 1024) return (mb / 1024).toFixed(0) + ' GB';
    return Math.round(mb) + ' MB';
  }

  // Estatística de bases via WMI (hosts perfmon sem credencial)
  function wmiDbStats(perf) {
    const data = perf.filter(i => /^MSSQL DB .+: Tamanho dados/.test(i.name));
    const log = perf.filter(i => /^MSSQL DB .+: Tamanho log/.test(i.name));
    let kb = 0;
    data.concat(log).forEach(i => { kb += num(i) || 0; });
    const maxLog = Math.max(0, ...perf.filter(i => /Percent log usado$/.test(i.name)).map(num));
    return { nBases: data.length, mb: data.length ? kb / 1024 : null, maxLog };
  }

  // ── Classificação ODBC ─────────────────────────────────────────
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

  async function getData(rpc) {
    const allHosts = await rpc('host.get', {
      output: ['hostid', 'host', 'name'],
      tags: [{ tag: CFG.hostTag, value: CFG.hostTagValue, operator: '0' }],
      filter: { status: 0 },
      selectTags: 'extend',
    });
    // Filtro Produção (case-insensitive — a tag ambiente tem casing inconsistente)
    const hosts = allHosts.filter(h => {
      const amb = (tagValue(h.tags, 'ambiente') || '').toLowerCase();
      return amb.indexOf(CFG.ambientePrefix) === 0;
    });
    if (!hosts.length) return [];

    const hostIds = hosts.map(h => h.hostid);

    const [odbcItems, perfItems, svcItems, procItems] = await Promise.all([
      rpc('item.get', { hostids: hostIds, search: { key_: CFG.odbcKeyPrefix }, filter: { status: 0 }, output: ['hostid', 'lastvalue', 'lastclock', 'error'] }),
      rpc('item.get', { hostids: hostIds, search: { name: 'MSSQL ' }, filter: { status: 0 }, output: ['hostid', 'name', 'lastvalue', 'lastclock', 'error'] }),
      // Nunca pesquisar key_ com "[" + searchWildcardsEnabled:true (ver CLAUDE.md §2)
      rpc('item.get', { hostids: hostIds, search: { key_: 'service.info' }, filter: { status: 0 }, output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'error'] }),
      rpc('item.get', { hostids: hostIds, search: { key_: 'proc.num' }, filter: { status: 0 }, output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock', 'error'] }),
    ]);

    const odbcByHost = {};
    odbcItems.forEach(it => { odbcByHost[it.hostid] = it; });
    const perfByHost = {};
    perfItems.forEach(it => { (perfByHost[it.hostid] = perfByHost[it.hostid] || []).push(it); });
    const svcByHost = {};
    svcItems.forEach(it => { (svcByHost[it.hostid] = svcByHost[it.hostid] || []).push(it); });
    const procByHost = {};
    procItems.forEach(it => { (procByHost[it.hostid] = procByHost[it.hostid] || []).push(it); });

    const now = Math.floor(Date.now() / 1000);

    // Estado do serviço primário do motor (tier perfmon sem "MSSQL Service state")
    function primaryEngineRunning(svcAll2) {
      const prim = svcAll2.filter(i => isPrimaryEngineSvc(svcName(i.key_)));
      if (!prim.length) return null;
      return prim.every(i => num(i) === 0);
    }

    const rows = hosts.map(h => {
      const sistema = tagValue(h.tags, 'servico') || '—';
      const departamento = tagValue(h.tags, 'departamento') || '—';
      const sistemaDept = sistema + (departamento !== '—' ? ' / ' + departamento : '');

      // Serviços descobertos (para coluna Motor + estado, em qualquer tier)
      const svcAll = svcByHost[h.hostid] || [];
      const svcNames = svcAll.map(i => svcName(i.key_));
      const hasOdbcItem = !!odbcByHost[h.hostid];
      const motor = motorFromSvcNames(svcNames, hasOdbcItem);

      const odbc = classifyOdbc(odbcByHost[h.hostid]);

      // ── TIER 1: ODBC completo ──
      if (odbc && odbc.ok) {
        const stale = (now - odbc.lastclock) > CFG.staleThresholdSec;
        const d = odbc.data;
        const nBases = d.db_online != null ? d.db_online : (Array.isArray(d.databases) ? d.databases.length : null);
        const mb = (d.total_data_mb || 0) + (d.total_log_mb || 0);
        const estado = stale ? 'warn' : (d.db_suspect > 0 ? 'crit' : 'ok');
        const extras = [];
        if (d.failed_jobs_today > 0) extras.push(d.failed_jobs_today + ' jobs falhados');
        if (d.backups_24h === 0) extras.push('sem backup 24h');
        return {
          host: h.name, hostShort: h.host, sistemaDept, motor: motor === '?' ? 'MSSQL' : motor,
          tier: 'odbc', estado, lastclock: odbc.lastclock,
          nBases, tamanho: fmtSize(mb),
          detalhe: 'PLE ' + (d.ple != null ? d.ple + 's' : '—') + ' · ' + (d.user_connections || 0) + ' lig'
            + (extras.length ? ' · ' + extras.join(' · ') : ''),
          obs: stale ? 'Dados desactualizados (> ' + Math.round(CFG.staleThresholdSec / 60) + ' min)'
            : (d.db_suspect > 0 ? d.db_suspect + ' base(s) suspect' : null),
        };
      }

      // ── TIER 2: Perfmon + WMI local ──
      const perf = perfByHost[h.hostid] || [];
      const pPle = findByName(perf, 'MSSQL Page life expectancy');
      const pConn = findByName(perf, 'MSSQL User Connections');
      const pDead = findByName(perf, 'MSSQL Number of Deadlocks/sec');
      const wmi = wmiDbStats(perf);

      if (pPle || pConn || pDead || wmi.nBases) {
        const clocks = [pPle, pConn, pDead].filter(Boolean).map(i => parseInt(i.lastclock) || 0);
        const lastclock = clocks.length ? Math.max(...clocks) : null;
        const stale = lastclock ? (now - lastclock) > CFG.staleThresholdSec : false;
        // Estado do serviço primário da instância (nome "MSSQL Service state" do template perfmon)
        const pSvc = svcAll.find(i => i.name && i.name.indexOf('MSSQL Service state') === 0);
        const svcRunning = pSvc ? num(pSvc) === 0 : primaryEngineRunning(svcAll);
        const logNote = wmi.maxLog >= CFG.logUsadoAlertPct ? ' · ⚠ ' + wmi.maxLog + '% log' : '';
        return {
          host: h.name, hostShort: h.host, sistemaDept, motor: motor === '?' ? 'MSSQL' : motor,
          tier: 'perfmon',
          estado: svcRunning === false ? 'crit' : (stale ? 'warn' : (wmi.maxLog >= CFG.logUsadoAlertPct ? 'warn' : 'ok')),
          lastclock,
          nBases: wmi.nBases || null,
          tamanho: fmtSize(wmi.mb),
          detalhe: (pConn ? num(pConn) + ' lig' : (wmi.nBases + ' bases')) + logNote,
          obs: svcRunning === false ? 'Serviço da instância PARADO'
            : 'Sem credencial SQL — via contador de desempenho local',
        };
      }

      // ── TIER 3: Serviço (Windows discovery) ──
      // Só o serviço PRIMÁRIO conta para saúde (corrige bug v3)
      const primary = svcAll.filter(i => isPrimaryEngineSvc(svcName(i.key_)));
      if (primary.length) {
        const states = primary.map(i => ({ name: svcName(i.key_), running: num(i) === 0, lastclock: parseInt(i.lastclock) || 0 }));
        const anyDown = states.some(s => !s.running);
        const lastclock = Math.max(...states.map(s => s.lastclock).filter(Boolean)) || null;
        const summary = states.map(s => s.name + (s.running ? '' : ' PARADO')).join(', ');
        // Auxiliares parados são só nota informativa, nunca crítico
        const auxDown = svcAll.filter(i => isAuxSvc(svcName(i.key_)) && num(i) !== 0)
          .map(i => svcName(i.key_));
        return {
          host: h.name, hostShort: h.host, sistemaDept, motor,
          tier: 'servico', estado: anyDown ? 'crit' : 'ok', lastclock,
          nBases: null, tamanho: '—',
          detalhe: summary,
          obs: anyDown ? 'Motor instalado mas serviço PARADO'
            : (auxDown.length ? 'Motor a correr (auxiliar parado: ' + auxDown.join(', ') + ')'
              : 'Motor a correr — sem credencial para métricas SQL'),
        };
      }

      // ── proc.num (piloto) — só processos de BD nomeados, ver isDbProcItem ──
      const procAll = (procByHost[h.hostid] || []).filter(isDbProcItem);
      const procFound = procAll.filter(i => (num(i) || 0) > 0);
      if (procFound.length) {
        const lastclock = Math.max(...procFound.map(i => parseInt(i.lastclock) || 0)) || null;
        const nomes = procFound.map(i => i.name.replace(/^Processo /, '').replace(/ activo$/, '')).join(', ');
        return {
          host: h.name, hostShort: h.host, sistemaDept, motor, tier: 'servico', estado: 'warn', lastclock,
          nBases: null, tamanho: '—',
          detalhe: nomes,
          obs: 'Piloto proc.num — processo detectado, sem estado do serviço',
        };
      }

      // ── ODBC existe mas falhou: o erro é sinal (motivo de não haver dados) ──
      if (odbc && !odbc.ok) {
        const isCred = /login failed|28000|18456/i.test(odbc.obs || '');
        const isTimeout = /HYT00|timeout/i.test(odbc.obs || '');
        return {
          host: h.name, hostShort: h.host, sistemaDept, motor: motor === '?' ? 'MSSQL' : motor,
          tier: 'nd', estado: 'crit', lastclock: null,
          nBases: null, tamanho: '—',
          detalhe: isCred ? 'Falta credencial zbx_monitor'
            : (isTimeout ? 'Instância nomeada / porta dinâmica' : 'Erro de ligação'),
          obs: (odbc.obs || '').slice(0, 90),
        };
      }

      // ── Sem sinal nenhum ──
      return {
        host: h.name, hostShort: h.host, sistemaDept, motor, tier: 'nd', estado: 'nd', lastclock: null,
        nBases: null, tamanho: '—',
        detalhe: 'Sem sinal',
        obs: 'Confirmar agente/WinRM ou pedir credencial zbx_monitor à infra',
      };
    });

    rows.sort((a, b) => (SEVERITY_ORDER[a.estado] ?? 9) - (SEVERITY_ORDER[b.estado] ?? 9));
    return rows;
  }

  const TIER_LABEL = {
    odbc: ['#3fb950', '● ODBC completo'],
    perfmon: ['#58a6ff', '◐ Perfmon local'],
    servico: ['#d29922', '◑ Serviço'],
    nd: ['#8b949e', '○ Sem sinal'],
  };

  function pill(estado) {
    const map = { ok: ['#3fb950', 'Normal'], warn: ['#d29922', 'Atenção'], crit: ['#f85149', 'Crítico'], nd: ['#8b949e', 'N/D'] };
    const [col, lbl] = map[estado] || map.crit;
    return '<span style="background:' + col + '22;color:' + col + ';font-size:.72rem;font-weight:700;'
      + 'padding:2px 9px;border-radius:999px;white-space:nowrap">' + lbl + '</span>';
  }

  function fontePill(tier) {
    const [col, lbl] = TIER_LABEL[tier] || TIER_LABEL.nd;
    return '<span style="background:' + col + '22;color:' + col + ';font-size:.68rem;font-weight:600;'
      + 'padding:2px 8px;border-radius:999px;white-space:nowrap">' + lbl + '</span>';
  }

  function motorBadge(motor) {
    if (!motor || motor === '?') return '<span style="color:#6e7681">—</span>';
    const col = /oracle/i.test(motor) ? '#f0883e' : '#a371f7';
    return '<span style="color:' + col + ';font-weight:600">' + esc(motor) + '</span>';
  }

  function render(el, rows) {
    const u = window.BPC.utils;
    if (!rows.length) {
      el.innerHTML = u.buildError('Bases de Dados — Hosts', 'Sem hosts de Produção com tag camada=base de dados', '#F59E0B');
      return;
    }

    const thStyle = 'text-align:left;padding:7px 10px;font-size:.68rem;text-transform:uppercase;letter-spacing:.03em;'
      + 'color:#8B949E;border-bottom:1px solid rgba(255,255,255,0.12)';
    const tdStyle = 'padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:.80rem;color:#C9D1D9';

    const head = '<thead><tr>'
      + ['Estado', 'Host', 'Sistema / Dept', 'Motor', 'Bases', 'Tamanho', 'Fonte', 'Detalhe', 'Observação', '']
        .map(h => '<th style="' + thStyle + '">' + h + '</th>').join('')
      + '</tr></thead>';

    const body = rows.map(r => {
      return '<tr>'
        + '<td style="' + tdStyle + '">' + pill(r.estado) + '</td>'
        + '<td style="' + tdStyle + ';font-family:monospace;font-weight:600;color:#E6EDF3">' + esc(r.hostShort || r.host) + '</td>'
        + '<td style="' + tdStyle + '">' + esc(r.sistemaDept) + '</td>'
        + '<td style="' + tdStyle + '">' + motorBadge(r.motor) + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (r.nBases != null ? r.nBases : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right;white-space:nowrap">' + esc(r.tamanho) + '</td>'
        + '<td style="' + tdStyle + '">' + fontePill(r.tier) + '</td>'
        + '<td style="' + tdStyle + '">' + esc(r.detalhe) + '</td>'
        + '<td style="' + tdStyle + ';font-size:.72rem;color:#8B949E;max-width:230px">' + (r.obs ? esc(r.obs) : '—') + '</td>'
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
