(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · ROW 2 · DISCO & I/O  v1.0                             ║
  // ║  Autor: BPC                                                              ║
  // ║                                                                          ║
  // ║  ARQUITECTURA (idêntica ao ROW 1 · KPI GOLDEN SIGNALS v10):            ║
  // ║  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌────────────────┐    ║
  // ║  │ BLOCO 1  │  │ BLOCO 2  │  │    BLOCO 3    │  │   BLOCO 4     │    ║
  // ║  │ Config   │  │ Utils    │  │   Resolver    │  │   CSS         │    ║
  // ║  │ (editar  │  │ (helpers │  │   disk2       │  │               │    ║
  // ║  │ aqui!)   │  │ puros)   │  │               │  │               │    ║
  // ║  └──────────┘  └──────────┘  └───────────────┘  └────────────────┘    ║
  // ║  ┌────────────────────────────────────────────────────────────────┐    ║
  // ║  │  BLOCO 5 · Componentes SVG (donut, badge)                     │    ║
  // ║  └────────────────────────────────────────────────────────────────┘    ║
  // ║  ┌────────────────────────────────────────────────────────────────┐    ║
  // ║  │  BLOCO 6 · Card HTML                                          │    ║
  // ║  └────────────────────────────────────────────────────────────────┘    ║
  // ║  ┌────────────────────────────────────────────────────────────────┐    ║
  // ║  │  BLOCO 7 · API Zabbix                                         │    ║
  // ║  └────────────────────────────────────────────────────────────────┘    ║
  // ║  ┌────────────────────────────────────────────────────────────────┐    ║
  // ║  │  BLOCO 8 · Bootstrap                                          │    ║
  // ║  └────────────────────────────────────────────────────────────────┘    ║
  // ╚══════════════════════════════════════════════════════════════════════════╝
///* <div id="bt-kpi-disk2"></div> 

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 1 · CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════
  //
  // ⚠️  TÉCNICOS NOC: este é o único bloco que precisam editar.
  //

  var CFG = {

    // ── Proxy para a API Zabbix (construído no bootstrap a partir destes) ────
    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'

    // ── ID do elemento HTML raiz onde o painel é injectado ──────────────────
    rootId: 'bt-kpi-disk2',

    // ── Idade máxima (segundos) para um item ser considerado activo ──────────
    maxAgeSec: {
      agent:  7200,   // 2h
      vmware: 600,   // 10 minutos
    },

    // ── Limiares de alerta — partições (%) ──────────────────────────────────
    thresholds: {
      disk:    { warn: 75,  crit: 90  },  // % espaço usado — canónico engenharia-do-sistema.md §6.2
      ioOps:   { warn: 50,  crit: 100 },  // operações/s
      ioLatW:  { warn: 10,  crit: 50  },  // ms latência escrita
      ioLatR:  { warn: 10,  crit: 50  },  // ms latência leitura
      ioQueue: { warn: 1,   crit: 5   },  // queue depth
      ioUtil:  { warn: 60,  crit: 85  },  // % utilização por idle
    },

    // ── Paleta de cores (idêntica ao ROW 1 para consistência visual) ─────────
    colors: {
      io:   '#F44336',
      ok:   '#3FB950',
      warn: '#D29922',
      crit: '#F85149',
      info: '#58A6FF',
      mute: '#2D333B',
      sub:  '#6E7681',
      text: '#CDD9E5',
      brd:  '#1C2128',
    },

    // ── Nomes dos itens Zabbix (fallback quando key_ não bate) ──────────────
    itemNames: {
      // Por partição — substituir X pela letra (C, D, F…)
      spaceUtil:  'Space utilization',      // "(X:): Space utilization"
      spaceTotal: 'Total space',            // "(X:): Total space"
      spaceUsed:  'Used space',             // "(X:): Used space"

      // I/O global _Total
      diskWriteRate:   '_Total: Disk write rate',
      diskReadRate:    '_Total: Disk read rate',
      diskWriteLat:    '_Total: Disk write request avg waiting time',
      diskReadLat:     '_Total: Disk read request avg waiting time',
      diskQueueTotal:  '_Total: Disk average queue size (avgqu-sz)',
      diskUtilIdle:    '_Total: Disk utilization by idle time',

      // VMware fallback
      storComm:   'VMware: Committed storage space',
      storUncomm: 'VMware: Uncommitted storage space',
    },

    // ── Máximo de partições a mostrar em donuts ──────────────────────────────
    // Partições além deste limite são ignoradas (evita layout partido)
    maxDisks: 6,

    // ── Janelas de tempo ─────────────────────────────────────────────────────
    historyWindowSecs: 21600,   // 6h de histórico

    // ── Limites de resultados das chamadas API ───────────────────────────────
    apiLimits: { items: 50000, history: 10000, triggers: 20000 },

    // ── Retry com backoff exponencial (sem circuit breaker do BPC Runtime) ───
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 2 · UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════
  // Cópia fiel do BLOCO 2 do ROW 1 — funções puras, sem side-effects.

  // PROXY construído a partir do CFG — nunca hardcoded
  var PROXY = CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api';

  function fetchWithRetry(url, body, signal, attempt) {
    attempt = attempt || 0;
    var maxAttempts = CFG.retry ? CFG.retry.maxAttempts : 3;
    var baseDelayMs = CFG.retry ? CFG.retry.baseDelayMs : 1000;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal
    })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .catch(function (err) {
      if (err.name === 'AbortError') throw err;
      if (attempt >= maxAttempts - 1) throw err;
      return new Promise(function (res) {
        setTimeout(res, baseDelayMs * Math.pow(2, attempt));
      }).then(function () {
        return fetchWithRetry(url, body, signal, attempt + 1);
      });
    });
  }

  var U = {

    esc: function (s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    // Card de erro explícito (causa + acção correctiva)
    renderErro: function (causa, accao) {
      return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
        + 'border-radius:6px;padding:12px 14px;font-family:\'IBM Plex Mono\',monospace;">'
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; DISCO &amp; I/O</div>'
        + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
        + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
        + '</div>';
    },

    gi: function (items, name) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].name === name) return items[i];
      }
      return null;
    },

    gcFirst: function (items, substr) {
      for (var i = 0; i < items.length; i++) {
        if (items[i].name && items[i].name.indexOf(substr) >= 0) return items[i];
      }
      return null;
    },

    buildKeyIndex: function (items) {
      var idx = {};
      for (var i = 0; i < items.length; i++) {
        if (items[i].key_) idx[items[i].key_] = items[i];
      }
      return idx;
    },

    gk: function (byKey, items, key, name) {
      if (key && byKey[key]) return byKey[key];
      if (name) return U.gi(items, name);
      return null;
    },

    hasAgentInterface: function (interfaces) {
      if (!interfaces || !interfaces.length) return false;
      for (var i = 0; i < interfaces.length; i++) {
        if (String(interfaces[i].type) === '1') return true;
      }
      return false;
    },

    isActive: function (item, maxAgeSec) {
      if (!item) return false;
      if (String(item.state) === '1') return false;
      if (!item.lastvalue || item.lastvalue === '') return false;
      var clock = parseInt(item.lastclock || 0, 10);
      if (!clock) return false;
      var ageSec = Math.floor(Date.now() / 1000) - clock;
      return ageSec < (maxAgeSec || 300);
    },

    isValid: function (v) {
      return v !== null && v !== undefined && !isNaN(v);
    },

    fmtPct: function (v) {
      return U.isValid(v) ? v.toFixed(1) + '%' : '—';
    },

    fmtBytes: function (b) {
      if (!U.isValid(b) || b <= 0) return '—';
      if (b >= 1099511627776) return (b / 1099511627776).toFixed(1) + ' TB';
      if (b >= 1073741824)    return (b / 1073741824).toFixed(1) + ' GB';
      if (b >= 1048576)       return (b / 1048576).toFixed(0) + ' MB';
      return (b / 1024).toFixed(0) + ' KB';
    },

    fmtOps: function (v, unit) {
      if (!U.isValid(v)) return '—';
      return v.toFixed(1) + ' ' + (unit || '');
    },

    fmtMs: function (v) {
      if (!U.isValid(v)) return '—';
      // Zabbix devolve latência em segundos nalguns templates — normaliza
      // Se valor < 1 e não for zero assume que está em segundos → converte
      var ms = (v > 0 && v < 1) ? v * 1000 : v;
      return ms.toFixed(2) + ' ms';
    },

    thrColor: function (val, thr) {
      if (!U.isValid(val)) return CFG.colors.sub;
      if (val >= thr.crit) return CFG.colors.crit;
      if (val >= thr.warn) return CFG.colors.warn;
      return CFG.colors.ok;
    },

    thrClass: function (val, thr) {
      if (!U.isValid(val)) return 'muted';
      if (val >= thr.crit) return 'crit';
      if (val >= thr.warn) return 'warn';
      return 'ok';
    },

    rgb: function (h) {
      h = h.trim().replace('#', '');
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
    },

    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 3 · RESOLVER DISK2
  // ════════════════════════════════════════════════════════════════════════════
  //
  // Lógica de resolução:
  //
  //   1. Descobre partições via regex no name → "(X:): Space utilization"
  //      (Opção B — universal, sem depender de tags)
  //   2. Por cada partição, tenta obter Total e Used space
  //   3. Se nenhuma partição activa → tenta VMware committed/uncommitted
  //   4. I/O: usa sempre _Total (visão global de saturação do disco)
  //      Sem I/O no fallback VMware (não há dados equivalentes)
  //

  var Resolver = {

    disk2: function (items, byKey, hasAgentIface) {
      var N  = CFG.itemNames;
      var MA = CFG.maxAgeSec;

      // ── PARTIÇÕES: Opção C (A não disponível via item.get simples) ─────────
      //
      // Opção B primária: regex no name
      // Opção A tentada: se item tiver tags com filesystem → usa label da tag
      // Na prática o item.get sem selectTags não devolve tags,
      // por isso usamos B como base e ficamos robustos.
      //
      var agentDisks = [];
      var seen = {};

      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.name) continue;

        // Padrão: "(C:): Space utilization" ou "New Volume(F:): Space utilization"
        var m = it.name.match(/\(([A-Z]:)\):\s*Space utilization/i);
        if (!m) continue;

        var lbl = m[1].toUpperCase(); // "C:", "F:", etc.
        if (seen[lbl]) continue;
        seen[lbl] = true;

        // Só aceita se o item de espaço estiver activo
        if (!U.isActive(it, MA.agent)) continue;

        var pct = parseFloat(it.lastvalue);

        // Tenta encontrar Total e Used para este volume
        // Padrão Zabbix: "(C:): Total space" ou "New Volume(C:): Total space"
        var totalIt = U.gcFirst(items, '(' + lbl + '): Total space');
        var usedIt  = U.gcFirst(items, '(' + lbl + '): Used space');
        var total   = (totalIt && U.isActive(totalIt, MA.agent)) ? parseFloat(totalIt.lastvalue) : null;
        var used    = (usedIt  && U.isActive(usedIt,  MA.agent)) ? parseFloat(usedIt.lastvalue)  : null;

        // Ignora volumes com 0 bytes (unmounted, etc.)
        if (!U.isValid(pct) || pct < 0) continue;
        if (!U.isValid(total) || total <= 0) continue;

        agentDisks.push({
          label:    lbl,
          pct:      pct,
          used:     used,
          total:    total,
          isVmware: false,
        });

        if (agentDisks.length >= CFG.maxDisks) break;
      }

      // Ordena por letra (C: antes de D: antes de F:…)
      agentDisks.sort(function (a, b) { return a.label.localeCompare(b.label); });

      // ── I/O GLOBAL (_Total) ────────────────────────────────────────────────
      //
      // Procura por name exacto (Opção B) — key_ é complexa e varia por disco.
      // Se não encontrar _Total, tenta fallback para qualquer disco disponível.
      //
      var ioData = Resolver._resolveIO(items, byKey, MA);

      // ── RESULTADO: Agente com partições ───────────────────────────────────
      if (agentDisks.length > 0) {
        return {
          disks:    agentDisks,
          io:       ioData,
          source:   'Agente',
          hasAgent: hasAgentIface,
          noData:   false,
        };
      }

      // ── FALLBACK VMware: storage committed/uncommitted ─────────────────────
      var commItem   = U.gi(items, N.storComm);
      var uncommItem = U.gi(items, N.storUncomm);
      var comm   = commItem   && U.isActive(commItem,   MA.vmware) ? parseFloat(commItem.lastvalue)   : null;
      var uncomm = uncommItem && U.isActive(uncommItem, MA.vmware) ? parseFloat(uncommItem.lastvalue) : null;

      if (U.isValid(comm) && comm > 0) {
        // VMware não devolve % directa — calcula a partir de committed/(committed+uncommitted)
        var totalVmw = U.isValid(uncomm) ? comm + uncomm : null;
        var pctVmw   = (totalVmw && totalVmw > 0) ? (comm / totalVmw * 100) : null;
        return {
          disks: [{
            label:    'VM',
            pct:      pctVmw,
            used:     comm,
            total:    totalVmw,
            isVmware: true,
          }],
          io:       { ioW: null, ioR: null, ioWLat: null, ioRLat: null, ioQueue: null, ioUtil: null },
          source:   'VMware',
          hasAgent: false,
          noData:   false,
        };
      }

      // ── Sem dados de nenhuma fonte ─────────────────────────────────────────
      return {
        disks:    [],
        io:       { ioW: null, ioR: null, ioWLat: null, ioRLat: null, ioQueue: null, ioUtil: null },
        source:   '—',
        hasAgent: false,
        noData:   true,
      };
    },

    // Resolve I/O a partir de _Total — fallback gracioso se não existir
    _resolveIO: function (items, byKey, MA) {
      var N = CFG.itemNames;

      function getVal(name) {
        var it = U.gi(items, name);
        if (!it || !U.isActive(it, MA.agent)) return null;
        return parseFloat(it.lastvalue);
      }

      var ioW     = getVal(N.diskWriteRate);
      var ioR     = getVal(N.diskReadRate);
      var ioWLat  = getVal(N.diskWriteLat);
      var ioRLat  = getVal(N.diskReadLat);
      var ioQueue = getVal(N.diskQueueTotal);
      var ioUtil  = getVal(N.diskUtilIdle);

      // Normaliza latência: Zabbix devolve em segundos em alguns templates
      // Se valor em [0.001, 0.999] → assume segundos → converte para ms
      function normLat(v) {
        if (!U.isValid(v)) return null;
        return (v > 0 && v < 1) ? v * 1000 : v;
      }

      return {
        ioW:     ioW,
        ioR:     ioR,
        ioWLat:  normLat(ioWLat),
        ioRLat:  normLat(ioRLat),
        ioQueue: ioQueue,
        ioUtil:  ioUtil,
      };
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 4 · CSS
  // ════════════════════════════════════════════════════════════════════════════
  // Prefixo .kd2- para não colidir com .ks- do ROW 1.
  // Partilha a mesma filosofia visual: dark, monospace, badges coloridos.

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',

      // ── Reset & base ──────────────────────────────────────────────────────
      '#bt-kpi-disk2 *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-kpi-disk2{font-family:\'IBM Plex Mono\',\'Segoe UI\',monospace;}',

      '#bt-kpi-disk2 .kd2-root{display:flex;flex-direction:column;height:100%;}',

      // ── Card base ─────────────────────────────────────────────────────────
      '#bt-kpi-disk2 .kd2-card{background:rgba(255,255,255,0.015);border:1px solid '+C.brd+';border-radius:6px;padding:10px 13px 9px;position:relative;overflow:hidden;display:flex;flex-direction:column;}',
      '#bt-kpi-disk2 .kd2-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;border-radius:6px 6px 0 0;background:'+C.io+';}',

      // ── Cabeçalho ─────────────────────────────────────────────────────────
      '#bt-kpi-disk2 .kd2-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:4px;flex-shrink:0;}',
      '#bt-kpi-disk2 .kd2-head-left{display:flex;align-items:center;gap:5px;min-width:0;}',
      '#bt-kpi-disk2 .kd2-label{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:'+C.sub+';white-space:nowrap;}',
      '#bt-kpi-disk2 .kd2-signal{font-size:8px;font-weight:700;letter-spacing:.06em;padding:1px 5px;border-radius:2px;white-space:nowrap;background:rgba(244,67,54,.15);color:'+C.io+';}',

      // ── Badges de fonte (idêntico ao ROW 1) ───────────────────────────────
      '#bt-kpi-disk2 .kd2-badge{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;border-radius:3px;white-space:nowrap;line-height:1.3;}',
      '#bt-kpi-disk2 .kd2-badge.agente  {border:1px solid rgba(63,185,80,.3);background:rgba(63,185,80,.13);color:'+C.ok+';}',
      '#bt-kpi-disk2 .kd2-badge.vmware  {border:1px solid rgba(88,166,255,.3);background:rgba(88,166,255,.13);color:'+C.info+';}',
      '#bt-kpi-disk2 .kd2-badge.no-agent{border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.13);color:'+C.crit+';}',

      // ── Grid de donuts ────────────────────────────────────────────────────
      // Flexbox wrap: 1 a 6 donuts, adapta-se ao número real
      '#bt-kpi-disk2 .kd2-donuts{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start;align-items:flex-start;flex:1;}',
      '#bt-kpi-disk2 .kd2-donut-wrap{display:flex;flex-direction:column;align-items:center;gap:4px;min-width:90px;}',
      '#bt-kpi-disk2 .kd2-donut-lbl{font-size:13px;font-weight:700;color:'+C.text+';letter-spacing:.04em;}',
      '#bt-kpi-disk2 .kd2-donut-sub{font-size:9px;color:'+C.sub+';text-align:center;line-height:1.4;}',
      '#bt-kpi-disk2 .kd2-donut-pct{font-size:11px;font-weight:700;margin-top:1px;}',

      // ── Sem dados ─────────────────────────────────────────────────────────
      '#bt-kpi-disk2 .kd2-nodata{color:'+C.sub+';font-size:10px;padding:8px 0;flex:1;display:flex;align-items:center;}',

      // ── Separador ─────────────────────────────────────────────────────────
      '#bt-kpi-disk2 .kd2-sep{height:1px;background:rgba(255,255,255,0.06);flex-shrink:0;margin:6px 0;}',

      // ── Grid de badges I/O ────────────────────────────────────────────────
      // 6 colunas × 1 linha = 6 métricas em linha (full-width)
      '#bt-kpi-disk2 .kd2-io-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;flex:1;}',

      // ── Badge I/O individual ──────────────────────────────────────────────
      // Design: valor grande no topo, badge colorido no meio, label pequeno em baixo
      '#bt-kpi-disk2 .kd2-io-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:6px 4px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:5px;}',
      '#bt-kpi-disk2 .kd2-io-val{font-size:18px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;text-align:center;}',
      '#bt-kpi-disk2 .kd2-io-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:3px;text-align:center;line-height:1.3;}',
      '#bt-kpi-disk2 .kd2-io-badge.ok   {border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.15);color:'+C.ok+';}',
      '#bt-kpi-disk2 .kd2-io-badge.warn {border:1px solid rgba(210,153,34,.35);background:rgba(210,153,34,.15);color:'+C.warn+';}',
      '#bt-kpi-disk2 .kd2-io-badge.crit {border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.15);color:'+C.crit+';}',
      '#bt-kpi-disk2 .kd2-io-badge.muted{border:1px solid rgba(46,51,59,.8);background:rgba(46,51,59,.3);color:'+C.sub+';}',
      '#bt-kpi-disk2 .kd2-io-key{font-size:8px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;text-align:center;}',

      // ── Animação de pulso para crítico ────────────────────────────────────
      '@keyframes kd2-pulse{0%,100%{opacity:1;}50%{opacity:.55;}}',
      '#bt-kpi-disk2 .kd2-pulse{animation:kd2-pulse 1.6s ease-in-out infinite;}',

      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 5 · COMPONENTES SVG
  // ════════════════════════════════════════════════════════════════════════════

  var SVG = {

    /**
     * Badge de fonte — idêntico ao ROW 1 para consistência.
     */
    sourceBadge: function (source, hasAgent) {
      if (hasAgent) {
        return '<span class="kd2-badge agente">AGENTE</span>';
      }
      if (source === 'VMware') {
        return '<span class="kd2-badge no-agent">SEM AGENTE</span>'
             + '<span class="kd2-badge vmware" style="margin-left:4px;">VMware</span>';
      }
      return '<span class="kd2-badge no-agent">SEM AGENTE</span>';
    },

    /**
     * Donut SVG para partição.
     *
     * Raio exterior: 38px. Stroke-width: 9px.
     * Centro: percentagem + label da partição.
     * Cor varia com threshold.
     *
     * @param {number|null} pct    - percentagem usada (0-100) ou null
     * @param {string}      label  - "C:", "F:", "VM"
     * @param {string}      color  - cor do arco activo
     * @param {boolean}     pulse  - true se crítico (anima)
     */
    donut: function (pct, label, color, pulse) {
      var size = 90;
      var cx   = size / 2;
      var cy   = size / 2;
      var r    = 34;
      var sw   = 9;
      var circ = 2 * Math.PI * r;

      var safe    = (U.isValid(pct) && pct >= 0) ? Math.min(100, pct) : 0;
      var dashArr = (safe / 100) * circ;
      var dashOff = circ - dashArr;

      // Texto central
      var cTxt = U.isValid(pct) ? pct.toFixed(0) + '%' : '—';
      var cCol = U.isValid(pct) ? color : CFG.colors.sub;

      var pulseAttr = pulse ? ' class="kd2-pulse"' : '';

      return '<svg width="'+size+'" height="'+size+'"'
        +' viewBox="0 0 '+size+' '+size+'"'
        +' style="display:block;overflow:visible;"'
        + pulseAttr + '>'
        // Anel de fundo
        +'<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'"'
        +' fill="none" stroke="rgba(255,255,255,0.07)"'
        +' stroke-width="'+sw+'"/>'
        // Arco activo — começa no topo (-90°)
        +(safe > 0
          ? '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'"'
            +' fill="none" stroke="'+color+'"'
            +' stroke-width="'+sw+'"'
            +' stroke-linecap="round"'
            +' stroke-dasharray="'+dashArr.toFixed(2)+' '+circ.toFixed(2)+'"'
            +' transform="rotate(-90 '+cx+' '+cy+')"'
            +' opacity="0.92"/>'
          : '')
        // Texto %
        +'<text x="'+cx+'" y="'+(cy + 1)+'"'
        +' text-anchor="middle" dominant-baseline="middle"'
        +' font-family="\'IBM Plex Mono\',monospace"'
        +' font-size="15" font-weight="700"'
        +' fill="'+cCol+'">'+cTxt+'</text>'
        +'</svg>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 6 · CARD HTML
  // ════════════════════════════════════════════════════════════════════════════

  var Card = {

    /**
     * Constrói o HTML completo do card Disco + I/O.
     *
     * Layout:
     *   ┌─────────────────────────────────────────────────────────┐
     *   │  [col esquerda — donuts]  │  [col direita — I/O badges] │
     *   └─────────────────────────────────────────────────────────┘
     */
    disk2: function (d) {
      return '<div class="kd2-root">'
        + Card._colIO(d)
        + '</div>';
    },

    // ── Coluna esquerda: partições ────────────────────────────────────────
    _colDonuts: function (d) {
      var thr = CFG.thresholds.disk;
      var C   = CFG.colors;

      var donutsHtml = '';

      if (d.noData || d.disks.length === 0) {
        donutsHtml = '<div class="kd2-nodata">Sem dados de disco disponíveis.</div>';
      } else {
        for (var i = 0; i < d.disks.length; i++) {
          var vol   = d.disks[i];
          var color = U.thrColor(vol.pct, thr);
          var pulse = U.isValid(vol.pct) && vol.pct >= thr.crit;

          // Linha de info: "72.1 GB / 127 GB"
          var infoLine = '';
          if (U.isValid(vol.used) && U.isValid(vol.total)) {
            infoLine = U.fmtBytes(vol.used) + ' / ' + U.fmtBytes(vol.total);
          } else if (U.isValid(vol.total)) {
            infoLine = 'Total: ' + U.fmtBytes(vol.total);
          }

          // Badge de aviso abaixo do sub (só se warn ou crit)
          var alertBadge = '';
          if (U.isValid(vol.pct) && vol.pct >= thr.crit) {
            alertBadge = '<span style="font-size:8px;font-weight:700;color:'+C.crit+';">⚠ CRÍTICO</span>';
          } else if (U.isValid(vol.pct) && vol.pct >= thr.warn) {
            alertBadge = '<span style="font-size:8px;font-weight:700;color:'+C.warn+';">⚠ ATENÇÃO</span>';
          }

          donutsHtml += '<div class="kd2-donut-wrap">'
            + SVG.donut(vol.pct, vol.label, color, pulse)
            + '<span class="kd2-donut-lbl">'+U.esc(vol.label)+'</span>'
            + (infoLine ? '<span class="kd2-donut-sub">'+U.esc(infoLine)+'</span>' : '')
            + alertBadge
            + '</div>';
        }
      }

      return '<div class="kd2-card">'
        +'<div class="kd2-head">'
        +'<div class="kd2-head-left">'
        +'<span class="kd2-label">DISCO · PARTIÇÕES</span>'
        +'</div>'
        + SVG.sourceBadge(d.source, d.hasAgent)
        +'</div>'
        +'<div class="kd2-donuts">'+donutsHtml+'</div>'
        +'</div>';
    },

    // ── Coluna direita: badges I/O ────────────────────────────────────────
    _colIO: function (d) {
      var io  = d.io;
      var thr = CFG.thresholds;
      var C   = CFG.colors;

      // Formata valor + define cor/classe por threshold
      function ioItem(rawVal, thrKey, label, unit, fmtFn) {
        var val   = rawVal;
        var vStr  = U.isValid(val) ? fmtFn(val) : '—';
        var color = U.thrColor(val, thr[thrKey]);
        var cls   = U.thrClass(val, thr[thrKey]);
        var pulse = cls === 'crit' ? ' kd2-pulse' : '';
        return '<div class="kd2-io-item">'
          +'<span class="kd2-io-val" style="color:'+color+';">'+U.esc(vStr)+'</span>'
          +'<span class="kd2-io-badge '+cls+pulse+'">'+U.esc(label)+'</span>'
          +'<span class="kd2-io-key">'+U.esc(unit)+'</span>'
          +'</div>';
      }

      // VMware fallback não tem I/O — mostra mensagem
      var ioGridHtml = '';
      if (d.source === 'VMware' || d.source === '—') {
        ioGridHtml = '<div class="kd2-nodata" style="font-size:9px;">I/O não disponível<br>sem agente activo</div>';
      } else {
        ioGridHtml = '<div class="kd2-io-grid">'
          + ioItem(io.ioW,     'ioOps',   'ESCRITA',   'w/s',  function(v){ return v.toFixed(1)+' w/s'; })
          + ioItem(io.ioR,     'ioOps',   'LEITURA',   'r/s',  function(v){ return v.toFixed(1)+' r/s'; })
          + ioItem(io.ioWLat,  'ioLatW',  'LAT.ESC',   'ms',   function(v){ return v.toFixed(2)+' ms'; })
          + ioItem(io.ioRLat,  'ioLatR',  'LAT.LT.',   'ms',   function(v){ return v.toFixed(2)+' ms'; })
          + ioItem(io.ioQueue, 'ioQueue', 'QUEUE',     'depth',function(v){ return v.toFixed(2); })
          + ioItem(io.ioUtil,  'ioUtil',  'UTIL.',     '% idle',function(v){ return v.toFixed(1)+'%'; })
          +'</div>';
      }

      // Fonte dos dados I/O
      var srcNote = d.hasAgent
        ? ''
        : '<span style="font-size:8px;color:'+C.sub+';margin-top:4px;">_Total · dados globais do disco</span>';

      return '<div class="kd2-card">'
        +'<div class="kd2-head">'
        +'<div class="kd2-head-left">'
        +'<span class="kd2-label">I/O · GLOBAL</span>'
        +'<span class="kd2-signal">_TOTAL</span>'
        +'</div>'
        + SVG.sourceBadge(d.source, d.hasAgent)
        +'</div>'
        + ioGridHtml
        + srcNote
        +'</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 7 · API ZABBIX
  // ════════════════════════════════════════════════════════════════════════════
  // Cópia fiel do BLOCO 7 do ROW 1 — sem lógica de negócio.

  var ZbxApi = {

    call: function (method, params) {
      var body = { jsonrpc: '2.0', id: 1, method: method, params: params };
      return fetchWithRetry(PROXY, body, undefined)
        .then(function (j) {
          if (j.error) throw new Error(j.error.data || j.error.message);
          return j.result;
        });
    },

    getHostId: function (hostName) {
      return ZbxApi.call('host.get', {
        output:           ['hostid'],
        filter:           { host: [hostName] },
        selectInterfaces: ['type'],
      }).then(function (hosts) {
        if (!hosts || hosts.length === 0) throw new Error('Host não encontrado: ' + hostName);
        return {
          hostid:     hosts[0].hostid,
          interfaces: hosts[0].interfaces || [],
        };
      });
    },

    getItems: function (hostid) {
      return ZbxApi.call('item.get', {
        hostids:   [hostid],
        output:    ['itemid', 'name', 'lastvalue', 'key_', 'lastclock', 'state', 'type'],
        monitored: true,
        limit:     CFG.apiLimits.items,
      });
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 8 · BOOTSTRAP
  // ════════════════════════════════════════════════════════════════════════════

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  console.log('[DISK2 v1.0] hostRaw:', hostRaw, '→', hostName);

  if (!hostName) {
    root.innerHTML = '<span style="color:'+CFG.colors.sub+';font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:'+CFG.colors.sub+';font-size:11px;">A carregar discos…</span>';

  ZbxApi.getHostId(hostName)
    .then(function (hostInfo) {
      var hasAgentIface = U.hasAgentInterface(hostInfo.interfaces);

      console.log('[DISK2 v1.0] hasAgentIface:', hasAgentIface);

      return ZbxApi.getItems(hostInfo.hostid)
        .then(function (items) {

          var byKey = U.buildKeyIndex(items);

          // ── DEBUG (descomenta para inspecionar itens de disco) ────────────
          // console.table(items.filter(function(i) {
          //   return i.name && (
          //     i.name.indexOf('Space utilization') >= 0 ||
          //     i.name.indexOf('Disk') >= 0 ||
          //     i.name.indexOf('VMware') >= 0
          //   );
          // }).map(function(i) {
          //   return {
          //     name:      i.name,
          //     key_:      i.key_,
          //     lastvalue: i.lastvalue,
          //     lastclock: i.lastclock,
          //     age_s:     Math.floor(Date.now()/1000) - parseInt(i.lastclock||0),
          //   };
          // }));

          var data = Resolver.disk2(items, byKey, hasAgentIface);

          root.innerHTML = CSS + Card.disk2(data);
        });
    })
    .catch(function (e) {
      console.error('[DISK2 v1.0] Erro:', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que a VM existe no Zabbix e que o proxy Grafana responde.');
    });

})();