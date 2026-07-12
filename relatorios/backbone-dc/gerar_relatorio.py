"""
Gera o relatorio diario do Backbone (Borda DC + DC Fabric) - 12 equipamentos
reais (5 routers HG_DC_ROUTERS + 7 switches HG_DC_SWITCHES) a partir do
estado real no Zabbix Network, para uma data/hora escolhidas.

Uso:
    python gerar_relatorio.py --data 2026-07-12 --hora 08:00
    python gerar_relatorio.py                      # hoje, agora

So leitura na API Zabbix Network (host.get/item.get/problem.get/history.get).
Nao escreve nada no Zabbix nem no Grafana.

Design (aprovado 2026-07-12): coluna UTIL% em vez de DOWNLOAD/UPLOAD em bps
brutos - evita ter de escolher "a" interface de cada equipamento (routers
tem varios circuitos concorrentes, switches tem dezenas de portos de acesso
que nao sao backbone). E' sempre "pior circuito/uplink de backbone", nao a
soma de tudo:
  - Routers: pior circuito externo real (filtro de interface reaproveitado
    do dashboard 04-rede/04.2-borda-dc/03-n3-bdc-provedores, ja validado em
    producao desde 2026-07-01 - exclui gestao/voz/loopback/membros fisicos
    de port-channel).
  - Switches: pior uplink fisico de fabric (spine->leaf), nao os portos de
    acesso a servidores/storage de cada leaf (dominio diferente, fora de
    escopo deste relatorio de backbone).
"""
import argparse
import os
import re
import sys
import zipfile
from datetime import datetime, date, time as dtime

import requests

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
SAIDA_DIR = os.path.join(REPO_ROOT, "saida")

ZABBIX_NETWORK_URL = "http://10.10.233.140/zabbix/api_jsonrpc.php"
GROUP_ROUTERS = "27"   # HG_DC_ROUTERS
GROUP_SWITCHES = "26"  # HG_DC_SWITCHES

SEVERIDADE_LIMITE_CRITICO = 4  # >= High = X
SEVERIDADE_LIMITE_ATENCAO = 2  # >= Warning = !

FUNC_LABELS = {
    "wan-internet": "Router - WAN Internet",
    "wan-parceiro": "Router - WAN Parceiro",
    "gateway": "Router - Governo",
    "wan-agencias": "Router - Hub DMVPN Agencias",
    "switch-spine": "Switch - Spine",
    "switch-leaf": "Switch - Leaf",
}

# Filtro de circuito externo real nos routers - portado 1:1 do CFG_PROV em
# 04-rede/04.2-borda-dc/03-n3-bdc-provedores/l3-bdc-provedores-cards.js
ROUTER_EXCLUDE_IF_RE = re.compile(
    r"^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|"
    r"Ethernet[0-9]/[0-9]/[0-9]+$|Te[0-9]/[0-9]/[0-9]+$|Gi0/0/[0-9]$|"
    r"Gi0/0/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)",
    re.IGNORECASE,
)
ROUTER_EXCLUDE_DESC_RE = re.compile(
    r"^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|"
    r"Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)",
    re.IGNORECASE,
)

# Uplinks de fabric nos switches - nomes inequivocos confirmados por auditoria
# ao vivo em 2026-07-12 (item.get real, nao assumido)
SPINE_UPLINK_DESC_RE = re.compile(r"^LEAF-\d+\s+UNDERLAY$", re.IGNORECASE)
LEAF_UPLINK_DESC_RE = re.compile(r"^LINK TO SPINE-\d+$", re.IGNORECASE)

IF_NAME_RE = re.compile(r"^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?")

# CPU/RAM: mesmo padrao de nome de item nos 5 routers e nos 7 switches
# (confirmado por auditoria ao vivo 2026-07-12). "reserve Processor" so
# existe no WAN-INT (segundo pool de memoria) - excluido de propósito.
CPU_NAME_RE = re.compile(r"^#\d+: CPU utilization$")
RAM_NAME = "Processor: Memory utilization"

# Temperatura: so existe nos 7 switches - os routers Cisco IOS (ISR4451-X/
# C8500) so tem o item de discovery "SNMP walk temperature sensors", sem
# valor real (confirmado ao vivo, lastvalue vazio nos 5). Nos switches, o
# sensor "quente" que dispara o trigger critico muda de nome por modelo de
# hardware (Homewood/SUN1/Bigsky) - por isso o pior valor entre os 4
# sensores de chassis (FRONT/BACK/CPU/<codinome>), nunca um nome fixo.
SWITCH_TEMP_RE = re.compile(r"^module-\d+ \w+: Temperature$")


