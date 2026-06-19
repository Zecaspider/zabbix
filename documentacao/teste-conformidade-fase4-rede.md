# Teste de Conformidade — Fase 4 · Rede

> **Objectivo.** Validar, dashboard a dashboard, se os ecrãs do domínio Rede
> cumprem (a) os contratos do projecto — `engenharia-do-sistema.md` §10.1 (DoD),
> `framework-de-criacao-de-cards.md`, `rede-arquitectura.md` — e (b) a sua
> **razão de existir**: responder às perguntas do NOC e do engenheiro de redes.
>
> **Como usar.** Para cada dashboard, percorrer a Parte A (rubrica universal, 10
> dimensões) e depois o scorecard específico na Parte B. Registar cada item com
> o símbolo de estado e anotar a evidência. Os defeitos vão para a Parte D.
>
> Legenda: ☑ conforme · ◐ parcial · ✖ não-conforme · ∅ não-aplicável
>
> **Regra de avaliação.** Um dashboard só é "conforme Fase 4" quando: zero ✖ nas
> dimensões 1, 3, 8, 9 (são bloqueantes), e o scorecard de persona (dimensão 10)
> responde a **todas** as perguntas obrigatórias do seu nível.

---

## Inventário sob teste

| # | Dashboard | UID | Persona | Datasource dados | Ficheiros |
|---|---|---|---|---|---|
| D1 | **N2 · Rede** (Segmentos) | `ec590abd-c1ab-4b83-ac26-2b998aa80556` | NOC | `ffo8sp8zllog0e` | `n2/` kpi·segmentos·triggers |
| D2 | **N3 · DC Core** | `a75e2ba6-0ecc-49ee-bceb-4bcbafb419da` | NOC+Eng | `3_KgG43nz` (âncora) / network (dados) | `n3-dc/` fabric·table·wan |
| D3 | **N3 · Edifícios** | `471f2208-d032-46d4-8d35-6fdfe770c967` | NOC+Eng | `3_KgG43nz` | `n3-edificios/` table |
| D4 | **N3 · WAN** | `1702465e-0539-4fa7-a8eb-c0d3a655d99b` | NOC+Eng | `ffo8sp8zllog0e` | `n3-wan/` negocio·cards·triggers |
| D5 | **N3 · WAN — Carriers** | `31bace26-1af8-4b82-a6c1-f5c9116f4b83` | Eng | `ffo8sp8zllog0e` | `n3-wan-carriers/` carriers |
| D6 | **N4 · WAN Router** | `8ddc4833-be01-47ea-8ada-a89531d4babb` | Eng | `ffo8sp8zllog0e` | `n4-wan-router/` ficha + 3 TS nativos |
| D7 | **N4 · DC Switch** | `7baea796-e40b-4346-90ea-66516f369f8a` | Eng | `ffo8sp8zllog0e` | `n4-dc-switch/` ficha + 3 TS nativos |

> Pasta-alvo no Grafana: `04 · Rede` (`bfpm0sdxiclxcf`). Qualquer dashboard fora
> desta pasta é ✖ na dimensão 1.

---

## PARTE A — Rubrica universal (10 dimensões)

Aplicar a **todos** os dashboards. Cada check tem *como verificar* e *esperado*.

### Dimensão 1 · Identidade & Naming  *(bloqueante)*

| # | Check | Como verificar | Esperado |
|---|---|---|---|
| 1.1 | `nocLabel` correcto e do nível certo | abrir `utils.js`, campo `CFG_HEADER.nocLabel` | "REDE … — NÍVEL N" sem mojibake (`Ã`, `?`); nível bate com o dashboard |
| 1.2 | Título Grafana canónico | `GET /api/dashboards/uid/<uid>` → `.dashboard.title` | padrão `N‹n› · ‹nome›` (ex.: `N2 · Rede`) |
| 1.3 | Pasta correcta | `.meta.folderUid` | `bfpm0sdxiclxcf` (04 · Rede) |
| 1.4 | Datasource de dados certo | targets/RPC no `.js` | dados de rede via `ffo8sp8zllog0e`; nunca `3_KgG43nz` para dados |
| 1.5 | `content` = `elementId` do CFG | manifest `content` vs `CFG.rootId`/`elementId` no `.js` | id idêntico; senão painel renderiza em branco |
| 1.6 | Sem mojibake em qualquer texto visível | grep por `Ã`, `Â`, `?` em labels do `.js` | acentuação pt-PT correcta (ç, ã, é) |

### Dimensão 2 · Design NOC — legível a 3 metros

| # | Check | Esperado |
|---|---|---|
| 2.1 | Estado domina os dados | fundo/borda do card muda com `state-ok/warn/down` |
| 2.2 | Semáforo consistente | ok=verde `#22C55E` · warn=âmbar `#d29922` · crit=vermelho `#f85149` (do `THEME`) |
| 2.3 | Cor nunca é o único sinal | há texto (`OK`/`Degradado`/`Down`) ou ícone a acompanhar a cor |
| 2.4 | Hierarquia visual | o que está mau salta primeiro; verde é discreto |
| 2.5 | Densidade adequada ao persona | N2 = resumo (3 m); N3/N4 = denso mas legível |

### Dimensão 3 · Layout & viewport  *(bloqueante)*

| # | Check | Como verificar | Esperado |
|---|---|---|---|
| 3.1 | `transparent:true` em todos os painéis | JSON do dashboard | sem excepção (regra NOC, CLAUDE.md §4) |
| 3.2 | `title:""` nos painéis de conteúdo | JSON | só `utils` pode ter título |
| 3.3 | Sem scroll interno | abrir no browser, inspeccionar cada painel | conteúdo cabe na `gridPos.h`; sem barra interna |
| 3.4 | Layout final aplicado | gridPos não é o provisório (full-width empilhado) | painéis lado-a-lado, alturas definitivas |
| 3.5 | Snapshot gravado | existe `dashboard-completo.json` na pasta | presente e actualizado |

### Dimensão 4 · Telemetria & correcção dos dados

| # | Check | Esperado |
|---|---|---|
| 4.1 | Âncora real e disponível | `target` aponta a host/item Zabbix sempre presente (ICMP); render não fica vazio |
| 4.2 | Thresholds do catálogo §4 (rede-arquitectura) | RTT 5/50 ms · perda 1/10% · CPU 60/85 · RAM 80/92 · util if 70/90 · erros 1/10 · temp 60/75 — **nunca** hardcoded ad-hoc |
| 4.3 | Stale detection | dado velho → estado nunca aparece "OK" silencioso |
| 4.4 | IP SLA = verdade de serviço | estado do link vem de `rttMonCtrlAdminSense` / RTT, **não** de oper-status |
| 4.5 | BGP marcado como proxy | sessões BGP sinalizadas "estado por proxy" (interface `BGP_PEER_*`), nunca fingir BGP nativo |
| 4.6 | Estado bate com a realidade | comparar com Zabbix ao vivo (15–20 s de espera antes de concluir) |

