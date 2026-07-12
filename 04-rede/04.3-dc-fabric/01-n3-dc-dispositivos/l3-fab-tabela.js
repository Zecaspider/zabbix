// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · DC FABRIC — TABELA BACKBONE (7 SWITCHES)  v1.0    ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                             ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                  ║
// ║                                                                          ║
// ║  Porta ao vivo (RPC via BPC.rpc) a mesma logica do script Python         ║
// ║  relatorios/backbone-dc/gerar_relatorio.py (2026-07-12), aprovada pelo   ║
// ║  utilizador no Excel antes de vir para aqui. UTIL% = pior uplink fisico  ║
// ║  de fabric (spine<->leaf), nunca soma/media dos ~60-100 portos de acesso ║
// ║  a servidores/storage de cada leaf (dominio diferente, fora de escopo).  ║
// ║  Sem DOWNLOAD/UPLOAD aqui de proposito - nao ha "1 circuito" por switch  ║
// ║  como nos routers (ver l3-bdc-routers-tabela.js, Borda DC).             ║
// ║  Classificacao spine/leaf por tag Zabbix "funcao" (host.get selectTags),║
// ║  mesmo padrao ja usado em l3-fab-cards.js - nunca regex sobre o nome.    ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_FTAB = {
  elementId: 'bpc-n3fab-tabela',
  refreshMs: 60000,
  groupIds: ['26'],

  funcaoLabel: { 'switch-spine': 'Switch - Spine', 'switch-leaf': 'Switch - Leaf' },
  funcaoOrder: { 'switch-spine': 0, 'switch-leaf': 1 },

  // Uplinks de fabric - nomes inequivocos confirmados por auditoria ao vivo
  // 2026-07-12 (item.get real). Spine: 5 downlinks fisicos "LEAF-10X UNDERLAY".
  // Leaf: 2 uplinks fisicos "LINK TO SPINE-XX". A palavra UNDERLAY tambem
  // aparece enganosamente numa loopback de BGP dos leafs ("BGP PEERING
  // UNDERLAY") - por isso o padrao exige o formato completo, nunca so a
  // palavra isolada.
  spineUplinkDescRe: /^LEAF-\d+\s+UNDERLAY$/i,
  leafUplinkDescRe: /^LINK TO SPINE-\d+$/i,

  triggerExcludeRe: /IP SLA .* is not OK/i,
  sevCritico: 4,
  sevAtencao: 2,

  cpuNameRe: /^#\d+: CPU utilization$/,
  ramName: 'Processor: Memory utilization',
  // sensores de chassis (FRONT/BACK/CPU/<codinome hardware>) - nunca as
  // dezenas de sensores de transceiver por porto (nome comeca por
  // "Ethernet...", nao "module-N")
  tempNameRe: /^module-\d+ \w+: Temperature$/,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function ftEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function ftTag(tags, key) {
  var t = (tags || []).filter(function(t) { return t.tag === key })[0]
  return t ? t.value : null
}

function ftParseIfName(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').replace(/^\*+|\*+$/g, '').trim() }
}

function ftCalcUtilPct(iface) {
  if (!iface.inItem || !iface.outItem || !iface.speedItem) return null
  var speed = parseFloat(iface.speedItem.lastvalue)
  if (!speed) return null
  var bpsIn = parseFloat(iface.inItem.lastvalue)
  var bpsOut = parseFloat(iface.outItem.lastvalue)
  return Math.max(bpsIn, bpsOut) / speed * 100
}

function ftWorstUplink(interfaces, isSpine) {
  var padrao = isSpine ? CFG_FTAB.spineUplinkDescRe : CFG_FTAB.leafUplinkDescRe
  var pior = null
  var piorNome = null
  Object.keys(interfaces).forEach(function(ifname) {
    var iface = interfaces[ifname]
    if (!padrao.test(iface.desc || '')) return
    var pct = ftCalcUtilPct(iface)
    if (pct == null) return
    if (pior == null || pct > pior) { pior = pct; piorNome = ifname + ' (' + iface.desc + ')' }
  })
  return { pct: pior, nome: piorNome }
}

