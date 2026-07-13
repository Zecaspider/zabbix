;(function () {

  // ══════════════════════════════════════════════════════════════════
  // BPC NOC — D03-N2-VMs · PAINEL 1 · KPI STRIP  v4.3
  // Framework: BPC-UI v7  |  waitForBPC bootstrap
  //
  // v4.3 vs v4.2 — changelog:
  //   [ARCH] Modo DEMO completamente removido.
  //          Em caso de erro, o painel mostra um card de diagnóstico
  //          com a causa exacta:
  //            • HTTP 500  → problema no proxy Grafana-Zabbix
  //            • HTTP 404  → datasource ou endpoint não encontrado
  //            • HTTP 401/403 → sem permissão / sessão expirada
  //            • Failed to fetch → rede ou CORS
  //            • Timeout      → Zabbix demorou demasiado
  //            • Sem items    → groupId errado ou sem dados
  //          Cada erro tem sugestão de acção correctiva.
  //   [FIX]  powerGrid: argumentos (num, col, num, col, num, col)
  //          corrigidos — deixou de mostrar hex em vez de número.
  //   [FIX]  vmCount usa hostids únicos com Power state presente
  //          (inclui VMs desligadas cujo item existe no Zabbix).
  //   [KEEP] Storage via "Datastore discovery:*" no grupo ESXi (603)
  //          com deduplicação por UUID da chave.
  //
  // Estrutura:
  //   [1] CFG + THEME
  //   [2] PALETTE
  //   [3] STYLES
  //   [4] TEMPLATES  ← inclui T.errorCard()
  //   [5] DATA UTILS
  //   [6] FETCH
  //   [7] COMPUTE
  //   [8] RENDER
  //   [9] BOOTSTRAP  ← sem getDemoData()
  // ══════════════════════════════════════════════════════════════════


  // ────────────────────────────────────────────────────────────────
  // [1] CFG + THEME
  // ────────────────────────────────────────────────────────────────

  const THEME = {
    // Cores e thresholds vivem agora em CFG.colors / CFG.thresholds (ver abaixo).
    // Estes aliases derivam de CFG para manter o padrão unificado dos L3 sem
    // duplicar valores — única fonte de verdade: CFG.
    get colorOk()   { return CFG.colors.ok;   },
    get colorWarn() { return CFG.colors.warn; },
    get colorCrit() { return CFG.colors.crit; },
    get colorInfo() { return CFG.colors.info; },
    get colorMute() { return CFG.colors.mute; },
    get colorDis()  { return CFG.colors.dis;  },

    get cpuWarnPct()  { return CFG.thresholds.cpu.warn;  },
    get cpuCritPct()  { return CFG.thresholds.cpu.crit;  },
    get ramWarnPct()  { return CFG.thresholds.ram.warn;  },
    get ramCritPct()  { return CFG.thresholds.ram.crit;  },
    get storWarnPct() { return CFG.thresholds.stor.warn; },
    get storCritPct() { return CFG.thresholds.stor.crit; },

    get balloonWarnGb() { return CFG.thresholds.balloon.warn; },
    get swapWarnGb()    { return CFG.thresholds.swap.warn;    },
    get swapCritGb()    { return CFG.thresholds.swap.crit;    },

    fontBody: "'IBM Plex Sans', 'Segoe UI', sans-serif",
    fontMono: "'Courier New', monospace",

    szLabel:      '9px',
    szBigVal:     '28px',
    szBigSuffix:  '13px',
    szSub:        '10.5px',
    szGaugePct:   '21px',
    szGaugeAvg:   '9.5px',
    szWorstLabel: '8px',
    szWorstVal:   '10px',
    szBadge:      '9.5px',
    szNote:       '8.5px',
    szTrigCount:  '26px',
    szTrigLabel:  '9px',
    szTrigSub:    '8.5px',
    szDrill:      '9px',
    szDemoBar:    '9.5px',
    szStatePill:  '10px',

    cardPadding:  '10px 13px 9px',
    labelSpacing: '.13em',
  }

  const CFG = {
    elementId:   'bpc-n2-vms-kpi',
    groupId:     '609',    // Grupo das VMs
    esxiGroupId: '603',    // Grupo dos ESXi — tem os itens de datastore
    diskVmNameMode: 'tech',   // 'visible' | 'tech'
    refreshMs:      60_000,
    debug:          false,  // true → console.log com breakdown

    zabbixUrl:     'http://10.10.126.22',
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',   // datasource Zabbix (consistente com os painéis L3)

    // Cores de estado unificadas (mesma paleta dos L3)
    colors: {
      ok:   '#3FB950',
      warn: '#D29922',
      crit: '#F85149',
      info: '#58A6FF',
      mute: '#6E7681',
      dis:  '#FF2D55',
    },

    // Thresholds unificados (estrutura aninhada como nos L3)
    thresholds: {
      cpu:     { warn: 70,  crit: 90 },
      ram:     { warn: 70,  crit: 85 },
      stor:    { warn: 75,  crit: 90 },
      balloon: { warn: 0.1, crit: 0.1 },
      swap:    { warn: 0.1, crit: 0.5 },
    },

    grafanaDash: {
      // Decisão 2026-07-13 (fecha o TODO P1): NÃO se constroem dashboards
      // só-CPU/só-RAM — o drill vai para a FICHA HÍBRIDA da pior VM com o
      // painel da métrica em fullscreen (?viewPanel=NNN). Contexto completo
      // fica a um Esc de distância; zero dashboards novos a manter.
      vmFicha:        '/d/vm-n3-ficha/n3-vm-ficha-hibrido',
      vmCpuPanelId:   108,   // timeseries "Utilização CPU" na ficha híbrida
      vmRamPanelId:   110,   // timeseries "Utilização Memória" na ficha híbrida
      problems: '/d/PLACEHOLDER_PB/problemas',       // TODO: substituir pelo UID real do dashboard
      storage:  '/d/PLACEHOLDER_ST/storage',         // TODO: substituir pelo UID real do dashboard
    },

    critPriority:   4,
    staleThreshSec: 300,
    historyMinutes: 360,   // 6h — sparklines

    vmNameMode: 'visible', // 'visible' | 'tech'

    itemNamesVm: [
      // CPU
      'CPU utilization',
      'VMware: CPU usage in percents',
      'VMware: Number of virtual CPUs',
      // RAM
      'VMware: Memory size',
      'VMware: Host memory usage',
      'VMware: Host memory usage in percents',
      'VMware: Ballooned memory',
      'VMware: Swapped memory',
      // Disco — itens de agente Windows confirmados no grupo 609
      // Chave: vfs.fs.size[<letra>:,used] / vfs.fs.size[<letra>:,total]
      // Nome:  (<letra>:): Used space / (<letra>:): Total space
      // Nota: volumes com total=0 são ignorados no compute (sem disco montado)
      'Used space',
      'Total space',
      // Estado / meta
      'VMware: Power state',
      'VMware: Uptime of guest OS',
      'VMware: Hypervisor name',
    ],

    // Thresholds para o card de disco (%)
    diskWarnPct:  80,   // volume acima disto → amarelo
    diskCritPct:  90,   // volume acima disto → vermelho
    diskTopN:      5,   // número de volumes a mostrar no top

    // Prefixo dos itens de datastore nos hosts ESXi (mantido para referência futura)
    dsItemPrefix: 'Datastore discovery:',
    dsNameTotal:  'Total size of datastore',
    dsNamePfree:  'Free space on datastore',
  }


  // ────────────────────────────────────────────────────────────────
  // [2] PALETTE
  // ────────────────────────────────────────────────────────────────

  const C = {
    ok:   THEME.colorOk,
    warn: THEME.colorWarn,
    crit: THEME.colorCrit,
    info: THEME.colorInfo,
    mute: THEME.colorMute,
    dis:  THEME.colorDis,
  }


  // ────────────────────────────────────────────────────────────────
  // [3] STYLES
  // ────────────────────────────────────────────────────────────────

  const STYLES = `
    .bpc-panel *, .bpc-panel *::before, .bpc-panel *::after { box-sizing: border-box; }
    .bpc-panel {
      height: 100%; display: flex; flex-direction: column;
      font-family: ${THEME.fontBody};
      background: rgba(13,17,23,0.98); overflow: hidden;
    }
    .bpc-state-bar {
      flex-shrink: 0; padding: 4px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; justify-content: space-between; align-items: center;
    }
    .bpc-state-meta { font-size: ${THEME.szStatePill}; color: ${C.mute}; letter-spacing: .04em; }
    .bpc-state-pill {
      font-size: ${THEME.szStatePill}; font-weight: 700;
      padding: 2px 11px; border-radius: 4px; letter-spacing: .09em;
    }
    .bpc-cards { display: flex; flex: 1; overflow: hidden; min-height: 0; }
    .bpc-card {
      flex: 1; min-width: 0; padding: ${THEME.cardPadding};
      background: rgba(255,255,255,0.015); position: relative;
      overflow: hidden; display: flex; flex-direction: column;
      border-right: 1px solid rgba(255,255,255,0.055);
    }
    .bpc-card:last-child { border-right: none; }
    .bpc-accent { position: absolute; top: 0; left: 0; right: 0; height: 2px; opacity: .95; }
    .bpc-label {
      font-size: ${THEME.szLabel}; letter-spacing: ${THEME.labelSpacing};
      color: ${C.mute}; font-weight: 600; text-transform: uppercase;
      margin-bottom: 4px; flex-shrink: 0;
    }
    .bpc-hero { flex-shrink: 0; margin-bottom: 3px; }
    .bpc-big {
      font-family: ${THEME.fontMono}; font-size: ${THEME.szBigVal};
      font-weight: 700; line-height: 1; letter-spacing: -.01em;
    }
    .bpc-big-suffix {
      font-size: ${THEME.szBigSuffix}; color: ${C.mute};
      font-weight: 400; font-family: ${THEME.fontBody};
    }
    .bpc-context { flex: 1; display: flex; flex-direction: column; gap: 3px; min-height: 0; overflow: hidden; }
    .bpc-sub { font-size: ${THEME.szSub}; line-height: 15px; color: ${C.mute}; flex-shrink: 0; }
    .bpc-pbar { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; flex-shrink: 0; }
    .bpc-pbar-fill { height: 100%; border-radius: 2px; transition: width 600ms ease; }
    .bpc-sep { height: 1px; background: rgba(255,255,255,0.06); flex-shrink: 0; margin: 4px 0; }
    .bpc-badges { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
    .bpc-badge {
      font-size: ${THEME.szBadge}; font-weight: 700; letter-spacing: .05em;
      text-transform: uppercase; padding: 3px 7px; border-radius: 3px;
      white-space: nowrap; line-height: 1.3;
    }
    .bpc-info-box {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px; padding: 5px 8px; flex-shrink: 0;
    }
    .bpc-info-box-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
    .bpc-info-key { font-size: ${THEME.szWorstLabel}; color: ${C.mute}; letter-spacing: .08em; text-transform: uppercase; white-space: nowrap; flex-shrink: 0; }
    .bpc-info-val { font-family: ${THEME.fontMono}; font-size: ${THEME.szWorstVal}; font-weight: 700; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bpc-note { font-size: ${THEME.szNote}; color: ${C.mute}; line-height: 1.4; flex-shrink: 0; }
    .bpc-gauge { display: flex; justify-content: center; flex-shrink: 0; margin: 2px 0; }
    .bpc-spark { flex-shrink: 0; }
    .bpc-drill-zone { flex-shrink: 0; padding-top: 6px; margin-top: auto; display: flex; gap: 4px; flex-wrap: wrap; }
    a.bpc-drill {
      display: inline-block; font-size: ${THEME.szDrill}; color: ${C.info};
      text-decoration: none; padding: 2px 8px; border-radius: 3px;
      border: 1px solid rgba(88,166,255,0.25); background: rgba(88,166,255,0.07);
      letter-spacing: .04em; white-space: nowrap;
    }
    a.bpc-drill:hover { background: rgba(88,166,255,0.15); }
    .bpc-trig-grid { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; align-items: baseline; flex-shrink: 0; }
    .bpc-trig-count { font-family: ${THEME.fontMono}; font-size: ${THEME.szTrigCount}; font-weight: 700; line-height: 1.1; text-align: right; min-width: 36px; }
    .bpc-trig-meta { display: flex; flex-direction: column; justify-content: center; gap: 1px; padding-bottom: 2px; }
    .bpc-trig-label { font-size: ${THEME.szTrigLabel}; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; line-height: 1; }
    .bpc-trig-sub { font-size: ${THEME.szTrigSub}; color: ${C.mute}; line-height: 1; }
    .bpc-power-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; flex-shrink: 0; }
    .bpc-power-cell {
      background: rgba(255,255,255,0.04); border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.07); padding: 5px 6px;
      display: flex; flex-direction: column; align-items: center; gap: 1px;
    }
    .bpc-power-num { font-family: ${THEME.fontMono}; font-size: 18px; font-weight: 700; line-height: 1; }
    .bpc-power-lbl { font-size: 8px; color: ${C.mute}; text-transform: uppercase; letter-spacing: .07em; }
    .bpc-stor-wrap { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
    .bpc-stor-detail { flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .bpc-stor-row { display: flex; justify-content: space-between; align-items: baseline; }
    .bpc-stor-key { font-size: 8.5px; color: ${C.mute}; text-transform: uppercase; letter-spacing: .07em; }
    .bpc-stor-val { font-family: ${THEME.fontMono}; font-size: 13px; font-weight: 700; }
    .bpc-cpu-ctx { font-size: 9px; color: ${C.mute}; letter-spacing: .04em; text-align: center; flex-shrink: 0; }

    /* ── Card de disco — lista de volumes ── */
    .bpc-disk-list { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
    .bpc-disk-row  { display: flex; flex-direction: column; gap: 2px; }
    .bpc-disk-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
    .bpc-disk-host { font-family: ${THEME.fontMono}; font-size: 9px; color: ${C.mute};
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
    .bpc-disk-vol  { font-family: ${THEME.fontMono}; font-size: 9px; font-weight: 700;
      white-space: nowrap; flex-shrink: 0; }
    .bpc-disk-pct  { font-family: ${THEME.fontMono}; font-size: 10px; font-weight: 700;
      white-space: nowrap; flex-shrink: 0; min-width: 32px; text-align: right; }
    .bpc-disk-sz   { font-size: 8.5px; color: ${C.mute}; white-space: nowrap; flex-shrink: 0; }
    .bpc-disk-bar  { height: 3px; background: rgba(255,255,255,0.07); border-radius: 2px; overflow: hidden; }
    .bpc-disk-bar-fill { height: 100%; border-radius: 2px; transition: width 500ms ease; }

    /* ── Card de erro ── */
    .bpc-err-wrap {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 12px; padding: 20px 24px; text-align: center;
    }
    .bpc-err-icon { font-size: 32px; line-height: 1; }
    .bpc-err-code {
      font-family: ${THEME.fontMono}; font-size: 11px; font-weight: 700;
      letter-spacing: .1em; text-transform: uppercase;
      padding: 3px 10px; border-radius: 3px;
    }
    .bpc-err-msg {
      font-size: 13px; font-weight: 600; line-height: 1.3;
    }
    .bpc-err-detail {
      font-size: 10.5px; line-height: 1.55; color: ${C.mute};
      max-width: 480px;
    }
    .bpc-err-action {
      font-size: 10px; line-height: 1.5;
      padding: 8px 14px; border-radius: 5px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      max-width: 520px; text-align: left;
    }
    .bpc-err-action strong { color: #fff; }
    .bpc-err-ts {
      font-size: 9px; color: ${C.mute}; font-family: ${THEME.fontMono};
    }
  `


  // ────────────────────────────────────────────────────────────────
  // [4] TEMPLATES
  // ────────────────────────────────────────────────────────────────

  const T = {

    esc: s => String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),

    rgb: h => {
      h = h.trim().replace('#','')
      if (h.length===3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
      return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
    },

    badge: (txt, col) => {
      const r = T.rgb(col)
      return `<span class="bpc-badge" style="border:1px solid rgba(${r},.3);background:rgba(${r},.13);color:${col};">${T.esc(String(txt))}</span>`
    },

    pbar: (pct, col) =>
      `<div class="bpc-pbar"><div class="bpc-pbar-fill" style="width:${Math.min(100,pct||0).toFixed(1)}%;background:${col};"></div></div>`,

    sep: () => `<div class="bpc-sep"></div>`,

    note: (html, col) =>
      `<div class="bpc-note"${col?` style="color:${col};"` : ''}>${html}</div>`,

    drill: (url, label, col) => {
      const c = col||C.info, r = T.rgb(c)
      return `<a class="bpc-drill" style="color:${c};border-color:rgba(${r},.3);background:rgba(${r},.07);" href="${T.esc(url)}" target="_blank">${T.esc(label)} ↗</a>`
    },

    trend: delta => {
      if (delta==null||isNaN(delta)) return ''
      const a = Math.abs(delta)
      if (a<2) return `<span style="color:${C.mute};font-size:9px;">→ estável</span>`
      if (delta>0) return `<span style="color:${C.crit};font-size:9px;">▲ +${a.toFixed(0)}% vs 6h</span>`
      return `<span style="color:${C.ok};font-size:9px;">▼ −${a.toFixed(0)}% vs 6h</span>`
    },

    // ── SVG atoms ───────────────────────────────────────────────

    gauge: (pct, col, w, h, avgLabel) => {
      if (pct==null||isNaN(pct)) pct=0
      pct = Math.max(0,Math.min(100,pct))
      const cx=w/2, cy=h-4, r=Math.min(cx-10,cy-8), sw=8
      const polar = (deg,rad) => { const a=(deg-180)*Math.PI/180; return {x:cx+rad*Math.cos(a),y:cy+rad*Math.sin(a)} }
      const arc = (s,e,ra) => {
        const p1=polar(s,ra),p2=polar(e,ra),lg=(e-s)>180?1:0
        return `<path d="M${p1.x.toFixed(1)},${p1.y.toFixed(1)} A${ra},${ra} 0 ${lg} 1 ${p2.x.toFixed(1)},${p2.y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"/>`
      }
      const tick = (pv,tc) => {
        const a=pv*180/100,inn=polar(a,r-sw-4),out=polar(a,r+4)
        return `<line x1="${inn.x.toFixed(1)}" y1="${inn.y.toFixed(1)}" x2="${out.x.toFixed(1)}" y2="${out.y.toFixed(1)}" stroke="${tc}" stroke-width="1.5" opacity="0.7"/>`
      }
      const ea=pct*180/100, pctY=cy-(avgLabel?14:4)
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;overflow:visible;">
        <path d="M${polar(0,r).x.toFixed(1)},${polar(0,r).y.toFixed(1)} A${r},${r} 0 1 1 ${polar(180,r).x.toFixed(1)},${polar(180,r).y.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw}" stroke-linecap="round"/>
        ${ea>0?arc(0,ea,r):''}
        ${tick(THEME.cpuWarnPct,C.warn)}${tick(THEME.cpuCritPct,C.crit)}
        <text x="${cx}" y="${pctY}" text-anchor="middle" font-family="${THEME.fontMono}" font-size="${THEME.szGaugePct}" font-weight="700" fill="${col}">${pct.toFixed(1)}%</text>
        ${avgLabel?`<text x="${cx}" y="${cy+10}" text-anchor="middle" font-family="${THEME.fontBody}" font-size="${THEME.szGaugeAvg}" fill="${C.mute}">${T.esc(avgLabel)}</text>`:''}
      </svg>`
    },

    spark: (data, col, w, h, opTop) => {
      if (!data||data.length<2) return ''
      const op=opTop!=null?opTop:0.35
      const mn=Math.min(...data),mx=Math.max(...data),rng=mx-mn||1
      const pts=data.map((v,i)=>[(i/(data.length-1))*w, h-((v-mn)/rng)*(h-5)-2])
      const ln='M'+pts.map(p=>`${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')
      const ar=`M${pts[0][0]},${h}L`+ln.slice(1)+`L${pts[pts.length-1][0]},${h}Z`
      const gid='sp'+Math.random().toString(36).slice(2,7)
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${col}" stop-opacity="${op}"/>
          <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${ar}" fill="url(#${gid})"/>
        <path d="${ln}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="${pts[pts.length-1][0].toFixed(1)}" cy="${pts[pts.length-1][1].toFixed(1)}" r="2.5" fill="${col}"/>
      </svg>`
    },

    donut: (usedPct, col, w, label) => {
      const cx=w/2,cy=w/2,r=w/2-7,sw=8
      const circ=2*Math.PI*r,used=Math.max(0,Math.min(100,usedPct||0))
      const dash=(used/100)*circ,gap=circ-dash
      return `<svg width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" style="display:block;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="${sw}"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${sw}"
          stroke-dasharray="${dash.toFixed(1)} ${gap.toFixed(1)}"
          stroke-dashoffset="${(circ*0.25).toFixed(1)}"
          transform="rotate(-90 ${cx} ${cy})" stroke-linecap="round"/>
        ${label?`<text x="${cx}" y="${cy+5}" text-anchor="middle" font-family="${THEME.fontMono}" font-size="12px" font-weight="700" fill="${col}">${T.esc(label)}</text>`:''}
      </svg>`
    },

    // ── Molecules ───────────────────────────────────────────────

    sub: html => `<div class="bpc-sub">${html}</div>`,

    badges: (...items) => {
      const inner=items.flat().filter(Boolean).join('')
      return inner?`<div class="bpc-badges">${inner}</div>`:''
    },

    infoBox: rows => {
      const html=rows.map(([key,val,col])=>
        `<div class="bpc-info-box-row">
          <span class="bpc-info-key">${T.esc(key)}</span>
          <span class="bpc-info-val" style="color:${col||C.mute};">${T.esc(String(val))}</span>
        </div>`).join('')
      return `<div class="bpc-info-box">${html}</div>`
    },

    gaugeBlock: (pct, col, avgLabel, sparkData, opTop) =>
      `<div class="bpc-gauge">${T.gauge(pct,col,148,82,avgLabel)}</div>
       ${sparkData&&sparkData.length>=2?`<div class="bpc-spark">${T.spark(sparkData,col,148,18,opTop||0.40)}</div>`:''}`,

    // [FIX v4.3] assinatura explícita (numOn,colOn,numOff,colOff,numStale,colStale)
    powerGrid: (numOn, colOn, numOff, colOff, numStale, colStale) =>
      `<div class="bpc-power-grid">
        <div class="bpc-power-cell">
          <span class="bpc-power-num" style="color:${colOn};">${numOn}</span>
          <span class="bpc-power-lbl">ligadas</span>
        </div>
        <div class="bpc-power-cell">
          <span class="bpc-power-num" style="color:${colOff};">${numOff}</span>
          <span class="bpc-power-lbl">desligadas</span>
        </div>
        <div class="bpc-power-cell">
          <span class="bpc-power-num" style="color:${colStale};">${numStale}</span>
          <span class="bpc-power-lbl">sem dados</span>
        </div>
      </div>`,

    trigRow: (label, count, col, sevList, baseUrl) => {
      const url=baseUrl+'&'+sevList.map(s=>`filter_severity[]=${s}`).join('&')
      const cnt=count>0
        ?`<a href="${T.esc(url)}" target="_blank" class="bpc-trig-count" style="color:${col};text-decoration:none;">${count}</a>`
        :`<span class="bpc-trig-count" style="color:${C.mute};">0</span>`
      return `${cnt}
        <div class="bpc-trig-meta">
          <span class="bpc-trig-label" style="color:${col};">${T.esc(label)}</span>
          <span class="bpc-trig-sub">${count>0?`${count} trigger${count>1?'s':''} activo${count>1?'s':''}` :'nenhum'}</span>
        </div>`
    },

    /**
     * Lista de top volumes por utilização.
     * volumes: [{vmName, vol, usedPct, usedGb, totalGb}]
     */
    diskVolumeList: (volumes, warnTh, critTh) => {
      if (!volumes?.length) {
        return `<div class="bpc-note" style="color:${C.ok};margin-top:2px;">
          ✓ Todos os volumes com agente abaixo de ${warnTh}%.
        </div>`
      }
      return `<div class="bpc-disk-list">`
        + volumes.map(v => {
            const col = v.usedPct >= critTh ? C.crit : v.usedPct >= warnTh ? C.warn : C.ok
            const r   = T.rgb(col)
            const nm  = v.vmName.length > 12 ? v.vmName.slice(0,11)+'…' : v.vmName
            return `<div class="bpc-disk-row">
              <div class="bpc-disk-meta">
                <span class="bpc-disk-host" title="${T.esc(v.vmName)}">${T.esc(nm)}</span>
                <span class="bpc-disk-vol" style="color:${col};">${T.esc(v.vol)}</span>
                <span class="bpc-disk-pct" style="color:${col};">${v.usedPct.toFixed(0)}%</span>
                <span class="bpc-disk-sz">${v.usedGb}/${v.totalGb} GB</span>
              </div>
              <div class="bpc-disk-bar">
                <div class="bpc-disk-bar-fill"
                  style="width:${Math.min(100,v.usedPct).toFixed(1)}%;
                    background:linear-gradient(90deg,rgba(${r},.6),${col});"></div>
              </div>
            </div>`
          }).join('')
        + `</div>`
    },

    storageBlock: (usedPct, col, usedTb, freeTb, totalTb, dsCount) =>
      `<div class="bpc-stor-wrap">
        ${T.donut(usedPct,col,64,`${usedPct.toFixed(0)}%`)}
        <div class="bpc-stor-detail">
          <div class="bpc-stor-row">
            <span class="bpc-stor-key">Usado</span>
            <span class="bpc-stor-val" style="color:${col};">${usedTb} TB</span>
          </div>
          <div class="bpc-stor-row">
            <span class="bpc-stor-key">Total</span>
            <span class="bpc-stor-val" style="color:${C.mute};">${totalTb} TB</span>
          </div>
          <div class="bpc-stor-row">
            <span class="bpc-stor-key">Livre</span>
            <span class="bpc-stor-val" style="color:${C.ok};">${freeTb} TB</span>
          </div>
          ${dsCount!=null?`<div class="bpc-stor-row">
            <span class="bpc-stor-key">Datastores</span>
            <span class="bpc-stor-val" style="color:${C.info};">${dsCount}</span>
          </div>`:''}
        </div>
      </div>`,

    // ── Organism: card KPI ───────────────────────────────────────

    card: (accentColor, label, heroHtml, contextHtml, drillHtml='') =>
      `<div class="bpc-card">
        <div class="bpc-accent" style="background:${accentColor};"></div>
        <div class="bpc-label">${T.esc(label)}</div>
        <div class="bpc-hero">${heroHtml}</div>
        <div class="bpc-context">${contextHtml}</div>
        ${drillHtml?`<div class="bpc-drill-zone">${drillHtml}</div>`:''}
      </div>`,

    // ── Organism: card de erro ───────────────────────────────────
    //
    // Substitui o modo DEMO. Mostra causa exacta + acção correctiva.
    //
    // @param {string} code    — código curto (ex: 'HTTP 500')
    // @param {string} title   — frase curta do problema
    // @param {string} detail  — explicação técnica do que aconteceu
    // @param {string} action  — o que fazer para resolver
    // @param {string} raw     — mensagem original do erro (opcional)

    errorCard: (code, title, detail, action, raw) => {
      const ts = new Date().toLocaleTimeString('pt-PT')
      const r  = T.rgb(C.crit)
      return `
        <style>${STYLES}</style>
        <div class="bpc-panel">
          <div class="bpc-state-bar">
            <span class="bpc-state-meta">D03-N2-VMs · grupo ${T.esc(String(CFG.groupId))}</span>
            <span class="bpc-state-pill"
              style="background:rgba(${r},.15);color:${C.crit};border:1px solid rgba(${r},.3);">
              ERRO DE DADOS</span>
          </div>
          <div class="bpc-err-wrap">
            <div class="bpc-err-icon">⚠</div>
            <div class="bpc-err-code"
              style="background:rgba(${r},.12);color:${C.crit};border:1px solid rgba(${r},.3);">
              ${T.esc(code)}</div>
            <div class="bpc-err-msg" style="color:${C.crit};">${T.esc(title)}</div>
            <div class="bpc-err-detail">${T.esc(detail)}</div>
            <div class="bpc-err-action">
              <strong>O que fazer:</strong><br>${action}
            </div>
            ${raw?`<div class="bpc-err-ts" style="color:${C.mute};">Erro original: ${T.esc(raw)}</div>`:''}
            <div class="bpc-err-ts">Última tentativa: ${T.esc(ts)} · próxima em ${CFG.refreshMs/1000}s</div>
          </div>
        </div>`
    },

    // ── Organism: panel shell ────────────────────────────────────

    panel: (cardsHtml, stateLabel, stateCol, groupId) => {
      const r = T.rgb(stateCol)
      return `
        <style>${STYLES}</style>
        <div class="bpc-panel">
          <div class="bpc-state-bar">
            <span class="bpc-state-meta">D03-N2-VMs · grupo ${T.esc(String(groupId))}</span>
            <span class="bpc-state-pill"
              style="background:rgba(${r},.15);color:${stateCol};border:1px solid rgba(${r},.3);">
              ${T.esc(stateLabel)}</span>
          </div>
          <div class="bpc-cards">${cardsHtml}</div>
        </div>`
    },
  }


  // ────────────────────────────────────────────────────────────────
  // [5] DATA UTILS
  // ────────────────────────────────────────────────────────────────

  const nowSec = () => Math.floor(Date.now()/1000)

  const pct = (v,d=1) => (v==null||isNaN(v))? '—' : `${v.toFixed(d)}%`

  const fmtBytes = (bytes,d=1) => {
    if (bytes==null||isNaN(bytes)) return '—'
    const gb=bytes/1_073_741_824
    return gb>=1024?`${(gb/1024).toFixed(d)} TB`:`${gb.toFixed(d)} GB`
  }

  const fmtTb = (bytes,d=1) =>
    (bytes>0?(bytes/1_099_511_627_776).toFixed(d):'0.0')

  const isPoweredOn = val => {
    if (val==null||val==='') return false
    const s=String(val).trim().toLowerCase()
    if (s==='1'||s==='poweredon'||s==='true'||s==='on') return true
    const n=parseFloat(val)
    return !isNaN(n)&&n===1
  }

  const vmName = host => {
    if (!host) return '—'
    if (CFG.vmNameMode==='visible'&&host.name&&host.name.trim()) return host.name.trim()
    return (host.host||'—').split(/[\s.]/)[0]||'—'
  }

  const vmNameDisk = host => {
  if (!host) return '—'
  if (CFG.diskVmNameMode === 'tech' || CFG.diskVmNameMode !== 'visible')
    return (host.host || '—').split(/[\s.]/)[0] || '—'
  return host.name?.trim() || (host.host || '—').split(/[\s.]/)[0] || '—'
}
  const accentFor = (v,w,c) => v>=c?C.crit:v>=w?C.warn:C.ok

  const bucketAvg = buckets =>
    Object.keys(buckets).sort().map(k=>{ const v=buckets[k]; return v.reduce((a,b)=>a+b,0)/v.length })

  const dbg = (...a) => { if (CFG.debug) console.log('[BPC v4.3]',...a) }

  // ────────────────────────────────────────────────────────────────
  // Classificação de erros de fetch
  //
  // Transforma qualquer erro numa estrutura { code, title, detail, action }
  // para apresentação no T.errorCard().
  // ────────────────────────────────────────────────────────────────

  const classifyError = (err) => {
    const msg = (err?.message||String(err)).toLowerCase()

    // HTTP 500 — o proxy Grafana-Zabbix rejeitou o pedido
    if (msg.includes('500')||msg.includes('internal server error')) return {
      code:   'HTTP 500 — Internal Server Error',
      title:  'O proxy Grafana-Zabbix rejeitou o pedido',
      detail: 'O servidor Grafana recebeu o pedido mas o plugin Zabbix devolveu erro interno. '
            + 'Causas frequentes: parâmetro inválido na chamada RPC, método não suportado pelo '
            + 'plugin (ex: host.get ou hostgroup.get não são permitidos via datasource), ou '
            + 'versão do plugin incompatível com a API do Zabbix.',
      action: `Verificar: (1) todos os métodos RPC usados são item.get / trigger.get / history.get; `
            + `(2) os parâmetros limit, output e groupids estão correctos; `
            + `(3) a datasource Zabbix no Grafana está configurada com as credenciais certas. `
            + `Activar CFG.debug = true e ver a consola (F12) para o método exacto que falhou.`,
    }

    // HTTP 404 — URL ou datasource não existe
    if (msg.includes('404')||msg.includes('not found')) return {
      code:   'HTTP 404 — Not Found',
      title:  'Endpoint ou datasource não encontrado',
      detail: 'O Grafana não encontrou a datasource Zabbix ou o endpoint da API. '
            + 'Pode indicar que a datasource foi eliminada, o UID mudou, ou o Grafana '
            + 'foi reconfigurado.',
      action: `Verificar: (1) a datasource Zabbix existe em Grafana → Connections → Data sources; `
            + `(2) o plugin Grafana-Zabbix está instalado e activo; `
            + `(3) o URL do Zabbix na datasource (${CFG.zabbixUrl}) está acessível.`,
    }

    // HTTP 401/403 — sem permissão
    if (msg.includes('401')||msg.includes('403')||msg.includes('unauthorized')||msg.includes('forbidden')) return {
      code:   'HTTP 401/403 — Sem Permissão',
      title:  'Sessão expirada ou sem acesso ao Zabbix',
      detail: 'O Grafana não tem permissão para aceder à API do Zabbix. '
            + 'A sessão pode ter expirado, as credenciais da datasource podem estar erradas, '
            + 'ou o utilizador Zabbix não tem acesso ao grupo ' + CFG.groupId + '.',
      action: `Verificar: (1) credenciais da datasource Zabbix em Grafana → Connections → Data sources; `
            + `(2) o utilizador Zabbix tem permissão de leitura no grupo ${CFG.groupId} (VMs) e ${CFG.esxiGroupId} (ESXi); `
            + `(3) a sessão Zabbix não expirou (reconfigurar datasource se necessário).`,
    }

    // Failed to fetch — rede, CORS, ou Grafana inacessível
    if (msg.includes('failed to fetch')||msg.includes('networkerror')||msg.includes('network')) return {
      code:   'NETWORK ERROR — Failed to Fetch',
      title:  'Sem ligação ao Grafana ou ao Zabbix',
      detail: 'O browser não conseguiu contactar o servidor. Causas possíveis: '
            + 'Grafana ou Zabbix inacessível, problema de CORS (o painel está noutro domínio), '
            + `firewall a bloquear ${CFG.grafanaUrl}, ou o serviço está em baixo.`,
      action: `Verificar: (1) Grafana acessível em ${CFG.grafanaUrl}; `
            + `(2) Zabbix acessível em ${CFG.zabbixUrl}; `
            + `(3) sem erros de CORS na consola (F12 → Network); `
            + `(4) serviços grafana-server e zabbix_server a correr no servidor.`,
    }

    // Timeout
    if (msg.includes('timeout')||msg.includes('timed out')) return {
      code:   'TIMEOUT',
      title:  'Zabbix demorou demasiado a responder',
      detail: 'A chamada à API do Zabbix não respondeu dentro do tempo esperado. '
            + 'Pode indicar sobrecarga no servidor Zabbix, query demasiado pesada '
            + '(ex: history.get com janela de 6h e muitos hosts), ou rede lenta.',
      action: `Verificar: (1) carga do servidor Zabbix (CPU/RAM); `
            + `(2) reduzir CFG.historyMinutes (actualmente ${CFG.historyMinutes}min) ou o limit do history.get; `
            + `(3) verificar índices na base de dados do Zabbix (zabbix_server.log).`,
    }

    // Sem items — groupId errado ou sem dados
    if (msg.includes('sem items')||msg.includes('no items')||msg.includes('groupid')) return {
      code:   'SEM DADOS',
      title:  'Nenhum item encontrado para este grupo',
      detail: `A chamada item.get ao grupo ${CFG.groupId} não devolveu resultados. `
            + 'O groupId pode estar errado, o grupo pode estar vazio, '
            + 'ou os nomes dos itens em CFG.itemNamesVm não correspondem '
            + 'ao que está configurado no Zabbix.',
      action: `Verificar: (1) CFG.groupId = '${CFG.groupId}' existe no Zabbix (Administração → Grupos de hosts); `
            + `(2) os hosts do grupo têm itens activos com os nomes em CFG.itemNamesVm; `
            + `(3) activar CFG.debug = true e correr o snippet de diagnóstico na consola (F12).`,
    }

    // Erro genérico
    return {
      code:   'ERRO DESCONHECIDO',
      title:  'Falha inesperada ao carregar os dados',
      detail: 'Ocorreu um erro não identificado. Ver a mensagem original abaixo.',
      action: `Activar CFG.debug = true, abrir a consola do browser (F12) e recarregar o dashboard. `
            + `Partilhar o erro completo com o administrador do sistema.`,
    }
  }


  // ────────────────────────────────────────────────────────────────
  // [6] FETCH
  // ────────────────────────────────────────────────────────────────

  const fetchData = rpc => {
    const ts   = nowSec()
    const from = ts - CFG.historyMinutes * 60

    const vmP = rpc('item.get', {
      groupids:    [CFG.groupId],
      search:      { name: CFG.itemNamesVm },
      searchByAny: true,
      output:      ['hostid','name','lastvalue','lastclock'],
      selectHosts: ['hostid','host','name'],
      monitored:   true,
      limit:       50000,
    })

    const dsP = rpc('item.get', {
      groupids:              [CFG.esxiGroupId],
      search:                { name: CFG.dsItemPrefix },
      searchWildcardsEnabled: false,
      output:                ['hostid','name','lastvalue','lastclock','key_'],
      selectHosts:           ['hostid','host','name'],
      monitored:             true,
      limit:                 10000,
    }).catch(e => {
      dbg('datastore item.get failed:', e.message)
      return []
    })

    const trgP = rpc('trigger.get', {
      groupids:          [CFG.groupId],
      filter:            { value: 1 },
      monitored:         true,
      only_true:         true,
      expandDescription: true,
      output:            ['triggerid','priority','description'],
    })

    const histP = rpc('history.get', {
      groupids:  [CFG.groupId],
      history:   0,
      time_from: from,
      time_till: ts,
      output:    ['itemid','value','clock'],
      sortfield: 'clock',
      sortorder: 'ASC',
      limit:     20000,
    }).catch(() => [])

    return Promise.all([vmP, dsP, trgP, histP])
  }


  // ────────────────────────────────────────────────────────────────
  // [7] COMPUTE
  // ────────────────────────────────────────────────────────────────

  const _groupByHost = items => {
    const byHost = {}
    items.forEach(item => {
      const hid = item.hostid
      if (!byHost[hid]) {
        const h = item.hosts?.[0]||{}
        byHost[hid] = { hostObj:h, items:{}, lastclocks:{}, keys:{} }
      }
      byHost[hid].items[item.name]      = item.lastvalue
      byHost[hid].lastclocks[item.name] = parseInt(item.lastclock)||0
      if (item.key_) byHost[hid].keys[item.name] = item.key_
    })
    return byHost
  }

  const _processDatastores = dsItems => {
    if (!dsItems?.length) {
      dbg('Sem itens de datastore do grupo ESXi', CFG.esxiGroupId)
      return { totalB:0, freeB:0, dsCount:0, hasData:false, worstDs:null }
    }

    const dsMap = {}

    dsItems.forEach(item => {
      const name = item.name||'', key = item.key_||''
      const val  = parseFloat(item.lastvalue)
      if (isNaN(val)||val<=0) return

      const isTotal = name.includes(CFG.dsNameTotal)
      const isPfree = name.includes(CFG.dsNamePfree)
      if (!isTotal&&!isPfree) return

      // UUID do datastore: 3º argumento da chave
      // vmware.hv.datastore.size[url,hv_uuid,DS_UUID] ou [...,DS_UUID,pfree]
      let dsKey = null
      const km  = key.match(/vmware\.hv\.datastore\.size\[[^\]]*,[^\]]*,([^,\]]+)/)
      if (km) { dsKey = km[1] }
      else {
        const nm = name.match(/\[([^\]]+)\]/)
        dsKey = nm ? nm[1] : name
      }

      if (!dsMap[dsKey]) dsMap[dsKey] = { totalB:0, pfree:null, name:dsKey }
      if (isTotal) dsMap[dsKey].totalB = val
      if (isPfree) dsMap[dsKey].pfree  = val

      const nm2 = name.match(/\[([^\]]+)\]/)
      if (nm2&&dsMap[dsKey].name===dsKey) dsMap[dsKey].name = nm2[1]
    })

    dbg(`${Object.keys(dsMap).length} datastores únicos`)

    let totalB=0, freeB=0, dsCount=0, worstDs=null, worstPfree=100

    Object.values(dsMap).forEach(ds => {
      if (ds.totalB<=0) return
      dsCount++
      totalB += ds.totalB
      const fp = ds.pfree!=null ? ds.pfree : 100
      freeB  += ds.totalB*(fp/100)
      if (fp<worstPfree) {
        worstPfree = fp
        worstDs    = { name:ds.name, pfree:fp, totalTb:fmtTb(ds.totalB) }
      }
    })

    dbg(`Storage: total=${fmtTb(totalB)} TB livre=${fmtTb(freeB)} TB ds=${dsCount}`)
    return { totalB, freeB, dsCount, hasData:totalB>0, worstDs }
  }

  const _earlyAvg = history => {
    if (!history?.length) return {}
    const mid = history[0].clock+(history[history.length-1].clock-history[0].clock)/2
    const early={}
    history.forEach(h=>{ if(parseInt(h.clock)<=mid){ if(!early[h.itemid])early[h.itemid]=[]; early[h.itemid].push(parseFloat(h.value)) } })
    const avg={}
    Object.entries(early).forEach(([id,vals])=>{ avg[id]=vals.reduce((a,b)=>a+b,0)/vals.length })
    return avg
  }

  const _processTriggers = triggers => {
    const byPrio={5:0,4:0,3:0,2:0,1:0}; let worstPrio=0
    triggers.forEach(t=>{ const p=parseInt(t.priority); if(byPrio[p]!==undefined)byPrio[p]++; if(p>worstPrio)worstPrio=p })
    return { total:triggers.length, byPrio, worstPrio }
  }

  const computeMetrics = ([vmItems, dsItems, triggers, history]) => {
    if (!vmItems?.length) throw new Error(`Sem items VM — verificar groupId=${CFG.groupId}`)

    const byHost  = _groupByHost(vmItems)
    const earlyM  = _earlyAvg(history)
    const trigM   = _processTriggers(triggers)
    const storM   = _processDatastores(dsItems)
    const ts      = nowSec()

    let vmsOn=0, vmsWithPS=0, staleCount=0
    let sumCpu=0, worstCpu=0, worstCpuName='—', worstCpuId=null
    let totalVCpus=0
    let totalRamB=0, usedRamB=0, sumRam=0, worstRam=0, worstRamName='—', worstRamId=null
    let totalBalloonB=0, totalSwapB=0, pressAndHighCpu=0
    let vmsRecentReboot=0, agentCount=0
    const hypervisors={}
    const spCpu={}, spRam={}, spBall={}

    Object.values(byHost).forEach(host => {
      const its=host.items, clks=host.lastclocks
      // Conta todos os hosts com item Power state (on + off)
      if (its['VMware: Power state']!==undefined) vmsWithPS++
      if (!isPoweredOn(its['VMware: Power state'])) return
      vmsOn++

      const cpuClock=clks['CPU utilization']||clks['VMware: CPU usage in percents']||0
      if (cpuClock&&(ts-cpuClock)>CFG.staleThreshSec) staleCount++

      const cpuA=parseFloat(its['CPU utilization']), cpuV=parseFloat(its['VMware: CPU usage in percents'])
      const hasAgent=!isNaN(cpuA)
      const cpuPct=hasAgent?cpuA:(!isNaN(cpuV)?Math.min(100,cpuV):0)
      if (hasAgent) agentCount++
      sumCpu+=cpuPct
      if (cpuPct>worstCpu){ worstCpu=cpuPct; worstCpuName=vmName(host.hostObj); worstCpuId=host.hostObj?.hostid||null }

      totalVCpus+=parseFloat(its['VMware: Number of virtual CPUs'])||0

      const ramB=parseFloat(its['VMware: Memory size'])||0
      const usedB=parseFloat(its['VMware: Host memory usage'])||0
      const ramPct=parseFloat(its['VMware: Host memory usage in percents'])||0
      totalRamB+=ramB; usedRamB+=usedB; sumRam+=ramPct
      if (ramPct>worstRam){ worstRam=ramPct; worstRamName=vmName(host.hostObj); worstRamId=host.hostObj?.hostid||null }

      const balloonB=parseFloat(its['VMware: Ballooned memory'])||0
      const swapB=parseFloat(its['VMware: Swapped memory'])||0
      totalBalloonB+=balloonB; totalSwapB+=swapB
      if ((balloonB>0||swapB>0)&&cpuPct>70) pressAndHighCpu++

      const uptime=parseFloat(its['VMware: Uptime of guest OS'])
      if (!isNaN(uptime)&&uptime>3600&&uptime<86400) vmsRecentReboot++

      const hvRaw=(its['VMware: Hypervisor name']||'').split('.')[0]
      if (hvRaw) hypervisors[hvRaw]=(hypervisors[hvRaw]||0)+1

      const mk=Math.floor((cpuClock||ts)/60)
      if (!spCpu[mk]) spCpu[mk]=[]
      if (!spRam[mk]) spRam[mk]=[]
      if (!spBall[mk]) spBall[mk]=[]
      spCpu[mk].push(cpuPct); spRam[mk].push(ramPct); spBall[mk].push(balloonB/1_073_741_824)
    })

    // ── Volumes de disco por VM ───────────────────────────────────
    // Itens confirmados: vfs.fs.size[<letra>:,used] / vfs.fs.size[<letra>:,total]
    // Nome: (<letra>:): Used space / (<letra>:): Total space
    // Volumes com total=0 são removontados sem disco — ignorar.
    // Agrupa por hostid, extrai todos os pares used/total, calcula %.
    const diskVolumes = []   // [{vmName, vol, usedPct, usedGb, totalGb}]
    let diskVmsWithAgent = 0

    Object.values(byHost).forEach(host => {
      if (!isPoweredOn(host.items['VMware: Power state'])) return
      const its = host.items
      const vName = vmName(host.hostObj)
      let vmHasDisk = false

      // Percorrer todos os itens do host e encontrar pares used/total por volume
      // Nome do item tem o formato: "(C:): Used space" ou "New Volume(E:): Used space"
      // Extraímos a letra do volume da chave: vfs.fs.size[C:,used]
      const usedKeys = Object.keys(its).filter(n => n.includes(': Used space'))
      usedKeys.forEach(usedName => {
        const usedB  = parseFloat(its[usedName])
        if (isNaN(usedB)) return

        // Derivar nome do item de total a partir do nome de used
        const totalName = usedName.replace(': Used space', ': Total space')
        const totalB = parseFloat(its[totalName])
        if (isNaN(totalB) || totalB <= 0) return   // volume sem disco ou não montado

        vmHasDisk = true
        const usedPct  = (usedB / totalB) * 100
        const usedGb   = Math.round(usedB / 1_073_741_824)
        const totalGb  = Math.round(totalB / 1_073_741_824)

        // Extrair letra do volume do nome do item: "(C:): Used space" → "C:"
        const volMatch = usedName.match(/\(([^)]+)\):\s*Used space/)
        const vol = volMatch ? volMatch[1] : usedName.replace(': Used space','')

        if (usedPct >= CFG.diskWarnPct) {
          diskVolumes.push({ vmName: vName, vol, usedPct, usedGb, totalGb })
        }
      })
      if (vmHasDisk) diskVmsWithAgent++
    })

    // Ordenar por % decrescente e limitar ao top N
    diskVolumes.sort((a,b) => b.usedPct - a.usedPct)
    const diskTop     = diskVolumes.slice(0, CFG.diskTopN)
    const diskCritN   = diskVolumes.filter(v => v.usedPct >= CFG.diskCritPct).length
    const diskWarnN   = diskVolumes.filter(v => v.usedPct >= CFG.diskWarnPct && v.usedPct < CFG.diskCritPct).length

    dbg(`Disco: ${diskVolumes.length} volumes ≥${CFG.diskWarnPct}% | crit=${diskCritN} warn=${diskWarnN} | VMs c/agente=${diskVmsWithAgent}`)

    // Total real: hosts com item Power state presente (ligados + desligados)
    const vmTotal  = vmsWithPS>0 ? vmsWithPS : Object.keys(byHost).length
    const vmsOff   = Math.max(0, vmTotal-vmsOn)
    const vN       = vmsOn||null
    const avgCpu   = vN?+(sumCpu/vN).toFixed(1):null
    const avgRam   = vN?+(sumRam/vN).toFixed(1):null
    const balloonGb= +(totalBalloonB/1_073_741_824).toFixed(2)
    const swapGb   = +(totalSwapB/1_073_741_824).toFixed(2)
    const agentPct = vN?Math.round((agentCount/vN)*100):null

    let cpuDelta=null
    const ev=Object.values(earlyM)
    if (ev.length>0){ const ea=ev.reduce((a,b)=>a+b,0)/ev.length; cpuDelta=avgCpu!=null?+(avgCpu-ea).toFixed(1):null }

    const usedStorB   = storM.totalB-storM.freeB
    const committedPct= storM.totalB>0?Math.round((usedStorB/storM.totalB)*100):0

    const stateLabel = trigM.worstPrio>=CFG.critPriority?'CRÍTICO':trigM.total>0?'DEGRADADO':'OK'
    const stateColor = trigM.worstPrio>=CFG.critPriority?C.crit:trigM.total>0?C.warn:C.ok

    dbg(`VMs: total=${vmTotal} on=${vmsOn} off=${vmsOff} stale=${staleCount}`)

    return {
      vmTotal, vmsOn, vmsOff, staleCount,
      avgCpu, worstCpu:+worstCpu.toFixed(1), worstCpuName, worstCpuId, cpuDelta,
      avgRam, worstRam:+worstRam.toFixed(1), worstRamName, worstRamId,
      totalVCpus:Math.round(totalVCpus), totalRamB, usedRamB,
      balloonGb, swapGb, pressAndHighCpu,
      totalStorB:storM.totalB, freeStorB:storM.freeB, usedStorB, committedPct,
      dsCount:storM.dsCount, dsHasData:storM.hasData, worstDs:storM.worstDs,
      // Disco por volume
      diskTop, diskCritN, diskWarnN, diskVmsWithAgent,
      vmsRecentReboot, agentCount, agentPct,
      hvCount:Object.keys(hypervisors).length,
      triggers:trigM, stateLabel, stateColor,
      sparkCpu:bucketAvg(spCpu), sparkRam:bucketAvg(spRam), sparkBall:bucketAvg(spBall),
    }
  }


  // ────────────────────────────────────────────────────────────────
  // [8] RENDER
  // ────────────────────────────────────────────────────────────────

  const buildCards = d => {
    const cpuCol  = accentFor(d.worstCpu,  THEME.cpuWarnPct,  THEME.cpuCritPct)
    const ramCol  = accentFor(d.worstRam,  THEME.ramWarnPct,  THEME.ramCritPct)
    const ballCol = d.balloonGb>THEME.balloonWarnGb?C.warn:C.ok
    const swapCol = d.swapGb>THEME.swapCritGb?C.crit:d.swapGb>THEME.swapWarnGb?C.warn:C.ok
    const pressCol= d.swapGb>THEME.swapCritGb?C.crit:d.balloonGb>THEME.balloonWarnGb?C.warn:C.ok
    const vmCol   = d.vmsOff>0?C.warn:C.ok
    const agCol   = d.agentPct>=80?C.ok:d.agentPct>=50?C.warn:C.crit
    const trigCol = d.triggers.worstPrio>=CFG.critPriority?C.crit:d.triggers.total>0?C.warn:C.ok

    const zbBase = `${CFG.zabbixUrl}/zabbix/zabbix.php?action=problem.view&filter_groupids[]=${CFG.groupId}&filter_show=1&filter_set=1`
    const gfUrl  = (id,dash) => `${CFG.grafanaUrl}${dash}${id?'?var-hostid='+id:''}`
    // Ficha híbrida: a variável hostid é MySQL com __value = host TÉCNICO
    // (VS8000345), não o nome visível nem o hostid — extrair o código do
    // nome visível (mesma regra extractHostName dos painéis L3)
    const techOf = (name) => { const s=String(name||'').split('(')[0].trim().split(/\s*-\s*/); return s[s.length-1].trim() }
    const fichaUrl = (vmName, panelId) => vmName && vmName!=='—'
      ? `${CFG.grafanaUrl}${CFG.grafanaDash.vmFicha}?var-hostid=${encodeURIComponent(techOf(vmName))}${panelId?'&viewPanel='+panelId:''}`
      : '#'
    const tc     = d.triggers.byPrio

    // Card 1 · VMs ligadas
    const c1 = T.card(vmCol, 'VMs ligadas',
      `<div class="bpc-big" style="color:${vmCol};">${d.vmsOn}<span class="bpc-big-suffix"> / ${d.vmTotal}</span></div>`,
      T.pbar((d.vmsOn/Math.max(d.vmTotal,1))*100, vmCol)
      + T.powerGrid(d.vmsOn,vmCol, d.vmsOff,d.vmsOff>0?C.warn:C.mute, d.staleCount,d.staleCount>0?C.warn:C.mute)
      + T.sep()
      + T.badges(
          T.badge(`${d.totalVCpus} vCPU`,C.mute),
          T.badge(`${d.hvCount} hypervisors`,C.mute),
          d.vmsRecentReboot>0?T.badge(`${d.vmsRecentReboot} reboot <24h`,C.warn):'',
        )
    )

    // Card 2 · CPU pior VM
    const c2 = T.card(cpuCol,'CPU · pior VM',
      T.gaugeBlock(d.worstCpu,cpuCol,`avg ${pct(d.avgCpu,1)}`,d.sparkCpu,0.40),
      `<div class="bpc-cpu-ctx">${T.trend(d.cpuDelta)}</div>`
      +`<div class="bpc-cpu-ctx" style="margin-top:2px;">
          <span style="color:${C.info};font-family:${THEME.fontMono};">${d.vmsOn}</span>
          <span style="color:${C.mute};"> VMs · </span>
          <span style="color:${C.info};font-family:${THEME.fontMono};">${d.totalVCpus}</span>
          <span style="color:${C.mute};"> vCPU</span>
        </div>`
      +T.infoBox([['pior VM',d.worstCpuName,cpuCol],['avg grupo',pct(d.avgCpu,1),C.info]]),
      T.drill(fichaUrl(d.worstCpuName,CFG.grafanaDash.vmCpuPanelId),'CPU da pior VM',cpuCol)
    )

    // Card 3 · RAM pior VM
    const c3 = T.card(ramCol,'RAM · pior VM',
      T.gaugeBlock(d.worstRam,ramCol,`avg ${pct(d.avgRam,1)}`,d.sparkRam,0.40),
      T.sub(`<span style="color:${C.info};font-size:11px;font-family:${THEME.fontMono};">
        ${fmtBytes(d.usedRamB)} <span style="color:${C.mute};">/ ${fmtBytes(d.totalRamB)}</span>
      </span>`)
      +T.infoBox([['pior VM',d.worstRamName,ramCol],['avg grupo',pct(d.avgRam,1),C.info]]),
      T.drill(fichaUrl(d.worstRamName,CFG.grafanaDash.vmRamPanelId),'RAM da pior VM',ramCol)
    )

    // Card 4 · Pressão RAM
    const pressActive = d.balloonGb>THEME.balloonWarnGb||d.swapGb>THEME.swapWarnGb
    const c4 = T.card(pressCol,'Pressão de memória',
      `<div class="bpc-big" style="color:${ballCol};">${d.balloonGb.toFixed(2)}<span class="bpc-big-suffix"> GB balloon</span></div>`,
      T.sub(`swap: <span style="color:${swapCol};font-weight:600;">${d.swapGb.toFixed(2)} GB</span>`)
      +(d.sparkBall?.length>=2?`<div class="bpc-spark" style="margin:3px 0;">${T.spark(d.sparkBall,pressCol,148,20,0.40)}</div>`:'')
      +T.sep()
      +T.note(
        pressActive
          ?`⚠ O hypervisor está a <strong style="color:${pressCol};">recuperar memória das VMs</strong>. Balloon e swap elevados degradam o desempenho.`
          :`✓ Sem pressão de memória — balloon e swap em valores normais.`,
        pressActive?pressCol:C.ok
      )
      +(d.pressAndHighCpu>0?T.badges(T.badge(`${d.pressAndHighCpu} VMs: pressão + CPU alto`,C.crit)):'')
    )

    // Card 5 · Storage · Volumes VM
    // Fonte: itens vfs.fs.size[*,used/total] via agente Windows (grupo 609)
    // Hero: contagem de volumes críticos + em aviso
    // Contexto: top N volumes por % utilização
    const diskHeroCol = d.diskCritN > 0 ? C.crit : d.diskWarnN > 0 ? C.warn : C.ok
    const diskHeroVal = d.diskCritN > 0
      ? `${d.diskCritN}<span class="bpc-big-suffix"> vol crítico${d.diskCritN>1?'s':''}</span>`
      : d.diskWarnN > 0
      ? `${d.diskWarnN}<span class="bpc-big-suffix"> vol em aviso</span>`
      : `<span style="font-size:20px;">✓</span><span class="bpc-big-suffix"> sem alertas</span>`

    const zbDiskUrl = `${CFG.zabbixUrl}/zabbix/zabbix.php?action=problem.view`
      + `&filter_groupids[]=${CFG.groupId}&filter_show=1&filter_set=1`
      + `&filter_severity[]=3&filter_severity[]=4&filter_set=1`

    const c5 = T.card(diskHeroCol, 'Storage · volumes VM',
      `<div class="bpc-big" style="color:${diskHeroCol};">${diskHeroVal}</div>`,
      T.badges(
        d.diskCritN > 0 ? T.badge(`${d.diskCritN} ≥ ${CFG.diskCritPct}%`, C.crit) : '',
        d.diskWarnN > 0 ? T.badge(`${d.diskWarnN} ≥ ${CFG.diskWarnPct}%`, C.warn) : '',
        T.badge(`${d.diskVmsWithAgent} VMs c/ agente`, C.mute),
      )
      + T.sep()
      + T.diskVolumeList(d.diskTop, CFG.diskWarnPct, CFG.diskCritPct)
      + (d.diskVmsWithAgent === 0
        ? T.note('⚠ Nenhuma VM com agente no grupo — sem dados de disco interno. Instalar o Zabbix Agent para visibilidade dos volumes.', C.warn)
        : ''),
      d.diskCritN > 0 || d.diskWarnN > 0
        ? T.drill(zbDiskUrl, 'ver triggers de disco', diskHeroCol)
        : ''
    )

    // Card 6 · Triggers
    const critCount=tc[5]+tc[4], warnCount=tc[3]+tc[2], infoCount=tc[1]+tc[0]
    const c6 = T.card(trigCol,'Triggers activos',
      `<div class="bpc-big" style="color:${trigCol};">${d.triggers.total}<span class="bpc-big-suffix"> activos</span></div>`,
      `<div class="bpc-trig-grid">
        ${T.trigRow('CRIT',critCount,C.crit,[4,5],zbBase)}
        ${T.trigRow('WARN',warnCount,C.warn,[2,3],zbBase)}
        ${T.trigRow('INFO',infoCount,C.info,[0,1],zbBase)}
      </div>`
      +T.sep()
      +T.badges(
        critCount>0?T.badge(`${critCount} crítico${critCount>1?'s':''}`,C.crit):'',
        warnCount>0?T.badge(`${warnCount} aviso${warnCount>1?'s':''}`,C.warn):'',
        d.triggers.total===0?T.badge('sem alertas',C.ok):'',
      ),
      T.drill(`${CFG.grafanaUrl}${CFG.grafanaDash.problems}`,'ver todos os problemas',trigCol)
    )

    // Card 7 · Visibilidade métricas
    const blindSpots = d.vmsOn-d.agentCount
    const c7 = T.card(agCol,'Visibilidade métricas',
      `<div class="bpc-big" style="color:${agCol};">${d.agentPct!=null?d.agentPct.toFixed(0):'—'}<span class="bpc-big-suffix">% cobertura</span></div>`,
      T.pbar(d.agentPct||0,agCol)
      +T.infoBox([['c/ agente',`${d.agentCount} VMs`,agCol],['só VMware',`${blindSpots} VMs`,blindSpots>0?C.warn:C.mute]])
      +T.sep()
      +T.note(
        blindSpots>0
          ?`<span style="color:${C.warn};">⚠ ${blindSpots} VMs sem agente</span> — CPU e RAM via VMware apenas (menos precisão). Sem métricas de SO, processos ou disco interno.`
          :`✓ Todas as VMs com agente — visibilidade completa a nível de SO.`,
        null
      )
    )

    return T.panel(c1+c2+c3+c4+c5+c6+c7, d.stateLabel, d.stateColor, CFG.groupId)
  }


  // ────────────────────────────────────────────────────────────────
  // [9] BOOTSTRAP
  // ────────────────────────────────────────────────────────────────

  function start(rpc) {
    window.BPC.utils.waitForElement(CFG.elementId, function (el) {

      if (window.BPC.utils.buildSkeleton) {
        el.innerHTML = window.BPC.utils.buildSkeleton('var(--bpc-info)')
      }

      let pending = false

      const load = () => {
        if (pending) return
        pending = true

        fetchData(rpc)
          .then(computeMetrics)
          .then(d => {
            el.innerHTML = buildCards(d)
          })
          .catch(err => {
            if (CFG.debug) console.error('[BPC v4.3]', err)
            BPC.log(`[BPC] n2-vms-kpi v4.3 error: ${err?.message||err}`, 'error')

            const cls = classifyError(err)
            el.innerHTML = T.errorCard(
              cls.code,
              cls.title,
              cls.detail,
              cls.action,
              err?.message||String(err)
            )
          })
          .finally(() => { pending = false })
      }

      load()
      window.BPC.utils.startRefresh(el, load, CFG.refreshMs)
    })
  }

  // [BPC] v4.3.1 - protege contra corrida de carregamento: o painel do
  // cabecalho (header-global) pode ainda nao ter definido window.waitForBPC
  // quando este painel arranca. Sem isto, lanca "window.waitForBPC is not a
  // function" sem ser apanhado, o que derruba TODO o dashboard (nao so este painel).
  function initWithRetry(attempt) {
    attempt = attempt || 0
    if (typeof window.waitForBPC === 'function') {
      window.waitForBPC(start)
      return
    }
    if (attempt > 50) {
      console.error('[BPC] n2-vms-kpi: window.waitForBPC nunca ficou disponivel')
      return
    }
    setTimeout(function () { initWithRetry(attempt + 1) }, 100)
  }

  initWithRetry()

}())