### Dimensão 5 · Visualizações — a viz certa para a pergunta

| # | Check | Esperado |
|---|---|---|
| 5.1 | Histórico → timeseries | tráfego, CPU/RAM, RTT, erros usam série temporal nativa (não número solto) |
| 5.2 | Tráfego In/Out legível | `out` com `transform: negative-Y`; tooltip multi; legenda em tabela |
| 5.3 | Unidades correctas | bps (tráfego), percent 0–100 (CPU/RAM), ms (RTT), short (erros) |
| 5.4 | Linhas de threshold | RTT e erros mostram linha/step de aviso-crítico |
| 5.5 | Tabela para estado por entidade | inventário/porta/peer em tabela ordenável, não em prosa |
| 5.6 | Sparkline mostra a métrica crítica | tendência da métrica em problema, não sempre a mesma |

### Dimensão 6 · Troubleshooting & fluxo de drill-down

| # | Check | Esperado |
|---|---|---|
| 6.1 | Cada item desce um nível | linha/card do N2 → N3; linha do N3 → N4 (`var-hostid`/`routerName`/`switchName`) |
| 6.2 | Back-links | cada N3/N4 tem `← N‹n-1›` no header (`CFG_HEADER.backLink`) |
| 6.3 | Links por UID, não slug | drill usa `/d/<uid>/...`; resiste a rename |
| 6.4 | Variável propaga-se | abrir N4 a partir do N3 leva o device certo já seleccionado |
| 6.5 | Caminho de retorno completo | N4 → N3 → N2 sem becos sem saída |

### Dimensão 7 · Networking — correcção semântica

| # | Check | Esperado |
|---|---|---|
| 7.1 | Utilização de interface | `net.if.in/out` ÷ `net.if.speed[ifHighSpeed]`; não bps cru chamado "%" |
| 7.2 | Erros vs descartes | `errors` e `discards` distintos, por intervalo |
| 7.3 | Estado da interface | `net.if.status` (1=UP, 2=DOWN) interpretado correctamente |
| 7.4 | IP SLA por provider | `rttMonCtrlAdminSense` (saúde) + `rttMonCtrlAdminCompletionTime` (RTT) por entrada |
| 7.5 | Distinção oper-status × serviço | UP com IP SLA NOT OK aparece como degradado (ex.: ITA), não verde |
| 7.6 | Categorização de circuitos | links agrupados por papel (Internet/Agências/EMIS/Parceiros), não lista plana |

### Dimensão 8 · Clareza & ausência de placeholders  *(bloqueante)*

| # | Check | Como verificar | Esperado |
|---|---|---|---|
| 8.1 | **Sem labels hardcoded de estado-de-obra** | grep `n3 ainda`, `em construção`, `por construir`, `TODO`, `placeholder`, `PLACEHOLDER`, `null` em labels | **zero** ocorrências visíveis num dashboard que já existe |
| 8.2 | Cards de segmento ligam ao N3 real | `l2-segmentos.js` → `dashUid` preenchido para DC/Edifícios/WAN | os 3 cards têm UID, nenhum diz "em construção" |
| 8.3 | Sem dados demo/fake em produção | grep `Math.random`, `DEMO`, mock | nenhum dado inventado em ecrã NOC |
| 8.4 | "Não identificado" residual documentado | contar entradas sem classificação | ≤ limite aceite na nota do cronograma (WAN: 3) e rotulado, não em branco |
| 8.5 | Erro é explícito | simular falha (Network offline) | card de erro visível, nunca painel mudo |

### Dimensão 9 · Conformidade de código  *(bloqueante)*

| # | Check | Como verificar | Esperado |
|---|---|---|---|
| 9.1 | Sintaxe válida | `node --check <ficheiro>.js` | passa em todos |
| 9.2 | Bootstrap `initWithRetry` | topo dos painéis de conteúdo | presente; sem `waitForBPC` directo sem guarda |
| 9.3 | Não redefine globais | grep `BPC_SHARED =`, `BPC_CHARTS =`, `THEME =` nos painéis | só `utils.js` define |
| 9.4 | Tamanho | `wc -l` | ficheiro < 500 linhas; funções ≤ 20 |
| 9.5 | CFG aninhado, sem hardcode | revisão do bloco CFG | proxy/datasource/thresholds/UIDs no CFG, não embutidos |
| 9.6 | `id` no manifest | manifest vs Grafana | todos os painéis com `id` (nenhum `null` por subir) |

### Dimensão 10 · Operação — responde à pergunta do persona?

> Esta é a dimensão que mais falha hoje. Não basta render bonito: o ecrã tem de
> **responder**. Marcar ✖ se a resposta exige sair do dashboard ou adivinhar.

**Perguntas NOC (N2/N3):**
- 10.N1 Está tudo verde? (estado agregado num relance)
- 10.N2 Se não, **onde** dói? (segmento/device identificável sem clicar)
- 10.N3 Com que **gravidade**? (sev visível, ordenada)
- 10.N4 Para onde vou a seguir? (drill óbvio para o problema)

**Perguntas Engenheiro (N3/N4):**
- 10.E1 **Porquê**? (causa raiz: que interface/peer/link/erro)
- 10.E2 Desde quando / tendência? (série temporal, flapping)
- 10.E3 Qual o impacto de negócio? (que serviço/circuito afecta)
- 10.E4 É serviço ou só camada física? (IP SLA vs oper-status)

---

## PARTE B — Scorecards por dashboard

Cada scorecard lista: a **pergunta-âmbito** (porque existe), os painéis a validar,
e os checks específicos que se somam à rubrica universal.

### D1 · N2 · Rede (Segmentos) — `ec590abd`  · persona NOC

**Âmbito:** wallboard do domínio. Responde "a rede está bem? se não, qual dos 3
segmentos (DC / Edifícios / WAN) e com que gravidade?" — a 3 metros.

**Execução:** 2026-06-19 · evidência via API Grafana + leitura de código local.

