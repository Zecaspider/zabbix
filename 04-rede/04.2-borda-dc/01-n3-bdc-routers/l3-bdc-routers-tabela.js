// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · BORDA DC — TABELA BACKBONE (5 ROUTERS)  v1.0      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                             ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                  ║
// ║                                                                          ║
// ║  Porta ao vivo (RPC via BPC.rpc) a mesma logica do script Python         ║
// ║  relatorios/backbone-dc/gerar_relatorio.py (2026-07-12), aprovada pelo   ║
// ║  utilizador no Excel antes de vir para aqui. UTIL%/DOWNLOAD/UPLOAD usam  ║
// ║  o mesmo filtro de circuito externo real do dashboard de provedores     ║
// ║  (03-n3-bdc-provedores) - nunca a soma de todas as interfaces (routers   ║
// ║  tem varios circuitos concorrentes na mesma caixa, ver GTW01/WAN-AG).    ║
// ║  TEMP nao aparece aqui - Cisco IOS (ISR4451/C8500) nao expoe sensor real ║
// ║  neste template (confirmado por auditoria ao vivo, so switches tem).    ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_RTAB = {
  elementId: 'bpc-n3bdc-tabela',
  refreshMs: 60000,

  hostIds: ['10838', '10839', '10840', '10996', '11001'],
  hostMeta: {
    '10838': { host: 'DC1-RTE-WAN-INT',  funcao: 'Router - WAN Internet' },
    '10839': { host: 'DC1-RTE-WAN-EMIS', funcao: 'Router - WAN Parceiro (EMIS)' },
    '10840': { host: 'DC1-RTE-GTW01',    funcao: 'Router - Governo' },
    '10996': { host: 'DC1-RTE-WAN-AG',   funcao: 'Router - Hub DMVPN Agencias' },
    '11001': { host: 'DC1-RTE-PARC',     funcao: 'Router - WAN Parceiro (IMPORAFRICA)' },
  },
  // ordem de exibicao na tabela
  hostOrder: ['10838', '10839', '10840', '10996', '11001'],

  // Filtro de circuito externo real - portado 1:1 do CFG_PROV em
  // 03-n3-bdc-provedores/l3-bdc-provedores-cards.js
  excludeIfRe:   /^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|Ethernet[0-9]\/[0-9]\/[0-9]+$|Te[0-9]\/[0-9]\/[0-9]+$|Gi0\/0\/[0-9]$|Gi0\/0\/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)/i,
  excludeDescRe: /^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)/i,

  // "IP SLA ... is not OK" - sonda morta confirmada (Z.13), ja excluida do
  // effDown do provedor ITA no dashboard de provedores. Mesma exclusao aqui.
  triggerExcludeRe: /IP SLA .* is not OK/i,
  sevCritico: 4,  // Zabbix: >=4 High/Disaster -> Critico
  sevAtencao: 2,  // Zabbix: >=2 Warning -> Atencao

  cpuNameRe: /^#\d+: CPU utilization$/,
  ramName:   'Processor: Memory utilization',
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function rtEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function rtParseIfName(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').replace(/^\*+|\*+$/g, '').trim() }
}

function rtCalcUtilPct(iface) {
  if (!iface.inItem || !iface.outItem || !iface.speedItem) return null
  var speed = parseFloat(iface.speedItem.lastvalue)
  if (!speed) return null
  var bpsIn = parseFloat(iface.inItem.lastvalue)
  var bpsOut = parseFloat(iface.outItem.lastvalue)
  return { pct: Math.max(bpsIn, bpsOut) / speed * 100, bpsIn: bpsIn, bpsOut: bpsOut }
}

function rtWorstCircuito(interfaces) {
  var pior = null
  Object.keys(interfaces).forEach(function(ifname) {
    if (CFG_RTAB.excludeIfRe.test(ifname)) return
    var iface = interfaces[ifname]
    if (iface.desc && CFG_RTAB.excludeDescRe.test(iface.desc)) return
    var u = rtCalcUtilPct(iface)
    if (!u) return
    if (!pior || u.pct > pior.pct) {
      pior = { pct: u.pct, bpsIn: u.bpsIn, bpsOut: u.bpsOut, nome: ifname + (iface.desc ? ' (' + iface.desc + ')' : '') }
    }
  })
  return pior
}

