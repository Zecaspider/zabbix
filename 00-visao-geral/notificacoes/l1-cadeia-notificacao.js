// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Notificações — Estado do pipeline + cadeia de notificação  v2.0    ║
// ║                                                                          ║
// ║  v2.0 (2026-07-13): redesenho UI/UX.                                     ║
// ║   · KPI strip no topo: entregues/falhados 24h, taxa de falha,            ║
// ║     actions ON, mediatypes ON — o facto crítico deixa de estar           ║
// ║     enterrado numa pill.                                                 ║
// ║   · Cadeia em grelha de 4 colunas com cabeçalho fixo                     ║
// ║     (ACTION → VIA → DESTINATÁRIOS → ENTREGAS 24H) em vez de flex         ║
// ║     com quebras imprevisíveis.                                           ║
// ║   · Mediatypes deduplicados (antes: "Email OFFQualquer mediatype ON      ║
// ║     Email OFF" colado e repetido).                                       ║
// ║   · "Última entrega OK" por action (novo SQL lastok).                    ║
// ║   · Stale-while-revalidate: sem piscar no refresh de 1m do dashboard.    ║
// ║   · Timer de refresh guardado em window.__bpc_ns e limpo a cada          ║
// ║     re-execução (antes acumulava 1 setInterval por re-render).           ║
// ║                                                                          ║
// ║  Dados: datasource MySQL Infra (afor1g5862fb4c) via POST /api/ds/query   ║
// ║  (same-origin, sessão do browser). Não usa o proxy zabbix-api porque     ║
// ║  action.get está bloqueado nesse proxy e o cache de ~30min esconderia    ║
// ║  mudanças de estado — o MySQL dá o estado real, sem cache.               ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-nt-cadeia',
  refreshMs: 120000,
  dsQueryUrl: 'http://10.10.126.22:3000/api/ds/query',
  mysqlUid: 'afor1g5862fb4c',
};

