r"""
push_native.py - Adiciona ou actualiza paineis Grafana nativos (timeseries, stat…)
definidos como .json no manifest.json.

Le token de C:\Repositorios\zabbix\tok3n.
Entradas do manifest com ficheiro a terminar em .json sao tratadas como paineis nativos.

Uso:
  python push_native.py <dominio/nivel>            # todos os paineis .json do manifest
  python push_native.py <dominio/nivel> <file.json> # um unico painel

O script faz match por titulo (entry["title"]) para decidir update vs create.
Apos criacao, o manifest.json e actualizado com o id atribuido pelo Grafana.
"""

import json, sys, pathlib, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).parent
TOK_PATH = pathlib.Path('C:/Repositorios/zabbix/tok3n')
GRAFANA = 'http://10.10.126.22:3000'


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
    i = 200  # native panels comecam em 200 para nao colidir com BT (100+)
    while i in used:
        i += 1
    return i


def push_native(domain_level, only_file=None):
    token = read_token()
    folder = ROOT / domain_level.replace('\\', '/')
    manifest_path = folder / 'manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))

    dash_uid = manifest['dashboardUid']
    resp = gapi('GET', f'dashboards/uid/{dash_uid}', token=token)
    dash = resp['dashboard']
    folder_uid = resp['meta'].get('folderUid', '')

    panels = list(dash.get('panels', []))
    panels_by_id    = {p['id']: p for p in panels if p.get('id') is not None}
    panels_by_title = {p.get('title', ''): p for p in panels}

    manifest_changed = False

    for entry in manifest.get('panels', []):
        fname = entry['file']
        if not fname.endswith('.json'):
            continue
        if only_file and fname != only_file:
            continue

        json_path = folder / fname
        if not json_path.exists():
            print(f'  SKIP {fname} - ficheiro nao encontrado')
            continue

        panel_def = json.loads(json_path.read_text(encoding='utf-8'))
        title     = entry.get('title') or panel_def.get('title', fname)
        panel_id  = entry.get('id')

        if panel_id and panel_id in panels_by_id:
            # Actualizar painel existente — preservar gridPos, substituir resto
            existing = panels_by_id[panel_id]
            grid_pos = existing['gridPos']
            panel_def.update({'id': panel_id, 'gridPos': grid_pos, 'title': title})
            idx = panels.index(existing)
            panels[idx] = panel_def
            print(f'  UPDATE {fname} -> painel id={panel_id} ({title})')

        elif title and title in panels_by_title:
            # Match por titulo (painel ja existe mas manifest nao tem id)
            existing = panels_by_title[title]
            pid = existing['id']
            grid_pos = existing['gridPos']
            panel_def.update({'id': pid, 'gridPos': grid_pos, 'title': title})
            idx = panels.index(existing)
            panels[idx] = panel_def
            entry['id'] = pid
            manifest_changed = True
            print(f'  UPDATE (by title) {fname} -> painel id={pid} ({title})')

        else:
            # Criar painel novo
            y      = next_y(panels)
            new_id = next_id(panels)
            panel_def.update({
                'id':      new_id,
                'title':   title,
                'gridPos': {'x': 0, 'y': y, 'w': 24, 'h': 8},
            })
            panels.append(panel_def)
            print(f'  CREATE {fname} -> novo painel id={new_id} ({title}), y={y}')

    dash['panels'] = panels
    payload = {
        'dashboard': dash,
        'folderUid': folder_uid,
        'overwrite': True,
        'message': 'push_native.py'
    }
    result = gapi('POST', 'dashboards/db', payload, token=token)
    print(f'  => {result.get("status")} | {GRAFANA}{result.get("url","")}')

    # Reler dashboard e actualizar ids no manifest
    resp2 = gapi('GET', f'dashboards/uid/{dash_uid}', token=token)
    panels_final = resp2['dashboard'].get('panels', [])
    panels_final_by_title = {p.get('title', ''): p for p in panels_final}

    for entry in manifest.get('panels', []):
        if not entry['file'].endswith('.json'):
            continue
        if entry.get('id'):
            continue  # id ja resolvido (branch id/title do loop principal) — nao precisa de re-match.
                      # Critico: nao remover este guard — sem ele, 2+ paineis com o mesmo
                      # title (ex: "" — obrigatorio pela convencao NOC de todos os paineis
                      # de conteudo) colidem em panels_final_by_title e o ULTIMO painel a
                      # partilhar esse title "ganha", reatribuindo o id de TODOS os outros
                      # entries para o dele — corrompeu o manifest e sobrescreveu paineis
                      # ja correctos em producao (achado 2026-07-10, ver git log).
        title = entry.get('title') or ''
        if title and title in panels_final_by_title:
            pid = panels_final_by_title[title]['id']
            print(f'  manifest: {entry["file"]} -> id={pid}')
            entry['id'] = pid
            manifest_changed = True

    if manifest_changed:
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8')
        print('  manifest.json actualizado')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    domain_level = sys.argv[1]
    only_file = sys.argv[2] if len(sys.argv) > 2 else None
    push_native(domain_level, only_file)
