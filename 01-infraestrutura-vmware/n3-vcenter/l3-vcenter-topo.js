// N3 VMware — Topo do vCenter (identidade + saúde agregada + clusters)
// Faz o fetch completo e expõe window.VCD_CACHE[vcHostId] para os outros painéis.

var CFG_VCDT = {
  elementId:      'bpc-vmw-vc-topo',
  groupIdESXi:    '603',   // BPC/DOMINIO/01 Virtualizacao — grupo com os ESXi reais ({$VMWARE.URL} + vmware.hv.*). 608 (HYPERVISORES) so tem VMs/appliances.
  groupIdVMs:     '609',
  refreshMs:      60000,
  staleThreshold: 3600,
  PROXY: 'http://10.10.126.22:3000/api/datasources/uid/3_KgG43nz/resources/zabbix-api',
  statusColor: ['#6E7681','#3FB950','#D29922','#F85149'],
  statusLabel: ['?','OK','WARN','CRIT'],
}

function vcdt_normalizeUrl(url) {
  return (url||'').toLowerCase().replace(/\/sdk$/,'').replace(/\/$/,'').trim()
}
function vcdt_getParam(name) {
  try { return new URLSearchParams(window.location.search).get(name)||'' } catch(e){ return '' }
}

function start_vcdt(rpc) {
  var el = document.getElementById(CFG_VCDT.elementId)
  if (!el) return

  var vcHostId = vcdt_getParam('var-vcenter_hostid')
  if (!vcHostId) {
    el.innerHTML = '<div style="padding:20px;color:#D29922;font-family:monospace;font-size:13px">⚠ Aceda via drill-down do N2 (?var-vcenter_hostid=&lt;id&gt;).</div>'
    return
  }

  el.innerHTML = '<div style="padding:12px;color:#6E7681;font-size:12px;font-family:monospace">A carregar…</div>'
  var now = Math.floor(Date.now()/1000)

  function zpost(m,p){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest()
      x.open('POST',CFG_VCDT.PROXY,true)
      x.setRequestHeader('Content-Type','application/json')
      x.onload=function(){try{res(JSON.parse(x.responseText).result||[])}catch(e){rej(e)}}
      x.onerror=function(){rej(new Error('XHR'))}
      x.send(JSON.stringify({jsonrpc:'2.0',method:m,params:p,id:1}))
    })
  }

  // Resolução nome→hostid: o dropdown Grafana devolve o nome visível do host,
  // mas a API Zabbix exige o hostid numérico em hostids:[].
  // Se já for numérico, usa directamente; caso contrário resolve via host.get.
  function vcdt_resolveId(nameOrId) {
    if (/^\d+$/.test(nameOrId)) return Promise.resolve(nameOrId)
    return zpost('host.get', {
      groupids: ['664'], search: { name: nameOrId }, output: ['hostid'], limit: 1
    }).then(function(r) { return r.length ? r[0].hostid : nameOrId })
  }

  vcdt_resolveId(vcHostId).then(function(resolvedId) {

  Promise.all([
    zpost('host.get',{hostids:[resolvedId],output:['hostid','name'],selectMacros:['macro','value']}),
    zpost('item.get',{hostids:[resolvedId],search:{key_:'vmware.fullname['},output:['lastvalue','lastclock'],limit:5}),
    zpost('item.get',{hostids:[resolvedId],search:{key_:'vmware.status['},output:['lastvalue','lastclock'],limit:5}),
    zpost('item.get',{hostids:[resolvedId],search:{key_:'vmware.cluster.status['},output:['key_','lastvalue'],limit:200}),
    zpost('host.get',{groupids:[CFG_VCDT.groupIdESXi],output:['hostid','name'],selectMacros:['macro','value'],limit:500}),
  ]).then(function(pa){
    var vcHosts=pa[0],fullItems=pa[1],statItems=pa[2],clsItems=pa[3],allESXi=pa[4]

    if(!vcHosts.length){
      el.innerHTML='<div style="padding:14px;color:#F85149;font-family:monospace">vCenter '+vcHostId+' não encontrado.</div>'
      return
    }
    var vcHost=vcHosts[0]
    var urlMacro=(vcHost.macros||[]).find(function(m){return m.macro==='{$VMWARE.URL}'})
    var vcUrl=urlMacro?vcdt_normalizeUrl(urlMacro.value):''
    var vcIp=vcUrl.replace(/^https?:\/\//,'').replace(/\/.*$/,'')
    var fullname=fullItems[0]?fullItems[0].lastvalue:''
    var verMatch=fullname.match(/vCenter Server\s+([\d.]+)/i)
    var version=verMatch?verMatch[1]:''
    var stale=fullItems[0]?(now-parseInt(fullItems[0].lastclock||0))>CFG_VCDT.staleThreshold:true
    var status=statItems[0]?parseInt(statItems[0].lastvalue)||0:0

    var clusters={}
    clsItems.forEach(function(i){
      var m=i.key_.match(/vmware\.cluster\.status\[[^\]]+?,(.+)\]/)
      if(!m)return
      clusters[m[1].trim()]={status:parseInt(i.lastvalue)||0,esxiCount:0}
    })

    var myESXi=allESXi.filter(function(h){
      var m=(h.macros||[]).find(function(x){return x.macro==='{$VMWARE.URL}'})
      return m&&vcdt_normalizeUrl(m.value)===vcUrl
    })
    var myESXiIds=myESXi.map(function(h){return h.hostid})

    if(!myESXiIds.length){
      vcdt_publish(vcHostId,{vcHost:vcHost,vcIp:vcIp,version:version,stale:stale,
        status:status,clusters:clusters,myESXi:myESXi,myESXiIds:[],
        esxiRows:[],triggers:[],vms:{on:0,off:0,unknown:0,total:0},vcUrl:vcUrl,agg:{}})
      vcdt_render(el,vcHostId)
      return
    }

    Promise.all([
      zpost('item.get',{
        hostids:myESXiIds,
        search:{name:['CPU usage in percent','Total memory','Used memory',
                       'Number of guest VMs','Cluster name','Uptime','Power usage',
                       'Connection state','Memory ballooning size']},
        searchByAny:true,
        output:['hostid','name','lastvalue','lastclock'],monitored:true,limit:5000
      }),
      zpost('trigger.get',{
        hostids:myESXiIds,only_true:true,monitored:true,skipDependent:true,
        expandDescription:true,
        output:['triggerid','description','priority','lastchange'],
        selectHosts:['hostid','name'],sortfield:'priority',sortorder:'DESC',limit:200
      }),
      zpost('host.get',{groupids:[CFG_VCDT.groupIdVMs],output:['hostid','name'],selectMacros:['macro','value'],limit:2000}),
      zpost('item.get',{groupids:[CFG_VCDT.groupIdVMs],search:{key_:'vmware.vm.powerstate'},output:['hostid','lastvalue'],limit:2000}),
    ]).then(function(pb){
      var esxiItems=pb[0],triggers=pb[1],vmHosts=pb[2],vmPower=pb[3]

      var byHost={}
      esxiItems.forEach(function(i){
        if(!byHost[i.hostid])byHost[i.hostid]={}
        byHost[i.hostid][i.name]={v:i.lastvalue,t:i.lastclock}
      })

      myESXi.forEach(function(h){
        var cls=byHost[h.hostid]&&byHost[h.hostid]['Cluster name']
        if(cls&&clusters[cls.v])clusters[cls.v].esxiCount++
      })

      var esxiRows=myESXi.map(function(h){
        var hd=byHost[h.hostid]||{}
        var g=function(k){return hd[k]?hd[k].v:null}
        var cpu=parseFloat(g('CPU usage in percent'))
        var ramU=parseFloat(g('Used memory')),ramT=parseFloat(g('Total memory'))
        var ramPct=(!isNaN(ramU)&&!isNaN(ramT)&&ramT>0)?(ramU/ramT*100):null
        var vms=parseFloat(g('Number of guest VMs'))
        var balloon=parseFloat(g('Memory ballooning size'))
        return{
          hostid:h.hostid,
          name:h.name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i,'').replace(/^ESXi\s*-\s*/i,''),
          cluster:(g('Cluster name')||'—'),
          cpu:isNaN(cpu)?null:cpu,
          ramPct:ramPct,
          ramGb:isNaN(ramU)?null:Math.round(ramU/1073741824),
          ramTGb:isNaN(ramT)?null:Math.round(ramT/1073741824),
          vms:isNaN(vms)?null:Math.round(vms),
          uptime:parseFloat(g('Uptime'))||null,
          power:parseFloat(g('Power usage'))||null,
          balloon:isNaN(balloon)?null:Math.round(balloon/1073741824),
          connState:g('Connection state'),
        }
      }).sort(function(a,b){return(a.cluster+a.name).localeCompare(b.cluster+b.name)})

      var cpuS=esxiRows.filter(function(e){return e.cpu!=null})
      var ramS=esxiRows.filter(function(e){return e.ramPct!=null})
      var avg=function(arr,fn){return arr.length?arr.reduce(function(s,e){return s+fn(e)},0)/arr.length:null}
      var max=function(arr,fn){return arr.length?Math.max.apply(null,arr.map(fn)):null}

      var vmPowerIdx={}
      vmPower.forEach(function(i){vmPowerIdx[i.hostid]=i.lastvalue==='1'})
      var myVMs=vmHosts.filter(function(h){
        var m=(h.macros||[]).find(function(x){return x.macro==='{$VMWARE.URL}'})
        return m&&vcdt_normalizeUrl(m.value)===vcUrl
      })
      var vmsOn=0,vmsOff=0,vmsUnk=0
      myVMs.forEach(function(h){
        var ps=vmPowerIdx[h.hostid]
        if(ps===undefined){vmsUnk++;return}
        if(ps)vmsOn++;else vmsOff++
      })

      vcdt_publish(vcHostId,{
        vcHost:vcHost,vcIp:vcIp,version:version,stale:stale,status:status,
        clusters:clusters,myESXi:myESXi,myESXiIds:myESXiIds,
        esxiRows:esxiRows,triggers:triggers,
        vms:{on:vmsOn,off:vmsOff,unknown:vmsUnk,total:myVMs.length},
        vcUrl:vcUrl,
        agg:{
          cpuAvg:avg(cpuS,function(e){return e.cpu}),
          cpuMax:max(cpuS,function(e){return e.cpu}),
          ramAvg:avg(ramS,function(e){return e.ramPct}),
          ramMax:max(ramS,function(e){return e.ramPct}),
        },
      })
      vcdt_render(el,vcHostId)
    })
  }).catch(function(err){
    el.innerHTML='<div style="padding:14px;color:#F85149;font-family:monospace">Erro: '+err.message+'</div>'
  })
  }) // vcdt_resolveId.then
}