function rtFmtMbps(bps) {
  if (bps == null) return '—'
  return (bps / 1e6).toFixed(2) + ' Mbps'
}

function rtFmtPct(v, casas) {
  return v == null ? '—' : v.toFixed(casas == null ? 1 : casas) + '%'
}

function rtEstadoLabel(key) {
  return { normal: 'Normal', atencao: 'Atenção', critico: 'Crítico' }[key] || key
}

// data/hora LOCAL (nunca toISOString - converte para UTC; Angola e UTC+1,
// por isso entre as 00h-01h locais o ficheiro ficava com a data de ontem)
function rtDataHoraLocal(d) {
  var pad = function(n) { return String(n).padStart(2, '0') }
  return {
    data: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    hora: pad(d.getHours()) + pad(d.getMinutes()),
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [2b] EXPORT XLSX — zip minimo sem bibliotecas (method=stored), mesmo
// formato OOXML ja validado no script Python relatorios/backbone-dc/
// gerar_relatorio.py. Sem template - construido do zero, ao contrario do
// r1_gerarXlsx (07-apis/r1-relatorio-diario) que patcha um molde existente.
// ────────────────────────────────────────────────────────────────────────────

function rtCrc32(bytes) {
  var crc = ~0
  for (var i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (var b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

function rtDosDateTime() {
  var d = new Date()
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function rtZipBuild(parts) {
  var dt = rtDosDateTime()
  var enc = new TextEncoder()
  var chunks = []
  var centralChunks = []
  var offset = 0

  parts.forEach(function(part) {
    var nameBytes = enc.encode(part.name)
    var dataBytes = enc.encode(part.content)
    var crc = rtCrc32(dataBytes)
    var size = dataBytes.length

    var local = new Uint8Array(30 + nameBytes.length)
    var lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0, true)
    lv.setUint16(8, 0, true)
    lv.setUint16(10, dt.time, true)
    lv.setUint16(12, dt.date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    chunks.push(local, dataBytes)

    var central = new Uint8Array(46 + nameBytes.length)
    var cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dt.time, true)
    cv.setUint16(14, dt.date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centralChunks.push(central)

    offset += local.length + dataBytes.length
  })

  var centralStart = offset
  var centralSize = centralChunks.reduce(function(a, c) { return a + c.length }, 0)

  var eocd = new Uint8Array(22)
  var ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, parts.length, true)
  ev.setUint16(10, parts.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, centralStart, true)

  var all = chunks.concat(centralChunks, [eocd])
  var total = all.reduce(function(a, c) { return a + c.length }, 0)
  var out = new Uint8Array(total)
  var p = 0
  all.forEach(function(c) { out.set(c, p); p += c.length })
  return out
}

var RT_XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

var RT_CONTENT_TYPES = RT_XML_HEADER
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  + '</Types>'

var RT_RELS_ROOT = RT_XML_HEADER
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>'

var RT_WORKBOOK_RELS = RT_XML_HEADER
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '</Relationships>'

function rtBuildWorkbookXml(sheetName) {
  return RT_XML_HEADER
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="' + rtEsc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>'
    + '</workbook>'
}

var RT_STYLES_XML = RT_XML_HEADER
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="3">'
  + '<font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="14"/><name val="Calibri"/></font>'
  + '</fonts>'
  + '<fills count="6">'
  + '<fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF2F3B52"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E7C6"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3B0"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C6C6"/></patternFill></fill>'
  + '</fills>'
  + '<borders count="2">'
  + '<border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right>'
  + '<top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border>'
  + '</borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="7">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '</cellXfs>'
  + '</styleSheet>'

var RT_STYLE_DEFAULT = 0, RT_STYLE_TITULO = 1, RT_STYLE_HEADER = 2, RT_STYLE_NORMAL = 3
var RT_STYLE_VERDE = 4, RT_STYLE_AMARELO = 5, RT_STYLE_VERMELHO = 6

function rtColLetter(idx0) {
  var letters = '', n = idx0 + 1
  while (n > 0) {
    var r = (n - 1) % 26
    letters = String.fromCharCode(65 + r) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function rtCellInlineStr(col, row, texto, style) {
  var ref = rtColLetter(col) + row
  return '<c r="' + ref + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + rtEsc(texto) + '</t></is></c>'
}

function rtBuildSheetXml(titulo, geradoEm, colunas, linhas) {
  var rows = []
  rows.push('<row r="1">' + rtCellInlineStr(0, 1, titulo, RT_STYLE_TITULO) + '</row>')
  rows.push('<row r="2">' + rtCellInlineStr(0, 2, 'Gerado em ' + geradoEm, RT_STYLE_DEFAULT) + '</row>')

  var headerRow = 4
  var headCells = colunas.map(function(c, i) { return rtCellInlineStr(i, headerRow, c, RT_STYLE_HEADER) }).join('')
  rows.push('<row r="' + headerRow + '">' + headCells + '</row>')

  var estadoStyle = { normal: RT_STYLE_VERDE, atencao: RT_STYLE_AMARELO, critico: RT_STYLE_VERMELHO }

  linhas.forEach(function(linha, i) {
    var r = headerRow + 1 + i
    var cells = linha.valores.map(function(v, c) {
      var style = RT_STYLE_NORMAL
      if (c === 1) style = estadoStyle[linha.estadoKey] || RT_STYLE_NORMAL
      return rtCellInlineStr(c, r, v, style)
    }).join('')
    rows.push('<row r="' + r + '">' + cells + '</row>')
  })

  var larguras = [22, 12, 32, 12, 8, 8, 10, 14, 14, 36, 12]
  var colsXml = larguras.slice(0, colunas.length).map(function(w, i) {
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'
  }).join('')

  return RT_XML_HEADER
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<cols>' + colsXml + '</cols>'
    + '<sheetData>' + rows.join('') + '</sheetData>'
    + '</worksheet>'
}

function rtGerarXlsxBytes(titulo, geradoEm, colunas, linhas) {
  var parts = [
    { name: '[Content_Types].xml', content: RT_CONTENT_TYPES },
    { name: '_rels/.rels', content: RT_RELS_ROOT },
    { name: 'xl/workbook.xml', content: rtBuildWorkbookXml('Backbone DC') },
    { name: 'xl/_rels/workbook.xml.rels', content: RT_WORKBOOK_RELS },
    { name: 'xl/styles.xml', content: RT_STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: rtBuildSheetXml(titulo, geradoEm, colunas, linhas) },
  ]
  return rtZipBuild(parts)
}

function rtModelParaExport(model) {
  var colunas = ['EQUIPAMENTO', 'ESTADO', 'FUNCAO', 'LAT.ICMP', 'CPU%', 'RAM%', 'UTIL%', 'DOWNLOAD', 'UPLOAD', 'PIOR CIRCUITO', 'DISP.(dia)']
  var linhas = model.map(function(r) {
    return {
      estadoKey: r.estado,
      valores: [
        r.host, rtEstadoLabel(r.estado), r.funcao,
        r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms',
        rtFmtPct(r.cpuPct, 0), rtFmtPct(r.ramPct, 0), rtFmtPct(r.utilPct, 1),
        rtFmtMbps(r.download), rtFmtMbps(r.upload),
        r.circuito || '—', rtFmtPct(r.dispPct, 1),
      ],
    }
  })
  return { colunas: colunas, linhas: linhas }
}

async function rtExportarExcel() {
  if (!RT_ULTIMO_MODELO) return
  var btn = document.getElementById('rt-btn-excel')
  var txt = btn.textContent
  btn.textContent = '⏳ A gerar...'
  btn.disabled = true
  try {
    var agora = new Date()
    var dh = rtDataHoraLocal(agora)
    var pack = rtModelParaExport(RT_ULTIMO_MODELO)
    var titulo = 'Backbone — Borda DC (5 Routers) — ' + agora.toLocaleString('pt-PT')
    var bytes = rtGerarXlsxBytes(titulo, agora.toLocaleString('pt-PT'), pack.colunas, pack.linhas)
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'Relatorio_Backbone_BordaDC_' + dh.data + '_' + dh.hora + '.xlsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (e) {
    console.error('[BPC] rtExportarExcel:', e)
    alert('Erro a gerar o Excel: ' + e.message)
  } finally {
    btn.textContent = txt
    btn.disabled = false
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [2c] EXPORT PDF — janela de impressao A4, mesmo padrao de
// 07-apis/r1-relatorio-diario/l2-relatorio-diario.js (r1_abrirImpressao)
// ────────────────────────────────────────────────────────────────────────────

function rtAbrirImpressao(model) {
  var win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) { alert('O browser bloqueou o popup de impressão — autoriza popups para este site.'); return }

  var agora = new Date().toLocaleString('pt-PT')
  var head = ['Equipamento', 'Estado', 'Função', 'Lat. ICMP', 'CPU%', 'RAM%', 'Util%', 'Download', 'Upload', 'Pior circuito', 'Disp. (dia)']
  var rows = model.map(function(r) {
    return '<tr>'
      + '<td>' + rtEsc(r.host) + '</td>'
      + '<td>' + rtEstadoLabel(r.estado) + '</td>'
      + '<td>' + rtEsc(r.funcao) + '</td>'
      + '<td>' + (r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms') + '</td>'
      + '<td>' + rtFmtPct(r.cpuPct, 0) + '</td>'
      + '<td>' + rtFmtPct(r.ramPct, 0) + '</td>'
      + '<td>' + rtFmtPct(r.utilPct, 1) + '</td>'
      + '<td>' + rtFmtMbps(r.download) + '</td>'
      + '<td>' + rtFmtMbps(r.upload) + '</td>'
      + '<td>' + rtEsc(r.circuito || '—') + '</td>'
      + '<td>' + rtFmtPct(r.dispPct, 1) + '</td>'
      + '</tr>'
  }).join('')

  win.document.open()
  win.document.write(
    '<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Backbone — Borda DC — Routers</title>'
    + '<style>'
    + '@page { size: A4 landscape; margin: 12mm; }'
    + 'body{font-family:"Segoe UI",Arial,sans-serif;color:#141A2E;margin:0}'
    + 'h1{font-size:1.1rem;margin:0 0 2px}'
    + '.meta{font-size:.75rem;color:#45507A;margin-bottom:10px}'
    + 'table{width:100%;border-collapse:collapse;font-size:.72rem}'
    + 'th{text-align:left;background:#EEF1F8;color:#45507A;text-transform:uppercase;letter-spacing:.03em;padding:5px 8px;border-bottom:1px solid #D3DAEA}'
    + 'td{padding:4px 8px;border-bottom:1px solid #E7EBF4}'
    + '</style></head><body>'
    + '<h1>Backbone — Borda DC (5 Routers)</h1>'
    + '<div class="meta">Gerado em ' + agora + '</div>'
    + '<table><thead><tr>' + head.map(function(h) { return '<th>' + h + '</th>' }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</body></html>'
  )
  win.document.close()
  setTimeout(function() { win.focus(); win.print() }, 200)
}

var RT_ULTIMO_MODELO = null


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function rtFetchBase(rpc) {
  var hids = CFG_RTAB.hostIds
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      output:  ['hostid', 'name', 'key_', 'lastvalue', 'itemid'],
      filter:  { status: '0' },
    }),
    rpc('trigger.get', {
      hostids: hids,
      filter:  { value: 1 },
      output:  ['triggerid', 'priority', 'description'],
      selectHosts: ['hostid'],
      monitored: true,
    }),
  ]).then(function(r) { return { items: r[0], triggers: r[1] } })
}

function rtFetchDisponibilidade(rpc, icmpItemsByHost) {
  var hoje = new Date()
  var inicioDia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime() / 1000
  var agora = Math.floor(Date.now() / 1000)

  var itemids = []
  Object.keys(icmpItemsByHost).forEach(function(hid) {
    var it = icmpItemsByHost[hid]
    if (it) itemids.push(it.itemid)
  })
  if (!itemids.length) return Promise.resolve({})

  return rpc('history.get', {
    itemids: itemids,
    history: 3,
    time_from: Math.floor(inicioDia),
    time_till: agora,
    output: 'extend',
  }).then(function(hist) {
    var porItem = {}
    hist.forEach(function(v) {
      var arr = porItem[v.itemid] = porItem[v.itemid] || []
      arr.push(parseFloat(v.value))
    })
    var out = {}
    Object.keys(icmpItemsByHost).forEach(function(hid) {
      var it = icmpItemsByHost[hid]
      if (!it) return
      var vals = porItem[it.itemid]
      out[hid] = vals && vals.length ? (vals.reduce(function(a, b) { return a + b }, 0) / vals.length * 100) : null
    })
    return out
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function rtClassifyItems(items) {
  var porHost = {}
  items.forEach(function(it) {
    var hid = it.hostid
    var h = porHost[hid] = porHost[hid] || { icmpping: null, icmppingsec: null, cpu: null, ram: null, interfaces: {} }
    var key = it.key_
    var name = it.name
    if (key === 'icmpping') { h.icmpping = it; return }
    if (key === 'icmppingsec') { h.icmppingsec = it; return }
    if (CFG_RTAB.cpuNameRe.test(name)) { h.cpu = it; return }
    if (name === CFG_RTAB.ramName) { h.ram = it; return }
    if (key.indexOf('net.if.in[') === 0 || key.indexOf('net.if.out[') === 0 || key.indexOf('net.if.speed[') === 0) {
      var p = rtParseIfName(name)
      if (!p) return
      var iface = h.interfaces[p.ifname] = h.interfaces[p.ifname] || { desc: p.desc }
      if (key.indexOf('net.if.in[') === 0) iface.inItem = it
      else if (key.indexOf('net.if.out[') === 0) iface.outItem = it
      else iface.speedItem = it
    }
  })
  return porHost
}

function rtClassifyTriggers(triggers) {
  var porHost = {}
  triggers.forEach(function(t) {
    if (CFG_RTAB.triggerExcludeRe.test(t.description || '')) return
    (t.hosts || []).forEach(function(h) {
      var arr = porHost[h.hostid] = porHost[h.hostid] || []
      arr.push(parseInt(t.priority, 10))
    })
  })
  return porHost
}

function rtEstado(icmpItem, severidades) {
  if (icmpItem && icmpItem.lastvalue === '0') return 'critico'
  var maxSev = severidades && severidades.length ? Math.max.apply(null, severidades) : 0
  if (maxSev >= CFG_RTAB.sevCritico) return 'critico'
  if (maxSev >= CFG_RTAB.sevAtencao) return 'atencao'
  return 'normal'
}

function rtCompute(data, disp) {
  var porHostItems = rtClassifyItems(data.items)
  var porHostSev = rtClassifyTriggers(data.triggers)

  return CFG_RTAB.hostOrder.map(function(hid) {
    var meta = CFG_RTAB.hostMeta[hid]
    var h = porHostItems[hid] || { icmpping: null, icmppingsec: null, cpu: null, ram: null, interfaces: {} }

    var estado = rtEstado(h.icmpping, porHostSev[hid])
    var latMs = h.icmppingsec && h.icmppingsec.lastvalue !== '' ? parseFloat(h.icmppingsec.lastvalue) * 1000 : null
    var cpuPct = h.cpu ? parseFloat(h.cpu.lastvalue) : null
    var ramPct = h.ram ? parseFloat(h.ram.lastvalue) : null
    var pior = rtWorstCircuito(h.interfaces)

    return {
      hostid: hid,
      host: meta.host,
      funcao: meta.funcao,
      estado: estado,
      latMs: latMs,
      cpuPct: cpuPct,
      ramPct: ramPct,
      utilPct: pior ? pior.pct : null,
      download: pior ? pior.bpsIn : null,
      upload: pior ? pior.bpsOut : null,
      circuito: pior ? pior.nome : null,
      dispPct: disp[hid] != null ? disp[hid] : null,
      icmpItem: h.icmpping,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function rtPill(estado) {
  var T = window.BPC.THEME
  var map = {
    normal:  { col: T.colorOk,   bg: 'rgba(34,197,94,0.15)',  lbl: 'Normal' },
    atencao: { col: T.colorWarn, bg: 'rgba(210,153,34,0.15)', lbl: 'Atenção' },
    critico: { col: T.colorCrit, bg: 'rgba(248,81,73,0.18)',  lbl: 'Crítico' },
  }
  var s = map[estado] || map.normal
  return '<span style="background:' + s.bg + ';color:' + s.col + ';font-size:12px;font-weight:700;'
    + 'padding:3px 10px;border-radius:999px;white-space:nowrap">' + s.lbl + '</span>'
}

function rtFmtPct(v, casas) {
  return v == null ? '—' : v.toFixed(casas == null ? 1 : casas) + '%'
}

function rtRenderRow(r) {
  return '<tr>'
    + '<td style="font-family:monospace;font-weight:600;color:#E6EDF3">' + rtEsc(r.host) + '</td>'
    + '<td>' + rtPill(r.estado) + '</td>'
    + '<td style="color:#B8C0D4">' + rtEsc(r.funcao) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + (r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms') + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtPct(r.cpuPct, 0) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtPct(r.ramPct, 0) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtPct(r.utilPct, 1) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtMbps(r.download) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtMbps(r.upload) + '</td>'
    + '<td style="color:#8891A8;font-size:12px;font-family:monospace">' + rtEsc(r.circuito || '—') + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + rtFmtPct(r.dispPct, 1) + '</td>'
    + '</tr>'
}

function rtToolbarHtml() {
  var btnCss = 'font:600 12px \'Inter\',\'Segoe UI\',sans-serif;padding:6px 14px;border-radius:6px;'
    + 'border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#E6EDF3;cursor:pointer'
  return '<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px">'
    + '<button id="rt-btn-excel" style="' + btnCss + '">⬇ Exportar Excel</button>'
    + '<button id="rt-btn-print" style="' + btnCss + '">🖨 Imprimir / PDF</button>'
    + '</div>'
}

function rtAttachToolbar(model) {
  var btnExcel = document.getElementById('rt-btn-excel')
  var btnPrint = document.getElementById('rt-btn-print')
  if (btnExcel) btnExcel.addEventListener('click', rtExportarExcel)
  if (btnPrint) btnPrint.addEventListener('click', function() { rtAbrirImpressao(model) })
}

function rtRender(el, model) {
  RT_ULTIMO_MODELO = model

  var css = 'font-family:\'Inter\',\'Segoe UI\',sans-serif;font-size:13px;width:100%;border-collapse:collapse'
  var thStyle = 'text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;'
    + 'color:#8891A8;border-bottom:1px solid rgba(255,255,255,0.12)'
  var tdBase = 'padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06)'

  var head = '<thead><tr>'
    + ['Equipamento', 'Estado', 'Função', 'Lat. ICMP', 'CPU%', 'RAM%', 'Util%', 'Download', 'Upload', 'Pior circuito', 'Disp. (dia)']
      .map(function(h) { return '<th style="' + thStyle + '">' + h + '</th>' }).join('')
    + '</tr></thead>'

  var body = '<tbody>' + model.map(rtRenderRow).join('') + '</tbody>'

  el.innerHTML = rtToolbarHtml()
    + '<div style="overflow-x:auto"><table style="' + css + '">' + head + body + '</table></div>'
    + '<style>#' + CFG_RTAB.elementId + ' td{' + tdBase + '}</style>'

  rtAttachToolbar(model)
}

function rtRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Borda DC — Tabela: ' + rtEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function rtLoad(rpc) {
  var el = document.getElementById(CFG_RTAB.elementId)
  if (!el) return
  el.innerHTML = window.BPC.utils.buildSkeleton()

  rtFetchBase(rpc)
    .then(function(data) {
      var porHostItems = rtClassifyItems(data.items)
      var icmpByHost = {}
      CFG_RTAB.hostOrder.forEach(function(hid) {
        icmpByHost[hid] = porHostItems[hid] ? porHostItems[hid].icmpping : null
      })
      return rtFetchDisponibilidade(rpc, icmpByHost).then(function(disp) {
        return rtCompute(data, disp)
      })
    })
    .then(function(model) { rtRender(el, model) })
    .catch(function(err) { rtRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function() { rtLoad(rpc) }, CFG_RTAB.refreshMs)
}

function rtInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(rtLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-bdc-routers-tabela: waitForBPC nunca disponivel'); return }
  setTimeout(function() { rtInitWithRetry(attempt + 1) }, 100)
}

rtInitWithRetry()
