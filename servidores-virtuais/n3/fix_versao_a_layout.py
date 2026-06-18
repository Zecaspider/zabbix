"""
Ajusta layout do dashboard Version A (all-BT):
 - transparent: true em todos os paineis
 - title: "" em todos os paineis
 - gridPos.h ajustado para alturas definitivas
Nao toca em afterRender (encoding seria corrompido — usar push_panel.py depois).
"""
import json, pathlib, urllib.request

TOK = next(l.strip() for l in pathlib.Path('C:/Repositorios/zabbix/tok3n').read_text('utf-8').splitlines() if l.strip().startswith('glsa_'))

def gapi(method, path, data=None):
    url = 'http://10.10.126.22:3000/api/' + path
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, method=method,
          headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

resp = gapi('GET', 'dashboards/uid/0ae673a3-44c8-41e0-98f5-f5c53473ad54')
dash = resp['dashboard']
folder_uid = resp['meta'].get('folderUid', '')

# Ordem visual dos painéis (primeiro ecrã: header + triggers + KPI + serviços)
ORDER = [100, 107, 101, 106, 102, 103, 105, 104, 108]

# Heights definitivas por panel id
HEIGHTS = {
    100: 3,   # header      — compacto
    107: 8,   # triggers    — posição 2: primeiro ecrã, activos + resolvidos
    101: 8,   # KPI strip   — posição 3: 5 cards + trigger badge + cpu ready
    106: 6,   # serviços    — posição 4: lista compacta, primeiro ecrã
    102: 10,  # CPU detalhe — tempos + contenção VMware
    103: 6,   # RAM detalhe — só breakdown (sem gauge)
    105: 8,   # Rede        — por interface
    104: 8,   # Disco I/O   — só I/O (sem donuts de volumes)
    108: 8,   # Ficha       — 4 colunas
}

# Índice por id para reordenar
panels_by_id = {p.get('id'): p for p in dash.get('panels', [])}

y = 0
new_panels = []
for pid in ORDER:
    p = panels_by_id.get(pid)
    if not p:
        print(f"  AVISO: painel id={pid} não encontrado no dashboard")
        continue
    p['transparent'] = True
    p['title'] = ''
    h = HEIGHTS.get(pid, p['gridPos']['h'])
    p['gridPos']['x'] = 0
    p['gridPos']['w'] = 24
    p['gridPos']['h'] = h
    p['gridPos']['y'] = y
    y += h
    new_panels.append(p)
    print(f"  id={pid} y={p['gridPos']['y']} h={h}")

# Painéis não listados em ORDER mantêm-se no fim
for p in dash.get('panels', []):
    if p.get('id') not in set(ORDER):
        new_panels.append(p)

dash['panels'] = new_panels

payload = {'dashboard': dash, 'folderUid': folder_uid, 'overwrite': True,
           'message': 'layout: transparent + heights definitivas'}
out = pathlib.Path('C:/Repositorios/zabbix/sistema-de-observabilidade/servidores-virtuais/n3/versao-a-layout.json')
out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
print('Saved', out.stat().st_size // 1024, 'KB — total height:', y, 'grid units')
