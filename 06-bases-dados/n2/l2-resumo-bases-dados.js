// ══════════════════════════════════════════════════════════════════════════
//  N2 · BASES DE DADOS — Resumo (v2, redesenho 2026-07-12)
//
//  Design em 06-bases-dados/DESIGN-N2-N3-20260712.md. 4 blocos empilhados:
//    1. CONTEXTO OPERACIONAL (NOVO) — o "quanto existe": hosts, instâncias,
//       bases, tamanho total, repartição por motor. Responde a "o que estou
//       a monitorizar" antes de "como está".
//    2. COBERTURA DE MONITORIZAÇÃO — contagem por tier (●◐◑○)
//    3. ATENÇÃO IMEDIATA — achados operacionais concretos, gerados (nunca
//       hardcoded): motor parado, log quase cheio, jobs falhados, credenciais.
//    4. SAÚDE AGREGADA — só hosts com dados reais (odbc+perfmon), diz
//       explicitamente quantos de quantos.
//
//  Foco PRODUÇÃO (pedido do utilizador). Mesma classificação de tier que
//  l2-tabela-hosts.js (duplicada por convenção do repo — sem bundler).
// ══════════════════════════════════════════════════════════════════════════

(function () {

  const CFG = {
    elementId: 'bpc-resumo-bases-de-dados',
    hostTag: 'camada',
    hostTagValue: 'base de dados',
    ambientePrefix: 'produ',
    odbcKeyPrefix: 'db.odbc.select[mssql.business.master',
    refresh: 60000,
    logUsadoAlertPct: 90,
  };

  const THR = { ple: { warn: 300, crit: 100 } };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(it) { return it ? parseFloat(it.lastvalue) : null; }
  function findByName(items, name) {
    const it = items.find(i => i.name === name);
    return it && it.error == null && it.lastvalue !== '' ? it : null;
  }
  function tagValue(tags, key) {
    const t = (tags || []).find(t => t.tag === key);
    return t ? t.value : '';
  }
  function svcName(key) {
    const m = (key || '').match(/service\.info\[\s*"?([^",\]]+)"?/);
    return m ? m[1] : (key || '');
  }
  function isPrimaryEngineSvc(name) {
    if (/RMAN|Backup/i.test(name)) return false;
    if (/^OracleService/i.test(name)) return true;
    if (/^MSSQLSERVER$/i.test(name)) return true;
    if (/^MSSQL\$/i.test(name)) return true;
    return false;
  }
  function motorFromSvcNames(names, hasOdbc) {
    if (names.some(n => /oracle/i.test(n))) return 'Oracle';
    if (names.some(n => /mssql|sqlserver/i.test(n))) return 'MSSQL';
    if (hasOdbc) return 'MSSQL';
    return '?';
  }
  // proc.num[] sem argumentos (template Windows) conta TODOS os processos —
  // só é sinal de motor se o key nomear um processo de BD (fix 2026-07-13)
  function isDbProcItem(it) {
    return /proc\.num\[[^\]]*(sqlservr|oracle|sqlbrowser|mysqld|postgres)/i.test(it.key_ || '')
      || /^Processo .+ activo$/.test(it.name || '');
  }
  function fmtSize(mb) {
    if (mb == null || isNaN(mb) || mb === 0) return '—';
    if (mb >= 1024 * 1024) return (mb / 1024 / 1024).toFixed(1) + ' TB';
    if (mb >= 1024) return (mb / 1024).toFixed(0) + ' GB';
    return Math.round(mb) + ' MB';
  }

  async function getData(rpc) {
    const allHosts = await rpc('host.get', {
      output: ['hostid', 'name'],
      tags: [{ tag: CFG.hostTag, value: CFG.hostTagValue, operator: '0' }],
      filter: { status: 0 },
      selectTags: 'extend',
    });
    const hosts = allHosts.filter(h => {
      const amb = (tagValue(h.tags, 'ambiente') || '').toLowerCase();
      return amb.indexOf(CFG.ambientePrefix) === 0;
    });
    if (!hosts.length) return null;

    const hostIds = hosts.map(h => h.hostid);
    const [odbcItems, perfItems, svcItems, procItems] = await Promise.all([
      rpc('item.get', { hostids: hostIds, search: { key_: CFG.odbcKeyPrefix }, filter: { status: 0 }, output: ['hostid', 'lastvalue', 'lastclock', 'error'] }),
      rpc('item.get', { hostids: hostIds, search: { name: 'MSSQL ' }, filter: { status: 0 }, output: ['hostid', 'name', 'lastvalue', 'lastclock', 'error'] }),
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

    const coverage = { odbc: 0, perfmon: 0, servico: 0, nd: 0, total: hosts.length };
    const ctx = { instancias: 0, bases: 0, basesMedidas: false, sizeMb: 0, motores: { MSSQL: 0, Oracle: 0, '?': 0 } };
    const health = { ple: [], connections: 0, deadlocks: 0, blocked: 0, failedJobs: 0, backups24h: 0, hostsComDados: 0 };
    const alerts = [];
    let credencialFaltaCount = 0;

    hosts.forEach(h => {
      const svcAll = svcByHost[h.hostid] || [];
      const svcNames = svcAll.map(i => svcName(i.key_));
      const hasOdbcItem = !!odbcByHost[h.hostid];
      const motor = motorFromSvcNames(svcNames, hasOdbcItem);
      ctx.motores[motor] = (ctx.motores[motor] || 0) + 1;
      // Instâncias = serviços primários distintos do motor descobertos
      const primaries = svcNames.filter(isPrimaryEngineSvc);
      ctx.instancias += primaries.length || (hasOdbcItem ? 1 : 0);

      const it = odbcByHost[h.hostid];
      let odbcOk = false;
      if (it && !it.error && it.lastvalue) {
        const raw = it.lastvalue.trim();
        odbcOk = raw.endsWith('}') || raw.endsWith(']');
      }

      if (odbcOk) {
        coverage.odbc++;
        let d; try { d = JSON.parse(it.lastvalue); } catch (e) { d = null; }
        if (d) {
          health.hostsComDados++;
          if (d.ple != null) health.ple.push(d.ple);
          health.connections += d.user_connections || 0;
          health.deadlocks += d.deadlocks_per_sec || 0;
          health.blocked += d.blocked_processes || 0;
          health.failedJobs += d.failed_jobs_today || 0;
          health.backups24h += d.backups_24h || 0;
          const nb = d.db_online != null ? d.db_online : (Array.isArray(d.databases) ? d.databases.length : 0);
          ctx.bases += nb; ctx.basesMedidas = true;
          ctx.sizeMb += (d.total_data_mb || 0) + (d.total_log_mb || 0);
          if (d.db_suspect > 0) alerts.push({ sev: 0, text: h.name + ' — ' + d.db_suspect + ' base(s) em estado suspect' });
          if (d.failed_jobs_today > 0) alerts.push({ sev: 1, text: h.name + ' — ' + d.failed_jobs_today + ' jobs SQL Agent falhados hoje' });
        }
        return;
      }

      const perf = perfByHost[h.hostid] || [];
      const pPle = findByName(perf, 'MSSQL Page life expectancy');
      const pConn = findByName(perf, 'MSSQL User Connections');
      const pDead = findByName(perf, 'MSSQL Number of Deadlocks/sec');
      const wmiData = perf.filter(i => /^MSSQL DB .+: Tamanho dados/.test(i.name));
      const wmiLog = perf.filter(i => /^MSSQL DB .+: Tamanho log/.test(i.name));
      if (pPle || pConn || pDead || wmiData.length) {
        coverage.perfmon++;
        health.hostsComDados++;
        if (pPle) health.ple.push(num(pPle));
        health.connections += num(pConn) || 0;
        health.deadlocks += num(pDead) || 0;
        if (wmiData.length) {
          ctx.bases += wmiData.length; ctx.basesMedidas = true;
          let kb = 0; wmiData.concat(wmiLog).forEach(i => { kb += num(i) || 0; });
          ctx.sizeMb += kb / 1024;
        }
        const pSvc = svcAll.find(i => i.name && i.name.indexOf('MSSQL Service state') === 0);
        if (pSvc && num(pSvc) !== 0) alerts.push({ sev: 0, text: h.name + ' — serviço da instância MSSQL PARADO' });
        perf.filter(i => /Percent log usado$/.test(i.name)).forEach(i => {
          const pct = num(i);
          if (pct >= CFG.logUsadoAlertPct) {
            const dbName = (i.name.match(/^MSSQL DB (.+): Percent log usado$/) || [])[1] || '?';
            alerts.push({ sev: 1, text: h.name + ' → base ' + dbName + ' a ' + pct + '% do log usado' });
          }
        });
        return;
      }

      // Tier serviço — só o primário conta (corrige bug v3)
      const primary = svcAll.filter(i => isPrimaryEngineSvc(svcName(i.key_)));
      if (primary.length) {
        coverage.servico++;
        const down = primary.filter(i => num(i) !== 0);
        if (down.length) {
          const nomes = down.map(i => svcName(i.key_)).join(', ');
          alerts.push({ sev: 0, text: h.name + ' — motor instalado mas serviço PARADO (' + nomes + ')' });
        }
        return;
      }

      const procAll = (procByHost[h.hostid] || []).filter(isDbProcItem);
      if (procAll.some(i => (num(i) || 0) > 0)) { coverage.servico++; return; }

      coverage.nd++;
      if (it && it.error && /login failed|28000|18456/i.test(it.error)) credencialFaltaCount++;
    });

    if (credencialFaltaCount > 0) {
      alerts.push({ sev: 2, text: credencialFaltaCount + ' hosts MSSQL confirmados sem credencial zbx_monitor — pedir criação à infra' });
    }
    alerts.sort((a, b) => a.sev - b.sev);

    return { coverage, ctx, health, alerts, pleMin: health.ple.length ? Math.min(...health.ple) : null };
  }

  // ── RENDER ─────────────────────────────────────────────────────
  function bigCard(col, val, lbl, sub) {
    return '<div style="flex:1;min-width:110px;background:rgba(255,255,255,.02);border:1px solid ' + col + '33;border-radius:8px;padding:10px 12px;">'
      + '<div style="font-size:1.4rem;font-weight:700;color:' + col + '">' + val + '</div>'
      + '<div style="font-size:.64rem;color:#8B949E;text-transform:uppercase;letter-spacing:.03em;margin-top:2px">' + lbl + '</div>'
      + (sub ? '<div style="font-size:.6rem;color:#6e7681;margin-top:3px">' + sub + '</div>' : '')
      + '</div>';
  }

  function contextBlock(ctx, total) {
    const motorParts = [];
    if (ctx.motores.MSSQL) motorParts.push('<span style="color:#a371f7">MSSQL ' + ctx.motores.MSSQL + '</span>');
    if (ctx.motores.Oracle) motorParts.push('<span style="color:#f0883e">Oracle ' + ctx.motores.Oracle + '</span>');
    if (ctx.motores['?']) motorParts.push('<span style="color:#6e7681">? ' + ctx.motores['?'] + '</span>');
    const basesLbl = ctx.basesMedidas ? '≥ ' + ctx.bases : '—';
    const cards = [
      bigCard('#8B949E', total, 'HOSTS PRODUÇÃO', ''),
      bigCard('#58a6ff', ctx.instancias || '—', 'INSTÂNCIAS', 'serviços de motor'),
      bigCard('#3fb950', basesLbl, 'BASES DE DADOS', ctx.basesMedidas ? 'medido onde há sinal' : 'sem medição'),
      bigCard('#d29922', fmtSize(ctx.sizeMb), 'TAMANHO', 'dados + log medidos'),
      '<div style="flex:1.4;min-width:150px;background:rgba(255,255,255,.02);border:1px solid #30363d;border-radius:8px;padding:10px 12px">'
        + '<div style="font-size:.9rem;font-weight:600;color:#C9D1D9">' + (motorParts.join(' · ') || '—') + '</div>'
        + '<div style="font-size:.64rem;color:#8B949E;text-transform:uppercase;margin-top:6px">MOTORES</div></div>',
    ];
    return '<div style="display:flex;gap:8px;flex-wrap:wrap">' + cards.join('') + '</div>';
  }

  function coverageBlock(coverage) {
    const items = [
      ['#3fb950', coverage.odbc, 'ODBC completo', '● dados SQL reais'],
      ['#58a6ff', coverage.perfmon, 'Perfmon local', '◐ contador + WMI'],
      ['#d29922', coverage.servico, 'Serviço', '◑ estado do motor'],
      ['#8b949e', coverage.nd, 'Sem sinal', '○ a confirmar'],
    ];
    return '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + items.map(([c, v, l, s]) => bigCard(c, v, l, s)).join('') + '</div>';
  }

  function alertsBlock(alerts) {
    if (!alerts.length) return '<div style="color:#3fb950;font-size:.8rem;padding:8px 0">✓ Sem achados operacionais a assinalar</div>';
    const icon = sev => sev === 0 ? '🔴' : '🟡';
    return alerts.map(a => '<div style="padding:5px 0;font-size:.8rem;color:#C9D1D9">' + icon(a.sev) + ' ' + esc(a.text) + '</div>').join('');
  }

  function healthBlock(u, d) {
    const pleLabel = d.pleMin != null ? d.pleMin + ' s' : '—';
    const pleState = u.stateBelow(d.pleMin, THR.ple);
    const cell = (label, value, state) =>
      '<div style="flex:1;min-width:95px;text-align:center">'
      + '<div class="' + (state ? u.stateClass(state) : '') + '" style="font-size:1.1rem;font-weight:700">' + value + '</div>'
      + '<div style="font-size:.62rem;color:#8B949E;text-transform:uppercase;margin-top:2px">' + label + '</div></div>';
    return '<div style="display:flex;gap:4px;flex-wrap:wrap">'
      + cell('PLE mín', pleLabel, pleState)
      + cell('Ligações', d.health.connections, null)
      + cell('Deadlocks', d.health.deadlocks, null)
      + cell('Bloqueados', d.health.blocked, null)
      + cell('Jobs falhados', d.health.failedJobs, d.health.failedJobs > 0 ? 'warn' : null)
      + cell('Backups 24h', d.health.backups24h, null)
      + '</div>';
  }

  function render(el, d) {
    const u = window.BPC.utils;
    if (!d) {
      el.innerHTML = u.buildError('Bases de Dados — Resumo', 'Sem hosts de Produção com tag ' + CFG.hostTag + '=' + CFG.hostTagValue, '#F59E0B');
      return;
    }
    const title = t => '<div style="font-size:.68rem;color:#8B949E;text-transform:uppercase;letter-spacing:.05em;margin:14px 0 8px 0">' + t + '</div>';
    el.innerHTML =
      title('Contexto operacional') + contextBlock(d.ctx, d.coverage.total)
      + title('Cobertura de monitorização') + coverageBlock(d.coverage)
      + title('Atenção imediata') + '<div>' + alertsBlock(d.alerts) + '</div>'
      + title('Saúde agregada (' + d.health.hostsComDados + ' de ' + d.coverage.total + ' hosts com dados reais)')
      + healthBlock(u, d);
  }

  function start(rpc) {
    const u = window.BPC.utils;
    u.waitForElement(CFG.elementId, function (el) {
      el.innerHTML = u.buildSkeleton('#F59E0B');
      function load() {
        return getData(rpc).then(d => render(el, d))
          .catch(e => { el.innerHTML = u.buildError('Bases de Dados — Resumo', e.message, '#F59E0B'); });
      }
      load();
      u.startRefresh(el, () => {
        getData(rpc).then(d => render(el, d)).catch(e => console.error('[BPC][Resumo-BD] refresh:', e));
      }, CFG.refresh);
    });
  }

  function initWithRetry(attempt) {
    attempt = attempt || 0;
    if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return; }
    if (attempt > 50) { console.error('[BPC] l2-resumo-bases-dados: window.waitForBPC nunca ficou disponivel'); return; }
    setTimeout(function () { initWithRetry(attempt + 1); }, 100);
  }

  initWithRetry();

})();
