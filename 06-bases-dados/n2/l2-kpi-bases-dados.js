// ══════════════════════════════════════════════════════════════════════════
//  N2 · BASES DE DADOS — KPI agregado (todos os hosts com tag BD)
//
//  Migrado do dashboard arquivado "D03 - Bases de dados - Nivel 2" (adcxx9v,
//  99·Arquivo, ultima alteracao 2026-06-19), portado do header v4 para o
//  utils.js canonico v9 deste dashboard (so a API publica window.BPC.*
//  mudou de nome num sitio: fmtTs -> fmtTime; resto da logica igual, ja
//  usava window.BPC.rpc/waitForBPC/utils.* correctamente).
//
//  Agrega os items db.odbc.select[mssql.business.master,...] (JSON) de
//  TODOS os hosts com a tag camada=base de dados no grupo 355. Auditoria ao
//  vivo 2026-07-12: 4 hosts com a tag, só 1 (VS6000005) tem dados reais -
//  os outros 3 falham por motivos diferentes (ver l2-tabela-hosts.js, que
//  mostra o detalhe por host e o motivo exacto da falha).
// ══════════════════════════════════════════════════════════════════════════

(function () {

  // ── CONFIGURAÇÃO ───────────────────────────────────────────────
  const CFG = {
    elementId: 'bpc-kpi-bases-de-dados',
    hostTag: 'camada',
    hostTagValue: 'base de dados',
    itemKeyPrefix: 'db.odbc.select[mssql.business.master',
    refresh: 60000,
    layout: 'auto',
  };

  // ── THRESHOLDS ─────────────────────────────────────────────────
  const THR = {
    ple: { warn: 300, crit: 100 },
    connections: { warn: 100, crit: 200 },
    blocked: { warn: 1, crit: 5 },
    deadlocks: { warn: 50, crit: 200 },
    suspect: { warn: 1, crit: 1 },
    failedJobs: { warn: 1, crit: 5 },
  };

  // ── COBERTURA DE MONITORIZAÇÃO (tier) ──────────────────────────
  // Mesma classificação de 4 níveis do l2-tabela-hosts.js, aqui só para contagem
  // (não precisa dos valores por host, só de saber quantos hosts em cada tier).
  async function getCoverage(rpc, hostIds) {
    const [odbcItems, perfItems, svcItems, procItems] = await Promise.all([
      rpc('item.get', { hostids: hostIds, search: { key_: CFG.itemKeyPrefix }, filter: { status: 0 }, output: ['hostid', 'lastvalue', 'lastclock', 'error'] }),
      rpc('item.get', { hostids: hostIds, search: { name: 'MSSQL ' }, filter: { status: 0 }, output: ['hostid', 'name', 'lastvalue', 'error'] }),
      rpc('item.get', { hostids: hostIds, search: { key_: 'service.info[' }, searchWildcardsEnabled: true, filter: { status: 0 }, output: ['hostid'] }),
      rpc('item.get', { hostids: hostIds, search: { key_: 'proc.num[' }, searchWildcardsEnabled: true, filter: { status: 0 }, output: ['hostid'] }),
    ]);

    const odbcByHost = {};
    odbcItems.forEach(it => { odbcByHost[it.hostid] = it; });
    const perfHostIds = new Set(perfItems.filter(it => !it.error && it.lastvalue !== '').map(it => it.hostid));
    const svcHostIds = new Set(svcItems.concat(procItems).map(it => it.hostid));

    let odbc = 0, perfmon = 0, servico = 0, semSinal = 0;
    hostIds.forEach(hid => {
      const it = odbcByHost[hid];
      let odbcOk = false;
      if (it && !it.error && it.lastvalue) {
        const raw = it.lastvalue.trim();
        odbcOk = raw.endsWith('}') || raw.endsWith(']');
      }
      if (odbcOk) odbc++;
      else if (perfHostIds.has(hid)) perfmon++;
      else if (svcHostIds.has(hid)) servico++;
      else semSinal++;
    });

    return { odbc, perfmon, servico, semSinal, total: hostIds.length };
  }

  // ── FETCH & AGREGAÇÃO ──────────────────────────────────────────
  async function getData(rpc) {
    const hosts = await rpc('host.get', {
      output: ['hostid', 'name'],
      tags: [{ tag: CFG.hostTag, value: CFG.hostTagValue, operator: '0' }],
      filter: { status: 0 },
      selectTags: 'extend',
    });

    if (!hosts.length) {
      return _empty('Sem hosts com tag "' + CFG.hostTag + ' = ' + CFG.hostTagValue + '"');
    }

    const hostIds = hosts.map(h => h.hostid);
    const coverage = await getCoverage(rpc, hostIds);

    const items = await rpc('item.get', {
      hostids: hostIds,
      search: { key_: CFG.itemKeyPrefix },
      filter: { status: 0 },
      output: ['hostid', 'lastvalue', 'lastclock'],
    });

    if (!items.length) {
      const empty = _empty('Item JSON não encontrado nos hosts');
      empty.coverage = coverage;
      return empty;
    }

    const agg = {
      dbOnline: 0, dbSuspect: 0, ple: [], userConns: 0, activeRequests: 0,
      blocked: 0, failedJobs: 0, backups24h: 0, deadlocks: 0,
      totalDataMb: 0, totalLogMb: 0, hostsOk: 0, hostsError: 0, lastClock: 0,
    };

    items.forEach(item => {
      let d;
      try {
        const raw = (item.lastvalue || '').trim();
        if (!raw.endsWith('}') && !raw.endsWith(']')) throw new Error('JSON truncado ou vazio (item sem dados)');
        d = JSON.parse(raw);
      } catch (e) {
        console.warn('[BPC][KPI-BD] JSON inválido no host ' + item.hostid + ':', e.message);
        agg.hostsError++;
        return;
      }
      agg.dbOnline += d.db_online ?? 0;
      agg.dbSuspect += d.db_suspect ?? 0;
      agg.userConns += d.user_connections ?? 0;
      agg.activeRequests += d.active_requests ?? 0;
      agg.blocked += d.blocked_processes ?? 0;
      agg.failedJobs += d.failed_jobs_today ?? 0;
      agg.backups24h += d.backups_24h ?? 0;
      agg.deadlocks += d.deadlocks_per_sec ?? 0;
      agg.totalDataMb += d.total_data_mb ?? 0;
      agg.totalLogMb += d.total_log_mb ?? 0;
      if (d.ple != null) agg.ple.push(d.ple);
      const clk = parseInt(item.lastclock) || 0;
      if (clk > agg.lastClock) agg.lastClock = clk;
      agg.hostsOk++;
    });

    const pleMin = agg.ple.length ? Math.min(...agg.ple) : null;

    return {
      ok: true,
      dbOnline: agg.dbOnline, dbSuspect: agg.dbSuspect, ple: pleMin,
      userConns: agg.userConns, activeRequests: agg.activeRequests,
      blocked: agg.blocked, failedJobs: agg.failedJobs, backups24h: agg.backups24h,
      deadlocks: agg.deadlocks, totalDataMb: agg.totalDataMb, totalLogMb: agg.totalLogMb,
      hostsOk: agg.hostsOk, hostsError: agg.hostsError, lastClock: agg.lastClock,
      hostsTotal: hosts.length, error: null, coverage,
    };
  }

  function _empty(reason) {
    return {
      ok: false, dbOnline: 0, dbSuspect: 0, ple: null,
      userConns: 0, activeRequests: 0, blocked: 0, failedJobs: 0,
      backups24h: 0, deadlocks: 0, totalDataMb: 0, totalLogMb: 0,
      hostsOk: 0, hostsError: 0, hostsTotal: 0, lastClock: 0, error: reason,
      coverage: null,
    };
  }

  // ── RENDER ─────────────────────────────────────────────────────
  function coverageCard(cardFn, coverage) {
    if (!coverage) return '';
    const label = coverage.odbc + ' ODBC · ' + coverage.perfmon + ' Perfmon · '
      + coverage.servico + ' Serviço · ' + coverage.semSinal + ' sem sinal';
    const state = coverage.odbc + coverage.perfmon + coverage.servico > 0 ? 'ok' : 'down';
    return cardFn(state, 'Cobertura de monitorização', coverage.total, 'hosts', label);
  }

  function render(el, d) {
    const u = window.BPC.utils;

    if (!d.ok && d.error) {
      // Mesmo sem dados ODBC agregados, a cobertura por tier continua útil de mostrar
      if (d.coverage) {
        const cardFn = (state, label, value, unit, sub) =>
          '<div class="bpc-card state-' + state + '" style="min-width:220px">'
          + '<div class="bpc-label">' + label + '</div>'
          + '<div class="bpc-flex bpc-gap-4" style="margin-top:6px;align-items:baseline;">'
          + '<span class="bpc-value-lg ' + u.stateClass(state) + '">' + value + '</span>'
          + '<span style="font-size:.75rem;color:#8B949E;margin-left:3px">' + unit + '</span>'
          + '</div><div class="bpc-label" style="margin-top:4px;font-size:.62rem">' + sub + '</div></div>';
        el.innerHTML = '<div class="bpc" style="display:flex;gap:8px">' + coverageCard(cardFn, d.coverage) + '</div>'
          + '<div style="margin-top:8px">' + u.buildError('Bases de Dados — KPI', d.error, '#F59E0B') + '</div>';
        return;
      }
      el.innerHTML = u.buildError('Bases de Dados — KPI', d.error, '#F59E0B');
      return;
    }

    const pleState = u.stateBelow(d.ple, THR.ple);
    const conState = u.stateAbove(d.userConns, THR.connections);
    const blkState = u.stateAbove(d.blocked, THR.blocked);
    const dlState = u.stateAbove(d.deadlocks, THR.deadlocks);
    const susState = d.dbSuspect > 0 ? 'down' : 'ok';
    const jobState = u.stateAbove(d.failedJobs, THR.failedJobs);

    const pleLabel = d.ple != null ? d.ple + ' s' : '—';

    let wrapStyle, cardStyle;
    if (CFG.layout === '1row') {
      wrapStyle = 'display:flex;flex-wrap:nowrap;gap:8px;overflow-x:auto;';
      cardStyle = 'flex:1;min-width:0;';
    } else if (CFG.layout === '2rows') {
      wrapStyle = 'display:flex;flex-wrap:wrap;gap:8px;';
      cardStyle = 'flex:1 1 calc(20% - 8px);min-width:0;max-width:calc(20% - 8px);';
    } else {
      wrapStyle = 'display:flex;flex-wrap:wrap;gap:8px;';
      cardStyle = 'min-width:130px;flex:1;';
    }

    const card = (state, label, value, unit, sub) =>
      '<div class="bpc-card state-' + state + '" style="' + cardStyle + '">'
      + '<div class="bpc-label">' + label + '</div>'
      + '<div class="bpc-flex bpc-gap-4" style="margin-top:6px;align-items:baseline;">'
      + '<span class="bpc-value-lg ' + u.stateClass(state) + '">' + value + '</span>'
      + (unit ? '<span style="font-size:.75rem;color:#8B949E;margin-left:3px">' + unit + '</span>' : '')
      + '</div>'
      + (sub ? '<div class="bpc-label" style="margin-top:4px;font-size:.62rem">' + sub + '</div>' : '')
      + '</div>';

    const divider = '<div style="width:1px;background:rgba(255,255,255,0.07);align-self:stretch;flex-shrink:0;"></div>';

    const coverageNote = d.hostsTotal > d.hostsOk
      ? '  ·  <span style="color:#D29922">⚠ ' + (d.hostsTotal - d.hostsOk) + '/' + d.hostsTotal + ' hosts sem dados</span>'
      : '';

    const ts = d.lastClock
      ? '<div style="font-size:.6rem;color:rgba(255,255,255,.18);text-align:right;margin-top:4px">'
      + 'Zabbix · ' + u.fmtTime(d.lastClock) + coverageNote
      + '</div>'
      : '';

    el.innerHTML =
      '<div class="bpc" style="' + wrapStyle + '">'
      + coverageCard(card, d.coverage)
      + divider
      + card('ok', 'Bases online', d.dbOnline, '', d.hostsOk + '/' + d.hostsTotal + ' servidor(es)')
      + card(susState, 'Suspect', d.dbSuspect, '', susState !== 'ok' ? '⚠ ATENÇÃO' : 'Nenhuma')
      + divider
      + card(pleState, 'PLE (mínimo)', pleLabel, '', pleState === 'ok' ? 'Saudável' : 'Pressão memória')
      + card(conState, 'Utilizadores', d.userConns, '', d.activeRequests + ' activos')
      + card(blkState, 'Bloqueados', d.blocked, '', blkState !== 'ok' ? '⚠ ATENÇÃO' : 'Nenhum')
      + divider
      + card(jobState, 'Jobs falhados', d.failedJobs, '', 'Hoje')
      + card('ok', 'Backups 24 h', d.backups24h, '', 'Completados')
      + card(dlState, 'Deadlocks', d.deadlocks, '', 'Acumulados')
      + divider
      + card('ok', 'Dados total', u.fmtMb(d.totalDataMb), '', d.hostsOk + ' servidor(es)')
      + card('ok', 'Log total', u.fmtMb(d.totalLogMb), '', 'Total servidor')
      + '</div>'
      + ts;
  }

  // ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────
  function start(rpc) {
    const u = window.BPC.utils;
    u.waitForElement(CFG.elementId, function (el) {
      el.innerHTML = u.buildSkeleton('#F59E0B');

      function load() {
        return getData(rpc)
          .then(d => render(el, d))
          .catch(e => { el.innerHTML = u.buildError('Bases de Dados — KPI', e.message, '#F59E0B'); });
      }

      load();
      u.startRefresh(el, () => {
        getData(rpc)
          .then(d => render(el, d))
          .catch(e => console.error('[BPC][KPI-BD] refresh:', e));
      }, CFG.refresh);
    });
  }

  function initWithRetry(attempt) {
    attempt = attempt || 0;
    if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return; }
    if (attempt > 50) { console.error('[BPC] l2-kpi-bases-dados: window.waitForBPC nunca ficou disponivel'); return; }
    setTimeout(function () { initWithRetry(attempt + 1); }, 100);
  }

  initWithRetry();

})();
