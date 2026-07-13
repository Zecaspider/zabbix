import json, pathlib, urllib.request

TOK = next(l.strip() for l in pathlib.Path('C:/Repositorios/zabbix/tok3n').read_text('utf-8').splitlines() if l.strip().startswith('glsa_'))

def gapi(method, path, data=None):
    url = 'http://10.10.126.22:3000/api/' + path
    body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=body, method=method,
          headers={'Authorization': 'Bearer ' + TOK, 'Content-Type': 'application/json; charset=utf-8'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())

resp = gapi('GET', 'dashboards/uid/0812353b-3da2-4b65-a884-862633c7d70a')
dash = resp['dashboard']
folder_uid = resp['meta'].get('folderUid', '')

GRP = 'BPC / INFRAESTRUTURA / SERVIDORES VIRTUAIS'
DS  = {'type': 'alexanderzobnin-zabbix-datasource', 'uid': '3_KgG43nz'}
HOSTID_VAR = '$hostid'

def tgt(item, ref='A'):
    return {
        'datasource': DS, 'queryType': '0', 'resultFormat': 'time_series', 'refId': ref,
        'group': {'filter': GRP},
        'host': {'filter': HOSTID_VAR},
        'item': {'filter': item}
    }

def thresh(steps):
    return {'mode': 'absolute', 'steps': steps}

T_CPU   = [{'color': '#3FB950', 'value': None}, {'color': '#D29922', 'value': 60},  {'color': '#F85149', 'value': 85}]
T_DISK  = [{'color': '#3FB950', 'value': None}, {'color': '#D29922', 'value': 70},  {'color': '#F85149', 'value': 85}]
T_RTT   = [{'color': '#3FB950', 'value': None}, {'color': '#D29922', 'value': 0.010}, {'color': '#F85149', 'value': 0.050}]
T_BLUE  = [{'color': '#58A6FF', 'value': None}]

def stat_panel(item, unit, decimals, thresholds, color_mode='background', graph_mode='area', fixed_color=None):
    color = {'mode': 'fixed', 'fixedColor': fixed_color} if fixed_color else {'mode': 'thresholds'}
    return {
        'type': 'stat', 'title': '', 'transparent': True,
        'datasource': DS,
        'targets': [tgt(item)],
        'fieldConfig': {
            'defaults': {
                'color': color, 'unit': unit, 'decimals': decimals,
                'noValue': '—', 'thresholds': thresh(thresholds)
            },
            'overrides': []
        },
        'options': {
            'reduceOptions': {'calcs': ['lastNotNull']},
            'orientation': 'auto', 'textMode': 'auto',
            'colorMode': color_mode, 'graphMode': graph_mode, 'justifyMode': 'auto'
        }
    }

def ts_panel(targets, unit, color_mode='palette-classic', fixed_color=None, min_val=None, max_val=None):
    color = {'mode': 'fixed', 'fixedColor': fixed_color} if fixed_color else {'mode': color_mode}
    defaults = {
        'color': color, 'unit': unit,
        'custom': {'lineWidth': 2, 'fillOpacity': 15, 'gradientMode': 'opacity', 'spanNulls': False, 'showPoints': 'never'}
    }
    if min_val is not None: defaults['min'] = min_val
    if max_val is not None: defaults['max'] = max_val
    tooltip_mode = 'multi' if len(targets) > 1 else 'single'
    return {
        'type': 'timeseries', 'title': '', 'transparent': True,
        'datasource': DS, 'targets': targets,
        'fieldConfig': {'defaults': defaults, 'overrides': []},
        'options': {'tooltip': {'mode': tooltip_mode}, 'legend': {'displayMode': 'list', 'placement': 'bottom'}}
    }

