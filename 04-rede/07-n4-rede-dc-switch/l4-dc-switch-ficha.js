// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · REDE · DC SWITCH — FICHA TÉCNICA  v1.1                ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Variável Grafana "switchName" (Query → HG_DC_SWITCHES, hostname).     ║
// ║  Resolve hostname → hostid via host.get — Time Series nativas usam     ║
// ║  $switchName directamente no filtro Zabbix.                            ║
// ║                                                                          ║
// ║  Melhorias v1.1:                                                         ║
// ║   • Impacto de negócio por secção (NOC Junior)                         ║
// ║   • Eventos recentes — flapping detector (4h)                          ║
// ║   • Port-channel: membros activos vs. esperados                        ║
// ║   • BGP EVPN: prefixos recebidos quando items disponíveis             ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_SW = {
  elementId:       'bpc-n4-dc-switch',
  refreshMs:        60000,
  maxAgeSec:        600,
  defaultHostname: 'DC1-SPINE-11',
  flapWindowSec:    14400,  // 4h

  meta: {
    'DC1-SPINE-11': { tier:'SPINE', modelo:'N9K-9336C-FX2',  hasBgp:true,  hasServers:false, vpc:null },
    'DC1-SPINE-12': { tier:'SPINE', modelo:'N9K-9336C-FX2',  hasBgp:true,  hasServers:false, vpc:null },
    'DC1-LEAF-101': { tier:'LEAF',  modelo:'N9K-93180YC-FX3', hasBgp:false, hasServers:true,  vpc:'vPC-A' },
    'DC1-LEAF-102': { tier:'LEAF',  modelo:'N9K-93180YC-FX3', hasBgp:false, hasServers:true,  vpc:'vPC-A' },
    'DC1-LEAF-103': { tier:'LEAF',  modelo:'N9K-93108TC-FX',  hasBgp:false, hasServers:true,  vpc:'vPC-B' },
    'DC1-LEAF-104': { tier:'LEAF',  modelo:'N9K-93108TC-FX',  hasBgp:false, hasServers:true,  vpc:'vPC-B' },
    'DC1-LEAF-105': { tier:'LEAF',  modelo:'N9K-93180YC-FX3', hasBgp:false, hasServers:true,  vpc:null },
  },

  // Impacto de negócio por categoria (NOC Junior)
  ifImpact: {
    spine:  { icon:'🔗', text:'Inter-SPINE — falha afecta metade da capacidade do fabric' },
    leaf:   { icon:'🖧',  text:'Links SPINE↔LEAF — LEAF fica isolado sem uplinks redundantes' },
    router: { icon:'🌐', text:'Handoff WAN → fabric — perde conectividade WAN/Internet' },
    server: { icon:'💻', text:'Servidores / ESXi — VMs sem conectividade se todos os uplinks caírem' },
    vpc:    { icon:'⚡', text:'vPC Peer-link — degradação afecta redundância do port-channel' },
  },

  ifCategories: [
    { key:'spine',    label:'Uplinks SPINE↔SPINE',      match: function(n,d){ return /SPINE|INTER.SPINE/i.test(d) } },
    { key:'leaf',     label:'Links para LEAFs',          match: function(n,d){ return /LEAF|UNDERLAY/i.test(d) } },
    { key:'router',   label:'Links para routers WAN',   match: function(n,d){ return /RTE|WAN|router/i.test(d)&&!/LEAF|SPINE/i.test(d) } },
    { key:'server',   label:'Downlinks para servidores', match: function(n,d){ return /SRV|ESX|SVR|SERVER|esxi|vcenter/i.test(d)||(/^Ethernet\d+\/\d+$/i.test(n)&&!/SPINE|LEAF|WAN|RTE/i.test(d)) } },
    { key:'vpc',      label:'vPC Peer-link',             match: function(n,d){ return /vPC|peer.link|peer_link/i.test(d)||/^port-channel\d+$/i.test(n) } },
    { key:'mgmt',     label:'Gestão / OOB',              match: function(n,d){ return /^mgmt/i.test(n)||/MGMT|OOB|GERENCIA/i.test(d) } },
    { key:'loopback', label:'Loopbacks',                 match: function(n,d){ return /^(Lo|loopback)/i.test(n) } },
  ],

  visibleCats: {
    SPINE: ['spine','leaf','router','vpc'],
    LEAF:  ['leaf','server','router','vpc'],
  },

  sevLabel: { '0':'Info','1':'Info','2':'Aviso','3':'Médio','4':'Alto','5':'Crítico' },
  sevColor: { '0':'#94A3B8','1':'#64B5F6','2':'#FFD54F','3':'#FF8A65','4':'#EF5350','5':'#B71C1C' },
  sevBg:    { '0':'rgba(148,163,184,.12)','1':'rgba(100,181,246,.12)','2':'rgba(255,213,79,.12)',
               '3':'rgba(255,138,101,.12)','4':'rgba(239,83,80,.12)','5':'rgba(183,28,28,.12)' },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function swEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] }) }
