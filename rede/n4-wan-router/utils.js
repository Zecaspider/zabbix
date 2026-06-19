// â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
// â•‘  BPC NOC â€” HEADER GLOBAL                                  v8 Â· BPC-UI   â•‘
// â•‘                                                                          â•‘
// â•‘  Carregado UMA Ãºnica vez, no painel de cabeÃ§alho do Grafana.            â•‘
// â•‘  Tudo o que Ã© partilhado entre painÃ©is vive aqui.                       â•‘
// â•‘                                                                          â•‘
// â•‘  ESTRUTURA DO FICHEIRO                                                   â•‘
// â•‘  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€  â•‘
// â•‘  BLOCO 1 â€” CFG         Toda a configuraÃ§Ã£o editÃ¡vel (cores, labelsâ€¦)    â•‘
// â•‘  BLOCO 2 â€” CSS         Estilos globais BPC (cards, pills, skeletonâ€¦)    â•‘
// â•‘  BLOCO 3 â€” HTML        Render do cabeÃ§alho NOC + relÃ³gio                â•‘
// â•‘  BLOCO 4 â€” BOOTSTRAP   Namespace Â· utils Â· RPC Â· guards de versÃ£o       â•‘
// â•‘                                                                          â•‘
// â•‘  REGRA DE OURO: para mudar qualquer coisa visual ou textual,            â•‘
// â•‘  editar APENAS o BLOCO 1. NÃ£o tocar nos outros blocos.                  â•‘
// â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—      â–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â• â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—    â–ˆâ–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•     â–ˆâ–ˆâ•‘
//  â•šâ•â•â•â•â•â• â•šâ•â•â•â•â•â•â• â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•      â•šâ•â•
//
//  CONFIGURAÃ‡ÃƒO GLOBAL â€” EDITAR AQUI E APENAS AQUI
//
//  ContÃ©m:
//    CFG_META    â†’ versÃ£o, ambiente, URL da API Zabbix
//    CFG_HEADER  â†’ logÃ³tipo, tÃ­tulo, subtÃ­tulo, labels
//    CFG_THEME   â†’ toda a paleta de cores BPC
//    CFG_SIZES   â†’ tipografia e espaÃ§amentos do header
//    CFG_PULSE   â†’ animaÃ§Ãµes de estado dos cards
//    CFG_CLOCK   â†’ idioma do relÃ³gio (dias, meses)
//    CFG_THRESHOLDS â†’ limites de alerta ICMP por defeito
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// â”€â”€ CFG_META â€” IdentificaÃ§Ã£o e infra â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  version   â†’ identificador interno do runtime; incrementar em alteraÃ§Ãµes
//              incompatÃ­veis (forÃ§a re-inicializaÃ§Ã£o do namespace BPC)
//  apiUrl    â†’ endpoint do proxy Grafana para a API Zabbix
//              Alterar se o IP/porta do Grafana mudar

const CFG_META = {
  version: 'v9',   // v9 â€” contrato Â§5.1 completo: BPC.THEME, BPC_SHARED, BPC_CHARTS, BPC.state (BLOCO 5)
  apiUrl: 'http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api',
};


// â”€â”€ CFG_HEADER â€” Identidade visual do cabeÃ§alho â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  logoUrl   â†’ caminho para a imagem do logÃ³tipo (relativo ao Grafana public/)
//              '' â†’ mostra o fallback textual com CFG_HEADER.title
//  title     â†’ texto principal (aparece a branco)
//  nocLabel  â†’ palavra destacada a dourado apÃ³s o separador  |
//  subtitle  â†’ linha pequena por baixo do tÃ­tulo
//              '' â†’ omite a linha de subtÃ­tulo

const CFG_HEADER = {
  logoUrl: '/public/img/bpc-logo.png',
  title: 'BPC',
  nocLabel: 'REDE WAN - NÃVEL 3',
  subtitle: 'Banco de PoupanÃ§a e CrÃ©dito Â· Centro de OperaÃ§Ãµes de Rede',
};


// â”€â”€ CFG_THEME â€” Paleta de cores BPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  navy   â†’ fundo principal do header e cards (azul-marinho escuro)
//  navy2  â†’ fundo secundÃ¡rio / gradiente do header
//  cyan   â†’ accent primÃ¡rio: relÃ³gio, links, mÃ©tricas informativas
//  gold   â†’ accent dourado: palavra "NOC", destaques especiais
//  ok     â†’ estado saudÃ¡vel (verde) â€” Â§6 modelo de estado
//  warn   â†’ estado de aviso (Ã¢mbar) â€” Â§6: #d29922 (decoplado do gold; ver nota)
//  crit   â†’ estado crÃ­tico / down (vermelho) â€” Â§6: #f85149
//  info   â†’ mÃ©trica informativa (igual ao cyan)
//  mute   â†’ texto e labels secundÃ¡rios (cinzento azulado)
//
//  NOTA v9: as cores de estado (ok/warn/crit) seguem o catÃ¡logo canÃ³nico do
//  modelo de estado (engenharia Â§6/Â§6.1), para que BPC.state.color() e o CSS
//  .bpc-* sejam UMA Ãºnica fonte de verdade. O `gold` (#F0A500) mantÃ©m-se como
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