def gauge_panel(item, unit, thresholds):
    return {
        'type': 'gauge', 'title': '', 'transparent': True,
        'datasource': DS,
        'targets': [tgt(item)],
        'fieldConfig': {
            'defaults': {
                'color': {'mode': 'thresholds'}, 'unit': unit,
                'min': 0, 'max': 100, 'noValue': '—', 'thresholds': thresh(thresholds)
            },
            'overrides': []
        },
        'options': {
            'reduceOptions': {'calcs': ['lastNotNull']},
            'orientation': 'auto', 'showThresholdLabels': False, 'showThresholdMarkers': True
        }
    }

NATIVE = {
    101: stat_panel('/CPU utilization|VMware: CPU usage in percents/', 'percent', 1, T_CPU),
    102: stat_panel('/Memory utilization|VMware: Memory usage in percents/', 'percent', 1, T_CPU),
    103: stat_panel('/System uptime|Uptime/', 's', 0, T_BLUE, color_mode='value', graph_mode='none', fixed_color='#58A6FF'),
    104: stat_panel('ICMP response time', 's', 3, T_RTT, graph_mode='none'),
    105: ts_panel([tgt('/CPU utilization|VMware: CPU usage in percents/')], 'percent', fixed_color='#E8A020', min_val=0, max_val=100),
    106: gauge_panel('/CPU utilization|VMware: CPU usage in percents/', 'percent', T_CPU),
    107: ts_panel([tgt('/Memory utilization|VMware: Memory usage in percents/')], 'percent', fixed_color='#7C4DFF', min_val=0, max_val=100),
    108: gauge_panel('/Memory utilization|VMware: Memory usage in percents/', 'percent', T_CPU),
    109: ts_panel([tgt('/Bits received/', 'A'), tgt('/Bits sent/', 'B')], 'bps'),
    110: {
        'type': 'bargauge', 'title': '', 'transparent': True,
        'datasource': DS, 'targets': [tgt('/Space utilization/')],
        'fieldConfig': {
            'defaults': {
                'color': {'mode': 'thresholds'}, 'unit': 'percent',
                'min': 0, 'max': 100, 'noValue': '—', 'thresholds': thresh(T_DISK)
            },
            'overrides': []
        },
        'options': {'reduceOptions': {'calcs': ['lastNotNull']}, 'orientation': 'horizontal', 'displayMode': 'gradient', 'showUnfilled': True}
    },
    111: ts_panel([tgt('/Disk write rate/', 'A'), tgt('/Disk read rate/', 'B')], 'Bps'),
}

new_panels = []
for p in dash.get('panels', []):
    pid = p.get('id')
    if pid in NATIVE:
        d = NATIVE[pid]
        p['type']        = d['type']
        p['title']       = d['title']
        p['transparent'] = d['transparent']
        p['targets']     = d['targets']
        p['fieldConfig'] = d['fieldConfig']
        p['options']     = d['options']
        p['datasource']  = d['datasource']
    elif p.get('type') == 'marcusolsson-dynamictext-panel':
        p['transparent'] = True
        p['title'] = ''
    new_panels.append(p)

dash['panels'] = new_panels

payload = {'dashboard': dash, 'folderUid': folder_uid, 'overwrite': True, 'message': 'fix: native panel queries'}
out = pathlib.Path('C:/Repositorios/zabbix/sistema-de-observabilidade/servidores-virtuais/n3/versao-b-corrected.json')
out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
print('Saved', out.stat().st_size // 1024, 'KB')

# Sanity check
p109 = next(p for p in new_panels if p.get('id') == 109)
t0, t1 = p109['targets']
assert isinstance(t0['item']['filter'], str), 'p109 t0 filter not string!'
assert isinstance(t1['item']['filter'], str), 'p109 t1 filter not string!'
assert t0['refId'] == 'A'
assert t1['refId'] == 'B'
print('p109 OK: t0.item.filter =', t0['item']['filter'], '| t1.item.filter =', t1['item']['filter'])
print('p101 item.filter =', next(p for p in new_panels if p.get('id')==101)['targets'][0]['item']['filter'])
print('ALL OK')
