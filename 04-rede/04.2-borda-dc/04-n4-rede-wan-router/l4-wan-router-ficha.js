// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · REDE · WAN ROUTER — FICHA TÉCNICA  v3.0               ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Variável Grafana "routerName" (Custom, hostname como value).           ║
// ║  Painel resolve hostname → hostid via host.get — compatível com        ║
// ║  painéis nativos Time Series que usam $routerName directamente.        ║
// ║                                                                          ║
// ║  Melhorias v3.0 vs v2.0:                                                ║
// ║   • Impacto de negócio por secção (NOC Junior)                         ║
// ║   • Eventos recentes — flapping detector (4h)                          ║
// ║   • BGP: prefixos recebidos/anunciados quando disponíveis              ║
// ║   • Hostname-based var → Time Series nativas funcionam com $routerName ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_R4 = {
  elementId:       'bpc-n4-wan-router',
  refreshMs:        60000,
  maxAgeSec:        600,
  defaultHostname: 'DC1-RTE-WAN-INT',
  n3DashUid:       'rede-n3-wan',

  routers: {
    'DC1-RTE-WAN-INT':  { funcao:'Internet BGP',     modelo:'ISR4451',     hasSla:true,  hasBgp:true,  hasVoice:false },
    'DC1-RTE-WAN-EMIS': { funcao:'EMIS',             modelo:'ISR4451',     hasSla:false, hasBgp:false, hasVoice:false },
    'DC1-RTE-GTW01':    { funcao:'Gateway / VRFs',   modelo:'C8200',       hasSla:false, hasBgp:false, hasVoice:false },
    'DC1-RTE-WAN-AG':   { funcao:'Hub Agências',     modelo:'C8500L-8S4X', hasSla:false, hasBgp:false, hasVoice:false },
    'DC1-RTE-PARC':     { funcao:'Parceiros / Voz',  modelo:'ISR4451',     hasSla:false, hasBgp:false, hasVoice:true  },
  },

  // Impacto de negócio por categoria — texto para NOC Junior
  ifImpact: {
    bgp:          { icon:'🌐', text:'Internet pública · cloud · clientes BPC online' },
    emis:         { icon:'💳', text:'EMIS — ATMs, POS, TPA, pagamentos interbancários' },
    expressroute: { icon:'☁️', text:'Azure ExpressRoute — serviços cloud BPC' },
    dmvpn:        { icon:'🏦', text:'Agências BPC — conectividade sucursais' },
    parceiros:    { icon:'🏛️', text:'Parceiros gov: BNA, MINFIN, INSS, BODIVA, MJDH...' },
    voice:        { icon:'📞', text:'Voz CUBE — PSTN, conferências, linhas IP' },
    uplink:       { icon:'🔗', text:'Fabric DC — uplink crítico para todos os serviços' },
  },

  ifCategories: [
    { key:'bgp',          label:'Internet / BGP',
      match: function(n,d){ return /BGP_PEER/i.test(n)||/BGP_PEER/i.test(d) } },
    { key:'emis',         label:'EMIS',
      match: function(n,d){ return /SP_EMIS|EMIS/i.test(d) } },
    { key:'expressroute', label:'Azure ExpressRoute',
      match: function(n,d){ return /Po2\.293[12]/i.test(n)||/EXPRESSROUTE|AZURE/i.test(d) } },
    { key:'dmvpn',        label:'DMVPN / Agências',
      match: function(n,d){ return /^Tu\d+/i.test(n) } },
    { key:'parceiros',    label:'Circuitos parceiros / gov',
      match: function(n,d){
        return /^(Po2\.|Gi0\/0\/[01]\.\d)/i.test(n)
            && !/BGP_PEER|SP_EMIS|Po2\.293[12]/i.test(n+' '+d)
            && !/^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC)/i.test(d)
      } },
    { key:'voice',        label:'Voz / CUBE',
      match: function(n,d){ return /^(EFXS|VoiceEncapPeer|VoiceOverIpPeer|Vo\d)/i.test(n) } },
    { key:'uplink',       label:'Uplinks para o fabric',
      match: function(n,d){
        return /^(Po1|Te[0-9]|GigabitEthernet[0-9]\/[0-9]\/[0-9]+$)/i.test(n)
            || /^(GERENCIA|MGMT|P2P_CORE|P2P_RTE|P2P_DC|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC)/i.test(d)
      } },
    { key:'infra',        label:'Infra / gestão',
      match: function(n,d){ return /^(Lo|Null|Vlan|BVI|Mgmt|nve|SE\d)/i.test(n) } },
  ],

  visibleCats: {
    'DC1-RTE-WAN-INT':  ['bgp','uplink'],
    'DC1-RTE-WAN-EMIS': ['emis','uplink'],
    'DC1-RTE-GTW01':    ['parceiros','uplink'],
    'DC1-RTE-WAN-AG':   ['expressroute','dmvpn','uplink'],
    'DC1-RTE-PARC':     ['parceiros','voice','uplink'],
  },

  slaLabels: { '2':'Probe 2','3':'Probe 3','60':'Probe 60','62':'Probe 62','65':'ITA Internet' },
  flapWindowSec: 14400,  // 4h

  sevLabel: { '0':'Info','1':'Info','2':'Aviso','3':'Médio','4':'Alto','5':'Crítico' },
  sevColor: { '0':'#94A3B8','1':'#64B5F6','2':'#FFD54F','3':'#FF8A65','4':'#EF5350','5':'#B71C1C' },
  sevBg:    { '0':'rgba(148,163,184,.12)','1':'rgba(100,181,246,.12)','2':'rgba(255,213,79,.12)',
               '3':'rgba(255,138,101,.12)','4':'rgba(239,83,80,.12)','5':'rgba(183,28,28,.12)' },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function r4Esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] }) }