| Painel | Ficheiro | Checks específicos |
|---|---|---|
| KPI strip | `l2-kpi.js` | 5 KPIs: Dispositivos UP/total · Alertas por sev · Pior segmento · Links WAN UP · BGP peers UP (proxy). Cada KPI lê dados reais (network), não placeholder |
| Segmentos | `l2-segmentos.js` | 3 cards DC/Edifícios/WAN: estado agregado + up/down + drill p/ N3 com `dashUid` real |
| Top triggers | `l2-triggers.js` | triggers de toda a rede (sev desc) + link directo ao N4 do host |

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.1 | nocLabel | ☑ | `utils.js` linha 24: `nocLabel: 'REDE — NÍVEL 2'` — correcto, sem mojibake |
| 1.2 | Título canónico | ◐ | Grafana: `"N2 · Segmentos"`. Arquitectura §2 chama-lhe "N2 · Rede". Padrão ok mas nome diverge. |
| 1.3 | Pasta correcta | ☑ | `folderUid: bfpm0sdxiclxcf` = "04 · Rede" — confirmado via API |
| 1.4 | Datasource de dados correcto | ☑ | `l2-kpi.js`: `kpiNetFetchIcmp/Triggers/Wan` chamam `rpc` (network `ffo8sp8zllog0e`) e não `3_KgG43nz` para dados |
| 1.5 | `content` = `elementId` | ☑ | manifest: `"bpc-net-kpi"` / `"bpc-net-seg"` / `"bpc-net-trg"` batem com CFG de cada `.js` |
| 1.6 | Sem mojibake | ☑ | Nenhum padrão `ÃÂ` detectado no texto DOM nem nos ficheiros |
| 2.x | Design NOC | ◐ | Arquitectura correcta (semáforo, pill de estado). Não verificável visualmente via DOM por sandbox Grafana 12. |
| 3.1 | `transparent:true` | ☑ | Todos os 4 painéis confirmados via API |
| 3.2 | `title:""` conteúdo | ☑ | Painéis 101/103/104 têm `title:""` confirmado via API |
| 3.3 | Sem scroll interno | ✖ | **Buraco de layout: painel 101 (KPI) acaba em y=8; painel 103 (Segmentos) começa em y=26 — 18 linhas de espaço vazio entre painéis.** Causa: antigos painéis dc/edificios-rt/sw foram removidos mas o gridPos não foi compactado. |
| 3.4 | Layout final aplicado | ✖ | Mesma evidência: KPI (y=3,h=5) → vazio (y=8 a y=26) → Segmentos (y=26,h=8) → Triggers (y=34,h=8). Ordem estranha: Segmentos vem antes dos Triggers mas ambos depois do buraco. |
| 3.5 | Snapshot gravado | ✖ | Não existe `rede/n2/dashboard-completo.json` |
| 4.1 | Âncora real | ☑ | Âncora: Storage IBM FS9500 / ICMP ping (datasource Infra). Painel usa `rpc` de rede para dados. |
| 4.2 | Thresholds do catálogo | ☑ | `l2-kpi.js` usa `window.BPC.NET_THR` (catálogo §4). Sem valores hardcoded. |
| 4.4 | IP SLA = verdade de serviço | ☑ | `l2-kpi.js` linha 133: `rttMonCtrlAdminSense` para slaOk. `l2-segmentos.js` linha 140: `slaNotOk` → state 'warn'. Correcto. |
| 4.5 | BGP por proxy | ☑ | `l2-kpi.js` linha 130: `BGP_PEER` regex em interfaces. Comentário explícito "não há MIB BGP". |
| 8.1 | Sem labels hardcoded de obra | ◐ | String `"N3 em construção"` existe no afterRender do painel 103 em Grafana (código morto — todos os segmentos têm dashUid). Mas o texto está no JS local e em produção. **Deve ser removido para conformidade.** |
| 8.2 | Cards de segmento ligam ao N3 real | ☑ | `l2-segmentos.js` CFG: DC=`a75e2ba6`, Edifícios=`471f2208`, WAN=`1702465e` — todos preenchidos. `hasN3DrillUid: true` confirmado via afterRender em Grafana. |
| 8.3 | Sem dados demo/fake | ☑ | Nenhum `Math.random` nem `DEMO` nos ficheiros. |
| 9.1 | `node --check` | ☑ | `l2-kpi.js`, `l2-segmentos.js`, `l2-triggers.js` — todos passam |
| 9.2 | Bootstrap `initWithRetry` | ◐ | Cada ficheiro tem variante com nome próprio (`kpiNetInitWithRetry`, `segInitWithRetry`, `trgInitWithRetry`) — padrão correcto implementado, mas Grafana reporta `initWithRetry:false` no afterRender porque o nome literal difere. Funcional mas diverge da convenção §6. |
| 9.3 | Não redefine globais | ☑ | Nenhum ficheiro redefine `BPC_SHARED`, `BPC_CHARTS`, `THEME` |
| 9.5 | CFG sem hardcode | ☑ | Datasource, thresholds (via BPC.NET_THR), UIDs — tudo em CFG |
| 9.6 | `id` no manifest | ☑ | Todos os painéis: 100/101/103/104 — nenhum null |
| 10.N1 | Estado agregado de relance | ☑ | KPI strip com 5 tiles + Segmentos com 3 cards coloridos |
| 10.N2 | Onde dói? | ☑ | Pior segmento identificado no KPI tile 4; card de segmento com cor |
| 10.N3 | Gravidade? | ☑ | Pills + cores + contadores crit/warn |
| 10.N4 | Drill óbvio? | ☑ | Cards de segmento são links clicáveis para N3. Triggers sem link directo N4 por host — **gap menor** |

**Checks de persona:** 10.N1 ☑ · 10.N2 ☑ · 10.N3 ☑ · 10.N4 ◐

**Veredicto D1: Não-conforme** — 2 ✖ bloqueantes (dim 3.3 layout, dim 3.4 gridPos) + dim 3.5 sem snapshot.

---

### D2 · N3 · DC Core — `a75e2ba6`  · persona NOC + Eng

**Âmbito:** sala de triagem do fabric Spine-Leaf (g26) + routers WAN (g27).
Responde "o fabric está saudável? que spine/leaf/uplink falha?"

**Execução:** 2026-06-19 · evidência via API Grafana + leitura de código local.

