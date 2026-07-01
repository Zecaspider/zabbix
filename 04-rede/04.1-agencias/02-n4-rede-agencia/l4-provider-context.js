// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N4 · OPERADORAS WAN — SAÚDE NO HUB DMVPN (DC)            l4-provider-ctx  ║
// ║                                                                           ║
// ║  Responde, para uma agência DOWN: "é outage da operadora ou problema     ║
// ║  local?". O hub DMVPN do DC (DC1-RTE-WAN-AG) é monitorizado              ║
// ║  centralmente e SOBREVIVE à queda da agência — por isso dá contexto      ║
// ║  de operadora mesmo quando o router da agência está inalcançável.        ║
// ║                                                                           ║
// ║  v2 (2026-06-29): destaque das operadoras que esta agência usa,          ║
// ║  derivado dos túneis Tu10x na config do router (sobrevive ao DOWN).      ║
// ║                                                                           ║
// ║  Sinais por operadora (mapeados pelo nº de túnel, canónico agência↔hub): ║
// ║    • TRANSPORTE (veredicto) → sub-interface P2P Po2.x Operational status  ║
// ║      = link L2/físico da operadora ao DC.                                ║
// ║    • PULSO (contexto)       → tráfego rx do túnel DMVPN Tu10x             ║
// ║      = spokes dessa operadora a comunicar (colapso = dropout em massa).  ║
// ║                                                                           ║
// ║  Honesto (Z.15): estado POR OPERADORA, não por-spoke. Não confirma o     ║
// ║  túnel daquela agência específica — isso exigiria NHRP/crypto por spoke. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// ── CFG — editar aqui ────────────────────────────────────────────────────────
const CFG = {
  elementId: 'bpc-provider-ctx',
  hubHost: 'DC1-RTE-WAN-AG',          // hub DMVPN das agências, no DC
  refreshMs: 60000,
  // Catálogo de operadoras, chaveado pelo nº de túnel DMVPN (consistente
  // agência↔hub). transport = sub-interface P2P de transporte no hub.
  providers: [
    { tu: 'Tu101', name: 'UNITEL',    transport: 'Po2.914'  },
    { tu: 'Tu102', name: 'ITA',       transport: 'Po2.51'   },
    { tu: 'Tu103', name: 'IPWORLD',   transport: 'Po2.413'  },
    { tu: 'Tu104', name: 'MULTITEL',  transport: 'Po2.173'  },
    { tu: 'Tu105', name: 'MST·Fibra', transport: 'Po2.1506' },
    { tu: 'Tu106', name: 'MST·VSAT',  transport: 'Po2.905'  },
    { tu: 'Tu107', name: 'MST·MW',    transport: 'Po2.341'  },
  ],
};


