r"""
push_panel.py - Actualiza ou cria paineis BPC no Grafana.

Le token de C:\Repositorios\zabbix\tok3n (linha "glsa_...").
Le UID do dashboard e mapeamento file->panelId do manifest.json.

Uso:
  python push_panel.py <dominio/nivel>            # todos os paineis do manifest
  python push_panel.py <dominio/nivel> <file.js>  # um unico painel

Paineis com id=null sao criados (gridPos provisorio, full-width empilhado).
Apos criacao, o manifest.json e actualizado com o id atribuido pelo Grafana.

ANCORA (anchor):
  A ancora padrao aponta para Storage IBM FS9500 / ICMP ping (sempre disponivel).
  Para dashboards N3 com variavel $hostid, definir no manifest.json:
    "anchor": {
      "group": {"filter": "$groupid"},
      "host":  {"filter": "$hostid"},
      "item":  {"filter": "ICMP ping"}
    }
  O script usa a ancora do manifest quando presente, caso contrario usa a padrao.
"""

import json, sys, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).parent
TOK_PATH = pathlib.Path('C:/Repositorios/zabbix/tok3n')
GRAFANA = 'http://10.10.126.22:3000'

# Ancora padrao — host sempre disponivel, nao referencia variaveis
ANCHOR_TARGET = {
    "datasource": {"type": "alexanderzobnin-zabbix-datasource", "uid": "3_KgG43nz"},
    "group": {"filter": "BPC / INFRAESTRUTURA  / STORAGE"},
    "host": {"filter": "Storage - IBM FS9500"},
    "item": {"filter": "ICMP ping"},
    "queryType": "0",
    "refId": "A",
    "resultFormat": "time_series",
}


def read_token():
    for line in TOK_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('glsa_'):
            return line
    raise RuntimeError('Token Grafana nao encontrado em tok3n')


