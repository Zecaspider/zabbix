# Mapa Apps ↔ VMs — correlação, tags e dependências (2026-07-08/09)

> Fecha a pendência F1 do plano de `auditoria-apis-servicos.md §7` e o
> "elo em falta" deixado aberto em
> `bpc-workspace/mapeamento-apps-vms-webscenarios-handoff-20260705.md §12`.
> Precede a decisão de domínio/pasta Grafana de cada sistema (ainda em aberto).

## 1. Template único — fecho da Fase C

Template canónico: **`BPC Web Monitoring v2`** (templateid `14715`), substitui os
2 antigos (`BPC Web Monitoring` 12042, `BPC Web Monitoring - Externos` 12045 —
apagados em 2026-07-08, `hosts:[]` confirmado antes da escrita). 1 único
template para interno+externo, diferenciado por **macros por host**, não por
2 templates:

| Macro | Interno (herdado do template) | Externo (override por host) |
|---|---:|---:|
| `{$TIMEOUT.L1/L2/L3}` | 15s | 30s |
| `{$TEMPO.NORMAL}` (warning) | 5s | 10s |
| `{$TEMPO.LENTO}` (disaster) | 8s | 25s |
| `{$FAILS.BEFORE.ALERT}` | 3 | 6 |

Decisão do utilizador (2026-07-08): **não calibrar internos por app** —
todos os 26 internos usam o default do template, sem override. Motivo:
muitos falsos positivos com calibração atómica por app; a análise fina fica
para quando se cruzar com os dados reais da VM (CPU/RAM/serviço), não antes.
Excepção: nenhuma — mesmo `app-live` (baseline real ~6.3s) usa o default.

Bug de template corrigido: os steps de L2/L3 apontavam para `{$TIMEOUT.L1}`
em vez de `{$TIMEOUT.L2}`/`{$TIMEOUT.L3}` (macros existiam por host mas
nunca eram lidas) — corrigido nos steps do template + macros de template
criadas com o mesmo default do L1.

L3 (`{$STRING.CHECK}`) e L4 (`{$AUTH.ENABLED}`) desligados por omissão ao
nível do template (`status=1`), só ligados por host quando há valor real
configurado — evita o problema antigo do L4 fazer POST diário para
`example.com` com `test/test`.

28 cenários legados `Monitor *` (20 internos directos nas VMs + 8 no host
`BNA`) desactivados em 2026-07-08 — confirmados como duplicados 1:1 dos
`app-*` novos por paridade de dados (`web.test.fail` histórico dos dois
lados, 5 dias). 3 "falhas" do legado que pareciam reais eram só o cenário
antigo aceitar só HTTP 200 (apps devolvem 301/400/404 legítimos que o novo
`{$HTTP.CODE.OK}` por host já trata correctamente).

## 2. Schema de tags (decisão 2026-07-08)

Decisão: **tags**, não macros nem inventário — é o único mecanismo já
integrado nos painéis Grafana deste projecto (filtros, variáveis, drill-down).
Inventário existe e está parcialmente preenchido mas nunca foi usado por
nenhum dashboard construído até agora; macros servem para a config de
monitorização, não para correlação/filtro.

```
tag: tipo    = sistema | parceiro   (todos os 41 hosts app-*, espelha as
                                      2 secções do relatório diário:
                                      "Sistemas e Aplicações" vs
                                      "Serviços com Parceiros")
tag: servico = <nome do sistema>    (todos os 41; mantido — não renomeado
                                      para "app", já tinha validação extensa
                                      de 05/07)
tag: vm      = <hostname da VM>     (24 internos, confirmados por IP ao
                                      vivo — hostinterface.get, não por
                                      memória de documentos antigos)
tag: ip      = <IP real>            (25 internos, incl. app-euronet;
                                      estático — não segue a VM se o IP
                                      mudar, aceite pelo utilizador para
                                      validação rápida ad-hoc)
```

`app-euronet` fica sem `vm` — único gap real (host nunca registado em
nenhum Zabbix, Infra nem Network; reverse DNS na altura resolvia `ACS9`,
já não resolve).