// â”€â”€ CFG_SIZES â€” DimensÃµes e tipografia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  Controla os tamanhos de texto e espaÃ§amentos do header.
//  Os cards usam as classes bpc-value-lg/md/sm definidas no BLOCO 2 (CSS).
//
//  header.padding       â†’ padding vertical do wrapper (px) â€” manter â‰¤12 para
//                         nÃ£o expandir o painel Grafana
//  header.borderTopW    â†’ espessura da barra superior decorativa
//  title.size           â†’ tamanho do tÃ­tulo principal "BPC | NOC"
//  title.letterSpacing  â†’ espaÃ§amento entre letras do tÃ­tulo (em)
//  subtitle.size        â†’ tamanho da linha de subtÃ­tulo
//  clock.timeSize       â†’ tamanho dos dÃ­gitos do relÃ³gio
//  clock.dateSize       â†’ tamanho da linha de data
//  logo.height          â†’ altura do logÃ³tipo em pÃ­xeis

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


// â”€â”€ CFG_PULSE â€” AnimaÃ§Ãµes de estado dos cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  enabled:false â†’ bordas estÃ¡ticas coloridas (recomendado para ecrÃ£ NOC 24h,
//                  reduz distracÃ§Ã£o e carga GPU)
//  enabled:true  â†’ borda + glow pulsante por estado
//
//  borderWidth   â†’ espessura da borda dos cards em modo animado
//  borderRadius  â†’ raio dos cantos em modo animado
//  intensity     â†’ opacidade mÃ¡xima do glow { warn, crit }  (0.0 â€“ 1.0)
//                  0 = sem glow, apenas borda
//  speed         â†’ perÃ­odo da animaÃ§Ã£o em segundos { warn, crit }
//  minSpeedSec   â†’ velocidade mÃ­nima (evita animaÃ§Ãµes demasiado rÃ¡pidas)

const CFG_PULSE = {
  enabled: false,
  borderWidth: '2px',
  borderRadius: '10px',
  intensity: { warn: 0.10, crit: 0.38 },
  speed: { warn: 6.0, crit: 2.2 },
  minSpeedSec: 3.0,
};


// â”€â”€ CFG_CLOCK â€” LocalizaÃ§Ã£o do relÃ³gio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  Substituir arrays por traduÃ§Ãµes para outro idioma se necessÃ¡rio.
//  Ãndice 0 = Domingo (padrÃ£o JS).

