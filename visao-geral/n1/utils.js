// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — HEADER GLOBAL                                  v8 · BPC-UI   ║
// ║                                                                          ║
// ║  Carregado UMA única vez, no painel de cabeçalho do Grafana.            ║
// ║  Tudo o que é partilhado entre painéis vive aqui.                       ║
// ║                                                                          ║
// ║  ESTRUTURA DO FICHEIRO                                                   ║
// ║  ─────────────────────────────────────────────────────────────────────  ║
// ║  BLOCO 1 — CFG         Toda a configuração editável (cores, labels…)    ║
// ║  BLOCO 2 — CSS         Estilos globais BPC (cards, pills, skeleton…)    ║
// ║  BLOCO 3 — HTML        Render do cabeçalho NOC + relógio                ║
// ║  BLOCO 4 — BOOTSTRAP   Namespace · utils · RPC · guards de versão       ║
// ║                                                                          ║
// ║  REGRA DE OURO: para mudar qualquer coisa visual ou textual,            ║
// ║  editar APENAS o BLOCO 1. Não tocar nos outros blocos.                  ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ══════════════════════════════════════════════════════════════════════════════
//
//  ██████╗ ██╗      ██████╗  ██████╗  ██████╗      ██╗
//  ██╔══██╗██║     ██╔═══██╗██╔════╝ ██╔═══██╗    ███║
//  ██████╔╝██║     ██║   ██║██║      ██║   ██║     ██║
//  ██╔══██╗██║     ██║   ██║██║      ██║   ██║     ██║
//  ██████╔╝███████╗╚██████╔╝╚██████╗ ╚██████╔╝     ██║
//  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝      ╚═╝
//
//  CONFIGURAÇÃO GLOBAL — EDITAR AQUI E APENAS AQUI
//
// ══════════════════════════════════════════════════════════════════════════════

const CFG_META = {
  version: 'v9',
  apiUrl: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api',
};

const CFG_HEADER = {
  logoUrl: '/public/img/bpc-logo.png',
  title: 'BPC',
  nocLabel: 'NOC — VISÃO GERAL',   // ← N1 Portal
  subtitle: 'Banco de Poupança e Crédito · Centro de Operações de Rede',
  backLink: null,
};

const CFG_THEME = {
  navy: '#0B1341',
  navy2: '#0E1A52',
  cyan: '#00B4D8',
  gold: '#F0A500',
  ok: '#22C55E',
  warn: '#d29922',
  crit: '#f85149',
  info: '#00B4D8',
  mute: '#64748B',
};

const CFG_SIZES = {
  header: {
    padding: '8px 22px',
    borderTopW: '2px',
  },
  title: {
    size: '17px',
    letterSpacing: '0.10em',
  },
  subtitle: {
    size: '8px',
  },
  clock: {
    timeSize: '22px',
    dateSize: '8.5px',
  },
  logo: {
    height: 36,
  },
};

const CFG_PULSE = {
  enabled: false,
  borderWidth: '2px',
  borderRadius: '10px',
  intensity: { warn: 0.10, crit: 0.38 },
  speed: { warn: 6.0, crit: 2.2 },
  minSpeedSec: 3.0,
};

const CFG_CLOCK = {
  days: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
  months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
};

const CFG_THRESHOLDS = {
  rttWarnMs: 5,
  lossWarnPct: 5,
};


// ══════════════════════════════════════════════════════════════════════════════
//
//  ██████╗ ██╗      ██████╗  ██████╗  ██████╗     ██████╗
//  ██╔══██╗██║     ██╔═══██╗██╔════╝ ██╔═══██╗    ╚════██╗
//  ██████╔╝██║     ██║   ██║██║      ██║   ██║      ███╔╝
//  ██╔══██╗██║     ██║   ██║██║      ██║   ██║     ██╔══╝
//  ██████╔╝███████╗╚██████╔╝╚██████╗ ╚██████╔╝     ███████╗
//  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝      ╚══════╝
//
//  CSS GLOBAL BPC
//
// ══════════════════════════════════════════════════════════════════════════════