Reciprocidade confirmada: as VMs também têm a tag `servico` correspondente.
13/15 VMs já estavam correctas; 2 corrigidas (`VS8000305` ganhou 9 tags
`servico` específicas — as 2 antigas descritivas ambíguas removidas por
duplicarem `PSI`/`SIB` com nomenclatura diferente; `VS8000304` ganhou
`SAFT`+`SIR`).

## 3. Mapa VM confirmado por IP (24 apps internas)

Método: `{$URL}` do host `app-*` → IP/hostname → `hostinterface.get` na API
Zabbix → hostname da VM. Não por memória de documentos anteriores — alguns
já estavam errados (ver nota abaixo).

| VM | Apps (`servico`) | IP |
|---|---|---|
| `VS8000305` | ABC, CONTIF, PSI, Agendamento de Salas, SGC, SGF, SIB, SPCC, LIVE (9) | 10.10.236.50 |
| `VS8000304` | SAFT, SIR (2) | 10.10.238.40 |
| `VS9000480` | FORGEST | 10.10.238.201 |
| `VS8000418` | INTIX | 10.10.236.20 |
| `VS8000813` | SIC | 10.10.236.161 |
| `VS8000427` | sistema de compensação de cheques (SICV) | 10.10.238.176 |
| `VS8000438` | SMS BANKING+CHAT BOT | 10.10.238.214 |
| `VS8000141` | SWIFT | 10.10.13.11 |
| `VS8000422` | UYSIG | 10.10.236.16 |
| `VS8000437` | UYSIG (BNA) | 10.10.236.27 |
| `VS9000912` | BANK TRADE | 10.10.238.8 |
| `VS9000235` | CEZANNE | 172.16.8.183 |
| `VS8000789` | SACC | 10.10.204.45 |
| `VS8000724` | ebankit (só o nó gateway — ver §4) | 10.10.11.112 |
| `VS8000454` | TOBE/SOP | 10.10.236.34 |

**Correcção feita ao vivo**: `app-saft`/`app-sir` vão para `VS8000304`, não
`VS8000305` como uma nota antiga (`mapeamento-apps-vms-webscenarios-handoff-20260705.md
§12`) sugeria — confirmado por IP em 2026-07-08, não é o mesmo host das
outras 9 apps.

`app-euronet` (10.10.241.153) — sem VM registada, gap real (ver §2). App
recuperou de um hang transitório real observado ao vivo em 2026-07-08
(timeout total → HTTP 200 em <0.3s, 5/5 tentativas) — reactivado.

## 4. Dependências de BD/backend (investigação inicial, sem aceder a VMs novas)

Pedido do utilizador: para cada app, saber se a BD/backend vive na mesma VM
do frontend ou depende de outra VM à parte (uma app pode depender de mais
que 1 VM — BD, frontend, fila, etc. — a relação pode não ser 1:1).

Método usado (sem WinRM novo): (a) `item.get` filtrado por chave `mssql` nas
15 VMs, (b) cruzamento com o levantamento WinRM já feito em 05/07
(`bpc-workspace/Mapa_VMs_Servicos_Zabbix_Grafana.xlsx`, colunas
`Serviços/Apps Confirmados` e `Sites IIS`).

### 4.1 Auto-contidas (BD local confirmada, sem dependência externa visível)

| VM | Evidência |
|---|---|
| `VS8000305` | `SQLWriter` (SQL Server local) |
| `VS8000418` | `postgresql-x64-9.6` local |
| `VS8000438` | `postgresql-x64-17` + `ActiveMQ` local |
| `VS8000454` | Suite completa MSSQL local (`MSSQLSERVER`, SSAS, SSIS, Report Server) |
| `VS8000422` | Suite completa MSSQL local + Tomcat |
| `VS8000437` | Item MSSQL confirmado no Zabbix + Tomcat9 |
| `VS9000480`, `VS8000427`, `VS9000912` | Itens MSSQL activos no Zabbix (5/2/4); detalhe de serviços não capturado em 05/07 |

