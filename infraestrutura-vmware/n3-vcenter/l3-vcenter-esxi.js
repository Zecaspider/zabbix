// N3 VMware — Tabela de hosts ESXi
// Lê dados de window.VCD_CACHE[vcHostId] publicado pelo painel topo.

var CFG_VCDE = { elementId: 'bpc-vmw-vc-esxi' }

function vcde_getParam(name){
  try{return new URLSearchParams(window.location.search).get(name)||''}catch(e){return''}
}
function vcde_fmtUptime(sec){
  if(!sec)return'—'
  var d=Math.floor(sec/86400),h=Math.floor((sec%86400)/3600)
  return d>0?d+'d '+h+'h':h+'h'
}
function vcde_sc(v,w,c){return v==null?'#6E7681':v>=c?'#F85149':v>=w?'#D29922':'#3FB950'}

function start_vcde(rpc){
  var el=document.getElementById(CFG_VCDE.elementId)
  if(!el)return
  var vcHostId=vcde_getParam('var-vcenter_hostid')
  if(!vcHostId){el.innerHTML='';return}
  vcde_waitAndRender(el,vcHostId,0)
}

function vcde_waitAndRender(el,vcHostId,attempt){
  var cache=window.VCD_CACHE&&window.VCD_CACHE[vcHostId]
  if(cache&&cache.ready){
    vcde_render(el,cache.data)
    return
  }
  if(attempt===0)el.innerHTML='<div style="padding:10px;color:#6E7681;font-size:12px;font-family:monospace">A aguardar dados…</div>'
  if(attempt>150){el.innerHTML='<div style="padding:10px;color:#F85149;font-size:12px;font-family:monospace">Timeout a aguardar dados do painel topo.</div>';return}
  setTimeout(function(){vcde_waitAndRender(el,vcHostId,attempt+1)},200)
}

function vcde_render(el,d){
  var SH=window.BPC_SHARED

  var css='<style>'+
  '#bpc-vmw-vc-esxi{font-family:"JetBrains Mono",monospace;color:#CDD9E5}'+
  '.ve-wrap{padding:14px 16px 16px}'+
  '.ve-sh{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #21262D}'+
  '.ve-sh-t{font-size:11px;font-weight:700;color:#6E7681;text-transform:uppercase;letter-spacing:.7px}'+
  '.ve-sh-n{font-size:11px;color:#444D56;font-weight:600}'+
  '.ve-tbl{width:100%;border-collapse:collapse;font-size:12px}'+
  '.ve-tbl th{text-align:left;padding:7px 10px;color:#6E7681;font-size:10px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid rgba(255,255,255,.08);white-space:nowrap}'+
  '.ve-tbl td{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,.04);white-space:nowrap;vertical-align:middle}'+
  '.ve-tbl tr:hover td{background:rgba(255,255,255,.02)}'+
  '.ve-sep td{padding:4px 10px;background:rgba(255,255,255,.02);color:#444D56;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,.06)}'+
  '.ve-bar{height:3px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:3px;overflow:hidden;width:80px}'+
  '.ve-bar-f{height:100%;border-radius:2px}'+
  '.ve-conn{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 7px;border-radius:10px;font-weight:600}'+
  '</style>'

  function pbar(pct,color){
    return'<div class="ve-bar"><div class="ve-bar-f" style="width:'+Math.min(pct||0,100).toFixed(1)+'%;background:'+color+'"></div></div>'
  }
  function connBadge(state){
    if(!state)return'<span style="color:#6E7681">—</span>'
    var s=String(state).toLowerCase()
    if(s.indexOf('connect')>=0&&s.indexOf('disconnect')<0)
      return'<span class="ve-conn" style="color:#3FB950;background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#3FB950;display:inline-block"></span>Ligado</span>'
    if(s.indexOf('maintenance')>=0)
      return'<span class="ve-conn" style="color:#D29922;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#D29922;display:inline-block"></span>Manutenção</span>'
    return'<span class="ve-conn" style="color:#F85149;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.2)"><span style="width:6px;height:6px;border-radius:50%;background:#F85149;display:inline-block"></span>Deslig.</span>'
  }

  var prevCluster=null
  var rows=(d.esxiRows||[]).map(function(h){
    var sep=''
    if(h.cluster!==prevCluster){prevCluster=h.cluster;sep='<tr class="ve-sep"><td colspan="7">'+SH.esc(h.cluster)+'</td></tr>'}
    var cpuC=vcde_sc(h.cpu,75,90),ramC=vcde_sc(h.ramPct,70,85)
    var balloon=h.balloon>0?'<div style="font-size:10px;color:#D29922;margin-top:2px">▲ '+h.balloon+' GB balloon</div>':''
    return sep+'<tr>'+
      '<td style="font-size:12px;font-weight:600;color:#E6EDF3">'+SH.esc(h.name)+'</td>'+
      '<td>'+connBadge(h.connState)+'</td>'+
      '<td>'+(h.cpu!=null?'<span style="font-size:13px;font-weight:700;color:'+cpuC+'">'+h.cpu.toFixed(1)+'%</span>'+pbar(h.cpu,cpuC):'<span style="color:#6E7681">—</span>')+'</td>'+
      '<td>'+(h.ramPct!=null?'<span style="font-size:13px;font-weight:700;color:'+ramC+'">'+h.ramPct.toFixed(1)+'%</span><div style="font-size:10px;color:#6E7681">'+(h.ramGb||'?')+'/'+(h.ramTGb||'?')+' GB</div>'+pbar(h.ramPct,ramC)+balloon:'<span style="color:#6E7681">—</span>')+'</td>'+
      '<td style="text-align:center;color:#58A6FF;font-weight:700">'+(h.vms!=null?h.vms:'—')+'</td>'+
      '<td style="color:#6E7681">'+vcde_fmtUptime(h.uptime)+'</td>'+
      '<td style="color:#6E7681;text-align:right">'+(h.power?h.power.toFixed(0)+' W':'—')+'</td>'+
    '</tr>'
  }).join('')

  el.innerHTML=css+'<div class="ve-wrap">'+
    '<div class="ve-sh"><span class="ve-sh-t">Hosts ESXi</span><span class="ve-sh-n">· '+(d.esxiRows||[]).length+'</span></div>'+
    '<table class="ve-tbl">'+
      '<thead><tr><th>Host</th><th>Estado</th><th>CPU</th><th>RAM</th><th>VMs</th><th>Uptime</th><th style="text-align:right">Energia</th></tr></thead>'+
      '<tbody>'+(rows||'<tr><td colspan="7" style="color:#6E7681;padding:12px 10px;font-style:italic">Sem hosts ESXi associados.</td></tr>')+'</tbody>'+
    '</table>'+
  '</div>'
}

function initWithRetry_vcde(attempt){
  attempt=attempt||0
  if(typeof window.waitForBPC==='function'){window.waitForBPC(start_vcde);return}
  if(attempt>50){console.error('[BPC] l3-vcenter-esxi: waitForBPC indisponivel');return}
  setTimeout(function(){initWithRetry_vcde(attempt+1)},100)
}
initWithRetry_vcde()
