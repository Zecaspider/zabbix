// ══════════════════════════════════════════════════════════════════════════
//  N2 · BASES DE DADOS — Tabela por host
//
//  Painel NOVO (não existia no dashboard arquivado "D03 - Bases de dados -
//  Nivel 2") - o painel 3 desse arquivo era um card generico copiado de um
//  card VMware/ESXi (CPU/RAM/balloon/datastore), sem nenhuma metrica real
//  de bases de dados (confirmado por auditoria de codigo 2026-07-12: zero
//  ocorrencias de PLE/deadlock/backup/mssql). Em vez de portar esse card
//  generico, construido este painel do zero para mostrar o que falta ao
//  KPI agregado (l2-kpi-bases-dados.js): QUAL host tem problema e PORQUE.
//
//  Auditoria ao vivo 2026-07-12 (4 hosts com tag camada=base de dados,
//  grupo 355): so VS6000005 tem dados reais. VS8000368 nunca teve o
//  template "BPC MSSQL by ODBC" aplicado (gap de provisionamento).
//  VS8000491 tem o agente Windows inteiro silencioso (nem CPU reporta).
//  VS9000423 tem o agente saudavel mas o SQL Server recusa a ligacao ODBC
//  (erro real do Zabbix mostrado na coluna Observacao). Estas 3 pendencias
//  ficam registadas no cronograma.md - resolver exige acesso as VMs.
// ══════════════════════════════════════════════════════════════════════════

(function () {

  const CFG = {
    elementId: 'bpc-tabela-bases-de-dados',
    hostTag: 'camada',
    hostTagValue: 'base de dados',
    itemKeyPrefix: 'db.odbc.select[mssql.business.master',
    refresh: 60000,
    staleThresholdSec: 300,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function getData(rpc) {
    const hosts = await rpc('host.get', {
      output: ['hostid', 'host', 'name'],
      tags: [{ tag: CFG.hostTag, value: CFG.hostTagValue, operator: '0' }],
      filter: { status: 0 },
    });
    if (!hosts.length) return [];

    const hostIds = hosts.map(h => h.hostid);
    const items = await rpc('item.get', {
      hostids: hostIds,
      search: { key_: CFG.itemKeyPrefix },
      filter: { status: 0 },
      output: ['hostid', 'lastvalue', 'lastclock', 'error'],
    });
    const itemByHost = {};
    items.forEach(it => { itemByHost[it.hostid] = it; });

    const now = Math.floor(Date.now() / 1000);

    return hosts.map(h => {
      const it = itemByHost[h.hostid];

      if (!it) {
        return { host: h.name, estado: 'crit', obs: 'Sem item MSSQL configurado — template "BPC MSSQL by ODBC" não aplicado a este host', data: null, lastclock: null };
      }
      if (it.error) {
        return { host: h.name, estado: 'crit', obs: it.error, data: null, lastclock: null };
      }
      const lastclock = parseInt(it.lastclock) || 0;
      if (!lastclock) {
        return { host: h.name, estado: 'crit', obs: 'Item configurado mas nunca recebeu valor — verificar se o agente Windows está a correr', data: null, lastclock: null };
      }

      let d;
      try {
        const raw = (it.lastvalue || '').trim();
        if (!raw.endsWith('}') && !raw.endsWith(']')) throw new Error('JSON truncado');
        d = JSON.parse(raw);
      } catch (e) {
        return { host: h.name, estado: 'crit', obs: 'Resposta inválida: ' + e.message, data: null, lastclock };
      }

      const stale = (now - lastclock) > CFG.staleThresholdSec;
      const estado = stale ? 'warn' : (d.db_suspect > 0 ? 'crit' : 'ok');
      return {
        host: h.name, estado, data: d, lastclock,
        obs: stale ? 'Dados desactualizados (> ' + Math.round(CFG.staleThresholdSec / 60) + ' min)' : null,
      };
    });
  }

  function pill(estado) {
    const map = { ok: ['#3fb950', 'Normal'], warn: ['#d29922', 'Atenção'], crit: ['#f85149', 'Crítico'] };
    const [col, lbl] = map[estado] || map.crit;
    return '<span style="background:' + col + '22;color:' + col + ';font-size:.72rem;font-weight:700;'
      + 'padding:2px 9px;border-radius:999px;white-space:nowrap">' + lbl + '</span>';
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
      + ['Host', 'Estado', 'PLE', 'Utilizadores', 'Bloqueados', 'Deadlocks', 'Jobs falhados', 'Backups 24h', 'Actualizado', 'Observação']
        .map(h => '<th style="' + thStyle + '">' + h + '</th>').join('')
      + '</tr></thead>';

    const body = rows.map(r => {
      const d = r.data;
      return '<tr>'
        + '<td style="' + tdStyle + ';font-family:monospace;font-weight:600;color:#E6EDF3">' + esc(r.host) + '</td>'
        + '<td style="' + tdStyle + '">' + pill(r.estado) + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d && d.ple != null ? d.ple + ' s' : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d ? (d.user_connections ?? '—') : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d ? (d.blocked_processes ?? '—') : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d ? (d.deadlocks_per_sec ?? '—') : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d ? (d.failed_jobs_today ?? '—') : '—') + '</td>'
        + '<td style="' + tdStyle + ';text-align:right">' + (d ? (d.backups_24h ?? '—') : '—') + '</td>'
        + '<td style="' + tdStyle + '">' + (r.lastclock ? u.fmtTime(r.lastclock) : '—') + '</td>'
        + '<td style="' + tdStyle + ';font-size:.72rem;color:#8B949E;max-width:320px">' + (r.obs ? esc(r.obs) : '—') + '</td>'
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