const CFG_CLOCK = {
  days: ['Domingo', 'Segunda-feira', 'TerÃ§a-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'SÃ¡bado'],
  months: ['Janeiro', 'Fevereiro', 'MarÃ§o', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
};


// â”€â”€ CFG_THRESHOLDS â€” Limites de alerta ICMP por defeito â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  Usados pelo utilitÃ¡rio fetchICMP quando o caller nÃ£o passa thresholds.
//  rttWarnMs    â†’ RTT acima deste valor (ms) marca o host como "degradado"
//  lossWarnPct  â†’ packet loss acima deste valor (%) marca como "degradado"

const CFG_THRESHOLDS = {
  rttWarnMs: 5,
  lossWarnPct: 5,
};


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â• â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—    â•šâ•â•â•â•â–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ–ˆâ•”â•
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—
//  â•šâ•â•â•â•â•â• â•šâ•â•â•â•â•â•â• â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•      â•šâ•â•â•â•â•â•â•
//
//  CSS GLOBAL BPC
//
//  Injectado UMA vez em <head>. NÃ£o editar directamente â€”
//  os valores vÃªm do BLOCO 1 (CFG_THEME, CFG_PULSE).
//
//  ContÃ©m:
//    â€¢ VariÃ¡veis CSS --bpc-* (sincronizadas com CFG_THEME)
//    â€¢ Base .bpc
//    â€¢ Cards (.bpc-card, ::before, estados, hover)
//    â€¢ Layout helpers (.bpc-flex, .bpc-flex-col, .bpc-gap-*)
//    â€¢ Tipografia (.bpc-label, .bpc-value-lg/md/sm)
//    â€¢ Cores de estado (.bpc-ok, .bpc-warn, .bpc-crit, .bpc-info, .bpc-mute)
//    â€¢ Pills (.bpc-pill ok/warn/down)
//    â€¢ Skeleton loader (.bpc-skeleton)
//    â€¢ Auxiliares (divider, timestamp, mini-bar, erro inline, status-bar)
//    â€¢ CSS de pulse/bordas de estado (gerado a partir de CFG_PULSE)
//    â€¢ CSS especÃ­fico do header NOC (.bpc-noc-hdr, logo, tÃ­tulo, relÃ³gio)
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(function injectAllCSS() {

  // â”€â”€ CSS Global (cards, pills, layout, etc.) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (!document.getElementById('bpc-global-css')) {
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-global-css';
    s.textContent = `

      /* â”€â”€ VariÃ¡veis BPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

      /* â”€â”€ Base â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Fonte e box-model aplicados a todos os elementos BPC.          */
      .bpc { font-family:'Inter','Segoe UI',sans-serif; box-sizing:border-box; }

      /* â”€â”€ Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Contentor principal de cada mÃ©trica.
         --card-accent â†’ cor da barra de topo; definir inline em cada card:
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

      /* â”€â”€ Estados dos cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         .state-ok  â†’ sem override (herda o estilo base do card)
         .state-warnâ†’ borda esquerda Ã¢mbar
         .state-downâ†’ borda esquerda vermelha + fundo levemente vermelho */
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

      /* â”€â”€ Layout helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         UtilitÃ¡rios de flexbox para compor o interior dos cards.       */
      .bpc-flex     { display:flex; align-items:center; }
      .bpc-flex-col { display:flex; flex-direction:column; }
      .bpc-gap-4    { gap:4px;  }
      .bpc-gap-8    { gap:8px;  }
      .bpc-gap-12   { gap:12px; }

      /* â”€â”€ Tipografia â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         .bpc-label    â†’ rÃ³tulo pequeno uppercase (ex: "Total", "Down")
         .bpc-value-lg â†’ nÃºmero grande principal (ex: total de hosts)
         .bpc-value-md â†’ nÃºmero mÃ©dio (ex: down, warn)
         .bpc-value-sm â†’ valor pequeno (ex: RTT, Loss)                  */
      .bpc-label    { font-size:.67rem; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--bpc-mute); }
      .bpc-value-lg { font-size:1.80rem; font-weight:700; color:#E6EDF3; line-height:1; }
      .bpc-value-md { font-size:1.10rem; font-weight:600; color:#E6EDF3; line-height:1; }
      .bpc-value-sm { font-size:.85rem;  font-weight:600; color:#E6EDF3; line-height:1; }

      /* â”€â”€ Classes de cor de estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Aplicar directamente a qualquer elemento de texto.             */
      .bpc-ok   { color:var(--bpc-ok);   }
      .bpc-warn { color:var(--bpc-warn); }
      .bpc-crit { color:var(--bpc-crit); }
      .bpc-info { color:var(--bpc-info); }
      .bpc-mute { color:var(--bpc-mute); }

      /* â”€â”€ Pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Pastilha colorida de estado (ex: "OK", "Degradado", "Down").
         .bpc-pill.down inclui animaÃ§Ã£o de pulse para chamar a atenÃ§Ã£o.  */
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

      /* â”€â”€ Skeleton loader â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         AnimaÃ§Ã£o de shimmer enquanto os dados carregam.                */
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

      /* â”€â”€ Auxiliares â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         .bpc-divider   â†’ separador vertical subtil entre colunas
         .bpc-timestamp â†’ data/hora de actualizaÃ§Ã£o no rodapÃ© do card   */
      .bpc-divider   { width:1px; align-self:stretch; flex-shrink:0; background:rgba(255,255,255,0.07); }
      .bpc-timestamp { font-size:.58rem; color:rgba(255,255,255,0.18); text-align:right; margin-top:4px; }

      /* â”€â”€ Mini bar (histograma de actividade) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         RepresentaÃ§Ã£o visual de histÃ³rico de valores (ex: RTT).
         Cada segmento tem altura proporcional ao valor relativo.        */
      .bpc-mini-bar { display:flex; align-items:flex-end; gap:2px; height:22px; margin-top:8px; }
      .bpc-bar-seg  { flex:1; border-radius:2px 2px 0 0; background:var(--card-accent,var(--bpc-cyan));
                      opacity:.45; min-height:2px; transition:opacity .2s; }
      .bpc-card:hover .bpc-bar-seg { opacity:.68; }

      /* â”€â”€ Erro inline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Bloco de erro visÃ­vel dentro de um card quando a API falha.    */
      .bpc-error-msg {
        display:flex; align-items:center; gap:6px;
        font-size:.70rem; color:rgba(239,68,68,0.85);
        background:rgba(239,68,68,0.07);
        border-left:2px solid rgba(239,68,68,0.35);
        border-radius:0 5px 5px 0;
        padding:4px 8px; margin-top:6px;
      }

      /* â”€â”€ Status bar global â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Barra de resumo "OK: N Â· Degradado: N Â· CrÃ­tico: N"            */
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


  // â”€â”€ CSS de Pulse / bordas de estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Gerado a partir de CFG_PULSE (BLOCO 1).
  //  enabled:false â†’ bordas estÃ¡ticas (sem animaÃ§Ã£o, recomendado para NOC 24h)
  //  enabled:true  â†’ animaÃ§Ã£o de glow pulsante

  if (!document.getElementById('bpc-pulse-css')) {
    const p = CFG_PULSE;
    const T = CFG_THEME;
    const s = document.createElement('style');
    s.id = 'bpc-pulse-css';

    if (!p.enabled) {
      // Bordas estÃ¡ticas â€” mais limpo para uso contÃ­nuo
      s.textContent = [
        '.bpc-card.state-ok   {}',
        '.bpc-card.state-warn { border-color:rgba(240,165,0,0.30); border-left:2px solid rgba(240,165,0,0.70); }',
        '.bpc-card.state-down { border-color:rgba(239,68,68,0.30); border-left:2px solid rgba(239,68,68,0.75); background:rgba(239,68,68,0.04); }',
      ].join('\n');
      document.head.appendChild(s);
      if (window.BPC?.log) BPC.log('Pulse: bordas estÃ¡ticas (enabled=false)');
    } else {
      // Glow animado â€” gerado dinamicamente a partir de CFG_PULSE e CFG_THEME
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
      if (window.BPC?.log) BPC.log('Pulse: animado â€” warn:' + wS + ' crit:' + cS);
    }
  }


  // â”€â”€ CSS do Header NOC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Gerado a partir de CFG_SIZES e CFG_THEME (BLOCO 1).
  //
  //  NOTA v8: padding controlado por CFG_SIZES.header.padding.
  //  Manter â‰¤12px vertical para nÃ£o expandir o painel Grafana.
  //  Sem position:relative ou overflow:hidden no wrapper â€” evita expansÃ£o.
  //  Sem elementos com position:absolute â€” evita que o browser expanda
  //  o container para acomodar conteÃºdo "fora do fluxo".

  if (!document.getElementById('bpc-header-css')) {
    const Z = CFG_SIZES;
    const s = document.createElement('style');
    s.id = 'bpc-header-css';
    s.textContent = `

      /* â”€â”€ Wrapper do header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         Gradiente horizontal navy â†’ navy2 â†’ navy com linha superior cyan */
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

      /* â”€â”€ LogÃ³tipo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         .bpc-noc-logo-fallback â†’ exibido quando a imagem falha (onerror) */
      .bpc-noc-logo          { height:${Z.logo.height}px; flex-shrink:0; }
      .bpc-noc-logo-fallback {
        height:${Z.logo.height}px; width:52px; flex-shrink:0;
        background:rgba(255,255,255,0.04);
        border:1px dashed rgba(255,255,255,0.12);
        border-radius:7px; display:flex; align-items:center;
        justify-content:center; font-size:10px; font-weight:800;
        color:rgba(255,255,255,0.28); letter-spacing:1px;
      }

      /* â”€â”€ Centro â€” tÃ­tulo e subtÃ­tulo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         <em> dentro do tÃ­tulo â†’ cor dourada (nocLabel)                  */
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

      /* â”€â”€ RelÃ³gio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
         DÃ­gitos com tabular-nums para evitar saltos visuais ao mudar    */
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â• â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—    â•šâ•â•â•â•â–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘      â–„â–ˆâ–ˆâ–ˆâ•”â•
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘      â–€â–€â•â•â•
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•      â–ˆâ–ˆâ•—
//  â•šâ•â•â•â•â•â• â•šâ•â•â•â•â•â•â• â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•       â•šâ•â•
//
//  HTML DO CABEÃ‡ALHO NOC
//
//  Aguarda o elemento #bpc-header-root no DOM (injectado pelo painel
//  Grafana "Text") e preenche-o com o cabeÃ§alho.
//
//  ContÃ©m:
//    â€¢ FunÃ§Ã£o renderHeader(el) â†’ gera o HTML do cabeÃ§alho
//    â€¢ FunÃ§Ã£o renderClock()    â†’ actualiza hora + data a cada segundo
//    â€¢ Polling para #bpc-header-root (timeout 10s)
//
//  Todo o texto e aparÃªncia vÃªm de CFG_HEADER, CFG_SIZES, CFG_THEME (BLOCO 1).
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(function initHeader() {

  // â”€â”€ renderClock â€” actualiza #bpc-clock-time e #bpc-clock-date â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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


  // â”€â”€ renderHeader â€” gera o HTML e inicia o relÃ³gio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Estrutura:
  //    .bpc-noc-hdr
  //    â”œâ”€â”€ [logo ou fallback textual]
  //    â”œâ”€â”€ .bpc-noc-center  (tÃ­tulo + subtÃ­tulo)
  //    â””â”€â”€ .bpc-noc-right   (relÃ³gio + data)

  function renderHeader(el) {
    const C = CFG_HEADER;
    const Z = CFG_SIZES;

    // LogÃ³tipo: tenta carregar a imagem; se falhar, mostra fallback textual
    const logoHTML = C.logoUrl
      ? `<img src="${C.logoUrl}"
              height="${Z.logo.height}"
              class="bpc-noc-logo"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <div class="bpc-noc-logo-fallback" style="display:none">${C.title}</div>`
      : `<div class="bpc-noc-logo-fallback">${C.title}</div>`;

    el.innerHTML = `
      <div class="bpc-noc-hdr">

        <!-- LogÃ³tipo -->
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          ${logoHTML}
        </div>

        <!-- TÃ­tulo + SubtÃ­tulo -->
        <div class="bpc-noc-center">
          <div class="bpc-noc-title">
            ${C.title} &nbsp;|&nbsp; <em>${C.nocLabel}</em>
          </div>
          ${C.subtitle ? `<div class="bpc-noc-sub">${C.subtitle}</div>` : ''}
        </div>

        <!-- RelÃ³gio -->
        <div class="bpc-noc-right">
          <span class="bpc-noc-time" id="bpc-clock-time">--:--:--</span>
          <div  class="bpc-noc-date" id="bpc-clock-date">â€¦</div>
        </div>

      </div>`;

    // Inicia o relÃ³gio (limpa timer anterior se o header for re-renderizado)
    if (window._bpc_clock_interval) clearInterval(window._bpc_clock_interval);
    renderClock();
    window._bpc_clock_interval = setInterval(renderClock, 1000);

    if (window.BPC?.log) BPC.log('Header renderizado (' + CFG_META.version + ')');
  }


  // â”€â”€ Aguardar #bpc-header-root no DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  O Grafana injecta os painÃ©is de forma assÃ­ncrona; o elemento pode
  //  ainda nÃ£o existir quando este script executa.
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
      console.warn('[BPC] Header: #bpc-header-root nÃ£o encontrado apÃ³s 10s');
    }
  }, 50);

})(); // fim BLOCO 3


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—     â–ˆâ–ˆâ•—  â–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â• â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—    â–ˆâ–ˆâ•‘  â–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘    â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘    â•šâ•â•â•â•â–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•         â–ˆâ–ˆâ•‘
//  â•šâ•â•â•â•â•â• â•šâ•â•â•â•â•â•â• â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•          â•šâ•â•
//
//  BOOTSTRAP â€” NAMESPACE Â· UTILS Â· RPC
//
//  Inicializa o namespace global window.BPC e expÃµe:
//    BPC.rpc        â†’ funÃ§Ã£o async para chamar a API Zabbix via Grafana proxy
//    BPC.utils      â†’ utilitÃ¡rios partilhados (formataÃ§Ã£o, builders, ICMPâ€¦)
//    BPC.log        â†’ wrapper de console com prefixo [BPC]
//    BPC.onReady    â†’ registar callback a executar quando o runtime estiver pronto
//    BPC.setReady   â†’ chamado internamente ao criar o rpc; dispara callbacks
//    window.waitForBPC â†’ helper global para painÃ©is que precisam do runtime
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(function bootstrap() {

  const VERSION = CFG_META.version;


  // â”€â”€ Guard â€” evita dupla inicializaÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Se jÃ¡ existir uma instÃ¢ncia com a mesma versÃ£o E todos os componentes
  //  presentes, termina sem fazer nada.
  //  Se o estado for parcial (crash parcial, recarga do painel), reinicializa.

  if (window.BPC && window.BPC.version === VERSION) {
    const ok =
      !!document.getElementById('bpc-global-css') &&
      typeof (window.BPC.utils && window.BPC.utils.waitForElement) === 'function' &&
      typeof window.BPC.rpc === 'function' &&
      typeof window.BPC.log === 'function';
    if (ok) return;
    // Init em curso noutro afterRender concorrente â€” nÃ£o re-inicializar
    if (window.BPC._initPending) return;
    console.warn('[BPC] Estado parcial â€” reinicializando (' + VERSION + ')');
    window.BPC._ready = false;
    window.BPC.rpc = null;
  }
  if (!window.BPC) window.BPC = {};
  window.BPC._initPending = true;


  // â”€â”€ Namespace window.BPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  window.BPC = window.BPC || {};
  Object.assign(window.BPC, {
    version: VERSION,
    rpc: null,
    _ready: false,
    _callbacks: window.BPC._callbacks || [],

    // Registar um callback para quando o runtime estiver pronto.
    // Se jÃ¡ estiver pronto, executa imediatamente.
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


  // â”€â”€ BPC.log â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  window.BPC.log = function (msg, level) {
    const p = '[BPC]';
    if (level === 'error') console.error(p, msg);
    else if (level === 'warn') console.warn(p, msg);
    else console.log(p, msg);
  };

  const BPC = window.BPC;


  // â”€â”€ window.waitForBPC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  Usado pelos painÃ©is individuais para aguardar o runtime.
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
          // Mostra aviso nos cards que ainda nÃ£o foram preenchidos
          document.querySelectorAll('[id^="bpc-card-"]').forEach(el => {
            if (!el.innerHTML.trim())
              el.innerHTML = '<div style="color:#EF4444;padding:12px;font-size:.75rem">âš  Header nÃ£o inicializou</div>';
          });
        }
      }, 30);
    };
    window.waitForBPC._v = VERSION;
    BPC.log('waitForBPC registado (' + VERSION + ')');
  }


  // â”€â”€ BPC.utils â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  UtilitÃ¡rios partilhados por todos os painÃ©is.
  //
  //  Grupos:
  //    DOM          â†’ waitForElement, startRefresh
  //    Estado       â†’ stateClass, stateAccent, stateLabel, statePillClass,
  //                   stateAbove, stateBelow
  //    FormataÃ§Ã£o   â†’ fmtBytes, fmtMb, fmtMs, fmtPct, fmtTime
  //    Dados        â†’ fetchICMP
  //    VisualizaÃ§Ã£o â†’ buildSparkline, buildMiniBar
  //    Builders     â†’ buildLayerCard, buildError, buildSkeleton, buildStatusBar

  window.BPC.utils = {

    // â”€â”€ DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Aguarda um elemento pelo ID e chama cb quando disponÃ­vel (timeout ms)
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


    // â”€â”€ Estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Devolve a classe CSS de cor para o estado dado ('ok'|'warn'|'down')
    stateClass(s) { return { ok: 'bpc-ok', warn: 'bpc-warn', down: 'bpc-crit' }[s] || 'bpc-mute'; },

    // Devolve a cor hexadecimal do accent para o estado dado
    stateAccent(s) { const C = window.BPC.theme; return { ok: C.ok, warn: C.warn, down: C.crit }[s] || C.mute; },

    // Devolve o label legÃ­vel para o estado dado
    stateLabel(s) { return { ok: 'OK', warn: 'Degradado', down: 'Down' }[s] || 'â€”'; },

    // Devolve a classe da pill para o estado dado
    statePillClass(s) { return { ok: 'ok', warn: 'warn', down: 'down' }[s] || 'ok'; },

    // Estado por threshold crescente: ok â†’ warn â†’ down (ex: CPU, latÃªncia)
    // thr = { warn: Number, crit: Number }
    stateAbove(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v >= t.crit) return 'down'; if (v >= t.warn) return 'warn'; return 'ok'; },

    // Estado por threshold decrescente: ok â†’ warn â†’ down (ex: disponibilidade)
    stateBelow(v, t) { if (v == null || isNaN(v)) return 'mute'; if (v <= t.crit) return 'down'; if (v <= t.warn) return 'warn'; return 'ok'; },


    // â”€â”€ FormataÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    fmtBytes(b) { if (b == null || isNaN(b) || b < 0) return 'â€”'; if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'; if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB'; if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'; if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB'; return b + ' B'; },
    fmtMb(mb) { if (mb == null || isNaN(mb) || mb < 0) return 'â€”'; if (mb >= 1048576) return (mb / 1048576).toFixed(2) + ' TB'; if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB'; return mb + ' MB'; },
    fmtMs(ms) { if (ms == null || isNaN(ms) || ms < 0) return 'â€”'; if (ms >= 1000) return (ms / 1000).toFixed(2) + ' s'; return ms.toFixed(2) + ' ms'; },
    fmtPct(v, d) { if (v == null || isNaN(v)) return 'â€”'; return v.toFixed(d ?? 1) + '%'; },
    fmtTime(u) { if (!u) return 'â€”'; return new Date(u * 1000).toLocaleTimeString('pt-PT'); },


    // â”€â”€ Dados â€” fetchICMP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Consulta o Zabbix para um grupo de hosts e devolve:
    //  { total, down, warn, ok, rtt, loss, sparkData }
    //
    //  rpc     â†’ funÃ§Ã£o BPC.rpc
    //  groupid â†’ ID do host group no Zabbix
    //  thr     â†’ { rttWarnMs, lossWarnPct } â€” omitir usa CFG_THRESHOLDS

    async fetchICMP(rpc, groupid, thr) {
      const rttWarn = thr?.rttWarnMs || CFG_THRESHOLDS.rttWarnMs;
      const lossWarn = thr?.lossWarnPct || CFG_THRESHOLDS.lossWarnPct;
      BPC.log('fetchICMP â†’ groupid=' + groupid);

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

      // MÃ©dias dos hosts UP
      const upIds = hostIds.filter(id => !downSet.has(id));
      const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
      const avgRtt = avg(upIds.map(id => byHost[id].rtt).filter(v => v > 0));
      const avgLoss = avg(upIds.map(id => byHost[id].loss).filter(v => v > 0));

      // HistÃ³rico RTT para o sparkline (Ãºltimo 1h, 30 pontos)
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

      BPC.log('fetchICMP â† total=' + total + ' down=' + downSet.size + ' warn=' + warnSet.size);
      return { total, down: downSet.size, warn: warnSet.size, ok: Math.max(0, total - downSet.size - warnSet.size), rtt: avgRtt, loss: avgLoss, sparkData };
    },


    // â”€â”€ VisualizaÃ§Ã£o â€” buildSparkline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Gera um SVG de linha (140Ã—32) a partir de um array de valores.
    //  Usado em cards que precisam de um grÃ¡fico inline simples.

    buildSparkline(data, color) {
      if (!data || data.length < 2) return '';
      const W = 140, H = 32, mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1, step = W / (data.length - 1);
      const pts = data.map((v, i) => (i * step).toFixed(1) + ',' + (H - ((v - mn) / rng) * (H - 4) - 2).toFixed(1)).join(' ');
      return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><polyline points="${pts}" fill="none" stroke="${color || 'var(--bpc-cyan)'}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.80"/></svg>`;
    },


    // â”€â”€ VisualizaÃ§Ã£o â€” buildMiniBar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Gera um histograma de barras verticais a partir de um array de valores.
    //  As alturas sÃ£o normalizadas entre o min e max do array.

    buildMiniBar(data, color) {
      if (!data || !data.length) return '';
      const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
      const st = color ? `background:${color};` : '';
      return '<div class="bpc-mini-bar">'
        + data.map(v => `<div class="bpc-bar-seg" style="height:${Math.max(8, Math.round(((v - mn) / rng) * 100))}%;${st}"></div>`).join('')
        + '</div>';
    },


    // â”€â”€ Builder â€” buildLayerCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      const rttLabel = d.down === d.total ? 'â€”' : u.fmtMs(d.rtt);
      const lossLabel = d.down === d.total ? 'â€”' : u.fmtPct(d.loss);
      const lossClass = d.loss > 5 ? 'bpc-warn' : 'bpc-ok';

      return `<a href="/d/${cfg.dashUid}" style="text-decoration:none;display:block;height:100%">
        <div class="bpc bpc-card state-${status}" style="--card-accent:${accent};height:100%;cursor:pointer;display:flex;flex-direction:column;gap:8px;">
          <div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="bpc-label" style="margin-bottom:2px">NOC Â· Compute</div>
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
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm bpc-info">${rttLabel}</span><span class="bpc-label">RTT mÃ©dio</span></div>
            <div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm ${lossClass}">${lossLabel}</span><span class="bpc-label">Loss mÃ©dio</span></div>
          </div>
          ${bar}
          <div class="bpc-flex" style="justify-content:space-between;margin-top:auto;padding-top:4px">
            <span style="font-size:.68rem;color:var(--bpc-cyan)">Ver detalhe â†’</span>
            <span class="bpc-timestamp">Grupo ${cfg.groupid || 'â€”'}</span>
          </div>
        </div>
      </a>`;
    },


    // â”€â”€ Builder â€” buildError â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Card de erro inline â€” exibido quando uma chamada RPC falha.
    //  label   â†’ tÃ­tulo opcional (ex: "Camada 3 â€” Core")
    //  message â†’ mensagem de erro
    //  color   â†’ cor do accent (default: vermelho crÃ­tico)

    buildError(label, message, color) {
      const a = color || 'var(--bpc-crit)';
      return `<div class="bpc bpc-card state-down" style="--card-accent:${a};height:100%">
        ${label ? `<div class="bpc-label" style="color:${a};margin-bottom:6px">${label}</div>` : ''}
        <div class="bpc-error-msg">âš  ${message}</div>
      </div>`;
    },


    // â”€â”€ Builder â€” buildSkeleton â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Card de carregamento â€” exibido enquanto os dados ainda nÃ£o chegaram.
    //  color â†’ cor do accent (default: cinzento muted)

    buildSkeleton(color) {
      const a = color || 'var(--bpc-mute)';
      return `<div class="bpc bpc-card" style="--card-accent:${a};height:100%;display:flex;flex-direction:column;gap:10px">
        <div class="bpc-skeleton" style="height:10px;width:45%"></div>
        <div class="bpc-skeleton" style="height:26px;width:55%"></div>
        <div class="bpc-skeleton" style="height:11px;width:75%"></div>
        <div class="bpc-skeleton" style="height:11px;width:40%;margin-top:auto"></div>
      </div>`;
    },


    // â”€â”€ Builder â€” buildStatusBar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    //  Barra horizontal de contagem de estados.
    //  counts = { ok, warn, crit, label? }
    //  label  â†’ texto de timestamp ou identificaÃ§Ã£o (alinhado Ã  direita)

    buildStatusBar(counts) {
      const { ok = 0, warn = 0, crit = 0, label = '' } = counts;
      const ts = label ? `<span style="font-size:.67rem;color:var(--bpc-mute);margin-left:auto">${label}</span>` : '';
      return `<div class="bpc-status-bar">
        <span class="bpc-status-pill ok">  <span class="bpc-status-dot"></span>OK: ${ok}</span>
        <span class="bpc-status-pill warn"><span class="bpc-status-dot"></span>Degradado: ${warn}</span>
        <span class="bpc-status-pill crit"><span class="bpc-status-dot"></span>CrÃ­tico: ${crit}</span>
        <span class="bpc-status-sep"></span>${ts}
      </div>`;
    },

  }; // fim BPC.utils

  BPC.log('utils inicializado (' + VERSION + ')');


  // â”€â”€ RPC â€” Zabbix via proxy Grafana â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  //
  //  O URL vem de CFG_META.apiUrl (BLOCO 1).
  //  Envia um POST JSON-RPC e devolve json.result.
  //  LanÃ§a Error se HTTP nÃ£o-OK ou se a resposta contiver json.error.

  window.BPC.setReady(async function rpc(method, params) {
    BPC.log('rpc â†’ ' + method);
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â–ˆâ–ˆâ•—      â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—     â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•”â•â•â•â•â• â–ˆâ–ˆâ•”â•â•â•â–ˆâ–ˆâ•—    â–ˆâ–ˆâ•”â•â•â•â•â•
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘    â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—
//  â–ˆâ–ˆâ•”â•â•â–ˆâ–ˆâ•—â–ˆâ–ˆâ•‘     â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘â–ˆâ–ˆâ•‘      â–ˆâ–ˆâ•‘   â–ˆâ–ˆâ•‘    â•šâ•â•â•â•â–ˆâ–ˆâ•‘
//  â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•—â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•— â•šâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•”â•    â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ•‘
//  â•šâ•â•â•â•â•â• â•šâ•â•â•â•â•â•â• â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•  â•šâ•â•â•â•â•â•     â•šâ•â•â•â•â•â•â•
//
//  CONTRATO Â§5.1 â€” THEME Â· BPC_SHARED Â· BPC_CHARTS Â· BPC.state
//
//  SÃ­mbolos que TODO o painel de conteÃºdo assume existirem (via initWithRetry).
//  Definidos UMA vez aqui; nunca redefinidos num card (engenharia Â§5.1/Â§9).
//  Dependem de CFG_THEME (BLOCO 1), acessÃ­vel neste mesmo ficheiro/escopo.
//
//    window.BPC.THEME   â†’ tokens visuais (colorOk/Warn/Crit/Info/Mute/Dis, sz*, â€¦)
//    window.BPC.theme   â†’ alias legado (CFG_THEME cru: .ok/.warn/.crit) p/ BPC.utils
//    window.BPC_SHARED  â†’ helpers puros (esc, ts, cls, divider, pbar, fmtNum,
//                         fmtTb, worstState, severityToState, stateAbove/Below, toFloat)
//    window.BPC_CHARTS  â†’ SVG (gaugeSemi, sparkline, pbar, dot)
//    window.BPC.state   â†’ modelo de estado Â§6.1 (metric, worst, host, color)
//
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

(function contractGlobals() {

  window.BPC = window.BPC || {};

  // â”€â”€ BPC.THEME â€” tokens visuais consumidos pelos cards (Â§5.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // Alias legado: BPC.utils.stateAccent lÃª window.BPC.theme.{ok,warn,crit}
  window.BPC.theme = CFG_THEME;

  // â”€â”€ BPC.state â€” modelo de estado, Ãºnica fonte de cÃ¡lculo (Â§6.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  window.BPC.state = {
    // classifica UMA mÃ©trica contra { warn, crit }; dir 'above' (default) | 'below'
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

    // pior de uma lista; precedÃªncia down > crit > warn > ok > mute
    worst: function (states) {
      var order = { down: 4, crit: 3, warn: 2, ok: 1, mute: 0 };
      var w = 'ok', wv = 1;
      (states || []).forEach(function (s) {
        var v = order[s] != null ? order[s] : 0;
        if (v > wv) { wv = v; w = s; }
      });
      return w;
    },

    // estado de um host a partir das mÃ©tricas jÃ¡ classificadas;
    // metrics.reachable === false â†’ 'down'
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

  // â”€â”€ BPC_CHARTS â€” componentes SVG partilhados (Â§5.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
      var len = Math.PI * r;            // comprimento do semicÃ­rculo
      var dash = len * (v / max);
      var arc = 'M8 ' + cy + ' A ' + r + ' ' + r + ' 0 0 1 ' + (size - 8) + ' ' + cy;
      var label = opts.label != null ? opts.label : Math.round(v) + (opts.unit || '%');
      return '<svg width="' + size + '" height="' + (size / 2 + 12) + '" viewBox="0 0 ' + size + ' ' + (size / 2 + 12) + '">'
        + '<path d="' + arc + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="8" stroke-linecap="round"/>'
        + '<path d="' + arc + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + dash.toFixed(1) + ' ' + len.toFixed(1) + '"/>'
        + '<text x="' + cx + '" y="' + (cy - 3) + '" text-anchor="middle" fill="#E6EDF3" font-size="' + (size * 0.20).toFixed(0) + '" font-weight="700">' + label + '</text>'
        + '</svg>';
    },

    // linha sparkline (delega no util jÃ¡ testado)
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

  // â”€â”€ BPC_SHARED â€” helpers puros, sem efeitos laterais (Â§5.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  window.BPC_SHARED = {
    esc: function (s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    },
    ts: function (ms) { return ms ? new Date(ms).toLocaleTimeString('pt-PT') : 'â€”'; },
    cls: function (state) {
      return { ok: 'bpc-ok', warn: 'bpc-warn', crit: 'bpc-crit', down: 'bpc-crit', info: 'bpc-info' }[state] || 'bpc-mute';
    },
    divider: function () { return '<div class="bpc-divider"></div>'; },
    pbar: function (pct, color) { return window.BPC_CHARTS.pbar(pct, color); },
    fmtNum: function (n, d) {
      if (n == null || isNaN(n)) return 'â€”';
      return Number(n).toLocaleString('pt-PT', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    },
    fmtTb: function (bytes) {
      if (bytes == null || isNaN(bytes)) return 'â€”';
      if (bytes >= 1e12) return (bytes / 1e12).toFixed(2) + ' TB';
      if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
      return (bytes / 1e6).toFixed(0) + ' MB';
    },
    worstState: function (states) { return window.BPC.state.worst(states); },
    // severidade Zabbix â†’ estado: 0-1â†’ok, 2-3â†’warn, â‰¥critPriority(4)â†’crit (Â§6.2)
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
    window.BPC.log('Contrato Â§5.1 exposto: THEME Â· state Â· BPC_CHARTS Â· BPC_SHARED (' + CFG_META.version + ')');
  }

})(); // fim BLOCO 5


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
//  REFERÃŠNCIA RÃPIDA â€” v9
//  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  ONDE EDITAR (apenas BLOCO 1):
//    URL API Zabbix      â†’ CFG_META.apiUrl
//    VersÃ£o do runtime   â†’ CFG_META.version
//    Logo / TÃ­tulo       â†’ CFG_HEADER (logoUrl, title, nocLabel, subtitle)
//    Paleta de cores     â†’ CFG_THEME  (navy, cyan, gold, ok, warn, critâ€¦)
//    Tamanhos / fontes   â†’ CFG_SIZES  (header, title, clock, logoâ€¦)
//    AnimaÃ§Ãµes de estado â†’ CFG_PULSE  (enabled, intensity, speedâ€¦)
//    Idioma do relÃ³gio   â†’ CFG_CLOCK  (days[], months[])
//    Alertas ICMP        â†’ CFG_THRESHOLDS (rttWarnMs, lossWarnPct)
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
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