def ler_token_network():
    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        linhas = [l.strip() for l in f.readlines()]
    for i, linha in enumerate(linhas):
        if linha.lower().startswith("zabbix de network") and "network2" not in linha.lower():
            for seguinte in linhas[i + 1:]:
                if seguinte:
                    return seguinte
    raise RuntimeError("Nao encontrei o token 'zabbix de network' em " + TOKEN_FILE)


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
        resp = requests.post(self.url, json=payload, headers=self.headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"{method} -> {data['error']}")
        return data["result"]


def parse_if_name(item_name):
    m = IF_NAME_RE.match(item_name or "")
    if not m:
        return None
    ifname = m.group(1).strip()
    desc = (m.group(2) or "").strip().strip("*").strip()
    return ifname, desc


def carregar_hosts(zbx):
    hosts = zbx.call("host.get", {
        "groupids": [GROUP_ROUTERS, GROUP_SWITCHES],
        "output": ["hostid", "host", "name"],
        "selectTags": "extend",
    })
    result = []
    for h in hosts:
        tags = {t["tag"]: t["value"] for t in h.get("tags", [])}
        funcao = tags.get("funcao", "")
        tipo = tags.get("tipo", "")
        label = FUNC_LABELS.get(funcao, funcao or "?")
        if funcao == "wan-parceiro" and tags.get("parceiro"):
            label = f"Router - WAN Parceiro ({tags['parceiro']})"
        result.append({
            "hostid": h["hostid"],
            "host": h["host"],
            "tipo": tipo,
            "funcao": funcao,
            "funcao_label": label,
        })
    ordem = {"wan-internet": 0, "wan-parceiro": 1, "gateway": 2, "wan-agencias": 3,
             "switch-spine": 5, "switch-leaf": 6}
    result.sort(key=lambda r: (ordem.get(r["funcao"], 9), r["host"]))
    return result


def carregar_items(zbx, hostids):
    return zbx.call("item.get", {
        "hostids": hostids,
        "output": ["hostid", "name", "key_", "value_type", "lastvalue", "itemid"],
        "filter": {"status": "0"},
    })


def classificar_items(items):
    """Devolve dict hostid -> { 'icmpping':..., 'icmppingsec':..., 'cpu':..., 'ram':...,
    'temps': [...], 'interfaces': {ifname: {...}} }"""
    por_host = {}
    for it in items:
        hid = it["hostid"]
        h = por_host.setdefault(hid, {
            "icmpping": None, "icmppingsec": None, "cpu": None, "ram": None,
            "temps": [], "interfaces": {},
        })
        key = it["key_"]
        name = it["name"]
        if key == "icmpping":
            h["icmpping"] = it
        elif key == "icmppingsec":
            h["icmppingsec"] = it
        elif CPU_NAME_RE.match(name):
            h["cpu"] = it
        elif name == RAM_NAME:
            h["ram"] = it
        elif SWITCH_TEMP_RE.match(name):
            h["temps"].append(it)
        elif key.startswith("net.if.in["):
            parsed = parse_if_name(name)
            if parsed:
                ifname, desc = parsed
                iface = h["interfaces"].setdefault(ifname, {"desc": desc})
                iface["in"] = it
        elif key.startswith("net.if.out["):
            parsed = parse_if_name(name)
            if parsed:
                ifname, desc = parsed
                iface = h["interfaces"].setdefault(ifname, {"desc": desc})
                iface["out"] = it
        elif key.startswith("net.if.speed["):
            parsed = parse_if_name(name)
            if parsed:
                ifname, desc = parsed
                iface = h["interfaces"].setdefault(ifname, {"desc": desc})
                iface["speed"] = it
    return por_host


def util_pior_circuito_router(interfaces):
    """Devolve (pior_pct, pior_nome, bps_in, bps_out) do circuito externo mais
    carregado. bps_in/bps_out sao os do MESMO circuito (nao a soma de todos)
    - e' o unico caso em que DOWNLOAD/UPLOAD faz sentido como numero unico."""
    pior = None
    pior_nome = None
    bps_in = None
    bps_out = None
    for ifname, dados in interfaces.items():
        if ROUTER_EXCLUDE_IF_RE.match(ifname):
            continue
        desc = dados.get("desc", "")
        if desc and ROUTER_EXCLUDE_DESC_RE.match(desc):
            continue
        pct = calc_utilizacao(dados)
        if pct is not None and (pior is None or pct > pior):
            pior = pct
            pior_nome = ifname + (f" ({desc})" if desc else "")
            bps_in = float(dados["in"]["lastvalue"])
            bps_out = float(dados["out"]["lastvalue"])
    return pior, pior_nome, bps_in, bps_out


