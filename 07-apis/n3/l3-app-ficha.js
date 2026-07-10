// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · FICHA DA APLICAÇÃO  v2.0         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  v2 — cartão de identidade da APLICAÇÃO (não das VMs — essas vivem na    ║
// ║  tabela "VMs de hospedagem"). Identidade + endpoint + configuração de    ║
// ║  monitoria (conteúdo esperado, limiares de tempo, regra de alerta,       ║
// ║  níveis de verificação activos). Sem a lista de serviços por VM da v1.   ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3FICHA = {
  elementId: 'bpc-app-ficha',
  refreshMs: 120000,
  // Defaults do template BPC Web Monitoring v2 (14715), usados quando o host
  // não os sobrepõe (sistemas internos). O proxy BPC.rpc bloqueia template.get,
  // por isso não se lêem ao vivo — manter em sincronia se o template mudar.
  // Sistemas externos sobrepõem estes valores por macro de host.
  templateDefaults: {
    '{$FAILS.BEFORE.ALERT}': '3',
    '{$TEMPO.NORMAL}': '5s',
    '{$TEMPO.LENTO}': '8s',
  },
  niveis: [
    { key: 'L1', label: 'Disponibilidade' },
    { key: 'L2', label: 'Performance' },
    { key: 'L3', label: 'Conteúdo' },
    { key: 'L4', label: 'Autenticação' },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3fichaGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

function l3fichaTagVal(tags, key) {
  const t = (tags || []).find(function (x) { return x.tag === key })
  return t ? t.value : ''
}

function l3fichaMacro(map, name) {
  return (map && map[name] != null) ? map[name] : ''
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3fichaFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'host', 'name'],
    selectTags: ['tag', 'value'],
  })
  return hosts[0] || null
}

