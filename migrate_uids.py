"""
migrate_uids.py — Migra UIDs Grafana para formato canónico dominio.nivel.funcao
Domínio Rede — 16 dashboards

Processo por dashboard:
  1. GET /api/dashboards/uid/<old_uid>
  2. Substitui dashboard.uid pelo novo UID canónico
  3. POST /api/dashboards/db com overwrite=true (mantém id numérico = mesmo dashboard)
"""

import json, urllib.request, urllib.error, pathlib, sys

GRAFANA  = 'http://10.10.126.22:3000'
TOK_PATH = pathlib.Path('C:/Repositorios/zabbix/tok3n')
TOKEN    = next(l.strip() for l in TOK_PATH.read_text().splitlines() if 'glsa_' in l)

MAPPING = [
    # (old_uid,                                    new_uid)
    # Nota: Grafana 12 não aceita '.' em UIDs — separador é '-'
    ('ec590abd-c1ab-4b83-ac26-2b998aa80556', 'rede-n2-segmentos'),
    ('n3-agencias',                           'rede-n3-agencias'),
    ('a75e2ba6-0ecc-49ee-bceb-4bcbafb419da', 'rede-n3-dc'),
    ('471f2208-d032-46d4-8d35-6fdfe770c967', 'rede-n3-edificios'),
    ('1702465e-0539-4fa7-a8eb-c0d3a655d99b', 'rede-n3-wan'),
    ('31bace26-1af8-4b82-a6c1-f5c9116f4b83', 'rede-n3-wan-carriers'),
    ('n4-agencia-detalhe',                    'rede-n4-agencia'),
    ('7baea796-e40b-4346-90ea-66516f369f8a', 'rede-n4-dc-switch'),
    ('n4-edificio-detalhe',                   'rede-n4-edificio'),
    ('n4-wan-device',                         'rede-n4-wan-dispositivo'),
    ('c0d81130-27a6-47af-92b5-3e710f928b76', 'rede-n4-wan-provedor'),
    ('8ddc4833-be01-47ea-8ada-a89531d4babb', 'rede-n4-wan-router'),
    ('n5-agencia-interfaces',                 'rede-n5-agencia-interfaces'),
    ('n5-edificio-interfaces',                'rede-n5-edificio-interfaces'),
    ('n6-edificio-switch',                    'rede-n6-edificio-switch'),
]

HDR_GET  = {'Authorization': 'Bearer ' + TOKEN}
HDR_POST = {'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'}

def gf_get(path):
    req = urllib.request.Request(GRAFANA + path, headers=HDR_GET)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def gf_post(path, body):
    data = json.dumps(body).encode()
    req  = urllib.request.Request(GRAFANA + path, data=data, headers=HDR_POST, method='POST')
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def gf_delete(path):
    req = urllib.request.Request(GRAFANA + path, headers=HDR_GET, method='DELETE')
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

ok, skip, fail = [], [], []

for old_uid, new_uid in MAPPING:
    # 1. Verificar se já migrado (new_uid existe)
    try:
        existing = gf_get(f'/api/dashboards/uid/{new_uid}')
        print(f'SKIP  {new_uid} já existe (pré-migrado)')
        # Verificar se old_uid ainda existe (duplicado) e apagar
        try:
            gf_get(f'/api/dashboards/uid/{old_uid}')
            gf_delete(f'/api/dashboards/uid/{old_uid}')
            print(f'      Duplicado {old_uid} apagado')
        except urllib.error.HTTPError:
            pass
        skip.append(new_uid)
        continue
    except urllib.error.HTTPError:
        pass  # new_uid não existe — continuar com migração

    # 2. GET dashboard pelo UID antigo
    try:
        resp = gf_get(f'/api/dashboards/uid/{old_uid}')
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f'SKIP  {old_uid} (404 — não existe no Grafana)')
            skip.append(old_uid)
            continue
        raise

    db   = resp['dashboard']
    meta = resp.get('meta', {})
    old_title = db.get('title', '?')

    # 3. Criar cópia com novo UID (sem 'id' — Grafana 12 não aceita o id grande)
    db_new = {k: v for k, v in db.items() if k != 'id'}
    db_new['uid'] = new_uid

    payload = {
        'dashboard': db_new,
        'folderUid': meta.get('folderUid', ''),
        'overwrite': False,
        'message': f'T-04: UID {old_uid} -> {new_uid}',
    }

    try:
        result = gf_post('/api/dashboards/db', payload)
        # 4. Apagar o dashboard antigo
        gf_delete(f'/api/dashboards/uid/{old_uid}')
        print(f'OK    {old_uid:46s} -> {new_uid}  ({old_title})')
        ok.append(new_uid)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f'FAIL  {old_uid} -> {new_uid} : {e.code} {body[:120]}')
        fail.append(old_uid)

print()
print(f'Resultado: {len(ok)} OK · {len(skip)} skip · {len(fail)} fail')
if fail:
    print('FALHAS:', fail)
    sys.exit(1)