function r4Stale(c){ return !c||(Math.floor(Date.now()/1000)-parseInt(c,10))>CFG_R4.maxAgeSec }
function r4FmtBps(o){
  if(o==null||isNaN(o)||o<0) return null
  var b=o*8; if(b>=1e9) return (b/1e9).toFixed(2)+' Gbps'; if(b>=1e6) return (b/1e6).toFixed(1)+' Mbps'; if(b>=1e3) return (b/1e3).toFixed(0)+' Kbps'; return b.toFixed(0)+' bps'
}
function r4FmtUp(s){
  if(!s) return '—'; var v=parseInt(s,10),d=Math.floor(v/86400),h=Math.floor((v%86400)/3600),m=Math.floor((v%3600)/60)
  return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':m+'m'
}
function r4FmtDur(s){
  var v=parseInt(s,10),d=Math.floor(v/86400),h=Math.floor((v%86400)/3600),m=Math.floor((v%3600)/60)
  return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':m+'m'
}
function r4FmtTs(ts){
  var d=new Date(parseInt(ts,10)*1000); return d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'})
}
function r4ParseIf(name){
  var m=/Interface\s+([^(\s]+)(?:\s*\(([^)]*)\))?/.exec(name||''); if(!m) return null
  return { ifname:m[1].trim(), desc:(m[2]||'').trim() }
}
function r4Dot(up,stale,sz){
  var T=window.BPC.THEME,s=sz||8,c=stale?T.colorMute:(up?T.colorOk:T.colorCrit)
  var pulse=!stale&&!up?'animation:bpc-pulse-pill 1.2s ease-in-out infinite;':''
  return '<span style="display:inline-block;width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+c+';flex-shrink:0;'+pulse+'"></span>'
}
function r4Badge(lbl,col,bg){
  return '<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:.70rem;font-weight:700;color:'+col+';background:'+(bg||col+'1A')+';border:1px solid '+col+'33">'+r4Esc(lbl)+'</span>'
}
function r4KPI(label,val,color,unit){
  var T=window.BPC.THEME,c=color||T.colorMute
  return '<div style="display:flex;flex-direction:column;align-items:center;padding:8px 14px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid '+c+'33;min-width:72px">'
    +'<span style="font-size:1.2rem;font-weight:800;color:'+c+'">'+(val!=null?r4Esc(String(val)):'—')+(val!=null&&unit?'<span style="font-size:.72rem;color:#64748B">'+unit+'</span>':'')+'</span>'
    +'<span style="font-size:.67rem;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">'+r4Esc(label)+'</span>'
    +'</div>'
}
function r4SecBlock(title,content,color){
  var c=color||'#334155'
  return '<div style="margin-bottom:10px;border:1px solid '+c+'44;border-radius:8px;overflow:hidden">'
    +'<div style="padding:5px 10px;background:'+c+'18;border-bottom:1px solid '+c+'33">'
    +'<span style="font-size:.73rem;font-weight:700;color:'+c+';text-transform:uppercase;letter-spacing:.07em">'+r4Esc(title)+'</span>'
    +'</div>'+content+'</div>'
}