var SQL = {
  acts: "SELECT actionid, name, status FROM actions WHERE eventsource = 0",
  medias: "SELECT o.actionid, om.mediatypeid, COALESCE(mt.name,'Qualquer mediatype') AS mtname, COALESCE(mt.status,0) AS mtstatus FROM operations o JOIN opmessage om ON om.operationid = o.operationid LEFT JOIN media_type mt ON mt.mediatypeid = om.mediatypeid WHERE o.operationtype = 0",
  usrs: "SELECT o.actionid, u.userid, u.username FROM operations o JOIN opmessage_usr ou ON ou.operationid = o.operationid JOIN users u ON u.userid = ou.userid",
  grps: "SELECT o.actionid, u.userid, u.username FROM operations o JOIN opmessage_grp og ON og.operationid = o.operationid JOIN users_groups ug ON ug.usrgrpid = og.usrgrpid JOIN users u ON u.userid = ug.userid",
  media: "SELECT m.userid, m.mediatypeid, m.sendto, m.active FROM media m",
  stats: "SELECT actionid, status, COUNT(*) AS c FROM alerts WHERE clock > UNIX_TIMESTAMP(NOW() - INTERVAL 24 HOUR) GROUP BY actionid, status",
  lastok: "SELECT actionid, MAX(clock) AS c FROM alerts WHERE status = 1 GROUP BY actionid",
  mtypes: "SELECT mediatypeid, name, status FROM media_type",
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtN(n) {
  // separador de milhares com espaço fino (pt)
  var s = String(Math.round(n));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function idadeDesde(clock) {
  if (!clock) return null;
  var s = Math.max(0, Math.floor(Date.now() / 1000) - parseInt(clock, 10));
  if (s < 3600) return Math.floor(s / 60) + ' min';
  if (s < 86400) return Math.floor(s / 3600) + ' h';
  return Math.floor(s / 86400) + ' d';
}

// ── ds/query ──────────────────────────────────────────────────────────────────

function dsQuery(sqls) {
  var queries = Object.keys(sqls).map(function(refId) {
    return {
      refId: refId,
      datasource: { uid: CFG.mysqlUid, type: 'mysql' },
      rawSql: sqls[refId],
      format: 'table',
    };
  });
  return fetch(CFG.dsQueryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-grafana-org-id': '1' },
    credentials: 'include',
    body: JSON.stringify({ queries: queries, from: 'now-1h', to: 'now' }),
  })
  .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
  .then(function(json) {
    var out = {};
    Object.keys(sqls).forEach(function(refId) {
      var res = json.results && json.results[refId];
      var frame = res && res.frames && res.frames[0];
      if (!frame) { out[refId] = []; return; }
      var nomes = frame.schema.fields.map(function(f) { return f.name; });
      var vals = frame.data.values;
      var linhas = [];
      var n = vals.length ? vals[0].length : 0;
      for (var i = 0; i < n; i++) {
        var row = {};
        nomes.forEach(function(nm, c) { row[nm] = vals[c][i]; });
        linhas.push(row);
      }
      out[refId] = linhas;
    });
    return out;
  });
}

// ── MODELO ────────────────────────────────────────────────────────────────────

function montarCadeias(d) {
  var mediaPorUser = {};
  d.media.forEach(function(m) {
    (mediaPorUser[m.userid] = mediaPorUser[m.userid] || []).push(m);
  });

  var statsPorAction = {};
  d.stats.forEach(function(s) {
    var st = statsPorAction[s.actionid] = statsPorAction[s.actionid] || { enviados: 0, falhados: 0, outros: 0 };
    if (s.status === 1) st.enviados += s.c;
    else if (s.status === 2) st.falhados += s.c;
    else st.outros += s.c;
  });

  var lastokPorAction = {};
  (d.lastok || []).forEach(function(l) { lastokPorAction[l.actionid] = l.c; });

  return d.acts.map(function(a) {
    // mediatypes deduplicados por nome+estado (a mesma operação pode repetir o mediatype)
    var vistosMt = {};
    var mts = [];
    d.medias.forEach(function(m) {
      if (m.actionid !== a.actionid) return;
      var k = m.mtname + '|' + m.mtstatus;
      if (vistosMt[k]) return;
      vistosMt[k] = 1;
      mts.push({ id: m.mediatypeid, nome: m.mtname, ligado: m.mtstatus === 0 });
    });

    var users = {};
    d.usrs.concat(d.grps).forEach(function(u) {
      if (u.actionid === a.actionid) users[u.userid] = u.username;
    });

    var destinos = [];
    var vistosDst = {};
    Object.keys(users).forEach(function(uid) {
      (mediaPorUser[uid] || []).forEach(function(m) {
        var relevante = !mts.length || mts.some(function(mt) {
          return mt.id === 0 || mt.id === m.mediatypeid;
        });
        if (!relevante) return;
        var k = m.sendto + '|' + users[uid];
        if (vistosDst[k]) return;
        vistosDst[k] = 1;
        destinos.push({ user: users[uid], sendto: m.sendto, activo: m.active === 0 });
      });
    });

    return {
      nome: a.name,
      ligada: a.status === 0,
      mediatypes: mts,
      destinos: destinos,
      stats: statsPorAction[a.actionid] || { enviados: 0, falhados: 0, outros: 0 },
      lastok: lastokPorAction[a.actionid] || null,
    };
  });
}

function calcularKpis(cadeias, d) {
  var enviados = 0, falhados = 0;
  cadeias.forEach(function(c) { enviados += c.stats.enviados; falhados += c.stats.falhados; });
  var total = enviados + falhados;
  var mtOn = 0, mtTot = (d.mtypes || []).length;
  (d.mtypes || []).forEach(function(m) { if (m.status === 0) mtOn++; });
  var actOn = 0;
  cadeias.forEach(function(c) { if (c.ligada) actOn++; });
  return {
    enviados: enviados,
    falhados: falhados,
    taxaFalha: total > 0 ? Math.round(falhados / total * 100) : null,
    actOn: actOn, actTot: cadeias.length,
    mtOn: mtOn, mtTot: mtTot,
  };
}

// ── RENDER ────────────────────────────────────────────────────────────────────

var COR = { ok: '#22C55E', warn: '#d29922', crit: '#f85149', off: '#64748B' };

function pill(txt, cor) {
  return '<span style="font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:9px;'
    + 'background:' + cor + '22;color:' + cor + ';border:1px solid ' + cor + '55;white-space:nowrap;">'
    + esc(txt) + '</span>';
}

function kpiTile(rotulo, valor, cor, nota) {
  return '<div class="bpc bpc-card" style="--card-accent:' + cor + ';padding:10px 16px 12px;">'
    + '<div style="font-size:.70rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.45);">' + rotulo + '</div>'
    + '<div style="font-size:1.85rem;font-weight:800;line-height:1.25;color:' + cor + ';font-variant-numeric:tabular-nums;">' + valor + '</div>'
    + (nota ? '<div style="font-size:.72rem;color:rgba(255,255,255,.35);">' + nota + '</div>' : '')
    + '</div>';
}

function renderKpis(k) {
  var corFalha = k.falhados > 0 ? COR.crit : COR.ok;
  var corTaxa = k.taxaFalha == null ? COR.off : k.taxaFalha >= 50 ? COR.crit : k.taxaFalha > 0 ? COR.warn : COR.ok;
  return '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px;">'
    + kpiTile('Entregues · 24h', fmtN(k.enviados), k.enviados > 0 ? COR.ok : COR.off, 'notificações com sucesso')
    + kpiTile('Falhados · 24h', fmtN(k.falhados), corFalha, 'geradas mas não entregues')
    + kpiTile('Taxa de falha', k.taxaFalha == null ? '—' : k.taxaFalha + '%', corTaxa, 'sobre o total de tentativas')
    + kpiTile('Actions ligadas', k.actOn + '<span style="font-size:1.05rem;color:rgba(255,255,255,.35);"> / ' + k.actTot + '</span>', k.actOn > 0 ? '#00B4D8' : COR.off, 'actions de trigger')
    + kpiTile('Mediatypes ON', k.mtOn + '<span style="font-size:1.05rem;color:rgba(255,255,255,.35);"> / ' + k.mtTot + '</span>', k.mtOn > 0 ? '#00B4D8' : COR.crit, 'canais de envio activos')
    + '</div>';
}

var GRID_COLS = 'grid-template-columns:minmax(190px,1.1fr) minmax(150px,.9fr) minmax(240px,1.6fr) minmax(170px,.9fr);';

function renderCabecalho() {
  function th(t, seta) {
    return '<div style="font-size:.70rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.40);">'
      + t + (seta ? ' <span style="color:rgba(255,255,255,.22);font-weight:400;">→</span>' : '') + '</div>';
  }
  return '<div style="display:grid;' + GRID_COLS + 'gap:0 18px;padding:0 18px 6px;">'
    + th('Action', true) + th('Via (mediatype)', true) + th('Destinatários', true) + th('Entregas · 24h', false)
    + '</div>';
}

function renderCadeia(c) {
  var partida = c.ligada && c.mediatypes.length && c.mediatypes.every(function(m) { return !m.ligado; });
  var accent = partida ? COR.crit : c.ligada ? COR.ok : COR.off;
  var dim = c.ligada ? '' : 'opacity:.60;';

  // col 1 — action
  var col1 = '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start;">'
    + '<span style="font-size:.95rem;font-weight:700;color:#E6EDF3;line-height:1.25;">' + esc(c.nome) + '</span>'
    + pill(c.ligada ? 'ACTION ON' : 'ACTION OFF', c.ligada ? COR.ok : COR.off)
    + '</div>';

  // col 2 — mediatypes (deduplicados no modelo)
  var col2 = c.mediatypes.length
    ? '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-start;">'
      + c.mediatypes.map(function(m) {
          return '<span style="font-size:.84rem;color:rgba(255,255,255,.75);white-space:nowrap;">'
            + esc(m.nome) + ' ' + pill(m.ligado ? 'ON' : 'OFF', m.ligado ? COR.ok : COR.crit) + '</span>';
        }).join('')
      + '</div>'
    : '<span style="font-size:.82rem;color:rgba(255,255,255,.35);">sem operação de mensagem</span>';

  // col 3 — destinatários
  var col3;
  if (!c.ligada) {
    col3 = '<span style="font-size:.84rem;color:rgba(255,255,255,.40);">'
      + c.destinos.length + ' configurado(s) — nada é enviado</span>';
  } else if (!c.destinos.length) {
    col3 = '<span style="font-size:.84rem;color:rgba(255,255,255,.35);">sem destinatários resolvidos</span>';
  } else {
    col3 = '<div style="display:flex;flex-direction:column;gap:3px;">'
      + c.destinos.map(function(dd) {
          var op = dd.activo ? '.85' : '.40';
          var nota = dd.activo ? '' : ' <span style="font-size:.68rem;color:' + COR.warn + ';">(media desactivada)</span>';
          return '<div style="font-size:.84rem;color:rgba(255,255,255,' + op + ');font-variant-numeric:tabular-nums;">'
            + esc(dd.sendto) + ' <span style="color:rgba(255,255,255,.30);">· ' + esc(dd.user) + '</span>' + nota + '</div>';
        }).join('')
      + '</div>';
  }

  // col 4 — entregas 24h
  var s = c.stats;
  var ultima = c.lastok ? 'última OK há ' + idadeDesde(c.lastok) : 'nunca entregou com sucesso';
  var col4 = '<div style="display:flex;flex-direction:column;gap:2px;font-variant-numeric:tabular-nums;">'
    + '<div><span style="font-size:1.15rem;font-weight:800;color:' + (s.enviados > 0 ? COR.ok : 'rgba(255,255,255,.30)') + ';">' + fmtN(s.enviados) + '</span>'
    +   ' <span style="font-size:.72rem;color:rgba(255,255,255,.40);">entregues</span></div>'
    + '<div><span style="font-size:1.15rem;font-weight:800;color:' + (s.falhados > 0 ? COR.crit : 'rgba(255,255,255,.30)') + ';">' + fmtN(s.falhados) + '</span>'
    +   ' <span style="font-size:.72rem;color:rgba(255,255,255,.40);">falhados</span></div>'
    + (s.outros ? '<div><span style="font-size:1.0rem;font-weight:700;color:' + COR.warn + ';">' + fmtN(s.outros) + '</span>'
    +   ' <span style="font-size:.72rem;color:rgba(255,255,255,.40);">em fila</span></div>' : '')
    + '<div style="font-size:.70rem;color:rgba(255,255,255,.32);">' + ultima + '</div>'
    + '</div>';

  var alerta = partida
    ? '<div style="grid-column:1 / -1;margin-top:4px;padding:8px 12px;border-radius:8px;background:#f8514915;border:1px solid #f8514955;font-size:.82rem;color:#f85149;line-height:1.45;">'
      + '⚠ <b>Cadeia partida</b> — a action está ligada e a gerar alertas, mas o mediatype está desligado: nada é entregue. '
      + 'Não religar o Email sem o runbook GLPI (CLAUDE.md): cada email vira 1 ticket automático.'
      + '</div>'
    : '';

  return '<div class="bpc bpc-card" style="--card-accent:' + accent + ';padding:12px 18px;margin-bottom:10px;'
    + 'display:grid;' + GRID_COLS + 'gap:6px 18px;align-items:start;' + dim + '">'
    + col1 + col2 + col3 + col4 + alerta
    + '</div>';
}

function loadAndRender(root, ns) {
  dsQuery(SQL).then(function(d) {
    var cadeias = montarCadeias(d);
    // ligadas primeiro; entre ligadas, cadeias partidas primeiro
    cadeias.sort(function(a, b) {
      var pa = a.ligada && a.mediatypes.length && a.mediatypes.every(function(m) { return !m.ligado; });
      var pb = b.ligada && b.mediatypes.length && b.mediatypes.every(function(m) { return !m.ligado; });
      return ((b.ligada ? 1 : 0) - (a.ligada ? 1 : 0)) || ((pb ? 1 : 0) - (pa ? 1 : 0));
    });
    root.innerHTML = '<div style="padding:2px 0;">'
      + renderKpis(calcularKpis(cadeias, d))
      + renderCabecalho()
      + cadeias.map(renderCadeia).join('')
      + '<div style="font-size:.72rem;color:rgba(255,255,255,.32);margin-top:2px;">Actions de trigger do Zabbix Infra · estado lido directo do MySQL (sem cache) · janela de entregas: últimas 24h</div>'
      + '</div>';
    ns.html = root.innerHTML; // alimenta o stale-while-revalidate
  }).catch(function(err) {
    console.error('[BPC] nt-cadeia: falha ds/query', err);
    root.innerHTML = '<div class="bpc-error-msg">Falha a ler a cadeia de notificação (' + esc(err.message) + ')</div>';
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    if (!window.__bpc_ns) window.__bpc_ns = {};
    var ns = window.__bpc_ns[CFG.rootId] = window.__bpc_ns[CFG.rootId] || {};
    // stale-while-revalidate: o refresh do dashboard re-executa este script e
    // destrói o DOM — repinta o último render em vez de piscar o skeleton
    if (ns.html) root.innerHTML = ns.html;
    else root.innerHTML = '<div class="bpc-skeleton" style="height:160px;"></div>';
    loadAndRender(root, ns);
    // timer único por rootId (antes acumulava 1 setInterval por re-render)
    if (ns.timer) clearInterval(ns.timer);
    ns.timer = setInterval(function() {
      var el = document.getElementById(CFG.rootId);
      if (el) loadAndRender(el, ns);
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
    console.error('[BPC] nt-cadeia: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
