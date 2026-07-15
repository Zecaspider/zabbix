// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  R0 · Relatórios — Exportação Excel/PDF por domínio             v1.0     ║
// ║                                                                          ║
// ║  Extensão da F1 (plano-melhorias-observabilidade-20260712.md): o mesmo   ║
// ║  relatório do gerador CLI (relatorios/por-dominio/), mas gerado no       ║
// ║  próprio browser a partir deste painel — escolher domínio (ou todos),    ║
// ║  período, e exportar .xlsx ou PDF.                                       ║
// ║                                                                          ║
// ║  COMO FUNCIONA (sem serviços novos, sem bibliotecas externas):           ║
// ║  · Dados: BPC.rpc (host/trigger/item.get, lastvalue) + POST /api/ds/query║
// ║    ao MySQL Infra para a disponibilidade (tabela trends_uint — icmpping/ ║
// ║    agent.ping/web.test.fail são todos unsigned; validado ao vivo).       ║
// ║  · Excel: pacote OOXML construído em JS (port 1:1 do relatorio_lib.py,   ║
// ║    ZIP "stored" + CRC32 manual) → download via Blob. Multi-folha quando  ║
// ║    o domínio = Todos (1 sheet por domínio, 1 ficheiro só).               ║
// ║  · PDF: janela imprimível (mesmo CSS do HTML do CLI) + window.print() —  ║
// ║    o browser usa o <title> como nome de ficheiro sugerido, por isso o    ║
// ║    title é definido ao nome canónico do relatório.                       ║
// ║  · Nome de ficheiro: Relatorio_<Dominio>_<YYYY-MM-DD>_<HHMM> (mesma      ║
// ║    convenção do CLI; hora = fim do período escolhido).                   ║
// ║                                                                          ║
// ║  LIMITES HONESTOS (iguais ao CLI): métricas CPU/RAM/DISCO são o último   ║
// ║  valor conhecido (lastvalue, pode ter até ~30min de cache do proxy);     ║
// ║  só a DISP.(período) respeita o intervalo escolhido, hora a hora.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

var CFG = {
  rootId: 'bpc-relatorios-export',
  dsQueryUrl: '/api/ds/query',
  mysqlUid: 'afor1g5862fb4c',

  // Port de relatorios/por-dominio/dominios.json — manter em sincronia manual
  // (mudanças de config fazem-se lá primeiro, depois aqui).
  domains: [
    { id: 'vmware', titulo: 'Infraestrutura VMware - Hypervisores ESXi', sheet: 'VMware',
      groupids: ['603'], hostRe: /^VIRT - ESXi/,
      metricas: [
        { col: 'CPU%', keysLike: ['vmware.hv.cpu.usage.perf'], agg: 'first', fmt: 'pct' },
        { col: 'VMS', keysLike: ['vmware.hv.vm.num'], agg: 'first', fmt: 'int' },
        { col: 'UPTIME', keysLike: ['vmware.hv.uptime'], agg: 'first', fmt: 'dias' },
      ],
      availKeys: ['icmpping'] },
    { id: 'servidores-virtuais', titulo: 'Servidores Virtuais - VMs de Producao', sheet: 'Servidores Virtuais',
      groupids: ['609'],
      tags: [
        { tag: 'ambiente', value: 'Produção', operator: '1' },
        { tag: 'ambiente', value: 'producao', operator: '1' },
      ], evaltype: 2, colServico: true,
      metricas: [
        { col: 'CPU%', keysLike: ['system.cpu.util'], agg: 'first', fmt: 'pct' },
        { col: 'RAM%', keysLike: ['vm.memory.util', 'vm.memory.utilization'], agg: 'first', fmt: 'pct' },
        { col: 'DISCO% (pior)', keysLike: ['pused'], agg: 'max', fmt: 'pct' },
      ],
      availKeys: ['icmpping', 'agent.ping'] },
    { id: 'armazenamento', titulo: 'Armazenamento - Storage e Tape Library', sheet: 'Armazenamento',
      groupids: ['602', '605'],
      metricas: [
        { col: 'SAUDE SNMP', keysLike: ['systemHealthStat'], agg: 'first', fmt: 'map',
          map: { '0': 'OK', '1': 'Atenção', '2': 'Crítico' } },
      ],
      availKeys: ['icmpping'] },
    { id: 'bases-dados', titulo: 'Bases de Dados - Producao', sheet: 'Bases de Dados',
      tags: [
        { tag: 'camada', value: 'base de dados', operator: '1' },
        { tag: 'ambiente', value: 'Produção', operator: '1' },
      ], evaltype: 0, colServico: true, colMotor: true,
      metricas: [
        { col: 'CPU%', keysLike: ['system.cpu.util'], agg: 'first', fmt: 'pct' },
        { col: 'RAM%', keysLike: ['vm.memory.util', 'vm.memory.utilization'], agg: 'first', fmt: 'pct' },
        { col: 'DISCO% (pior)', keysLike: ['pused'], agg: 'max', fmt: 'pct' },
      ],
      availKeys: ['icmpping', 'agent.ping'] },
    { id: 'apis-servicos', titulo: 'APIs e Servicos de Negocio - Monitores Sinteticos', sheet: 'APIs e Servicos',
      groupids: ['663'], webitems: true, colServico: true, webAvail: true,
      metricas: [
        { col: 'CENARIOS KO', keysLike: ['web.test.fail'], agg: 'count_pos', fmt: 'int' },
        { col: 'PIOR PASSO (s)', keysLike: ['web.test.time'], agg: 'max', fmt: 'seg' },
      ],
      availKeys: [] },
    { id: 'seguranca', titulo: 'Seguranca - Firewalls, WAF e Darktrace', sheet: 'Seguranca',
      groupids: ['656'], metricas: [], availKeys: ['icmpping'] },
  ],
};