// Variável Grafana "routerName" → hostname → resolve para hostid em runtime
function r4GetHostname(){
  try {
    var v=context&&context.grafana&&context.grafana.variables?context.grafana.variables.routerName:null
    if(v&&CFG_R4.routers[String(v).trim()]) return String(v).trim()
  } catch(e){}
  try {
    var p=new URLSearchParams(window.location.search).get('var-routerName')
    if(p&&CFG_R4.routers[p.trim()]) return p.trim()
  } catch(e){}
  return CFG_R4.defaultHostname
}
function r4Classify(n,d){
  for(var i=0;i<CFG_R4.ifCategories.length;i++) if(CFG_R4.ifCategories[i].match(n,d)) return CFG_R4.ifCategories[i].key
  return 'other'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function r4ResolveHostId(rpc, hostname){
  return rpc('host.get',{ filter:{host:[hostname]}, output:['hostid','host'], limit:1 })
    .then(function(r){ if(!r||!r.length) throw new Error('Router não encontrado: '+hostname); return r[0].hostid })
}

function r4Fetch(rpc, hostId, rtr){
  var now=Math.floor(Date.now()/1000)
  var calls=[
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.status'}, output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.in'},    output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.out'},   output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'system.cpu.util'}, output:['name','key_','lastvalue','lastclock'], limit:3 }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'vm.memory.util'}, output:['name','key_','lastvalue','lastclock'], limit:3 }),
    rpc('item.get',{ hostids:[hostId], search:{name:'uptime'}, searchWildcardsEnabled:true, output:['name','key_','lastvalue','lastclock'], limit:1 }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'icmpping'},      output:['name','key_','lastvalue','lastclock'] }),
    rpc('trigger.get',{ hostids:[hostId], filter:{value:1}, output:['description','priority','lastchange'], sortfield:'priority', sortorder:'DESC', limit:20 }),
    rpc('event.get',{ hostids:[hostId], time_from:now-CFG_R4.flapWindowSec, output:['name','clock','value','severity'], source:'0', sortfield:'clock', sortorder:'DESC', limit:30 }),
  ]
  if(rtr.hasSla) calls.push(rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'rttMonCtrlAdmin'}, output:['name','key_','lastvalue','lastclock'] }))
  if(rtr.hasBgp) calls.push(rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'bgp'},           output:['name','key_','lastvalue','lastclock'] }))
  return Promise.all(calls).then(function(r){
    return { ifStatus:r[0], ifIn:r[1], ifOut:r[2], cpu:r[3], ram:r[4], uptime:r[5], icmp:r[6], triggers:r[7], events:r[8], sla:r[9]||[], bgpItems:r[10]||[] }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function r4Compute(data, rtr){
  var sys={
    cpu:    data.cpu.length    ? parseFloat(data.cpu[0].lastvalue)    : null,
    ram:    data.ram.length    ? parseFloat(data.ram[0].lastvalue)    : null,
    uptime: data.uptime.length ? data.uptime[0].lastvalue             : null,
    icmp:   data.icmp.length   ? data.icmp[0].lastvalue==='1'         : null,
  }

  var trIdx={}
  function idxTr(items,field){ items.forEach(function(it){ var m=/Interface\s+([^(\s]+)/.exec(it.name||''); if(!m) return; var k=m[1].trim(); if(!trIdx[k]) trIdx[k]={}; trIdx[k][field]=r4Stale(it.lastclock)?null:parseFloat(it.lastvalue) }) }
  idxTr(data.ifIn,'inBps'); idxTr(data.ifOut,'outBps')

  var cats={}
  CFG_R4.ifCategories.forEach(function(c){ cats[c.key]=[] })
  cats['other']=[]
  data.ifStatus.forEach(function(it){
    var p=r4ParseIf(it.name); if(!p) return
    var cat=r4Classify(p.ifname,p.desc)
    // ifOperStatus=4 (unknown) é o estado NORMAL de portas FXS de voz não
    // ligadas a nenhuma linha (rede-topologia.md §4.4) — não é uma falha.
    // Só se aplica à categoria 'voice'; qualquer outra categoria continua
    // estrita (só '1' = up).
    var up=(cat==='voice') ? (it.lastvalue==='1'||it.lastvalue==='4') : it.lastvalue==='1'
    var stale=r4Stale(it.lastclock), tr=trIdx[p.ifname]||{}
    cats[cat].push({ ifname:p.ifname, desc:p.desc, up:up, stale:stale, inBps:tr.inBps!=null?tr.inBps:null, outBps:tr.outBps!=null?tr.outBps:null })
  })
  Object.keys(cats).forEach(function(k){
    cats[k].sort(function(a,b){ if(!a.stale&&!b.stale&&a.up!==b.up) return a.up?1:-1; return a.ifname<b.ifname?-1:1 })
  })

  // IP SLA
  var slaProbes={}
  data.sla.forEach(function(it){
    var m=/rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_); if(!m) return
    var field=m[1],idx=m[2]; if(!slaProbes[idx]) slaProbes[idx]={}
    slaProbes[idx][field]={ val:it.lastvalue, stale:r4Stale(it.lastclock) }
  })

  // BGP prefixes (quando items existem)
  var bgpPrefixes={}
  data.bgpItems.forEach(function(it){
    var m=/bgp[._].*peer[._].*?(\d+\.\d+\.\d+\.\d+).*?(prefixes?|routes?)/i.exec(it.name||'')
    if(!m) return
    var peer=m[1]
    if(!bgpPrefixes[peer]) bgpPrefixes[peer]={ rx:null, tx:null }
    if(/receiv|accept|in/i.test(it.name)) bgpPrefixes[peer].rx=it.lastvalue
    if(/sent|advertis|out/i.test(it.name)) bgpPrefixes[peer].tx=it.lastvalue
  })

  // Flapping: eventos de interface nos últimos 4h
  var flapEvents=[]
  data.events.forEach(function(ev){
    if(!ev.name) return
    flapEvents.push({ name:ev.name, clock:ev.clock, state:ev.value==='1'?'PROBLEM':'RESOLVED' })
  })

  var now=Math.floor(Date.now()/1000)
  var triggers=data.triggers.map(function(t){ return { desc:t.description, sev:t.priority, dur:now-parseInt(t.lastchange,10) } })

  var svcCats=['bgp','emis','expressroute','dmvpn','parceiros']
  var svcDown=svcCats.reduce(function(acc,k){ return acc+(cats[k]||[]).filter(function(i){ return !i.stale&&!i.up }).length },0)

  return { sys:sys, cats:cats, slaProbes:slaProbes, bgpPrefixes:bgpPrefixes, flapEvents:flapEvents, triggers:triggers, svcDown:svcDown }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function r4RenderFicha(hostname, hostId, rtr, model){
  var T=window.BPC.THEME
  var s=model.sys
  var icmpCol=s.icmp==null?T.colorMute:(s.icmp?T.colorOk:T.colorCrit)
  var cpuCol=s.cpu==null?T.colorMute:s.cpu>85?T.colorCrit:s.cpu>70?T.colorWarn:T.colorOk
  var ramCol=s.ram==null?T.colorMute:s.ram>90?T.colorCrit:s.ram>80?T.colorWarn:T.colorOk

  var badges=''
  if(model.triggers.length>0) badges+=r4Badge(model.triggers.length+' alerta'+(model.triggers.length>1?'s':''),T.colorCrit)
  else badges+=r4Badge('Sem alertas',T.colorOk)
  if(model.svcDown>0) badges+=' '+r4Badge(model.svcDown+' circuito'+(model.svcDown>1?'s':'')+' DOWN',T.colorCrit)
  if(model.flapEvents.length>0) badges+=' '+r4Badge(model.flapEvents.length+' eventos 4h','#F0A500')

  var backLink=CFG_R4.n3DashUid
    ?'<a href="/d/'+CFG_R4.n3DashUid+'" style="font-size:.75rem;color:#64748B;text-decoration:none;display:block;margin-bottom:6px">← N3 · WAN — Serviços</a>'
    :''

  return '<div style="background:rgba(255,255,255,0.03);border:1px solid #1E293B;border-radius:10px;padding:12px 16px;margin-bottom:12px">'
    +backLink
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+r4Dot(s.icmp,s.icmp==null,12)
    +'<span style="font-size:1.05rem;font-weight:800;color:#E2E8F0">'+r4Esc(hostname)+'</span></div>'
    +'<div style="font-size:.76rem;color:#475569;margin-bottom:8px">'+r4Esc(rtr.funcao)+' &nbsp;·&nbsp; '+r4Esc(rtr.modelo)+' &nbsp;·&nbsp; hostid '+r4Esc(hostId)+'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+badges+'</div>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +r4KPI('ICMP',s.icmp==null?null:(s.icmp?'UP':'DOWN'),icmpCol,'')
    +r4KPI('CPU',s.cpu!=null?s.cpu.toFixed(1):null,cpuCol,'%')
    +r4KPI('RAM',s.ram!=null?s.ram.toFixed(1):null,ramCol,'%')
    +r4KPI('Uptime',r4FmtUp(s.uptime),T.colorMute,'')
    +'</div></div>'
}

function r4RenderIfList(ifs){
  if(!ifs.length) return '<div style="font-size:.75rem;color:#475569;padding:4px 8px">—</div>'
  return ifs.map(function(i){
    var T=window.BPC.THEME
    var col=i.stale?T.colorMute:(i.up?T.colorOk:T.colorCrit)
    var lbl=i.stale?'?':(i.up?'UP':'DOWN')
    var bg=!i.stale&&!i.up?'background:rgba(248,81,73,0.07);':''
    var inS=r4FmtBps(i.inBps),outS=r4FmtBps(i.outBps)
    var trStr=(inS||outS)?'↓ '+(inS||'—')+' ↑ '+(outS||'—'):''
    return '<div style="'+bg+'display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">'
      +r4Dot(i.up,i.stale,7)
      +'<span style="font-size:.80rem;font-weight:600;color:#CDD9E5;min-width:110px;flex-shrink:0">'+r4Esc(i.ifname)+'</span>'
      +'<span style="font-size:.74rem;color:#64748B;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+r4Esc(i.desc)+'">'+r4Esc(i.desc||'—')+'</span>'
      +'<span style="font-size:.74rem;font-weight:700;color:'+col+';white-space:nowrap">'+lbl+'</span>'
      +(trStr?'<span style="font-size:.72rem;color:#64748B;white-space:nowrap">'+r4Esc(trStr)+'</span>':'')
      +'</div>'
  }).join('')
}

function r4RenderCircuitos(hostname, rtr, model){
  var T=window.BPC.THEME
  var visible=CFG_R4.visibleCats[hostname]||['parceiros','uplink']
  var catMeta={}; CFG_R4.ifCategories.forEach(function(c){ catMeta[c.key]=c })
  var catColors={ bgp:'#00B4D8',emis:'#F0A500',expressroute:'#0078D4',dmvpn:'#22C55E',parceiros:'#A78BFA',voice:'#EC4899',uplink:'#64748B' }

  var html='<div style="margin-bottom:12px"><div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Circuitos</div>'
  visible.forEach(function(key){
    var ifs=model.cats[key]||[]
    var meta=catMeta[key]||{label:key}, col=catColors[key]||'#64748B'
    var down=ifs.filter(function(i){ return !i.stale&&!i.up }).length
    var impact=CFG_R4.ifImpact[key]
    var impactHtml=impact?'<div style="font-size:.70rem;color:#475569;padding:3px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +impact.icon+' '+r4Esc(impact.text)+(down>0?'&nbsp;<span style="color:'+T.colorCrit+';font-weight:700">⚠ IMPACTO ACTIVO</span>':'')
      +'</div>':''

    // SLA embutido na secção BGP
    var extra=''
    if(key==='bgp'&&rtr.hasSla){
      var slaRows=Object.keys(CFG_R4.slaLabels).map(function(idx){
        var p=model.slaProbes[idx]||{},sense=p['Sense'],rtt=p['CompletionTime']
        var ok=sense&&!sense.stale&&sense.val==='1', stale=!sense||sense.stale, sc=stale?T.colorMute:(ok?T.colorOk:T.colorCrit)
        return '<div style="display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">'
          +r4Dot(!stale&&ok,stale,7)
          +'<span style="font-size:.78rem;font-weight:600;color:#CDD9E5;min-width:56px">SLA '+r4Esc(idx)+'</span>'
          +'<span style="font-size:.74rem;color:#64748B;flex:1">'+r4Esc(CFG_R4.slaLabels[idx]||'')+'</span>'
          +'<span style="font-size:.74rem;font-weight:700;color:'+sc+'">'+(stale?'?':(ok?'OK':'FAIL'))+'</span>'
          +(rtt&&!rtt.stale?'<span style="font-size:.74rem;color:#CDD9E5;font-weight:600">'+r4Esc(rtt.val)+' ms</span>':'')
          +'</div>'
      }).join('')
      extra='<div style="border-top:1px solid rgba(255,255,255,0.06)">'
        +'<div style="padding:4px 10px;background:rgba(255,255,255,0.02)"><span style="font-size:.68rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em">IP SLA</span></div>'
        +slaRows+'</div>'

      // Prefixos BGP quando disponíveis
      var peerKeys=Object.keys(model.bgpPrefixes)
      if(peerKeys.length){
        var bgpPfxRows=peerKeys.map(function(peer){
          var p=model.bgpPrefixes[peer]
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:.75rem">'
            +'<span style="color:#CDD9E5;min-width:120px">'+r4Esc(peer)+'</span>'
            +(p.rx!=null?'<span style="color:#22C55E">↓ '+r4Esc(p.rx)+' pfx</span>':'')
            +(p.tx!=null?'<span style="color:#64748B">↑ '+r4Esc(p.tx)+' pfx</span>':'')
            +'</div>'
        }).join('')
        extra+='<div style="border-top:1px solid rgba(255,255,255,0.06)">'
          +'<div style="padding:4px 10px;background:rgba(255,255,255,0.02)"><span style="font-size:.68rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em">Prefixos BGP</span></div>'
          +bgpPfxRows+'</div>'
      }
    }

    var titleLabel=meta.label+(down>0?'  ⚠ '+down+' DOWN':'')
    html+=r4SecBlock(titleLabel,'<div>'+impactHtml+r4RenderIfList(ifs)+extra+'</div>',down>0?T.colorCrit:col)
  })
  return html+'</div>'
}

function r4RenderFlapping(model){
  if(!model.flapEvents.length) return ''
  var T=window.BPC.THEME
  var rows=model.flapEvents.slice(0,10).map(function(ev){
    var col=ev.state==='PROBLEM'?T.colorCrit:T.colorOk
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +'<span style="font-size:.68rem;font-weight:700;color:'+col+';white-space:nowrap;min-width:60px">'+r4Esc(ev.state==='PROBLEM'?'PROBLEM':'OK')+'</span>'
      +'<span style="font-size:.74rem;color:#94A3B8;flex:1">'+r4Esc(ev.name)+'</span>'
      +'<span style="font-size:.70rem;color:#475569;white-space:nowrap">'+r4FmtTs(ev.clock)+'</span>'
      +'</div>'
  }).join('')
  return '<div style="margin-bottom:12px">'
    +'<div style="font-size:.78rem;font-weight:700;color:#F0A500;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">⚡ Eventos últimas 4h ('+model.flapEvents.length+')</div>'
    +r4SecBlock('Histórico de eventos',rows,'#F0A500')
    +'</div>'
}

function r4RenderAlertas(model){
  var T=window.BPC.THEME
  var hdr='<div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Alertas activos</div>'
  if(!model.triggers.length) return hdr+'<div style="padding:8px 12px;border-radius:8px;border:1px solid '+T.colorOk+'33;color:'+T.colorOk+';font-size:.82rem">Sem alertas activos neste router</div>'
  var rows=model.triggers.map(function(t){
    var col=CFG_R4.sevColor[t.sev]||'#94A3B8',bg=CFG_R4.sevBg[t.sev]||'rgba(148,163,184,.12)'
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +'<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:.68rem;font-weight:700;color:'+col+';background:'+bg+';border:1px solid '+col+'33;white-space:nowrap">'+(CFG_R4.sevLabel[t.sev]||t.sev)+'</span>'
      +'<span style="font-size:.78rem;color:#CDD9E5;flex:1">'+r4Esc(t.desc)+'</span>'
      +'<span style="font-size:.72rem;color:#475569;white-space:nowrap">'+r4FmtDur(t.dur)+'</span>'
      +'</div>'
  }).join('')
  return hdr+'<div style="border:1px solid #1E293B;border-radius:8px;overflow:hidden">'+rows+'</div>'
}

function r4Render(el, hostname, hostId, rtr, model){
  el.innerHTML='<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif;padding:4px 0">'
    +r4RenderFicha(hostname,hostId,rtr,model)
    +r4RenderCircuitos(hostname,rtr,model)
    +r4RenderFlapping(model)
    +r4RenderAlertas(model)
    +'</div>'
}
function r4RenderError(el,msg){ el.innerHTML='<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Ficha WAN Router: '+r4Esc(msg)+'</div></div>' }


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function r4Load(rpc){
  var el=document.getElementById(CFG_R4.elementId); if(!el) return
  var hostname=r4GetHostname(), rtr=CFG_R4.routers[hostname]
  if(!rtr){ r4RenderError(el,'Router não reconhecido: '+hostname); return }
  el.innerHTML='<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar '+r4Esc(hostname)+'…</div>'
  r4ResolveHostId(rpc,hostname)
    .then(function(hostId){
      return r4Fetch(rpc,hostId,rtr).then(function(data){ r4Render(el,hostname,hostId,rtr,r4Compute(data,rtr)) })
    })
    .catch(function(err){ r4RenderError(el,err.message||String(err)) })
  window.BPC.utils.startRefresh(el,function(){ r4Load(rpc) },CFG_R4.refreshMs)
}
function r4InitWithRetry(attempt){
  attempt=attempt||0
  if(typeof window.waitForBPC==='function'){ window.waitForBPC(r4Load); return }
  if(attempt>50){ console.error('[BPC] l4-wan-router-ficha: waitForBPC nunca disponivel'); return }
  setTimeout(function(){ r4InitWithRetry(attempt+1) },100)
}
r4InitWithRetry()