| Painel | Ficheiro | Checks específicos |
|---|---|---|
| Saúde do Fabric | `l3-dc-fabric.js` | topologia spine-leaf; estado por nó; uplinks |
| Tabela | `l3-dc-table.js` | por switch: estado, CPU, util, erros; drill → N4 DC Switch + N4 WAN Router |
| WAN por Router | `l3-dc-wan.js` | links por router WAN; estado por proxy/IP SLA |

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.1 | nocLabel | ☑ | `utils.js` n3-dc: `nocLabel: 'REDE — NÍVEL 3 · DC'` (confirmado no afterRender panel 100: `hasBackLink: true`) |
| 1.2 | Título canónico | ☑ | `"N3 · DC Core"` — padrão correcto |
| 1.3 | Pasta correcta | ☑ | `folderUid: bfpm0sdxiclxcf` = "04 · Rede" ✓ |
| 1.5 | `content` = `elementId` | ☑ | `bpc-n3dc-fabric` / `bpc-n3dc-table` / `bpc-n3dc-wan` batem entre manifest e CFG |
| 3.1 | `transparent:true` | ☑ | Todos os 4 painéis — confirmado via API |
| 3.2 | `title:""` conteúdo | ☑ | Painéis 102/103/104 têm `title:""` |
| 3.3 | Sem scroll interno | ◐ | Não verificável por sandbox. Fabric (h=22) é alto — risco de scroll. A confirmar visualmente. |
| 3.4 | Layout final | ✖ | **Buraco de 8 linhas: utils termina y=3, fabric começa y=11**. gridPos provisório não foi compactado. Table (y=33) e WAN (y=41) são consecutivos entre si ✓, mas o buraco inicial existe. |
| 3.5 | Snapshot gravado | ✖ | `rede/n3-dc/dashboard-completo.json` não existe (`ls` confirma) |
| 4.1 | Âncora real | ☑ | Manifest: âncora ICMP ping DC1-SPINE-11 (grupo HG_DC_SWITCHES, datasource network). Não Storage Infra — correcto para este dashboard. |
| 4.2 | Thresholds do catálogo | ☑ | `l3-dc-table.js` CFG_DC.thresholds: RTT 5/50, perda 1/10, CPU 60/85, mem 80/92 — bate com catálogo §4 |
| 4.4 | IP SLA = verdade | ∅ | `l3-dc-wan.js` usa oper-status das interfaces WAN (net.if.status). IP SLA só está em N3-WAN. Aqui o painel mostra estado de interface, não de serviço — aceitável para este nível de detalhe de fabric. |
| 5.5 | Tabela ordenável | ☑ | l3-dc-table: switches ordenados Spine→Leaf; routers por função. Colunas: dot·host·tier/funcao·modelo·CPU·RAM·uptime·alerts |
| 6.1 | **Drill N3→N4** | ✖ | **CRÍTICO: panel 103 em Grafana não tem os drills N4** (`hasDrillN4sw: false`, `hasDrillN4rt: false` via API). Ficheiro local `l3-dc-table.js` tem os links (`/d/7baea796...` e `/d/8ddc4833...`). O push com drills nunca foi feito. |
| 6.2 | Back-link N3→N2 | ☑ | Panel 100 (utils): `hasBackLink: true` — back para N2 Rede presente no header |
| 6.3 | Links por UID | ☑ | Local: `/d/7baea796-...` e `/d/8ddc4833-...` — UIDs correctos. Problema é só o push ausente. |
| 7.3 | Estado interface | ☑ | `l3-dc-fabric.js`: `fabUp(lastvalue)` → `String(lastvalue) === '1'`. Correcto. |
| 7.6 | Categorização circuitos | ☑ | `l3-dc-wan.js`: WAN-INT (BGP), EMIS, WAN-AG (DMVPN+Azure+P2P), PARC, GTW01 — 5 categorias |
| 8.1 | Sem placeholders | ◐ | `hasPlaceholders: true` em painéis 100, 102, 104. Necessita investigação — possível falso positivo por conteúdo legítimo (ex: texto PT com "em construção" num comentário). Não crítico. |
| 9.1 | `node --check` | ☑ | `l3-dc-fabric.js` ✓, `l3-dc-table.js` ✓, `l3-dc-wan.js` ✓ |
| 9.2 | Bootstrap retry | ☑ | Todos usam padrão `*InitWithRetry` (`fabInitWithRetry`, `dcInitWithRetry`, `wanInitWithRetry`) |
| 9.5 | CFG sem hardcode | ☑ | Thresholds no CFG; UIDs hardcoded no código de render (linha 414/436) — aceitável neste padrão sem bundler |
| 9.6 | `id` no manifest | ☑ | Painéis 100/102/103/104 — todos têm id |
| 10.N1 | Estado de relance | ☑ | l3-dc-fabric: headline "Fabric saudável / N ligação(ões) down" |
| 10.N2 | Onde dói? | ☑ | Fabric: dot por nó. Tabela: dot + borda por linha. WAN: badge DOWN por router |
| 10.N3 | Gravidade? | ☑ | Cores crit/warn/ok; triggers contados |
| 10.N4 | Drill p/ N4? | ✖ | Drill existe no código local mas **não está no Grafana** (push pendente). NOC não consegue clicar. |
| 10.E1 | Porquê? | ☑ | Fabric: qual uplink/vPC/overlay falha. Table: CPU/RAM/RTT. WAN: qual secção/interface |
| 10.E2 | Desde quando? | ◐ | Uptime visível mas sem série temporal neste dashboard (séries estão no N4) |

**Checks de persona:** 10.N1 ☑ · 10.N2 ☑ · 10.N3 ☑ · 10.N4 ✖ · 10.E1 ☑ · 10.E2 ◐

**Veredicto D2: Não-conforme** — 3 ✖ (dim 3.4 layout, dim 6.1 drills N4 não em Grafana, dim 3.5 sem snapshot).

---

### D3 · N3 · Edifícios — `471f2208`  · persona NOC + Eng

**Âmbito:** routers (g28) + switches (g29) dos edifícios. Responde "que andar/edifício tem problema?"

**Execução:** 2026-06-19 · evidência via API Grafana + leitura de código local.

