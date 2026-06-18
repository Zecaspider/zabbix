(function () {
  'use strict';

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  VARIÁVEIS GRAFANA REQUERIDAS                                              ║
  // ║  var-hostid  — host Zabbix seleccionado                                   ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // ╔══════════════════════════════════════════════════════════════════════════╗
  // ║  D5-Detalhe-VM · ROW 1 · KPI GOLDEN SIGNALS  v18.1                     ║
  // ║  Autor: BPC                                                              ║
  // ║                                                                          ║
  // ║  ALTERAÇÕES v15 → v16:                                                  ║
  // ║                                                                          ║
  // ║  PROBLEMA RAIZ IDENTIFICADO:                                            ║
  // ║  O BT v6.x re-executa o script DUAS vezes por cada mudança de          ║
  // ║  variável. Com AbortController, a 2ª execução abortava a 1ª antes      ║
  // ║  do getHostId terminar → AbortError → sem dados → sempre SEM AGENTE.   ║
  // ║                                                                          ║
  // ║  PROBLEMA SECUNDÁRIO:                                                   ║
  // ║  O elemento DOM root (#bt-kpi-gs) pode ser recriado pelo BT entre      ║
  // ║  execuções, apagando root.__kpigs_token e root.__kpigs_abort.          ║
  // ║  Sem token persistente → race conditions livres entre fetches.          ║
  // ║                                                                          ║
  // ║  SOLUÇÃO v14:                                                            ║
  // ║  1. NAMESPACE EM window (não em root DOM)                               ║
  // ║     window.__kpigs['bt-kpi-gs'] — sobrevive a re-renders do DOM.       ║
  // ║     Chave inclui rootId → sem colisão entre painéis BT.                ║
  // ║                                                                          ║
  // ║  2. ABORT COM DELAY DE 80ms                                             ║
  // ║     Absorve o double-fire do BT (as duas execuções são disparadas      ║
  // ║     com <10ms de intervalo). A 2ª execução agenda o abort mas          ║
  // ║     aguarda 80ms antes de o efectuar — se for o double-fire, a 1ª      ║
  // ║     execução já terminou o getHostId e o token protege o resto.         ║
  // ║                                                                          ║
  // ║  3. TOKEN COMO PRIMEIRA LINHA DE DEFESA                                 ║
  // ║     AbortController como segunda linha (para mudanças lentas).          ║
  // ║     Em mudanças rápidas (6x seguidas), o token descarta resultados     ║
  // ║     de fetches anteriores que escaparam ao abort.                       ║
  // ║                                                                          ║
  // ║  BLOCOS ALTERADOS:   9 (Bootstrap)                                      ║
  // ║  BLOCOS INALTERADOS: 1-8                                                ║
  // ╚══════════════════════════════════════════════════════════════════════════╝


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 1 · CONFIGURAÇÃO
  // ════════════════════════════════════════════════════════════════════════════

  var CFG = {

    grafanaUrl:    'http://10.10.126.22:3000',
    datasourceUid: '3_KgG43nz',
    // proxy construído no bootstrap — não editar: CFG.grafanaUrl + '/api/datasources/uid/' + CFG.datasourceUid + '/resources/zabbix-api'
    rootId: 'bt-kpi-gs',

    maxAgeSec: {
      // Intervalos reais do template BPC Windows:
      // - Maioria dos perf counters: 30 min → maxAge 40 min (margem 33%)
      // - Uptime, CPU util, mem util: 30 min → mesma margem
      // - ICMP items: ~27 min no VS8000720 → usar 40 min também
      // - VMware items: alguns têm 20h+ de age (ex: cluster name, datacenter)
      //   esses são strings estáticas, não usar para detectar actividade
      agent:  7200,  // 2h — cobre qualquer intervalo até 90 min
      vmware:  600,   // 10 min — VMware poller é mais frequente
      icmp:   7200,   // 40 min — ICMP usa mesmo intervalo que agente
    },

    thresholds: {
      cpu:   { warn: 60,  crit: 85  },
      mem:   { warn: 70,  crit: 90  },
      disk:  { warn: 70,  crit: 85  },
      ioOps: { warn: 50,  crit: 100 },
      ioLat: { warn: 10,  crit: 50  },
      ioQ:   { warn: 1,   crit: 5   },
      ioU:   { warn: 60,  crit: 85  },
      icmp:  { warn: 10,  crit: 50  },
    },

    colors: {
      cpu:  '#E8A020',
      mem:  '#7C4DFF',
      net:  '#00BCD4',
      io:   '#F44336',
      ok:   '#3FB950',
      warn: '#D29922',
      crit: '#F85149',
      info: '#58A6FF',
      mute: '#2D333B',
      sub:  '#6E7681',
      text: '#CDD9E5',
      brd:  '#1C2128',
      hlth: '#58A6FF',
    },

    itemsAgent: {
      uptime:   'Uptime',
      procs:    'Number of processes',
      threads:  'Number of threads',
      cpuUtil:  'CPU utilization',
      cpuUser:  'CPU user time',
      cpuPriv:  'CPU privileged time',
      cpuQueue: 'CPU queue length',
      memUtil:  'Memory utilization',
      memUsed:  'Used memory',
      memTotal: 'Total memory',
      swapPct:  'Used swap space in %',
      swapFree: 'Free swap space',
      icmpRtt:  'ICMP response time',
      icmpLoss: 'ICMP loss',
      icmpPing: 'ICMP ping',
    },

    itemsVmw: {
      uptime:     'VMware: Uptime of guest OS',
      cpuPct:     'VMware: CPU usage in percents',
      cpuMhz:     'VMware: CPU usage',
      cpuLat:     'VMware: CPU latency in percents',
      cpuReady:   'VMware: CPU ready',
      memUsed:    'VMware: Guest memory usage',
      memTotal:   'VMware: Memory size',
      memBalloon: 'VMware: Ballooned memory',
      memHostPct: 'VMware: Host memory usage in percents',
      storComm:   'VMware: Committed storage space',
      storUncomm: 'VMware: Uncommitted storage space',
      hypervisor: 'VMware: Hypervisor name',
      cluster:    'VMware: Cluster name',
      datacenter: 'VMware: Datacenter name',
      powerState: 'VMware: Power state',
      numCPU:     'VMware: Number of virtual CPUs',
      memSize:    'VMware: Memory size',
    },

    keysAgent: {
      uptime:   'system.uptime',
      procs:    'proc.num[]',
      threads:  'perf_counter_en["\\System\\Threads"]',
      cpuUtil:  'system.cpu.util',
      cpuUser:  'perf_counter_en["\\Processor Information(_total)\\% User Time"]',
      cpuPriv:  'perf_counter_en["\\Processor Information(_total)\\% Privileged Time"]',
      cpuQueue: 'perf_counter_en["\\System\\Processor Queue Length"]',
      memUtil:  'vm.memory.util',
      memUsed:  'vm.memory.size[used]',
      memTotal: 'vm.memory.size[total]',
      swapPct:  'perf_counter_en["\\Paging file(_Total)\\% Usage"]',
      swapFree: 'system.swap.free',
      icmpRtt:  'icmppingsec',
      icmpLoss: 'icmppingloss',
      icmpPing: 'icmpping',
    },

    keysVmw: {
      uptime:     'vmware.vm.guest.osuptime[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuPct:     'vmware.vm.cpu.usage.perf[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuMhz:     'vmware.vm.cpu.usage[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cpuLat:     'vmware.vm.cpu.latency[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memUsed:    'vmware.vm.memory.size.usage.guest[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memTotal:   'vmware.vm.memory.size[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memBalloon: 'vmware.vm.memory.size.ballooned[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memHostPct: 'vmware.vm.memory.size.usage.host[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      storComm:   'vmware.vm.storage.committed[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      storUncomm: 'vmware.vm.storage.uncommitted[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      hypervisor: 'vmware.vm.hv.name[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      cluster:    'vmware.vm.cluster.name[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      datacenter: 'vmware.vm.datacenter.name[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      powerState: 'vmware.vm.powerstate[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      numCPU:     'vmware.vm.cpu.num[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
      memSize:    'vmware.vm.memory.size[{$VMWARE.URL},{$VMWARE.VM.UUID}]',
    },

    sparkWindowSecs:   21600,
    historyWindowSecs: 21600,   // 6h de histórico para sparklines
    sparkPoints:       40,

    // Limites de resultados das chamadas API
    apiLimits: { items: 50000, history: 10000, triggers: 20000 },

    // Retry com backoff exponencial (sem circuit breaker do BPC Runtime)
    retry: { maxAttempts: 3, baseDelayMs: 1000 },

    // Delay em ms antes de abortar execução anterior.
    // Deve ser > intervalo entre os dois fires do BT (geralmente <10ms)
    // e < tempo de resposta do proxy Zabbix (geralmente >200ms).
    abortDelayMs: 80,
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

  // Card de erro explícito (causa + acção correctiva)
  function renderErro(causa, accao) {
    return '<div style="background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.4);'
      + 'border-radius:6px;padding:12px 14px;font-family:\'IBM Plex Mono\',monospace;">'
      + '<div style="color:' + CFG.colors.crit + ';font-size:11px;font-weight:700;margin-bottom:4px;">⚠ ERRO · KPI GOLDEN SIGNALS</div>'
      + '<div style="color:' + CFG.colors.text + ';font-size:10px;margin-bottom:3px;">' + U.esc(causa) + '</div>'
      + '<div style="color:' + CFG.colors.sub + ';font-size:9px;">' + U.esc(accao || 'Verificar conectividade ao proxy Zabbix.') + '</div>'
      + '</div>';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 2 · UTILITÁRIOS
  // ════════════════════════════════════════════════════════════════════════════

  var U = {
    esc: function (s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    },
    gv: function (items, name) {
      for (var i=0;i<items.length;i++) if(items[i].name===name) return parseFloat(items[i].lastvalue);
      return null;
    },
    gi: function (items, name) {
      for (var i=0;i<items.length;i++) if(items[i].name===name) return items[i];
      return null;
    },
    gcFirst: function (items, substr) {
      for (var i=0;i<items.length;i++) if(items[i].name&&items[i].name.indexOf(substr)>=0) return items[i];
      return null;
    },
    buildKeyIndex: function (items) {
      var idx={};
      for(var i=0;i<items.length;i++) if(items[i].key_) idx[items[i].key_]=items[i];
      return idx;
    },
    gk: function (byKey, items, key, name) {
      if(key&&byKey[key]) return byKey[key];
      if(name) return U.gi(items,name);
      return null;
    },
    hasAgentInterface: function (interfaces) {
      if(!interfaces||!interfaces.length) return false;
      for(var i=0;i<interfaces.length;i++) if(String(interfaces[i].type)==='1') return true;
      return false;
    },
    isActive: function (item, maxAgeSec) {
      if(!item) return false;
      if(String(item.state)==='1') return false;
      if(!item.lastvalue||item.lastvalue==='') return false;
      var clock=parseInt(item.lastclock||0,10);
      if(!clock) return false;
      return (Math.floor(Date.now()/1000)-clock) < (maxAgeSec||300);
    },
    isValid: function (v) { return v!==null&&v!==undefined&&!isNaN(v); },
    fmtPct:    function (v) { return U.isValid(v)?v.toFixed(1)+'%':'—'; },
    fmtBytes:  function (b) {
      if(!U.isValid(b)||b<=0) return '—';
      if(b>=1099511627776) return (b/1099511627776).toFixed(1)+' TB';
      if(b>=1073741824)    return (b/1073741824).toFixed(1)+' GB';
      if(b>=1048576)       return (b/1048576).toFixed(0)+' MB';
      return (b/1024).toFixed(0)+' KB';
    },
    fmtBits:   function (v) {
      if(!U.isValid(v)) return '—';
      if(v>=1e9) return (v/1e9).toFixed(1)+' Gbps';
      if(v>=1e6) return (v/1e6).toFixed(1)+' Mbps';
      if(v>=1e3) return (v/1e3).toFixed(1)+' Kbps';
      return v.toFixed(0)+' bps';
    },
    fmtMs:     function (v) { return U.isValid(v)?v.toFixed(2)+' ms':'—'; },
    fmtUptime: function (secs) {
      if(!U.isValid(secs)) return '—';
      var d=Math.floor(secs/86400),h=Math.floor((secs%86400)/3600),m=Math.floor((secs%3600)/60);
      var p=[];
      if(d>0)p.push(d+'d');
      if(h>0)p.push(h+'h');
      p.push(m+'m');
      return p.join(' ');
    },
    thrColor:  function (val,thr) {
      if(!U.isValid(val)) return CFG.colors.sub;
      if(val>=thr.crit) return CFG.colors.crit;
      if(val>=thr.warn) return CFG.colors.warn;
      return CFG.colors.ok;
    },
    thrClass:  function (val,thr) {
      if(!U.isValid(val)) return 'muted';
      if(val>=thr.crit) return 'crit';
      if(val>=thr.warn) return 'warn';
      return 'ok';
    },
    rgb: function (h) {
      h=h.trim().replace('#','');
      if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16);
    },
    extractHostName: function (raw) {
      var s=raw.split('(')[0].trim();
      var p=s.split(/\s*-\s*/);
      return p[p.length-1].trim();
    },
    trunc: function (s, max) {
      if(!s) return '—';
      return s.length > max ? s.slice(0, max) + '…' : s;
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 3 · RESOLVERS
  // ════════════════════════════════════════════════════════════════════════════

  function resolveMetric(byKey, items, candidates) {
    for(var i=0;i<candidates.length;i++){
      var c=candidates[i], item=null;
      if(c.key&&byKey[c.key]) item=byKey[c.key];
      if(!item&&c.name) item=U.gi(items,c.name);
      if(U.isActive(item,c.maxAge)) return { item:item, value:parseFloat(item.lastvalue), source:c.source };
    }
    return { item:null, value:null, source:null };
  }

  var Resolver = {

    health: function (items, byKey, hasAgentIface) {
      var KA=CFG.keysAgent,KV=CFG.keysVmw,IA=CFG.itemsAgent,IV=CFG.itemsVmw,MA=CFG.maxAgeSec;
      var uptimeR=resolveMetric(byKey,items,[
        {key:KA.uptime,name:IA.uptime,source:'agent', maxAge:MA.agent },
        {key:KV.uptime,name:IV.uptime,source:'vmware',maxAge:MA.vmware},
      ]);
      // Fallback substring para uptime de agente (key pode não dar match exacto)
      if(!uptimeR.item&&hasAgentIface){
        var uptFb=U.gcFirst(items,'Uptime');
        if(uptFb&&U.isActive(uptFb,MA.agent))
          uptimeR={item:uptFb,value:parseFloat(uptFb.lastvalue),source:'agent'};
      }
      var procsItem  =U.gk(byKey,items,KA.procs,  IA.procs);
      var threadsItem=U.gk(byKey,items,KA.threads, IA.threads);
      var procsActive  =U.isActive(procsItem,  MA.agent);
      var threadsActive=U.isActive(threadsItem, MA.agent);
      // hasAgent = interface tipo 1 presente (como o CPU3 faz)
      // + pelo menos UM item de agente activo (prova que o agente está a reportar)
      // Não exigir AMBOS os items — perf counters Windows podem estar desactivados
      // var hasAgentItem = procsActive || threadsActive
      //   || U.isActive(U.gk(byKey,items,KA.cpuUtil,  IA.cpuUtil),  MA.agent)
      //   || U.isActive(U.gk(byKey,items,KA.memUtil,  IA.memUtil),  MA.agent)
      //   || U.isActive(U.gk(byKey,items,KA.uptime,   IA.uptime),   MA.agent);
      var agentPingItem = byKey['agent.ping'];
      var hasAgentItem =
        procsActive || threadsActive
        || U.isActive(U.gk(byKey,items,KA.cpuUtil, IA.cpuUtil), MA.agent)
        || U.isActive(U.gk(byKey,items,KA.memUtil, IA.memUtil), MA.agent)
        || U.isActive(U.gk(byKey,items,KA.uptime,  IA.uptime),  MA.agent)
        || U.isActive(agentPingItem, MA.agent);

      // Fallback: varrer todos os items excluindo VMware/ICMP/WMI
      if (!hasAgentItem) {
        hasAgentItem = items.some(function(it) {
          if (!it.key_) return false;
          var k = it.key_;
          if (k.indexOf('vmware.') === 0) return false;
          if (k.indexOf('icmp')    === 0) return false;
          if (k.indexOf('bpc.icmp')=== 0) return false;
          if (k.indexOf('wmi.')    === 0) return false;
          return U.isActive(it, MA.agent);
        });
      }
      var hasAgent = hasAgentIface && hasAgentItem;
      var icmpPingItem=U.gk(byKey,items,KA.icmpPing,IA.icmpPing);
      var icmpRttItem =U.gk(byKey,items,KA.icmpRtt, IA.icmpRtt);
      var icmpLossItem=U.gk(byKey,items,KA.icmpLoss,IA.icmpLoss);
      var icmpPingRaw=icmpPingItem&&U.isActive(icmpPingItem,MA.icmp)?icmpPingItem.lastvalue:null;
      var icmpUp=icmpPingRaw!==null?(icmpPingRaw==='1'||icmpPingRaw.indexOf('1')>=0):null;
      var icmpRtt=icmpRttItem&&U.isActive(icmpRttItem,MA.icmp)?parseFloat(icmpRttItem.lastvalue):null;
      var icmpLoss=icmpLossItem&&U.isActive(icmpLossItem,MA.icmp)?parseFloat(icmpLossItem.lastvalue):null;
      if(U.isValid(icmpRtt)&&icmpRtt>0&&icmpRtt<1) icmpRtt=icmpRtt*1000;
      function vmwStr(key,name){var it=U.gk(byKey,items,key,name);return(it&&it.lastvalue&&it.lastvalue!=='')?it.lastvalue:null;}
      function vmwNum(key,name){var it=U.gk(byKey,items,key,name);return(it&&U.isActive(it,MA.vmware))?parseFloat(it.lastvalue):null;}
      var hypervisor=vmwStr(KV.hypervisor,IV.hypervisor);
      var cluster   =vmwStr(KV.cluster,   IV.cluster);
      var datacenter=vmwStr(KV.datacenter,IV.datacenter);
      var numCPU    =vmwNum(KV.numCPU,    IV.numCPU);
      var memSizeB  =vmwNum(KV.memSize,   IV.memSize);
      var powerItem =U.gk(byKey,items,KV.powerState,IV.powerState);
      var powerRaw  =(powerItem&&U.isActive(powerItem,MA.vmware))?powerItem.lastvalue:null;
      var powerOn=powerRaw!==null?(powerRaw.indexOf('poweredOn')>=0||powerRaw.indexOf('(1)')>=0):null;
      var hvShort=hypervisor?hypervisor.split('.')[0]:null;
      var source=hasAgent?'Agente':(uptimeR.source==='vmware')?'VMware':(icmpUp!==null)?'ICMP':'—';
      return{
        uptimeSecs:uptimeR.value,uptimeSource:uptimeR.source,
        procs:procsActive?Math.round(parseFloat(procsItem.lastvalue)):null,
        threads:threadsActive?Math.round(parseFloat(threadsItem.lastvalue)):null,
        hasAgent:hasAgent,source:source,
        icmpUp:icmpUp,icmpRtt:icmpRtt,icmpLoss:icmpLoss,
        hvShort:hvShort,cluster:cluster,datacenter:datacenter,
        powerOn:powerOn,numCPU:numCPU,memSizeB:memSizeB,
      };
    },

    cpu: function (items, byKey, hasAgentIface) {
      var KA=CFG.keysAgent,KV=CFG.keysVmw,IA=CFG.itemsAgent,IV=CFG.itemsVmw,MA=CFG.maxAgeSec;
      var r=resolveMetric(byKey,items,[
        {key:KA.cpuUtil,name:IA.cpuUtil,source:'agent', maxAge:MA.agent },
        {key:KV.cpuPct, name:IV.cpuPct, source:'vmware',maxAge:MA.vmware},
      ]);
      // Fallback: procurar por substring no nome se key e nome exacto falharem
      if(!r.item&&hasAgentIface){
        var cpuItem=U.gcFirst(items,'CPU utilization')||U.gcFirst(items,'% Processor Time');
        if(cpuItem&&U.isActive(cpuItem,MA.agent))
          r={item:cpuItem,value:parseFloat(cpuItem.lastvalue),source:'agent'};
      }
      var hasAgent=(r.source==='agent')&&hasAgentIface;
      if(r.source==='agent'){
        var uI=U.gk(byKey,items,KA.cpuUser,IA.cpuUser);
        var pI=U.gk(byKey,items,KA.cpuPriv,IA.cpuPriv);
        var qI=U.gk(byKey,items,KA.cpuQueue,IA.cpuQueue);
        var rdyIA=U.gcFirst(items,'VMware: CPU ready');
        var rdyValA=rdyIA&&U.isActive(rdyIA,MA.vmware)?parseFloat(rdyIA.lastvalue):null;
        return{value:r.value,source:'Agente',hasAgent:hasAgent,
          sub1:'user '+U.fmtPct(uI?parseFloat(uI.lastvalue):null)+' · priv '+U.fmtPct(pI?parseFloat(pI.lastvalue):null),
          sub2:'fila '+(qI?parseFloat(qI.lastvalue).toFixed(0):'—'),
          cpuReady:rdyValA,sparkItem:r.item};
      }
      if(r.source==='vmware'){
        var mI=U.gk(byKey,items,KV.cpuMhz,IV.cpuMhz);
        var lI=U.gk(byKey,items,KV.cpuLat,IV.cpuLat);
        var rdyI=U.gcFirst(items,'VMware: CPU ready');
        var rdyVal=rdyI&&U.isActive(rdyI,MA.vmware)?parseFloat(rdyI.lastvalue):null;
        return{value:r.value,source:'VMware',hasAgent:false,
          sub1:mI?parseFloat(mI.lastvalue).toFixed(0)+' MHz':'—',
          sub2:'latência '+(lI?parseFloat(lI.lastvalue).toFixed(2)+'%':'—'),
          cpuReady:rdyVal,sparkItem:r.item};
      }
      return{value:0,source:'—',hasAgent:false,sub1:'sem dados',sub2:'',cpuReady:null,sparkItem:null};
    },

    memory: function (items, byKey, hasAgentIface) {
      var KA=CFG.keysAgent,KV=CFG.keysVmw,IA=CFG.itemsAgent,IV=CFG.itemsVmw,MA=CFG.maxAgeSec;
      var memAgtR=resolveMetric(byKey,items,[{key:KA.memUtil,name:IA.memUtil,source:'agent',maxAge:MA.agent}]);
      var hasAgent=(memAgtR.source==='agent')&&hasAgentIface;
      if(memAgtR.source==='agent'){
        var mU=U.gk(byKey,items,KA.memUsed,IA.memUsed);
        var mT=U.gk(byKey,items,KA.memTotal,IA.memTotal);
        var sP=U.gk(byKey,items,KA.swapPct,IA.swapPct);
        var sF=U.gk(byKey,items,KA.swapFree,IA.swapFree);
        return{value:memAgtR.value,source:'Agente',hasAgent:hasAgent,
          sub1:U.fmtBytes(mU?parseFloat(mU.lastvalue):null)+' / '+U.fmtBytes(mT?parseFloat(mT.lastvalue):null),
          sub2:'swap '+(sP?parseFloat(sP.lastvalue).toFixed(0)+'%':'—')+' livre '+(sF?U.fmtBytes(parseFloat(sF.lastvalue)):'—'),
          sparkItem:memAgtR.item};
      }
      var vmwU=U.gk(byKey,items,KV.memUsed,IV.memUsed);
      var vmwT=U.gk(byKey,items,KV.memTotal,IV.memTotal);
      var vmwUsed=vmwU&&U.isActive(vmwU,MA.vmware)?parseFloat(vmwU.lastvalue):null;
      var vmwTotal=vmwT&&U.isActive(vmwT,MA.vmware)?parseFloat(vmwT.lastvalue):null;
      if(U.isValid(vmwUsed)&&U.isValid(vmwTotal)&&vmwTotal>0){
        var bI=U.gk(byKey,items,KV.memBalloon,IV.memBalloon);
        var balloon=bI?parseFloat(bI.lastvalue):null;
        return{value:(vmwUsed/vmwTotal)*100,source:'VMware',hasAgent:false,
          sub1:U.fmtBytes(vmwUsed)+' / '+U.fmtBytes(vmwTotal),
          sub2:'balloon '+(U.isValid(balloon)?U.fmtBytes(balloon):'0 B'),sparkItem:vmwU};
      }
      var hP=U.gk(byKey,items,KV.memHostPct,IV.memHostPct);
      if(hP&&U.isActive(hP,MA.vmware)) return{value:parseFloat(hP.lastvalue),source:'VMware',hasAgent:false,sub1:'host memory %',sub2:'—',sparkItem:hP};
      return{value:0,source:'—',hasAgent:false,sub1:'sem dados',sub2:'',sparkItem:null};
    },

    network: function (items, byKey, hasAgentIface) {
      var KA=CFG.keysAgent,IA=CFG.itemsAgent,MA=CFG.maxAgeSec;
      var netInItem=U.gcFirst(items,'Bits received');
      var netOutItem=U.gcFirst(items,'Bits sent');
      var netInActive=U.isActive(netInItem,MA.agent);
      if(netInActive){
        var netIn=parseFloat(netInItem.lastvalue);
        var netOut=netOutItem?parseFloat(netOutItem.lastvalue):null;
        var errItem=U.gcFirst(items,'packets with errors');
        var errVal=errItem?parseFloat(errItem.lastvalue):0;
        return{displayVal:U.fmtBits(netIn),sub:'↓ '+U.fmtBits(netIn)+' ↑ '+U.fmtBits(netOut)+' · err '+errVal.toFixed(0),
          source:'Agente',hasAgent:hasAgentIface,color:CFG.colors.net,sparkItem:netInItem,curVal:netIn};
      }
      var icmpRttItem=U.gk(byKey,items,KA.icmpRtt,IA.icmpRtt);
      var icmpLossItem=U.gk(byKey,items,KA.icmpLoss,IA.icmpLoss);
      var icmpRtt=icmpRttItem&&U.isActive(icmpRttItem,MA.icmp)?parseFloat(icmpRttItem.lastvalue):null;
      var icmpLoss=icmpLossItem&&U.isActive(icmpLossItem,MA.icmp)?parseFloat(icmpLossItem.lastvalue):null;
      if(U.isValid(icmpRtt)&&icmpRtt>0&&icmpRtt<1) icmpRtt=icmpRtt*1000;
      return{displayVal:U.isValid(icmpRtt)?U.fmtMs(icmpRtt):'—',
        sub:'latência '+U.fmtMs(icmpRtt)+' · perda '+(U.isValid(icmpLoss)?icmpLoss.toFixed(0)+'%':'—'),
        source:'ICMP',hasAgent:false,color:CFG.colors.warn,sparkItem:icmpRttItem,curVal:icmpRtt};
    },

    disk: function (items, byKey, hasAgentIface) {
      var KV=CFG.keysVmw,IV=CFG.itemsVmw,MA=CFG.maxAgeSec;
      var agentDisks=[],seen={};

      for(var i=0;i<items.length;i++){
        var it=items[i];
        if(!it.name) continue;
        var m=it.name.match(/\(([A-Z]:)\):\s*Space utilization/);
        if(!m) continue;
        var lbl=m[1];
        if(seen[lbl]) continue;
        seen[lbl]=true;
        if(!U.isActive(it,MA.agent)) continue;
        var pct=parseFloat(it.lastvalue);
        var totalIt=U.gcFirst(items,'('+lbl+'): Total space');
        var usedIt =U.gcFirst(items,'('+lbl+'): Used space');
        var total  =totalIt&&U.isActive(totalIt,MA.agent)?parseFloat(totalIt.lastvalue):null;
        var used   =usedIt &&U.isActive(usedIt, MA.agent)?parseFloat(usedIt.lastvalue) :null;
        if(!U.isValid(pct)||pct<0) continue;
        if(!U.isValid(total)||total<=0) continue;
        agentDisks.push({label:lbl,pct:pct,used:used,total:total,isVmware:false});
      }
      agentDisks.sort(function(a,b){return a.label.localeCompare(b.label);});

      if(agentDisks.length>0){
        function ioVal(substr) {
          var it=U.gcFirst(items,substr);
          if(!it||!U.isActive(it,MA.agent)) return null;
          var v=parseFloat(it.lastvalue);
          return (substr.indexOf('waiting time')>=0||substr.indexOf('Lat')>=0)
            ? ((v>0&&v<1)?v*1000:v) : v;
        }
        return{
          disks:   agentDisks.slice(0,6),
          ioW:     ioVal('_Total: Disk write rate'),
          ioR:     ioVal('_Total: Disk read rate'),
          ioWt:    ioVal('_Total: Disk write request avg waiting time'),
          ioRt:    ioVal('_Total: Disk read request avg waiting time'),
          ioQueue: ioVal('_Total: Disk average queue size'),
          ioUtil:  ioVal('_Total: Disk utilization by idle time'),
          source:'Agente',hasAgent:hasAgentIface,
        };
      }

      var commItem  =U.gk(byKey,items,KV.storComm,  IV.storComm);
      var uncommItem=U.gk(byKey,items,KV.storUncomm,IV.storUncomm);
      var comm  =commItem  &&U.isActive(commItem,  MA.vmware)?parseFloat(commItem.lastvalue)  :null;
      var uncomm=uncommItem&&U.isActive(uncommItem,MA.vmware)?parseFloat(uncommItem.lastvalue):null;
      if(U.isValid(comm)&&comm>0){
        var totalVmw=U.isValid(uncomm)?comm+uncomm:null;
        var pctVmw=(totalVmw&&totalVmw>0)?(comm/totalVmw*100):null;
        return{
          disks:[{label:'VM',pct:pctVmw,used:comm,total:totalVmw,isVmware:true}],
          ioW:null,ioR:null,ioWt:null,ioRt:null,ioQueue:null,ioUtil:null,
          source:'VMware',hasAgent:false,
        };
      }
      return{disks:[],ioW:null,ioR:null,ioWt:null,ioRt:null,ioQueue:null,ioUtil:null,source:'—',hasAgent:false};
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 4 · CSS
  // ════════════════════════════════════════════════════════════════════════════

  var CSS = (function () {
    var C = CFG.colors;
    return [
      '<style>',
      '#bt-kpi-gs *{box-sizing:border-box;margin:0;padding:0;}',
      '#bt-kpi-gs{font-family:\'IBM Plex Mono\',\'Segoe UI\',monospace;}',
      '#bt-kpi-gs .ks-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;height:100%;}',
      '#bt-kpi-gs .ks-card{background:rgba(255,255,255,0.015);border:1px solid '+C.brd+';border-radius:6px;padding:10px 13px 9px;position:relative;overflow:hidden;display:flex;flex-direction:column;}',
      '#bt-kpi-gs .ks-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;border-radius:6px 6px 0 0;}',
      '#bt-kpi-gs .ks-card.hlth::before{background:'+C.hlth+'}',
      '#bt-kpi-gs .ks-card.cpu::before {background:'+C.cpu+'}',
      '#bt-kpi-gs .ks-card.mem::before {background:'+C.mem+'}',
      '#bt-kpi-gs .ks-card.net::before {background:'+C.net+'}',
      '#bt-kpi-gs .ks-card.io::before  {background:'+C.io+'}',
      '#bt-kpi-gs .ks-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:4px;flex-shrink:0;}',
      '#bt-kpi-gs .ks-head-left{display:flex;align-items:center;gap:5px;min-width:0;}',
      '#bt-kpi-gs .ks-label{font-size:12px;font-weight:600;letter-spacing:.13em;text-transform:uppercase;color:'+C.sub+';white-space:nowrap;}',
      '#bt-kpi-gs .ks-signal{font-size:11px;font-weight:700;letter-spacing:.06em;padding:1px 5px;border-radius:2px;white-space:nowrap;}',
      '#bt-kpi-gs .ks-signal.cpu{background:rgba(232,160,32,.15);color:'+C.cpu+';}',
      '#bt-kpi-gs .ks-signal.mem{background:rgba(124,77,255,.15);color:'+C.mem+';}',
      '#bt-kpi-gs .ks-signal.net{background:rgba(0,188,212,.15);color:'+C.net+';}',
      '#bt-kpi-gs .ks-signal.io {background:rgba(244,67,54,.15); color:'+C.io+';}',
      '#bt-kpi-gs .ks-badge{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 7px;border-radius:3px;white-space:nowrap;line-height:1.3;}',
      '#bt-kpi-gs .ks-badge.agente  {border:1px solid rgba(63,185,80,.3);background:rgba(63,185,80,.13);color:'+C.ok+';}',
      '#bt-kpi-gs .ks-badge.vmware  {border:1px solid rgba(88,166,255,.3);background:rgba(88,166,255,.13);color:'+C.info+';}',
      '#bt-kpi-gs .ks-badge.icmp    {border:1px solid rgba(210,153,34,.3);background:rgba(210,153,34,.13);color:'+C.warn+';}',
      '#bt-kpi-gs .ks-badge.no-agent{border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.13);color:'+C.crit+';}',
      '#bt-kpi-gs .ks-badge.stale   {border:1px solid rgba(210,153,34,.5);background:rgba(210,153,34,.18);color:'+C.warn+';}',
      '#bt-kpi-gs .ks-gauge{display:flex;justify-content:center;flex-shrink:0;margin:2px 0;}',
      '#bt-kpi-gs .ks-gauge svg{display:block;overflow:visible;}',
      '#bt-kpi-gs .ks-spark{flex-shrink:0;margin:2px 0;}',
      '#bt-kpi-gs .ks-spark svg{display:block;}',
      '#bt-kpi-gs .ks-info-box{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:5px 8px;flex-shrink:0;}',
      '#bt-kpi-gs .ks-ib-row{display:flex;justify-content:space-between;align-items:baseline;gap:6px;}',
      '#bt-kpi-gs .ks-ib-key{font-size:11px;color:'+C.sub+';letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;flex-shrink:0;}',
      '#bt-kpi-gs .ks-ib-val{font-family:\'IBM Plex Mono\',monospace;font-size:13px;font-weight:700;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#bt-kpi-gs .ks-uptime{font-size:31px;font-weight:700;color:'+C.hlth+';line-height:1;margin-bottom:2px;font-family:\'IBM Plex Mono\',monospace;}',
      '#bt-kpi-gs .ks-uptime-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:'+C.sub+';margin-bottom:8px;}',
      '#bt-kpi-gs .ks-kv-row{display:flex;justify-content:space-around;gap:6px;margin-top:6px;}',
      '#bt-kpi-gs .ks-kv{display:flex;flex-direction:column;align-items:center;gap:3px;}',
      '#bt-kpi-gs .ks-kv-badge{font-size:17px;font-weight:700;padding:4px 10px;border-radius:4px;background:#0f1c2e;color:'+C.info+';border:1px solid rgba(88,166,255,.3);font-family:monospace;}',
      '#bt-kpi-gs .ks-kv-key{font-size:11px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;}',
      '#bt-kpi-gs .ks-net-val{font-size:31px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;margin-bottom:3px;}',
      '#bt-kpi-gs .ks-net-sub{font-size:12px;color:'+C.sub+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px;}',
      '#bt-kpi-gs .ks-sep{height:1px;background:rgba(255,255,255,0.06);flex-shrink:0;margin:5px 0;}',
      '#bt-kpi-gs .ks-delta{font-size:13px;margin-top:2px;}',
      '#bt-kpi-gs .ks-delta.flat{color:'+C.sub+'}',
      '#bt-kpi-gs .ks-delta.up  {color:'+C.crit+'}',
      '#bt-kpi-gs .ks-delta.down{color:'+C.ok+'}',
      '#bt-kpi-gs .ks-ping-row{display:flex;align-items:center;gap:8px;padding:6px 0 2px;}',
      '#bt-kpi-gs .ks-ping-icon{font-size:22px;line-height:1;flex-shrink:0;}',
      '#bt-kpi-gs .ks-ping-info{display:flex;flex-direction:column;gap:2px;min-width:0;}',
      '#bt-kpi-gs .ks-ping-status{font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;}',
      '#bt-kpi-gs .ks-ping-sub{font-size:12px;color:'+C.sub+';}',
      '#bt-kpi-gs .ks-vmw-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px;}',
      '#bt-kpi-gs .ks-vmw-cell{display:flex;flex-direction:column;gap:1px;padding:3px 6px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:3px;min-width:0;}',
      '#bt-kpi-gs .ks-vmw-k{font-size:10px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;white-space:nowrap;}',
      '#bt-kpi-gs .ks-vmw-v{font-size:13px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;color:'+C.text+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '#bt-kpi-gs .ks-no-agent-warn{font-size:11px;font-weight:600;color:'+C.crit+';border:1px solid rgba(248,81,73,.2);background:rgba(248,81,73,.07);border-radius:3px;padding:3px 6px;margin-top:5px;flex-shrink:0;}',
      '@keyframes ks-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}',
      '#bt-kpi-gs .ks-pulse{animation:ks-pulse 1.5s ease-in-out infinite;}',
      '#bt-kpi-gs .ks-dk-rows{display:flex;flex-direction:column;gap:4px;flex-shrink:0;margin-bottom:5px;}',
      '#bt-kpi-gs .ks-dk-row{display:grid;grid-template-columns:20px 1fr 32px;align-items:center;gap:5px;}',
      '#bt-kpi-gs .ks-dk-lbl{font-size:14px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;}',
      '#bt-kpi-gs .ks-dk-bar-bg{height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;}',
      '#bt-kpi-gs .ks-dk-bar-fg{height:5px;border-radius:3px;}',
      '#bt-kpi-gs .ks-dk-pct{font-size:13px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;text-align:right;line-height:1;}',
      '#bt-kpi-gs .ks-dk-sep{height:1px;background:rgba(255,255,255,0.06);flex-shrink:0;margin:5px 0;}',
      '#bt-kpi-gs .ks-dk-io{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;flex:1;align-content:center;}',
      '#bt-kpi-gs .ks-dk-kv{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:5px 2px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.055);border-radius:4px;}',
      '#bt-kpi-gs .ks-dk-val{font-size:16px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;text-align:center;}',
      '#bt-kpi-gs .ks-dk-badge{font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;padding:2px 4px;border-radius:2px;text-align:center;line-height:1.3;white-space:nowrap;}',
      '#bt-kpi-gs .ks-dk-badge.ok   {border:1px solid rgba(63,185,80,.35);background:rgba(63,185,80,.13);color:'+C.ok+';}',
      '#bt-kpi-gs .ks-dk-badge.warn {border:1px solid rgba(210,153,34,.35);background:rgba(210,153,34,.13);color:'+C.warn+';}',
      '#bt-kpi-gs .ks-dk-badge.crit {border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.13);color:'+C.crit+';}',
      '#bt-kpi-gs .ks-dk-badge.muted{border:1px solid rgba(46,51,59,.8);background:rgba(46,51,59,.3);color:'+C.sub+';}',
      '#bt-kpi-gs .ks-dk-unit{font-size:10px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.06em;text-align:center;}',
      '#bt-kpi-gs .ks-card.al::before{background:'+C.sub+'}',
      '#bt-kpi-gs .ks-card.al.trig::before{background:'+C.crit+'}',
      '#bt-kpi-gs .ks-al-ok{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:2px;}',
      '#bt-kpi-gs .ks-al-ok-icon{font-size:22px;line-height:1;}',
      '#bt-kpi-gs .ks-al-ok-lbl{font-size:12px;font-weight:700;color:'+C.ok+';}',
      '#bt-kpi-gs .ks-al-ok-sub{font-size:8px;color:'+C.sub+';text-transform:uppercase;letter-spacing:.07em;margin-top:2px;}',
      '#bt-kpi-gs .ks-al-pills{display:flex;flex-direction:column;gap:5px;flex:1;justify-content:center;}',
      '#bt-kpi-gs .ks-al-pill{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border-radius:4px;gap:6px;}',
      '#bt-kpi-gs .ks-al-pill.crit{background:rgba(248,81,73,.12);border:1px solid rgba(248,81,73,.35);}',
      '#bt-kpi-gs .ks-al-pill.warn{background:rgba(210,153,34,.12);border:1px solid rgba(210,153,34,.35);}',
      '#bt-kpi-gs .ks-al-pill.info{background:rgba(88,166,255,.12);border:1px solid rgba(88,166,255,.35);}',
      '#bt-kpi-gs .ks-al-pill.muted{background:rgba(110,118,129,.08);border:1px solid rgba(110,118,129,.25);}',
      '#bt-kpi-gs .ks-al-sev{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}',
      '#bt-kpi-gs .ks-al-pill.crit .ks-al-sev{color:'+C.crit+';}',
      '#bt-kpi-gs .ks-al-pill.warn .ks-al-sev{color:'+C.warn+';}',
      '#bt-kpi-gs .ks-al-pill.info .ks-al-sev{color:'+C.info+';}',
      '#bt-kpi-gs .ks-al-pill.muted .ks-al-sev{color:'+C.sub+';}',
      '#bt-kpi-gs .ks-al-cnt{font-size:19px;font-weight:700;font-family:\'IBM Plex Mono\',monospace;line-height:1;}',
      '#bt-kpi-gs .ks-al-pill.crit .ks-al-cnt{color:'+C.crit+';}',
      '#bt-kpi-gs .ks-al-pill.warn .ks-al-cnt{color:'+C.warn+';}',
      '#bt-kpi-gs .ks-al-pill.info .ks-al-cnt{color:'+C.info+';}',
      '#bt-kpi-gs .ks-al-pill.muted .ks-al-cnt{color:'+C.sub+';}',
      '</style>',
    ].join('');
  })();


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 5 · COMPONENTES SVG
  // ════════════════════════════════════════════════════════════════════════════

  var SVG = {
    sourceBadge: function (source, hasAgent) {
      if(hasAgent) return '<span class="ks-badge agente">AGENTE</span>';
      if(source==='stale') return '<span class="ks-badge stale">AGENTE STALE</span>';
      var fb='';
      if(source==='VMware') fb='<span class="ks-badge vmware" style="margin-left:4px;">VMware</span>';
      else if(source==='ICMP') fb='<span class="ks-badge icmp" style="margin-left:4px;">ICMP</span>';
      return '<span class="ks-badge no-agent">SEM AGENTE</span>'+fb;
    },
    gauge180: function (pct, col, avgLabel, thr) {
      var w=148,h=82,cx=w/2,cy=h-4,r=Math.min(cx-10,cy-8),sw=8;
      function polar(deg,rad){var a=(deg-180)*Math.PI/180;return{x:cx+rad*Math.cos(a),y:cy+rad*Math.sin(a)};}
      function arc(sD,eD,ra){var p1=polar(sD,ra),p2=polar(eD,ra),lg=(eD-sD)>180?1:0;
        return '<path d="M'+p1.x.toFixed(1)+','+p1.y.toFixed(1)+' A'+ra+','+ra+' 0 '+lg+' 1 '+p2.x.toFixed(1)+','+p2.y.toFixed(1)+'" fill="none" stroke="'+col+'" stroke-width="'+sw+'" stroke-linecap="round"/>';}
      function tick(pv,tc){var a=pv*180/100,inn=polar(a,r-sw-4),out=polar(a,r+4);
        return '<line x1="'+inn.x.toFixed(1)+'" y1="'+inn.y.toFixed(1)+'" x2="'+out.x.toFixed(1)+'" y2="'+out.y.toFixed(1)+'" stroke="'+tc+'" stroke-width="1.5" opacity="0.7"/>';}
      var safe=Math.max(0,Math.min(100,pct||0)),ea=safe*180/100,pctY=cy-(avgLabel?14:4),C=CFG.colors;
      return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="display:block;overflow:visible;">'
        +'<path d="M'+polar(0,r).x.toFixed(1)+','+polar(0,r).y.toFixed(1)+' A'+r+','+r+' 0 1 1 '+polar(180,r).x.toFixed(1)+','+polar(180,r).y.toFixed(1)+'" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="'+sw+'" stroke-linecap="round"/>'
        +(safe>0?arc(0,ea,r):'')
        +tick(thr.warn,C.warn)+tick(thr.crit,C.crit)
        +'<text x="'+cx+'" y="'+pctY+'" text-anchor="middle" font-family="\'IBM Plex Mono\',monospace" font-size="21" font-weight="700" fill="'+col+'">'+safe.toFixed(1)+'%</text>'
        +(avgLabel?'<text x="'+cx+'" y="'+(cy+10)+'" text-anchor="middle" font-family="\'IBM Plex Mono\',monospace" font-size="9.5" fill="'+C.sub+'">'+U.esc(avgLabel)+'</text>':'')
        +'</svg>';
    },
    sparkline: function (vals,col,w,h,opTop) {
      if(!vals||vals.length<2) return '';
      var op=opTop!=null?opTop:0.35,mn=Math.min.apply(null,vals),mx=Math.max.apply(null,vals),rng=mx-mn||1;
      var pts=vals.map(function(v,i){return[(i/(vals.length-1))*w,h-((v-mn)/rng)*(h-5)-2];});
      var ln='M'+pts.map(function(p){return p[0].toFixed(1)+','+p[1].toFixed(1);}).join('L');
      var ar='M'+pts[0][0].toFixed(1)+','+h+'L'+ln.slice(1)+'L'+pts[pts.length-1][0].toFixed(1)+','+h+'Z';
      var gid='spk'+Math.random().toString(36).slice(2,7),last=pts[pts.length-1];
      return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="display:block;">'
        +'<defs><linearGradient id="'+gid+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="'+col+'" stop-opacity="'+op+'"/><stop offset="100%" stop-color="'+col+'" stop-opacity="0"/></linearGradient></defs>'
        +'<path d="'+ar+'" fill="url(#'+gid+')"/>'
        +'<path d="'+ln+'" fill="none" stroke="'+col+'" stroke-width="1.5" stroke-linejoin="round"/>'
        +'<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="2.5" fill="'+col+'"/>'
        +'</svg>';
    },
    sparklineEmpty: function (w,h) {
      return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="display:block;">'
        +'<line x1="0" y1="'+(h/2)+'" x2="'+w+'" y2="'+(h/2)+'" stroke="'+CFG.colors.mute+'" stroke-width="1"/>'
        +'</svg>';
    },
    infoBox: function (rows) {
      return '<div class="ks-info-box">'+rows.map(function(r){
        return '<div class="ks-ib-row"><span class="ks-ib-key">'+U.esc(r[0])+'</span><span class="ks-ib-val" style="color:'+(r[2]||CFG.colors.sub)+';">'+U.esc(String(r[1]))+'</span></div>';
      }).join('')+'</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 6 · CARDS HTML
  // ════════════════════════════════════════════════════════════════════════════

  var Card = {

    health: function (d) {
      var C=CFG.colors;
      var SEV_COLOR={0:C.sub,1:C.info,2:C.warn,3:C.warn,4:C.crit,5:C.crit};
      var SEV_LABEL={0:'N/C',1:'INFO',2:'WARN',3:'AVG',4:'HIGH',5:'DISASTER'};
      function trigBadge(problems) {
        if(!problems||problems.length===0) {
          return '<div class="ks-sep"></div>'
            +'<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">'
            +'<span style="color:'+C.ok+';font-size:10px;font-weight:700;">✓ OK</span>'
            +'<span style="color:'+C.sub+';font-size:9px;">Sem triggers activos</span>'
            +'</div>';
        }
        var sev=parseInt(problems[0].priority,10);
        var col=SEV_COLOR[sev]||C.warn;
        var lbl=SEV_LABEL[sev]||'WARN';
        return '<div class="ks-sep"></div>'
          +'<div style="display:flex;align-items:center;gap:4px;margin-top:2px;">'
          +'<span style="color:'+col+';font-size:10px;font-weight:700;">⚠ '+problems.length+' TRIGGER'+(problems.length>1?'S':'')+'</span>'
          +'<span style="background:'+col+';color:#fff;font-size:8px;font-weight:700;padding:1px 4px;border-radius:2px;">'+lbl+'</span>'
          +'</div>';
      }
      if(d.hasAgent){
        var upStr=U.fmtUptime(d.uptimeSecs);
        var rebootHtml=(U.isValid(d.uptimeSecs)&&d.uptimeSecs<3600)?'<span style="color:'+C.crit+';font-size:8px;font-weight:700;margin-left:6px;">REBOOT RECENTE</span>':'';
        return '<div class="ks-card hlth">'
          +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">SAÚDE DO SISTEMA</span></div>'+SVG.sourceBadge(d.source,d.hasAgent)+'</div>'
          +'<div class="ks-uptime">'+upStr+rebootHtml+'</div>'
          +'<div class="ks-uptime-lbl">Uptime</div>'
          +'<div class="ks-sep"></div>'
          +'<div class="ks-kv-row">'
          +'<div class="ks-kv"><span class="ks-kv-badge">'+(d.procs!==null?d.procs:'—')+'</span><span class="ks-kv-key">Processos</span></div>'
          +'<div class="ks-kv"><span class="ks-kv-badge">'+(d.threads!==null?d.threads:'—')+'</span><span class="ks-kv-key">Threads</span></div>'
          +'</div>'
          +trigBadge(d.triggers)
          +'</div>';
      }
      var upStr2=U.fmtUptime(d.uptimeSecs);
      var uptimeSrc=d.uptimeSource==='vmware'?'VMware':'ICMP';
      var pingHtml='';
      if(d.icmpUp!==null){
        var pingIcon=d.icmpUp?'🟢':'<span class="ks-pulse">🔴</span>';
        var pingLabel=d.icmpUp?'<span class="ks-ping-status" style="color:'+C.ok+';">UP</span>':'<span class="ks-ping-status" style="color:'+C.crit+';">DOWN</span>';
        var rttStr=U.isValid(d.icmpRtt)?d.icmpRtt.toFixed(2)+' ms':'— ms';
        var lossStr=U.isValid(d.icmpLoss)?d.icmpLoss.toFixed(0)+'% perda':'— perda';
        var rttColor=U.isValid(d.icmpRtt)?U.thrColor(d.icmpRtt,CFG.thresholds.icmp):C.sub;
        pingHtml='<div class="ks-ping-row"><span class="ks-ping-icon">'+pingIcon+'</span><div class="ks-ping-info">'+pingLabel+'<span class="ks-ping-sub" style="color:'+rttColor+';">'+U.esc(rttStr)+' · '+U.esc(lossStr)+'</span></div></div>';
      } else {
        pingHtml='<div class="ks-ping-row"><span class="ks-ping-icon" style="opacity:.3;">⚪</span><span class="ks-ping-sub">Ping não disponível</span></div>';
      }
      var powerHtml='';
      if(d.powerOn!==null){var pwIcon=d.powerOn?'⚡':'💤',pwLabel=d.powerOn?'poweredOn':'poweredOff',pwColor=d.powerOn?C.ok:C.warn;powerHtml='<div style="margin-bottom:4px;"><span style="font-size:9px;font-weight:700;color:'+pwColor+';">'+pwIcon+' '+pwLabel+'</span></div>';}
      var vmwRows=[];
      if(d.hvShort)    vmwRows.push(['HYPERVISOR', U.trunc(d.hvShort,16)]);
      if(d.cluster)    vmwRows.push(['CLUSTER',    U.trunc(d.cluster,16)]);
      if(d.datacenter) vmwRows.push(['DATACENTER', U.trunc(d.datacenter,16)]);
      if(U.isValid(d.numCPU)&&d.memSizeB) vmwRows.push(['vCPU / RAM', d.numCPU+' · '+U.fmtBytes(d.memSizeB)]);
      var vmwHtml='';
      if(vmwRows.length>0){
        vmwHtml='<div class="ks-vmw-grid">'
          +vmwRows.map(function(r){
            return '<div class="ks-vmw-cell">'
              +'<span class="ks-vmw-k">'+U.esc(r[0])+'</span>'
              +'<span class="ks-vmw-v">'+U.esc(r[1])+'</span>'
              +'</div>';
          }).join('')
          +'</div>';
      }
      var warnHtml='<div class="ks-no-agent-warn">⚠ Agente Zabbix não activo — métricas limitadas</div>';
      return '<div class="ks-card hlth">'
        +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">SAÚDE DO SISTEMA</span></div>'+SVG.sourceBadge(d.source,d.hasAgent)+'</div>'
        +(U.isValid(d.uptimeSecs)?'<div class="ks-uptime">'+upStr2+'</div><div class="ks-uptime-lbl">Uptime · '+uptimeSrc+'</div>':'<div class="ks-uptime" style="color:'+C.sub+';font-size:18px;">—</div><div class="ks-uptime-lbl">Uptime indisponível</div>')
        +powerHtml+'<div class="ks-sep"></div>'+pingHtml
        +(vmwHtml?'<div class="ks-sep"></div>'+vmwHtml:'')+warnHtml
        +trigBadge(d.triggers)+'</div>';
    },

    cpu: function (d) {
      var C=CFG.colors,thr=CFG.thresholds.cpu,color=U.thrColor(d.value,thr);
      var srcColor=d.hasAgent?C.ok:(d.source==='VMware'?C.info:C.warn);
      var rdyStr='—';var rdyColor=C.sub;
      if(U.isValid(d.cpuReady)){
        var rms=d.cpuReady;
        rdyStr=rms.toFixed(0)+' ms';
        rdyColor=(rms>=2000)?C.crit:(rms>=500)?C.warn:C.ok;
      }
      return '<div class="ks-card cpu">'
        +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">CPU</span><span class="ks-signal cpu">RED</span></div>'+SVG.sourceBadge(d.source,d.hasAgent)+'</div>'
        +'<div class="ks-gauge">'+SVG.gauge180(d.value,color,null,thr)+'</div>'
        +'<div class="ks-spark">'+SVG.sparklineEmpty(148,18)+'</div>'
        +SVG.infoBox([['fonte',d.source,srcColor],['contexto',d.sub1||'—',C.sub],['cpu ready',rdyStr,rdyColor]])
        +'</div>';
    },

    memory: function (d) {
      var C=CFG.colors,thr=CFG.thresholds.mem,color=U.thrColor(d.value,thr);
      return '<div class="ks-card mem">'
        +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">MEMÓRIA</span><span class="ks-signal mem">SAT</span></div>'+SVG.sourceBadge(d.source,d.hasAgent)+'</div>'
        +'<div class="ks-gauge">'+SVG.gauge180(d.value,color,null,thr)+'</div>'
        +'<div class="ks-spark">'+SVG.sparklineEmpty(148,18)+'</div>'
        +SVG.infoBox([['utilização',d.sub1||'—',color],['extra',d.sub2||'—',C.sub]])
        +'</div>';
    },

    network: function (d) {
      var C=CFG.colors;
      return '<div class="ks-card net">'
        +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">REDE</span><span class="ks-signal net">TRF</span></div>'+SVG.sourceBadge(d.source,d.hasAgent)+'</div>'
        +'<div class="ks-net-val" style="color:'+d.color+';">'+U.esc(d.displayVal)+'</div>'
        +'<div class="ks-net-sub">'+U.esc(d.sub)+'</div>'
        +'<div class="ks-spark">'+SVG.sparklineEmpty(148,20)+'</div>'
        +'<div class="ks-delta flat" id="dlt-net">— vs 1h</div>'
        +'</div>';
    },

    disk: function (d) {
      var C=CFG.colors,thr=CFG.thresholds.disk;

      var rowsHtml='';
      if(d.disks.length===0){
        rowsHtml='<div style="color:'+C.sub+';font-size:10px;padding:4px 0;">Sem dados de disco</div>';
      } else {
        for(var i=0;i<d.disks.length;i++){
          var vol=d.disks[i];
          var pct=U.isValid(vol.pct)?vol.pct:0;
          var barColor=U.thrColor(pct,thr);
          var barRgb=U.rgb(barColor);
          var diskCtx = (U.isValid(vol.used) && U.isValid(vol.total) && vol.total > 0)
          ? U.fmtBytes(vol.used) + ' / ' + U.fmtBytes(vol.total)
          : '';

        rowsHtml+='<div class="ks-dk-row" style="grid-template-columns:20px minmax(40px,1fr) 32px auto;">'
          +'<span class="ks-dk-lbl" style="color:'+barColor+';">'+U.esc(vol.label)+'</span>'
          +'<div class="ks-dk-bar-bg"><div class="ks-dk-bar-fg" style="width:'+Math.min(100,pct).toFixed(1)+'%;background:linear-gradient(90deg,rgba('+barRgb+',.5),'+barColor+');"></div></div>'
          +'<span class="ks-dk-pct" style="color:'+barColor+';">'+pct.toFixed(0)+'%</span>'
          +'<span style="font-size:9px;color:'+CFG.colors.sub+';font-family:\'IBM Plex Mono\',monospace;white-space:nowrap;">'+U.esc(diskCtx)+'</span>'
          +'</div>';
        }
      }

      return '<div class="ks-card io">'
        +'<div class="ks-head">'
          +'<div class="ks-head-left"><span class="ks-label">DISCO</span><span class="ks-signal io">ERR</span></div>'
          +SVG.sourceBadge(d.source,d.hasAgent)
        +'</div>'
        +'<div class="ks-dk-rows">'+rowsHtml+'</div>'
        +'</div>';
    },

    alerts: function (problems) {
      var C=CFG.colors;
      var counts={5:0,4:0,3:0,2:0,1:0,0:0};
      for(var i=0;i<problems.length;i++){
        var sev=parseInt(problems[i].priority,10);
        if(counts[sev]!==undefined) counts[sev]++;
      }
      var total=problems.length;
      var hasTrig=total>0;
      var bodyHtml='';
      if(!hasTrig){
        bodyHtml='<div class="ks-al-ok">'
          +'<div class="ks-al-ok-icon" style="color:'+C.ok+';">✓</div>'
          +'<div class="ks-al-ok-lbl">OK</div>'
          +'<div class="ks-al-ok-sub">Sem alertas activos</div>'
          +'</div>';
      } else {
        var critN=counts[5]+counts[4];
        var warnN=counts[3]+counts[2];
        var infoN=counts[1];
        var ncN=counts[0];
        var pills=[];
        if(critN>0) pills.push(['CRIT',critN,'crit']);
        if(warnN>0) pills.push(['WARN',warnN,'warn']);
        if(infoN>0) pills.push(['INFO',infoN,'info']);
        if(ncN>0)   pills.push(['N/C', ncN,  'muted']);
        bodyHtml='<div class="ks-al-pills">'
          +pills.map(function(p){
            return '<div class="ks-al-pill '+p[2]+'">'
              +'<span class="ks-al-sev">'+p[0]+'</span>'
              +'<span class="ks-al-cnt">'+p[1]+'</span>'
              +'</div>';
          }).join('')
          +'</div>';
      }
      return '<div class="ks-card al'+(hasTrig?' trig':'')+'">'
        +'<div class="ks-head"><div class="ks-head-left"><span class="ks-label">ALERTAS</span></div></div>'
        +bodyHtml
        +'</div>';
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 7 · API ZABBIX
  // ════════════════════════════════════════════════════════════════════════════

  var ZbxApi = {
    call: function (method, params, signal) {
      var body = { jsonrpc: '2.0', id: 1, method: method, params: params };
      return fetchWithRetry(PROXY, body, signal || undefined)
        .then(function(j){if(j.error) throw new Error(j.error.data||j.error.message);return j.result;});
    },
    getHostId: function (hostName, signal) {
      return ZbxApi.call('host.get',{output:['hostid'],filter:{host:[hostName]},selectInterfaces:['type']}, signal)
        .then(function(hosts){
          if(!hosts||hosts.length===0) throw new Error('Host não encontrado: '+hostName);
          return{hostid:hosts[0].hostid,interfaces:hosts[0].interfaces||[]};
        });
    },
    getItems: function (hostid, signal) {
      return ZbxApi.call('item.get',{hostids:[hostid],
        output:['itemid','name','lastvalue','key_','lastclock','state','type'],monitored:true,limit:CFG.apiLimits.items}, signal);
    },
    getValueAt1h: function (item, signal) {
      if(!item) return Promise.resolve(null);
      var t=Math.floor(Date.now()/1000);
      return ZbxApi.call('history.get',{itemids:[item.itemid],output:['value'],
        sortfield:'clock',sortorder:'ASC',time_from:t-3720,time_till:t-3480,limit:1}, signal)
        .then(function(h){return h.length>0?parseFloat(h[0].value):null;});
    },
    getSparklineHistory: function (item, signal) {
      if(!item) return Promise.resolve([]);
      var t=Math.floor(Date.now()/1000);
      return ZbxApi.call('history.get',{itemids:[item.itemid],output:['value'],
        sortfield:'clock',sortorder:'ASC',time_from:t-CFG.sparkWindowSecs,time_till:t,limit:CFG.sparkPoints}, signal)
        .then(function(h){return h.map(function(x){return parseFloat(x.value);});});
    },
    getProblems: function (hostid, signal) {
      return ZbxApi.call('trigger.get', {
        hostids: [hostid],
        output: ['triggerid','description','priority','lastchange','value'],
        only_true: true, monitored: true, active: true, skipDependent: true,
        sortfield: 'priority', sortorder: 'DESC', limit: 20
      }, signal);
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 8 · DOM HELPERS
  // ════════════════════════════════════════════════════════════════════════════

  var Dom = {
    injectSparkAt: function (idx, vals, col, h) {
      var root=document.getElementById(CFG.rootId);
      if(!root) return;
      var sparks=root.querySelectorAll('.ks-spark');
      if(!sparks[idx]) return;
      if(!vals||vals.length<2) return;
      sparks[idx].innerHTML=SVG.sparkline(vals,col,148,h||18,0.40);
    },
    updateDelta: function (elId, cur, prev, fmtFn) {
      var el=document.getElementById(elId);
      if(!el||!U.isValid(prev)||!U.isValid(cur)) return;
      var d=cur-prev,cls=Math.abs(d)<0.05?'flat':(d>0?'up':'down');
      var sign=d>=0?'+':'',arrow=cls==='up'?' ↑':cls==='down'?' ↓':' →';
      el.textContent=sign+fmtFn(d)+arrow;
      el.className='ks-delta '+cls;
    },
  };


  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO 9 · BOOTSTRAP v14
  // ════════════════════════════════════════════════════════════════════════════
  //
  // ARQUITECTURA DE DEFESA v14:
  //
  // PROBLEMA 1 — Double-fire do BT:
  //   O BT v6.x dispara "after content ready" DUAS vezes por cada mudança
  //   de variável. Na v13, o AbortController da 2ª execução abortava a 1ª
  //   antes do getHostId completar → AbortError → sem dados.
  //
  //   SOLUÇÃO: Abort com delay de CFG.abortDelayMs (80ms).
  //   As duas execuções do double-fire chegam com <10ms de diferença.
  //   O delay absorve o double-fire: quando a 2ª execução agenda o abort,
  //   a 1ª já completou getHostId. O token trata do resto.
  //
  // PROBLEMA 2 — DOM recriado entre execuções:
  //   O elemento root (#bt-kpi-gs) pode ser recriado pelo BT, apagando
  //   root.__kpigs_token e root.__kpigs_abort (v13 usava root como namespace).
  //
  //   SOLUÇÃO: Namespace em window com chave única por painel.
  //   window.__kpigs = window.__kpigs || {}
  //   window.__kpigs[CFG.rootId] = { token, controller, abortTimer }
  //   window sobrevive a qualquer re-render DOM.
  //   CFG.rootId garante isolamento entre painéis BT distintos na mesma página.
  //
  // FLUXO DE DEFESA EM CAMADAS (mudança lenta — utilizador espera):
  //   Camada 1 — AbortController (delay 80ms): cancela fetch HTTP anterior
  //   Camada 2 — token window:                 descarta resultados escapados
  //
  // FLUXO DE DEFESA EM CAMADAS (6 mudanças rápidas — clique rápido):
  //   Double-fire: delay absorve → só 1 fetch por VM chega ao servidor
  //   Mudanças rápidas: token descarta resultados de VMs intermédias
  //   AbortController: cancela fetches de VMs intermédias (após delay)

  // ── Namespace window estável ──────────────────────────────────────────────
  if (!window.__kpigs) window.__kpigs = {};
  var _ns = window.__kpigs[CFG.rootId] || {};
  window.__kpigs[CFG.rootId] = _ns;

  var root = document.getElementById(CFG.rootId);
  if (!root) return;

  var hostRaw  = new URLSearchParams(window.location.search).get('var-hostid') || '';
  var hostName = hostRaw ? U.extractHostName(hostRaw) : '';

  console.log('[KPI-GS v18.1] host:', hostName, '| token anterior:', _ns.token || 'nenhum');

  // ── Camada 1: AbortController com delay ──────────────────────────────────
  // Cancela o timer de abort anterior (se existir) para não abortar
  // uma execução que acabou de começar (double-fire do BT).
  if (_ns.abortTimer) {
    clearTimeout(_ns.abortTimer);
    _ns.abortTimer = null;
  }

  // Agenda o abort da execução anterior com delay.
  // Se for double-fire (<10ms entre execuções), o delay absorve-o.
  // Se for mudança real (>80ms entre execuções), o abort efectua-se.
  var _prevController = _ns.controller;
  if (_prevController) {
    _ns.abortTimer = setTimeout(function () {
      _prevController.abort();
      console.log('[KPI-GS v18.1] fetch anterior abortado (delayed)');
      _ns.abortTimer = null;
    }, CFG.abortDelayMs);
  }

  var controller = new AbortController();
  _ns.controller = controller;
  var signal = controller.signal;

  // ── Camada 2: token em window (sobrevive a re-renders DOM) ───────────────
  var _myToken = Date.now() + Math.random();
  _ns.token = _myToken;

  function _isCurrent() {
    return window.__kpigs[CFG.rootId] &&
           window.__kpigs[CFG.rootId].token === _myToken;
  }

  if (!hostName) {
    console.log('[KPI-GS v18.1] limpando DOM para', hostName, '| sou current:', _isCurrent());
    root.innerHTML = '<span style="color:'+CFG.colors.sub+';font-size:11px;">Selecciona uma VM no selector acima.</span>';
    return;
  }

  root.innerHTML = '<span style="color:'+CFG.colors.sub+';font-size:11px;">A carregar métricas…</span>';

  ZbxApi.getHostId(hostName, signal)
    .then(function (hostInfo) {
      if (!_isCurrent()) {
        console.log('[KPI-GS v18.1] descartado após getHostId →', hostName);
        return;
      }

      var hasAgentIface = U.hasAgentInterface(hostInfo.interfaces);

      return ZbxApi.getItems(hostInfo.hostid, signal)
        .then(function (items) {
          if (!_isCurrent()) {
            console.log('[KPI-GS v18.1] descartado após getItems →', hostName);
            return;
          }

          var byKey = U.buildKeyIndex(items);

          var health  = Resolver.health (items, byKey, hasAgentIface);
          var cpu     = Resolver.cpu    (items, byKey, hasAgentIface);
          var memory  = Resolver.memory (items, byKey, hasAgentIface);
          var network = Resolver.network(items, byKey, hasAgentIface);
          var disk    = Resolver.disk   (items, byKey, hasAgentIface);

          // ── Sparklines + delta de rede obtidos em Promise.all (não pós-render) ──
          // Incluídos no render final: o DOM só é tocado uma vez, sem janela
          // de race onde o BT possa recriar o root e perder as sparklines.
          return Promise.all([
            ZbxApi.getSparklineHistory(cpu.sparkItem, signal).catch(function(){return [];}),
            ZbxApi.getSparklineHistory(memory.sparkItem, signal).catch(function(){return [];}),
            ZbxApi.getSparklineHistory(network.sparkItem, signal).catch(function(){return [];}),
            ZbxApi.getValueAt1h(network.sparkItem, signal).catch(function(){return null;}),
            ZbxApi.getProblems(hostInfo.hostid, signal).catch(function(){return [];})
          ]).then(function (spk) {
            if (!_isCurrent()) return;

            var liveRoot = document.getElementById(CFG.rootId);
            if (!liveRoot) return;

            health.triggers = spk[4];

            liveRoot.innerHTML = CSS
              + '<div class="ks-grid">'
              + Card.health(health)
              + Card.cpu(cpu)
              + Card.memory(memory)
              + Card.network(network)
              + Card.disk(disk)
              + Card.alerts(spk[4])
              + '</div>';

            // Preencher sparklines no mesmo tick do render (sem gap async)
            Dom.injectSparkAt(0, spk[0], U.thrColor(cpu.value, CFG.thresholds.cpu), 18);
            Dom.injectSparkAt(1, spk[1], U.thrColor(memory.value, CFG.thresholds.mem), 18);
            Dom.injectSparkAt(2, spk[2], network.color, 20);
            Dom.updateDelta('dlt-net', network.curVal, spk[3], function(d){
              return network.hasAgent?(d/1000).toFixed(1)+' Kbps':d.toFixed(2)+' ms';
            });

            console.log('[KPI-GS v18.1] render OK →', hostName,
              '| agente:', health.hasAgent,
              '| cpu source:', cpu.source,
              '| mem source:', memory.source,
              '| items total:', items.length);
          });
        });
    })
    .catch(function (e) {
      if (e.name === 'AbortError') {
        console.log('[KPI-GS v18.1] AbortError (esperado em mudanças rápidas) →', hostName);
        return;
      }
      if (!_isCurrent()) return;
      console.error('[KPI-GS v18.1] Erro:', e.message);
      var errRoot = document.getElementById(CFG.rootId);
      if (errRoot) errRoot.innerHTML = renderErro(e.message, 'Confirmar que a VM existe no Zabbix e que o proxy Grafana responde.');
    });

})();