def util_pior_uplink_switch(interfaces, is_spine):
    padrao = SPINE_UPLINK_DESC_RE if is_spine else LEAF_UPLINK_DESC_RE
    pior = None
    pior_nome = None
    for ifname, dados in interfaces.items():
        desc = dados.get("desc", "")
        if not padrao.match(desc):
            continue
        pct = calc_utilizacao(dados)
        if pct is not None and (pior is None or pct > pior):
            pior = pct
            pior_nome = ifname + (f" ({desc})" if desc else "")
    return pior, pior_nome


def calc_utilizacao(dados):
    try:
        bps_in = float(dados["in"]["lastvalue"])
        bps_out = float(dados["out"]["lastvalue"])
        speed = float(dados["speed"]["lastvalue"])
    except (KeyError, TypeError, ValueError):
        return None
    if speed <= 0:
        return None
    return max(bps_in, bps_out) / speed * 100.0


# "IP SLA ... is not OK" - sonda morta confirmada (Z.13, ~7 meses sem dados
# reais), ja excluida do effDown do provedor ITA no dashboard de provedores
# (03-n3-bdc-provedores). Mesma exclusao aqui - nao reflecte o estado real
# do circuito, so o net.if.status/icmpping conta como fonte de verdade.
TRIGGER_EXCLUDE_RE = re.compile(r"IP SLA .* is not OK", re.IGNORECASE)


def carregar_problemas(zbx, hostids):
    triggers = zbx.call("trigger.get", {
        "hostids": hostids,
        "filter": {"value": 1},
        "output": ["triggerid", "priority", "description"],
        "selectHosts": ["hostid"],
        "monitored": True,
    })
    por_host = {}
    for t in triggers:
        if TRIGGER_EXCLUDE_RE.search(t["description"] or ""):
            continue
        for h in t.get("hosts", []):
            por_host.setdefault(h["hostid"], []).append(int(t["priority"]))
    return por_host


def calcular_disponibilidade(zbx, hostid, icmpping_item, inicio_ts, fim_ts):
    if not icmpping_item:
        return None
    hist = zbx.call("history.get", {
        "itemids": [icmpping_item["itemid"]],
        "history": 3,
        "time_from": inicio_ts,
        "time_till": fim_ts,
        "output": "extend",
    })
    if not hist:
        return None
    valores = [float(v["value"]) for v in hist]
    return sum(valores) / len(valores) * 100.0


ESTADO_NORMAL = "Normal"
ESTADO_ATENCAO = "Atenção"
ESTADO_CRITICO = "Crítico"


def estado_simbolo(icmpping_item, severidades):
    if icmpping_item is not None and icmpping_item.get("lastvalue") == "0":
        return ESTADO_CRITICO
    max_sev = max(severidades) if severidades else 0
    if max_sev >= SEVERIDADE_LIMITE_CRITICO:
        return ESTADO_CRITICO
    if max_sev >= SEVERIDADE_LIMITE_ATENCAO:
        return ESTADO_ATENCAO
    return ESTADO_NORMAL