function vcdt_publish(vcHostId,data){
  window.VCD_CACHE=window.VCD_CACHE||{}
  window.VCD_CACHE[vcHostId]={ready:true,data:data,ts:Date.now()}
}

// ─── render topo + saúde + clusters ──────────────────────────────────────────

function vcdt_render(el,vcHostId){
  var cache=window.VCD_CACHE&&window.VCD_CACHE[vcHostId]
  if(!cache||!cache.ready)return
  var d=cache.data
  var SH=window.BPC_SHARED
  var SC=CFG_VCDT.statusColor,SL=CFG_VCDT.statusLabel
  var sColor=SC[d.status]
  var pillBg=['rgba(110,118,129,.18)','rgba(63,185,80,.15)','rgba(210,153,34,.15)','rgba(248,81,73,.15)'][d.status]||'rgba(110,118,129,.18)'
  var clsNames=Object.keys(d.clusters).sort()
  var n2Url='http://10.10.126.22:3000/d/a967e936-99a3-47c8-af98-052d7a80beb8/n2-infraestrutura-vmware'
  var vcWebUrl=(d.vcUrl?d.vcUrl.replace(/^https?:\/\//,'https://'):'')+'/ui/'

  var css='<style>'+
  '#bpc-vmw-vc-topo{font-family:"JetBrains Mono",monospace;color:#CDD9E5}'+
  '.vt-wrap{padding:14px 16px 16px}'+
  '.vt-top{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:start;margin-bottom:18px}'+
  '.vt-name{font-size:22px;font-weight:700;color:#E6EDF3;line-height:1.2;margin-bottom:4px}'+
  '.vt-sub{font-size:13px;color:#6E7681;margin-bottom:10px}'+
  '.vt-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700}'+
  '.vt-stale{font-size:11px;color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.25);border-radius:4px;padding:2px 8px;margin-left:8px;display:inline-block;vertical-align:middle}'+
  '.vt-stats{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}'+
  '.vt-stat{display:flex;flex-direction:column;align-items:center;min-width:60px}'+
  '.vt-stat-n{font-size:26px;font-weight:700;line-height:1;margin-bottom:3px}'+
  '.vt-stat-l{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}'+
  '.vt-sep{width:1px;background:rgba(255,255,255,.08);align-self:stretch;margin:0 2px}'+
  '.vt-links{display:flex;flex-direction:column;gap:8px;flex-shrink:0}'+
  '.vt-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;border:1px solid}'+
  '.vt-btn-back{color:#8B949E;border-color:rgba(139,148,158,.25);background:rgba(139,148,158,.07)}'+
  '.vt-btn-vc{color:#3FB950;border-color:rgba(63,185,80,.3);background:rgba(63,185,80,.07)}'+
  /* saúde */
  '.vt-health{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px}'+
  '.vt-hcard{background:rgba(255,255,255,.03);border:1px solid #21262D;border-radius:8px;padding:12px 14px}'+
  '.vt-hcard-t{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px}'+
  '.vt-hrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}'+
  '.vt-hlbl{font-size:11px;color:#8B949E}'+
  '.vt-hval{font-size:14px;font-weight:700}'+
  '.vt-pbar{height:4px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:2px;overflow:hidden}'+
  '.vt-pbar-f{height:100%;border-radius:2px}'+
  /* clusters */
  '.vt-sh{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #21262D}'+
  '.vt-sh-t{font-size:11px;font-weight:700;color:#6E7681;text-transform:uppercase;letter-spacing:.7px}'+
  '.vt-sh-n{font-size:11px;color:#444D56;font-weight:600}'+
  '.vt-cls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}'+
  '.vt-cls-card{background:rgba(255,255,255,.03);border:1px solid #21262D;border-radius:7px;padding:11px 13px}'+
  '.vt-cls-name{font-size:13px;font-weight:700;color:#E6EDF3;margin-bottom:8px;display:flex;align-items:center;gap:6px}'+
  '.vt-cls-name-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
  '.vt-cls-meta{display:flex;gap:16px}'+
  '.vt-cls-kv{display:flex;flex-direction:column;align-items:center}'+
  '.vt-cls-val{font-size:20px;font-weight:700;color:#58A6FF;line-height:1}'+
  '.vt-cls-key{font-size:10px;color:#6E7681;text-transform:uppercase;letter-spacing:.4px;margin-top:2px}'+
  '</style>'

  function sc(v,w,c){return v==null?'#6E7681':v>=c?'#F85149':v>=w?'#D29922':'#3FB950'}
  function pbar(pct,w,c){
    var color=sc(pct,w,c)
    return '<div class="vt-pbar"><div class="vt-pbar-f" style="width:'+Math.min(pct||0,100).toFixed(1)+'%;background:'+color+'"></div></div>'
  }

  var pill='<span class="vt-pill" style="background:'+pillBg+';color:'+sColor+';border:1px solid '+sColor+'44">'+
    '<span style="width:7px;height:7px;border-radius:50%;background:'+sColor+';display:inline-block"></span>'+SL[d.status]+'</span>'
  var staleTag=d.stale?'<span class="vt-stale">⚠ dados desactualizados</span>':''

  var stats='<div class="vt-stats">'+
    '<div class="vt-stat"><div class="vt-stat-n" style="color:#58A6FF">'+d.myESXi.length+'</div><div class="vt-stat-l">ESXi</div></div>'+
    '<div class="vt-sep"></div>'+
    '<div class="vt-stat"><div class="vt-stat-n" style="color:#A5D6FF">'+clsNames.length+'</div><div class="vt-stat-l">Clusters</div></div>'+
    '<div class="vt-sep"></div>'+
    '<div class="vt-stat"><div class="vt-stat-n" style="color:#3FB950">'+(d.vms.on||'—')+'</div><div class="vt-stat-l">VMs Ligadas</div></div>'+
    '<div class="vt-stat"><div class="vt-stat-n" style="color:'+(d.vms.off>0?'#F85149':'#6E7681')+'">'+(d.vms.off||'—')+'</div><div class="vt-stat-l">VMs Desl.</div></div>'+
    (d.vms.unknown>0?'<div class="vt-stat"><div class="vt-stat-n" style="color:#6E7681">'+d.vms.unknown+'</div><div class="vt-stat-l">Sem dados</div></div>':'')+
  '</div>'

  var links='<div class="vt-links">'+
    '<a class="vt-btn vt-btn-back" href="'+n2Url+'">← N2 Infra VMware</a>'+
    '<a class="vt-btn vt-btn-vc" href="'+vcWebUrl+'" target="_blank" rel="noopener">⎋ Abrir vCenter</a>'+
  '</div>'

  var topo='<div class="vt-top">'+
    '<div>'+
      '<div class="vt-name">'+SH.esc(d.vcHost.name)+'</div>'+
      '<div class="vt-sub">'+SH.esc(d.vcIp)+(d.version?' &nbsp;·&nbsp; vCenter '+SH.esc(d.version):'')+'</div>'+
      pill+staleTag+stats+
    '</div>'+links+
  '</div>'

  var agg=d.agg||{}
  var healthHtml=''
  if(agg.cpuAvg!=null||agg.ramAvg!=null){
    healthHtml='<div class="vt-health">'+
    '<div class="vt-hcard">'+
      '<div class="vt-hcard-t">CPU — '+d.myESXi.length+' ESXi</div>'+
      (agg.cpuAvg!=null?
        '<div class="vt-hrow"><span class="vt-hlbl">Média</span><span class="vt-hval" style="color:'+sc(agg.cpuAvg,60,80)+'">'+agg.cpuAvg.toFixed(1)+'%</span></div>'+
        pbar(agg.cpuAvg,60,80)+
        '<div class="vt-hrow" style="margin-top:8px"><span class="vt-hlbl">Pico</span><span class="vt-hval" style="color:'+sc(agg.cpuMax,75,90)+'">'+agg.cpuMax.toFixed(1)+'%</span></div>'+
        pbar(agg.cpuMax,75,90)
      :'<div style="color:#6E7681;font-size:11px">sem dados</div>')+
    '</div>'+
    '<div class="vt-hcard">'+
      '<div class="vt-hcard-t">RAM — '+d.myESXi.length+' ESXi</div>'+
      (agg.ramAvg!=null?
        '<div class="vt-hrow"><span class="vt-hlbl">Média</span><span class="vt-hval" style="color:'+sc(agg.ramAvg,60,80)+'">'+agg.ramAvg.toFixed(1)+'%</span></div>'+
        pbar(agg.ramAvg,60,80)+
        '<div class="vt-hrow" style="margin-top:8px"><span class="vt-hlbl">Pico</span><span class="vt-hval" style="color:'+sc(agg.ramMax,70,85)+'">'+agg.ramMax.toFixed(1)+'%</span></div>'+
        pbar(agg.ramMax,70,85)
      :'<div style="color:#6E7681;font-size:11px">sem dados</div>')+
    '</div>'+
    '</div>'
  }

  var clsCards=clsNames.length
    ?clsNames.map(function(cls){
        var c=d.clusters[cls],cColor=SC[c.status]||SC[0]
        return '<div class="vt-cls-card" style="border-color:'+(c.status>1?cColor+'44':'#21262D')+'">'+
          '<div class="vt-cls-name">'+
            '<span style="width:9px;height:9px;border-radius:50%;background:'+cColor+';flex-shrink:0;display:inline-block"></span>'+
            '<span class="vt-cls-name-t" title="'+SH.esc(cls)+'">'+SH.esc(cls)+'</span>'+
            (c.status>1?'<span style="font-size:10px;font-weight:700;color:'+cColor+';flex-shrink:0">'+SL[c.status]+'</span>':'')+
          '</div>'+
          '<div class="vt-cls-meta">'+
            '<div class="vt-cls-kv"><div class="vt-cls-val">'+(c.esxiCount||'—')+'</div><div class="vt-cls-key">ESXi</div></div>'+
          '</div>'+
        '</div>'
      }).join('')
    :'<div style="color:#6E7681;font-size:12px;font-style:italic;padding:8px 0">sem dados de clusters</div>'

  var clsSec='<div class="vt-sh"><span class="vt-sh-t">Clusters</span><span class="vt-sh-n">· '+clsNames.length+'</span></div>'+
    '<div class="vt-cls-grid">'+clsCards+'</div>'

  var div='<div style="border-top:1px solid #21262D;margin:0 0 16px"></div>'

  el.innerHTML=css+'<div class="vt-wrap">'+topo+div+(healthHtml?healthHtml+div:'')+clsSec+'</div>'

  if(CFG_VCDT._timer)clearTimeout(CFG_VCDT._timer)
  CFG_VCDT._timer=setTimeout(function(){
    window.VCD_CACHE=window.VCD_CACHE||{}
    if(window.VCD_CACHE[vcHostId])window.VCD_CACHE[vcHostId].ready=false
    if(typeof window.waitForBPC==='function')window.waitForBPC(start_vcdt)
  },CFG_VCDT.refreshMs)
}

function initWithRetry_vcdt(attempt){
  attempt=attempt||0
  if(typeof window.waitForBPC==='function'){window.waitForBPC(start_vcdt);return}
  if(attempt>50){console.error('[BPC] l3-vcenter-topo: waitForBPC indisponivel');return}
  setTimeout(function(){initWithRetry_vcdt(attempt+1)},100)
}
initWithRetry_vcdt()
