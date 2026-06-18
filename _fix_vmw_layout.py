"""Fix pontual: transparent=True + title='' em todos os paineis do n2-infraestrutura-vmware."""
import json, pathlib, urllib.request, urllib.error

TOK_PATH = pathlib.Path('C:/Repositorios/zabbix/tok3n')
GRAFANA  = 'http://10.10.126.22:3000'
DASH_UID = 'a967e936-99a3-47c8-af98-052d7a80beb8'

def read_token():
    for line in TOK_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('glsa_'):
            return line
    raise RuntimeError('token nao encontrado')

def gapi(method, path, data=None):
    token = read_token()
    url   = GRAFANA + '/api/' + path
    body  = json.dumps(data).encode('utf-8') if data else None
    req   = urllib.request.Request(url, data=body, method=method,
            headers={'Authorization': 'Bearer ' + token,
                     'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

resp = gapi('GET', f'dashboards/uid/{DASH_UID}')
dash = resp['dashboard']
folder_uid = resp['meta'].get('folderUid', '')

for p in dash.get('panels', []):
    p['transparent'] = True
    p['title'] = ''

result = gapi('POST', 'dashboards/db', {
    'dashboard': dash,
    'folderUid': folder_uid,
    'overwrite': True,
    'message': 'fix layout: transparent + sem titulo',
})
print(f'=> {result.get("status")} | {GRAFANA}{result.get("url","")}')
