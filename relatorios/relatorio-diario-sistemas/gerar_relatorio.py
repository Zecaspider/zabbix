"""
Gera o "Relatorio Diario do Estado dos Sistemas e Servicos com Parceiros"
a partir do estado real no Zabbix, para uma data/hora/turno escolhidos.

Uso:
    python gerar_relatorio.py --data 2026-07-10 --turno A
    python gerar_relatorio.py --data 2026-07-10 --turno F --hora 17:30
    python gerar_relatorio.py                      # hoje, turno A, hora 08:00

So leitura na API Zabbix (host.get/item.get/history.get/trigger.get/event.get).
Nao escreve nada no Zabbix nem no Grafana.
"""
import argparse
import copy
import json
import os
import re
import shutil
import sys
import zipfile
from datetime import datetime, date, time as dtime

import requests

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NSMAP = {"m": NS}

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = r"C:\Repositorios\zabbix\tok3n"
TEMPLATE_XLSX = os.path.join(
    "C:\\", "Repositorios", "zabbix", "bpc-workspace",
    "RELATORIO DIARIO DO ESTADO DOS SISTEMAS E SERVIÇOS COM PARCEIROS_05-03-2026.xlsx",
)
MAPPING_FILE = os.path.join(REPO_ROOT, "mapeamento-sistemas.json")
SAIDA_DIR = os.path.join(REPO_ROOT, "saida")

ZABBIX_INFRA_URL = "http://10.10.126.22/zabbix/api_jsonrpc.php"

TURNO_HORA_DEFAULT = {"A": "08:00", "F": "17:00"}
TURNO_NOME = {"A": "Abertura", "F": "Fecho"}

# limiar de severidade Zabbix a partir do qual um problema activo, mesmo com
# o web scenario OK, desce o Estado para "Operacional Limitado" (1)
SEVERIDADE_LIMITE_DEGRADADO = 3  # 3 = Average