(function injectAllCSS() {

  if (!document.getElementById('bpc-global-css')) {
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-global-css';
    s.textContent = `

      :root,
      .theme-dark,
      [data-theme="dark"] {
        --bpc-navy:  ${T.navy};
        --bpc-navy2: ${T.navy2};
        --bpc-cyan:  ${T.cyan};
        --bpc-gold:  ${T.gold};
        --bpc-ok:    ${T.ok};
        --bpc-warn:  ${T.warn};
        --bpc-crit:  ${T.crit};
        --bpc-info:  ${T.info};
        --bpc-mute:  ${T.mute};
      }

      .bpc { font-family:'Inter','Segoe UI',sans-serif; box-sizing:border-box; }

      .bpc-card {
        background:    rgba(14, 20, 60, 0.55);
        border:        1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding:       13px 15px 11px;
        position:      relative;
        overflow:      hidden;
        transition:    border-color .15s, background .15s;
      }
      .bpc-card::before {
        content:       '';
        position:      absolute;
        top:0; left:0; right:0;
        height:        3px;
        background:    var(--card-accent, var(--bpc-cyan));
        border-radius: 10px 10px 0 0;
        z-index:       1;
      }
      .bpc-card:hover {
        border-color: rgba(0,180,216,0.22);
        background:   rgba(14,20,60,0.70);
      }

      .bpc-card.state-ok   {}
      .bpc-card.state-warn {
        border-color: rgba(240,165,0,0.28);
        border-left:  2px solid rgba(240,165,0,0.70);
      }
      .bpc-card.state-down {
        border-color: rgba(239,68,68,0.28);
        border-left:  2px solid rgba(239,68,68,0.75);
        background:   rgba(239,68,68,0.04);
      }

      .bpc-flex     { display:flex; align-items:center; }
      .bpc-flex-col { display:flex; flex-direction:column; }
      .bpc-gap-4    { gap:4px;  }
      .bpc-gap-8    { gap:8px;  }
      .bpc-gap-12   { gap:12px; }

      .bpc-label    { font-size:.67rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--bpc-mute); }
      .bpc-value-lg { font-size:1.80rem; font-weight:700; color:#E6EDF3; line-height:1; }
      .bpc-value-md { font-size:1.10rem; font-weight:600; color:#E6EDF3; line-height:1; }
      .bpc-value-sm { font-size:.85rem;  font-weight:600; color:#E6EDF3; line-height:1; }

      .bpc-ok   { color:var(--bpc-ok);   }
      .bpc-warn { color:var(--bpc-warn); }
      .bpc-crit { color:var(--bpc-crit); }
      .bpc-info { color:var(--bpc-info); }
      .bpc-mute { color:var(--bpc-mute); }

      .bpc-pill {
        font-size:.65rem; font-weight:700; letter-spacing:.05em;
        text-transform:uppercase; padding:2px 9px;
        border-radius:10px; border:1px solid transparent;
        white-space:nowrap; line-height:1.6;
      }
      .bpc-pill.ok   { background:rgba(34,197,94,0.10);  color:var(--bpc-ok);   border-color:rgba(34,197,94,0.25); }
      .bpc-pill.warn { background:rgba(240,165,0,0.10);  color:var(--bpc-warn); border-color:rgba(240,165,0,0.28); }
      .bpc-pill.down { background:rgba(239,68,68,0.10);  color:var(--bpc-crit); border-color:rgba(239,68,68,0.28);
                       animation:bpc-pulse-pill 1.2s ease-in-out infinite; }
      @keyframes bpc-pulse-pill {
        0%,100% { box-shadow:0 0 0 0   rgba(239,68,68,0.45); }
        50%     { box-shadow:0 0 0 4px rgba(239,68,68,0);    }
      }

      .bpc-skeleton {
        background:      linear-gradient(90deg,rgba(255,255,255,0.04) 25%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 75%);
        background-size: 200% 100%;
        animation:       bpc-shimmer 1.4s infinite;
        border-radius:   4px;
      }
      @keyframes bpc-shimmer {
        0%   { background-position: 200%  0; }
        100% { background-position:-200%  0; }
      }

      .bpc-divider   { width:1px; align-self:stretch; flex-shrink:0; background:rgba(255,255,255,0.07); }
      .bpc-timestamp { font-size:.58rem; color:rgba(255,255,255,0.18); text-align:right; margin-top:4px; }

      .bpc-mini-bar { display:flex; align-items:flex-end; gap:2px; height:22px; margin-top:8px; }
      .bpc-bar-seg  { flex:1; border-radius:2px 2px 0 0; background:var(--card-accent,var(--bpc-cyan));
                      opacity:.45; min-height:2px; transition:opacity .2s; }
      .bpc-card:hover .bpc-bar-seg { opacity:.68; }

      .bpc-error-msg {
        display:flex; align-items:center; gap:6px;
        font-size:.70rem; color:rgba(239,68,68,0.85);
        background:rgba(239,68,68,0.07);
        border-left:2px solid rgba(239,68,68,0.35);
        border-radius:0 5px 5px 0;
        padding:4px 8px; margin-top:6px;
      }

      .bpc-status-bar  { display:flex; align-items:center; gap:8px; padding:4px 0 8px; flex-wrap:wrap; }
      .bpc-status-pill {
        display:flex; align-items:center; gap:5px;
        font-size:.67rem; font-weight:600; letter-spacing:.05em; text-transform:uppercase;
        padding:3px 10px; border-radius:20px; border:1px solid transparent; white-space:nowrap;
      }
      .bpc-status-pill.ok   { background:rgba(34,197,94,0.08);  color:var(--bpc-ok);   border-color:rgba(34,197,94,0.20); }
      .bpc-status-pill.warn { background:rgba(240,165,0,0.08);  color:var(--bpc-warn); border-color:rgba(240,165,0,0.22); }
      .bpc-status-pill.crit { background:rgba(239,68,68,0.08);  color:var(--bpc-crit); border-color:rgba(239,68,68,0.22); }
      .bpc-status-dot  { width:6px; height:6px; border-radius:50%; background:currentColor; flex-shrink:0; }
      .bpc-status-sep  { width:1px; height:14px; background:rgba(255,255,255,0.12); margin:0 2px; flex-shrink:0; }

    `;
    document.head.appendChild(s);
    if (window.BPC?.log) BPC.log('CSS global injectado (' + CFG_META.version + ')');
  }

  if (!document.getElementById('bpc-pulse-css')) {
    const p = CFG_PULSE;
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-pulse-css';

    if (!p.enabled) {
      s.textContent = [
        '.bpc-card.state-ok   {}',
        '.bpc-card.state-warn { border-color:rgba(240,165,0,0.30); border-left:2px solid rgba(240,165,0,0.70); }',
        '.bpc-card.state-down { border-color:rgba(239,68,68,0.30); border-left:2px solid rgba(239,68,68,0.75); background:rgba(239,68,68,0.04); }',
      ].join('\n');
      document.head.appendChild(s);
    } else {
      const hex = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
      const wS = Math.max(p.minSpeedSec, p.speed.warn) + 's';
      const cS = Math.max(p.minSpeedSec, p.speed.crit) + 's';
      s.textContent = `
        @keyframes bpc-warn {
          0%,100%{ border-color:${T.warn}44; box-shadow:0 0 0 0 ${T.warn}${hex(p.intensity.warn)}; }
          50%    { border-color:${T.warn};   box-shadow:0 0 10px 2px ${T.warn}${hex(p.intensity.warn)}; }
        }
        @keyframes bpc-down {
          0%,100%{ border-color:${T.crit}55; box-shadow:0 0 0 0 ${T.crit}${hex(p.intensity.crit)}; background:rgba(239,68,68,0.03); }
          50%    { border-color:${T.crit};   box-shadow:0 0 14px 3px ${T.crit}${hex(p.intensity.crit)}; background:rgba(239,68,68,0.07); }
        }
        .bpc-card.state-warn{ border:${p.borderWidth} solid ${T.warn}60; border-radius:${p.borderRadius}; animation:bpc-warn ${wS} ease-in-out infinite; }
        .bpc-card.state-down{ border:${p.borderWidth} solid ${T.crit}70; border-radius:${p.borderRadius}; animation:bpc-down ${cS} ease-in-out infinite; }
      `;
      document.head.appendChild(s);
    }
  }

  if (!document.getElementById('bpc-header-css')) {
    const Z = CFG_SIZES;
    const s = document.createElement('style');
    s.id = 'bpc-header-css';
    s.textContent = `

      .bpc-noc-hdr {
        display:       flex;
        align-items:   center;
        gap:           16px;
        background:    linear-gradient(90deg, ${CFG_THEME.navy} 0%, ${CFG_THEME.navy2} 50%, ${CFG_THEME.navy} 100%);
        border:        1px solid rgba(0,180,216,0.14);
        border-top:    ${Z.header.borderTopW} solid rgba(0,180,216,0.40);
        border-radius: 10px;
        padding:       ${Z.header.padding};
        height:        100%;
        box-sizing:    border-box;
        font-family:   'Inter','Segoe UI',sans-serif;
      }

      .bpc-noc-logo          { height:${Z.logo.height}px; flex-shrink:0; }
      .bpc-noc-logo-fallback {
        height:${Z.logo.height}px; width:52px; flex-shrink:0;
        background:rgba(255,255,255,0.04);
        border:1px dashed rgba(255,255,255,0.12);
        border-radius:7px; display:flex; align-items:center;
        justify-content:center; font-size:10px; font-weight:800;
        color:rgba(255,255,255,0.28); letter-spacing:1px;
      }

      .bpc-noc-center { flex:1; text-align:center; }
      .bpc-noc-title  {
        font-size:${Z.title.size}; font-weight:800; letter-spacing:${Z.title.letterSpacing};
        text-transform:uppercase; color:#fff; line-height:1;
      }
      .bpc-noc-title em { color:var(--bpc-gold, ${CFG_THEME.gold}); font-style:normal; }
      .bpc-noc-sub    {
        font-size:${Z.subtitle.size}; color:rgba(255,255,255,0.22);
        letter-spacing:.14em; text-transform:uppercase; margin-top:4px;
      }

      .bpc-noc-right { text-align:right; flex-shrink:0; }
      .bpc-noc-time  {
        font-size:${Z.clock.timeSize}; font-weight:800; color:var(--bpc-cyan, ${CFG_THEME.cyan});
        letter-spacing:3px; display:block;
        font-variant-numeric:tabular-nums; line-height:1;
      }
      .bpc-noc-date  {
        font-size:${Z.clock.dateSize}; color:rgba(255,255,255,0.22);
        margin-top:3px; text-transform:capitalize;
      }

    `;
    document.head.appendChild(s);
    if (window.BPC?.log) BPC.log('CSS header injectado (' + CFG_META.version + ')');
  }

})();