function swStale(c){ return !c||(Math.floor(Date.now()/1000)-parseInt(c,10))>CFG_SW.maxAgeSec }
function swFmtBps(o){
  if(o==null||isNaN(o)||o<0) return null
  var b=o*8; if(b>=1e9) return (b/1e9).toFixed(2)+' Gbps'; if(b>=1e6) return (b/1e6).toFixed(1)+' Mbps'; if(b>=1e3) return (b/1e3).toFixed(0)+' Kbps'; return b.toFixed(0)+' bps'
}
function swFmtUp(s){
  if(!s) return '—'; var v=parseInt(s,10),d=Math.floor(v/86400),h=Math.floor((v%86400)/3600),m=Math.floor((v%3600)/60)
  return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':m+'m'
}
function swFmtDur(s){
  var v=parseInt(s,10),d=Math.floor(v/86400),h=Math.floor((v%86400)/3600),m=Math.floor((v%3600)/60)
  return d>0?d+'d '+h+'h':h>0?h+'h '+m+'m':m+'m'
}
function swFmtTs(ts){ var d=new Date(parseInt(ts,10)*1000); return d.toLocaleTimeString('pt-PT',{hour:'2-digit',minute:'2-digit'}) }
function swParseIf(name){
  var m=/Interface\s+([^(\s]+)(?:\s*\(([^)]*)\))?/.exec(name||''); if(!m) return null
  return { ifname:m[1].trim(), desc:(m[2]||'').trim() }
}
function swDot(up,stale,sz){
  var T=window.BPC.THEME,s=sz||8,c=stale?T.colorMute:(up?T.colorOk:T.colorCrit)
  var pulse=!stale&&!up?'animation:bpc-pulse-pill 1.2s ease-in-out infinite;':''
  return '<span style="display:inline-block;width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+c+';flex-shrink:0;'+pulse+'"></span>'
}
function swBadge(lbl,col,bg){ return '<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:.70rem;font-weight:700;color:'+col+';background:'+(bg||col+'1A')+';border:1px solid '+col+'33">'+swEsc(lbl)+'</span>' }
function swKPI(label,val,color,unit){
  var T=window.BPC.THEME,c=color||T.colorMute
  return '<div style="display:flex;flex-direction:column;align-items:center;padding:8px 14px;background:rgba(255,255,255,0.04);border-radius:8px;border:1px solid '+c+'33;min-width:72px">'
    +'<span style="font-size:1.2rem;font-weight:800;color:'+c+'">'+(val!=null?swEsc(String(val)):'—')+(val!=null&&unit?'<span style="font-size:.72rem;color:#64748B">'+unit+'</span>':'')+'</span>'
    +'<span style="font-size:.67rem;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">'+swEsc(label)+'</span>'
    +'</div>'
}
function swSecBlock(title,content,color){
  var c=color||'#334155'
  return '<div style="margin-bottom:10px;border:1px solid '+c+'44;border-radius:8px;overflow:hidden">'
    +'<div style="padding:5px 10px;background:'+c+'18;border-bottom:1px solid '+c+'33">'
    +'<span style="font-size:.73rem;font-weight:700;color:'+c+';text-transform:uppercase;letter-spacing:.07em">'+swEsc(title)+'</span>'
    +'</div>'+content+'</div>'
}

