// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N1 · Índice — Todos os dashboards por domínio                  v1.0     ║
// ║                                                                          ║
// ║  F3 do plano-melhorias-observabilidade-20260712.md.                      ║
// ║  Tabela de colunas = domínio/pasta Grafana; por baixo, os dashboards     ║
// ║  dessa pasta com link, ordenados por nível (N1→N6, R*).                  ║
// ║                                                                          ║
// ║  Fonte: GET /api/search ao vivo (sessão do browser, same-origin) —       ║
// ║  dashboards novos aparecem sozinhos, nunca há lista hardcoded.           ║
// ║  As pastas 04.x (segmentos de Rede) aninham dentro da coluna Rede.       ║
// ║  99 · Arquivo fica escondida por defeito (toggle no rodapé).             ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-indice-dashboards',
  refreshMs: 300000,
  searchUrl: '/api/search?type=dash-db&limit=500',
  arquivoTitulo: '99 · Arquivo',
};

var mostrarArquivo = false;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// nível para ordenação: N1..N6 → 1..6, R* → 20+n, resto → 90
function nivelDe(titulo) {
  var m = /^N(\d)/i.exec(titulo || '');
  if (m) return parseInt(m[1], 10);
  m = /^R(\d)/i.exec(titulo || '');
  if (m) return 20 + parseInt(m[1], 10);
  return 90;
}

function badgeNivel(titulo) {
  var m = /^(N\d|R\d)/i.exec(titulo || '');
  if (!m) return '';
  return '<span style="display:inline-block;min-width:24px;text-align:center;font-size:.66rem;font-weight:700;padding:1px 5px;border-radius:6px;background:rgba(56,189,248,.12);color:var(--bpc-cyan);border:1px solid rgba(56,189,248,.30);margin-right:7px;">' + m[1].toUpperCase() + '</span>';
}

// tira o prefixo redundante do título dentro da coluna ("N2 · Rede — Segmentos" → mantém, é informativo)
function tituloCurto(t) {
  return t;
}

function fetchDashboards() {
  return fetch(CFG.searchUrl, {
    headers: { 'x-grafana-org-id': '1' },
    credentials: 'include',
  }).then(function(r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

// Agrupa: pasta "04.x · Segmento" vira subgrupo da coluna "04 · Rede".
function agrupar(dashes) {
  var colunas = {}; // chave = título da pasta-mãe
  dashes.forEach(function(d) {
    var pasta = d.folderTitle || '(Sem pasta)';
    if (!mostrarArquivo && pasta === CFG.arquivoTitulo) return;
    var m = /^(\d+)\.(\d+)\s*·\s*(.+)$/.exec(pasta);
    var mae = pasta, sub = null;
    if (m) {
      // procurar a pasta-mãe pelo número (ex.: "04" → "04 · Rede")
      mae = null;
      sub = pasta;
    }
    var entry = { titulo: d.title, uid: d.uid, url: d.url, sub: sub, numMae: m ? m[1] : null };
    var chave = mae || ('__pendente_' + m[1]);
    (colunas[chave] = colunas[chave] || []).push(entry);
  });

  // resolver os pendentes: encontrar a coluna cujo título começa pelo número
  Object.keys(colunas).forEach(function(chave) {
    var m = /^__pendente_(\d+)$/.exec(chave);
    if (!m) return;
    var alvo = Object.keys(colunas).find(function(k) {
      return k.indexOf(m[1] + ' ·') === 0;
    });
    if (alvo) {
      colunas[alvo] = colunas[alvo].concat(colunas[chave]);
    } else {
      colunas[m[1] + ' · (segmentos)'] = colunas[chave];
    }
    delete colunas[chave];
  });
  return colunas;
}

function ordenarColunas(colunas) {
  return Object.keys(colunas).sort(function(a, b) {
    var na = parseFloat(a) || 999, nb = parseFloat(b) || 999;
    return na - nb || a.localeCompare(b);
  });
}

function renderColuna(nome, entries) {
  // separar directos vs segmentos (sub != null)
  var directos = entries.filter(function(e) { return !e.sub; });
  var porSub = {};
  entries.filter(function(e) { return e.sub; }).forEach(function(e) {
    (porSub[e.sub] = porSub[e.sub] || []).push(e);
  });

  function lista(items) {
    items.sort(function(a, b) {
      return nivelDe(a.titulo) - nivelDe(b.titulo) || a.titulo.localeCompare(b.titulo);
    });
    return items.map(function(e) {
      return '<div style="padding:3px 0;line-height:1.35;">'
        + badgeNivel(e.titulo)
        + '<a href="' + esc(e.url) + '" style="font-size:.84rem;color:rgba(255,255,255,.78);text-decoration:none;">'
        + esc(tituloCurto(e.titulo)) + '</a></div>';
    }).join('');
  }

  var corpo = lista(directos);
  Object.keys(porSub).sort().forEach(function(sub) {
    corpo += '<div style="margin-top:8px;font-size:.72rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.35);">' + esc(sub) + '</div>'
      + lista(porSub[sub]);
  });

  return '<div class="bpc bpc-card" style="--card-accent:var(--bpc-cyan);padding:14px 16px;display:flex;flex-direction:column;">'
    + '<div style="font-size:.98rem;font-weight:700;color:#E6EDF3;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;margin-bottom:8px;">' + esc(nome) + '</div>'
    + corpo
    + '</div>';
}

function renderIndice(root, dashes) {
  var colunas = agrupar(dashes);
  var chaves = ordenarColunas(colunas);
  var total = chaves.reduce(function(acc, k) { return acc + colunas[k].length; }, 0);

  var grid = chaves.map(function(k) { return renderColuna(k, colunas[k]); }).join('');

  root.innerHTML = '<div style="padding:2px 0;">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">'
    +   '<div style="font-size:.78rem;color:rgba(255,255,255,.40);">' + total + ' dashboards · lido ao vivo do /api/search</div>'
    +   '<a href="#" id="bpc-indice-toggle-arquivo" style="font-size:.78rem;color:var(--bpc-cyan);text-decoration:none;">'
    +   (mostrarArquivo ? 'esconder 99 · Arquivo' : 'mostrar 99 · Arquivo') + '</a>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px;align-items:start;">'
    + grid
    + '</div></div>';

  var toggle = document.getElementById('bpc-indice-toggle-arquivo');
  if (toggle) {
    toggle.addEventListener('click', function(ev) {
      ev.preventDefault();
      mostrarArquivo = !mostrarArquivo;
      renderIndice(root, dashes);
    });
  }
}

function loadAndRender(root) {
  fetchDashboards().then(function(dashes) {
    renderIndice(root, dashes);
  }).catch(function(err) {
    console.error('[BPC] indice-dashboards: falha /api/search', err);
    root.innerHTML = '<div class="bpc-error-msg">Falha a ler o índice (' + esc(err.message) + ')</div>';
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    root.innerHTML = '<div class="bpc-skeleton" style="height:300px;"></div>';
    loadAndRender(root);
    BPC.utils.startRefresh(root, function() { loadAndRender(root); }, CFG.refreshMs);
  });
}

function initWithRetry(attempt) {
  attempt = attempt || 0;
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start);
    return;
  }
  if (attempt > 50) {
    console.error('[BPC] indice-dashboards: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
