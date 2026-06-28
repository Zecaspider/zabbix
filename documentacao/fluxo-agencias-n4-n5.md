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
| **N5** | `n5-agencia-interfaces` | botão do N4 (`var-host`) | só as interfaces daquele router (ver §N5) |

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

## N5 — Interfaces da Agência (`n5-agencia-interfaces`)

Diagnóstico profundo das interfaces do router seleccionado (exclusivo das agências).
Responde à pergunta *"o N4 disse que o link está mau — porquê?"*. Tudo nativo.

- **Variáveis:** `group` (textbox oculto), `host` (dropdown por nome, MySQL — vem do N4),
  `iface` (dropdown **MySQL**, datasource `cfo3cgypdrdvkf` — coerente com o dropdown `host`).
  `All`=`.*`; mostra **todas** as interfaces do router. Ver §Decisão iface MySQL abaixo.
  - `__text` (mostrado) = descritor completo `<token>(<alias>)`, ex. `Gi0/0/0.914(WAN UNITEL)`
    — traz o **provider/serviço** entre parênteses (alias SNMP da interface).
  - `__value` (enviado aos painéis) = só o token técnico, ex. `Gi0/0/0.914` — sem parênteses,
    para não introduzir sintaxe regex no filtro `/Interface ${iface}.*: …/` dos painéis.
  - SQL parseia o nome do item (`SUBSTRING_INDEX`) e filtra `i.flags=4 AND i.status=0`
    (interfaces reais descobertas; exclui o **protótipo LLD** `{#IFNAME}` e items desactivados).
- **Painéis:** back-link "← Voltar ao N4" · **Estado & flaps** (state-timeline UP/DOWN por
  interface) · **Tráfego recebido/enviado** (por interface) · **Erros** (in/out) ·
  **Descartes** (in/out). Filtro de item `/Interface ${iface}.*: <métrica>/`.
- **Utilização % fora (dívida):** `net.if.speed` = **0** nas interfaces de tunnel/DMVPN
  → % de utilização inútil; só físicas têm speed real. Reactivar quando o speed estiver
  populado (T-08).
- Snapshot: `rede/n5-agencia-interfaces/dashboard-completo.json` (7 painéis).

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
- **Decisão iface MySQL (2026-06-28, validado no browser):** o dropdown `iface` passou de
  *query Zabbix + regex* para **query MySQL** com `__text`/`__value` explícitos. Porquê (mais
  robusto e coerente):
  1. **Mostra o provider** — a versão antiga (`regex /Interface (.+?)\(/`) cortava no `(` e
     **deitava fora** o alias; o NOC/engenheiro não via de que operadora era o link. Agora
     `__text` mostra `Gi0/0/0.914(WAN UNITEL)`.
  2. **Sem dependência de grupos nomeados aninhados** do Grafana (não documentados) — o split
     display↔valor é feito em SQL (`SUBSTRING_INDEX`), de primeira classe e testável.
  3. **Coerente com o dropdown `host`**, que já era MySQL no mesmo datasource.
  4. **Exclui o protótipo LLD** `{#IFNAME}({#IFALIAS})` via `i.flags=4 AND i.status=0` (a API
     Zabbix filtrava-o de graça; o SQL crú apanhava-o — bug evitado).
  5. **Robustez no caso DOWN:** lê da **configuração**, por isso popula mesmo quando a agência
     está totalmente DOWN com `lastclock=0` (validado em CUNHINGA). A variável Zabbix dependia
     de dados recentes.

## Riscos conhecidos (analisar depois do N5)

- **Agências sem router (ponto-a-ponto):** algumas agências ligam ponto-a-ponto a outra
  agência e **não têm router próprio** → não estão em `HG_AGENCIAS_ROUTERS` → ficam
  **invisíveis** neste fluxo. Mapear pela sub-interface do router-pai.
- **Routers com SNMP incompleto (Z.14):** 13/221 routers de agência respondem a ICMP mas
  **não têm interfaces/CPU/memória monitorizadas** (descobertos, sem templates SNMP). O
  N4 distingue isto: os stats de SNMP (CPU/Memória/Uptime) mostram **"Sem SNMP"**
  (`fieldConfig.noValue`) em vez de "No data"; Latência/Loss (ICMP) mostram "—". A tabela
  LINKS WAN e o Histórico ficam "No data" (estado vazio de tabela/timeline não é
  configurável). É **dado em falta no Zabbix**, não bug — acção Z.14 no cronograma.
- **Headline de 3 estados (UP/LENTO/DOWN):** hoje o ESTADO é binário (ICMP UP/DOWN); o
  "LENTO" lê-se das stats de latência/loss. Estado calculado de 3 níveis é melhoria futura.

## Validação do fluxo — caso "agência sem sistema" (CUNHINGA, 2026-06-28)

Caso: `RTCUNH00` (CUNHINGA, Bié; providers MStelcom + Unitel) **DOWN há ~12 dias**
(trigger `Unavailable by ICMP ping`, sev4). Interfaces com `lastclock=0` (nunca recolhidas).

**O drill diz o motivo?**
- **NOC — o "o quê" + contexto: sim.** N4 mostra DOWN, ficha (2 providers, links conhecidos),
  CPU/Mem "Sem SNMP", e o trigger distingue o sintoma (*router inteiro inalcançável*, não 1 link).
- **Engenheiro — causa raiz: NÃO, para agências totalmente DOWN.** Dois motivos:
  1. **Limite arquitectural:** router inalcançável ⇒ SNMP também cai ⇒ perde-se a visibilidade
     das interfaces exactamente quando era precisa.
  2. **Lacuna Z.14:** interfaces nunca recolhidas (`lastclock=0`) ⇒ N5 sem histórico ⇒ não há
     sequência pré-queda para inferir a causa.
- **Para agências DEGRADADAS (router UP, 1 link down) o drill DÁ a causa** — o N5 mostra qual
  interface caiu, quando, erros e de que provider. Accionável.

**Alavancas para chegar à causa de agências DOWN (a implementar):**
1. **Fechar Z.14** — recolher SNMP das interfaces dos agency routers ⇒ passamos a ter a
   **sequência pré-queda** (ex.: UNITEL caiu, depois MST, depois ICMP = falha dupla → energia/local).
2. **Correlação por PROVIDER via hub DMVPN** (`DC1-RTE-WAN-AG`): o hub é monitorizado centralmente
   e **sobrevive** à queda da agência. Tem estado **por provider** (Tu101 `DMVPN_HUB_UNITEL`,
   Tu102 ITA, Tu105 `MST_FIBRA`…). Regra: **muitas** agências do mesmo provider DOWN + túnel-hub
   desse provider down ⇒ **outage do provider/hub** (não das agências); **uma** agência DOWN com
   túneis-hub UP ⇒ problema **local** dessa agência. **Nota:** o hub **não** tem visibilidade
   por-agência (sem NHRP/crypto por spoke) — isso seria uma melhoria Zabbix (Z.15).

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