def calcular_linhas(zbx, target_dt):
    hosts = carregar_hosts(zbx)
    hostids = [h["hostid"] for h in hosts]

    items = carregar_items(zbx, hostids)
    por_host_items = classificar_items(items)
    problemas = carregar_problemas(zbx, hostids)

    inicio_dia = datetime.combine(target_dt.date(), dtime(0, 0))
    inicio_ts = int(inicio_dia.timestamp())
    fim_ts = int(target_dt.timestamp())

    linhas = []
    for h in hosts:
        dados = por_host_items.get(h["hostid"], {
            "icmpping": None, "icmppingsec": None, "cpu": None, "ram": None,
            "temps": [], "interfaces": {},
        })
        icmpping = dados["icmpping"]
        icmppingsec = dados["icmppingsec"]
        interfaces = dados["interfaces"]

        is_switch = h["tipo"] == "switch"
        bps_in = bps_out = None
        if is_switch:
            util_pct, util_nome = util_pior_uplink_switch(interfaces, h["funcao"] == "switch-spine")
        else:
            util_pct, util_nome, bps_in, bps_out = util_pior_circuito_router(interfaces)

        sev = problemas.get(h["hostid"], [])
        estado = estado_simbolo(icmpping, sev)

        lat_ms = None
        if icmppingsec and icmppingsec.get("lastvalue") not in (None, ""):
            try:
                lat_ms = float(icmppingsec["lastvalue"]) * 1000.0
            except ValueError:
                lat_ms = None

        cpu_pct = None
        if dados["cpu"] and dados["cpu"].get("lastvalue") not in (None, ""):
            try:
                cpu_pct = float(dados["cpu"]["lastvalue"])
            except ValueError:
                cpu_pct = None

        ram_pct = None
        if dados["ram"] and dados["ram"].get("lastvalue") not in (None, ""):
            try:
                ram_pct = float(dados["ram"]["lastvalue"])
            except ValueError:
                ram_pct = None

        temp_c = None
        temps_validos = [
            float(t["lastvalue"]) for t in dados["temps"]
            if t.get("lastvalue") not in (None, "")
        ]
        if temps_validos:
            temp_c = max(temps_validos)

        disp_pct = calcular_disponibilidade(zbx, h["hostid"], icmpping, inicio_ts, fim_ts)

        linhas.append({
            "equipamento": h["host"],
            "estado": estado,
            "funcao": h["funcao_label"],
            "lat_ms": lat_ms,
            "cpu_pct": cpu_pct,
            "ram_pct": ram_pct,
            "temp_c": temp_c,
            "util_pct": util_pct,
            "download_bps": bps_in,
            "upload_bps": bps_out,
            "util_interface": util_nome,
            "disp_pct": disp_pct,
        })

    return linhas


# ─────────────────────────────────────────────────────────────────────────
# Escrita do .xlsx (sem openpyxl - indisponivel neste ambiente, pip com
# crash nativo (0xC0000005) tanto em Git Bash como em PowerShell, causa por
# investigar separadamente; escrita directa do pacote OOXML, mesmo principio
# do gerar_relatorio.py de sistemas, que ja manipula xlsx via zipfile+XML)
# ─────────────────────────────────────────────────────────────────────────

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


def build_workbook_xml(sheet_name):
    return XML_HEADER + (
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="' + xml_escape(sheet_name) + '" sheetId="1" r:id="rId1"/></sheets>'
        '</workbook>'
    )


# indices de estilo usados no sheet1
STYLE_DEFAULT = 0
STYLE_TITULO = 1
STYLE_HEADER = 2
STYLE_NORMAL = 3
STYLE_VERDE = 4
STYLE_AMARELO = 5

STYLES_XML = XML_HEADER + (
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="3">'
    '<font><sz val="11"/><name val="Calibri"/></font>'
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>'
    '<font><b/><sz val="14"/><name val="Calibri"/></font>'
    '</fonts>'
    '<fills count="6">'
    '<fill><patternFill patternType="none"/></fill>'
    '<fill><patternFill patternType="gray125"/></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FF2F3B52"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E7C6"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF3B0"/></patternFill></fill>'
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8C6C6"/></patternFill></fill>'
    '</fills>'
    '<borders count="2">'
    '<border><left/><right/><top/><bottom/><diagonal/></border>'
    '<border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right>'
    '<top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border>'
    '</borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="7">'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>'
    '</cellXfs>'
    '</styleSheet>'
)
STYLE_VERMELHO = 6


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


def cell_inline_str(col, row, texto, style):
    ref = f"{col_letter(col)}{row}"
    return (f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">'
            f'{xml_escape(texto)}</t></is></c>')


def build_sheet_xml(titulo, gerado_em, colunas, linhas):
    rows_xml = []

    rows_xml.append('<row r="1">' + cell_inline_str(0, 1, titulo, STYLE_TITULO) + '</row>')
    rows_xml.append('<row r="2">' + cell_inline_str(0, 2, "Gerado em " + gerado_em, STYLE_DEFAULT) + '</row>')

    header_row = 4
    cells = [cell_inline_str(i, header_row, col, STYLE_HEADER) for i, col in enumerate(colunas)]
    rows_xml.append(f'<row r="{header_row}">' + "".join(cells) + '</row>')

    estado_style = {ESTADO_NORMAL: STYLE_VERDE, ESTADO_ATENCAO: STYLE_AMARELO, ESTADO_CRITICO: STYLE_VERMELHO}

    for i, linha in enumerate(linhas):
        r = header_row + 1 + i
        cells = []
        for c, valor in enumerate(linha):
            style = STYLE_NORMAL
            if c == 1:  # coluna ESTADO
                style = estado_style.get(valor, STYLE_NORMAL)
            cells.append(cell_inline_str(c, r, valor, style))
        rows_xml.append(f'<row r="{r}">' + "".join(cells) + '</row>')

    n_cols = len(colunas)
    larguras = [22, 12, 32, 12, 8, 8, 10, 10, 14, 14, 36, 12]
    cols_xml = "".join(
        f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>'
        for i, w in enumerate(larguras[:n_cols] + [16] * max(0, n_cols - len(larguras)))
    )

    return XML_HEADER + (
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<cols>{cols_xml}</cols>'
        '<sheetData>' + "".join(rows_xml) + '</sheetData>'
        '</worksheet>'
    )


