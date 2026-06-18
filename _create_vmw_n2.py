"""Cria dashboard n2-infraestrutura-vmware na pasta de trabalho."""
import json, pathlib, urllib.request
TOK_PATH = pathlib.Path('C:/Repositorios/zabbix/tok3n')
GRAFANA  = 'http://10.10.126.22:3000'
FOLDER   = 'efpbu5tvrhce8a'

def read_token():
    for line in TOK_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line.startswith('glsa_'):
            return line

def gapi(method, path, data=None):
    token = read_token()
    url   = GRAFANA + '/api/' + path
    body  = json.dumps(data).encode('utf-8') if data else None
    req   = urllib.request.Request(url, data=body, method=method,
            headers={'Authorization': 'Bearer ' + token,
                     'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

search = gapi('GET', f'search?folderUIDs={FOLDER}&type=dash-db&query=n2-infraestrutura-vmware')
existing = [d for d in search if 'infraestrutura-vmware' in d.get('title','').lower()]
if existing:
    print(f'Ja existe: {existing[0]["title"]} (uid={existing[0]["uid"]})')
else:
    r = gapi('POST', 'dashboards/db', {
        'dashboard': {'title': 'n2-infraestrutura-vmware', 'uid': None,
                      'panels': [], 'tags': ['bpc','n2','vmware'], 'schemaVersion': 39},
        'folderUid': FOLDER, 'overwrite': False,
        'message': 'criar n2-infraestrutura-vmware',
    })
    print(f'=> {r.get("status")} | uid={r.get("uid")}')
    print(f'URL: {GRAFANA}{r.get("url","")}')
    print(f'\n>>> manifest.json dashboardUid = "{r.get("uid")}"')