// ══════════════════════════════════════════════════════════════════════════════
//  BLOCO 3 — HTML DO CABEÇALHO NOC
// ══════════════════════════════════════════════════════════════════════════════

(function initHeader() {

  function renderClock() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const tEl = document.getElementById('bpc-clock-time');
    const dEl = document.getElementById('bpc-clock-date');
    if (!tEl || !dEl) return;
    tEl.textContent =
      pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    dEl.textContent =
      CFG_CLOCK.days[now.getDay()] + ', ' +
      now.getDate() + ' de ' +
      CFG_CLOCK.months[now.getMonth()] + ' de ' +
      now.getFullYear();
  }

  function renderHeader(el) {
    const C = CFG_HEADER;
    const Z = CFG_SIZES;

    const logoHTML = C.logoUrl
      ? `<img src="${C.logoUrl}"
              height="${Z.logo.height}"
              class="bpc-noc-logo"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="bpc-noc-logo-fallback" style="display:none">${C.title}</div>`
      : `<div class="bpc-noc-logo-fallback">${C.title}</div>`;

    const backHTML = C.backLink
      ? `<a href="${C.backLink.url}" style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:4px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.55);font-size:.78rem;font-weight:600;letter-spacing:.04em;text-decoration:none;border:1px solid rgba(255,255,255,0.10);transition:background .15s" onmouseover="this.style.background='rgba(255,255,255,0.13)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">${C.backLink.label}</a>`
      : '';

    el.innerHTML = `
      <div class="bpc-noc-hdr">

        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:10px">
            ${logoHTML}
          </div>
          ${backHTML}
        </div>

        <div class="bpc-noc-center">
          <div class="bpc-noc-title">
            ${C.title} &nbsp;|&nbsp; <em>${C.nocLabel}</em>
          </div>
          ${C.subtitle ? `<div class="bpc-noc-sub">${C.subtitle}</div>` : ''}
        </div>

        <div class="bpc-noc-right">
          <span class="bpc-noc-time" id="bpc-clock-time">--:--:--</span>
          <div  class="bpc-noc-date" id="bpc-clock-date">…</div>
        </div>

      </div>`;

    if (window._bpc_clock_interval) clearInterval(window._bpc_clock_interval);
    renderClock();
    window._bpc_clock_interval = setInterval(renderClock, 1000);

    if (window.BPC?.log) BPC.log('Header renderizado (' + CFG_META.version + ')');
  }

  const t0 = Date.now();
  const poll = setInterval(() => {
    const el = document.getElementById('bpc-header-root');
    if (el) {
      clearInterval(poll);
      renderHeader(el);
      return;
    }
    if (Date.now() - t0 > 10000) {
      clearInterval(poll);
      console.warn('[BPC] Header: #bpc-header-root não encontrado após 10s');
    }
  }, 50);

})();


