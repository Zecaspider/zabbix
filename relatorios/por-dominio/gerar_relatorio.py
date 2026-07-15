# -*- coding: utf-8 -*-
"""
Gera o relatorio diario de um dominio do BPC-Observe (F1 do plano de melhorias
2026-07-12), em .xlsx (modelo pds/Backbone DC) + .html imprimivel + .pdf
(Edge headless). So leitura na API Zabbix.

Uso:
    python gerar_relatorio.py --dominio bases-dados
    python gerar_relatorio.py --dominio servidores-virtuais --data 2026-07-12 --hora 08:00
    python gerar_relatorio.py --lista            # dominios disponiveis
    python gerar_relatorio.py --dominio vmware --sem-pdf

Dominios em dominios.json (validados ao vivo, ver _notas la dentro).
O relatorio de rede/backbone continua em relatorios/backbone-dc/.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, date, time as dtime

REPO_ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(REPO_ROOT, "..", "_comum"))
import relatorio_lib as lib  # noqa: E402

CONFIG_FILE = os.path.join(REPO_ROOT, "dominios.json")
SAIDA_DIR = os.path.join(REPO_ROOT, "saida")

SEVERIDADE_LIMITE_CRITICO = 4  # >= High
SEVERIDADE_LIMITE_ATENCAO = 2  # >= Warning

TREND_CHUNK = 300  # itemids por chamada trend.get


def carregar_config(nome):
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    doms = cfg["dominios"]
    if nome not in doms:
        raise SystemExit(f"Dominio '{nome}' desconhecido. Disponiveis: {', '.join(sorted(doms))}")
    return doms[nome]


def carregar_hosts(zbx, cfg):
    params = {
        "output": ["hostid", "host", "name", "status"],
        "selectTags": "extend",
        "filter": {"status": "0"},
    }
    if cfg.get("groupids"):
        params["groupids"] = cfg["groupids"]
    if cfg.get("tags"):
        params["tags"] = cfg["tags"]
        params["evaltype"] = cfg.get("evaltype_tags", 0)
    hosts = zbx.call("host.get", params)
    host_re = cfg.get("host_re")
    if host_re:
        rx = re.compile(host_re)
        hosts = [h for h in hosts if rx.search(h["name"]) or rx.search(h["host"])]
    for h in hosts:
        h["tagmap"] = {t["tag"]: t["value"] for t in h.get("tags", [])}
    hosts.sort(key=lambda h: h["name"].lower())
    return hosts


def carregar_problemas(zbx, hostids):
    """hostid -> (max_severidade, descricao_do_pior_trigger)"""
    triggers = zbx.call("trigger.get", {
        "hostids": hostids,
        "filter": {"value": 1},
        "output": ["triggerid", "priority", "description"],
        "selectHosts": ["hostid"],
        "monitored": True,
        "expandDescription": True,
    })
    por_host = {}
    for t in triggers:
        pri = int(t["priority"])
        for h in t.get("hosts", []):
            hid = h["hostid"]
            atual = por_host.get(hid)
            if atual is None or pri > atual[0]:
                por_host[hid] = (pri, t["description"])
    return por_host


def carregar_items_metrica(zbx, hostids, cfg):
    """col -> hostid -> [items]. 1 chamada item.get por chave LIKE."""
    resultado = {}
    for met in cfg.get("metricas", []):
        por_host = {}
        for key_like in met["keys_like"]:
            params = {
                "hostids": hostids,
                "search": {"key_": key_like},
                "output": ["hostid", "key_", "name", "lastvalue"],
                "filter": {"status": "0"},
            }
            if cfg.get("webitems"):
                params["webitems"] = True
                del params["filter"]  # web items nao tem status editavel
            items = zbx.call("item.get", params)
            for it in items:
                por_host.setdefault(it["hostid"], []).append(it)
            # agg "first": a 1a chave com resultados ganha; nao misturar chaves
            if met["agg"] == "first" and por_host:
                break
        resultado[met["col"]] = por_host
    return resultado


def carregar_avail_items(zbx, hostids, cfg):
    """hostid -> item de disponibilidade (1a chave preferida que existir)."""
    por_host = {}
    for key in cfg.get("avail_keys", []):
        items = zbx.call("item.get", {
            "hostids": hostids,
            "filter": {"key_": key, "status": "0"},
            "output": ["hostid", "itemid", "key_", "lastvalue"],
        })
        for it in items:
            por_host.setdefault(it["hostid"], it)
    return por_host


def trends_por_item(zbx, itemids, inicio_ts, fim_ts):
    """itemid -> lista de rows de trend (hora a hora)."""
    out = {}
    for i in range(0, len(itemids), TREND_CHUNK):
        chunk = itemids[i:i + TREND_CHUNK]
        rows = zbx.call("trend.get", {
            "itemids": chunk,
            "time_from": inicio_ts,
            "time_till": fim_ts,
            "output": ["itemid", "clock", "num", "value_avg", "value_max"],
        })
        for r in rows:
            out.setdefault(r["itemid"], []).append(r)
    return out


def disponibilidade_ping(trends, item):
    """Media do dia de um item 0/1 (icmpping/agent.ping), via trends horarios."""
    if not item:
        return None
    rows = trends.get(item["itemid"])
    if not rows:
        return None
    total_n = sum(int(r["num"]) for r in rows)
    if total_n <= 0:
        return None
    soma = sum(float(r["value_avg"]) * int(r["num"]) for r in rows)
    return soma / total_n * 100.0


def disponibilidade_web(trends, fail_items):
    """% de horas do dia sem falha em nenhum cenario (value_max==0)."""
    horas = {}
    for it in fail_items:
        for r in trends.get(it["itemid"], []):
            clock = int(r["clock"])
            ko = float(r["value_max"]) > 0
            horas[clock] = horas.get(clock, False) or ko
    if not horas:
        return None
    ok = sum(1 for ko in horas.values() if not ko)
    return ok / len(horas) * 100.0


def agg_metrica(met, items):
    """Aplica a agregacao da metrica aos items de um host. Devolve float|None."""
    valores = []
    for it in items or []:
        lv = it.get("lastvalue")
        if lv in (None, ""):
            continue
        try:
            valores.append(float(lv))
        except ValueError:
            continue
    if not valores:
        return None
    agg = met["agg"]
    if agg == "max":
        return max(valores)
    if agg == "count_pos":
        return float(sum(1 for v in valores if v > 0))
    return valores[0]  # first


def fmt_metrica(met, valor):
    if valor is None:
        return "---"
    fmt = met.get("fmt", "num")
    if fmt == "pct":
        return f"{valor:.0f}%"
    if fmt == "int":
        return f"{valor:.0f}"
    if fmt == "seg":
        return f"{valor:.2f} s"
    if fmt == "dias":
        return f"{valor / 86400:.0f} d"
    if fmt == "map":
        return met.get("map", {}).get(f"{valor:.0f}", f"{valor:.0f}")
    return f"{valor:.1f}"


def estado_do_host(avail_item, problema, tem_dados):
    if avail_item is not None and avail_item.get("lastvalue") == "0":
        return lib.ESTADO_CRITICO
    sev = problema[0] if problema else 0
    if sev >= SEVERIDADE_LIMITE_CRITICO:
        return lib.ESTADO_CRITICO
    if sev >= SEVERIDADE_LIMITE_ATENCAO:
        return lib.ESTADO_ATENCAO
    if avail_item is None and not tem_dados:
        return lib.ESTADO_SEM_DADOS
    return lib.ESTADO_NORMAL


ORDEM_ESTADO = {lib.ESTADO_CRITICO: 0, lib.ESTADO_ATENCAO: 1,
                lib.ESTADO_SEM_DADOS: 2, lib.ESTADO_NORMAL: 3}


def gerar(nome_dominio, target_dt, com_pdf=True):
    cfg = carregar_config(nome_dominio)
    zbx = lib.cliente(cfg.get("zabbix", "infra"))

    print(f"[INFO] {cfg['titulo']} @ {target_dt.isoformat(sep=' ')}")
    hosts = carregar_hosts(zbx, cfg)
    if not hosts:
        raise SystemExit("[ERRO] 0 hosts para este dominio - rever config/tags.")
    hostids = [h["hostid"] for h in hosts]
    print(f"[INFO] {len(hosts)} hosts activos")

    problemas = carregar_problemas(zbx, hostids)
    metricas_items = carregar_items_metrica(zbx, hostids, cfg)
    avail_items = carregar_avail_items(zbx, hostids, cfg)

    inicio_ts = int(datetime.combine(target_dt.date(), dtime(0, 0)).timestamp())
    fim_ts = int(target_dt.timestamp())

    # trends: pings + (web) items de fail
    trend_ids = [it["itemid"] for it in avail_items.values()]
    web_fail_por_host = {}
    if cfg.get("web_avail"):
        web_fail_por_host = metricas_items.get("CENARIOS KO", {})
        for its in web_fail_por_host.values():
            trend_ids.extend(it["itemid"] for it in its)
    trends = trends_por_item(zbx, trend_ids, inicio_ts, fim_ts) if trend_ids else {}

    colunas = ["EQUIPAMENTO", "ESTADO"]
    if cfg.get("col_motor"):
        colunas.append("MOTOR")
    if cfg.get("col_servico"):
        colunas.append("SERVICO")
    if cfg.get("col_ambiente"):
        colunas.append("AMBIENTE")
    mets = cfg.get("metricas", [])
    colunas += [m["col"] for m in mets]
    colunas += ["PROBLEMA ACTIVO", "DISP.(dia)"]

    linhas = []
    for h in hosts:
        hid = h["hostid"]
        avail = avail_items.get(hid)
        prob = problemas.get(hid)

        valores_met = []
        tem_dados = False
        for m in mets:
            v = agg_metrica(m, metricas_items.get(m["col"], {}).get(hid))
            if v is not None:
                tem_dados = True
            valores_met.append(fmt_metrica(m, v))

        estado = estado_do_host(avail, prob, tem_dados)

        if cfg.get("web_avail"):
            disp = disponibilidade_web(trends, web_fail_por_host.get(hid, []))
        else:
            disp = disponibilidade_ping(trends, avail)

        linha = [h["name"], estado]
        if cfg.get("col_motor"):
            linha.append(h["tagmap"].get("motor", "---"))
        if cfg.get("col_servico"):
            linha.append(h["tagmap"].get("servico", "---"))
        if cfg.get("col_ambiente"):
            linha.append(h["tagmap"].get("ambiente", "---"))
        linha += valores_met
        linha.append(prob[1] if prob else "---")
        linha.append(f"{disp:.1f}%" if disp is not None else "---")
        linhas.append(linha)

    linhas.sort(key=lambda l: (ORDEM_ESTADO.get(l[1], 9), l[0].lower()))

    n_crit = sum(1 for l in linhas if l[1] == lib.ESTADO_CRITICO)
    n_aten = sum(1 for l in linhas if l[1] == lib.ESTADO_ATENCAO)
    resumo = [
        ("Hosts", str(len(linhas))),
        ("Críticos", str(n_crit)),
        ("Atenção", str(n_aten)),
        ("Normais", str(len(linhas) - n_crit - n_aten)),
    ]

    os.makedirs(SAIDA_DIR, exist_ok=True)
    base = os.path.join(
        SAIDA_DIR,
        f"Relatorio_{cfg['sheet'].replace(' ', '_')}_{target_dt.date().isoformat()}_{target_dt.strftime('%H%M')}",
    )
    titulo = f"{cfg['titulo']} - {target_dt.date().isoformat()} {target_dt.strftime('%H:%M')}"
    gerado_em = target_dt.strftime("%Y-%m-%d %H:%M")

    larguras = [34, 12] + [14] * (len(colunas) - 4) + [52, 12]
    lib.gerar_xlsx(base + ".xlsx", cfg["sheet"], titulo, gerado_em, colunas, linhas,
                   estado_col=1, larguras=larguras)
    print(f"[OK] {base}.xlsx")
    lib.gerar_html(base + ".html", titulo, gerado_em, colunas, linhas,
                   estado_col=1, resumo=resumo)
    print(f"[OK] {base}.html")
    if com_pdf:
        pdf = lib.html_para_pdf(base + ".html", base + ".pdf")
        if pdf:
            print(f"[OK] {pdf}")

    print(f"[RESUMO] {len(linhas)} hosts | crit={n_crit} atencao={n_aten}")
    return base


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dominio", help="ver --lista")
    ap.add_argument("--data", default=date.today().isoformat(), help="YYYY-MM-DD (default hoje)")
    ap.add_argument("--hora", default=None, help="HH:MM (default agora)")
    ap.add_argument("--sem-pdf", action="store_true", help="gera so xlsx+html")
    ap.add_argument("--lista", action="store_true", help="lista os dominios disponiveis")
    args = ap.parse_args()

    if args.lista or not args.dominio:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            doms = json.load(f)["dominios"]
        print("Dominios disponiveis:")
        for k, v in sorted(doms.items()):
            print(f"  {k:22s} {v['titulo']}")
        print("  (rede/backbone: usar relatorios/backbone-dc/gerar_relatorio.py)")
        return 0

    data_alvo = datetime.strptime(args.data, "%Y-%m-%d").date()
    if args.hora:
        hh, mm = [int(x) for x in args.hora.split(":")]
        target_dt = datetime.combine(data_alvo, dtime(hh, mm))
    else:
        agora = datetime.now()
        target_dt = agora if agora.date() == data_alvo else datetime.combine(data_alvo, dtime(23, 59))

    gerar(args.dominio, target_dt, com_pdf=not args.sem_pdf)
    return 0


if __name__ == "__main__":
    sys.exit(main())