function swGetHostname(){
  try {
    var v=context&&context.grafana&&context.grafana.variables?context.grafana.variables.switchName:null
    if(v&&String(v).trim()) return String(v).trim()
  } catch(e){}
  try {
    var p=new URLSearchParams(window.location.search).get('var-switchName')
    if(p&&p.trim()) return p.trim()
  } catch(e){}
  return CFG_SW.defaultHostname
}
function swClassify(n,d){
  for(var i=0;i<CFG_SW.ifCategories.length;i++) if(CFG_SW.ifCategories[i].match(n,d)) return CFG_SW.ifCategories[i].key
  return 'other'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function swResolveHostId(rpc,hostname){
  return rpc('host.get',{ filter:{host:[hostname]}, output:['hostid','host'], limit:1 })
    .then(function(r){ if(!r||!r.length) throw new Error('Switch não encontrado: '+hostname); return r[0].hostid })
}

function swFetch(rpc,hostId,meta){
  var now=Math.floor(Date.now()/1000)
  var calls=[
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.status'}, output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.in'},     output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.out'},    output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'net.if.errors'}, output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'system.cpu.util'},   output:['name','key_','lastvalue','lastclock'], limit:3 }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'vm.memory.util'},    output:['name','key_','lastvalue','lastclock'], limit:3 }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'system.uptime'},      output:['name','key_','lastvalue','lastclock'] }),
    rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'icmpping'},            output:['name','key_','lastvalue','lastclock'] }),
    rpc('trigger.get',{ hostids:[hostId], filter:{value:1}, output:['description','priority','lastchange'], sortfield:'priority', sortorder:'DESC', limit:20 }),
    rpc('event.get',{ hostids:[hostId], time_from:now-CFG_SW.flapWindowSec, output:['name','clock','value','severity'], source:'0', sortfield:'clock', sortorder:'DESC', limit:30 }),
  ]
  if(meta.hasBgp){
    calls.push(rpc('item.get',{ hostids:[hostId], filter:{status:0}, search:{key_:'bgp'}, output:['name','key_','lastvalue','lastclock'] }))
  }
  return Promise.all(calls).then(function(r){
    return { ifStatus:r[0], ifIn:r[1], ifOut:r[2], ifErr:r[3], cpu:r[4], ram:r[5], uptime:r[6], icmp:r[7], triggers:r[8], events:r[9], bgpItems:r[10]||[] }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function swCompute(data,meta){
  var sys={
    cpu:    data.cpu.length    ? parseFloat(data.cpu[0].lastvalue)    : null,
    ram:    data.ram.length    ? parseFloat(data.ram[0].lastvalue)    : null,
    uptime: data.uptime.length ? data.uptime[0].lastvalue             : null,
    icmp:   data.icmp.length   ? data.icmp[0].lastvalue==='1'         : null,
  }

  var trIdx={}
  function idxF(items,field){ items.forEach(function(it){ var m=/Interface\s+([^(\s]+)/.exec(it.name||''); if(!m) return; var k=m[1].trim(); if(!trIdx[k]) trIdx[k]={}; trIdx[k][field]=swStale(it.lastclock)?null:parseFloat(it.lastvalue) }) }
  idxF(data.ifIn,'inBps'); idxF(data.ifOut,'outBps'); idxF(data.ifErr,'errors')

  var cats={}; CFG_SW.ifCategories.forEach(function(c){ cats[c.key]=[] }); cats['other']=[]
  data.ifStatus.forEach(function(it){
    var p=swParseIf(it.name); if(!p) return
    var cat=swClassify(p.ifname,p.desc), up=it.lastvalue==='1', stale=swStale(it.lastclock), tr=trIdx[p.ifname]||{}
    cats[cat].push({ ifname:p.ifname, desc:p.desc, up:up, stale:stale,
      inBps:tr.inBps!=null?tr.inBps:null, outBps:tr.outBps!=null?tr.outBps:null, errors:tr.errors!=null?tr.errors:null })
  })
  Object.keys(cats).forEach(function(k){
    cats[k].sort(function(a,b){ if(!a.stale&&!b.stale&&a.up!==b.up) return a.up?1:-1; return a.ifname<b.ifname?-1:1 })
  })

  // Interfaces com erros > 0
  var ifWithErrors=[]
  Object.keys(cats).forEach(function(k){
    cats[k].forEach(function(i){ if(i.errors!=null&&i.errors>0) ifWithErrors.push(i) })
  })
  ifWithErrors.sort(function(a,b){ return (b.errors||0)-(a.errors||0) })

  // Port-channel: contar membros UP por Po
  var poMembers={}
  Object.keys(cats).forEach(function(k){
    cats[k].forEach(function(i){
      var m=/^(Po\d+)\.\d+$/.exec(i.ifname)  // sub-iface de Po → ignorar
      if(m) return
      // membro físico de Po: procurar itens com "member of Po" na desc
      if(/member.of.Po(\d+)/i.test(i.desc)){
        var po='Po'+(/member.of.Po(\d+)/i.exec(i.desc)||[,''])[1]
        if(!poMembers[po]) poMembers[po]={ total:0, up:0 }
        poMembers[po].total++; if(!i.stale&&i.up) poMembers[po].up++
      }
    })
  })

  // BGP: sessões + prefixos
  var bgpSessions=[], bgpPrefixes={}
  data.bgpItems.forEach(function(it){
    if(/bgp[._]peer.*state/i.test(it.key_)||/bgp[._]peer.*status/i.test(it.key_)){
      bgpSessions.push({ name:it.name, val:it.lastvalue, stale:swStale(it.lastclock), up:it.lastvalue==='6' })
    }
    var mp=/bgp[._].*peer[._].*?(\d+\.\d+\.\d+\.\d+).*?(prefixes?|routes?)/i.exec(it.name||'')
    if(mp){
      var peer=mp[1]; if(!bgpPrefixes[peer]) bgpPrefixes[peer]={ rx:null, tx:null }
      if(/receiv|accept|in/i.test(it.name)) bgpPrefixes[peer].rx=it.lastvalue
      if(/sent|advertis|out/i.test(it.name)) bgpPrefixes[peer].tx=it.lastvalue
    }
  })

  // Flapping
  var flapEvents=[]
  data.events.forEach(function(ev){ if(ev.name) flapEvents.push({ name:ev.name, clock:ev.clock, state:ev.value==='1'?'PROBLEM':'RESOLVED' }) })

  var now=Math.floor(Date.now()/1000)
  var triggers=data.triggers.map(function(t){ return { desc:t.description, sev:t.priority, dur:now-parseInt(t.lastchange,10) } })

  var svcDown=(cats['leaf']||[]).filter(function(i){ return !i.stale&&!i.up }).length
            + (cats['spine']||[]).filter(function(i){ return !i.stale&&!i.up }).length
            + (cats['router']||[]).filter(function(i){ return !i.stale&&!i.up }).length

  return { sys:sys, cats:cats, ifWithErrors:ifWithErrors, poMembers:poMembers, bgpSessions:bgpSessions, bgpPrefixes:bgpPrefixes, flapEvents:flapEvents, triggers:triggers, svcDown:svcDown }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function swRenderFicha(hostname,hostId,meta,model){
  var T=window.BPC.THEME, s=model.sys
  var icmpCol=s.icmp==null?T.colorMute:(s.icmp?T.colorOk:T.colorCrit)
  var cpuCol=s.cpu==null?T.colorMute:s.cpu>85?T.colorCrit:s.cpu>70?T.colorWarn:T.colorOk
  var ramCol=s.ram==null?T.colorMute:s.ram>90?T.colorCrit:s.ram>80?T.colorWarn:T.colorOk
  var tierCol=meta.tier==='SPINE'?'#00B4D8':'#22C55E'

  var badges=swBadge(meta.tier,tierCol)
  if(meta.vpc) badges+=' '+swBadge(meta.vpc,'#A78BFA')
  if(model.triggers.length>0) badges+=' '+swBadge(model.triggers.length+' alerta'+(model.triggers.length>1?'s':''),T.colorCrit)
  else badges+=' '+swBadge('Sem alertas',T.colorOk)
  if(model.svcDown>0) badges+=' '+swBadge(model.svcDown+' link'+(model.svcDown>1?'s':'')+' DOWN',T.colorCrit)
  if(model.flapEvents.length>0) badges+=' '+swBadge(model.flapEvents.length+' eventos 4h','#F0A500')

  // SPINE DOWN = impacto total fabric
  var impactAlert=''
  if(s.icmp===false && meta.tier==='SPINE'){
    impactAlert='<div style="background:rgba(248,81,73,0.12);border:1px solid #EF535044;border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.80rem;color:#EF5350;font-weight:600">'
      +'⚠ SPINE DOWN — impacto crítico no fabric. Todos os LEAFs perdem metade dos uplinks de redundância.'+'</div>'
  }

  return '<div style="background:rgba(255,255,255,0.03);border:1px solid #1E293B;border-radius:10px;padding:12px 16px;margin-bottom:12px">'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+swDot(s.icmp,s.icmp==null,12)
    +'<span style="font-size:1.05rem;font-weight:800;color:#E2E8F0">'+swEsc(hostname)+'</span></div>'
    +'<div style="font-size:.76rem;color:#475569;margin-bottom:8px">'+swEsc(meta.modelo)+' &nbsp;·&nbsp; hostid '+swEsc(hostId)+'</div>'
    +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+badges+'</div>'
    +impactAlert
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +swKPI('ICMP',s.icmp==null?null:(s.icmp?'UP':'DOWN'),icmpCol,'')
    +swKPI('CPU',s.cpu!=null?s.cpu.toFixed(1):null,cpuCol,'%')
    +swKPI('RAM',s.ram!=null?s.ram.toFixed(1):null,ramCol,'%')
    +swKPI('Uptime',swFmtUp(s.uptime),T.colorMute,'')
    +'</div></div>'
}

function swRenderIfList(ifs){
  if(!ifs.length) return '<div style="font-size:.75rem;color:#475569;padding:4px 8px">—</div>'
  return ifs.map(function(i){
    var T=window.BPC.THEME
    var col=i.stale?T.colorMute:(i.up?T.colorOk:T.colorCrit)
    var lbl=i.stale?'?':(i.up?'UP':'DOWN')
    var bg=!i.stale&&!i.up?'background:rgba(248,81,73,0.07);':''
    var inS=swFmtBps(i.inBps),outS=swFmtBps(i.outBps)
    var trStr=(inS||outS)?'↓ '+(inS||'—')+' ↑ '+(outS||'—'):''
    var errStr=i.errors&&i.errors>0?'<span style="font-size:.70rem;color:#EF5350;margin-left:4px">'+swEsc(String(i.errors))+' erros</span>':''
    return '<div style="'+bg+'display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">'
      +swDot(i.up,i.stale,7)
      +'<span style="font-size:.80rem;font-weight:600;color:#CDD9E5;min-width:110px;flex-shrink:0">'+swEsc(i.ifname)+'</span>'
      +'<span style="font-size:.74rem;color:#64748B;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+swEsc(i.desc)+'">'+swEsc(i.desc||'—')+'</span>'
      +'<span style="font-size:.74rem;font-weight:700;color:'+col+';white-space:nowrap">'+lbl+'</span>'
      +(trStr?'<span style="font-size:.72rem;color:#64748B;white-space:nowrap">'+swEsc(trStr)+'</span>':'')
      +errStr
      +'</div>'
  }).join('')
}

function swRenderFabric(hostname,meta,model){
  var T=window.BPC.THEME
  var visible=CFG_SW.visibleCats[meta.tier]||['leaf','spine','router']
  var catMeta={}; CFG_SW.ifCategories.forEach(function(c){ catMeta[c.key]=c })
  var catColors={ spine:'#00B4D8',leaf:'#22C55E',router:'#F0A500',server:'#A78BFA',vpc:'#64748B' }

  var html='<div style="margin-bottom:12px"><div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Interfaces fabric</div>'
  visible.forEach(function(key){
    var ifs=model.cats[key]||[]; if(!ifs.length) return
    var meta2=catMeta[key]||{label:key}, col=catColors[key]||'#64748B'
    var down=ifs.filter(function(i){ return !i.stale&&!i.up }).length
    var impact=CFG_SW.ifImpact[key]
    var impactHtml=impact?'<div style="font-size:.70rem;color:#475569;padding:3px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +impact.icon+' '+swEsc(impact.text)+(down>0?'&nbsp;<span style="color:'+T.colorCrit+';font-weight:700">⚠ IMPACTO ACTIVO</span>':'')+'</div>':''

    // Port-channel members para categoria vpc
    var poHtml=''
    if(key==='vpc'&&Object.keys(model.poMembers).length){
      var poRows=Object.keys(model.poMembers).map(function(po){
        var pm=model.poMembers[po]
        var col2=pm.up<pm.total?(pm.up===0?T.colorCrit:T.colorWarn):T.colorOk
        return '<div style="display:flex;align-items:center;gap:8px;padding:3px 8px;font-size:.74rem">'
          +swDot(pm.up>0,pm.up===0,7)
          +'<span style="color:#CDD9E5;font-weight:600">'+swEsc(po)+'</span>'
          +'<span style="color:'+col2+'">'+pm.up+'/'+pm.total+' membros UP</span>'
          +'</div>'
      }).join('')
      poHtml='<div style="border-top:1px solid rgba(255,255,255,0.06);padding:4px 0">'+poRows+'</div>'
    }

    html+=swSecBlock(meta2.label+(down>0?' ⚠ '+down+' DOWN':''),'<div>'+impactHtml+swRenderIfList(ifs)+poHtml+'</div>',down>0?T.colorCrit:col)
  })
  return html+'</div>'
}

function swRenderBgp(model){
  if(!model.bgpSessions.length) return ''
  var T=window.BPC.THEME
  var rows=model.bgpSessions.map(function(s){
    var col=s.stale?T.colorMute:(s.up?T.colorOk:T.colorCrit)
    var lbl=s.stale?'?':(s.up?'Established':'Down')
    var peer=/(\d+\.\d+\.\d+\.\d+)/.exec(s.name||'')
    var pfx=peer&&model.bgpPrefixes[peer[1]]?model.bgpPrefixes[peer[1]]:null
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">'
      +swDot(s.up,s.stale,7)
      +'<span style="font-size:.78rem;color:#CDD9E5;flex:1">'+swEsc(s.name)+'</span>'
      +'<span style="font-size:.74rem;font-weight:700;color:'+col+'">'+lbl+'</span>'
      +(pfx&&pfx.rx!=null?'<span style="font-size:.70rem;color:#22C55E">↓'+swEsc(pfx.rx)+' pfx</span>':'')
      +'</div>'
  }).join('')
  var down=model.bgpSessions.filter(function(s){ return !s.stale&&!s.up }).length
  return '<div style="margin-bottom:12px"><div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">BGP EVPN</div>'
    +swSecBlock('Sessões BGP'+(down>0?' ⚠ '+down+' DOWN':''),'<div>'+rows+'</div>',down>0?T.colorCrit:'#00B4D8')
    +'</div>'
}

function swRenderErros(model){
  var T=window.BPC.THEME
  var hdr='<div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Erros de interface</div>'
  if(!model.ifWithErrors.length){
    return '<div style="margin-bottom:12px">'+hdr+'<div style="padding:6px 12px;border-radius:8px;border:1px solid '+T.colorOk+'33;color:'+T.colorOk+';font-size:.82rem">Sem erros CRC / input errors</div></div>'
  }
  var rows=model.ifWithErrors.map(function(i){
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +'<span style="font-size:.80rem;font-weight:600;color:#CDD9E5;min-width:110px">'+swEsc(i.ifname)+'</span>'
      +'<span style="font-size:.74rem;color:#64748B;flex:1">'+swEsc(i.desc||'—')+'</span>'
      +'<span style="font-size:.74rem;font-weight:700;color:'+T.colorCrit+'">'+swEsc(String(i.errors))+' erros</span>'
      +'</div>'
  }).join('')
  return '<div style="margin-bottom:12px">'+hdr+swSecBlock('Interfaces com erros ('+model.ifWithErrors.length+')','<div>'+rows+'</div>',T.colorCrit)+'</div>'
}

function swRenderFlapping(model){
  if(!model.flapEvents.length) return ''
  var T=window.BPC.THEME
  var rows=model.flapEvents.slice(0,10).map(function(ev){
    var col=ev.state==='PROBLEM'?T.colorCrit:T.colorOk
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +'<span style="font-size:.68rem;font-weight:700;color:'+col+';white-space:nowrap;min-width:60px">'+(ev.state==='PROBLEM'?'PROBLEM':'OK')+'</span>'
      +'<span style="font-size:.74rem;color:#94A3B8;flex:1">'+swEsc(ev.name)+'</span>'
      +'<span style="font-size:.70rem;color:#475569;white-space:nowrap">'+swFmtTs(ev.clock)+'</span>'
      +'</div>'
  }).join('')
  return '<div style="margin-bottom:12px">'
    +'<div style="font-size:.78rem;font-weight:700;color:#F0A500;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">⚡ Eventos últimas 4h ('+model.flapEvents.length+')</div>'
    +swSecBlock('Histórico de eventos',rows,'#F0A500')
    +'</div>'
}

function swRenderAlertas(model){
  var T=window.BPC.THEME
  var hdr='<div style="font-size:.78rem;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Alertas activos</div>'
  if(!model.triggers.length) return hdr+'<div style="padding:8px 12px;border-radius:8px;border:1px solid '+T.colorOk+'33;color:'+T.colorOk+';font-size:.82rem">Sem alertas activos</div>'
  var rows=model.triggers.map(function(t){
    var col=CFG_SW.sevColor[t.sev]||'#94A3B8',bg=CFG_SW.sevBg[t.sev]||'rgba(148,163,184,.12)'
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.04)">'
      +'<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:.68rem;font-weight:700;color:'+col+';background:'+bg+';border:1px solid '+col+'33;white-space:nowrap">'+(CFG_SW.sevLabel[t.sev]||t.sev)+'</span>'
      +'<span style="font-size:.78rem;color:#CDD9E5;flex:1">'+swEsc(t.desc)+'</span>'
      +'<span style="font-size:.72rem;color:#475569;white-space:nowrap">'+swFmtDur(t.dur)+'</span>'
      +'</div>'
  }).join('')
  return hdr+'<div style="border:1px solid #1E293B;border-radius:8px;overflow:hidden">'+rows+'</div>'
}

function swRender(el,hostname,hostId,meta,model){
  el.innerHTML='<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif;padding:4px 0">'
    +swRenderFicha(hostname,hostId,meta,model)
    +swRenderFabric(hostname,meta,model)
    +(meta.hasBgp?swRenderBgp(model):'')
    +swRenderErros(model)
    +swRenderFlapping(model)
    +swRenderAlertas(model)
    +'</div>'
}
function swRenderError(el,msg){ el.innerHTML='<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Ficha DC Switch: '+swEsc(msg)+'</div></div>' }


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function swLoad(rpc){
  var el=document.getElementById(CFG_SW.elementId); if(!el) return
  var hostname=swGetHostname()
  var meta=CFG_SW.meta[hostname]||{ tier:'LEAF', modelo:'N9K', hasBgp:false, hasServers:true }
  el.innerHTML='<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar '+swEsc(hostname)+'…</div>'
  swResolveHostId(rpc,hostname)
    .then(function(hostId){
      return swFetch(rpc,hostId,meta).then(function(data){ swRender(el,hostname,hostId,meta,swCompute(data,meta)) })
    })
    .catch(function(err){ swRenderError(el,err.message||String(err)) })
  window.BPC.utils.startRefresh(el,function(){ swLoad(rpc) },CFG_SW.refreshMs)
}
function swInitWithRetry(attempt){
  attempt=attempt||0
  if(typeof window.waitForBPC==='function'){ window.waitForBPC(swLoad); return }
  if(attempt>50){ console.error('[BPC] l4-dc-switch-ficha: waitForBPC nunca disponivel'); return }
  setTimeout(function(){ swInitWithRetry(attempt+1) },100)
}
swInitWithRetry()
