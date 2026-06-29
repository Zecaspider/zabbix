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

## Auditoria do universo BPC — gap geomap (2026-06-29)

### Decomposição do gap 172 → realidade

```
251  Lista Geral BPC (Excel oficial, todas as tipologias)
 -25  não estão nos "Dados das Agências" (sem IP de gestão atribuído)
─────
226  têm IP de gestão (Dados das Agências / mapa_agencias_zabbix.csv)
  -9  têm IP mas SEM router no Zabbix (candidatos/onboarding)
─────
217  estão no Zabbix com router (grupo HG_AGENCIAS_ROUTERS g24)
 -49  estão no Zabbix mas SEM coordenadas GPS no inventário Zabbix
─────
172  apareciam no geomap antes desta sessão
```

Fora desta cadeia: **45 PAs** (Postos de Atendimento sem código e sem IP — balcões físicos
dentro de outras instituições: INSS, FAA, MINDEF, etc.) e **13 BIs/BMIs** (dependentes de
agência-pai, sem router próprio — mapeados em `BPC/mapa_balcoes_dependentes.csv`).

### Resolução do Gap A — GPS (2026-06-29)

Auditoria via API Zabbix Network: 49 hosts sem `location_lat`/`location_lon`.
Cruzamento com Excels (Dados das Agências, Lista Geral) e CSV `mapa_agencias_zabbix.csv`.

| Resultado | Contagem |
|---|---|
| Coordenadas populadas (confirmados) | 45 — por província/município dos Excels |
| RT_UBM30 (Km 30, Viana/Luanda) | 1 — identificado pelas tags Zabbix |
| **Total populados** | **46** |
| IPs anónimos excluídos | 3 — `172.22.1.38` / `172.22.1.203` / `172.22.1.240` |

**Geomap após push: 172 → 218 unidades.**

#### Os 3 IPs anónimos — diagnóstico

| IP | hostid | DOWN desde | Situação |
|---|---|---|---|
| 172.22.1.38 | 11000 | 2026-04-25 | `flags=0` (manual), zero tags/inventory, ausente dos Excels, ICMP loss=100% |
| 172.22.1.203 | 11009 | 2026-06-09 | Idem |
| 172.22.1.240 | 11010 | 2026-06-09 | Idem |

Perfil: criados manualmente (não por auto-discovery), template `Cisco IOS by SNMP` aplicado
mas nunca responderam a ICMP. Sem tags, sem inventory, não existem em nenhum Excel BPC.
Hipótese mais provável: pré-criados para routers ainda não instalados ou routers descomissionados
cujo host ficou no Zabbix. **Acção:** equipa de rede confirma identidade → dar GPS + nome;
ou remover de `HG_AGENCIAS_ROUTERS` se obsoletos.

Artefactos produzidos:
- `BPC/audit_gps_g24.csv` — todos os 221 hosts g24 com status GPS antes do push
- `BPC/hosts_sem_gps_preenchido.csv` — 49 hosts com coordenadas calculadas (fonte por linha)

### Auditoria de qualidade inventário/tags (2026-06-29)

Após o push do Gap A, auditou-se a qualidade de **todos os campos** (GPS vs provincia, tags vs Excel,
`site_state` vs Excel) para os 221 hosts g24. Resultado: **193/221 sem divergências**. 24 corrigidos
via API em lote único:

| Categoria | Hosts | Acção |
|---|---|---|
| GPS errado | RTMENONG00 (Menongue) | lat=-16.66 → -14.657 (erro 223km; digitação) |
| Provincia "Luanda" → "Icolo e Bengo" | RTCABL00, RTMUXI00, RTSIZA00, RTZANGO00, RTSIACUACO00, RTCATE00 | reorganização admin. 2011; Excel=fonte de verdade |
| Provincia "Moxico" → "Moxico Leste" | RTLUAU00, RTCAZB00 | alinhamento com Excel |
| Tags ausentes | RTCAMB00, RTLUCA00, RTFAASU00, 172.22.1.202 | unidade_negocio + tipo_un populados do Excel |

Divergências residuais aceites:
- **Cubango/Cuando Cubango** (3 hosts): Excel usa nome truncado; tags Zabbix com nome oficial. Aceite sem correcção.
- **GPS bbox falso-positivos** (11 hosts: Ganda, Balombo, Chitembo, Lunda Norte/Sul): bounding boxes de validação são aproximados; coordenadas geograficamente correctas.

Artefacto: `BPC/inventory_divergencias.csv` (24 linhas, campos: host, ip, nome_xl, prov_xl, muni_xl, lat, lon, tag_prov, tag_un, site_state, issues).

## Riscos / gaps conhecidos (lado Zabbix) — auditados 2026-06-28

- **Agências/postos sem router próprio (ponto-a-ponto) — T-07 / cron 9.7:** muitas agências,
  **postos** e **postos móveis** **não têm router próprio** — ligam ponto-a-ponto a outra
  agência/posto-pai. Não estão em `HG_AGENCIAS_ROUTERS` → **invisíveis** a todo o fluxo
  (geomap N3, N4, N5). Uma falha do pai derruba N filhas **silenciosamente**. Existe **Excel**
  do utilizador com o mapa filha↔pai. Plano: (1) ingerir o Excel → mapa filha→router-pai +
  sub-interface/VLAN; (2) tornar visíveis via a sub-interface do pai (estado herdado); (3) ficha
  marca "sem router próprio (dependente de X)". Depende de Z.14 (SNMP do pai).
