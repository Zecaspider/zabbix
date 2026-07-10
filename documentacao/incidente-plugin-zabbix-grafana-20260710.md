# Incidente — plugin Zabbix desaparecido do Grafana (2026-07-10)

> **Runbook rápido para a próxima vez que isto acontecer:** ver secção "Diagnóstico
> em 3 passos" e "Correcção" mais abaixo. Ligação cruzada:
> `_toolkit/metodologia/troubleshoot.md` (comandos originais, agora com os
> passos de diagnóstico sem SSH incluídos).

## Contexto

Durante uma sessão de refactoração dos dashboards de APIs e Serviços
(Fase 7.0.13 do `cronograma.md`), o utilizador teve um corte de energia. Ao
retomar, os dashboards que usam o datasource Zabbix deixaram de mostrar
dados — sem erro óbvio na UI, painéis simplesmente vazios/"No data".

## Diagnóstico feito (sem SSH, só API HTTP)

Sequência de verificação usada, do mais genérico ao mais específico — todos
os passos correm a partir de qualquer máquina com acesso à rede, sem
precisar de login no servidor:

1. **Grafana está de pé?**
   ```
   curl -s -o /dev/null -w "HTTP %{http_code}\n" http://10.10.126.22:3000/api/health
   ```
   → `200` (Grafana OK)

2. **Zabbix está de pé?** (isola se o problema é no Zabbix ou só no Grafana)
   ```
   curl -s http://10.10.126.22/zabbix/api_jsonrpc.php -X POST \
     -H "Content-Type: application/json-rpc" \
     -d '{"jsonrpc":"2.0","method":"apiinfo.version","params":{},"id":1}'
   ```
   → `{"jsonrpc":"2.0","result":"7.4.8","id":1}` (Zabbix OK — confirmou que o
   problema estava isolado ao Grafana)

3. **O plugin Zabbix ainda existe no Grafana?** (usa o token em `tok3n`,
   ver `push_panel.py` para o padrão de leitura do token)
   ```python
   GET /api/plugins/alexanderzobnin-zabbix-app/settings
   GET /api/plugins/alexanderzobnin-zabbix-datasource/settings
   GET /api/plugins/alexanderzobnin-zabbix-triggers-panel/settings
   ```
   Resultado antes da correcção:
   - `alexanderzobnin-zabbix-app` → **404 "Plugin not found"** ← causa raiz
   - `alexanderzobnin-zabbix-datasource` → 200, mas `enabled: false`
   - `alexanderzobnin-zabbix-triggers-panel` → 200, mas `enabled: false`
   - `marcusolsson-dynamictext-panel` (Business Text) → 200, `enabled: true`,
     **não afectado**

4. **Confirmar com health check dos datasources**:
   ```
   GET /api/datasources/uid/3_KgG43nz/health        (BPC - INFRA)
   GET /api/datasources/uid/ffo8sp8zllog0e/health    (BPC-NETWORK)
   ```
   Antes da correcção: ambos `500 plugin.healthCheck failed`.
   Depois da correcção: `200 OK`, `"message": "Zabbix API version 7.4.8"` /
   `"...7.0.16"`.

## Causa raiz

O Grafana organiza o Zabbix como **1 plugin "app" + 2 subplugins**:
`alexanderzobnin-zabbix-app` (activa os outros dois) →
`alexanderzobnin-zabbix-datasource` + `alexanderzobnin-zabbix-triggers-panel`.

O corte de energia interrompeu o `grafana-server` a meio de uma escrita nos
ficheiros do plugin `alexanderzobnin-zabbix-app` em
`/var/lib/grafana/plugins/`. No arranque seguinte, o Grafana valida a
integridade de cada plugin antes de o listar — este falhou a validação e
**deixou de aparecer** em `/api/plugins`, o que por sua vez desactivou os
dois subplugins que dependem dele (continuavam instalados, mas
`enabled: false`). Os outros plugins (`marcusolsson-dynamictext-panel`,
MySQL) não estavam a ser escritos naquele instante, por isso não foram
afectados — daí o sintoma ser isolado ao Zabbix.

Isto é consistente com o histórico do `troubleshoot.md`, que já documentava
este exacto cenário ("Erro de conexão do plugin grafana com o zabbix") como
recorrente o suficiente para ter runbook próprio.

## Correcção aplicada

No servidor (`10.10.126.22`, via SSH — o utilizador correu, sessão Claude
não tem acesso SSH a esta máquina):

```bash
grafana-cli plugins remove alexanderzobnin-zabbix-app
rm -rf /var/lib/grafana/plugins/alexanderzobnin-zabbix-app
grafana-cli plugins install alexanderzobnin-zabbix-app
systemctl restart grafana-server
```

Nota: o `grafana-cli plugins install` sem versão fixa instalou a versão mais
recente disponível (**6.4.1**, antes era 6.3.0 — CLAUDE.md actualizado). Não
houve necessidade de fixar versão porque a 6.4.1 é retrocompatível com os
dashboards existentes (validado abaixo).

## Validação pós-fix

1. **API**: os 3 checks da secção anterior confirmados OK (app plugin
   `enabled: true` v6.4.1; datasources `200 OK` a falar com o Zabbix real).
2. **Browser, dados reais**: dashboard `N3 · APIs e Serviços — App`
   (`http://10.10.126.22:3000/d/apis-n3`) aberto com a app "ABC - Abertura
   de Contas" — confirmado a renderizar:
   - Os 5 cards de KPI (Business Text via `BPC.rpc`, que já usa o
     datasource Zabbix internamente) — "Está no ar? SIM", "Velocidade 3ms",
     "Conteúdo CORRECTO", "Problemas activos: 0"
   - Gráfico de disponibilidade 24h (timeline verde) e os 3 cards de
     disponibilidade 24h/7d/30d (100.00%) — painéis **nativos** do
     datasource Zabbix, não Business Text
   - Rede confirma as 5 queries do painel (`SQR100`–`SQR104`) e a chamada
     `zabbix-api` (usada pelo `BPC.rpc`) todas a devolver `200`

Cobertura: como o mesmo datasource serve tanto os painéis nativos como o
RPC do Business Text, esta validação cobre por extensão os restantes
painéis do dashboard (tabela de VMs, ficha da app, painel de triggers) que
usam o mesmo mecanismo.

## Diagnóstico em 3 passos (para a próxima vez)

1. `curl http://10.10.126.22:3000/api/health` → se não for 200, o problema
   é o Grafana em si (serviço parado), não o plugin.
2. `curl -X POST http://10.10.126.22/zabbix/api_jsonrpc.php ...` (ver
   comando completo acima) → se não responder, o problema é o Zabbix, não
   o Grafana/plugin.
3. Se os dois anteriores estiverem OK mas os dashboards continuarem sem
   dados: `Administration → Plugins and data → Plugins` no Grafana, procurar
   "Zabbix" — se não aparecer nada na lista, é este mesmo incidente. Correr
   o runbook de `_toolkit/metodologia/troubleshoot.md`.

Os passos 1-3 não precisam de SSH nem de credenciais especiais — só do
token Grafana já existente em `tok3n` para os passos via API (o health
check público em `/api/health` nem isso precisa).