### 4.2 Sem BD local visível — dependência externa provável, por identificar

| VM | O que se vê | Achado lateral |
|---|---|---|
| `VS8000304` (SAFT, SIR) | Só `WebLogic`/`Tomcat10`/`WAS` (app servers Java), nenhum serviço de BD | Em `VS8000305` correm também `bpc-sir-frontend`/`bpc-sir-api` e `bpc_saft_api` — sugere modernização em curso (stack antigo em `.304`, novo front/API em `.305`); **não confirmado se são a mesma coisa ou versões paralelas** |
| `VS8000813` (SIC) | Só `MSMQ` (fila de mensagens), sem serviço de BD local | — |

### 4.3 Multi-VM confirmado — a VM mapeada é só 1 nó

| VM | App | Nota |
|---|---|---|
| `VS8000724` | ebankit/internet-bank | Só mostra o gateway web (sites IIS `ebk-ib`/`ebk-ids`/`ebk-gtw-omnichannel`/`ebk-cdn`/`ebk-cms`), sem BD local. A tag `ebankit` cobre **20 hosts** no total (achado de 05/07) — o `vm=` aponta só à porta de entrada; BD/middleware reais ficam nas outras ~19 VMs desse grupo, ainda não mapeadas 1:1 |

### 4.5 `ebankit` — fechado (2026-07-08/09)

Retomada a validação das tags automáticas do `inventario_zabbix_final.csv`
(script `1-zabbix_sync.py`/`34-zabbix-vmware-mapper.py`, parseado da
`Anotacao_Original`, nunca validado 1:1). Cruzado o CSV (Abril) contra
`host.get` ao vivo (`tags: servico contains ebankit`), token Admin, só
leitura:

- **18 VMs reais confirmadas** hoje com `servico=ebankit` (2 Front End,
  2 Back Office, 4 Middleware, 2 BD cluster, 2 Load Balancer, 3 QA, 2 Audit
  System QA+Prod, 1 IIS/CPI) — reconcilia o "20 hosts" da auditoria 14.27:
  16 já vinham do CSV de Abril + 2 novas criadas/tagueadas depois
  (`VS9000358` "eBanking Audit System Prod", `VS8000735` "Load
  Balance_Camada_Backoffice (Ebanking)") + `app-internet-bank` (monitor
  sintético, `vm=VS8000724` já confirmado em 14.24) = 20 no total à data.