| Painel | Ficheiro | Checks específicos |
|---|---|---|
| Utils | `utils.js` | header + BPC runtime |
| Tabela | `l3-edificios-table.js` | tabs Routers/Switches; estado por device; drill → N4 (ausente) |

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.2 | Título canónico | ☑ | `"N3 · Edifícios"` — padrão correcto |
| 1.3 | Pasta correcta | ☑ | `folderUid: bfpm0sdxiclxcf` = "04 · Rede" ✓ |
| 1.5 | `content` = `elementId` | ☑ | manifest: `bpc-n3ed-table` bate com `CFG_N3ED.elementId` |
| 3.1 | `transparent:true` | ☑ | Ambos os painéis — confirmado via API |
| 3.2 | `title:""` conteúdo | ◐ | Panel 101 não tem `title:""` explícito — API retornou sem campo; a verificar |
| 3.3 | Sem scroll | ◐ | h=18 para uma tabela de 55 hosts (9 routers + 46 switches) — alto risco de scroll. Não verificável por sandbox. |
| 3.4 | Layout | ☑ | Utils (y=0,h=3) → Table (y=3,h=18) — consecutivos, sem buracos |
| 3.5 | Snapshot | ✖ | `rede/n3-edificios/dashboard-completo.json` não existe |
| 4.2 | Thresholds catálogo | ◐ | CPU: código tem warn:70/crit:90; catálogo §4 diz warn:60/crit:85 — **divergência**. RTT 5/50 ✓, perda 1/5 (crit:5 vs catálogo 1/10 — mais restritivo, aceitável) |
| 6.1 | Drill N3→N4 | ✖ | **Drills N4 completamente ausentes do código local** (grep confirmado: zero ocorrências de `N4`, `7baea796`, `switchName`). Não é push pendente — a funcionalidade não foi implementada. |
| 6.2 | Back-link N3→N2 | ☑ | `hasBackLink: true` em panel 101 — back-link para N2 presente |
| 8.1 | Sem placeholders | ☑ | `hasPlaceholders: false` nos 2 painéis |
| 9.1 | `node --check` | ☑ | `l3-edificios-table.js` passa |
| 9.2 | Bootstrap retry | ☑ | `initWithRetry: true` em panel 101 |
| 9.6 | `id` no manifest | ✖ | Manifest tem `"id": null` para `l3-edificios-table.js` mas Grafana tem `id: 101` — manifest nunca foi actualizado após o push |
| 10.N1 | Estado de relance | ◐ | Sem KPI strip dedicado. Estado visível só na tabela (dot por linha). Não é wallboard NOC a 3 m. |
| 10.N2 | Onde dói? | ☑ | Tabela por device + tag `edificio`/`local` — identifica andar/edifício |
| 10.N3 | Gravidade? | ☑ | Dot colorido (ok/warn/crit/down) + texto de estado por linha |
| 10.N4 | Drill p/ N4? | ✖ | Ausente — não implementado. NOC chega ao edifício mas não ao device. |
| 10.E1 | Porquê? | ◐ | CPU/RTT/perda visíveis na tabela mas sem categorização de causa raiz |

**Checks de persona:** 10.N1 ◐ · 10.N2 ☑ · 10.N3 ☑ · 10.N4 ✖ · 10.E1 ◐

**Veredicto D3: Não-conforme** — 3 ✖ (dim 6.1 drills N4 não implementados, dim 3.5 sem snapshot, dim 9.6 manifest id null) + threshold de CPU diverge do catálogo.

---

### D4 · N3 · WAN — `1702465e`  · persona NOC + Eng

**Âmbito:** links WAN por router (interfaces do g27). Responde "que circuito/provider está em baixo ou degradado?"

**Execução:** 2026-06-19 · evidência via API Grafana + leitura de código local.

> ⚠ `l3-wan-cards.js` é ficheiro de outra IA — não modificar; só avaliar.

#### Estrutura real no Grafana (9 painéis vs 4 no manifest)

| id | Conteúdo | y | h | Problema |
|---|---|---|---|---|
| 100 | utils (BT) | 0 | 3 | ✓ |
| 101 | `bpc-n3wan-cards` (BT, `l3-wan-cards`) | 3 | **45** | h=45 → scroll enorme |
| 102 | TS nativo: Latência ICMP | 48 | 8 | título visível (nativo — ok) |
| 103 | TS nativo: Packet Loss ICMP | 56 | 8 | ok |
| 104 | TS nativo: IP SLA RTT WAN-INT | 64 | 8 | ok |
| 105 | **utils duplicado** (BT, title="Header + Shared") | 72 | 8 | **duplicate utils + título visível** |
| 106 | `bpc-wan-negocio` (BT, `l3-wan-negocio`) | 80 | 8 | ok |
| 107 | `bpc-wan-triggers` (BT, `l3-wan-triggers`) | 88 | 8 | ok |
| 108 | `bpc-n3wan-cards` **duplicado** (BT) | 96 | 8 | **duplicate do id=101** |

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.2 | Título canónico | ☑ | `"N3 · WAN"` ✓ |
| 1.3 | Pasta correcta | ☑ | `bfpm0sdxiclxcf` = "04 · Rede" ✓ |
| 3.1 | `transparent:true` | ☑ | Todos os 9 painéis ✓ |
| 3.2 | `title:""` conteúdo | ✖ | **Panel 105 (utils duplicado) tem `title:"Header + Shared"` visível** |
| 3.3 | Sem scroll | ✖ | **Panel 101 (wan-cards) h=45** — scroll interno garantido. Causa: gridPos provisório nunca ajustado |
| 3.4 | Layout / estrutura | ✖ | **Dashboard tem 9 painéis em vez dos 4 do manifest**: utils duplicado (id=100 e 105), cards duplicado (id=101 e 108), 3 TS nativos não previstos no manifest, ordem inconsistente |
| 3.5 | Snapshot | ✖ | `rede/n3-wan/dashboard-completo.json` não existe |
| 4.4 | IP SLA = verdade | ☑ | Panel 101 (`l3-wan-cards`): `hasIpSla: true`. Panel 106 (`l3-wan-negocio`): `hasIpSla: true` + `hasBgpProxy: true`. Panel 104: TS IP SLA RTT nativo ✓ |
| 4.5 | BGP por proxy | ☑ | Panel 106: `hasBgpProxy: true` — BGP tratado por proxy ✓ |
| 6.1 | Drill N3→N4 | ✖ | **`l3-wan-triggers.js` linha 22: `n4DashUid: null`** — placeholder nunca preenchido. N4 WAN Router (`8ddc4833`) existe mas não está ligado. `l3-wan-negocio.js`: sem drill. `l3-wan-cards.js`: não verificado (outra IA). |
| 6.2 | Back-link N3→N2 | ☑ | Panel 100 (utils): `hasBackLink: true` ✓ |
| 8.1 | Sem placeholders | ☑ | `hasPlaceholders: false` em todos os painéis ✓ |
| 9.1 | `node --check` | ☑ | `l3-wan-negocio.js` ✓, `l3-wan-triggers.js` ✓ |
| 9.2 | Bootstrap retry | ☑ | Painéis 101/106/107/108 têm `initWithRetry: true` ✓ |
| 9.6 | `id` no manifest | ✖ | Manifest tem `id:null` para negocio/cards/triggers; Grafana tem IDs 101/106/107/108. Manifest nunca actualizado. |
| 10.N1 | Estado de relance | ☑ | `l3-wan-cards.js`: estado por router. `l3-wan-negocio.js`: vista por categoria de negócio |
| 10.N4 | Drill p/ N4? | ✖ | Triggers sem drill (null). Negocio sem drill. Cards (outra IA) não verificado. |
| 10.E3 | Impacto de negócio? | ☑ | `l3-wan-negocio.js` (`hasBgpProxy: true`, `hasIpSla: true`) — categorização por tipo de negócio ✓ |
| 10.E4 | Serviço vs físico? | ☑ | IP SLA usado como verdade de serviço (dim 4.4 ✓) |

**Checks de persona:** 10.N1 ☑ · 10.N4 ✖ · 10.E3 ☑ · 10.E4 ☑

