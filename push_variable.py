r"""
push_variable.py - Adiciona ou actualiza variaveis de template
(dashboard.templating.list) a partir da chave "templating" do manifest.json.

Le token de C:\Repositorios\zabbix\tok3n.

Uso:
  python push_variable.py <dominio/nivel>
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


def push_variables(domain_level):
    token = read_token()
    folder = ROOT / domain_level.replace('\\', '/')
    manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
    var_defs = manifest.get('templating', [])
    if not var_defs:
        print('  Sem chave "templating" no manifest.json - nada a fazer')
        return

    dash_uid = manifest['dashboardUid']
    resp = gapi('GET', f'dashboards/uid/{dash_uid}', token=token)
    dash = resp['dashboard']
    folder_uid = resp['meta'].get('folderUid', '')

    existing = dash.setdefault('templating', {}).setdefault('list', [])
    by_name = {v['name']: v for v in existing}

    for vdef in var_defs:
        name = vdef['name']
        base = dict(vdef)
        base.setdefault('type', 'query')
        base.setdefault('current', {})
        base.setdefault('includeAll', False)
        base.setdefault('multi', False)
        base.setdefault('sort', 0)
        if name in by_name:
            idx = existing.index(by_name[name])
            existing[idx] = base
            print(f'  UPDATE variavel ${name}')
        else:
            existing.append(base)
            print(f'  CREATE variavel ${name}')

    payload = {
        'dashboard': dash,
        'folderUid': folder_uid,
        'overwrite': True,
        'message': 'push_variable.py',
    }
    result = gapi('POST', 'dashboards/db', payload, token=token)
    print(f'  => {result.get("status")} | {GRAFANA}{result.get("url","")}')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    push_variables(sys.argv[1])