// ══════════════════════════════════════════════════════════════════════════════
//  BLOCO 4 — BOOTSTRAP
// ══════════════════════════════════════════════════════════════════════════════

(function bootstrap() {

  const VERSION = CFG_META.version;

  if (window.BPC && window.BPC.version === VERSION) {
    const ok =
      !!document.getElementById('bpc-global-css') &&
      typeof (window.BPC.utils && window.BPC.utils.waitForElement) === 'function' &&
      typeof window.BPC.rpc === 'function' &&
      typeof window.BPC.log === 'function';
    if (ok) return;
    if (window.BPC._initPending) return;
    console.warn('[BPC] Estado parcial — reinicializando (' + VERSION + ')');
    window.BPC._ready = false;
    window.BPC.rpc = null;
  }
  if (!window.BPC) window.BPC = {};
  window.BPC._initPending = true;

  window.BPC = window.BPC || {};
  Object.assign(window.BPC, {
    version: VERSION,
    rpc: null,
    _ready: false,
    _callbacks: window.BPC._callbacks || [],

    onReady(cb) {
      if (this._ready && typeof this.rpc === 'function') {
        try { cb(this.rpc); } catch (e) { console.error('[BPC] onReady:', e); }
      } else {
        this._callbacks.push(cb);
      }
    },

    setReady(rpcFn) {
      this.rpc = rpcFn;
      this._ready = true;
      this._initPending = false;
      BPC.log('Runtime pronto');
      this._callbacks.splice(0).forEach(cb => {
        try { cb(rpcFn); } catch (e) { console.error('[BPC] setReady:', e); }
      });
    },
  });

  window.BPC.log = function (msg, level) {
    const p = '[BPC]';
    if (level === 'error') console.error(p, msg);
    else if (level === 'warn') console.warn(p, msg);
    else console.log(p, msg);
  };

  const BPC = window.BPC;

  if (typeof window.waitForBPC !== 'function' || window.waitForBPC._v !== VERSION) {
    window.waitForBPC = function (cb) {
      const t0 = Date.now();
      const poll = setInterval(() => {
        if (
          window.BPC?._ready &&
          typeof window.BPC.rpc === 'function' &&
          typeof window.BPC.utils?.waitForElement === 'function' &&
          typeof window.BPC.log === 'function'
        ) {
          clearInterval(poll);
          try { cb(window.BPC.rpc); } catch (e) { console.error('[BPC] waitForBPC:', e); }
          return;
        }
        if (Date.now() - t0 > 15000) {
          clearInterval(poll);
          console.error('[BPC] waitForBPC: timeout 15s');
          document.querySelectorAll('[id^="bpc-card-"]').forEach(el => {
            if (!el.innerHTML.trim())
              el.innerHTML = '<div style="color:#EF4444;padding:12px;font-size:.75rem">⚠ Header não inicializou</div>';
          });
        }
      }, 30);
    };
    window.waitForBPC._v = VERSION;
    BPC.log('waitForBPC registado (' + VERSION + ')');
  }

  window.BPC.utils = {

    waitForElement(id, cb, ms) {
      const t0 = Date.now();
      const p = setInterval(() => {
        const el = document.getElementById(id);
        if (el) { clearInterval(p); cb(el); return; }
        if (Date.now() - t0 > (ms || 10000)) { clearInterval(p); BPC.log('waitForElement: timeout #' + id, 'warn'); }
      }, 50);
    },

    startRefresh(el, fn, ms) {
      if (el._bpcTimer) clearInterval(el._bpcTimer);
      el._bpcTimer = setInterval(fn, ms);
    },

    stateClass(s) { return { ok: 'bpc-ok', warn: 'bpc-warn', down: 'bpc-crit' }[s] || 'bpc-mute'; },
    stateAccent(s) { const C = window.BPC.theme; return { ok: C.ok, warn: C.warn, down: C.crit }[s] || C.mute; },
    stateLabel(s) { return { ok: 'OK', warn: 'Degradado', down: 'Down' }[s] || '—'; },
    statePillClass(s) { return { ok: 'ok', warn: 'warn', down: 'down' }[s] || 'ok'; },
    stateAbove(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v >= t.crit) return 'down'; if (v >= t.warn) return 'warn'; return 'ok'; },
    stateBelow(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v <= t.crit) return 'down'; if (v <= t.warn) return 'warn'; return 'ok'; },

    fmtBytes(b) { if (b == null || isNaN(b) || b < 0) return '—'; if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'; if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'; if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'; if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB'; return b + ' B'; },
    fmtMb(mb) { if (mb == null || isNaN(mb) || mb < 0) return '—'; if (mb >= 1048576) return (mb / 1048576).toFixed(2) + ' TB'; if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'; return mb + ' MB'; },
    fmtMs(ms) { if (ms == null || isNaN(ms) || ms < 0) return '—'; if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s'; return ms.toFixed(2) + ' ms'; },
    fmtPct(v, d) { if (v == null || isNaN(v)) return '—'; return v.toFixed(d ?? 1) + '%'; },
    fmtTime(u) { if (!u) return '—'; return new Date(u * 1000).toLocaleTimeString('pt-PT'); },

    async fetchICMP(rpc, groupid, thr) {
      const rttWarn = thr?.rttWarnMs || CFG_THRESHOLDS.rttWarnMs;
      const lossWarn = thr?.lossWarnPct || CFG_THRESHOLDS.lossWarnPct;
      const allItems = await rpc('item.get', {
        groupids: [groupid],
        search: { key_: 'icmpping' },
        filter: { status: 0 },
        output: ['hostid', 'key_', 'lastvalue', 'itemid'],
      });
      const byHost = {};
      allItems.forEach(i => {
        if (!byHost[i.hostid]) byHost[i.hostid] = { up: null, rtt: 0, loss: 0, rttItemId: null };
        const h = byHost[i.hostid];
        if (i.key_ === 'icmpping') h.up = i.lastvalue === '1';
        if (i.key_.startsWith('icmppingsec')) { h.rtt = parseFloat(i.lastvalue) * 1000; h.rttItemId = i.itemid; }
        if (i.key_.startsWith('icmppingloss')) h.loss = parseFloat(i.lastvalue);
      });
      const hostIds = Object.keys(byHost);
      const total = hostIds.length;
      if (!total) return { total: 0, down: 0, warn: 0, ok: 0, rtt: 0, loss: 0, sparkData: [] };
      const downSet = new Set(), warnSet = new Set();
      hostIds.forEach(id => {
        const h = byHost[id];
        if (h.up === false || h.up === null) downSet.add(id);
        else if (h.rtt > rttWarn || h.loss > lossWarn) warnSet.add(id);
      });
      const upIds = hostIds.filter(id => !downSet.has(id));
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      return { total, down: downSet.size, warn: warnSet.size, ok: Math.max(0, total - downSet.size - warnSet.size), rtt: avg(upIds.map(id => byHost[id].rtt).filter(v => v > 0)), loss: avg(upIds.map(id => byHost[id].loss).filter(v => v > 0)), sparkData: [] };
    },

    buildSparkline(data, color) {
      if (!data || data.length < 2) return '';
      const W = 140, H = 32, mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1, step = W / (data.length - 1);
      const pts = data.map((v, i) => (i * step).toFixed(1) + ',' + (H - ((v - mn) / rng) * (H - 4) - 2).toFixed(1)).join(' ');
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color || 'var(--bpc-cyan)'}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.80"/></svg>`;
    },

    buildMiniBar(data, color) {
      if (!data || !data.length) return '';
      const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
      const st = color ? `background:${color};` : '';
      return '<div class="bpc-mini-bar">'
        + data.map(v => `<div class="bpc-bar-seg" style="height:${Math.max(8, Math.round(((v - mn) / rng) * 100))}%;${st}"></div>`).join('')
        + '</div>';
    },

    buildLayerCard(cfg, d) {
      const u = window.BPC.utils;
      const status = d.down > 0 ? 'down' : d.warn > 0 ? 'warn' : 'ok';
      const accent = cfg.color || u.stateAccent(status);
      const avail = d.total > 0 ? Math.round((d.ok / d.total) * 100) : 0;
      const aC = avail === 100 ? 'bpc-ok' : avail >= 80 ? 'bpc-warn' : 'bpc-crit';
      const barData = (d.sparkData && d.sparkData.length > 1) ? d.sparkData : Array.from({ length: 14 }, () => Math.random() * 100);
      const bar = u.buildMiniBar(barData, accent);
      const rttLabel = d.down === d.total ? '—' : u.fmtMs(d.rtt);
      const lossLabel = d.down === d.total ? '—' : u.fmtPct(d.loss);
      const lossClass = d.loss > 5 ? 'bpc-warn' : 'bpc-ok';
      return `<a href="/d/${cfg.dashUid}" style="text-decoration:none;display:block;height:100%">
        <div class="bpc bpc-card state-${status}" style="--card-accent:${accent};height:100%;cursor:pointer;display:flex;flex-direction:column;gap:8px;">
          <div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="bpc-label" style="margin-bottom:2px">NOC · Compute</div>
              <div style="font-size:.90rem;font-weight:700;color:#E6EDF3;line-height:1.2">${cfg.label}</div>
            </div>
            <span class="bpc-pill ${u.statePillClass(status)}">${u.stateLabel(status)}</span>
          </div>
          <div class="bpc-flex bpc-gap-12">
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-lg">${d.total}</span><span class="bpc-label">Total</span></div>
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-crit">${d.down}</span><span class="bpc-label">Down</span></div>
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-warn">${d.warn}</span><span class="bpc-label">Degradado</span></div>
            <div class="bpc-flex-col bpc-gap-4" style="margin-left:auto;text-align:right">
              <span class="bpc-value-md ${aC}">${avail}%</span>
              <span class="bpc-label">Disponib.</span>
            </div>
          </div>
          <div class="bpc-flex bpc-gap-12">
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm bpc-info">${rttLabel}</span><span class="bpc-label">RTT médio</span></div>
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm ${lossClass}">${lossLabel}</span><span class="bpc-label">Loss médio</span></div>
          </div>
          ${bar}
          <div class="bpc-flex" style="justify-content:space-between;margin-top:auto;padding-top:4px">
            <span style="font-size:.68rem;color:var(--bpc-cyan)">Ver detalhe →</span>
            <span class="bpc-timestamp">Grupo ${cfg.groupid || '—'}</span>
          </div>
        </div>
      </a>`;
    },

    buildError(label, message, color) {
      const a = color || 'var(--bpc-crit)';
      return `<div class="bpc bpc-card state-down" style="--card-accent:${a};height:100%">
        ${label ? `<div class="bpc-label" style="color:${a};margin-bottom:6px">${label}</div>` : ''}
        <div class="bpc-error-msg">⚠ ${message}</div>
      </div>`;
    },

    buildSkeleton(color) {
      const a = color || 'var(--bpc-mute)';
      return `<div class="bpc bpc-card" style="--card-accent:${a};height:100%;display:flex;flex-direction:column;gap:10px">
        <div class="bpc-skeleton" style="height:10px;width:45%"></div>
        <div class="bpc-skeleton" style="height:26px;width:55%"></div>
        <div class="bpc-skeleton" style="height:11px;width:75%"></div>
        <div class="bpc-skeleton" style="height:11px;width:40%;margin-top:auto"></div>
      </div>`;
    },

    buildStatusBar(counts) {
      const { ok = 0, warn = 0, crit = 0, label = '' } = counts;
      const ts = label ? `<span style="font-size:.67rem;color:var(--bpc-mute);margin-left:auto">${label}</span>` : '';
      return `<div class="bpc-status-bar">
        <span class="bpc-status-pill ok">  <span class="bpc-status-dot"></span>OK: ${ok}</span>
        <span class="bpc-status-pill warn"><span class="bpc-status-dot"></span>Degradado: ${warn}</span>
        <span class="bpc-status-pill crit"><span class="bpc-status-dot"></span>Crítico: ${crit}</span>
        <span class="bpc-status-sep"></span>${ts}
      </div>`;
    },

  };

  BPC.log('utils inicializado (' + VERSION + ')');

  window.BPC.setReady(async function rpc(method, params) {
    BPC.log('rpc → ' + method);
    const res = await fetch(CFG_META.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-grafana-org-id': '1' },
      credentials: 'include',
      body: JSON.stringify({ method, params }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error.data || json.error.message);
    return json.result;
  });

})();