def gapi(method, path, data=None, token=None):
    url = GRAFANA + '/api/' + path
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, method=method,
          headers={'Authorization': 'Bearer ' + token,
                   'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        raise RuntimeError(f'HTTP {e.code}: {body[:300]}') from None


def next_y(panels):
    if not panels:
        return 0
    return max(p['gridPos']['y'] + p['gridPos']['h'] for p in panels)


def next_id(panels):
    used = {p.get('id') for p in panels if p.get('id')}
    i = 100
    while i in used:
        i += 1
    return i


def push_panels(domain_level, only_file=None):
    token = read_token()
    folder = ROOT / domain_level.replace('\\', '/')
    manifest_path = folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))

    dash_uid = manifest['dashboardUid']
    resp = gapi('GET', f'dashboards/uid/{dash_uid}', token=token)
    dash = resp['dashboard']
    folder_uid = resp['meta'].get('folderUid', '')

    # Ancora: usa override do manifest se existir, caso contrario usa padrao.
    # Se o override tiver datasource proprio (ex: mysql) usa-o directamente
    # sem misturar com chaves Zabbix.
    anchor_override = manifest.get('anchor')
    if anchor_override and 'datasource' in anchor_override:
        ds_type = (anchor_override.get('datasource') or {}).get('type', '')
        if ds_type != 'alexanderzobnin-zabbix-datasource':
            # Ancora nao-Zabbix: usar tal-e-qual, sem defaults Zabbix
            anchor = dict(anchor_override)
            anchor.setdefault('refId', 'A')
        else:
            anchor = dict(ANCHOR_TARGET)
            anchor.update(anchor_override)
            anchor.setdefault('queryType', '0')
            anchor.setdefault('resultFormat', 'time_series')
    elif anchor_override:
        anchor = dict(ANCHOR_TARGET)
        anchor.update(anchor_override)
        anchor.setdefault('datasource', ANCHOR_TARGET['datasource'])
        anchor.setdefault('queryType', '0')
        anchor.setdefault('refId', 'A')
        anchor.setdefault('resultFormat', 'time_series')
    else:
        anchor = dict(ANCHOR_TARGET)

    panels = [p for p in dash.get('panels', []) if p.get('id') is not None]
    panels_by_id = {p['id']: p for p in panels}
    manifest_changed = False

    for entry in manifest.get('panels', []):
        fname = entry['file']
        if only_file and fname != only_file:
            continue

        if not fname.endswith('.js'):
            continue  # ficheiros .json sao paineis nativos — geridos por push_native.py

        js_path = folder / fname
        if not js_path.exists():
            print(f'  SKIP {fname} - ficheiro nao encontrado')
            continue

        code = js_path.read_text(encoding='utf-8-sig')
        panel_id = entry.get('id')
        role = entry.get('role', 'content')

        ds_uid = manifest.get('datasource', '3_KgG43nz')
        ds_obj = {"type": "alexanderzobnin-zabbix-datasource", "uid": ds_uid}
        is_content = role != 'utils'

        if panel_id and panel_id in panels_by_id:
            # Actualizar painel existente
            p = panels_by_id[panel_id]
            p.setdefault('options', {})['afterRender'] = code
            if entry.get('content'):
                p['options']['content'] = entry['content']
            p['targets'] = [dict(anchor)]
            p['datasource'] = ds_obj          # corrigir datasource do painel
            p['transparent'] = True           # NOC: fundo transparente
            p['title'] = ''                   # NOC: sem título (utils e conteúdo)
            print(f'  UPDATE {fname} -> painel id={panel_id} ({entry.get("title","").encode("ascii","replace").decode()})')
        else:
            # Criar painel novo (gridPos provisorio)
            y = next_y(panels)
            new_id = next_id(panels)
            new_panel = {
                'id': new_id,
                'type': 'marcusolsson-dynamictext-panel',
                'title': '',
                'gridPos': {'x': 0, 'y': y, 'w': 24, 'h': 8},
                'options': {
                    'afterRender': code,
                    'content': entry.get('content', '<div id="bpc-sf-' + fname.replace('l2-', '').replace('.js', '') + '"></div>'),
                    'renderMode': 'allRows',
                    'editors': ['afterRender'],
                },
                'targets': [dict(anchor)],
                'datasource': ds_obj,
                'transparent': True,
                'transformations': [{'id': 'reduce', 'options': {}}],
                'fieldConfig': {'defaults': {}, 'overrides': []},
            }
            panels.append(new_panel)
            print(f'  CREATE {fname} -> novo painel ({entry.get("title","")}), y={y}')

    dash['panels'] = panels
    payload = {
        'dashboard': dash,
        'folderUid': folder_uid,
        'overwrite': True,
        'message': 'push_panel.py'
    }
    result = gapi('POST', 'dashboards/db', payload, token=token)
    print(f'  => {result.get("status")} | {GRAFANA}{result.get("url","")}')

    # Reler dashboard para obter ids atribuidos a paineis novos e actualizar manifest.
    # So reconcilia entradas com id=null (paineis genuinamente novos, sem id ainda).
    # NUNCA tocar em entradas que ja tem id — o titulo esta em branco em todos os
    # paineis por convencao NOC, por isso "match por titulo" e ambiguo e corrompe
    # o manifest (varias entradas colidem no mesmo titulo ''). Match feito pelo
    # content (div id unico), unica chave fiavel disponivel.
    resp2 = gapi('GET', f'dashboards/uid/{dash_uid}', token=token)
    panels_final = resp2['dashboard'].get('panels', [])

    for entry in manifest.get('panels', []):
        if entry.get('id') is not None:
            continue
        entry_content = entry.get('content')
        if not entry_content:
            continue
        for p in panels_final:
            if (p.get('options') or {}).get('content') == entry_content:
                print(f'  manifest: {entry["file"]} -> id={p["id"]}')
                entry['id'] = p['id']
                manifest_changed = True
                break

    if manifest_changed:
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        print('  manifest.json actualizado')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    domain_level = sys.argv[1]
    only_file = sys.argv[2] if len(sys.argv) > 2 else None
    push_panels(domain_level, only_file)
