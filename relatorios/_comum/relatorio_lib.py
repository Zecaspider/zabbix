# -*- coding: utf-8 -*-
"""
Biblioteca partilhada dos geradores de relatorio (F1, plano-melhorias 2026-07-12).

- Tokens e clientes da API Zabbix (Infra + Network), so leitura.
- Escrita .xlsx por construcao directa do pacote OOXML (zipfile + XML):
  openpyxl indisponivel neste ambiente (pip crasha nativo, 0xC0000005) -
  mesmo principio ja aprovado no relatorios/backbone-dc/gerar_relatorio.py,
  generalizado aqui (nome da folha, larguras e coluna de estado por parametro).
- Relatorio HTML imprimivel (@media print) e PDF via Edge headless
  (grafana-image-renderer nao esta instalado no servidor - confirmado 404
  em 2026-07-12 - por isso o PDF e' gerado localmente, sem dependencias).
"""
import json
import os
import subprocess
import zipfile

import requests

TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"

ZABBIX_INFRA_URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"
ZABBIX_NETWORK_URL = "http://10.10.233.140/zabbix/api_jsonrpc.php"

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
]

ESTADO_NORMAL = "Normal"
ESTADO_ATENCAO = "Atenção"
ESTADO_CRITICO = "Crítico"
ESTADO_SEM_DADOS = "Sem dados"


# ── tokens ────────────────────────────────────────────────────────────────────

def _linhas_token():
    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        return [l.strip() for l in f.readlines()]


def ler_token_infra():
    linhas = _linhas_token()
    for i, linha in enumerate(linhas):
        low = linha.lower()
        if low.startswith("zabbix") and "network" not in low and "grafana" not in low:
            for seguinte in linhas[i + 1:]:
                if seguinte:
                    return seguinte
    raise RuntimeError("Nao encontrei o token Zabbix Infra em " + TOKEN_FILE)


def ler_token_network():
    linhas = _linhas_token()
    for i, linha in enumerate(linhas):
        low = linha.lower()
        if low.startswith("zabbix de network") and "network2" not in low:
            for seguinte in linhas[i + 1:]:
                if seguinte:
                    return seguinte
    raise RuntimeError("Nao encontrei o token Zabbix Network em " + TOKEN_FILE)


class ZabbixClient:
    def __init__(self, url, token):
        self.url = url
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json-rpc",
        }
        self._id = 0

    def call(self, method, params):
        self._id += 1
        payload = {"jsonrpc": "2.0", "method": method, "params": params, "id": self._id}
        resp = requests.post(self.url, json=payload, headers=self.headers, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"{method} -> {data['error']}")
        return data["result"]


def cliente(qual):
    """qual: 'infra' | 'network'"""
    if qual == "network":
        return ZabbixClient(ZABBIX_NETWORK_URL, ler_token_network())
    return ZabbixClient(ZABBIX_INFRA_URL, ler_token_infra())


# ── xlsx (OOXML directo) ─────────────────────────────────────────────────────

XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

CONTENT_TYPES = XML_HEADER + (
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    '</Types>'
)

RELS_ROOT = XML_HEADER + (
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    '</Relationships>'
)

WORKBOOK_RELS = XML_HEADER + (
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    '</Relationships>'
)

STYLE_DEFAULT = 0
STYLE_TITULO = 1
STYLE_HEADER = 2
STYLE_NORMAL = 3
STYLE_VERDE = 4
STYLE_AMARELO = 5
STYLE_VERMELHO = 6
STYLE_CINZA = 7

STYLES_XML = XML_HEADER + (
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="3">'
    '<font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    '<font><b/><sz val="14"/><name val="Calibri"/></font>'
    '</fonts>'
    '<fills count="7">'
    '<fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF2F3B52"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E7C6"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3B0"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C6C6"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE3E3E3"/></patternFill></fill>'
    '</fills>'
    '<borders count="2">'
    '<border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right>'
    '<top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border>'
    '</borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="8">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '</cellXfs>'
    '</styleSheet>'
)

ESTADO_STYLE = {
    ESTADO_NORMAL: STYLE_VERDE,
    ESTADO_ATENCAO: STYLE_AMARELO,
    ESTADO_CRITICO: STYLE_VERMELHO,
    ESTADO_SEM_DADOS: STYLE_CINZA,
}


def xml_escape(s):
    s = "" if s is None else str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&apos;"))


def col_letter(idx0):
    letters = ""
    n = idx0 + 1
    while n > 0:
        n, r = divmod(n - 1, 26)
        letters = chr(65 + r) + letters
    return letters


def _cell(col, row, texto, style):
    ref = f"{col_letter(col)}{row}"
    return (f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">'
            f'{xml_escape(texto)}</t></is></c>')


def _sheet_xml(titulo, gerado_em, colunas, linhas, estado_col, larguras):
    rows_xml = []
    rows_xml.append('<row r="1">' + _cell(0, 1, titulo, STYLE_TITULO) + '</row>')
    rows_xml.append('<row r="2">' + _cell(0, 2, "Gerado em " + gerado_em, STYLE_DEFAULT) + '</row>')

    header_row = 4
    cells = [_cell(i, header_row, col, STYLE_HEADER) for i, col in enumerate(colunas)]
    rows_xml.append(f'<row r="{header_row}">' + "".join(cells) + '</row>')

    for i, linha in enumerate(linhas):
        r = header_row + 1 + i
        cells = []
        for c, valor in enumerate(linha):
            style = STYLE_NORMAL
            if estado_col is not None and c == estado_col:
                style = ESTADO_STYLE.get(valor, STYLE_NORMAL)
            cells.append(_cell(c, r, valor, style))
        rows_xml.append(f'<row r="{r}">' + "".join(cells) + '</row>')

    n_cols = len(colunas)
    lg = list(larguras or [])
    if len(lg) < n_cols:
        lg += [16] * (n_cols - len(lg))
    cols_xml = "".join(
        f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>'
        for i, w in enumerate(lg[:n_cols])
    )

    return XML_HEADER + (
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<cols>{cols_xml}</cols>'
        '<sheetData>' + "".join(rows_xml) + '</sheetData>'
        '</worksheet>'
    )


