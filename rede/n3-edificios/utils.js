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
//  Contém:
//    CFG_META    → versão, ambiente, URL da API Zabbix
//    CFG_HEADER  → logótipo, título, subtítulo, labels
//    CFG_THEME   → toda a paleta de cores BPC
//    CFG_SIZES   → tipografia e espaçamentos do header
//    CFG_PULSE   → animações de estado dos cards
//    CFG_CLOCK   → idioma do relógio (dias, meses)
//    CFG_THRESHOLDS → limites de alerta ICMP por defeito
//
// ══════════════════════════════════════════════════════════════════════════════

// ── CFG_META — Identificação e infra ─────────────────────────────────────────
//
//  version   → identificador interno do runtime; incrementar em alterações
//              incompatíveis (força re-inicialização do namespace BPC)
//  apiUrl    → endpoint do proxy Grafana para a API Zabbix
//              Alterar se o IP/porta do Grafana mudar

const CFG_META = {
  version: 'v9',   // v9 — contrato §5.1 completo: BPC.THEME, BPC_SHARED, BPC_CHARTS, BPC.state (BLOCO 5)
  apiUrl: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api',
};


// ── CFG_HEADER — Identidade visual do cabeçalho ───────────────────────────────
//
//  logoUrl   → caminho para a imagem do logótipo (relativo ao Grafana public/)
//              '' → mostra o fallback textual com CFG_HEADER.title
//  title     → texto principal (aparece a branco)
//  nocLabel  → palavra destacada a dourado após o separador  |
//  subtitle  → linha pequena por baixo do título
//              '' → omite a linha de subtítulo

const CFG_HEADER = {
  logoUrl: '/public/img/bpc-logo.png',
  title: 'BPC-Observe',
  nocLabel: 'REDE - EDIFÍCIOS - NÍVEL 3',   // ← TEMPLATE: cada dashboard edita (ex.: 'SERVIDORES VIRTUAIS - NIVEL 2')
  subtitle: 'Banco de Poupança e Crédito · Centro de Operações de Rede',
  backLink: null,                // ← N4: { url: '/d/<uid>/<slug>', label: '← N3 …' }
};


// ── CFG_THEME — Paleta de cores BPC ──────────────────────────────────────────
//
//  navy   → fundo principal do header e cards (azul-marinho escuro)
//  navy2  → fundo secundário / gradiente do header
//  cyan   → accent primário: relógio, links, métricas informativas
//  gold   → accent dourado: palavra "NOC", destaques especiais
//  ok     → estado saudável (verde) — §6 modelo de estado
//  warn   → estado de aviso (âmbar) — §6: #d29922 (decoplado do gold; ver nota)
//  crit   → estado crítico / down (vermelho) — §6: #f85149
//  info   → métrica informativa (igual ao cyan)
//  mute   → texto e labels secundários (cinzento azulado)
//
//  NOTA v9: as cores de estado (ok/warn/crit) seguem o catálogo canónico do
//  modelo de estado (engenharia §6/§6.1), para que BPC.state.color() e o CSS
//  .bpc-* sejam UMA única fonte de verdade. O `gold` (#F0A500) mantém-se como
//  accent de marca (palavra destacada no header), agora distinto do `warn`.

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


// ── CFG_SIZES — Dimensões e tipografia ───────────────────────────────────────
//
//  Controla os tamanhos de texto e espaçamentos do header.
//  Os cards usam as classes bpc-value-lg/md/sm definidas no BLOCO 2 (CSS).
//
//  header.padding       → padding vertical do wrapper (px) — manter ≤12 para
//                         não expandir o painel Grafana
//  header.borderTopW    → espessura da barra superior decorativa
//  title.size           → tamanho do título principal "BPC | NOC"
//  title.letterSpacing  → espaçamento entre letras do título (em)
//  subtitle.size        → tamanho da linha de subtítulo
//  clock.timeSize       → tamanho dos dígitos do relógio
//  clock.dateSize       → tamanho da linha de data
//  logo.height          → altura do logótipo em píxeis

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
    height: 36,   // px
  },
};


// ── CFG_PULSE — Animações de estado dos cards ─────────────────────────────────
//
//  enabled:false → bordas estáticas coloridas (recomendado para ecrã NOC 24h,
//                  reduz distracção e carga GPU)
//  enabled:true  → borda + glow pulsante por estado
//
//  borderWidth   → espessura da borda dos cards em modo animado
//  borderRadius  → raio dos cantos em modo animado
//  intensity     → opacidade máxima do glow { warn, crit }  (0.0 – 1.0)
//                  0 = sem glow, apenas borda
//  speed         → período da animação em segundos { warn, crit }
//  minSpeedSec   → velocidade mínima (evita animações demasiado rápidas)

