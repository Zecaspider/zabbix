// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N4 · OPERADORAS WAN — SAÚDE NO HUB DMVPN (DC)            l4-provider-ctx  ║
// ║                                                                           ║
// ║  Responde, para uma agência DOWN: "é outage da operadora ou problema     ║
// ║  local?". O hub DMVPN do DC (DC1-RTE-WAN-AG) é monitorizado              ║
// ║  centralmente e SOBREVIVE à queda da agência — por isso dá contexto      ║
// ║  de operadora mesmo quando o router da agência está inalcançável.        ║
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
    if (b == null || isNaN(b)) return '—';
    if (b >= 1e6) return (b / 1e6).toFixed(b >= 1e7 ? 0 : 1) + ' Mb/s';
    if (b >= 1e3) return (b / 1e3).toFixed(0) + ' kb/s';
    return Math.round(b) + ' b/s';
  }

  // Extrai o token entre 'Interface ' e '(' — ex. "Interface Po2.914(...)" → "Po2.914"
  function tokenOf(name) {
    const m = /^Interface\s+([^(]+)\(/.exec(name || '');
    return m ? m[1].trim() : '';
  }
  // Extrai o alias entre parênteses — ex. "...(P2P-WAN-HUB-UNITEL):..." → "P2P-WAN-HUB-UNITEL"
  function aliasOf(name) {
    const m = /\(([^)]*)\)/.exec(name || '');
    return m ? m[1].trim() : '';
  }

  async function load() {
    const el = document.getElementById(CFG.elementId);
    if (!el) return;

    let hub;
    try {
      hub = await rpc('host.get', { filter: { host: [CFG.hubHost] }, output: ['hostid', 'host'] });
    } catch (e) {
      el.innerHTML = U.buildError('Operadoras WAN', 'Falha ao consultar o hub: ' + e.message);
      return;
    }
    if (!hub || !hub.length) {
      el.innerHTML = U.buildError('Operadoras WAN', 'Hub ' + CFG.hubHost + ' não encontrado no Zabbix.');
      return;
    }
    const hubId = hub[0].hostid;

    // Estado de transporte (Operational status) + pulso (Bits received) das interfaces do hub
    const items = await rpc('item.get', {
      hostids: [hubId],
      search: { name: 'Interface' },
      output: ['name', 'lastvalue'],
      filter: { status: 0 },
    });

    const stateByToken = {};   // token → 1 (UP) | 2 (DOWN)
    const rxByToken = {};      // token → bps
    items.forEach(i => {
      const tk = tokenOf(i.name);
      if (!tk) return;
      if (i.name.includes(': Operational status')) stateByToken[tk] = parseInt(i.lastvalue, 10);
      else if (i.name.includes(': Bits received')) rxByToken[tk] = parseFloat(i.lastvalue);
    });

    render(el, stateByToken, rxByToken);
  }

  function render(el, stateByToken, rxByToken) {
    const cells = CFG.providers.map(p => {
      const st = stateByToken[p.transport];           // 1 UP / 2 DOWN / undefined
      const up = st === 1;
      const down = st === 2;
      const rx = rxByToken[p.tu];

      const pill = down
        ? '<span class="bpc-pill down">TRANSPORTE DOWN</span>'
        : up
          ? '<span class="bpc-pill ok">Transporte UP</span>'
          : '<span class="bpc-pill warn">Sem dados</span>';

      const stateClass = down ? 'state-down' : up ? 'state-ok' : 'state-warn';
      const accent = down ? 'var(--bpc-crit)' : up ? 'var(--bpc-ok)' : 'var(--bpc-mute)';

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
    }).join('');

    el.innerHTML = `
      <div class="bpc" style="display:flex;flex-direction:column;gap:9px">
        <div class="bpc-flex" style="justify-content:space-between;align-items:baseline">
          <div class="bpc-label" style="font-size:.74rem;color:var(--bpc-cyan)">Operadoras WAN · saúde no hub DMVPN (DC1-RTE-WAN-AG)</div>
          <div class="bpc-label" style="font-size:.6rem">Sobrevive à queda da agência</div>
        </div>
        <div class="bpc-flex" style="gap:9px;align-items:stretch;flex-wrap:wrap">${cells}</div>
        <div class="bpc-label" style="font-size:.6rem;color:var(--bpc-mute);line-height:1.5">
          Leitura: operadora desta agência <b>saudável aqui</b> + agência DOWN ⇒ provável problema <b>local</b>.
          Transporte <b>DOWN</b> + várias agências dessa operadora em baixo ⇒ provável <b>outage da operadora</b>.
          Estado por operadora, não por-spoke (confirmação túnel-a-túnel da agência exige Z.15).
        </div>
      </div>`;
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