**Veredicto D4: Não-conforme** — múltiplos ✖ bloqueantes: estrutura do dashboard completamente divergente do manifest (duplicados, h=45, utils duplo), sem snapshot, drills N4 ausentes.

---

### D5 · N3 · WAN — Carriers — `31bace26`  · persona Eng

**Âmbito:** vista por operadora/carrier. Responde "qual o desempenho por provider (MSTELCOM, ITA, AT…)?"

**Execução:** 2026-06-19 · evidência via API Grafana + manifests locais.

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.2 | Título canónico | ☑ | `"N3 · WAN — Carriers"` ✓ |
| 1.3 | Pasta correcta | ☑ | `bfpm0sdxiclxcf` ✓ |
| 3.1 | `transparent:true` | ☑ | Ambos os painéis ✓ |
| 3.2 | `title:""` conteúdo | ☑ | Panel 102 (carriers): title="" ✓. Panel 100 (utils): title="Header + Shared" — correcto por convenção |
| 3.3 | Sem scroll | ✖ | **Panel 102 h=48** — 48 linhas para uma tabela de carriers garante scroll interno. |
| 3.4 | Layout | ☑ | utils (y=0,h=4) → carriers (y=4,h=48) — consecutivos, sem buracos |
| 3.5 | Snapshot | ✖ | `rede/n3-wan-carriers/dashboard-completo.json` não existe |
| 4.4 | IP SLA = verdade | ☑ | `hasIpSla: true` em panel 102 ✓ |
| 4.5 | BGP por proxy | ☑ | `hasBgpProxy: true` em panel 102 ✓ |
| 6.1 | Drill N3→N4 | ∅ | Carriers é view terminal por operadora — não há N4 por carrier. Sem drill, por design. |
| 6.2 | Back-link N3→N2 | ☑ | `hasBackLink: true` no panel 100 (utils) ✓ |
| 8.1 | Sem placeholders | ☑ | `hasPlaceholders: false` ✓ |
| 9.1 | `node --check` | ☑ | `l3-wan-carriers.js` passa ✓ |
| 9.2 | Bootstrap retry | ☑ | `initWithRetry: true` no panel 102 ✓ |
| 9.6 | `id` no manifest | ☑ | ids 100 e 102 definidos ✓ (gap 101→102 é cosmético — panel foi recriado) |
| 10.E1 | Desempenho por carrier? | ☑ | hasIpSla + hasBgpProxy: categorização por provider confirmada |
| 10.E3 | Impacto de negócio? | ☑ | Vista agregada por operadora permite identificar impacto de falha de provider |
| 10.E4 | Serviço vs físico? | ☑ | IP SLA como verdade de serviço ✓ |

**Checks de persona:** 10.E1 ☑ · 10.E3 ☑ · 10.E4 ☑

**Veredicto D5: Parcialmente conforme** — 2 ✖ (h=48 scroll, sem snapshot). Não bloqueante para persona (conteúdo correcto), mas layout precisa de ajuste.

---

### D6 · N4 · WAN Router — `8ddc4833`  · persona Eng  · `var-routerName`

**Âmbito:** bancada do engenheiro para 1 router WAN. Responde "porquê este router? que circuito, BGP, IP SLA, flapping?"

**Execução:** 2026-06-19 · evidência via API Grafana + ficheiros locais.

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.2 | Título canónico | ☑ | `"N4 · WAN Router"` ✓ |
| 1.3 | Pasta correcta | ☑ | `bfpm0sdxiclxcf` ✓ |
| 1.4 | Variável Grafana `routerName` | ☑ | manifest: `variable.name = "routerName"`, custom dropdown com 5 routers ✓ |
| 3.1 | `transparent:true` | ☑ | Todos os 5 painéis ✓ |
| 3.2 | `title:""` conteúdo | ☑ | Panel 101 (ficha): title="" ✓. Nativos (102-104): títulos visíveis (correcto em nativos) |
| 3.3 | Sem scroll | ◐ | BT panel h=23 — razoável para uma ficha. TS nativos h=10 cada. A validar visualmente. |
| 3.4 | Layout | ☑ | utils(y=0,h=4) → ficha(y=4,h=23) → TS(y=27,37,47 h=10) — consecutivos ✓ |
| 3.5 | Snapshot | ✖ | `rede/n4-wan-router/dashboard-completo.json` não existe |
| 4.4 | IP SLA = verdade | ☑ | `hasIpSla: true` no panel 101 ✓. TS nativo 104 mostra RTT IP SLA histórico ✓ |
| 4.5 | BGP por proxy | ☑ | `hasBgpProxy: true` no panel 101 ✓ |
| 5.2 | TS tráfego `negative-Y` | ☑ | manifest `nativePanels[0]`: `"custom.transform": "negative-Y"` no `out` ✓ |
| 6.2 | Back-link N4→N3 | ✖ | **`hasBackLink: false` no Grafana** mas `utils.js` local linha 68 tem `backLink: { url: '/d/1702465e-...', label: '← N3 WAN' }`. Push local nunca feito para o Grafana. |
| 6.3 | `var-routerName=` nos drills | ☑ | `hasVarRouter: true` no panel 101 ✓ |
| 8.1 | Sem placeholders | ☑ | `hasPlaceholders: false` ✓ |
| 9.1 | `node --check` | ☑ | `l4-wan-router-ficha.js` ✓ |
| 9.2 | Bootstrap retry | ☑ | `initWithRetry: true` no panel 101 ✓ |
| 9.6 | `id` no manifest | ☑ | ids 100 e 101 definidos; TS nativos não têm id no manifest (correcto — são `nativePanels`) ✓ |
| 10.E1 | Ficha técnica completa? | ☑ | hasBgpProxy + hasIpSla confirmam circuitos + BGP + SLA |
| 10.E2 | Histórico de séries? | ☑ | 3 TS nativos: tráfego 6h + CPU/RAM 24h + RTT IP SLA 6h ✓ |
| 10.E4 | Serviço vs físico? | ☑ | IP SLA (serviço) + TS tráfego (físico) ✓ |

**Checks de persona:** 10.E1 ☑ · 10.E2 ☑ · 10.E4 ☑

**Veredicto D6: Parcialmente conforme** — 2 ✖ (back-link ausente no Grafana, sem snapshot). Conteúdo da ficha técnica correcto; back-link é de usabilidade critica (NOC não consegue voltar a N3).

---

### D7 · N4 · DC Switch — `7baea796`  · persona Eng  · `var-switchName`

**Âmbito:** bancada do engenheiro para 1 switch DC (Spine ou Leaf). Responde "porquê este switch? uplinks fabric, erros, tráfego?"

**Execução:** 2026-06-19 · evidência via API Grafana + ficheiros locais.

#### Resultados por dimensão