const CFG_PULSE = {
  enabled: false,
  borderWidth: '2px',
  borderRadius: '10px',
  intensity: { warn: 0.10, crit: 0.38 },
  speed: { warn: 6.0, crit: 2.2 },
  minSpeedSec: 3.0,
};


// ── CFG_CLOCK — Localização do relógio ───────────────────────────────────────
//
//  Substituir arrays por traduções para outro idioma se necessário.
//  Índice 0 = Domingo (padrão JS).

const CFG_CLOCK = {
  days: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
  months: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
};


// ── CFG_THRESHOLDS — Limites de alerta ICMP por defeito ──────────────────────
//
//  Usados pelo utilitário fetchICMP quando o caller não passa thresholds.
//  rttWarnMs    → RTT acima deste valor (ms) marca o host como "degradado"
//  lossWarnPct  → packet loss acima deste valor (%) marca como "degradado"
//  Valores alinhados com os macros Zabbix nos templates Cisco IOS by SNMP:
//    {$ICMP_RESPONSE_TIME_WARN} = 0.15 s = 150 ms
//    {$ICMP_LOSS_WARN}          = 20 %

const CFG_THRESHOLDS = {
  rttWarnMs: 150,
  lossWarnPct: 20,
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
//  Injectado UMA vez em <head>. Não editar directamente —
//  os valores vêm do BLOCO 1 (CFG_THEME, CFG_PULSE).
//
//  Contém:
//    • Variáveis CSS --bpc-* (sincronizadas com CFG_THEME)
//    • Base .bpc
//    • Cards (.bpc-card, ::before, estados, hover)
//    • Layout helpers (.bpc-flex, .bpc-flex-col, .bpc-gap-*)
//    • Tipografia (.bpc-label, .bpc-value-lg/md/sm)
//    • Cores de estado (.bpc-ok, .bpc-warn, .bpc-crit, .bpc-info, .bpc-mute)
//    • Pills (.bpc-pill ok/warn/down)
//    • Skeleton loader (.bpc-skeleton)
//    • Auxiliares (divider, timestamp, mini-bar, erro inline, status-bar)
//    • CSS de pulse/bordas de estado (gerado a partir de CFG_PULSE)
//    • CSS específico do header NOC (.bpc-noc-hdr, logo, título, relógio)
//
// ══════════════════════════════════════════════════════════════════════════════

(function injectAllCSS() {

  // ── CSS Global (cards, pills, layout, etc.) ───────────────────────────────

  if (!document.getElementById('bpc-global-css')) {
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-global-css';
    s.textContent = `

      /* ── Variáveis BPC ───────────────────────────────────────────────
         Definidas em :root E .theme-dark para cobrir os dois contextos
         que o Grafana pode aplicar consoante o tema seleccionado.      */
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

      /* ── Base ────────────────────────────────────────────────────────
         Fonte e box-model aplicados a todos os elementos BPC.          */
      .bpc { font-family:'Inter','Segoe UI',sans-serif; box-sizing:border-box; }

      /* ── Card ────────────────────────────────────────────────────────
         Contentor principal de cada métrica.
         --card-accent → cor da barra de topo; definir inline em cada card:
           <div class="bpc-card" style="--card-accent:#22C55E">
         O ::before gera a barra de 3px colorida no topo do card.       */
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

      /* ── Estados dos cards ───────────────────────────────────────────
         .state-ok  → sem override (herda o estilo base do card)
         .state-warn→ borda esquerda âmbar
         .state-down→ borda esquerda vermelha + fundo levemente vermelho */
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

      /* ── Layout helpers ──────────────────────────────────────────────
         Utilitários de flexbox para compor o interior dos cards.       */
      .bpc-flex     { display:flex; align-items:center; }
      .bpc-flex-col { display:flex; flex-direction:column; }
      .bpc-gap-4    { gap:4px;  }
      .bpc-gap-8    { gap:8px;  }
      .bpc-gap-12   { gap:12px; }

      /* ── Tipografia ──────────────────────────────────────────────────
         .bpc-label    → rótulo pequeno uppercase (ex: "Total", "Down")
         .bpc-value-lg → número grande principal (ex: total de hosts)
         .bpc-value-md → número médio (ex: down, warn)
         .bpc-value-sm → valor pequeno (ex: RTT, Loss)                  */
      .bpc-label    { font-size:.67rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--bpc-mute); }
      .bpc-value-lg { font-size:1.80rem; font-weight:700; color:#E6EDF3; line-height:1; }
      .bpc-value-md { font-size:1.10rem; font-weight:600; color:#E6EDF3; line-height:1; }
      .bpc-value-sm { font-size:.85rem;  font-weight:600; color:#E6EDF3; line-height:1; }

      /* ── Classes de cor de estado ────────────────────────────────────
         Aplicar directamente a qualquer elemento de texto.             */
      .bpc-ok   { color:var(--bpc-ok);   }
      .bpc-warn { color:var(--bpc-warn); }
      .bpc-crit { color:var(--bpc-crit); }
      .bpc-info { color:var(--bpc-info); }
      .bpc-mute { color:var(--bpc-mute); }

      /* ── Pills ───────────────────────────────────────────────────────
         Pastilha colorida de estado (ex: "OK", "Degradado", "Down").
         .bpc-pill.down inclui animação de pulse para chamar a atenção.  */
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

      /* ── Skeleton loader ─────────────────────────────────────────────
         Animação de shimmer enquanto os dados carregam.                */
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

      /* ── Auxiliares ──────────────────────────────────────────────────
         .bpc-divider   → separador vertical subtil entre colunas
         .bpc-timestamp → data/hora de actualização no rodapé do card   */
      .bpc-divider   { width:1px; align-self:stretch; flex-shrink:0; background:rgba(255,255,255,0.07); }
      .bpc-timestamp { font-size:.58rem; color:rgba(255,255,255,0.18); text-align:right; margin-top:4px; }

      /* ── Mini bar (histograma de actividade) ─────────────────────────
         Representação visual de histórico de valores (ex: RTT).
         Cada segmento tem altura proporcional ao valor relativo.        */
      .bpc-mini-bar { display:flex; align-items:flex-end; gap:2px; height:22px; margin-top:8px; }
      .bpc-bar-seg  { flex:1; border-radius:2px 2px 0 0; background:var(--card-accent,var(--bpc-cyan));
                      opacity:.45; min-height:2px; transition:opacity .2s; }
      .bpc-card:hover .bpc-bar-seg { opacity:.68; }

      /* ── Erro inline ─────────────────────────────────────────────────
         Bloco de erro visível dentro de um card quando a API falha.    */
      .bpc-error-msg {
        display:flex; align-items:center; gap:6px;
        font-size:.70rem; color:rgba(239,68,68,0.85);
        background:rgba(239,68,68,0.07);
        border-left:2px solid rgba(239,68,68,0.35);
        border-radius:0 5px 5px 0;
        padding:4px 8px; margin-top:6px;
      }

      /* ── Status bar global ───────────────────────────────────────────
         Barra de resumo "OK: N · Degradado: N · Crítico: N"            */
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


  // ── CSS de Pulse / bordas de estado ──────────────────────────────────────
  //
  //  Gerado a partir de CFG_PULSE (BLOCO 1).
  //  enabled:false → bordas estáticas (sem animação, recomendado para NOC 24h)
  //  enabled:true  → animação de glow pulsante

  if (!document.getElementById('bpc-pulse-css')) {
    const p = CFG_PULSE;
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-pulse-css';

    if (!p.enabled) {
      // Bordas estáticas — mais limpo para uso contínuo
      s.textContent = [
        '.bpc-card.state-ok   {}',
        '.bpc-card.state-warn { border-color:rgba(240,165,0,0.30); border-left:2px solid rgba(240,165,0,0.70); }',
        '.bpc-card.state-down { border-color:rgba(239,68,68,0.30); border-left:2px solid rgba(239,68,68,0.75); background:rgba(239,68,68,0.04); }',
      ].join('\n');
      document.head.appendChild(s);
      if (window.BPC?.log) BPC.log('Pulse: bordas estáticas (enabled=false)');
    } else {
      // Glow animado — gerado dinamicamente a partir de CFG_PULSE e CFG_THEME
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
      if (window.BPC?.log) BPC.log('Pulse: animado — warn:' + wS + ' crit:' + cS);
    }
  }


  // ── CSS do Header NOC ─────────────────────────────────────────────────────
  //
  //  Gerado a partir de CFG_SIZES e CFG_THEME (BLOCO 1).
  //
  //  NOTA v8: padding controlado por CFG_SIZES.header.padding.
  //  Manter ≤12px vertical para não expandir o painel Grafana.
  //  Sem position:relative ou overflow:hidden no wrapper — evita expansão.
  //  Sem elementos com position:absolute — evita que o browser expanda
  //  o container para acomodar conteúdo "fora do fluxo".

  if (!document.getElementById('bpc-header-css')) {
    const Z = CFG_SIZES;
    const s = document.createElement('style');
    s.id = 'bpc-header-css';
    s.textContent = `

      /* ── Wrapper do header ───────────────────────────────────────────
         Gradiente horizontal navy → navy2 → navy com linha superior cyan */
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

      /* ── Logótipo ────────────────────────────────────────────────────
         .bpc-noc-logo-fallback → exibido quando a imagem falha (onerror) */
      .bpc-noc-logo          { height:${Z.logo.height}px; flex-shrink:0; }
      .bpc-noc-logo-fallback {
        height:${Z.logo.height}px; width:52px; flex-shrink:0;
        background:rgba(255,255,255,0.04);
        border:1px dashed rgba(255,255,255,0.12);
        border-radius:7px; display:flex; align-items:center;
        justify-content:center; font-size:10px; font-weight:800;
        color:rgba(255,255,255,0.28); letter-spacing:1px;
      }

      /* ── Centro — título e subtítulo ─────────────────────────────────
         <em> dentro do título → cor dourada (nocLabel)                  */
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

      /* ── Relógio ─────────────────────────────────────────────────────
         Dígitos com tabular-nums para evitar saltos visuais ao mudar    */
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

})(); // fim BLOCO 2


// ══════════════════════════════════════════════════════════════════════════════
//
//  ██████╗ ██╗      ██████╗  ██████╗  ██████╗     ██████╗
//  ██╔══██╗██║     ██╔═══██╗██╔════╝ ██╔═══██╗    ╚════██╗
//  ██████╔╝██║     ██║   ██║██║      ██║   ██║      ▄███╔╝
//  ██╔══██╗██║     ██║   ██║██║      ██║   ██║      ▀▀══╝
//  ██████╔╝███████╗╚██████╔╝╚██████╗ ╚██████╔╝      ██╗
//  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝       ╚═╝
//
//  HTML DO CABEÇALHO NOC
//
//  Aguarda o elemento #bpc-header-root no DOM (injectado pelo painel
//  Grafana "Text") e preenche-o com o cabeçalho.
//
//  Contém:
//    • Função renderHeader(el) → gera o HTML do cabeçalho
//    • Função renderClock()    → actualiza hora + data a cada segundo
//    • Polling para #bpc-header-root (timeout 10s)
//
//  Todo o texto e aparência vêm de CFG_HEADER, CFG_SIZES, CFG_THEME (BLOCO 1).
//
// ══════════════════════════════════════════════════════════════════════════════

(function initHeader() {

  // ── renderClock — actualiza #bpc-clock-time e #bpc-clock-date ────────────

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


  // ── renderHeader — gera o HTML e inicia o relógio ─────────────────────────
  //
  //  Estrutura:
  //    .bpc-noc-hdr
  //    ├── [logo ou fallback textual]
  //    ├── .bpc-noc-center  (título + subtítulo)
  //    └── .bpc-noc-right   (relógio + data)

  function renderHeader(el) {
    const C = CFG_HEADER;
    const Z = CFG_SIZES;

    // Logótipo: tenta carregar a imagem; se falhar, mostra fallback textual
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

        <!-- Logótipo + back-link -->
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:6px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:10px">
            ${logoHTML}
          </div>
          ${backHTML}
        </div>

        <!-- Título + Subtítulo -->
        <div class="bpc-noc-center">
          <div class="bpc-noc-title">
            ${C.title} &nbsp;|&nbsp; <em>${C.nocLabel}</em>
          </div>
          ${C.subtitle ? `<div class="bpc-noc-sub">${C.subtitle}</div>` : ''}
        </div>

        <!-- Relógio -->
        <div class="bpc-noc-right">
          <span class="bpc-noc-time" id="bpc-clock-time">--:--:--</span>
          <div  class="bpc-noc-date" id="bpc-clock-date">…</div>
        </div>

      </div>`;

    // Inicia o relógio (limpa timer anterior se o header for re-renderizado)
    if (window._bpc_clock_interval) clearInterval(window._bpc_clock_interval);
    renderClock();
    window._bpc_clock_interval = setInterval(renderClock, 1000);

    if (window.BPC?.log) BPC.log('Header renderizado (' + CFG_META.version + ')');
  }


  // ── Aguardar #bpc-header-root no DOM ─────────────────────────────────────
  //
  //  O Grafana injecta os painéis de forma assíncrona; o elemento pode
  //  ainda não existir quando este script executa.
  //  Polling a cada 50ms com timeout de 10s.

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

})(); // fim BLOCO 3


// ══════════════════════════════════════════════════════════════════════════════
//
//  ██████╗ ██╗      ██████╗  ██████╗  ██████╗     ██╗  ██╗
//  ██╔══██╗██║     ██╔═══██╗██╔════╝ ██╔═══██╗    ██║  ██║
//  ██████╔╝██║     ██║   ██║██║      ██║   ██║    ███████║
//  ██╔══██╗██║     ██║   ██║██║      ██║   ██║    ╚════██║
//  ██████╔╝███████╗╚██████╔╝╚██████╗ ╚██████╔╝         ██║
//  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝          ╚═╝
//
//  BOOTSTRAP — NAMESPACE · UTILS · RPC
//
//  Inicializa o namespace global window.BPC e expõe:
//    BPC.rpc        → função async para chamar a API Zabbix via Grafana proxy
//    BPC.utils      → utilitários partilhados (formatação, builders, ICMP…)
//    BPC.log        → wrapper de console com prefixo [BPC]
//    BPC.onReady    → registar callback a executar quando o runtime estiver pronto
//    BPC.setReady   → chamado internamente ao criar o rpc; dispara callbacks
//    window.waitForBPC → helper global para painéis que precisam do runtime
//
// ══════════════════════════════════════════════════════════════════════════════

(function bootstrap() {

  const VERSION = CFG_META.version;


  // ── Guard — evita dupla inicialização ────────────────────────────────────
  //
  //  Se já existir uma instância com a mesma versão E todos os componentes
  //  presentes, termina sem fazer nada.
  //  Se o estado for parcial (crash parcial, recarga do painel), reinicializa.

  if (window.BPC && window.BPC.version === VERSION) {
    const ok =
      !!document.getElementById('bpc-global-css') &&
      typeof (window.BPC.utils && window.BPC.utils.waitForElement) === 'function' &&
      typeof window.BPC.rpc === 'function' &&
      typeof window.BPC.log === 'function';
    if (ok) return;
    // Init em curso noutro afterRender concorrente — não re-inicializar
    if (window.BPC._initPending) return;
    console.warn('[BPC] Estado parcial — reinicializando (' + VERSION + ')');
    window.BPC._ready = false;
    window.BPC.rpc = null;
  }
  if (!window.BPC) window.BPC = {};
  window.BPC._initPending = true;


  // ── Namespace window.BPC ─────────────────────────────────────────────────

  window.BPC = window.BPC || {};
  Object.assign(window.BPC, {
    version: VERSION,
    rpc: null,
    _ready: false,
    _callbacks: window.BPC._callbacks || [],

    // Registar um callback para quando o runtime estiver pronto.
    // Se já estiver pronto, executa imediatamente.
    onReady(cb) {
      if (this._ready && typeof this.rpc === 'function') {
        try { cb(this.rpc); } catch (e) { console.error('[BPC] onReady:', e); }
      } else {
        this._callbacks.push(cb);
      }
    },

    // Chamado internamente para marcar o runtime como pronto e
    // disparar todos os callbacks acumulados em onReady().
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


  // ── BPC.log ───────────────────────────────────────────────────────────────

  window.BPC.log = function (msg, level) {
    const p = '[BPC]';
    if (level === 'error') console.error(p, msg);
    else if (level === 'warn') console.warn(p, msg);
    else console.log(p, msg);
  };

  const BPC = window.BPC;


  // ── window.waitForBPC ────────────────────────────────────────────────────
  //
  //  Usado pelos painéis individuais para aguardar o runtime.
  //  Polling a cada 30ms com timeout de 15s.
  //  Se expirar, mostra aviso nos cards que ainda estejam vazios.

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
          // Mostra aviso nos cards que ainda não foram preenchidos
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


  // ── BPC.utils ────────────────────────────────────────────────────────────
  //
  //  Utilitários partilhados por todos os painéis.
  //
  //  Grupos:
  //    DOM          → waitForElement, startRefresh
  //    Estado       → stateClass, stateAccent, stateLabel, statePillClass,
  //                   stateAbove, stateBelow
  //    Formatação   → fmtBytes, fmtMb, fmtMs, fmtPct, fmtTime
  //    Dados        → fetchICMP
  //    Visualização → buildSparkline, buildMiniBar
  //    Builders     → buildLayerCard, buildError, buildSkeleton, buildStatusBar

  window.BPC.utils = {

    // ── DOM ───────────────────────────────────────────────────────────────

    // Aguarda um elemento pelo ID e chama cb quando disponível (timeout ms)
    waitForElement(id, cb, ms) {
      const t0 = Date.now();
      const p = setInterval(() => {
        const el = document.getElementById(id);
        if (el) { clearInterval(p); cb(el); return; }
        if (Date.now() - t0 > (ms || 10000)) { clearInterval(p); BPC.log('waitForElement: timeout #' + id, 'warn'); }
      }, 50);
    },

    // Inicia (ou reinicia) um setInterval associado ao elemento
    startRefresh(el, fn, ms) {
      if (el._bpcTimer) clearInterval(el._bpcTimer);
      el._bpcTimer = setInterval(fn, ms);
    },


    // ── Estado ────────────────────────────────────────────────────────────

    // Devolve a classe CSS de cor para o estado dado ('ok'|'warn'|'down')
    stateClass(s) { return { ok: 'bpc-ok', warn: 'bpc-warn', down: 'bpc-crit' }[s] || 'bpc-mute'; },

    // Devolve a cor hexadecimal do accent para o estado dado
    stateAccent(s) { const C = window.BPC.theme; return { ok: C.ok, warn: C.warn, down: C.crit }[s] || C.mute; },

    // Devolve o label legível para o estado dado
    stateLabel(s) { return { ok: 'OK', warn: 'Degradado', down: 'Down' }[s] || '—'; },

    // Devolve a classe da pill para o estado dado
    statePillClass(s) { return { ok: 'ok', warn: 'warn', down: 'down' }[s] || 'ok'; },

    // Estado por threshold crescente: ok → warn → down (ex: CPU, latência)
    // thr = { warn: Number, crit: Number }
    stateAbove(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v >= t.crit) return 'down'; if (v >= t.warn) return 'warn'; return 'ok'; },

    // Estado por threshold decrescente: ok → warn → down (ex: disponibilidade)
    stateBelow(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v <= t.crit) return 'down'; if (v <= t.warn) return 'warn'; return 'ok'; },


    // ── Formatação ────────────────────────────────────────────────────────

    fmtBytes(b) { if (b == null || isNaN(b) || b < 0) return '—'; if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'; if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'; if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'; if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB'; return b + ' B'; },
    fmtMb(mb) { if (mb == null || isNaN(mb) || mb < 0) return '—'; if (mb >= 1048576) return (mb / 1048576).toFixed(2) + ' TB'; if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'; return mb + ' MB'; },
    fmtMs(ms) { if (ms == null || isNaN(ms) || ms < 0) return '—'; if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s'; return ms.toFixed(2) + ' ms'; },
    fmtPct(v, d) { if (v == null || isNaN(v)) return '—'; return v.toFixed(d ?? 1) + '%'; },
    fmtTime(u) { if (!u) return '—'; return new Date(u * 1000).toLocaleTimeString('pt-PT'); },


    // ── Dados — fetchICMP ─────────────────────────────────────────────────
    //
    //  Consulta o Zabbix para um grupo de hosts e devolve:
    //  { total, down, warn, ok, rtt, loss, sparkData }
    //
    //  rpc     → função BPC.rpc
    //  groupid → ID do host group no Zabbix
    //  thr     → { rttWarnMs, lossWarnPct } — omitir usa CFG_THRESHOLDS

    async fetchICMP(rpc, groupid, thr) {
      const rttWarn = thr?.rttWarnMs || CFG_THRESHOLDS.rttWarnMs;
      const lossWarn = thr?.lossWarnPct || CFG_THRESHOLDS.lossWarnPct;
      BPC.log('fetchICMP → groupid=' + groupid);

      // Busca todos os items ICMP do grupo
      const allItems = await rpc('item.get', {
        groupids: [groupid],
        search: { key_: 'icmpping' },
        filter: { status: 0 },
        output: ['hostid', 'key_', 'lastvalue', 'itemid'],
      });

      // Agrupa por host
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

      // Classifica cada host
      const downSet = new Set(), warnSet = new Set();
      hostIds.forEach(id => {
        const h = byHost[id];
        if (h.up === false || h.up === null) downSet.add(id);
        else if (h.rtt > rttWarn || h.loss > lossWarn) warnSet.add(id);
      });

      // Médias dos hosts UP
      const upIds = hostIds.filter(id => !downSet.has(id));
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      const avgRtt = avg(upIds.map(id => byHost[id].rtt).filter(v => v > 0));
      const avgLoss = avg(upIds.map(id => byHost[id].loss).filter(v => v > 0));

      // Histórico RTT para o sparkline (último 1h, 30 pontos)
      let sparkData = [];
      const firstUp = upIds.find(id => byHost[id].rttItemId);
      if (firstUp) {
        const now = Math.floor(Date.now() / 1000);
        const hist = await rpc('history.get', {
          itemids: [byHost[firstUp].rttItemId],
          time_from: now - 3600, time_till: now,
          output: 'extend', sortfield: 'clock', sortorder: 'ASC', limit: 30,
        });
        sparkData = hist.map(h => parseFloat(h.value) * 1000);
      }

      BPC.log('fetchICMP ← total=' + total + ' down=' + downSet.size + ' warn=' + warnSet.size);
      return { total, down: downSet.size, warn: warnSet.size, ok: Math.max(0, total - downSet.size - warnSet.size), rtt: avgRtt, loss: avgLoss, sparkData };
    },


    // ── Visualização — buildSparkline ─────────────────────────────────────
    //
    //  Gera um SVG de linha (140×32) a partir de um array de valores.
    //  Usado em cards que precisam de um gráfico inline simples.

    buildSparkline(data, color) {
      if (!data || data.length < 2) return '';
      const W = 140, H = 32, mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1, step = W / (data.length - 1);
      const pts = data.map((v, i) => (i * step).toFixed(1) + ',' + (H - ((v - mn) / rng) * (H - 4) - 2).toFixed(1)).join(' ');
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color || 'var(--bpc-cyan)'}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.80"/></svg>`;
    },


    // ── Visualização — buildMiniBar ───────────────────────────────────────
    //
    //  Gera um histograma de barras verticais a partir de um array de valores.
    //  As alturas são normalizadas entre o min e max do array.

    buildMiniBar(data, color) {
      if (!data || !data.length) return '';
      const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
      const st = color ? `background:${color};` : '';
      return '<div class="bpc-mini-bar">'
        + data.map(v => `<div class="bpc-bar-seg" style="height:${Math.max(8, Math.round(((v - mn) / rng) * 100))}%;${st}"></div>`).join('')
        + '</div>';
    },


    // ── Builder — buildLayerCard ──────────────────────────────────────────
    //
    //  Gera o HTML completo de um card de camada de rede (ICMP).
    //
    //  cfg = { label, dashUid, color?, groupid? }
    //  d   = { total, down, warn, ok, rtt, loss, sparkData? }

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


    // ── Builder — buildError ──────────────────────────────────────────────
    //
    //  Card de erro inline — exibido quando uma chamada RPC falha.
    //  label   → título opcional (ex: "Camada 3 — Core")
    //  message → mensagem de erro
    //  color   → cor do accent (default: vermelho crítico)

    buildError(label, message, color) {
      const a = color || 'var(--bpc-crit)';
      return `<div class="bpc bpc-card state-down" style="--card-accent:${a};height:100%">
        ${label ? `<div class="bpc-label" style="color:${a};margin-bottom:6px">${label}</div>` : ''}
        <div class="bpc-error-msg">⚠ ${message}</div>
      </div>`;
    },


    // ── Builder — buildSkeleton ───────────────────────────────────────────
    //
    //  Card de carregamento — exibido enquanto os dados ainda não chegaram.
    //  color → cor do accent (default: cinzento muted)

    buildSkeleton(color) {
      const a = color || 'var(--bpc-mute)';
      return `<div class="bpc bpc-card" style="--card-accent:${a};height:100%;display:flex;flex-direction:column;gap:10px">
        <div class="bpc-skeleton" style="height:10px;width:45%"></div>
        <div class="bpc-skeleton" style="height:26px;width:55%"></div>
        <div class="bpc-skeleton" style="height:11px;width:75%"></div>
        <div class="bpc-skeleton" style="height:11px;width:40%;margin-top:auto"></div>
      </div>`;
    },


    // ── Builder — buildStatusBar ──────────────────────────────────────────
    //
    //  Barra horizontal de contagem de estados.
    //  counts = { ok, warn, crit, label? }
    //  label  → texto de timestamp ou identificação (alinhado à direita)

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

  }; // fim BPC.utils

  BPC.log('utils inicializado (' + VERSION + ')');


  // ── RPC — Zabbix via proxy Grafana ────────────────────────────────────────
  //
  //  O URL vem de CFG_META.apiUrl (BLOCO 1).
  //  Envia um POST JSON-RPC e devolve json.result.
  //  Lança Error se HTTP não-OK ou se a resposta contiver json.error.

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

})(); // fim BLOCO 4


// ══════════════════════════════════════════════════════════════════════════════
//
//  ██████╗ ██╗      ██████╗  ██████╗  ██████╗     ███████╗
//  ██╔══██╗██║     ██╔═══██╗██╔════╝ ██╔═══██╗    ██╔════╝
//  ██████╔╝██║     ██║   ██║██║      ██║   ██║    ███████╗
//  ██╔══██╗██║     ██║   ██║██║      ██║   ██║    ╚════██║
//  ██████╔╝███████╗╚██████╔╝╚██████╗ ╚██████╔╝    ███████║
//  ╚═════╝ ╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝     ╚══════╝
//
//  CONTRATO §5.1 — THEME · BPC_SHARED · BPC_CHARTS · BPC.state
//
//  Símbolos que TODO o painel de conteúdo assume existirem (via initWithRetry).
//  Definidos UMA vez aqui; nunca redefinidos num card (engenharia §5.1/§9).
//  Dependem de CFG_THEME (BLOCO 1), acessível neste mesmo ficheiro/escopo.
//
//    window.BPC.THEME   → tokens visuais (colorOk/Warn/Crit/Info/Mute/Dis, sz*, …)
//    window.BPC.theme   → alias legado (CFG_THEME cru: .ok/.warn/.crit) p/ BPC.utils
//    window.BPC_SHARED  → helpers puros (esc, ts, cls, divider, pbar, fmtNum,
//                         fmtTb, worstState, severityToState, stateAbove/Below, toFloat)
//    window.BPC_CHARTS  → SVG (gaugeSemi, sparkline, pbar, dot)
//    window.BPC.state   → modelo de estado §6.1 (metric, worst, host, color)
//
// ══════════════════════════════════════════════════════════════════════════════

(function contractGlobals() {

  window.BPC = window.BPC || {};

  // ── BPC.THEME — tokens visuais consumidos pelos cards (§5.1) ───────────────
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

  // Alias legado: BPC.utils.stateAccent lê window.BPC.theme.{ok,warn,crit}
  window.BPC.theme = CFG_THEME;

  // ── BPC.state — modelo de estado, única fonte de cálculo (§6.1) ────────────
  window.BPC.state = {
    // classifica UMA métrica contra { warn, crit }; dir 'above' (default) | 'below'
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

    // pior de uma lista; precedência down > crit > warn > ok > mute
    worst: function (states) {
      var order = { down: 4, crit: 3, warn: 2, ok: 1, mute: 0 };
      var w = 'ok', wv = 1;
      (states || []).forEach(function (s) {
        var v = order[s] != null ? order[s] : 0;
        if (v > wv) { wv = v; w = s; }
      });
      return w;
    },

    // estado de um host a partir das métricas já classificadas;
    // metrics.reachable === false → 'down'
    host: function (metrics) {
      if (!metrics) return 'ok';
      if (metrics.reachable === false) return 'down';
      var vals = [];
      Object.keys(metrics).forEach(function (k) {
        if (k !== 'reachable') vals.push(metrics[k]);
      });
      return window.BPC.state.worst(vals);
    },

    // cor hexadecimal de um estado (via BPC.THEME, nunca hex no card)
    color: function (state) {
      var T = window.BPC.THEME;
      var map = {
        ok: T.colorOk, warn: T.colorWarn, crit: T.colorCrit,
        down: T.colorCrit, info: T.colorInfo, mute: T.colorMute,
      };
      return map[state] || T.colorMute;
    },
  };

  // ── BPC_CHARTS — componentes SVG partilhados (§5.1) ────────────────────────
  window.BPC_CHARTS = {
    // gauge semicircular; opts = { max, color, size, label, unit }
    gaugeSemi: function (value, opts) {
      opts = opts || {};
      var max = opts.max || 100;
      var color = opts.color || 'var(--bpc-cyan)';
      var size = opts.size || 90;
      var v = Math.max(0, Math.min(max, value || 0));
      var r = size / 2 - 8;
      var cx = size / 2, cy = size / 2;
      var len = Math.PI * r;            // comprimento do semicírculo
      var dash = len * (v / max);
      var arc = 'M8 ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (size - 8) + ' ' + cy;
      var label = opts.label != null ? opts.label : Math.round(v) + (opts.unit || '%');
      return '<svg width="' + size + '" height="' + (size / 2 + 12) + '" viewBox="0 0 ' + size + ' ' + (size / 2 + 12) + '">'
        + '<path d="' + arc + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linecap="round"/>'
        + '<path d="' + arc + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + len.toFixed(1) + '"/>'
        + '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" fill="#E6EDF3" font-size="' + (size * 0.20).toFixed(0) + '" font-weight="700">' + label + '</text>'
        + '</svg>';
    },

    // linha sparkline (delega no util já testado)
    sparkline: function (data, color) {
      return window.BPC.utils.buildSparkline(data, color);
    },

    // barra de progresso horizontal; pct 0..100
    pbar: function (pct, color) {
      pct = Math.max(0, Math.min(100, pct || 0));
      color = color || 'var(--bpc-cyan)';
      return '<div style="background:rgba(255,255,255,0.08);border-radius:4px;height:6px;width:100%;overflow:hidden">'
        + '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px"></div></div>';
    },

    // ponto colorido de estado (ok|warn|crit|down|info|mute)
    dot: function (state) {
      var c = window.BPC.state.color(state);
      return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + c + '"></span>';
    },
  };

  // ── BPC_SHARED — helpers puros, sem efeitos laterais (§5.1) ────────────────
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
    // severidade Zabbix → estado: 0-1→ok, 2-3→warn, ≥critPriority(4)→crit (§6.2)
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

})(); // fim BLOCO 5


// ══════════════════════════════════════════════════════════════════════════════
//  REFERÊNCIA RÁPIDA — v9
//  ─────────────────────────────────────────────────────────────────────────
//
//  ONDE EDITAR (apenas BLOCO 1):
//    URL API Zabbix      → CFG_META.apiUrl
//    Versão do runtime   → CFG_META.version
//    Logo / Título       → CFG_HEADER (logoUrl, title, nocLabel, subtitle)
//    Paleta de cores     → CFG_THEME  (navy, cyan, gold, ok, warn, crit…)
//    Tamanhos / fontes   → CFG_SIZES  (header, title, clock, logo…)
//    Animações de estado → CFG_PULSE  (enabled, intensity, speed…)
//    Idioma do relógio   → CFG_CLOCK  (days[], months[])
//    Alertas ICMP        → CFG_THRESHOLDS (rttWarnMs, lossWarnPct)
//
//  COMO APLICAR A BARRA DE ACENTO DE COR NOS CARDS:
//    <div class="bpc bpc-card state-down" style="--card-accent:#EF4444">
//
//  RECEITAS CFG_PULSE:
//    Activar pulse:         enabled:true
//    Apenas borda, sem glow: intensity:{ warn:0, crit:0 }
//    Apenas glow, sem borda: borderWidth:'0px'
//    Desligar completamente: enabled:false
//
// ══════════════════════════════════════════════════════════════════════════════