def ler_token_infra():
    with open(TOKEN_FILE, "r", encoding="utf-8") as f:
        linhas = [l.strip() for l in f.readlines()]
    for i, linha in enumerate(linhas):
        low = linha.lower()
        if low.startswith("zabbix") and "network" not in low and "grafana" not in low:
            for seguinte in linhas[i + 1:]:
                if seguinte:
                    return seguinte
    raise RuntimeError("Nao encontrei o token 'zabbix infra' em " + TOKEN_FILE)


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
        resp = requests.post(self.url, json=payload, headers=self.headers, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise RuntimeError(f"{method} -> {data['error']}")
        return data["result"]


def estado_do_host(zbx, app_host, target_ts):
    """Devolve (estado:int|None, observacao:str, hora_real_verificacao:datetime|None)."""
    hosts = zbx.call("host.get", {"filter": {"host": [app_host]}, "output": ["hostid", "name"]})
    if not hosts:
        return None, f"Host '{app_host}' nao encontrado no Zabbix", None
    hostid = hosts[0]["hostid"]

    fail_items = zbx.call(
        "item.get",
        {"hostids": [hostid], "webitems": True, "search": {"key_": "web.test.fail"}, "output": ["itemid", "key_"]},
    )
    if not fail_items:
        return None, f"Host '{app_host}' sem web scenario configurado", None

    l1_falhou = False
    outro_falhou = False
    hora_verificacao = None
    for item in fail_items:
        hist = zbx.call(
            "history.get",
            {
                "itemids": [item["itemid"]],
                "history": 3,
                "time_till": target_ts,
                "sortfield": "clock",
                "sortorder": "DESC",
                "limit": 1,
                "output": "extend",
            },
        )
        if not hist:
            continue
        valor = int(hist[0]["value"])
        clock = int(hist[0]["clock"])
        eh_l1 = "l1" in item["key_"].lower()
        if valor > 0:
            if eh_l1:
                l1_falhou = True
            else:
                outro_falhou = True
        if hora_verificacao is None or clock > hora_verificacao:
            hora_verificacao = clock

    if hora_verificacao is None:
        return None, f"Host '{app_host}' sem historico de monitorizacao ate esta hora", None

    hora_dt = datetime.fromtimestamp(hora_verificacao)

    if l1_falhou:
        erro = ultimo_erro_scenario(zbx, hostid, target_ts)
        return 0, erro or "Site indisponivel (L1-Disponibilidade a falhar)", hora_dt

    if outro_falhou:
        erro = ultimo_erro_scenario(zbx, hostid, target_ts)
        return 1, erro or "Disponivel mas com scenario degradado (Performance/Conteudo/Auth)", hora_dt

    severidade, nome_problema = problema_activo(zbx, hostid, target_ts)
    if severidade is not None and severidade >= SEVERIDADE_LIMITE_DEGRADADO:
        return 1, nome_problema, hora_dt

    return 2, "", hora_dt


def ultimo_erro_scenario(zbx, hostid, target_ts):
    items = zbx.call(
        "item.get",
        {"hostids": [hostid], "webitems": True, "search": {"key_": "web.test.error"}, "output": ["itemid"]},
    )
    for item in items:
        hist = zbx.call(
            "history.get",
            {
                "itemids": [item["itemid"]],
                "history": 1,
                "time_till": target_ts,
                "sortfield": "clock",
                "sortorder": "DESC",
                "limit": 1,
                "output": "extend",
            },
        )
        if hist and hist[0]["value"]:
            return hist[0]["value"]
    return None


def problema_activo(zbx, hostid, target_ts):
    """Maior severidade entre triggers cujo ultimo evento <= target_ts ainda estava em PROBLEM."""
    triggers = zbx.call("trigger.get", {"hostids": [hostid], "output": ["triggerid", "description"]})
    if not triggers:
        return None, None
    triggerids = [t["triggerid"] for t in triggers]
    desc_by_id = {t["triggerid"]: t["description"] for t in triggers}

    events = zbx.call(
        "event.get",
        {
            "objectids": triggerids,
            "time_till": target_ts,
            "output": ["eventid", "clock", "value", "severity", "objectid"],
            "sortfield": ["clock"],
            "sortorder": "DESC",
            "limit": 500,
        },
    )
    ultimo_por_trigger = {}
    for ev in events:
        oid = ev["objectid"]
        if oid not in ultimo_por_trigger:
            ultimo_por_trigger[oid] = ev

    pior_sev = None
    pior_nome = None
    for oid, ev in ultimo_por_trigger.items():
        if int(ev["value"]) == 1:  # ainda em PROBLEM nesse instante
            sev = int(ev["severity"])
            if pior_sev is None or sev > pior_sev:
                pior_sev = sev
                pior_nome = desc_by_id.get(oid, "")
    return pior_sev, pior_nome


def carregar_mapeamento():
    with open(MAPPING_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def calcular_linhas(zbx, mapeamento, target_ts):
    resultado = {"sistemas_aplicacoes": [], "servicos_parceiros": []}
    for grupo in ("sistemas_aplicacoes", "servicos_parceiros"):
        for row in mapeamento[grupo]:
            app_host = row.get("app_host")
            if not app_host:
                resultado[grupo].append(
                    {"estado": None, "observacao": row.get("motivo_bloqueio") or "Sem monitoria automatizada", "hora": None}
                )
                continue
            estado, obs, hora_dt = estado_do_host(zbx, app_host, target_ts)
            ressalva = row.get("ressalva")
            if ressalva and obs:
                obs = f"{obs} | {ressalva}"
            elif ressalva:
                obs = ressalva
            resultado[grupo].append({"estado": estado, "observacao": obs, "hora": hora_dt})
    return resultado


# ---------------------------------------------------------------------------
# Escrita no template XLSX (preserva formatacao/graficos originais)
# ---------------------------------------------------------------------------

def excel_time_fraction(dt):
    seconds = dt.hour * 3600 + dt.minute * 60 + dt.second
    return seconds / 86400.0


def excel_date_serial(d):
    epoch = date(1899, 12, 30)
    return (d - epoch).days


def set_cell_numeric(row_el, col, value):
    cell = row_el.find(f"{{{NS}}}c[@r='{col}{row_el.get('r')}']")
    if cell is None:
        return
    for child in list(cell):
        cell.remove(child)
    if "t" in cell.attrib:
        del cell.attrib["t"]
    if value is None:
        return
    v = cell.makeelement(f"{{{NS}}}v", {})
    v.text = repr(round(float(value), 10))
    cell.append(v)


def set_cell_text(row_el, col, text):
    cell = row_el.find(f"{{{NS}}}c[@r='{col}{row_el.get('r')}']")
    if cell is None:
        return
    for child in list(cell):
        cell.remove(child)
    cell.set("t", "inlineStr")
    is_el = cell.makeelement(f"{{{NS}}}is", {})
    t_el = cell.makeelement(f"{{{NS}}}t", {})
    t_el.text = text or ""
    t_el.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    is_el.append(t_el)
    cell.append(is_el)


def gerar_xlsx(mapeamento, calculado, data_alvo, turno):
    import xml.etree.ElementTree as ET

    ET.register_namespace("", NS)
    os.makedirs(SAIDA_DIR, exist_ok=True)
    nome_saida = os.path.join(
        SAIDA_DIR, f"Relatorio_Diario_Sistemas_{data_alvo.isoformat()}_{turno}.xlsx"
    )
    shutil.copy(TEMPLATE_XLSX, nome_saida)

    tmp_extract = nome_saida + ".tmp"
    with zipfile.ZipFile(nome_saida, "r") as zin:
        zin.extractall(tmp_extract)

    sheet1_path = os.path.join(tmp_extract, "xl", "worksheets", "sheet1.xml")
    tree = ET.parse(sheet1_path)
    root = tree.getroot()
    sheetdata = root.find(f"{{{NS}}}sheetData")
    rows_by_num = {int(r.get("r")): r for r in sheetdata.findall(f"{{{NS}}}row")}

    if 7 in rows_by_num:
        set_cell_numeric(rows_by_num[7], "D", excel_date_serial(data_alvo))

    linha_inicial_sistemas = 11
    for idx, calc in enumerate(calculado["sistemas_aplicacoes"]):
        r = linha_inicial_sistemas + idx
        if r not in rows_by_num:
            continue
        row_el = rows_by_num[r]
        set_cell_numeric(row_el, "D", excel_time_fraction(calc["hora"]) if calc["hora"] else None)
        set_cell_numeric(row_el, "E", calc["estado"])
        set_cell_text(row_el, "F", calc["observacao"])

    linha_inicial_parceiros = 47
    for idx, calc in enumerate(calculado["servicos_parceiros"]):
        r = linha_inicial_parceiros + idx
        if r not in rows_by_num:
            continue
        row_el = rows_by_num[r]
        set_cell_numeric(row_el, "C", excel_time_fraction(calc["hora"]) if calc["hora"] else None)
        set_cell_numeric(row_el, "E", calc["estado"])
        set_cell_text(row_el, "F", calc["observacao"])

    tree.write(sheet1_path, xml_declaration=True, encoding="UTF-8", default_namespace=None)

    novo_zip = nome_saida + ".new"
    with zipfile.ZipFile(novo_zip, "w", zipfile.ZIP_DEFLATED) as zout:
        for base, _, files in os.walk(tmp_extract):
            for fname in files:
                full = os.path.join(base, fname)
                arcname = os.path.relpath(full, tmp_extract)
                zout.write(full, arcname)
    shutil.rmtree(tmp_extract)
    os.replace(novo_zip, nome_saida)
    return nome_saida


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=date.today().isoformat(), help="YYYY-MM-DD (default: hoje)")
    ap.add_argument("--turno", choices=["A", "F"], default="A", help="A=Abertura, F=Fecho")
    ap.add_argument("--hora", default=None, help="HH:MM (default: 08:00 para A, 17:00 para F)")
    args = ap.parse_args()

    data_alvo = datetime.strptime(args.data, "%Y-%m-%d").date()
    hora_str = args.hora or TURNO_HORA_DEFAULT[args.turno]
    hh, mm = [int(x) for x in hora_str.split(":")]
    target_dt = datetime.combine(data_alvo, dtime(hh, mm))
    target_ts = int(target_dt.timestamp())

    print(f"[INFO] Gerando relatorio para {data_alvo.isoformat()} - Turno {TURNO_NOME[args.turno]} ({hora_str})")

    token = ler_token_infra()
    zbx = ZabbixClient(ZABBIX_INFRA_URL, token)

    mapeamento = carregar_mapeamento()
    calculado = calcular_linhas(zbx, mapeamento, target_ts)

    caminho = gerar_xlsx(mapeamento, calculado, data_alvo, args.turno)
    print(f"[OK] Relatorio gerado: {caminho}")

    total = len(calculado["sistemas_aplicacoes"]) + len(calculado["servicos_parceiros"])
    sem_monitoria = sum(
        1 for grupo in calculado.values() for c in grupo if c["estado"] is None
    )
    print(f"[INFO] {total} linhas, {sem_monitoria} sem monitoria automatizada (preenchidas com o motivo)")


if __name__ == "__main__":
    sys.exit(main())