- **SNMP cego em ~73 agency routers (Z.14) — âmbito corrigido:** dos 221 do g24, **13 sem
  qualquer item** de interface (só ICMP) + **60 com items mas `lastclock=0`** (nunca recolhidos)
  = **~73 (33%)**. **Causa-raiz NÃO é falta de template:** os partidos já têm `Cisco IOS by SNMP`
  + interface SNMPv3 (authPriv SHA/AES, user `snmpv3_noc_bpc`) — **a sessão SNMP é que não fecha**
  (creds/ACL/`snmp-server` no IOS, ou SNMP desligado). 13 → LLD nunca descobriu; 60 → LLD criou
  items mas polling falha. O N4 distingue: stats SNMP mostram **"Sem SNMP"** (`fieldConfig.noValue`),
  ICMP mostra "—", tabela/histórico ficam "No data". Acção e fix em Z.14 (cronograma).
- **Utilização % (T-08) — reclassificado: é dashboard, não Zabbix.** As interfaces **físicas já
  têm `ifSpeed`** (`Gi0/0/0.914` = 1 Gbps); só os **túneis** dão `0` (correcto — interface lógica
  sem largura física). Acção: activar % só quando `speed>0` (WAN físicas), túneis ficam em bps.
  % no túnel só com largura **contratada** injectada (macro/inventory por agência).
- **Per-spoke no hub (Z.15):** o hub só tem 1 item agregado + estado por provider; **zero**
  per-spoke. Fecha o *outage total* (confirma o túnel de cada agência mesmo com o router dela down)
  via LLD `CISCO-IPSEC-FLOW-MONITOR-MIB` (`cipSecTunnelTable`). Detalhe em Z.15 (cronograma).
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

**Alavancas para chegar à causa de agências DOWN:**
1. **Fechar Z.14** (a implementar) — recolher SNMP das interfaces dos agency routers ⇒ passamos a ter
   a **sequência pré-queda** (ex.: UNITEL caiu, depois MST, depois ICMP = falha dupla → energia/local).
2. **Correlação por PROVIDER via hub DMVPN** (`DC1-RTE-WAN-AG`) — **implementado v1, 2026-06-28**
   (painel N4 `l4-provider-context.js`, ver §9.6 abaixo).

## 9.6 — Painel "Operadoras WAN · saúde no hub DMVPN" (N4)

Responde, para uma agência DOWN: **"é outage da operadora ou problema local?"**. O hub DMVPN do
DC (`DC1-RTE-WAN-AG`, hostid 10996) é monitorizado centralmente e **sobrevive** à queda da agência.

**Correcção de engenharia (validada nos dados, 2026-06-28):** a premissa inicial ("túnel-hub DMVPN
down ⇒ outage") é **fraca** — os túneis `Tu10x` do hub são interfaces **multipoint lógicas**, quase
sempre UP. O sinal de saúde por operadora é a **combinação**:
- **Transporte (veredicto):** sub-interface P2P `Po2.x` Operational status = link L2/físico da
  operadora ao DC. Mapeamento: UNITEL `Po2.914` · ITA `Po2.51` · IPWORLD `Po2.413` · MULTITEL
  `Po2.173` · MST-Fibra `Po2.1506` · MST-VSAT `Po2.905` · MST-MW `Po2.341`.
- **Pulso (contexto):** tráfego rx do túnel DMVPN `Tu10x` = spokes da operadora a comunicar
  (colapso = dropout em massa). Mapeamento canónico por nº de túnel (consistente agência↔hub):
  `Tu101 UNITEL · Tu102 ITA · Tu103 IPWORLD · Tu104 MULTITEL · Tu105 MST-Fibra · Tu106 MST-VSAT · Tu107 MST-MW`.

**Regra de leitura:** operadora desta agência **saudável no hub** + agência DOWN ⇒ provável problema
**local**; transporte **DOWN** + várias agências dessa operadora em baixo ⇒ provável **outage da operadora**.

**Implementação:** painel Business Text `l4-provider-context.js` (id 211), `BPC.rpc` ao hub via Network.
Lê da **configuração**, por isso popula mesmo com a agência DOWN. Validado com CUNHINGA (2026-06-28):
todas as operadoras UP no hub ⇒ leitura "problema local". **Pré-requisito descoberto e corrigido:** o
`apiUrl` do `BPC.rpc` no `utils.js` do N4 apontava ao Infra; corrigido para a **Network**
(`ffo8sp8zllog0e`) — sem isto o hub não é encontrado.

**Honesto (Z.15):** estado **por operadora**, não por-spoke. Não confirma o túnel daquela agência
específica — isso exigiria NHRP/crypto por spoke no hub (acção Z.15). Destaque das operadoras que a
agência usa (a partir da config das suas interfaces) fica para v2.

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
| 211 | `l4-provider-context.js` | dynamictext (BT) | Operadoras WAN · saúde no hub DMVPN (§9.6) |

> `l4-ag-ficha.js` (Business Text) foi **substituído** pela ficha nativa em tabela
> (mais legível/robusta) e já não é painel activo; o ficheiro mantém-se no repo.
