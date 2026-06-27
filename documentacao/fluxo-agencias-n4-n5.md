# Fluxo de drill-down das Agências (N1 → N5)

> Validado e implementado 2026-06-27. Desenhado do ponto de vista do **engenheiro
> + NOC**: o que interessa ver quando uma agência está **lenta ou sem sistema**.

## Percurso

| Nível | Dashboard (UID) | Entrada | Conteúdo |
|---|---|---|---|
| N1 | `n1-visao-geral-noc` | clica card **Rede** | portal NOC |
| N2 | `ec590abd-…-2b998aa80556` | clica card **Agências** | segmentos + alertas |
| N3 | `n3-agencias` | clica **tooltip do geomap** ou **tabela** | mapa de estado das agências |
| **N4** | `n4-agencia-detalhe` | dropdown por **nome** da agência | detalhe + diagnóstico (ver abaixo) |
| **N5** | `n5-agencia-interfaces` *(pendente)* | botão/linha do N4 | só as interfaces daquele router |

## N4 — estrutura (ordem de triagem)

`o quê → porquê → qual link → o que diz o Zabbix → quando começou → drill`

1. **ESTADO** — `Disponibilidade` (ICMP UP/DOWN, cor dominante) + **Ficha da Agência**
   (tabela nativa MySQL: província, município, zona, direcção, fornecedores, tipos, nº links).
2. **PORQUÊ** — stats nativos: Latência · Packet Loss · Uptime · CPU · Memória livre.
3. **LINKS WAN — Estado** — tabela nativa, só interfaces WAN/DMVPN/TUNNEL, UP/DOWN por cor.
4. **Problemas Activos** — painel **nativo** Zabbix (`alexanderzobnin-zabbix-triggers-panel`).
5. **Tendência** — tráfego rx/tx por interface · latência/loss · timeline de flaps.
6. **Botão N5** — drill para o diagnóstico profundo das interfaces (sem `var-iface` hardcoded).

### Variáveis
- `group` — textbox oculto, default `HG_AGENCIAS_ROUTERS`.
- `host` — **dropdown por NOME** da agência (query MySQL `unidade_negocio` → valor = host).
  Datasource MySQL Network `cfo3cgypdrdvkf`.

### Datasources
- Dados live: Zabbix Network `ffo8sp8zllog0e` (filtro de item **por nome**, nunca por chave).
- Metadados (ficha, dropdown): MySQL Network `cfo3cgypdrdvkf` (tabela `host_tag`).
- Âncora do header (utils): host de rede sempre UP `DC1-RTE-WAN-INT` (mesmo datasource).

## Decisões de engenharia

- **Fornecedor/Tipo/nº de links** devem ser a **verdade viva** das interfaces (nome SNMP
  com o provider entre parênteses, ex. `Gi0/0/0.914(WAN UNITEL)`), não as tags manuais
  `wan_fornecedor`/`wan_tipo`/`wan_links` (metadados, podem estar desactualizados).
  A ficha mostra as tags; sinalizar divergência tag↔interface é trabalho futuro.
- **Redundância resolvida (opção b — 2 colunas lado a lado)**: no bloco LINKS WAN,
  `Links WAN — Estado` (tabela, célula `Estado` com fundo verde/vermelho — `reduce`
  lastNotNull + `color-background`) **ao lado** de `Histórico (flaps)` (state-timeline,
  mesma query/ordem de interfaces). Estado actual com cor + histórico com cor, alinhados
  por interface. (Tentou-se fundir tudo numa só coluna com sparkline, mas o pipeline
  linear de transforms do Grafana não permite valor-colorido + sparkline na mesma tabela.)
- **Filtro por nome de item** (lição do `d04agencia2`): o datasource Zabbix filtra pelo
  **nome** visível do item, não pela chave. Items de agência confirmados: CPU
  `#7: CPU utilization`, Memória `Processor: Free memory`, Uptime `Uptime (network)`,
  ICMP `ICMP ping`/`ICMP loss`/`ICMP response time`, interfaces `Interface …: …`.

## Riscos conhecidos (analisar depois do N5)

- **Agências sem router (ponto-a-ponto):** algumas agências ligam ponto-a-ponto a outra
  agência e **não têm router próprio** → não estão em `HG_AGENCIAS_ROUTERS` → ficam
  **invisíveis** neste fluxo. Mapear pela sub-interface do router-pai.
- **Headline de 3 estados (UP/LENTO/DOWN):** hoje o ESTADO é binário (ICMP UP/DOWN); o
  "LENTO" lê-se das stats de latência/loss. Estado calculado de 3 níveis é melhoria futura.

## Painéis (manifest)

| id | ficheiro | tipo | papel |
|---|---|---|---|
| 1 | `utils.js` | dynamictext | header BPC NOC |
| 207 | `n4-ficha-table.json` | table (mysql) | Ficha da Agência |
| 200 | `n4-stat-icmp.json` | stat | Disponibilidade |
| 201 | `n4-stat-latency.json` | stat | Latência ICMP |
| 202 | `n4-stat-loss.json` | stat | Packet Loss |
| 203 | `n4-stat-cpu.json` | stat | CPU |
| 204 | `n4-stat-mem.json` | stat | Memória livre |
| 205 | `n4-stat-uptime.json` | stat | Uptime |
| 206 | `n4-table-ifaces.json` | table | Links WAN — Estado |
| 208 | `n4-triggers.json` | zabbix-triggers-panel | Problemas Activos |
| 3,4,5,6 | *(nativos)* | timeseries / state-timeline | Tendência + flaps |
| 209 | `n4-n5-button.json` | text (html) | botão drill N5 |

> `l4-ag-ficha.js` (Business Text) foi **substituído** pela ficha nativa em tabela
> (mais legível/robusta) e já não é painel activo; o ficheiro mantém-se no repo.