| Dim | Check | Estado | Evidência |
|---|---|---|---|
| 1.2 | Título canónico | ☑ | `"N4 · DC Switch"` ✓ |
| 1.3 | Pasta correcta | ☑ | `bfpm0sdxiclxcf` ✓ |
| 1.4 | Variável Grafana `switchName` | ☑ | manifest: variável query-type 4 auto-populada com todos os hosts de `HG_DC_SWITCHES` (grupo 26) ✓ |
| 3.1 | `transparent:true` | ☑ | Todos os 5 painéis ✓ |
| 3.2 | `title:""` conteúdo | ☑ | Panel 101 (ficha): title="" ✓. Nativos: títulos visíveis (correcto) |
| 3.3 | Sem scroll | ◐ | BT panel h=23. A validar visualmente. |
| 3.4 | Layout | ☑ | utils(y=0,h=4) → ficha(y=4,h=23) → TS(y=27,37,47 h=10) — consecutivos ✓ |
| 3.5 | Snapshot | ✖ | `rede/n4-dc-switch/dashboard-completo.json` não existe |
| 4.4 | IP SLA | ∅ | Switches DC usam ICMP, não IP SLA — `hasIpSla: false` correcto para este nível |
| 5.2 | TS tráfego `negative-Y` | ☑ | manifest `nativePanels[0]`: `"custom.transform": "negative-Y"` no `out` ✓ |
| 5.3 | Erros de interface | ☑ | `nativePanels[2]`: "Erros de interface — últimas 6h" com `net.if.errors`, threshold red≥1 ✓ |
| 6.2 | Back-link N4→N3 | ✖ | **`hasBackLink: false` no Grafana** mas `utils.js` local linha 68 tem `backLink: { url: '/d/a75e2ba6-...', label: '← N3 DC Core' }`. Push pendente. |
| 6.3 | `var-switchName=` nos drills | ☑ | `hasVarRouter: true` no panel 101 (aceita `var-switchName`) ✓ |
| 8.1 | Sem placeholders | ☑ | `hasPlaceholders: false` ✓ |
| 9.1 | `node --check` | ☑ | `l4-dc-switch-ficha.js` ✓ |
| 9.2 | Bootstrap retry | ☑ | `initWithRetry: true` no panel 101 ✓ |
| 9.6 | `id` no manifest | ☑ | ids 100 e 101 definidos ✓ |
| 10.E1 | Ficha técnica completa? | ☑ | hasVarRouter ✓ — por switch, com uplinks e estado de portas |
| 10.E2 | Histórico de séries? | ☑ | 3 TS nativos: tráfego uplinks 6h + CPU 24h + erros interface 6h ✓ |

**Checks de persona:** 10.E1 ☑ · 10.E2 ☑

**Veredicto D7: Parcialmente conforme** — 2 ✖ (back-link ausente no Grafana, sem snapshot). Estrutura técnica sólida (3 TS nativos bem documentados, erros de interface com threshold). Back-link é usabilidade crítica.

**Checks de persona:** 10.E1 ☐ · 10.E2 ☐ · 10.E3 ☐ · 10.E4 ☐
**Verificar:** variável `routerName` resolve hostname→hostid no BT; TS usam `$routerName` directo; back-link → N3 WAN.

---

### D7 · N4 · DC Switch — `7baea796`  · persona Eng  · `var-switchName`

**Âmbito:** bancada para 1 switch DC. Responde "porquê este switch? que uplink, CRC, BGP EVPN, flapping?"

| Painel | Tipo | Checks específicos |
|---|---|---|
| Ficha Técnica | DT `l4-dc-switch-ficha.js` | ficha + fabric categorizado + impacto negócio + BGP EVPN + erros CRC + flapping 4h |
| Tráfego uplinks | TS nativo | in/out, `negative-Y`, bps |
| CPU 24h | TS nativo | percent 0–100 |
| Erros interface 6h | TS nativo | unit short, step vermelho ≥1 (5.4) |

**Checks de persona:** 10.E1 ☐ · 10.E2 ☐ · 10.E3 ☐ · 10.E4 ☐
**Verificar:** variável `switchName` (query → HG_DC_SWITCHES) auto-popula; back-link → N3 DC Core.

---

## PARTE C — Teste de fluxo ponta-a-ponta (transversal)

Validar a navegação como um operador a perseguir um incidente:

```
N2 Rede ──card DC──────► N3 DC Core ──linha switch──► N4 DC Switch ──back──► N3 ──back──► N2
N2 Rede ──card WAN─────► N3 WAN ─────linha router──► N4 WAN Router ─back──► N3 ──back──► N2
N2 Rede ──card Edif────► N3 Edifícios ─linha device─► N4 (drill em falta — 4.5)
```

| # | Check | Esperado |
|---|---|---|
| C.1 | N2 → cada N3 abre o dashboard certo | 3 cards, 3 UIDs correctos |
| C.2 | N3 → N4 leva o device seleccionado | variável preenchida no destino |
| C.3 | Back-link em cada N3 e N4 | volta um nível sem perder contexto |
| C.4 | Nenhum link partido | todos por UID; 0 erros 404 |
| C.5 | Coerência de estado entre níveis | N1/N2 não contradizem o N3/N4 (mesmo problema, mesma cor) |

---

## PARTE D — Registo de defeitos (preencher na execução)