async function l3fichaFetchAll(rpc, host) {
  const servico = l3fichaTagVal(host.tags, 'servico')
  const r = await Promise.all([
    rpc('usermacro.get', { hostids: [host.hostid], output: ['macro', 'value'] }),
    servico
      ? rpc('host.get', { output: ['host'], tags: [{ tag: 'servico', value: servico, operator: 1 }] })
      : Promise.resolve([]),
    rpc('item.get', {
      hostids: [host.hostid], webitems: true,
      search: { key_: 'web.test.fail[' },
      output: ['key_', 'status'],
    }),
  ])
  // Macro efectiva = default do template (hardcoded, ver CFG), sobreposto pela
  // macro de host. (template.get está bloqueado pelo proxy BPC.rpc → 500.)
  const map = Object.assign({}, CFG_L3FICHA.templateDefaults)
  ;(r[0] || []).forEach(function (m) { map[m.macro] = m.value })

  const vmCount = (r[1] || []).filter(function (h) {
    return h.host !== host.host && h.host.indexOf('app-') !== 0
  }).length
  // nivel activo = existe item web.test.fail[LN-...] com status=0 (habilitado)
  const activos = {}
  ;(r[2] || []).forEach(function (i) {
    const m = /web\.test\.fail\[(L\d)/.exec(i.key_)
    if (m && i.status === '0') activos[m[1]] = true
  })
  return { macros: map, vmCount: vmCount, activos: activos }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3fichaPill(label, active) {
  const color = active ? window.BPC.state.color('ok') : 'var(--bpc-mute)'
  const bg = active ? 'rgba(63,185,80,.12)' : 'rgba(255,255,255,.04)'
  const bd = active ? 'rgba(63,185,80,.35)' : 'rgba(255,255,255,.10)'
  const dot = '<span style="width:6px;height:6px;border-radius:50%;background:' + color + ';flex:none"></span>'
  return '<span style="display:inline-flex;align-items:center;gap:6px;font-size:.82rem;font-weight:600;'
    + 'color:' + (active ? '#CDD9E5' : 'var(--bpc-mute)') + ';background:' + bg + ';border:1px solid ' + bd + ';'
    + 'border-radius:20px;padding:3px 11px;margin:0 6px 0 0">' + dot + label + '</span>'
}

function l3fichaFact(label, valueHtml) {
  return '<div style="min-width:0">'
    + '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--bpc-mute);margin-bottom:3px">' + label + '</div>'
    + '<div style="font-size:.98rem;color:#E6EDF3;line-height:1.35">' + valueHtml + '</div>'
    + '</div>'
}

function l3fichaRender(el, host, data) {
  const esc = window.BPC_SHARED.esc
  const nome = String(host.name || '').replace(' - Monitor da URL', '')
  const servico = l3fichaTagVal(host.tags, 'servico')
  const tipo = l3fichaTagVal(host.tags, 'tipo') || 'sistema'
  const vmTag = l3fichaTagVal(host.tags, 'vm')
  const url = l3fichaMacro(data.macros, '{$URL}')
  const conteudo = l3fichaMacro(data.macros, '{$STRING.CHECK}')
  const tNormal = l3fichaMacro(data.macros, '{$TEMPO.NORMAL}')
  const tLento = l3fichaMacro(data.macros, '{$TEMPO.LENTO}')
  const fails = l3fichaMacro(data.macros, '{$FAILS.BEFORE.ALERT}')

  const isParceiro = /parceiro/i.test(tipo)
  const tipoColor = isParceiro ? '#B48EE8' : '#58C4DC'
  const tipoLabel = isParceiro ? 'PARCEIRO' : 'SISTEMA INTERNO'

  const iconApp = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="' + tipoColor + '" stroke-width="1.7">'
    + '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/><circle cx="6.4" cy="6.5" r=".7" fill="' + tipoColor + '"/><circle cx="8.8" cy="6.5" r=".7" fill="' + tipoColor + '"/></svg>'
  const iconUrl = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#58C4DC" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 000 18M12 3a14 14 0 010 18"/></svg>'

  // ── Header ──
  const header = '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">'
    + iconApp
    + '<div style="min-width:0;flex:1">'
    +   '<div style="font-size:1.35rem;font-weight:800;color:#F0F6FC;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(nome) + '</div>'
    +   '<div style="font-size:.9rem;color:var(--bpc-mute);margin-top:2px">Serviço · <span style="color:#CDD9E5;font-weight:600">' + esc(servico || '—') + '</span></div>'
    + '</div>'
    + '<span style="flex:none;font-size:.74rem;font-weight:800;letter-spacing:.06em;color:' + tipoColor + ';'
    +   'border:1px solid ' + tipoColor + '55;background:' + tipoColor + '18;border-radius:20px;padding:5px 13px">' + tipoLabel + '</span>'
    + '</div>'

  // ── URL row ──
  const urlRow = '<div style="display:flex;align-items:center;gap:11px;background:rgba(88,196,220,.06);'
    + 'border:1px solid rgba(88,196,220,.18);border-radius:8px;padding:11px 14px;margin-bottom:18px">'
    + iconUrl
    + '<div style="flex:1;min-width:0;font-size:.95rem;color:#CDD9E5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(url || 'sem URL definido') + '</div>'
    + (url
        ? '<a href="' + esc(url) + '" target="_blank" style="flex:none;text-decoration:none;font-size:.85rem;font-weight:700;color:#58C4DC;'
          + 'border:1px solid rgba(88,196,220,.4);border-radius:6px;padding:5px 12px">Abrir ↗</a>'
        : '')
    + '</div>'

  // ── Facts ──
  const conteudoHtml = conteudo
    ? '<span style="font-family:monospace;color:#9FE0A6">&ldquo;' + esc(conteudo) + '&rdquo;</span>'
    : '<span style="color:var(--bpc-mute)">não verificado</span>'
  const respostaHtml = (tNormal || tLento)
    ? 'normal ≤ <b>' + esc(tNormal || '—') + '</b> · lento &gt; <b>' + esc(tLento || '—') + '</b>'
    : '<span style="color:var(--bpc-mute)">—</span>'
  const alertaHtml = fails
    ? '<b>' + esc(fails) + '</b> falhas consecutivas'
    : '<span style="color:var(--bpc-mute)">—</span>'
  const vmHtml = data.vmCount
    ? '<b>' + data.vmCount + '</b> ' + (data.vmCount === 1 ? 'máquina' : 'máquinas')
      + (vmTag ? ' <span style="color:var(--bpc-mute)">· principal ' + esc(vmTag) + '</span>' : '')
    : '<span style="color:var(--bpc-mute)">sem VM interna (externo)</span>'
  const nActivos = Object.keys(data.activos).length
  const niveisHtml = CFG_L3FICHA.niveis.map(function (n) {
    return l3fichaPill(n.key + ' · ' + n.label, !!data.activos[n.key])
  }).join('')

  const facts = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-bottom:20px">'
    + l3fichaFact('Conteúdo esperado', conteudoHtml)
    + l3fichaFact('VMs de hospedagem', vmHtml)
    + l3fichaFact('Tempo de resposta', respostaHtml)
    + l3fichaFact('Alerta após', alertaHtml)
    + '</div>'

  const niveis = '<div>'
    + '<div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--bpc-mute);margin-bottom:8px">'
    +   'Níveis de verificação <span style="color:#8fa6bd">· ' + nActivos + ' de 4 activos</span></div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px 0">' + niveisHtml + '</div>'
    + '</div>'

  el.innerHTML = '<div class="bpc bpc-card" style="height:100%;padding:18px 22px;box-sizing:border-box;overflow:hidden">'
    + header + urlRow + facts + niveis
    + '</div>'
}

function l3fichaRenderNoApp(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute);height:100%;'
    + 'display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div class="bpc-error-msg">Selecciona uma aplicação no menu acima.</div></div>'
}

function l3fichaRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Ficha da aplicação: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3fichaLoad(rpc) {
  const el = document.getElementById(CFG_L3FICHA.elementId)
  if (!el) return

  const appName = l3fichaGetAppName()
  if (!appName) { l3fichaRenderNoApp(el); return }

  el.innerHTML = window.BPC.utils.buildSkeleton()

  l3fichaFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3fichaRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    return l3fichaFetchAll(rpc, host).then(function (data) {
      l3fichaRender(el, host, data)
    })
  }).catch(function (err) { l3fichaRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3fichaLoad(rpc) }, CFG_L3FICHA.refreshMs)
}

function l3fichaInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3fichaLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-ficha: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3fichaInitWithRetry(attempt + 1) }, 100)
}

l3fichaInitWithRetry()
