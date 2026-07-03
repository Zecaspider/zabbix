(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · ROW 3 · CPU DETALHADO  v2.0                           ║
  // ║  Autor: BPC                                                              ║
  // ║                                                                          ║
  // ║  LAYOUT (Imagem 1):                                                     ║
  // ║  ┌──────────────────────────────┬──────────────────────────────────┐   ║
  // ║  │  Col A · CPU TEMPOS & SAT.   │  Col B · VMWARE CONTENÇÃO        │   ║
  // ║  │                              │                                   │   ║
  // ║  │  [AGENTE badge]              │  [AGENTE badge]                   │   ║
  // ║  │  BREAKDOWN DE TEMPOS         │  CPU READY     47.00%  [CRÍTICO]  │   ║
  // ║  │  ████████░░░░ USER  0.4%     │  texto explicativo                │   ║
  // ║  │  ████████░░░░ PRIV  5.5%     │  ──────────────────────────────   │   ║
  // ║  │  ░░░░░░░░░░░░ DPC   0.0%     │  CPU LATENCY   0.06%   [NORMAL]   │   ║
  // ║  │  ░░░░░░░░░░░░ INTR  0.0%     │  texto explicativo                │   ║
  // ║  │  ░░░░░░░░░░░░ IDLE  99.4%    │  ──────────────────────────────   │   ║
  // ║  │                              │  READINESS LAT 0.05%   [NORMAL]   │   ║
  // ║  │  SATURAÇÃO DO PROCESSADOR    │  texto explicativo                │   ║
  // ║  │  [  0  ]    [  362  ]        │                                   │   ║
  // ║  │  FILA    TROCAS/SEG.         │                                   │   ║
  // ║  └──────────────────────────────┴──────────────────────────────────┘   ║
  // ╚══════════════════════════════════════════════════════════════════════════╝


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 1 · CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  var CFG = {

    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId: 'bt-kpi-cpu3',

    maxAgeSec: {
      agent:  7200,
      // VMware usa proxy centralizado com polling ao vCenter — intervalo típico 20-45min.
      // Dados com até 2h de idade são válidos; "sem dados" só se o proxy estiver avariado.
      vmware: 7200,
    },

    // cpu: canónico engenharia-do-sistema.md §6.2. Sub-métricas abaixo (user/priv/dpc/...) não têm entrada canónica — mantidas.
    thresholds: {
      cpu:      { warn: 70,  crit: 90  },
      cpuUser:  { warn: 50,  crit: 75  },
      cpuPriv:  { warn: 20,  crit: 40  },
      cpuDPC:   { warn: 5,   crit: 15  },
      cpuIntr:  { warn: 5,   crit: 15  },
      queue:    { warn: 2,   crit: 8   },
      ctx:      { warn: 5000, crit: 15000 },
      vmwLat:   { warn: 5,   crit: 20  },
      vmwReady: { warn: 5,   crit: 20  },
    },

    colors: {
      cpu:    '#E8A020',
      ok:     '#3FB950',
      warn:   '#D29922',
      crit:   '#F85149',
      info:   '#58A6FF',
      mute:   '#2D333B',
      sub:    '#6E7681',
      text:   '#CDD9E5',
      brd:    '#1C2128',
      user:   '#58A6FF',
      priv:   '#BC8CFF',
      dpc:    '#F0883E',
      intr:   '#FF7B72',
      idle:   '#2D333B',
    },

    itemNames: {
      cpuUtil:   'CPU utilization',
      cpuUser:   'CPU user time',
      cpuPriv:   'CPU privileged time',
      cpuDPC:    'CPU DPC time',
      cpuIntr:   'CPU interrupt time',
      cpuIdle:   'CPU idle time',
      cpuQueue:  'CPU queue length',
      cpuCtx:    'Context switches per second',
      cpuCores:  'Number of CPUs',
      vmwCpuPct: 'VMware: CPU usage in percents',
      vmwCpuMhz: 'VMware: CPU usage',
      vmwLat:    'VMware: CPU latency in percents',
      vmwReady:  'VMware: CPU ready in percents',
      vmwRdyLat: 'VMware: CPU readiness latency in percents',
      vmwNumCPU: 'VMware: Number of virtual CPUs',
    },

    keysAgent: {
      cpuUtil:  'perf_counter_en["\\Processor(_Total)\\% Processor Time"]',
      cpuUser:  'perf_counter_en["\\Processor(_Total)\\% User Time"]',
      cpuPriv:  'perf_counter_en["\\Processor(_Total)\\% Privileged Time"]',
      cpuDPC:   'perf_counter_en["\\Processor(_Total)\\% DPC Time"]',
      cpuIntr:  'perf_counter_en["\\Processor(_Total)\\% Interrupt Time"]',
      cpuIdle:  'perf_counter_en["\\Processor(_Total)\\% Idle Time"]',
      cpuQueue: 'perf_counter_en["\\System\\Processor Queue Length"]',
      cpuCtx:   'perf_counter_en["\\System\\Context Switches/sec"]',
      cpuCores: 'system.cpu.num',
    },

    keysVmw: {
      cpuPct:   'vmware.vm.cpu.usage.perf[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuMhz:   'vmware.vm.cpu.usage[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuLat:   'vmware.vm.cpu.latency[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuReady: 'vmware.vm.cpu.ready[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuRdyLt: 'vmware.vm.cpu.readiness[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      numCPU:   'vmware.vm.cpu.num[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
    },

    sparkWindowSecs:   21600,
    historyWindowSecs: 21600,   // 6h de histórico
    sparkPoints:       40,

    // Limites de resultados das chamadas API
    apiLimits: { items: 50000, history: 10000, triggers: 20000 },

    // Retry com backoff exponencial (sem circuit breaker do BPC Runtime)
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
  };


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

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 2 · UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

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
        + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">&#9888; ERRO &middot; CPU</div>'
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
      // state=1 → item desactivado pelo Zabbix
      if (String(item.state) === '1') return false;
      // Sem valor → inválido
      if (!item.lastvalue || item.lastvalue === '') return false;
      var clock = parseInt(item.lastclock || 0, 10);
      // Se clock ausente mas há valor, aceita (itens calculados/VMware proxy)
      if (!clock) return true;
      var age = Math.floor(Date.now() / 1000) - clock;
      return age < (maxAgeSec || 300);
    },

    isValid: function (v) {
      return v !== null && v !== undefined && !isNaN(v);
    },

    fmtPct: function (v) {
      return U.isValid(v) ? v.toFixed(1) + '%' : '—';
    },

    fmtNum: function (v, dec) {
      return U.isValid(v) ? v.toFixed(dec !== undefined ? dec : 0) : '—';
    },

    fmtMhz: function (v) {
      if (!U.isValid(v)) return '—';
      return v >= 1000 ? (v / 1000).toFixed(2) + ' GHz' : v.toFixed(0) + ' MHz';
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

    thrLabel: function (val, thr) {
      if (!U.isValid(val)) return '—';
      if (val >= thr.crit) return 'CRÍTICO';
      if (val >= thr.warn) return 'AVISO';
      return 'NORMAL';
    },

    getNum: function (byKey, items, key, name, maxAge) {
      var it = U.gk(byKey, items, key, name);
      return (it && U.isActive(it, maxAge)) ? parseFloat(it.lastvalue) : null;
    },

    extractHostName: function (raw) {
      var s = raw.split('(')[0].trim();
      var p = s.split(/\s*-\s*/);
      return p[p.length - 1].trim();
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 3 · RESOLVER
  // ════════════════════════════════════════════════════════════════════════════

  var Resolver = {

    cpu3: function (items, byKey, hasAgentIface) {
      var KA = CFG.keysAgent;
      var KV = CFG.keysVmw;
      var IN = CFG.itemNames;
      var MA = CFG.maxAgeSec;

      function n(key, name, maxAge) {
        return U.getNum(byKey, items, key, name, maxAge || MA.agent);
      }
      function nv(key, name) {
        return U.getNum(byKey, items, key, name, MA.vmware);
      }

      var agUtil  = n(KA.cpuUtil, IN.cpuUtil);
      var hasAgent = hasAgentIface && U.isValid(agUtil);

      var agUser  = n(KA.cpuUser,  IN.cpuUser);
      var agPriv  = n(KA.cpuPriv,  IN.cpuPriv);
      var agDPC   = n(KA.cpuDPC,   IN.cpuDPC);
      var agIntr  = n(KA.cpuIntr,  IN.cpuIntr);
      var agIdle  = n(KA.cpuIdle,  IN.cpuIdle);
      var agQueue = n(KA.cpuQueue, IN.cpuQueue);
      var agCtx   = n(KA.cpuCtx,   IN.cpuCtx);
      var agCores = n(KA.cpuCores, IN.cpuCores, 86400);

      var vmwPct    = nv(KV.cpuPct,   IN.vmwCpuPct);
      var vmwMhz    = nv(KV.cpuMhz,   IN.vmwCpuMhz);
      var vmwLat    = nv(KV.cpuLat,   IN.vmwLat);
      var vmwReady  = nv(KV.cpuReady, IN.vmwReady);
      var vmwRdyLt  = nv(KV.cpuRdyLt, IN.vmwRdyLat);
      var vmwNumCPU = nv(KV.numCPU,   IN.vmwNumCPU);

      // ── DEBUG VMware (activo — ajuda a diagnosticar itens em falta) ───────
      var now = Math.floor(Date.now() / 1000);
      var vmwKeys = [KV.cpuPct, KV.cpuMhz, KV.cpuLat, KV.cpuReady, KV.cpuRdyLt, KV.numCPU];
      vmwKeys.forEach(function(k) {
        var it = byKey[k];
        if (it) {
          var age = it.lastclock ? (now - parseInt(it.lastclock, 10)) : 'N/A';
          console.log('[CPU3 VMware]', it.name,
            '| val:', it.lastvalue,
            '| age:', age + 's',
            '| state:', it.state,
            '| maxAge:', CFG.maxAgeSec.vmware + 's');
        } else {
          console.log('[CPU3 VMware] item NÃO encontrado por key_:', k);
        }
      });
      console.log('[CPU3 VMware] resolved → ready:', vmwReady, '| lat:', vmwLat, '| rdyLt:', vmwRdyLt);

      var utilPct, source, sparkKey;
      if (hasAgent) {
        utilPct  = agUtil;
        source   = 'Agente';
        sparkKey = KA.cpuUtil;
      } else if (U.isValid(vmwPct)) {
        utilPct  = vmwPct;
        source   = 'VMware';
        sparkKey = KV.cpuPct;
      } else {
        utilPct  = null;
        source   = '—';
        sparkKey = null;
      }

      var sparkItem = sparkKey ? (byKey[sparkKey] || null) : null;
      if (!sparkItem) {
        sparkItem = U.gi(items, hasAgent ? IN.cpuUtil : IN.vmwCpuPct);
      }

      var cores = U.isValid(agCores) ? Math.round(agCores)
                : U.isValid(vmwNumCPU) ? Math.round(vmwNumCPU)
                : null;

      var idlePct = U.isValid(agIdle) ? agIdle
                  : U.isValid(utilPct) ? Math.max(0, 100 - utilPct)
                  : null;

      return {
        utilPct:  utilPct,
        source:   source,
        hasAgent: hasAgent,
        sparkItem: sparkItem,
        agUser:   agUser,
        agPriv:   agPriv,
        agDPC:    agDPC,
        agIntr:   agIntr,
        idlePct:  idlePct,
        agQueue:  agQueue,
        agCtx:    agCtx,
        cores:    cores,
        vmwMhz:   vmwMhz,
        vmwLat:   vmwLat,
        vmwReady: vmwReady,
        vmwRdyLt: vmwRdyLt,
      };
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 4 · CSS
  // Prefixo .kc3- para não colidir com outros painéis
  // ════════════════════════════════════════════════════════════════════════════

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',

      // Reset & base
      '#bt-kpi-cpu3 *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-kpi-cpu3{font-family:\'IBM Plex Mono\',\'Segoe UI\',monospace;height:100%;}',

      // Layout raiz: duas colunas lado a lado (Col A · Col B)
      // Col A = CPU Tempos & Saturação  |  Col B = VMware Contenção
      '#bt-kpi-cpu3 .kc3-root{display:grid;grid-template-columns:1fr 1fr;gap:8px;height:100%;}',

      // Card base
      '#bt-kpi-cpu3 .kc3-card{background:rgba(255,255,255,0.015);border:1px solid '+C.brd+';border-radius:6px;padding:10px 13px 9px;position:relative;overflow:hidden;display:flex;flex-direction:column;}',
      '#bt-kpi-cpu3 .kc3-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;border-radius:6px 6px 0 0;background:'+C.cpu+';}',

      // Cabeçalho
      '#bt-kpi-cpu3 .kc3-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:4px;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-head-left{display:flex;align-items:center;gap:5px;min-width:0;}',
      '#bt-kpi-cpu3 .kc3-label{font-size:9px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:'+C.sub+';white-space:nowrap;}',

      // Badges de fonte
      '#bt-kpi-cpu3 .kc3-badge{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;border-radius:3px;white-space:nowrap;line-height:1.3;}',
      '#bt-kpi-cpu3 .kc3-badge.agente  {border:1px solid rgba(63,185,80,.3);background:rgba(63,185,80,.13);color:'+C.ok+';}',
      '#bt-kpi-cpu3 .kc3-badge.vmware  {border:1px solid rgba(88,166,255,.3);background:rgba(88,166,255,.13);color:'+C.info+';}',
      '#bt-kpi-cpu3 .kc3-badge.no-agent{border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.13);color:'+C.crit+';}',

      // ── COL A · BREAKDOWN DE TEMPOS ───────────────────────────────────────
      // Título de secção
      '#bt-kpi-cpu3 .kc3-section-title{font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:'+C.sub+';margin-bottom:7px;flex-shrink:0;}',

      // Cada linha de breakdown: barra horizontal + label + valor
      '#bt-kpi-cpu3 .kc3-bk-list{display:flex;flex-direction:column;gap:4px;flex-shrink:0;margin-bottom:10px;}',
      '#bt-kpi-cpu3 .kc3-bk-row{display:flex;align-items:center;gap:7px;}',
      '#bt-kpi-cpu3 .kc3-bk-dot{width:9px;height:9px;border-radius:2px;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-bk-bar-wrap{flex:1;height:7px;background:rgba(255,255,255,0.07);border-radius:4px;overflow:hidden;}',
      '#bt-kpi-cpu3 .kc3-bk-bar-fill{height:100%;border-radius:4px;transition:width .3s;}',
      '#bt-kpi-cpu3 .kc3-bk-name{font-size:9px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.06em;width:68px;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-bk-sub{font-size:8px;color:'+C.sub+';opacity:.7;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '#bt-kpi-cpu3 .kc3-bk-val{font-size:11px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+C.text+';width:38px;text-align:right;flex-shrink:0;}',

      // Separador
      '#bt-kpi-cpu3 .kc3-sep{height:1px;background:rgba(255,255,255,0.06);flex-shrink:0;margin:6px 0 8px;}',

      // ── COL A · SATURAÇÃO DO PROCESSADOR ─────────────────────────────────
      '#bt-kpi-cpu3 .kc3-sat-title{font-size:8px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:'+C.sub+';margin-bottom:7px;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-sat-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-sat-item{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 6px 7px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:5px;}',
      '#bt-kpi-cpu3 .kc3-sat-val{font-size:24px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;}',
      '#bt-kpi-cpu3 .kc3-sat-badge{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:3px;line-height:1.3;}',
      '#bt-kpi-cpu3 .kc3-sat-badge.ok   {border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.15);color:'+C.ok+';}',
      '#bt-kpi-cpu3 .kc3-sat-badge.warn {border:1px solid rgba(210,153,34,.35);background:rgba(210,153,34,.15);color:'+C.warn+';}',
      '#bt-kpi-cpu3 .kc3-sat-badge.crit {border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.15);color:'+C.crit+';}',
      '#bt-kpi-cpu3 .kc3-sat-badge.muted{border:1px solid rgba(46,51,59,.8);background:rgba(46,51,59,.3);color:'+C.sub+';}',
      '#bt-kpi-cpu3 .kc3-sat-key{font-size:8px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;text-align:center;line-height:1.3;}',

      // ── COL B · VMWARE CONTENÇÃO NO HOST ─────────────────────────────────
      // Cada métrica VMware: linha com label + valor grande + badge + texto descritivo
      '#bt-kpi-cpu3 .kc3-vmw-list{display:flex;flex-direction:column;gap:0;flex:1;}',
      '#bt-kpi-cpu3 .kc3-vmw-item{display:flex;flex-direction:column;padding:8px 0 10px;border-bottom:1px solid rgba(255,255,255,0.06);}',
      '#bt-kpi-cpu3 .kc3-vmw-item:last-child{border-bottom:none;}',
      '#bt-kpi-cpu3 .kc3-vmw-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}',
      '#bt-kpi-cpu3 .kc3-vmw-metric-name{font-size:9.5px;font-weight:600;letter-spacing:.10em;text-transform:uppercase;color:'+C.sub+';}',
      '#bt-kpi-cpu3 .kc3-vmw-metric-val{font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;}',
      '#bt-kpi-cpu3 .kc3-vmw-mid{display:flex;align-items:center;gap:8px;margin-bottom:5px;}',
      '#bt-kpi-cpu3 .kc3-vmw-bar-wrap{flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;}',
      '#bt-kpi-cpu3 .kc3-vmw-bar-fill{height:100%;border-radius:3px;transition:width .3s;}',
      '#bt-kpi-cpu3 .kc3-vmw-badge{font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:3px;line-height:1.3;flex-shrink:0;}',
      '#bt-kpi-cpu3 .kc3-vmw-badge.ok   {border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.12);color:'+C.ok+';}',
      '#bt-kpi-cpu3 .kc3-vmw-badge.warn {border:1px solid rgba(210,153,34,.35);background:rgba(210,153,34,.12);color:'+C.warn+';}',
      '#bt-kpi-cpu3 .kc3-vmw-badge.crit {border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.12);color:'+C.crit+';}',
      '#bt-kpi-cpu3 .kc3-vmw-badge.muted{border:1px solid rgba(46,51,59,.8);background:rgba(46,51,59,.3);color:'+C.sub+';}',
      '#bt-kpi-cpu3 .kc3-vmw-desc{font-size:9px;color:'+C.sub+';line-height:1.4;}',
      '#bt-kpi-cpu3 .kc3-vmw-nodata{font-size:10px;color:'+C.sub+';padding:12px 0;text-align:center;}',

      // Pulso crítico
      '@keyframes kc3-pulse{0%,100%{opacity:1;}50%{opacity:.5;}}',
      '#bt-kpi-cpu3 .kc3-pulse{animation:kc3-pulse 1.6s ease-in-out infinite;}',

      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 5 · COMPONENTES SVG
  // ════════════════════════════════════════════════════════════════════════════

  var SVG = {

    sourceBadge: function (source, hasAgent) {
      if (hasAgent) {
        return '<span class="kc3-badge agente">AGENTE</span>';
      }
      if (source === 'VMware') {
        return '<span class="kc3-badge no-agent">SEM AGENTE</span>'
             + '<span class="kc3-badge vmware" style="margin-left:4px;">VMware</span>';
      }
      return '<span class="kc3-badge no-agent">SEM AGENTE</span>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 6 · CARD HTML
  // ════════════════════════════════════════════════════════════════════════════

  var Card = {

    cpu3: function (d) {
      return '<div class="kc3-root">'
        + Card._colA(d)
        + Card._colB(d)
        + '</div>';
    },

    // ── Coluna A: BREAKDOWN DE TEMPOS + SATURAÇÃO ─────────────────────────
    _colA: function (d) {
      var C = CFG.colors;

      // Constrói segmentos de breakdown
      var segments;
      if (d.hasAgent) {
        var user  = Math.max(0, d.agUser  || 0);
        var priv  = Math.max(0, d.agPriv  || 0);
        var dpc   = Math.max(0, d.agDPC   || 0);
        var intr  = Math.max(0, d.agIntr  || 0);
        var idle  = Math.max(0, d.idlePct || 0);
        segments = [
          { key: 'USER',       sub: 'aplicações',        val: d.agUser,  pct: user,  col: C.user },
          { key: 'PRIVILEGED', sub: 'kernel / sistema',  val: d.agPriv,  pct: priv,  col: C.priv },
          { key: 'DPC',        sub: 'drivers (sub-priv)',val: d.agDPC,   pct: dpc,   col: C.dpc  },
          { key: 'INTERRUPTS', sub: 'hardware (sub-priv)',val: d.agIntr, pct: intr,  col: C.intr },
          { key: 'IDLE',       sub: 'CPU disponível',    val: d.idlePct, pct: idle,  col: C.idle },
        ];
      } else {
        var active  = Math.max(0, Math.min(100, d.utilPct || 0));
        var idleVmw = Math.max(0, 100 - active);
        segments = [
          { key: 'ACTIVE', sub: 'utilização',   val: active,  pct: active,  col: C.cpu  },
          { key: 'IDLE',   sub: 'CPU disponível',val: idleVmw, pct: idleVmw, col: C.idle },
        ];
      }

      // Linhas do breakdown
      var bkHtml = segments.map(function (s) {
        var valStr = U.isValid(s.val) ? s.val.toFixed(1) + '%' : '—';
        // A barra usa pct directamente (escala 0-100)
        // mas clamp para não ultrapassar 100
        var barPct = Math.min(100, Math.max(0, s.pct));
        var barBg  = s.col === C.idle
          ? 'background:rgba(255,255,255,0.10);'
          : 'background:' + s.col + ';';
        return '<div class="kc3-bk-row">'
          + '<span class="kc3-bk-dot" style="background:' + s.col + ';' + (s.col === C.idle ? 'opacity:.4;' : '') + '"></span>'
          + '<div class="kc3-bk-bar-wrap">'
            + '<div class="kc3-bk-bar-fill" style="width:' + barPct.toFixed(1) + '%;' + barBg + '"></div>'
          + '</div>'
          + '<span class="kc3-bk-name">' + U.esc(s.key) + '</span>'
          + '<span class="kc3-bk-sub">' + U.esc(s.sub) + '</span>'
          + '<span class="kc3-bk-val">' + U.esc(valStr) + '</span>'
          + '</div>';
      }).join('');

      // Saturação
      var satHtml = Card._saturation(d);

      return '<div class="kc3-card">'
        + '<div class="kc3-head">'
          + '<div class="kc3-head-left">'
            + '<span class="kc3-label">CPU · TEMPOS &amp; SATURAÇÃO</span>'
          + '</div>'
          + SVG.sourceBadge(d.source, d.hasAgent)
        + '</div>'
        + '<div class="kc3-section-title">BREAKDOWN DE TEMPOS</div>'
        + '<div class="kc3-bk-list">' + bkHtml + '</div>'
        + '<div class="kc3-sep"></div>'
        + satHtml
        + '</div>';
    },

    // ── Saturação: queue + ctx ────────────────────────────────────────────
    _saturation: function (d) {
      var C = CFG.colors;

      // Queue
      var qVal   = d.agQueue;
      var qStr   = U.isValid(qVal) ? qVal.toFixed(0) : '—';
      var qColor = U.thrColor(qVal, CFG.thresholds.queue);
      var qCls   = U.thrClass(qVal, CFG.thresholds.queue);
      // Label do badge: se saturado → SATURADO, senão FILA DE ESPERA
      var qBadge = (U.isValid(qVal) && qVal >= CFG.thresholds.queue.warn)
                 ? 'SATURADO' : 'FILA DE ESPERA';
      var qPulse = qCls === 'crit' ? ' kc3-pulse' : '';

      // Ctx
      var cVal   = d.agCtx;
      var cStr   = U.isValid(cVal)
                 ? (cVal >= 1000 ? (cVal / 1000).toFixed(1) + 'K' : cVal.toFixed(0))
                 : '—';
      var cColor = U.thrColor(cVal, CFG.thresholds.ctx);
      var cCls   = U.thrClass(cVal, CFG.thresholds.ctx);
      var cPulse = cCls === 'crit' ? ' kc3-pulse' : '';

      return '<div class="kc3-sat-title">SATURAÇÃO DO PROCESSADOR</div>'
        + '<div class="kc3-sat-grid">'

        // Queue
        + '<div class="kc3-sat-item">'
          + '<span class="kc3-sat-val" style="color:' + qColor + ';">' + U.esc(qStr) + '</span>'
          + '<span class="kc3-sat-badge ' + qCls + qPulse + '">' + U.esc(qBadge) + '</span>'
          + '<span class="kc3-sat-key">THREADS AGUARDAM CPU<br>&gt;2 POR CORE = PROBLEMA</span>'
        + '</div>'

        // CTX/s
        + '<div class="kc3-sat-item">'
          + '<span class="kc3-sat-val" style="color:' + cColor + ';">' + U.esc(cStr) + '</span>'
          + '<span class="kc3-sat-badge ' + cCls + cPulse + '">TROCAS / SEG.</span>'
          + '<span class="kc3-sat-key">CONTEXT SWITCHES<br>&gt;10K/S = PRESSÃO</span>'
        + '</div>'

        + '</div>';
    },

    // ── Coluna B: VMWARE CONTENÇÃO NO HOST ───────────────────────────────
    _colB: function (d) {
      var C = CFG.colors;

      var hasAny = U.isValid(d.vmwReady) || U.isValid(d.vmwLat) || U.isValid(d.vmwRdyLt);

      var listHtml;
      if (!hasAny) {
        listHtml = '<div class="kc3-vmw-nodata">Dados VMware não disponíveis.</div>';
      } else {
        listHtml = '<div class="kc3-vmw-list">'
          + Card._vmwRow(
              'CPU READY',
              d.vmwReady,
              CFG.thresholds.vmwReady,
              20, // escala da barra: 0-20% cobre warn+crit
              'VM aguardou por core físico',
              'Métrica principal de contenção. Acima de 5% impacta performance.'
            )
          + Card._vmwRow(
              'CPU LATENCY',
              d.vmwLat,
              CFG.thresholds.vmwLat,
              20,
              'Latência total percebida pela VM',
              'Inclui Ready + co-stop + outros factores do hypervisor.'
            )
          + Card._vmwRow(
              'READINESS LATENCY',
              d.vmwRdyLt,
              CFG.thresholds.vmwReady,
              20,
              'Variante granular do CPU Ready',
              'Monitoriza espera acumulada por intervalo de amostragem.'
            )
          + '</div>';
      }

      return '<div class="kc3-card">'
        + '<div class="kc3-head">'
          + '<div class="kc3-head-left">'
            + '<span class="kc3-label">VMWARE · CONTENÇÃO NO HOST</span>'
          + '</div>'
          + SVG.sourceBadge(d.source, d.hasAgent)
        + '</div>'
        + listHtml
        + '</div>';
    },

    // Linha individual de métrica VMware
    _vmwRow: function (name, val, thr, barScale, subtitle, desc) {
      var C      = CFG.colors;
      var vStr   = U.isValid(val) ? val.toFixed(2) + '%' : '—';
      var color  = U.thrColor(val, thr);
      var cls    = U.thrClass(val, thr);
      var label  = U.thrLabel(val, thr);
      var pulse  = cls === 'crit' ? ' kc3-pulse' : '';
      var barPct = U.isValid(val) ? Math.min(100, (val / barScale) * 100) : 0;

      return '<div class="kc3-vmw-item">'
        + '<div class="kc3-vmw-top">'
          + '<span class="kc3-vmw-metric-name">' + U.esc(name) + '</span>'
          + '<span class="kc3-vmw-metric-val" style="color:' + color + ';">' + U.esc(vStr) + '</span>'
        + '</div>'
        + '<div class="kc3-vmw-mid">'
          + '<div class="kc3-vmw-bar-wrap">'
            + '<div class="kc3-vmw-bar-fill" style="width:' + barPct.toFixed(1) + '%;background:' + color + ';"></div>'
          + '</div>'
          + '<span class="kc3-vmw-badge ' + cls + pulse + '">' + U.esc(label) + '</span>'
        + '</div>'
        + '<div class="kc3-vmw-desc">' + U.esc(desc) + '</div>'
        + '</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 7 · API ZABBIX
  // ════════════════════════════════════════════════════════════════════════════

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

  console.log('[CPU3 v2.0] hostRaw:', hostRaw, '→', hostName);

  if (!hostName) {
    root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:' + CFG.colors.sub + ';font-size:11px;">A carregar CPU…</span>';

  ZbxApi.getHostId(hostName)
    .then(function (hostInfo) {
      var hasAgentIface = U.hasAgentInterface(hostInfo.interfaces);
      console.log('[CPU3 v2.0] hasAgentIface:', hasAgentIface);

      return ZbxApi.getItems(hostInfo.hostid)
        .then(function (items) {
          var byKey = U.buildKeyIndex(items);
          var data  = Resolver.cpu3(items, byKey, hasAgentIface);

          root.innerHTML = CSS + Card.cpu3(data);
        });
    })
    .catch(function (e) {
      console.error('[CPU3 v2.0] Erro:', e.message);
      root.innerHTML = U.renderErro(e.message, 'Confirmar que a VM existe no Zabbix e que o proxy Grafana responde.');
    });

})();