// ── start — lógica do painel ─────────────────────────────────────────────────
function start(rpc) {
  const U = window.BPC.utils;

  function fmtBps(b) {
    if (b == null || isNaN(b) || b <= 0) return '—';
    if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + ' Mb/s';
    if (b >= 1e3) return (b / 1e3).toFixed(0) + ' kb/s';
    return Math.round(b) + ' b/s';
  }

  // Extrai o token entre 'Interface ' e '(' ou ':'
  function tokenOf(name) {
    const m = /^Interface\s+([^(:]+?)[\s(:]/.exec(name || '');
    return m ? m[1].trim() : '';
  }

  async function load() {
    const el = document.getElementById(CFG.elementId);
    if (!el) return;

    const hostVar = new URLSearchParams(window.location.search).get('var-host') || '';

    // Paralelo: dados do hub + itens de túnel da agência
    let hub, agencyTuItems;
    try {
      [hub, agencyTuItems] = await Promise.all([
        rpc('host.get', { filter: { host: [CFG.hubHost] }, output: ['hostid', 'host'] }),
        hostVar
          ? rpc('item.get', {
              filter: { host: [hostVar], status: 0 },
              search: { name: 'Interface Tu10' },
              output: ['name'],
            })
          : Promise.resolve([]),
      ]);
    } catch (e) {
      el.innerHTML = U.buildError('Operadoras WAN', 'Falha ao consultar dados: ' + e.message);
      return;
    }

    if (!hub || !hub.length) {
      el.innerHTML = U.buildError('Operadoras WAN', 'Hub ' + CFG.hubHost + ' não encontrado.');
      return;
    }
    const hubId = hub[0].hostid;

    // Estado de transporte (Operational status) + pulso (Bits received) do hub
    const items = await rpc('item.get', {
      hostids: [hubId],
      search: { name: 'Interface' },
      output: ['name', 'lastvalue'],
      filter: { status: 0 },
    });

    const stateByToken = {};
    const rxByToken = {};
    items.forEach(i => {
      const tk = tokenOf(i.name);
      if (!tk) return;
      if (i.name.includes(': Operational status')) stateByToken[tk] = parseInt(i.lastvalue, 10);
      else if (i.name.includes(': Bits received')) rxByToken[tk] = parseFloat(i.lastvalue);
    });

    // Identificar quais Tu10x existem na config do router da agência
    // (funciona mesmo com agência DOWN: os itens existem na config com lastclock=0)
    const agencyTunnels = new Set();
    agencyTuItems.forEach(function(item) {
      const m = item.name.match(/^Interface\s+(Tu10\d+)/);
      if (m) agencyTunnels.add(m[1]);
    });

    render(el, stateByToken, rxByToken, agencyTunnels, hostVar);
  }

  function render(el, stateByToken, rxByToken, agencyTunnels, hostVar) {
    const hasFilter = agencyTunnels.size > 0;

    const relevant = hasFilter
      ? CFG.providers.filter(p => agencyTunnels.has(p.tu))
      : CFG.providers;
    const others = hasFilter
      ? CFG.providers.filter(p => !agencyTunnels.has(p.tu))
      : [];

    // ── card completo (operadoras relevantes) ───────────────────────────────
    function fullCard(p) {
      const st = stateByToken[p.transport];
      const up = st === 1, down = st === 2;
      const rx = rxByToken[p.tu];
      const accent = down ? 'var(--bpc-crit)' : up ? 'var(--bpc-ok)' : 'var(--bpc-mute)';

      const pill = down
        ? '<span class="bpc-pill down">TRANSPORTE DOWN</span>'
        : up
          ? '<span class="bpc-pill ok">Transporte UP</span>'
          : '<span class="bpc-pill warn">Sem dados</span>';

      const stateClass = down ? 'state-down' : up ? 'state-ok' : 'state-warn';

      return `<div class="bpc bpc-card ${stateClass}" style="--card-accent:${accent};flex:1;min-width:118px;display:flex;flex-direction:column;gap:7px;padding:11px 12px 10px">
        <div style="font-size:.92rem;font-weight:700;color:#E6EDF3;line-height:1">${p.name}</div>
        ${pill}
        <div class="bpc-flex" style="justify-content:space-between;align-items:flex-end;margin-top:2px">
          <div class="bpc-flex-col bpc-gap-4">
            <span class="bpc-value-sm bpc-info">${fmtBps(rx)}</span>
            <span class="bpc-label">Pulso (rx ${p.tu})</span>
          </div>
        </div>
      </div>`;
    }

    // ── pill compacto (outras operadoras) ──────────────────────────────────
    function compactPill(p) {
      const st = stateByToken[p.transport];
      const up = st === 1, down = st === 2;
      const bg    = down ? 'rgba(248,81,73,.12)' : up ? 'rgba(34,197,94,.08)' : 'rgba(255,255,255,.05)';
      const color = down ? '#f85149' : up ? '#22C55E' : '#64748B';
      const dot   = down ? '●' : up ? '●' : '○';
      const label = down ? 'DOWN' : up ? 'UP' : '—';

      return `<div style="display:inline-flex;align-items:center;gap:5px;padding:4px 9px;background:${bg};border-radius:4px;border:1px solid rgba(255,255,255,0.06)">
        <span style="color:${color};font-size:9px">${dot}</span>
        <span style="font-size:11px;font-weight:600;color:#94A3B8">${p.name}</span>
        <span style="font-size:10px;color:${color}">${label}</span>
      </div>`;
    }

    // ── HTML final ──────────────────────────────────────────────────────────
    let html = `<div class="bpc" style="display:flex;flex-direction:column;gap:9px">
      <div class="bpc-flex" style="justify-content:space-between;align-items:baseline">
        <div class="bpc-label" style="font-size:.74rem;color:var(--bpc-cyan)">Operadoras WAN · saúde no hub DMVPN (DC1-RTE-WAN-AG)</div>
        <div class="bpc-label" style="font-size:.6rem">Sobrevive à queda da agência</div>
      </div>`;

    if (hasFilter) {
      const names = relevant.map(p => p.name).join(' · ');
      html += `<div style="font-size:.68rem;color:var(--bpc-cyan);opacity:.75">${hostVar} usa: <b style="color:#E6EDF3">${names}</b></div>`;
    }

    // Operadoras relevantes — cards completos
    html += `<div class="bpc-flex" style="gap:9px;align-items:stretch;flex-wrap:wrap">`;
    html += relevant.map(fullCard).join('');
    html += `</div>`;

    // Outras operadoras — pills compactos
    if (others.length > 0) {
      html += `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
        <span style="font-size:.63rem;color:var(--bpc-mute);margin-right:2px">Outras:</span>`;
      html += others.map(compactPill).join('');
      html += `</div>`;
    }

    // Footer
    html += `<div class="bpc-label" style="font-size:.6rem;color:var(--bpc-mute);line-height:1.5">
      Leitura: operadora desta agência <b>saudável aqui</b> + agência DOWN ⇒ provável problema <b>local</b>.
      Transporte <b>DOWN</b> + várias agências dessa operadora em baixo ⇒ provável <b>outage da operadora</b>.
      Estado por operadora, não por-spoke (confirmação túnel-a-túnel exige Z.15).
    </div>`;

    if (!hasFilter && hostVar) {
      html += `<div style="font-size:.62rem;color:var(--bpc-mute)">Operadoras não identificadas — itens Tu10x ausentes da config do router.</div>`;
    }

    html += `</div>`;
    el.innerHTML = html;
  }

  load();
  U.startRefresh(document.getElementById(CFG.elementId) || document.body, load, CFG.refreshMs);
}


// ── Bootstrap obrigatório (contrato §6) ──────────────────────────────────────
function initWithRetry(attempt) {
  attempt = attempt || 0;
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start);
    return;
  }
  if (attempt > 50) {
    console.error('[BPC] l4-provider-context: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function () { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