function ftFmtPct(v, casas) {
  return v == null ? '—' : v.toFixed(casas == null ? 1 : casas) + '%'
}

function ftEstadoLabel(key) {
  return { normal: 'Normal', atencao: 'Atenção', critico: 'Crítico' }[key] || key
}

// data/hora LOCAL (nunca toISOString - converte para UTC; Angola e UTC+1,
// por isso entre as 00h-01h locais o ficheiro ficava com a data de ontem)
function ftDataHoraLocal(d) {
  var pad = function(n) { return String(n).padStart(2, '0') }
  return {
    data: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    hora: pad(d.getHours()) + pad(d.getMinutes()),
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [2b] EXPORT XLSX — zip minimo sem bibliotecas (method=stored), mesmo
// formato OOXML ja validado no script Python relatorios/backbone-dc/
// gerar_relatorio.py. Sem template - construido do zero.
// ────────────────────────────────────────────────────────────────────────────

function ftCrc32(bytes) {
  var crc = ~0
  for (var i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]
    for (var b = 0; b < 8; b++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }
  return (~crc) >>> 0
}

function ftDosDateTime() {
  var d = new Date()
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function ftZipBuild(parts) {
  var dt = ftDosDateTime()
  var enc = new TextEncoder()
  var chunks = []
  var centralChunks = []
  var offset = 0

  parts.forEach(function(part) {
    var nameBytes = enc.encode(part.name)
    var dataBytes = enc.encode(part.content)
    var crc = ftCrc32(dataBytes)
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

var FT_XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

var FT_CONTENT_TYPES = FT_XML_HEADER
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
  + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
  + '</Types>'

var FT_RELS_ROOT = FT_XML_HEADER
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
  + '</Relationships>'

var FT_WORKBOOK_RELS = FT_XML_HEADER
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '</Relationships>'

function ftBuildWorkbookXml(sheetName) {
  return FT_XML_HEADER
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets><sheet name="' + ftEsc(sheetName) + '" sheetId="1" r:id="rId1"/></sheets>'
    + '</workbook>'
}

var FT_STYLES_XML = FT_XML_HEADER
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

var FT_STYLE_DEFAULT = 0, FT_STYLE_TITULO = 1, FT_STYLE_HEADER = 2, FT_STYLE_NORMAL = 3
var FT_STYLE_VERDE = 4, FT_STYLE_AMARELO = 5, FT_STYLE_VERMELHO = 6

function ftColLetter(idx0) {
  var letters = '', n = idx0 + 1
  while (n > 0) {
    var r = (n - 1) % 26
    letters = String.fromCharCode(65 + r) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

function ftCellInlineStr(col, row, texto, style) {
  var ref = ftColLetter(col) + row
  return '<c r="' + ref + '" t="inlineStr" s="' + style + '"><is><t xml:space="preserve">' + ftEsc(texto) + '</t></is></c>'
}

function ftBuildSheetXml(titulo, geradoEm, colunas, linhas) {
  var rows = []
  rows.push('<row r="1">' + ftCellInlineStr(0, 1, titulo, FT_STYLE_TITULO) + '</row>')
  rows.push('<row r="2">' + ftCellInlineStr(0, 2, 'Gerado em ' + geradoEm, FT_STYLE_DEFAULT) + '</row>')

  var headerRow = 4
  var headCells = colunas.map(function(c, i) { return ftCellInlineStr(i, headerRow, c, FT_STYLE_HEADER) }).join('')
  rows.push('<row r="' + headerRow + '">' + headCells + '</row>')

  var estadoStyle = { normal: FT_STYLE_VERDE, atencao: FT_STYLE_AMARELO, critico: FT_STYLE_VERMELHO }

  linhas.forEach(function(linha, i) {
    var r = headerRow + 1 + i
    var cells = linha.valores.map(function(v, c) {
      var style = FT_STYLE_NORMAL
      if (c === 1) style = estadoStyle[linha.estadoKey] || FT_STYLE_NORMAL
      return ftCellInlineStr(c, r, v, style)
    }).join('')
    rows.push('<row r="' + r + '">' + cells + '</row>')
  })

  var larguras = [22, 12, 32, 12, 8, 8, 10, 10, 36, 12]
  var colsXml = larguras.slice(0, colunas.length).map(function(w, i) {
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'
  }).join('')

  return FT_XML_HEADER
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<cols>' + colsXml + '</cols>'
    + '<sheetData>' + rows.join('') + '</sheetData>'
    + '</worksheet>'
}

function ftGerarXlsxBytes(titulo, geradoEm, colunas, linhas) {
  var parts = [
    { name: '[Content_Types].xml', content: FT_CONTENT_TYPES },
    { name: '_rels/.rels', content: FT_RELS_ROOT },
    { name: 'xl/workbook.xml', content: ftBuildWorkbookXml('Backbone DC') },
    { name: 'xl/_rels/workbook.xml.rels', content: FT_WORKBOOK_RELS },
    { name: 'xl/styles.xml', content: FT_STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: ftBuildSheetXml(titulo, geradoEm, colunas, linhas) },
  ]
  return ftZipBuild(parts)
}

function ftModelParaExport(model) {
  var colunas = ['EQUIPAMENTO', 'ESTADO', 'FUNCAO', 'LAT.ICMP', 'CPU%', 'RAM%', 'TEMP', 'UTIL% (UPLINK)', 'PIOR UPLINK', 'DISP.(dia)']
  var linhas = model.map(function(r) {
    return {
      estadoKey: r.estado,
      valores: [
        r.host, ftEstadoLabel(r.estado), r.funcao,
        r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms',
        ftFmtPct(r.cpuPct, 0), ftFmtPct(r.ramPct, 0),
        r.tempC == null ? '—' : r.tempC.toFixed(0) + '°C',
        ftFmtPct(r.utilPct, 1),
        r.uplink || '—', ftFmtPct(r.dispPct, 1),
      ],
    }
  })
  return { colunas: colunas, linhas: linhas }
}

async function ftExportarExcel() {
  if (!FT_ULTIMO_MODELO) return
  var btn = document.getElementById('ft-btn-excel')
  var txt = btn.textContent
  btn.textContent = '⏳ A gerar...'
  btn.disabled = true
  try {
    var agora = new Date()
    var dh = ftDataHoraLocal(agora)
    var pack = ftModelParaExport(FT_ULTIMO_MODELO)
    var titulo = 'Backbone — DC Fabric (7 Switches) — ' + agora.toLocaleString('pt-PT')
    var bytes = ftGerarXlsxBytes(titulo, agora.toLocaleString('pt-PT'), pack.colunas, pack.linhas)
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    var a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'Relatorio_Backbone_DCFabric_' + dh.data + '_' + dh.hora + '.xlsx'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } catch (e) {
    console.error('[BPC] ftExportarExcel:', e)
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

function ftAbrirImpressao(model) {
  var win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) { alert('O browser bloqueou o popup de impressão — autoriza popups para este site.'); return }

  var agora = new Date().toLocaleString('pt-PT')
  var head = ['Equipamento', 'Estado', 'Função', 'Lat. ICMP', 'CPU%', 'RAM%', 'Temp.', 'Util% (uplink)', 'Pior uplink', 'Disp. (dia)']
  var rows = model.map(function(r) {
    return '<tr>'
      + '<td>' + ftEsc(r.host) + '</td>'
      + '<td>' + ftEstadoLabel(r.estado) + '</td>'
      + '<td>' + ftEsc(r.funcao) + '</td>'
      + '<td>' + (r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms') + '</td>'
      + '<td>' + ftFmtPct(r.cpuPct, 0) + '</td>'
      + '<td>' + ftFmtPct(r.ramPct, 0) + '</td>'
      + '<td>' + (r.tempC == null ? '—' : r.tempC.toFixed(0) + '°C') + '</td>'
      + '<td>' + ftFmtPct(r.utilPct, 1) + '</td>'
      + '<td>' + ftEsc(r.uplink || '—') + '</td>'
      + '<td>' + ftFmtPct(r.dispPct, 1) + '</td>'
      + '</tr>'
  }).join('')

  win.document.open()
  win.document.write(
    '<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8"><title>Backbone — DC Fabric — Switches</title>'
    + '<style>'
    + '@page { size: A4 landscape; margin: 12mm; }'
    + 'body{font-family:"Segoe UI",Arial,sans-serif;color:#141A2E;margin:0}'
    + 'h1{font-size:1.1rem;margin:0 0 2px}'
    + '.meta{font-size:.75rem;color:#45507A;margin-bottom:10px}'
    + 'table{width:100%;border-collapse:collapse;font-size:.72rem}'
    + 'th{text-align:left;background:#EEF1F8;color:#45507A;text-transform:uppercase;letter-spacing:.03em;padding:5px 8px;border-bottom:1px solid #D3DAEA}'
    + 'td{padding:4px 8px;border-bottom:1px solid #E7EBF4}'
    + '</style></head><body>'
    + '<h1>Backbone — DC Fabric (7 Switches)</h1>'
    + '<div class="meta">Gerado em ' + agora + '</div>'
    + '<table><thead><tr>' + head.map(function(h) { return '<th>' + h + '</th>' }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table>'
    + '</body></html>'
  )
  win.document.close()
  setTimeout(function() { win.focus(); win.print() }, 200)
}

var FT_ULTIMO_MODELO = null


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function ftFetchBase(rpc) {
  return Promise.all([
    rpc('host.get', {
      groupids: CFG_FTAB.groupIds,
      output: ['hostid', 'host'],
      selectTags: 'extend',
      filter: { status: 0 },
    }),
    rpc('item.get', {
      groupids: CFG_FTAB.groupIds,
      output: ['hostid', 'name', 'key_', 'lastvalue', 'itemid'],
      filter: { status: '0' },
    }),
    rpc('trigger.get', {
      groupids: CFG_FTAB.groupIds,
      filter: { value: 1 },
      output: ['triggerid', 'priority', 'description'],
      selectHosts: ['hostid'],
      monitored: true,
    }),
  ]).then(function(r) { return { hosts: r[0], items: r[1], triggers: r[2] } })
}

function ftFetchDisponibilidade(rpc, icmpItemsByHost) {
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

function ftClassifyItems(items) {
  var porHost = {}
  items.forEach(function(it) {
    var hid = it.hostid
    var h = porHost[hid] = porHost[hid] || {
      icmpping: null, icmppingsec: null, cpu: null, ram: null, temps: [], interfaces: {},
    }
    var key = it.key_
    var name = it.name
    if (key === 'icmpping') { h.icmpping = it; return }
    if (key === 'icmppingsec') { h.icmppingsec = it; return }
    if (CFG_FTAB.cpuNameRe.test(name)) { h.cpu = it; return }
    if (name === CFG_FTAB.ramName) { h.ram = it; return }
    if (CFG_FTAB.tempNameRe.test(name)) { h.temps.push(it); return }
    if (key.indexOf('net.if.in[') === 0 || key.indexOf('net.if.out[') === 0 || key.indexOf('net.if.speed[') === 0) {
      var p = ftParseIfName(name)
      if (!p) return
      var iface = h.interfaces[p.ifname] = h.interfaces[p.ifname] || { desc: p.desc }
      if (key.indexOf('net.if.in[') === 0) iface.inItem = it
      else if (key.indexOf('net.if.out[') === 0) iface.outItem = it
      else iface.speedItem = it
    }
  })
  return porHost
}

function ftClassifyTriggers(triggers) {
  var porHost = {}
  triggers.forEach(function(t) {
    if (CFG_FTAB.triggerExcludeRe.test(t.description || '')) return
    (t.hosts || []).forEach(function(h) {
      var arr = porHost[h.hostid] = porHost[h.hostid] || []
      arr.push(parseInt(t.priority, 10))
    })
  })
  return porHost
}

function ftEstado(icmpItem, severidades) {
  if (icmpItem && icmpItem.lastvalue === '0') return 'critico'
  var maxSev = severidades && severidades.length ? Math.max.apply(null, severidades) : 0
  if (maxSev >= CFG_FTAB.sevCritico) return 'critico'
  if (maxSev >= CFG_FTAB.sevAtencao) return 'atencao'
  return 'normal'
}

function ftCompute(data, disp) {
  var porHostItems = ftClassifyItems(data.items)
  var porHostSev = ftClassifyTriggers(data.triggers)

  var hosts = data.hosts.map(function(h) {
    var funcao = ftTag(h.tags, 'funcao')
    return { hostid: h.hostid, host: h.host, funcao: funcao }
  }).filter(function(h) { return h.funcao === 'switch-spine' || h.funcao === 'switch-leaf' })

  hosts.sort(function(a, b) {
    var oa = CFG_FTAB.funcaoOrder[a.funcao], ob = CFG_FTAB.funcaoOrder[b.funcao]
    if (oa !== ob) return oa - ob
    return a.host < b.host ? -1 : 1
  })

  return hosts.map(function(hm) {
    var hid = hm.hostid
    var h = porHostItems[hid] || { icmpping: null, icmppingsec: null, cpu: null, ram: null, temps: [], interfaces: {} }
    var isSpine = hm.funcao === 'switch-spine'

    var estado = ftEstado(h.icmpping, porHostSev[hid])
    var latMs = h.icmppingsec && h.icmppingsec.lastvalue !== '' ? parseFloat(h.icmppingsec.lastvalue) * 1000 : null
    var cpuPct = h.cpu ? parseFloat(h.cpu.lastvalue) : null
    var ramPct = h.ram ? parseFloat(h.ram.lastvalue) : null
    var temps = h.temps.map(function(t) { return parseFloat(t.lastvalue) }).filter(function(v) { return !isNaN(v) })
    var tempC = temps.length ? Math.max.apply(null, temps) : null
    var uplink = ftWorstUplink(h.interfaces, isSpine)

    return {
      hostid: hid,
      host: hm.host,
      funcao: CFG_FTAB.funcaoLabel[hm.funcao] || hm.funcao,
      estado: estado,
      latMs: latMs,
      cpuPct: cpuPct,
      ramPct: ramPct,
      tempC: tempC,
      utilPct: uplink.pct,
      uplink: uplink.nome,
      dispPct: disp[hid] != null ? disp[hid] : null,
    }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function ftPill(estado) {
  var T = window.BPC.THEME
  var map = {
    normal: { col: T.colorOk, bg: 'rgba(34,197,94,0.15)', lbl: 'Normal' },
    atencao: { col: T.colorWarn, bg: 'rgba(210,153,34,0.15)', lbl: 'Atenção' },
    critico: { col: T.colorCrit, bg: 'rgba(248,81,73,0.18)', lbl: 'Crítico' },
  }
  var s = map[estado] || map.normal
  return '<span style="background:' + s.bg + ';color:' + s.col + ';font-size:12px;font-weight:700;'
    + 'padding:3px 10px;border-radius:999px;white-space:nowrap">' + s.lbl + '</span>'
}

function ftFmtPct(v, casas) {
  return v == null ? '—' : v.toFixed(casas == null ? 1 : casas) + '%'
}

function ftRenderRow(r) {
  return '<tr>'
    + '<td style="font-family:monospace;font-weight:600;color:#E6EDF3">' + ftEsc(r.host) + '</td>'
    + '<td>' + ftPill(r.estado) + '</td>'
    + '<td style="color:#B8C0D4">' + ftEsc(r.funcao) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + (r.latMs == null ? '—' : r.latMs.toFixed(2) + ' ms') + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + ftFmtPct(r.cpuPct, 0) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + ftFmtPct(r.ramPct, 0) + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + (r.tempC == null ? '—' : r.tempC.toFixed(0) + '°C') + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + ftFmtPct(r.utilPct, 1) + '</td>'
    + '<td style="color:#8891A8;font-size:12px;font-family:monospace">' + ftEsc(r.uplink || '—') + '</td>'
    + '<td style="text-align:right;color:#B8C0D4">' + ftFmtPct(r.dispPct, 1) + '</td>'
    + '</tr>'
}

function ftToolbarHtml() {
  var btnCss = 'font:600 12px \'Inter\',\'Segoe UI\',sans-serif;padding:6px 14px;border-radius:6px;'
    + 'border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.06);color:#E6EDF3;cursor:pointer'
  return '<div style="display:flex;gap:8px;justify-content:flex-end;margin-bottom:8px">'
    + '<button id="ft-btn-excel" style="' + btnCss + '">⬇ Exportar Excel</button>'
    + '<button id="ft-btn-print" style="' + btnCss + '">🖨 Imprimir / PDF</button>'
    + '</div>'
}

function ftAttachToolbar(model) {
  var btnExcel = document.getElementById('ft-btn-excel')
  var btnPrint = document.getElementById('ft-btn-print')
  if (btnExcel) btnExcel.addEventListener('click', ftExportarExcel)
  if (btnPrint) btnPrint.addEventListener('click', function() { ftAbrirImpressao(model) })
}

function ftRender(el, model) {
  FT_ULTIMO_MODELO = model

  var css = 'font-family:\'Inter\',\'Segoe UI\',sans-serif;font-size:13px;width:100%;border-collapse:collapse'
  var thStyle = 'text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;'
    + 'color:#8891A8;border-bottom:1px solid rgba(255,255,255,0.12)'
  var tdBase = 'padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06)'

  var head = '<thead><tr>'
    + ['Equipamento', 'Estado', 'Função', 'Lat. ICMP', 'CPU%', 'RAM%', 'Temp.', 'Util% (uplink)', 'Pior uplink', 'Disp. (dia)']
      .map(function(h) { return '<th style="' + thStyle + '">' + h + '</th>' }).join('')
    + '</tr></thead>'

  var body = '<tbody>' + model.map(ftRenderRow).join('') + '</tbody>'

  el.innerHTML = ftToolbarHtml()
    + '<div style="overflow-x:auto"><table style="' + css + '">' + head + body + '</table></div>'
    + '<style>#' + CFG_FTAB.elementId + ' td{' + tdBase + '}</style>'

  ftAttachToolbar(model)
}

function ftRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ DC Fabric — Tabela: ' + ftEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function ftLoad(rpc) {
  var el = document.getElementById(CFG_FTAB.elementId)
  if (!el) return
  el.innerHTML = window.BPC.utils.buildSkeleton()

  ftFetchBase(rpc)
    .then(function(data) {
      var porHostItems = ftClassifyItems(data.items)
      var icmpByHost = {}
      data.hosts.forEach(function(h) {
        icmpByHost[h.hostid] = porHostItems[h.hostid] ? porHostItems[h.hostid].icmpping : null
      })
      return ftFetchDisponibilidade(rpc, icmpByHost).then(function(disp) {
        return ftCompute(data, disp)
      })
    })
    .then(function(model) { ftRender(el, model) })
    .catch(function(err) { ftRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function() { ftLoad(rpc) }, CFG_FTAB.refreshMs)
}

function ftInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(ftLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-fab-tabela: waitForBPC nunca disponivel'); return }
  setTimeout(function() { ftInitWithRetry(attempt + 1) }, 100)
}

ftInitWithRetry()