// ══════════════════════════════════════════════════════════════════════════════
//  BLOCO 5 — CONTRATO §5.1
// ══════════════════════════════════════════════════════════════════════════════

(function contractGlobals() {

  window.BPC = window.BPC || {};

  window.BPC.THEME = {
    colorOk:   CFG_THEME.ok,
    colorWarn: CFG_THEME.warn,
    colorCrit: CFG_THEME.crit,
    colorInfo: CFG_THEME.info,
    colorMute: CFG_THEME.mute,
    colorDis:  CFG_THEME.mute,
    navy: CFG_THEME.navy, navy2: CFG_THEME.navy2,
    cyan: CFG_THEME.cyan, gold: CFG_THEME.gold,
    fontBody:    "'Inter','Segoe UI',sans-serif",
    szLg:        '1.80rem',
    szMd:        '1.10rem',
    szSm:        '0.85rem',
    szLabel:     '0.67rem',
    cardPadding: '13px 15px 11px',
  };

  window.BPC.theme = CFG_THEME;

  window.BPC.state = {
    metric: function (value, thr, dir) {
      dir = dir || 'above';
      if (value == null || isNaN(value) || !thr) return 'ok';
      if (dir === 'below') {
        if (value <= thr.crit) return 'crit';
        if (value <= thr.warn) return 'warn';
        return 'ok';
      }
      if (value >= thr.crit) return 'crit';
      if (value >= thr.warn) return 'warn';
      return 'ok';
    },

    worst: function (states) {
      var order = { down: 4, crit: 3, warn: 2, ok: 1, mute: 0 };
      var w = 'ok', wv = 1;
      (states || []).forEach(function (s) {
        var v = order[s] != null ? order[s] : 0;
        if (v > wv) { wv = v; w = s; }
      });
      return w;
    },

    host: function (metrics) {
      if (!metrics) return 'ok';
      if (metrics.reachable === false) return 'down';
      var vals = [];
      Object.keys(metrics).forEach(function (k) {
        if (k !== 'reachable') vals.push(metrics[k]);
      });
      return window.BPC.state.worst(vals);
    },

    color: function (state) {
      var T = window.BPC.THEME;
      var map = {
        ok: T.colorOk, warn: T.colorWarn, crit: T.colorCrit,
        down: T.colorCrit, info: T.colorInfo, mute: T.colorMute,
      };
      return map[state] || T.colorMute;
    },
  };

  window.BPC_CHARTS = {
    gaugeSemi: function (value, opts) {
      opts = opts || {};
      var max = opts.max || 100;
      var color = opts.color || 'var(--bpc-cyan)';
      var size = opts.size || 90;
      var v = Math.max(0, Math.min(max, value || 0));
      var r = size / 2 - 8;
      var cx = size / 2, cy = size / 2;
      var len = Math.PI * r;
      var dash = len * (v / max);
      var arc = 'M8 ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (size - 8) + ' ' + cy;
      var label = opts.label != null ? opts.label : Math.round(v) + (opts.unit || '%');
      return '<svg width="' + size + '" height="' + (size / 2 + 12) + '" viewBox="0 0 ' + size + ' ' + (size / 2 + 12) + '">'
        + '<path d="' + arc + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linecap="round"/>'
        + '<path d="' + arc + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + len.toFixed(1) + '"/>'
        + '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" fill="#E6EDF3" font-size="' + (size * 0.20).toFixed(0) + '" font-weight="700">' + label + '</text>'
        + '</svg>';
    },
    sparkline: function (data, color) { return window.BPC.utils.buildSparkline(data, color); },
    pbar: function (pct, color) {
      pct = Math.max(0, Math.min(100, pct || 0));
      color = color || 'var(--bpc-cyan)';
      return '<div style="background:rgba(255,255,255,0.08);border-radius:4px;height:6px;width:100%;overflow:hidden">'
        + '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px"></div></div>';
    },
    dot: function (state) {
      var c = window.BPC.state.color(state);
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + '"></span>';
    },
  };

  window.BPC_SHARED = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    ts: function (ms) { return ms ? new Date(ms).toLocaleTimeString('pt-PT') : '—'; },
    cls: function (state) {
      return { ok: 'bpc-ok', warn: 'bpc-warn', crit: 'bpc-crit', down: 'bpc-crit', info: 'bpc-info' }[state] || 'bpc-mute';
    },
    divider: function () { return '<div class="bpc-divider"></div>'; },
    pbar: function (pct, color) { return window.BPC_CHARTS.pbar(pct, color); },
    fmtNum: function (n, d) {
      if (n == null || isNaN(n)) return '—';
      return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    },
    fmtTb: function (bytes) {
      if (bytes == null || isNaN(bytes)) return '—';
      if (bytes >= 1e12) return (bytes / 1e12).toFixed(2) + ' TB';
      if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
      return (bytes / 1e6).toFixed(0) + ' MB';
    },
    worstState: function (states) { return window.BPC.state.worst(states); },
    severityToState: function (sev, critPriority) {
      sev = parseInt(sev, 10) || 0;
      var cp = critPriority || 4;
      if (sev >= cp) return 'crit';
      if (sev >= 2) return 'warn';
      return 'ok';
    },
    stateAbove: function (v, t) { return window.BPC.state.metric(v, t, 'above'); },
    stateBelow: function (v, t) { return window.BPC.state.metric(v, t, 'below'); },
    toFloat: function (v) { var n = parseFloat(v); return isNaN(n) ? null : n; },
  };

  if (window.BPC && window.BPC.log) {
    window.BPC.log('Contrato §5.1 exposto: THEME · state · BPC_CHARTS · BPC_SHARED (' + CFG_META.version + ')');
  }

})();
