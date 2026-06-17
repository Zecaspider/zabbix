// N3 VMware — Triggers activos dos ESXi deste vCenter
// Lê dados de window.VCD_CACHE[vcHostId] publicado pelo painel topo.

var CFG_VCDTR = { elementId: 'bpc-vmw-vc-triggers' }

function vcdtr_getParam(name){
  try{return new URLSearchParams(window.location.search).get(name)||''}catch(e){return''}
}
function vcdtr_fmtAge(epoch){
  var s=Math.floor(Date.now()/1000)-parseInt(epoch||0)
  if(s<60)return s+'s'
  if(s<3600)return Math.floor(s/60)+'m'
  if(s<86400)return Math.floor(s/3600)+'h'
  return Math.floor(s/86400)+'d'
}

function start_vcdtr(rpc){
  var el=document.getElementById(CFG_VCDTR.elementId)
  if(!el)return
  var vcHostId=vcdtr_getParam('var-vcenter_hostid')
  if(!vcHostId){el.innerHTML='';return}
  vcdtr_waitAndRender(el,vcHostId,0)
}

function vcdtr_waitAndRender(el,vcHostId,attempt){
  var cache=window.VCD_CACHE&&window.VCD_CACHE[vcHostId]
  if(cache&&cache.ready){
    vcdtr_render(el,cache.data)
    return
  }
  if(attempt===0)el.innerHTML='<div style="padding:10px;color:#6E7681;font-size:12px;font-family:monospace">A aguardar dados…</div>'
  if(attempt>150){el.innerHTML='<div style="padding:10px;color:#F85149;font-size:12px;font-family:monospace">Timeout a aguardar dados do painel topo.</div>';return}
  setTimeout(function(){vcdtr_waitAndRender(el,vcHostId,attempt+1)},200)
}

function vcdtr_render(el,d){
  var SH=window.BPC_SHARED
  var SEV_LBL=['N/C','Info','Aviso','Média','Alto','Desastre']
  var SEV_COLOR=['#6E7681','#6E7681','#D29922','#D29922','#F85149','#F85149']

  var css='<style>'+
  '#bpc-vmw-vc-triggers{font-family:"JetBrains Mono",monospace;color:#CDD9E5}'+
  '.vtr-wrap{padding:14px 16px 16px}'+
  '.vtr-sh{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #21262D}'+
  '.vtr-sh-t{font-size:11px;font-weight:700;color:#6E7681;text-transform:uppercase;letter-spacing:.7px}'+
  '.vtr-sh-n{font-size:11px;color:#444D56;font-weight:600}'+
  '.vtr-row{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)}'+
  '.vtr-sev{display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;text-transform:uppercase;white-space:nowrap;flex-shrink:0}'+
  '.vtr-host{font-size:11px;color:#6E7681;width:140px;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;white-space:nowrap}'+
  '.vtr-desc{font-size:12px;color:#CDD9E5;flex:1}'+
  '.vtr-age{font-size:11px;color:#6E7681;white-space:nowrap;flex-shrink:0}'+
  '</style>'

  var trigs=d.triggers||[]
  var rows=trigs.map(function(t){
    var sev=parseInt(t.priority)||0
    var color=SEV_COLOR[sev]||'#6E7681'
    var host=t.hosts&&t.hosts[0]
      ?t.hosts[0].name.replace(/^VIRT\s*-\s*ESXi\s*-\s*/i,'').replace(/^ESXi\s*-\s*/i,'')
      :'—'
    return'<div class="vtr-row">'+
      '<span class="vtr-sev" style="background:'+color+'22;color:'+color+';border:1px solid '+color+'44">'+SEV_LBL[sev]+'</span>'+
      '<span class="vtr-host">'+SH.esc(host)+'</span>'+
      '<span class="vtr-desc">'+SH.esc(t.description)+'</span>'+
      '<span class="vtr-age">'+vcdtr_fmtAge(t.lastchange)+'</span>'+
    '</div>'
  }).join('')

  var empty='<div style="display:flex;align-items:center;gap:8px;padding:10px 0;color:#3FB950">'+
    '<span style="width:8px;height:8px;border-radius:50%;background:#3FB950;display:inline-block"></span>'+
    '<span style="font-size:13px;font-weight:600">Sem triggers activos</span></div>'

  el.innerHTML=css+'<div class="vtr-wrap">'+
    '<div class="vtr-sh"><span class="vtr-sh-t">Triggers Activos</span><span class="vtr-sh-n">· '+trigs.length+'</span></div>'+
    (rows||empty)+
  '</div>'
}

function initWithRetry_vcdtr(attempt){
  attempt=attempt||0
  if(typeof window.waitForBPC==='function'){window.waitForBPC(start_vcdtr);return}
  if(attempt>50){console.error('[BPC] l3-vcenter-triggers: waitForBPC indisponivel');return}
  setTimeout(function(){initWithRetry_vcdtr(attempt+1)},100)
}
initWithRetry_vcdtr()