| ID | Dashboard | Dimensão | Defeito | Severidade | Acção | Estado |
|---|---|---|---|---|---|---|
| F-01 | D1 N2 | 3.3/3.4 | **Buraco de 18 linhas no layout**: KPI (y=3,h=5) termina em y=8; Segmentos começa em y=26. Ecrã tem vazio enorme. Causa: antigos painéis removidos, gridPos não compactado. | **Alta** | Compactar gridPos: Segmentos → y=8, Triggers → y=16. Push JSON completo. | ☑ |
| F-02 | D1 N2 | 3.5 | Sem `rede/n2/dashboard-completo.json` — snapshot nunca foi gravado. | Média | Pull do dashboard após fix F-01, guardar snapshot. | ☑ |
| F-03 | D1 N2 | 8.1 | String `"N3 em construção"` no código morto de `l2-segmentos.js` (linha 219). Não renderiza (todos têm dashUid) mas polui o código em produção. | Baixa | Remover o ramo `else` com o texto. Re-push. | ☑ |
| F-04 | D1 N2 | 1.2 | Título Grafana `"N2 · Segmentos"` diverge de arquitectura (§2: "N2 · Rede"). | Baixa | Renomear para `"N2 · Rede"` no JSON ou via API. | ☑ |
| F-05 | D1 N2 | 10.N4 | Painel de triggers não tem link para N4 por host. NOC vê o alerta mas não consegue ir directamente ao N4. | Média | Adicionar em `l2-triggers.js` link `/d/<n4uid>?var-routerName=` ou `var-switchName=` baseado no hostname. | ☑ |
| F-06 | D3 Edifícios | 6.1/9.6 | Painel `id:null` no manifest + sem drill N4 (cronograma 4.5 ◐). | Média | Subir painel; adicionar drill `var-hostid` para N4 DC Switch. | ☐ |
| F-07 | D4 WAN | 9.6 | Painéis `id:null` no manifest (l3-wan-negocio, l3-wan-cards, l3-wan-triggers). | Média | Push dos 3 painéis; registar `id` no manifest. | ☑ |
| F-08 | D2 DC Core | 6.1/10.N4 | **l3-dc-table drills N4 não foram pushed**: ficheiro local tem `/d/7baea796` e `/d/8ddc4833` mas afterRender no Grafana não. Switch e Router rows não são clicáveis. | **Alta** | `push_panel.py` de `l3-dc-table.js` para dashboard `a75e2ba6`. | ☑ |
| F-09 | D2 DC Core | 3.4 | Buraco de 8 linhas: utils (y=0,h=3) termina em y=3; fabric (y=11,h=22) começa em y=11. | Média | Compactar: fabric→y=3. Push JSON completo. | ☑ |
| F-10 | D2 DC Core | 3.5 | Sem `rede/n3-dc/dashboard-completo.json`. | Média | Pull após fix F-09, guardar snapshot. | ☑ |
| F-11 | D3 Edifícios | 6.1/10.N4 | **Drill N4 não implementado** no código local. Cada linha de router/switch deve ter link `/d/7baea796-...?var-switchName=` (switches) ou dispositivo equivalente. | **Alta** | Escrever drill em `l3-edificios-table.js`; push; testar. N4 DC Switch (`7baea796`) já existe — usar `var-switchName`. | ☐ |
| F-12 | D3 Edifícios | 9.6 | Manifest tem `"id": null` mas Grafana tem `id: 101`. | Baixa | Actualizar manifest: `"id": 101`. | ☑ |
| F-13 | D3 Edifícios | 4.2 | CPU threshold no código (warn:70/crit:90) diverge do catálogo §4 (warn:60/crit:85). | Baixa | Corrigir `CFG_N3ED.thresholds.cpuPct` para `{ warn: 60, crit: 85 }`. Re-push. | ☑ |
| F-14 | D3 Edifícios | 3.5 | Sem snapshot `rede/n3-edificios/dashboard-completo.json`. | Média | Pull após fixes; guardar snapshot. | ☑ |
| F-15 | D4 WAN | 3.4 | **Dashboard tem 9 painéis vs 4 previstos**: utils duplicado (id=100 e 105 ambos com codeLen~55k), `bpc-n3wan-cards` duplicado (id=101 h=45 e id=108 h=8). Panel 105 tem `title:"Header + Shared"` visível. | **Alta** | Eliminar panels duplicados (105 e 108) no Grafana. Compactar h=45→h correcto. Actualizar manifest. | ☑ |
| F-16 | D4 WAN | 6.1/10.N4 | **`l3-wan-triggers.js` linha 22: `n4DashUid: null`** — placeholder por preencher. N4 WAN Router (`8ddc4833`) existe. | **Alta** | Substituir `null` por `'8ddc4833-be01-47ea-8ada-a89531d4babb'` + `var-routerName=` no href. Re-push. | ☑ |
| F-17 | D4 WAN | 3.5 | Sem snapshot `rede/n3-wan/dashboard-completo.json`. | Média | Pull após fixes; guardar. | ☑ |
| F-18 | D5 Carriers | 3.3 | Panel 102 (`l3-wan-carriers`) h=48 — scroll interno garantido. | Média | Ajustar gridPos: reduzir h para ~28-32 (a calibrar visualmente). Push JSON completo. | ☑ |
| F-19 | D5 Carriers | 3.5 | Sem snapshot `rede/n3-wan-carriers/dashboard-completo.json`. | Baixa | Pull após fix F-18; guardar. | ☑ |
| F-20 | D6 N4·WAN Router | 6.2 | **Back-link ausente no Grafana**: `utils.js` local tem `backLink: { url: '/d/1702465e-...', label: '← N3 WAN' }` (linha 68) mas não está no Grafana (push pendente). | **Alta** | `push_panel.py` de `rede/n4-wan-router/utils.js` → dashboard `8ddc4833`. | ☑ |
| F-21 | D6 N4·WAN Router | 3.5 | Sem snapshot `rede/n4-wan-router/dashboard-completo.json`. | Média | Pull após F-20; guardar. | ☑ |
| F-22 | D7 N4·DC Switch | 6.2 | **Back-link ausente no Grafana**: `utils.js` local tem `backLink: { url: '/d/a75e2ba6-...', label: '← N3 DC Core' }` (linha 68) mas não está no Grafana (push pendente). | **Alta** | `push_panel.py` de `rede/n4-dc-switch/utils.js` → dashboard `7baea796`. | ☑ |
| F-23 | D7 N4·DC Switch | 3.5 | Sem snapshot `rede/n4-dc-switch/dashboard-completo.json`. | Média | Pull após F-22; guardar. | ☑ |

---

## Resumo de execução (preencher)

| Dashboard | Dim.1 | Dim.3 | Dim.8 | Dim.9 | Persona (Dim.10) | Veredicto |
|---|---|---|---|---|---|---|
| D1 N2 | ◐ título | ✖ layout+snapshot | ◐ texto morto | ◐ nomes retry | ◐ drill triggers | **Não-conforme** |
| D2 DC Core | ☑ | ✖ layout+snapshot | ◐ investigar | ☑ | ✖ drill N4 não pushed | **Não-conforme** |
| D3 Edifícios | ☑ | ◐ scroll+snapshot | ☑ | ☑ | ✖ drill N4 ausente | **Não-conforme** |
| D4 WAN | ☑ | ✖ dupls+h=45 | ☑ | ☑ IP SLA ✓ | ✖ drills N4 null | **Não-conforme** |
| D5 Carriers | ☑ | ✖ h=48+snapshot | ☑ | ☑ IP SLA ✓ | ∅ terminal | **Parcial** |
| D6 N4 Router | ☑ | ✖ back-link+snapshot | ☑ | ☑ IP SLA+BGP | ☑ var-routerName | **Parcial** |
| D7 N4 Switch | ☑ | ✖ back-link+snapshot | ☑ | ∅ switch | ☑ var-switchName | **Parcial** |

> Veredicto possível: **Conforme** (0 ✖ bloqueante + persona completa) ·
> **Conforme c/ ressalvas** (só defeitos não-bloqueantes) · **Não-conforme**.