- **1 falso-positivo identificado e já resolvido por outra frente**:
  `vs8000740` (minúsculas) tinha tag `EBANKIT` no CSV antigo ("Load balance
  do Middleware") — mas era o **duplicado zombie** apagado no Z.46 (mesma
  sessão). O host real, `VS8000740` (maiúsculas, confirmado por WinRM),
  está correctamente tagueado **`servico=canais digitais`** ("Whatsapp BPC
  \| Load balance_Camada_Appcenter") — é um load balancer partilhado de
  outro canal digital, não pertence ao `ebankit`. Confirma que o parser
  antigo (baseado só na descrição) atribuía o serviço errado quando 2 VMs
  partilhavam o mesmo IP histórico.
- **Nenhuma escrita feita** — achado fechado só com leitura (`host.get`
  directo à API, sem passar pelo snapshot local desactualizado
  `audit_609_hosts_raw_20260708.json`, que também não continha
  `VS8000740`/`vs8000740` por ter um âmbito de grupo mais restrito).

### 4.4 Sem dados — precisa de investigação nova (WinRM nomeado) ou fica só com visible name (§5)

- `VS9000235` (Cezanne) — Server 2003 EOL, levantamento antigo muito limitado
- `VS8000141` (SWIFT) — nunca investigado (segregação de segurança, decisão de não mexer já tomada)
- `VS8000789` (SACC) — fora do universo dos 136 hosts inspeccionados em 05/07

## 5. Próximo passo (em curso) — visible name das VMs de Produção

Ideia do utilizador (2026-07-09): sem aceder a nenhuma VM em horário
laboral, o campo **visible name** (`host.name`, distinto do `host.host`
técnico `VSxxxxxxx`) de cada VM de Produção já dá uma pista forte sobre o
que ela faz — método 100% de leitura, sem tocar em nada. A levantar a
seguir, à escala de toda a Produção (grupo 609), não só as 15 deste grupo.

## 6. Impacto na decisão de domínio/pasta Grafana

Pendente — o utilizador ligou explicitamente esta investigação de
dependências à decisão de **manter ou mudar os domínios/pastas Grafana**
actuais (`07·APIs e Serviços` vs `08·Serviços de Negócio` etc.) para cada
sistema. Ainda não decidido; retomar depois do levantamento do §7.

## 7. Ficheiro-fonte encontrado — `inventario_zabbix_final.csv`

O utilizador lembrou que já existia um deliverable com o cruzamento
VM↔vCenter↔classificação: **`bpc-workspace/inventario_zabbix_final.csv`**
(463 linhas, actualizado 2026-04-23). Colunas: `Nome_Original;Visible_Name;
IP;Host_Fisico;Cluster;tag_activo;tag_camada;tag_servico;tag_ambiente;
tag_tecnologia;tag_departamento;tag_cod_ambiente;tag_cluster;Hostgroups;
Anotacao_Original;Tipo_Parse;VN_Chars;host_fisico;esxi_host;vcenter`.
Gerado pelo pipeline `scripts-a-analisar/de-scripts-import/` (`1-zabbix_sync.py`
consome este CSV; `2-extrair_inventario_transicao.py` gera a folha de revisão
manual; `34-zabbix-vmware-mapper.py` faz o cruzamento por UUID com os 3
vCenters). Torna redundante extrair o *visible name* à mão — já vem
parseado, mais o `esxi_host`/`vcenter`/`Cluster` que o *visible name* sozinho
não dá.

### 7.1 Cruzamento com as 15 VMs deste grupo — achados

- **`VS8000141` (SWIFT)**: `Cluster Swift` (não `CLS-BPC01`), `VCenter_MAIN`
  (não `VCenter_BPC01`), hardware Cisco UCS C220-M4 (não PowerFlex R650-C)
  — confirma segregação total de infra-estrutura, coerente com a decisão de
  segurança já tomada de não mexer.
- **`VS8000422` (UYSIG)**: nota original diz literalmente **"DB Novo"** —
  confirma auto-contida (já tínhamos visto suite MSSQL completa local).
- **`VS8000427`/`VS8000454` (TOBE)**: notas "Serv Aplic TOBE - STC" e
  "Serv Aplic TOBE - SOP" — TOBE é uma plataforma com vários módulos; achado
  que liga a um gap de cobertura (ver §7.2).

### 7.2 Gaps de cobertura (Fase C4 / `auditoria-apis-servicos.md §5.3`) — cruzados com o CSV completo

| Gap | Estado | VM(s) identificada(s) | Evidência |
|---|---|---|---|
| **EQUATION Core Bancário** | ✅ resolvido | `VS8000320`, `VS8000321` | `servico="Servidor de aplicacoes"`, nota **"Equation Teller and FPM"** |
| **EBA** | ✅ resolvido | `VS1800002` (app) + `SV9000401` (BD) | `SV9000401` tem `tag_camada="Bases de Dados"` — confirma a suspeita de 05/07 de que é o servidor de BD de apoio |
| **BFTELLER** | ✅ resolvido | `VS8000452` | `servico="Gestão do BFTELLER"`, nota "Aplicação Caixa das Agências" |
| **STC** | 🔀 confirmado mas espalhado por 3 VMs | `VS8000427` (TOBE), `VS8000416` (Match Cash — "Reconciliação de contas STC (EMIS)"), `VS8000912` (QA, "Serv Dev da TOBE - STC, SCC") | Parece ser um fluxo de negócio (ligado ao EMIS) que atravessa vários sistemas, não uma app isolada |
| **Match Cash** | ◐ mais completo | `VS8000401`, `VS8000416`, `VS8000417` | Departamento `DOP`; 3 VMs com notas distintas (reconciliação interna BPC / STC-EMIS / correspondentes BNA) — parecem servir tipos de reconciliação diferentes, não réplicas |
| **CTB/400** | ❌ sem pista | — | Zero menções a "iSeries"/"AS400"/"CTB" em toda a frota (463 VMs) |
| **Bloomberg** | ❌ sem pista | — | Zero menções |
| **BODIVA** | ❌ sem pista | — | Zero menções |
| **Audit Bank** | ❌ sem pista | — | Só existem "AD AUDIT" (auditoria de Active Directory) e "Ebankit audit system" — nenhum dos dois é o sistema do relatório |
| **Payment Manager** | 🔀 possível match, por confirmar | `VS8000317` (QA), `VS8000324` (Produção) | Ambos tagged `SWIFT`, nota "FPM - Fusion Payment Manager" — pode ser o mesmo sistema, mas fica dentro do perímetro SWIFT (não mexer) |
| **UYSIG** | ✅ já coberto | `VS8000422`, `VS8000437` | Já tinha `app-*` antes desta sessão |

Nenhuma escrita feita — só leitura do CSV e do Zabbix. Próximo passo natural
(não executado ainda): construir `app-*` novos para EQUATION/EBA/BFTELLER,
já que têm VM identificada e URL/porta ainda por confirmar.

## 8. Vista geral da frota (461 VMs, `inventario_zabbix_final.csv`)

### 8.1 Por ambiente / camada / vCenter

| Ambiente | VMs |
|---|---:|
| Produção | 311 (67%) |
| QA | 112 |
| A-CLASSIFICAR | 27 |
| Operações | 8 |
| Desenvolvimento | 2 |
| Teste | 1 |

| Camada | Total | Produção |
|---|---:|---:|
| Camada Aplicacional | 223 | 133 |
| Serviços de Infraestrutura | 75 | 69 |
| Bases de Dados | 70 | 43 |
| A-CLASSIFICAR | 27 | — |
| Virtualização | 24 | 24 |
| Plataforma de Contentores (OCP) | 18 | 18 |
| Segurança | 17 | 17 |
| Interface e Web | 7 | 7 |

- **`VCenter_BPC01`**: 275 VMs (60%) — clusters `CLS-BPC01` (263) + `CLS-MGMT` (12)
- **`VCenter_MAIN`**: 186 VMs (40%) — clusters `CS9000002` (180) + `CS9000001` (1)
- **`Cluster Swift`**: 5 VMs — isolado (confirma §7.1)

### 8.2 Por departamento (top)

`DTI` (247, 54% — genérico, espalhado por todas as camadas) > **`PMSI` (96, 21%)**
> `A-CLASSIFICAR` (28) > `DSI` (14) > `DSE`/`SAFIRA` (13 cada) > `DCH` (8) >
`FENIX` (5) > `DOP` (4).

Em Produção: `DTI` (192, espalhado por todas as camadas — app/infra/
virtualização/BD/contentores/segurança) vs `PMSI` (48, quase todo
`Camada Aplicacional`+`Bases de Dados` — perfil de departamento de negócio,
não de TI genérica).

### 8.3 `PMSI` (96 VMs) — não é 1 sistema, é um programa de modernização

| Sub-sistema | VMs | Notas |
|---|---:|---|
| **INTEGRADOR** | 16 | Plataforma de integração/dados completa: Kafka, NiFi, ElasticSearch, Ceph, GitLab, Bastion Node, Master Node — parece um cluster de dados moderno, não uma "app" |
| **DIGIWAVE** (+variantes) | 16 | `FINASTRA` |
| **FIRCOSOFT** (+App/MQ/Utilities) | 12 | Já conhecido de 05/07 — compliance/AML, `FINASTRA` |
| **ESSENCE / FUSION ESSENCE** | 11 | "Migration Tool"/"Equation Client" — ferramenta de migração ligada ao Equation |
| **ACM** | 8 (+1 `ACMRELATIONAL`) | Ver §8.6 — contexto técnico encontrado (2026-07-09), meaning de negócio ainda por confirmar |
| **CreditQuest** | 5 | `FINASTRA` |
| **TOBE (só BD)** | 4 | Achado: a camada BD do TOBE está tagged `PMSI`, não `DTI` (a camada app está); "Portal de Operações"/"Sistema de Compensação" |
| **OPTICS, NETMARKET, PRIMAVERA, BANKTRADE, GIT LAB, EXCEL REPORT, NGINX, E-Learning, SUPPORTSERVER** | ~1-4 cada | Menor escala, diversos |

Conclusão: `PMSI` é um **programa de transformação de TI**, centrado no
ecossistema **Finastra** (Fircosoft/Digiwave/CreditQuest) + uma plataforma
de integração de dados moderna (Kafka/NiFi/Ceph) + ferramentas de migração
(Essence/Equation). Não é um sistema de negócio único — quase todo fora do
universo dos 50 sistemas do relatório diário.

### 8.4 `SAFIRA` (13 VMs) — plataforma Fintech contida

- **`FINANTECH`** (8 VMs) — arquitectura completa: Front Office + Back Office
  + BD, ambientes QA e Produção
- **`SDVM`/`DSVM`** (5 VMs) — servidores de desenvolvimento/UAT

Muito mais contido que PMSI — 1 plataforma/produto específico
("FINANTECH"), com o seu próprio ciclo dev→UAT→produção.

### 8.5 Implicação para domínios/pastas Grafana (decisão ainda pendente)

`PMSI` e `SAFIRA` são candidatos fortes a **domínio/pasta Grafana próprios**
(1º nível, ex. `10·PMSI`/`11·SAFIRA`) — não são apps de negócio individuais,
são programas/plataformas inteiras com arquitectura própria. Não fazem
sentido dentro de "APIs e Serviços" ou "Serviços de Negócio" como estão
hoje. Decisão final por tomar; ver §8.6 para o contexto (parcial) já
encontrado sobre `ACM`.

### 8.6 `ACM` — contexto técnico encontrado, meaning de negócio por confirmar (2026-07-09)

Retomada a validação (`host.get` ao vivo, tag `servico`/`departamento`,
token Admin, só leitura). Confirmado ao vivo (departamento=PMSI, hoje: 94
VMs, vs 96 do CSV de Abril — ligeira deriva normal, sem investigar).

`ACM` **não é exclusivo do PMSI** — é maior e está fragmentado por 3
departamentos:

| Departamento | VMs | Ambiente | Nota |
|---|---:|---|---|
| `PMSI` | 8 `ACM` + 1 `ACMRELATIONAL` | 5 Produção + 4 QA | Confirma a tabela §8.3 |
| `DTI` | 8 `ACM` | Todas QA | Ambiente paralelo/legado, possivelmente pré-migração para PMSI |
| `DSE` | 1 `ACM` | QA | `VS8000345` — descrição menciona **"Aplicação da Assecco (MIA)"** |

**Pista de negócio (não confirmada)**: o próprio `visible name` de
`VS8000345` liga `ACM` ao fornecedor **Assecco** e ao produto **"MIA"** —
primeira pista concreta de que sistema é este. Reforça achado anterior
(`vm-agente-recuperacao-handoff-20260704.md`, WinRM em `VS8000768`):
**11 serviços Windows nomeados `ACM-*`** + `Keycloak` (autenticação) +
`RabbitMQ` (mensageria) — arquitectura de microserviços real, não um
artefacto de tag. `VS8000482` acrescenta outra pista: "Server ACM - MFT \
PRT Qualidade, Certificação" (MFT = Managed File Transfer).

**Ainda por confirmar com o negócio**: o que "ACM"/"MIA" fazem
concretamente (nenhuma das 50 linhas do relatório diário de negócio bate
com este nome) — candidato a pergunta directa ao utilizador antes de
decidir se `ACM` é sub-sistema do domínio `PMSI` ou merece o seu próprio
`app-*`/tratamento.