def gerar_xlsx(titulo, gerado_em, colunas, linhas_valores, caminho):
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", RELS_ROOT)
        zf.writestr("xl/workbook.xml", build_workbook_xml("Backbone DC"))
        zf.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        zf.writestr("xl/styles.xml", STYLES_XML)
        zf.writestr("xl/worksheets/sheet1.xml", build_sheet_xml(titulo, gerado_em, colunas, linhas_valores))
    return caminho


def fmt_mbps(bps):
    if bps is None:
        return "---"
    return f"{bps / 1_000_000:.2f} Mbps"


def formatar_linhas_para_excel(linhas):
    out = []
    for l in linhas:
        lat = f"{l['lat_ms']:.2f} ms" if l["lat_ms"] is not None else "---"
        cpu = f"{l['cpu_pct']:.0f}%" if l["cpu_pct"] is not None else "---"
        ram = f"{l['ram_pct']:.0f}%" if l["ram_pct"] is not None else "---"
        temp = f"{l['temp_c']:.0f}°C" if l["temp_c"] is not None else "---"
        util = f"{l['util_pct']:.1f}%" if l["util_pct"] is not None else "---"
        download = fmt_mbps(l["download_bps"])
        upload = fmt_mbps(l["upload_bps"])
        disp = f"{l['disp_pct']:.1f}%" if l["disp_pct"] is not None else "---"
        out.append([
            l["equipamento"],
            l["estado"],
            l["funcao"],
            lat,
            cpu,
            ram,
            temp,
            util,
            download,
            upload,
            l["util_interface"] or "---",
            disp,
        ])
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=date.today().isoformat(), help="YYYY-MM-DD (default: hoje)")
    ap.add_argument("--hora", default=None, help="HH:MM (default: agora)")
    args = ap.parse_args()

    data_alvo = datetime.strptime(args.data, "%Y-%m-%d").date()
    if args.hora:
        hh, mm = [int(x) for x in args.hora.split(":")]
        target_dt = datetime.combine(data_alvo, dtime(hh, mm))
    else:
        agora = datetime.now()
        target_dt = agora if agora.date() == data_alvo else datetime.combine(data_alvo, dtime(23, 59))

    print(f"[INFO] Gerando relatorio Backbone DC para {target_dt.isoformat(sep=' ')}")

    token = ler_token_network()
    zbx = ZabbixClient(ZABBIX_NETWORK_URL, token)

    linhas = calcular_linhas(zbx, target_dt)

    colunas = ["EQUIPAMENTO", "ESTADO", "FUNCAO", "LAT.ICMP", "CPU%", "RAM%", "TEMP",
               "UTIL%", "DOWNLOAD", "UPLOAD", "PIOR CIRCUITO/UPLINK", "DISP.(dia)"]
    valores = formatar_linhas_para_excel(linhas)

    os.makedirs(SAIDA_DIR, exist_ok=True)
    nome_saida = os.path.join(
        SAIDA_DIR,
        f"Relatorio_Backbone_DC_{data_alvo.isoformat()}_{target_dt.strftime('%H%M')}.xlsx",
    )
    titulo = f"Backbone (Borda DC + DC Fabric) - {data_alvo.isoformat()} {target_dt.strftime('%H:%M')}"
    gerar_xlsx(titulo, target_dt.isoformat(sep=" "), colunas, valores, nome_saida)

    print(f"[OK] Relatorio gerado: {nome_saida}")
    for l in linhas:
        lat_txt = f"{l['lat_ms']:.2f}ms" if l["lat_ms"] is not None else "---"
        util_txt = f"{l['util_pct']:.1f}%" if l["util_pct"] is not None else "---"
        disp_txt = f"{l['disp_pct']:.1f}%" if l["disp_pct"] is not None else "---"
        print(f"  {l['estado']:8s}  {l['equipamento']:20s} {l['funcao']:35s} "
              f"lat={lat_txt:10s} util={util_txt:8s} disp={disp_txt:8s}")


if __name__ == "__main__":
    sys.exit(main())