var EST = { NORMAL: 'Normal', ATENCAO: 'Atenção', CRITICO: 'Crítico', SEM: 'Sem dados' };
var ORDEM_EST = {};
ORDEM_EST[EST.CRITICO] = 0; ORDEM_EST[EST.ATENCAO] = 1; ORDEM_EST[EST.SEM] = 2; ORDEM_EST[EST.NORMAL] = 3;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmtDataHora(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function nomeFicheiro(sheet, fim) {
  return 'Relatorio_' + sheet.replace(/ /g, '_') + '_'
    + fim.getFullYear() + '-' + pad2(fim.getMonth() + 1) + '-' + pad2(fim.getDate())
    + '_' + pad2(fim.getHours()) + pad2(fim.getMinutes());
}

// ── ZIP "stored" + CRC32 (para o .xlsx, sem bibliotecas) ─────────────────────

var CRC_TABLE = (function() {
  var t = new Uint32Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }

// entries: [{name, text}] → Blob zip (entradas sem compressão, method 0)
function zipStore(entries) {
  var enc = new TextEncoder();
  var parts = [], central = [], offset = 0;
  entries.forEach(function(e) {
    var nameB = enc.encode(e.name);
    var data = enc.encode(e.text);
    var crc = crc32(data);
    var local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameB.length), u16(0));
    parts.push(new Uint8Array(local), nameB, data);
    var cent = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length),
      u16(nameB.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
    central.push({ head: new Uint8Array(cent), name: nameB });
    offset += local.length + nameB.length + data.length;
  });
  var centStart = offset, centLen = 0;
  central.forEach(function(c) {
    parts.push(c.head, c.name);
    centLen += c.head.length + c.name.length;
  });
  var end = [].concat(
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centLen), u32(centStart), u16(0));
  parts.push(new Uint8Array(end));
  return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ── XLSX multi-folha (port do relatorio_lib.py) ──────────────────────────────

var XMLH = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
var STYLES_XML = XMLH
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="14"/><name val="Calibri"/></font></fonts>'
  + '<fills count="7"><fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF2F3B52"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E7C6"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3B0"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C6C6"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE3E3E3"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right>'
  + '<top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="8">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
  + '</cellXfs></styleSheet>';

var ESTADO_STYLE = {};
ESTADO_STYLE[EST.NORMAL] = 4; ESTADO_STYLE[EST.ATENCAO] = 5;
ESTADO_STYLE[EST.CRITICO] = 6; ESTADO_STYLE[EST.SEM] = 7;

function xmlEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function colLetter(i) {
  var s = '', n = i + 1;
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function cell(c, r, texto, style) {
  return '<c r="' + colLetter(c) + r + '" t="inlineStr" s="' + style
    + '"><is><t xml:space="preserve">' + xmlEsc(texto) + '</t></is></c>';
}
function sheetXml(sh) {
  var rows = [];
  rows.push('<row r="1">' + cell(0, 1, sh.titulo, 1) + '</row>');
  rows.push('<row r="2">' + cell(0, 2, 'Gerado em ' + sh.geradoEm, 0) + '</row>');
  var hr = 4;
  rows.push('<row r="' + hr + '">' + sh.colunas.map(function(c, i) { return cell(i, hr, c, 2); }).join('') + '</row>');
  sh.linhas.forEach(function(linha, li) {
    var r = hr + 1 + li;
    rows.push('<row r="' + r + '">' + linha.map(function(v, c) {
      var st = (c === 1) ? (ESTADO_STYLE[v] || 3) : 3;
      return cell(c, r, v, st);
    }).join('') + '</row>');
  });
  var larguras = [34, 12];
  while (larguras.length < sh.colunas.length - 2) larguras.push(14);
  larguras.push(52, 14);
  var cols = larguras.slice(0, sh.colunas.length).map(function(w, i) {
    return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
  }).join('');
  return XMLH + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<cols>' + cols + '</cols><sheetData>' + rows.join('') + '</sheetData></worksheet>';
}

// sheets: [{name, titulo, geradoEm, colunas, linhas}] → Blob .xlsx
function buildXlsx(sheets) {
  var overrides = sheets.map(function(_, i) {
    return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  }).join('');
  var contentTypes = XMLH + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + overrides
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  var relsRoot = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  var wbSheets = sheets.map(function(sh, i) {
    return '<sheet name="' + xmlEsc(sh.name.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
  }).join('');
  var workbook = XMLH + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets></workbook>';
  var wbRels = XMLH + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map(function(_, i) {
        return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
      }).join('')
    + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';

  var entries = [
    { name: '[Content_Types].xml', text: contentTypes },
    { name: '_rels/.rels', text: relsRoot },
    { name: 'xl/workbook.xml', text: workbook },
    { name: 'xl/_rels/workbook.xml.rels', text: wbRels },
    { name: 'xl/styles.xml', text: STYLES_XML },
  ];
  sheets.forEach(function(sh, i) {
    entries.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', text: sheetXml(sh) });
  });
  return zipStore(entries);
}

function download(blob, filename) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// ── HTML imprimível (PDF via print dialog) ──────────────────────────────────

var EST_CLASS = {};
EST_CLASS[EST.NORMAL] = 'ok'; EST_CLASS[EST.ATENCAO] = 'warn';
EST_CLASS[EST.CRITICO] = 'crit'; EST_CLASS[EST.SEM] = 'mute';

function seccaoHtml(sh) {
  var thead = sh.colunas.map(function(c) { return '<th>' + esc(c) + '</th>'; }).join('');
  var corpo = sh.linhas.map(function(linha) {
    return '<tr>' + linha.map(function(v, c) {
      var cls = (c === 1) ? ' class="' + (EST_CLASS[v] || '') + '"' : '';
      return '<td' + cls + '>' + esc(v) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  var kpis = sh.resumo.map(function(kv) {
    return '<div class="kpi"><div class="kpi-v">' + esc(kv[1]) + '</div><div class="kpi-l">' + esc(kv[0]) + '</div></div>';
  }).join('');
  return '<section><h1>' + esc(sh.titulo) + '</h1>'
    + '<div class="sub">Gerado em ' + esc(sh.geradoEm) + ' · BPC-Observe</div>'
    + '<div class="kpis">' + kpis + '</div>'
    + '<table><thead><tr>' + thead + '</tr></thead><tbody>' + corpo + '</tbody></table></section>';
}

function abrirPdf(sheets, filename) {
  var css = 'body{font-family:Segoe UI,Calibri,Arial,sans-serif;color:#1a2233;margin:28px;background:#fff}'
    + 'h1{font-size:19px;margin:0 0 2px 0}.sub{color:#5a6577;font-size:12px;margin-bottom:16px}'
    + '.kpis{display:flex;gap:22px;margin:0 0 16px 0}'
    + '.kpi{border:1px solid #d6dbe4;border-radius:8px;padding:8px 16px;text-align:center}'
    + '.kpi-v{font-size:20px;font-weight:700}.kpi-l{font-size:10.5px;color:#5a6577;text-transform:uppercase;letter-spacing:.05em}'
    + 'table{border-collapse:collapse;width:100%;font-size:11.5px}'
    + 'th{background:#2F3B52;color:#fff;text-align:left;padding:6px 8px}'
    + 'td{border:1px solid #ccd2dc;padding:5px 8px}tr:nth-child(even) td{background:#f6f8fb}'
    + 'td.ok{background:#C6E7C6!important;font-weight:600}td.warn{background:#FFF3B0!important;font-weight:600}'
    + 'td.crit{background:#F8C6C6!important;font-weight:600}td.mute{background:#E3E3E3!important;color:#666}'
    + 'section{page-break-after:always}section:last-child{page-break-after:auto}'
    + '@media print{body{margin:10mm}th,td{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + 'thead{display:table-header-group}tr{page-break-inside:avoid}}';
  var doc = '<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>' + esc(filename)
    + '</title><style>' + css + '</style></head><body>'
    + sheets.map(seccaoHtml).join('') + '</body></html>';
  var w = window.open('', '_blank');
  if (!w) { throw new Error('popup bloqueado — permitir popups deste Grafana'); }
  w.document.open();
  w.document.write(doc);
  w.document.close();
  setTimeout(function() { w.focus(); w.print(); }, 600);
}

// ── MOTOR DE DADOS (port do gerar_relatorio.py) ──────────────────────────────

function dsQuery(sql) {
  return fetch(CFG.dsQueryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-grafana-org-id': '1' },
    credentials: 'include',
    body: JSON.stringify({
      queries: [{ refId: 'A', datasource: { uid: CFG.mysqlUid, type: 'mysql' }, rawSql: sql, format: 'table' }],
      from: 'now-1h', to: 'now',
    }),
  }).then(function(r) { if (!r.ok) throw new Error('ds/query HTTP ' + r.status); return r.json(); })
    .then(function(json) {
      var fr = json.results && json.results.A && json.results.A.frames && json.results.A.frames[0];
      if (!fr) return [];
      var nomes = fr.schema.fields.map(function(f) { return f.name; });
      var vals = fr.data.values, out = [];
      var n = vals.length ? vals[0].length : 0;
      for (var i = 0; i < n; i++) {
        var row = {};
        nomes.forEach(function(nm, c) { row[nm] = vals[c][i]; });
        out.push(row);
      }
      return out;
    });
}

function aggMetrica(met, items) {
  var vals = [];
  (items || []).forEach(function(it) {
    if (it.lastvalue === '' || it.lastvalue == null) return;
    var v = parseFloat(it.lastvalue);
    if (!isNaN(v)) vals.push(v);
  });
  if (!vals.length) return null;
  if (met.agg === 'max') return Math.max.apply(null, vals);
  if (met.agg === 'count_pos') return vals.filter(function(v) { return v > 0; }).length;
  return vals[0];
}
function fmtMetrica(met, v) {
  if (v == null) return '---';
  if (met.fmt === 'pct') return Math.round(v) + '%';
  if (met.fmt === 'int') return String(Math.round(v));
  if (met.fmt === 'seg') return v.toFixed(2) + ' s';
  if (met.fmt === 'dias') return Math.round(v / 86400) + ' d';
  if (met.fmt === 'map') return (met.map && met.map[String(Math.round(v))]) || String(Math.round(v));
  return v.toFixed(1);
}
function estadoDoHost(availItem, sevMax, temDados) {
  if (availItem && availItem.lastvalue === '0') return EST.CRITICO;
  if (sevMax >= 4) return EST.CRITICO;
  if (sevMax >= 2) return EST.ATENCAO;
  if (!availItem && !temDados) return EST.SEM;
  return EST.NORMAL;
}

// Gera os dados de 1 domínio → {name, titulo, geradoEm, colunas, linhas, resumo}
function gerarDominio(rpc, dom, iniTs, fimTs, fimDate) {
  var params = { output: ['hostid', 'host', 'name'], selectTags: 'extend', filter: { status: '0' } };
  if (dom.groupids) params.groupids = dom.groupids;
  if (dom.tags) { params.tags = dom.tags; params.evaltype = dom.evaltype || 0; }

  return rpc('host.get', params).then(function(hosts) {
    if (dom.hostRe) hosts = hosts.filter(function(h) { return dom.hostRe.test(h.name) || dom.hostRe.test(h.host); });
    hosts.forEach(function(h) {
      h.tagmap = {};
      (h.tags || []).forEach(function(t) { h.tagmap[t.tag] = t.value; });
    });
    if (!hosts.length) throw new Error(dom.id + ': 0 hosts');
    var hostids = hosts.map(function(h) { return h.hostid; });

    var pTrig = rpc('trigger.get', {
      hostids: hostids, filter: { value: 1 },
      output: ['triggerid', 'priority', 'description'],
      selectHosts: ['hostid'], monitored: true, expandDescription: true,
    });
    var pMets = Promise.all(dom.metricas.map(function(met) {
      // 1 chamada por chave; agg first pára na 1ª com resultados
      var seq = Promise.resolve({});
      met.keysLike.forEach(function(key) {
        seq = seq.then(function(acc) {
          if (met.agg === 'first' && Object.keys(acc).length) return acc;
          var p = { hostids: hostids, search: { key_: key }, output: ['hostid', 'key_', 'lastvalue'] };
          if (dom.webitems) p.webitems = true; else p.filter = { status: '0' };
          return rpc('item.get', p).then(function(items) {
            items.forEach(function(it) { (acc[it.hostid] = acc[it.hostid] || []).push(it); });
            return acc;
          });
        });
      });
      return seq;
    }));
    var pAvail = dom.availKeys.length
      ? rpc('item.get', { hostids: hostids, filter: { key_: dom.availKeys, status: '0' }, output: ['hostid', 'itemid', 'key_', 'lastvalue'] })
      : Promise.resolve([]);

    return Promise.all([pTrig, pMets, pAvail]).then(function(res) {
      var triggers = res[0], metsPorCol = res[1], availItems = res[2];

      var probPorHost = {};
      triggers.forEach(function(t) {
        var pri = parseInt(t.priority, 10);
        (t.hosts || []).forEach(function(h) {
          if (!probPorHost[h.hostid] || pri > probPorHost[h.hostid][0]) probPorHost[h.hostid] = [pri, t.description];
        });
      });

      var availPorHost = {};
      availItems.forEach(function(it) {
        var atual = availPorHost[it.hostid];
        if (!atual || (it.key_ === 'icmpping' && atual.key_ !== 'icmpping')) availPorHost[it.hostid] = it;
      });

      // disponibilidade via trends_uint (icmpping/agent.ping/web.test.fail = unsigned)
      var availIds = Object.keys(availPorHost).map(function(hid) { return availPorHost[hid].itemid; });
      var webFailPorHost = {};
      if (dom.webAvail) {
        var idx = dom.metricas.findIndex(function(m) { return m.col === 'CENARIOS KO'; });
        webFailPorHost = metsPorCol[idx] || {};
        Object.keys(webFailPorHost).forEach(function(hid) {
          webFailPorHost[hid].forEach(function(it) { availIds.push(it.itemid); });
        });
      }
      var pDisp = availIds.length
        ? dsQuery('SELECT itemid, SUM(num) n, SUM(value_avg*num) s, SUM(CASE WHEN value_max>0 THEN 1 ELSE 0 END) ko, COUNT(*) horas '
            + 'FROM trends_uint WHERE itemid IN (' + availIds.join(',') + ') '
            + 'AND clock >= ' + iniTs + ' AND clock < ' + fimTs + ' GROUP BY itemid')
        : Promise.resolve([]);

      return pDisp.then(function(trendRows) {
        var trendPorItem = {};
        trendRows.forEach(function(r) { trendPorItem[String(r.itemid)] = r; });

        var colunas = ['EQUIPAMENTO', 'ESTADO'];
        if (dom.colMotor) colunas.push('MOTOR');
        if (dom.colServico) colunas.push('SERVICO');
        colunas = colunas.concat(dom.metricas.map(function(m) { return m.col; }));
        colunas.push('PROBLEMA ACTIVO', 'DISP.(período)');

        var linhas = hosts.map(function(h) {
          var avail = availPorHost[h.hostid] || null;
          var prob = probPorHost[h.hostid] || null;
          var temDados = false;
          var mvals = dom.metricas.map(function(m, i) {
            var v = aggMetrica(m, (metsPorCol[i] || {})[h.hostid]);
            if (v != null) temDados = true;
            return fmtMetrica(m, v);
          });
          var estado = estadoDoHost(avail, prob ? prob[0] : 0, temDados);

          var disp = null;
          if (dom.webAvail) {
            var horas = 0, ko = 0;
            (webFailPorHost[h.hostid] || []).forEach(function(it) {
              var tr = trendPorItem[String(it.itemid)];
              if (tr) { horas = Math.max(horas, tr.horas); ko = Math.max(ko, tr.ko); }
            });
            if (horas > 0) disp = (horas - ko) / horas * 100;
          } else if (avail) {
            var tr2 = trendPorItem[String(avail.itemid)];
            if (tr2 && tr2.n > 0) disp = tr2.s / tr2.n * 100;
          }

          var linha = [h.name, estado];
          if (dom.colMotor) linha.push(h.tagmap.motor || '---');
          if (dom.colServico) linha.push(h.tagmap.servico || '---');
          linha = linha.concat(mvals);
          linha.push(prob ? prob[1] : '---');
          linha.push(disp != null ? disp.toFixed(1) + '%' : '---');
          return linha;
        });

        linhas.sort(function(a, b) {
          return (ORDEM_EST[a[1]] - ORDEM_EST[b[1]]) || a[0].toLowerCase().localeCompare(b[0].toLowerCase());
        });

        var nCrit = linhas.filter(function(l) { return l[1] === EST.CRITICO; }).length;
        var nAten = linhas.filter(function(l) { return l[1] === EST.ATENCAO; }).length;
        return {
          name: dom.sheet,
          titulo: dom.titulo + ' - ' + fmtDataHora(fimDate),
          geradoEm: fmtDataHora(new Date()),
          colunas: colunas,
          linhas: linhas,
          resumo: [['Hosts', String(linhas.length)], ['Críticos', String(nCrit)],
                   ['Atenção', String(nAten)], ['Normais', String(linhas.length - nCrit - nAten)]],
        };
      });
    });
  });
}

// ── UI ────────────────────────────────────────────────────────────────────────

function dtLocalValue(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function renderUI(root) {
  var agora = new Date();
  var meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0);
  var opts = '<option value="__todos__">Todos os domínios (1 ficheiro, 1 folha por domínio)</option>'
    + CFG.domains.map(function(d) { return '<option value="' + d.id + '">' + esc(d.titulo) + '</option>'; }).join('');

  root.innerHTML = ''
    + '<div class="bpc bpc-card" style="--card-accent:var(--bpc-cyan);padding:18px 22px;">'
    + '<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end;">'
    +   '<label style="display:flex;flex-direction:column;gap:5px;font-size:.75rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.05em;">Domínio / camada'
    +     '<select id="bpc-rel-dom" style="background:#0d1524;color:#E6EDF3;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px 12px;font-size:.9rem;min-width:320px;">' + opts + '</select></label>'
    +   '<label style="display:flex;flex-direction:column;gap:5px;font-size:.75rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.05em;">Início do período'
    +     '<input id="bpc-rel-ini" type="datetime-local" value="' + dtLocalValue(meiaNoite) + '" style="background:#0d1524;color:#E6EDF3;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:7px 12px;font-size:.9rem;"></label>'
    +   '<label style="display:flex;flex-direction:column;gap:5px;font-size:.75rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.05em;">Fim do período'
    +     '<input id="bpc-rel-fim" type="datetime-local" value="' + dtLocalValue(agora) + '" style="background:#0d1524;color:#E6EDF3;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:7px 12px;font-size:.9rem;"></label>'
    +   '<button id="bpc-rel-xlsx" style="background:rgba(34,197,94,.12);color:#22C55E;border:1px solid rgba(34,197,94,.4);border-radius:10px;padding:10px 20px;font-size:.92rem;font-weight:700;cursor:pointer;">⬇ Exportar Excel</button>'
    +   '<button id="bpc-rel-pdf" style="background:rgba(56,189,248,.10);color:var(--bpc-cyan);border:1px solid rgba(56,189,248,.4);border-radius:10px;padding:10px 20px;font-size:.92rem;font-weight:700;cursor:pointer;">⬇ Exportar PDF</button>'
    + '</div>'
    + '<div id="bpc-rel-status" style="margin-top:12px;font-size:.85rem;color:rgba(255,255,255,.45);">Pronto. Métricas (CPU/RAM/disco) = último valor conhecido; a coluna DISP. respeita o período escolhido (hora a hora, via trends). No PDF, o nome do ficheiro sugerido vem do título da janela de impressão.</div>'
    + '</div>';
}

function lerPeriodo() {
  var ini = new Date(document.getElementById('bpc-rel-ini').value);
  var fim = new Date(document.getElementById('bpc-rel-fim').value);
  if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || ini >= fim) {
    throw new Error('período inválido (início tem de ser antes do fim)');
  }
  return { ini: ini, fim: fim };
}

function domsSeleccionados() {
  var v = document.getElementById('bpc-rel-dom').value;
  if (v === '__todos__') return CFG.domains;
  return CFG.domains.filter(function(d) { return d.id === v; });
}

function setStatus(msg, erro) {
  var el = document.getElementById('bpc-rel-status');
  if (el) { el.textContent = msg; el.style.color = erro ? '#f85149' : 'rgba(255,255,255,.55)'; }
}

function gerarSheets(rpc, doms, per) {
  var iniTs = Math.floor(per.ini.getTime() / 1000);
  var fimTs = Math.floor(per.fim.getTime() / 1000);
  var sheets = [];
  var seq = Promise.resolve();
  doms.forEach(function(dom, i) {
    seq = seq.then(function() {
      setStatus('A gerar ' + (i + 1) + '/' + doms.length + ': ' + dom.titulo + ' …');
      return gerarDominio(rpc, dom, iniTs, fimTs, per.fim).then(function(sh) { sheets.push(sh); });
    });
  });
  return seq.then(function() { return sheets; });
}

function onExport(rpc, formato) {
  var per, doms;
  try { per = lerPeriodo(); doms = domsSeleccionados(); }
  catch (e) { setStatus('Erro: ' + e.message, true); return; }

  var base = doms.length > 1 ? nomeFicheiro('Todos Dominios', per.fim) : nomeFicheiro(doms[0].sheet, per.fim);
  gerarSheets(rpc, doms, per).then(function(sheets) {
    if (formato === 'xlsx') {
      download(buildXlsx(sheets), base + '.xlsx');
      setStatus('Excel gerado: ' + base + '.xlsx (' + sheets.length + ' folha(s))');
    } else {
      abrirPdf(sheets, base);
      setStatus('Janela de impressão aberta — escolher "Guardar como PDF". Nome sugerido: ' + base + '.pdf');
    }
  }).catch(function(err) {
    console.error('[BPC] relatorios-export:', err);
    setStatus('Falha: ' + err.message, true);
  });
}

// ── BOOTSTRAP (initWithRetry) ─────────────────────────────────────────────────

function start(rpc) {
  BPC.utils.waitForElement(CFG.rootId, function(root) {
    renderUI(root);
    document.getElementById('bpc-rel-xlsx').addEventListener('click', function() { onExport(rpc, 'xlsx'); });
    document.getElementById('bpc-rel-pdf').addEventListener('click', function() { onExport(rpc, 'pdf'); });
  });
}

function initWithRetry(attempt) {
  attempt = attempt || 0;
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start);
    return;
  }
  if (attempt > 50) {
    console.error('[BPC] relatorios-export: window.waitForBPC nunca ficou disponivel');
    return;
  }
  setTimeout(function() { initWithRetry(attempt + 1); }, 100);
}

initWithRetry();