def gerar_xlsx(caminho, sheet_name, titulo, gerado_em, colunas, linhas,
               estado_col=1, larguras=None):
    workbook = XML_HEADER + (
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="' + xml_escape(sheet_name[:31]) + '" sheetId="1" r:id="rId1"/></sheets>'
        '</workbook>'
    )
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", RELS_ROOT)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        zf.writestr("xl/styles.xml", STYLES_XML)
        zf.writestr("xl/worksheets/sheet1.xml",
                     _sheet_xml(titulo, gerado_em, colunas, linhas, estado_col, larguras))
    return caminho


# ── HTML imprimivel + PDF (Edge headless) ────────────────────────────────────

ESTADO_HTML_CLASS = {
    ESTADO_NORMAL: "ok",
    ESTADO_ATENCAO: "warn",
    ESTADO_CRITICO: "crit",
    ESTADO_SEM_DADOS: "mute",
}


def html_escape(s):
    s = "" if s is None else str(s)
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def gerar_html(caminho, titulo, gerado_em, colunas, linhas, estado_col=1,
               resumo=None):
    """resumo: lista opcional de (label, valor) mostrada acima da tabela."""
    resumo_html = ""
    if resumo:
        blocos = "".join(
            f'<div class="kpi"><div class="kpi-v">{html_escape(v)}</div>'
            f'<div class="kpi-l">{html_escape(l)}</div></div>'
            for l, v in resumo
        )
        resumo_html = f'<div class="kpis">{blocos}</div>'

    thead = "".join(f"<th>{html_escape(c)}</th>" for c in colunas)
    corpo = []
    for linha in linhas:
        tds = []
        for c, valor in enumerate(linha):
            cls = ""
            if estado_col is not None and c == estado_col:
                cls = ' class="' + ESTADO_HTML_CLASS.get(valor, "") + '"'
            tds.append(f"<td{cls}>{html_escape(valor)}</td>")
        corpo.append("<tr>" + "".join(tds) + "</tr>")

    doc = f"""<!doctype html>
<html lang="pt"><head><meta charset="utf-8">
<title>{html_escape(titulo)}</title>
<style>
  body {{ font-family: Segoe UI, Calibri, Arial, sans-serif; color:#1a2233; margin:28px; }}
  h1 {{ font-size:19px; margin:0 0 2px 0; }}
  .sub {{ color:#5a6577; font-size:12px; margin-bottom:16px; }}
  .kpis {{ display:flex; gap:22px; margin:0 0 16px 0; }}
  .kpi {{ border:1px solid #d6dbe4; border-radius:8px; padding:8px 16px; text-align:center; }}
  .kpi-v {{ font-size:20px; font-weight:700; }}
  .kpi-l {{ font-size:10.5px; color:#5a6577; text-transform:uppercase; letter-spacing:.05em; }}
  table {{ border-collapse:collapse; width:100%; font-size:11.5px; }}
  th {{ background:#2F3B52; color:#fff; text-align:left; padding:6px 8px; }}
  td {{ border:1px solid #ccd2dc; padding:5px 8px; }}
  tr:nth-child(even) td {{ background:#f6f8fb; }}
  td.ok   {{ background:#C6E7C6 !important; font-weight:600; }}
  td.warn {{ background:#FFF3B0 !important; font-weight:600; }}
  td.crit {{ background:#F8C6C6 !important; font-weight:600; }}
  td.mute {{ background:#E3E3E3 !important; color:#666; }}
  @media print {{
    body {{ margin:10mm; }}
    th {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    td {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
    thead {{ display:table-header-group; }}
    tr {{ page-break-inside:avoid; }}
  }}
</style></head><body>
<h1>{html_escape(titulo)}</h1>
<div class="sub">Gerado em {html_escape(gerado_em)} · BPC-Observe</div>
{resumo_html}
<table><thead><tr>{thead}</tr></thead><tbody>
{''.join(corpo)}
</tbody></table>
</body></html>"""
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(doc)
    return caminho


def encontrar_browser():
    for c in EDGE_CANDIDATES:
        if os.path.exists(c):
            return c
    return None


def html_para_pdf(html_path, pdf_path):
    """Converte HTML->PDF com Edge/Chrome headless. Devolve pdf_path ou None."""
    browser = encontrar_browser()
    if not browser:
        print("[AVISO] Edge/Chrome nao encontrado - PDF nao gerado (HTML fica disponivel).")
        return None
    url = "file:///" + os.path.abspath(html_path).replace("\\", "/")
    cmd = [
        browser, "--headless", "--disable-gpu", "--no-pdf-header-footer",
        f"--print-to-pdf={os.path.abspath(pdf_path)}", url,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=90, check=False)
    except Exception as e:
        print(f"[AVISO] Falha ao gerar PDF ({e}) - HTML fica disponivel.")
        return None
    if os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
        return pdf_path
    print("[AVISO] Browser correu mas o PDF nao apareceu - HTML fica disponivel.")
    return None
