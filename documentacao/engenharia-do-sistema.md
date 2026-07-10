# Engenharia do BPC-Observe (v5)

> **Documento mestre.** Define arquitectura, fluxo de trabalho, padrões de
> código, teste, operação e manutenção. Serve de base ao `CLAUDE.md` e guia
> qualquer IA ou pessoa na construção dos dashboards.
> Sub-documentos de detalhe: [`blueprint-observabilidade.md`](blueprint-observabilidade.md)
> (mapa drill-down) e [`mapa-host-groups.md`](mapa-host-groups.md) (domínio→grupo).
> Criado 2026-06-16 · revisão contínua via a checklist da §12.
>
> **Stack:** Grafana **12.4.2** · Zabbix **7.4** (Infra, datasource `3_KgG43nz`)
> e **7.0** (Network, datasource `ffo8sp8zllog0e`) · plugin Dynamic Text
> `marcusolsson-dynamictext-panel` v6.2.0. O nome antigo
> `marcusolsson-businesstext-panel` não existe nesta versão do Grafana.

---

## 1. Visão e objectivo

Transformar o Grafana de "dashboards bonitos" num **sistema de observabilidade
NOC completo** para um banco: detecção → triagem → correlação → resposta, com
drill-down lógico e vistas distintas para operação, engenharia e gestão.

Critério de sucesso: um operador NOC vê o estado de tudo num ecrã (N1), desce
ao domínio em causa (N2), isola o host/causa (N3) — sem sair do Grafana, com
estado coerente entre níveis e navegação determinística.

## 2. Princípios de arquitectura

1. **Separação de camadas e fontes de verdade.**
   | Camada | Responsabilidade | Fonte de verdade |
   |---|---|---|
   | Zabbix | recolha, triggers, alerta, escalação | dados e alertas |
   | Grafana | apresentação + navegação (observabilidade) | dashboards canónicos |
   | Repo `v5/` | código dos painéis + manifestos | código |
   O Grafana **não** duplica triggers como alertas próprios.

2. **Híbrido por princípio.** Painel nativo Grafana onde já é forte (geomap,
   séries temporais, tabelas, listas de triggers/alertas, stat/gauge);
   Dynamic Text (`marcusolsson-dynamictext-panel`) só onde a estética/lógica composta NOC *é* o valor.

3. **Estado coerente, calculado uma vez.** Um modelo de estado único
   (§6) — o N1 nunca contradiz o N2/N3.

4. **Navegação determinística.** Contrato de drill-down explícito (§7),
   nunca links ad-hoc.

5. **DRY via painel utilitário.** Tudo o que é partilhado (runtime, charts,
   CSS, estado) vive 1× no painel utils de cada dashboard (§5), nunca repetido
   por painel.

6. **Código local é a fonte; Grafana é o ambiente de execução/teste.** Nunca
   corrigir só no Grafana (§8).

## 3. Hierarquia e domínios

Drill-down `N1 → N2 → N3` (mapa completo no blueprint). Detalhe + contagens em
`mapa-host-groups.md`.

**Regra de ancoragem (#5/#6) — determinística:**
- A taxonomia Zabbix é **facetada** (um host está em vários grupos de eixos
  diferentes). O nome do eixo (INFRAESTRUTURA / CAMADA / APLICACOES) é
  **irrelevante** para escolher a âncora — o que vale é a tabela abaixo.
- Cada domínio tem **um `groupId` âncora**: o grupo cujo conjunto de hosts *é*
  o domínio. É esse que filtra o dashboard N2 (lista de hosts) e a query âncora.
- Grupos **de enriquecimento** (coluna própria) **não** filtram o dashboard;
  são consultados por RPC dentro do `afterRender` para items extra (ex.:
  datastores nos ESXi). Nunca usar um grupo de enriquecimento como âncora.

| Domínio | Zabbix | groupId âncora | Enriquecimento | N3 |
|---|---|---|---|---|
| Servidores Físicos | Infra | `603` | — | por host |
| Servidores Virtuais | Infra | `609` | `608` (ESXi/datastores) | por VM |
| Armazenamento | Infra | `602` (Storage) | `605` (Tape) | por array |
| Segurança | Infra | `656` | — | firewall/WAF/Darktrace |
| Bases de Dados | Infra | `355` | — | por instância |
| APIs & Serviços | Infra | `663` (Sintéticos) | `345` (Camada Aplic.) | por endpoint |
| Serviços de Negócio | Infra | `391` (eBankit) | eixo SERVICO/* | por jornada |
| **Rede** | Network | *multi-grupo* `26/27/28/29/35` | `22` (gestão) | por segmento |
| **Agências** | Network | `24` (routers) | `25` (switches) | por agência |

**Excepção Rede:** não tem groupId âncora único — agrega DC (`26/27`),
Edifícios (`28/29`) e WAN (`35`). O N2 de Rede trata cada segmento como
sub-secção; a query âncora aponta para um grupo real e estável (ex.: `26`).

## 4. Naming canónico

### 4.0 Convenção de títulos, UIDs e estrutura de ficheiros (aprovada 2026-06-27, actualizada 2026-07-01)

**Título do dashboard:**
```
Nx · Domínio [· Âmbito] — O que vê e faz
```

| Parte | Regra | Exemplo |
|---|---|---|
| `Nx` | prefixo de nível (N1…N6) — força ordenação por nível na lista do Grafana | `N3` |
| ` · Domínio [· Âmbito]` | breadcrumb de hierarquia, separado por ` · ` | ` · Rede · WAN` |
| ` — ` | separador fixo entre hierarquia e propósito | |
| `O que vê e faz` | conteúdo/propósito em linguagem de operador | `Serviços e circuitos` |

Regras:
- Sempre sentence case. O nível `Nx` é sempre **prefixo** — nunca sufixo, nunca no meio.
- O `Nx` como prefixo permite que o Grafana ordene alfabeticamente por nível (N2 → N3 → N4) dentro de cada pasta de domínio.
- O ` · ` separa segmentos de hierarquia. O ` — ` (traço em-dash com espaços) separa da descrição.
- Nunca usar "Dashboard" ou "Painel" no título.
- **Agências é sub-domínio de Rede** — os seus dashboards vivem na pasta `04 · Rede` e usam `Rede · Agências` como âmbito.

Exemplos canónicos:
```
N1 · Visão Geral — Estado global
N2 · Rede — Segmentos e alertas
N3 · Rede · WAN — Serviços e circuitos
N3 · Rede · WAN — Por provedor
N3 · Rede · DC Fabric — Estado dos switches
N3 · Rede · Edifícios BPC — Routers e switches
N3 · Rede · Agências — Mapa de estado
N4 · Rede · Agência — Diagnóstico
N4 · Rede · WAN · Dispositivo — Interfaces
N4 · Rede · WAN · Interface — Tráfego
N4 · Rede · WAN · Provedor — SLA e circuitos
N4 · Rede · DC · Switch — Interfaces
N5 · Rede · Agência — Interfaces
N5 · Rede · Edifício — Interfaces
N6 · Rede · Edifício · Switch — Detalhe
N2 · VMware — Estado geral
N3 · VMware · ESXi — Hosts e clusters
N3 · VMware · ESXi — Detalhe do host
N3 · VMware · vCenter — Inventário
N2 · Servidores — Estado geral das VMs
N3 · Servidores · VM — Diagnóstico
```

**UID do dashboard:**
```
<dominio>.<nivel>.<funcao>
```
Exemplos: `rede.n3.agencias`, `rede.n4.agencia`, `vmware.n3.esxi`, `visao-geral.n1.noc`

Regras:
- Minúsculas, hífens como separador interno, ponto como separador de segmento.
- **Sem número de ordenação** — o número existe nas pastas/ficheiros para ordenação visual; o UID é âncora permanente de links, não deve mudar se domínios forem reordenados.
- O UID não muda após criação — é a âncora de todos os links de drill-down.

**Segmentos do domínio Rede (revisão 2026-07-01):** dentro de "04 · Rede" existem
**4 segmentos** — cada um um domínio de falha/gestão operacional distinto, com a
sua própria árvore N3→N6 e a sua própria subpasta no Grafana e no disco. O termo
correcto é **"segmento"** (já usado no código, `CFG_SEG`), não "subdomínio" —
os 4 não estão no mesmo eixo de classificação (DC Fabric/Borda DC são por
função; Edifícios/Agências são por tipo de localização), mas cada um é um
segmento de rede válido para efeitos de navegação e monitorização.

| Segmento | Pasta Grafana | UID pasta | Dispositivos reais |
|---|---|---|---|
| Agências | `04.1 · Agências` | `rede-seg-agencias` | 220 routers + 27 switches (g24+g25) |
| Borda DC (5 routers de borda do DC — ver "Fluxo Borda DC" no CLAUDE.md) | `04.2 · Borda DC` | `rede-seg-bordadc` | 5 routers (`HG_DC_ROUTERS`, g27) |
| DC Fabric | `04.3 · DC Fabric` | `rede-seg-dcfabric` | 7 switches Spine-Leaf (g26) + 1 OOB (g22) |
| Edifícios | `04.4 · Edifícios` | `rede-seg-edificios` | 9 routers (g28) + 46 switches (g29) |

O N2 (`01-n2-rede/`) **não pertence a nenhum segmento** — fica directamente em
"04 · Rede" (wallboard que agrega os 4).

**Mapa canónico de UIDs — domínio Rede (aprovado 2026-07-01):**

| Segmento | # drill | Subpasta local | UID canónico | Título canónico |
|---|---|---|---|---|
| — | 01 | `01-n2-rede/` | `rede.n2.segmentos` | `N2 · Rede — Segmentos e alertas` |
| Agências | 01 | `04.1-agencias/01-n3-rede-agencias/` | `rede.n3.agencias` | `N3 · Rede · Agências — Mapa de estado` |
| Agências | 02 | `04.1-agencias/02-n4-rede-agencia/` | `rede.n4.agencia` | `N4 · Rede · Agência — Diagnóstico` |
| Agências | 03 | `04.1-agencias/03-n4-rede-agencia-wan-dispositivo/` | `rede.n4.wan-dispositivo` | `N4 · Rede · Agência · WAN — Interfaces do router` |
| Agências | 04 | `04.1-agencias/04-n5-rede-agencia-interfaces/` | `rede.n5.agencia-interfaces` | `N5 · Rede · Agência — Interfaces` |
| DC Fabric · dispositivo | 01 | `04.3-dc-fabric/01-n3-dc-dispositivos/` | `rede-n3-dc-dispositivos` | `N3 · Rede · DC Fabric — Dispositivos` |
| DC Fabric · dispositivo | 02 | `04.3-dc-fabric/02-n4-dc-switch/` | `rede-n4-dc-fabric-switch` | `N4 · Rede · DC Fabric · Switch — Diagnóstico` |
| DC Fabric · dispositivo | 03 | `04.3-dc-fabric/03-n5-dc-switch-interfaces/` | `rede-n5-dc-switch-interfaces` | `N5 · Rede · DC Fabric · Switch — Interfaces` |
| DC Fabric · saúde | 04 | `04.3-dc-fabric/04-n3-dc-fabric-saude/` | `rede-n3-dc-fabric-saude` | `N3 · Rede · DC Fabric — Saúde do Fabric` |
| Edifícios | 01 | `04.4-edificios/01-n3-rede-edificios/` | `rede.n3.edificios` | `N3 · Rede · Edifícios BPC — Routers e switches` |
| Edifícios | 02 | `04.4-edificios/02-n4-rede-edificio/` | `rede.n4.edificio` | `N4 · Rede · Edifício — Detalhe` |
| Edifícios | 03 | `04.4-edificios/03-n5-rede-edificio-interfaces/` | `rede.n5.edificio-interfaces` | `N5 · Rede · Edifício — Interfaces` |
| Edifícios | 04 | `04.4-edificios/04-n6-rede-edificio-switch/` | `rede.n6.edificio-switch` | `N6 · Rede · Edifício · Switch — Detalhe` |
| Borda DC · por router | 01 | `04.2-borda-dc/01-n3-bdc-routers/` | `rede.n3.bdc-routers` | `N3 · Rede · Borda DC — Routers` |
| Borda DC · por router | 02 | `04.2-borda-dc/02-n4-bdc-router/` | `rede.n4.bdc-router` | `N4 · Rede · Borda DC · Router — Diagnóstico` |
| Borda DC · por router | 07 | `04.2-borda-dc/07-n5-bdc-router-interfaces/` | `rede-n5-bdc-router-interfaces` | `N5 · Rede · Borda DC · Router — Interfaces` |
| Borda DC · por provedor | 01 | `04.2-borda-dc/03-n3-bdc-provedores/` | `rede.n3.bdc-provedores` | `N3 · Rede · Borda DC — Provedores` |
| Borda DC · por provedor | 02 | `04.2-borda-dc/04-n4-bdc-provedor/` | `rede.n4.bdc-provedor` | `N4 · Rede · Borda DC · Provedor — SLA e circuitos` |
| Borda DC · por serviço | 01 | `04.2-borda-dc/05-n3-bdc-servicos/` | `rede.n3.bdc-servicos` | `N3 · Rede · Borda DC — Serviços` |
| Borda DC · por serviço | 02 | `04.2-borda-dc/06-n4-bdc-servico/` | `rede.n4.bdc-servico` | `N4 · Rede · Borda DC · Serviço — Detalhe` |

> **Borda DC EM RECONSTRUÇÃO (2026-07-01+)** — os 4 dashboards antigos
> (`rede-n3-wan`, `rede-n4-wan-router`, `rede-n3-wan-carriers`,
> `rede-n4-wan-provedor`) foram **arquivados** em
> `04.2-borda-dc/arquivo-borda-dc/` (ficheiro local, git mv preserva
> histórico) e movidos, no Grafana, para a pasta `99 · Arquivo`. Motivo:
> investigação com dados reais (host.get/item.get ao vivo + rede-topologia.md)
> revelou 4 ambiguidades nunca resolvidas pelo design anterior — (1) o router
> WAN-AG faz 3 papéis (Agências + Edifícios + Azure ExpressRoute) no mesmo
> hardware; (2) o parceiro MINFIN tem 4 circuitos físicos espalhados por 2
> routers diferentes (GTW01 + PARC); (3) o router PARC mistura circuitos de
> dados de parceiros com dezenas de trunks de voz/CUBE — dois domínios
> técnicos distintos; (4) o router GTW01 estava rotulado "AZURE/GOV" no
> código antigo sem ter nenhum circuito Azure (confirmado zero via
> item.get). Nenhuma destas ambiguidades era visível nos 2 fluxos antigos
> (por router / por provedor).
>
> **Nova arquitectura: 3 eixos** (decisão de engenharia de rede, não só
> housekeeping):
> 1. **Por router** (físico — 5 cards, 1/dispositivo) — "que caixa está com
>    problema". GTW01 corrigido para reflectir Governo (MINFIN/INSS/BODIVA),
>    nunca Azure; card do WAN-AG expõe as 3 funções separadamente.
> 2. **Por provedor** (carrier/SLA — igual ao fluxo antigo, novo UID/pasta)
>    — "que operadora incumpriu, a quem abrir ticket".
> 3. **Por serviço de negócio** (NOVO — 7 cards: Internet · EMIS · Agências ·
>    Edifícios · Azure · Governo/Institucional · Voz/Telefonia) — "que
>    impacto de negócio existe", com o(s) router(s) explícito(s) por card
>    (o card Governo mostra "2 routers" por causa do MINFIN partido). O card
>    Edifícios é só o handoff DC-side (túneis Tu201-208 em WAN-AG); a árvore
>    completa do lado do edifício mantém-se em `04.4-edificios/` — link de
>    cross-segmento, não duplicação.
>
> Nenhum dos 3 eixos tem N5: cada N4 já é ficha de nível "dispositivo/
> provedor/serviço único" (5 routers no total), sem camada adicional por
> baixo que justifique aprofundar. Detalhe da investigação e da decisão em
> `documentacao/rede-arquitectura.md` (a actualizar no fecho de cada
> dashboard, secção 8 "Documentar após aprovado").

> **DC Fabric REDESENHADO DO ZERO (2026-07-02)** — o dashboard único antigo
> (`rede-n3-dc`, 4 painéis: KPI + "Saúde do Fabric" + tabela "DC Core" +
> secção de routers WAN dentro do mesmo painel) foi **arquivado** em
> `04.3-dc-fabric/arquivo-dc-fabric/` (local) e movido, no Grafana, para
> `99 · Arquivo`, junto com o N4 antigo (`rede-n4-dc-switch`, ficha única
> Business Text). Motivo: o dashboard misturava switches (grupo 26,
> `HG_DC_SWITCHES`) com os 5 routers WAN (grupo 27, `HG_DC_ROUTERS`) — o
> mesmo hardware que já tem card próprio em Borda DC — sem link cruzado entre
> as duas pastas Grafana; e usava "core"/"backbone" (que na doc de topologia
> só se aplicam ao SPINE) para descrever o conjunto SPINE+LEAF.
>
> **Nova arquitectura: 2 eixos paralelos**, ambos só sobre os 7 switches
> (routers ficam exclusivamente em Borda DC, com link cruzado):
> 1. **Por dispositivo** (`01-n3-dc-dispositivos` → `02-n4-dc-switch` →
>    `03-n5-dc-switch-interfaces`) — 7 cards (2 SPINE + 5 LEAF), classificados
>    pela tag Zabbix `funcao`/`modelo` (confirmada ao vivo via `host.get`,
>    **não** regex sobre nome de host). Clone do padrão N4/N5 Router de Borda
>    DC (stats nativos, tabela de uplinks, timeline, triggers, tráfego,
>    packet loss, CPU/RAM).
> 2. **Por saúde/correlação** (`04-n3-dc-fabric-saude`) — matriz underlay
>    spine×leaf, pares vPC, overlay VXLAN — revive a lógica do painel antigo
>    "Saúde do Fabric" (já com o fix de staleness aplicado, ver Z.17 no
>    cronograma) porque a relação "1 link, 2 pontas" não se representa bem
>    em cards por dispositivo isolados. Rodapé com link cruzado para os
>    routers WAN em `rede-n3-bdc-routers`.
>
> **Achado durante a construção**: o uplink de um LEAF ao SPINE descreve-se
> `LINK TO SPINE-XX` (não `UNDERLAY`, que só aparece do lado SPINE e,
> enganosamente, também numa loopback de BGP que não é um uplink físico) —
> confirmado ao vivo via `item.get`, afectava o regex de classificação em
> 3 sítios (cards, tabela nativa, gráficos de tráfego/erros do N4).
>
> Layout final (gridPos, CLAUDE.md §4) replica as proporções já aprovadas do
> N4 Router de Borda DC: header `h=3`, 4 stats lado a lado `h=4`/`w=6` cada,
> tabela `h=10`, timeline `h=6`, triggers+packetloss a meia-largura `h=8`,
> tráfego+CPU/RAM a meia-largura `h=9`.

> Os UIDs de dashboard (`rede.n3.agencias` etc.) são a proposta de nomenclatura
> canónica (T-04, ainda não migrada — os UIDs reais no Grafana continuam
> `rede-n3-agencias`, `rede-n4-wan-router`, etc., slugs sem pontos). A
> reorganização em pastas de segmento (2026-07-01) já foi aplicada aos UIDs
> reais — só a normalização `dominio.nivel.funcao` fica pendente.

**Ficheiros locais:**
```
Ficheiros:   lowercase-com-hifens.js (sem acentos, sem versão no nome)
  painel utils:   utils.js
  conteúdo N2/N3: l2-*.js / l3-*.js  (prefixo de nível)
Funções/vars: específicas e grepáveis (< 5 matches no codebase)
```

Git versiona — nunca `-v1`, `-old`, `copy` no nome do ficheiro.

### 4.1 Hierarquia de directórios local (REPRODUZÍVEL)

> **Actualizado 2026-07-01** — as pastas de domínio passam a ter prefixo numérico
> espelhando as pastas Grafana (`00-` a `99-`). As subpastas dentro de cada
> domínio têm prefixo de ordem de drill (`01-`, `02-`, …) seguido de nível e
> âmbito. O número de ordenação **não** entra no UID — serve apenas para
> ordenação visual no sistema de ficheiros e no Grafana.

Esta é a regra que traduz a arquitectura lógica (níveis + domínios) para a
árvore de ficheiros. Uma IA deve poder reproduzir esta estrutura **só a partir
desta secção**, sem adivinhar.

Raiz de trabalho: `C:\Repositorios\zabbix\sistema-de-observabilidade\`.

```
sistema-de-observabilidade/
├── CLAUDE.md
├── README.md
├── _comum/                         # FONTE DE VERDADE do painel utilitario canonico
│   └── utils.js
├── documentacao/
├── 00-visao-geral/                 # espelha pasta Grafana "00 · Visão Geral"
│   └── 01-n1-visao-geral/          # 1 subpasta = 1 dashboard = 1 manifest.json
│       ├── manifest.json
│       └── *.js
├── 01-infraestrutura-vmware/       # espelha "01 · Infraestrutura VMware"
│   ├── 01-n2-vmware/
│   ├── 02-n3-vmware-esxi/
│   └── ...
├── 04-rede/                        # espelha "04 · Rede"
│   ├── 01-n2-rede/                 # N2 — não pertence a nenhum segmento
│   ├── 04.1-agencias/              # segmento Agências ↔ pasta Grafana "04.1 · Agências"
│   │   ├── 01-n3-rede-agencias/
│   │   ├── 02-n4-rede-agencia/
│   │   ├── 03-n4-rede-agencia-wan-dispositivo/  # generico, so usado por esta ficha
│   │   └── 04-n5-rede-agencia-interfaces/
│   ├── 04.2-borda-dc/              # segmento Borda DC ↔ pasta Grafana "04.2 · Borda DC"
│   │   ├── arquivo-borda-dc/            # ARQUIVO — os 4 dashboards antigos (referência)
│   │   ├── 01-n3-bdc-routers/           # eixo "por router" (par: 01→02)
│   │   ├── 02-n4-bdc-router/
│   │   ├── 03-n3-bdc-provedores/        # eixo "por provedor" (par: 03→04)
│   │   ├── 04-n4-bdc-provedor/
│   │   ├── 05-n3-bdc-servicos/          # eixo "por serviço de negócio" (par: 05→06)
│   │   ├── 06-n4-bdc-servico/
│   │   └── 07-n5-bdc-router-interfaces/ # drill N4→N5 do eixo "por router" (numeração 07: 05/06 reservados ao eixo serviço)
│   ├── 04.3-dc-fabric/             # segmento DC Fabric ↔ pasta Grafana "04.3 · DC Fabric"
│   │   ├── arquivo-dc-fabric/            # ARQUIVO — os 2 dashboards antigos (referência)
│   │   ├── 01-n3-dc-dispositivos/        # eixo "por dispositivo" (par: 01→02→03)
│   │   ├── 02-n4-dc-switch/
│   │   ├── 03-n5-dc-switch-interfaces/
│   │   └── 04-n3-dc-fabric-saude/        # eixo "por saúde/correlação" (paralelo, sem N4/N5)
│   └── 04.4-edificios/             # segmento Edifícios ↔ pasta Grafana "04.4 · Edifícios"
│       ├── 01-n3-rede-edificios/
│       ├── 02-n4-rede-edificio/
│       ├── 03-n5-rede-edificio-interfaces/
│       └── 04-n6-rede-edificio-switch/
├── 05-seguranca/
├── 06-bases-dados/
├── 07-apis/
├── 08-servicos-negocio/
└── 99-arquivo/
```

**Convenção de nomes das subpastas:**
```
<ordem-drill>-<nivel>-<dominio>[-<subdomain>[-<ambito>]]
```
Exemplos: `01-n3-rede-agencias/`, `02-n4-rede-edificio/`, `04-n6-rede-edificio-switch/`

**Convenção de nomes das pastas de segmento** (quando um domínio tem múltiplos
segmentos paralelos — cada um com a sua árvore N3→N6 própria, como acontece em
Rede):
```
<NN>.<M>-<segmento>/         ex.: 04.1-agencias/, 04.2-borda-dc/
```
onde `NN` é o número do domínio (`04` = Rede) e `M` é a ordem do segmento
dentro do domínio (não a ordem de drill — os 4 segmentos de Rede são paralelos,
não sequenciais). Dentro de cada pasta de segmento, a numeração das subpastas
(`01-`, `02-`, …) **reinicia** e reflecte a ordem de drill só dentro desse
segmento (N3→N4→N5→N6).

**Regras invioláveis:**
1. **1 subpasta = 1 dashboard Grafana = 1 manifest.json com 1 dashboardUid.**
   Nunca misturar `l2-*` e `l3-*` na mesma pasta.
2. **A pasta de domínio tem prefixo numérico** espelhando a numeração Grafana
   (`04-rede/` ↔ `04 · Rede`). O número é apenas para ordenação visual — não
   entra no UID do dashboard.
3. **Quando um domínio tem múltiplos segmentos paralelos** (ex.: Rede tem 4:
   Agências/Borda DC/DC Fabric/Edifícios), cada segmento vive na sua própria
   subpasta `NN.M-segmento/` — nunca misturar dashboards de segmentos diferentes
   na mesma pasta plana por numeração global crescente (isso foi o estado antes
   de 2026-07-01 e causava confusão de navegação, tanto no disco como no
   Grafana). Dentro de cada segmento, a numeração de drill (`01-`, `02-`, …)
   reinicia. Só criar pastas de segmento quando o domínio realmente tiver mais
   de um segmento operacionalmente distinto — os restantes domínios (VMware,
   Armazenamento, Servidores Virtuais, Segurança, Bases de Dados, APIs,
   Serviços de Negócio) não têm essa necessidade hoje (0-4 dashboards cada,
   fluxo único N2→N3, sem fan-out).
4. **O UID não tem número** — usa só `dominio-nivel-funcao` (ver §4.0). O número
   é separado do UID para que reordenações futuras de domínios não invalide links.
5. Subpastas vazias (ainda por construir) levam um `.gitkeep`.
6. **Isolamento por segmento — zero cruzamento (decisão 2026-07-01).** Um
   dashboard vive só na pasta do segmento que ele serve; nenhum outro segmento
   pode apontar para ele. Se uma funcionalidade parecida for precisa noutro
   segmento, **duplica-se** o dashboard (novo UID, nova pasta, `.js` copiado)
   e especializa-se a cópia para esse segmento — nunca reaproveitar o
   original. Precedente: `rede-n4-wan-dispositivo` (genérico) vivia em
   `04.2-borda-dc/` mas só tinha consumidor real em Agências
   (`l4-ag-ficha.js`) — foi movido inteiro para `04.1-agencias/`, retitulado,
   e as suas variáveis (`group` default, opções de `iface`) especializadas
   para a nomenclatura de interface dos routers de agência (Gi/Tu), já não
   as do Borda DC (Po/Te). Commit `dba8616`+seguinte.

**Mapa de correspondência domínio local ↔ Grafana:**

| Pasta local | Pasta Grafana | UID Grafana pasta |
|---|---|---|
| `00-visao-geral/` | `00 · Visão Geral` | `bfpm0sdaos074d` |
| `01-infraestrutura-vmware/` | `01 · Infraestrutura VMware` | `bfpm0sdhhi22od` |
| `02-armazenamento/` | `02 · Armazenamento` | `dfpm0sdnq8x6oe` |
| `03-servidores-virtuais/` | `03 · Servidores Virtuais` | `cfpm0sdsxjb40c` |
| `04-rede/` | `04 · Rede` | `bfpm0sdxiclxcf` |
| `05-seguranca/` | `05 · Segurança` | `afpm0se1lombkb` |
| `06-bases-dados/` | `06 · Bases de Dados` | `afpm0se5rij28d` |
| `07-apis/` | `07 · APIs e Serviços de Negócio` | `bfpm0sedbpgqob` |
| `99-arquivo/` | `99 · Arquivo` | `dfpm0sey9ut4wb` |

> **`08 · Serviços de Negócio` apagada (2026-07-10)** — estava vazia (a Fase 8/eBankit
> nunca chegou a arrancar como domínio próprio; o eBankit já vive dentro da Fase 7
> como mais uma app sintética) e redundante com `07`. A pasta `07` foi renomeada de
> "APIs e Serviços" para "APIs e Serviços de Negócio" para reflectir a fusão dos
> dois conceitos, sem obrigar a renomear os títulos dos dashboards existentes.

**Subpastas de segmento dentro de `04-rede/` ↔ `04 · Rede` (2026-07-01):**

| Pasta local | Pasta Grafana (nested) | UID Grafana pasta |
|---|---|---|
| `04.1-agencias/` | `04.1 · Agências` | `rede-seg-agencias` |
| `04.2-borda-dc/` | `04.2 · Borda DC` | `rede-seg-bordadc` |
| `04.3-dc-fabric/` | `04.3 · DC Fabric` | `rede-seg-dcfabric` |
| `04.4-edificios/` | `04.4 · Edifícios` | `rede-seg-edificios` |

> **Migração pendente (T-05):** as pastas locais actuais não têm prefixo numérico
> (`rede/` em vez de `04-rede/`, subpastas sem número de drill). A migração faz-se
> com `git mv` + actualização dos `manifest.json` e `push_panel.py` se houver
> referências a paths. A migração dos UIDs Grafana (T-04) deve ser feita na mesma
> sessão para manter coerência.

### 4.2 Hierarquia no Grafana (organização de pastas + Portal N1)

> **Estado actual (2026-06-19): a corrigir.** O Grafana tem 82 dashboards
> espalhados por 12 pastas. A pasta de trabalho v5 (`dashboards v5`, UID
> `efpbu5tvrhce8a`) tem 17 dashboards **achatados**, sem agrupamento por domínio,
> com 3 convenções de nomes diferentes a coexistir (`N2 - Armazenamento`,
> `n2-rede`, `n3-sv-versao-a-bt`) e 3 dashboards de teste à mistura. Não existe
> porta de entrada. Isto contradiz a §1 (sistema com fluxo intuitivo) e tem de
> ser reorganizado. Esta secção é a estrutura-alvo aprovada.

**Princípio:** a estrutura de pastas no Grafana espelha o modelo mental do NOC
— **uma pasta de topo por domínio**. Dentro de cada pasta, os dashboards usam
prefixo de nível (`N2 · …`, `N3 · …`, `N4 · …`) que os ordena sozinhos. As
pastas servem para *descoberta*; o *fluxo* faz-se por drill-down (links por
UID, §7). O sistema de produção fica **limpo**, sem coexistir com o legado.

**Estrutura-alvo (pastas de domínio no topo).** A numeração espelha as Fases do
cronograma e as pastas de domínio do disco (§4.1) 1-para-1:

```
📁 00 · Visão Geral            ⭐ Portal NOC (N1) — Home do Grafana       [visao-geral/]
📁 01 · Infraestrutura VMware  N2 · VMware · N3 · ESXi / ESXi Detalhe / vCenter  [infraestrutura-vmware/]
📁 02 · Armazenamento          N2 · Visão Geral                          [armazenamento/]
📁 03 · Servidores Virtuais    N2 · VMs · N3 · VM Detalhe                [servidores-virtuais/]
📁 04 · Rede                   N2 · Rede · N3 · DC Core / Edifícios / WAN / WAN—Carriers · N4 · WAN Router / DC Switch  [rede/]
📁 05 · Segurança              (Fase 5 — vazia)                          [seguranca/]
📁 06 · Bases de Dados         (Fase 6 — vazia)                          [bases-dados/]
📁 07 · APIs e Serviços de Negócio  N2 · KPI+tabelas · N3 · App · N4 · Sistema  [apis/]
📁 09 · Agências               (vazia)                                   [agencias/]
📁 99 · Arquivo                TODO o legado consolidado aqui (destino decidido no fim)
```

> **Infraestrutura VMware ≠ Servidores Virtuais (blueprint §linhas 56-57).** São
> dois domínios/cards distintos: VMware = camada de infra (vCenters, clusters,
> ESXi); Servidores Virtuais = camada de workload (saúde das VMs, filtro por
> ambiente). Não fundir. **Não existe domínio "Servidores Físicos":** os
> dashboards Grafana com esse título (`8f6a94be`, `b55d5481`) são os ESXi e já
> estão reclassificados no disco como `n3-esxi` / `n3-esxi-detalhe` dentro de
> `infraestrutura-vmware/`.

**Convenção de nomes dentro de cada pasta de domínio:** ver §4.0 para a
convenção completa. O título usa `Nx · Domínio [· Âmbito] — Propósito`. O
prefixo `Nx` força a ordenação alfabética por nível (N2 → N3 → N4) dentro
da pasta, tornando a hierarquia imediatamente legível na lista do Grafana:

| Nível | Exemplo (domínio Rede) |
|---|---|
| N2 | `N2 · Rede — Segmentos e alertas` |
| N3 | `N3 · Rede · DC Fabric — Estado dos switches` |
| N4 | `N4 · Rede · WAN · Dispositivo — Interfaces` |

> Renomear o **título** de um dashboard é seguro: os links de drill-down (§7)
> referenciam o **UID**, que nunca muda. O `slug` da URL acompanha o título mas
> os links por UID continuam válidos.

**Mapa de migração (14 dashboards de produção v5 → pasta + novo título).**
UIDs validados contra os `manifest.json` do disco (§4.1) — fonte de verdade da
classificação por domínio:

| UID actual | Disco (manifest) | UID canónico (§4.0) | Pasta-alvo | Título canónico (§4.0) |
|---|---|---|---|---|
| `a967e936-…` | `infraestrutura-vmware/n2` | `vmware.n2.resumo` | 01 · Infraestrutura VMware | `N2 · VMware — Estado geral` |
| `8f6a94be-…` | `infraestrutura-vmware/n3-esxi` | `vmware.n3.esxi` | 01 · Infraestrutura VMware | `N3 · VMware · ESXi — Hosts e clusters` |
| `b55d5481-…` | `infraestrutura-vmware/n3-esxi-detalhe` | `vmware.n3.esxi-detalhe` | 01 · Infraestrutura VMware | `N3 · VMware · ESXi — Detalhe do host` |
| `59e7e4b2-…` | `infraestrutura-vmware/n3-vcenter` | `vmware.n3.vcenter` | 01 · Infraestrutura VMware | `N3 · VMware · vCenter — Inventário` |
| `993834a3-…` | `armazenamento/n2` | `storage.n2.resumo` | 02 · Armazenamento | `N2 · Armazenamento — Estado geral` |
| `0758c24e-…` | `servidores-virtuais/n2` | `servidores.n2.resumo` | 03 · Servidores Virtuais | `N2 · Servidores — Estado geral das VMs` |
| `0ae673a3-…` | `servidores-virtuais/n3` | `servidores.n3.vm` | 03 · Servidores Virtuais | `N3 · Servidores · VM — Diagnóstico` |
| `ec590abd-…` | `rede/n2` | `rede.n2.resumo` | 04 · Rede | `N2 · Rede — Segmentos e alertas` |
| `a75e2ba6-…` | `rede/n3-dc` | `rede.n3.dc` | 04 · Rede | `N3 · Rede · DC Fabric — Estado dos switches` |
| `471f2208-…` | `rede/n3-edificios` | `rede.n3.edificios` | 04 · Rede | `N3 · Rede · Edifícios BPC — Routers e switches` |
| `1702465e-…` | `rede/n3-wan` | `rede.n3.wan` | 04 · Rede | `N3 · Rede · WAN — Serviços e circuitos` |
| `31bace26-…` | `rede/n3-wan-carriers` | `rede.n3.wan-provedor` | 04 · Rede | `N3 · Rede · WAN — Por provedor` |
| `n3-agencias` | `rede/n3-agencias` | `rede.n3.agencias` | 04 · Rede | `N3 · Rede · Agências — Mapa de estado` |
| `n4-agencia-detalhe` | `rede/n4-agencia-detalhe` | `rede.n4.agencia` | 04 · Rede | `N4 · Rede · Agência — Diagnóstico` |
| `n4-wan-device` | `rede/n4-wan-device` | `rede.n4.wan-device` | 04 · Rede | `N4 · Rede · WAN · Dispositivo — Interfaces` |
| `c0d81130-…` | `rede/n4-wan-provedor` | `rede.n4.wan-provedor` | 04 · Rede | `N4 · Rede · WAN · Provedor — SLA e circuitos` |

> **Agências = sub-domínio de Rede.** Os dashboards de Agências vivem na pasta
> `04 · Rede` e usam UIDs `rede.n3.agencias` / `rede.n4.agencia`. A pasta
> `09 · Agências` fica vazia e vai para arquivo.

> Nota: `8f6a94be` mantém o título legado "N2 - Servidores Físicos (ESXi)" no
> Grafana mas o disco já o reclassificou como `n3-esxi` — a migração corrige o
> título para `N3 · ESXi`.

**Quarentena (não migrar; mover p/ `99 · Arquivo`):**
`n3-sv-versao-b-nativo` (`0812353b`, alternativa B descartada do N3 VMs),
`n3-servidores-virtuais` (`7b09c683`, órfão — não está em nenhum manifest do
disco), `TESTE - utils v9` (`75f53aac`), `BPC Teste API`, `teste-panel`,
`New dashboard`, `storage2`, `D01- Visão geral - Nivel 1.v2`. A eliminação fica
para o utilizador (uma IA não apaga dashboards).

> **Ponto aberto:** o N2 ESXi (`8f6a94be`) referencia os grupos `600` e `640`
> (além do `603`), que podem conter servidores físicos bare-metal reais (não
> ESXi). Confirmar na execução se há workload físico que justifique um painel
> próprio dentro de VMware ou se é só hardware-host dos hypervisores.

#### DoD da reorganização de pastas (condição de conclusão)

A reorganização de pastas Grafana está **incompleta** enquanto qualquer um dos critérios abaixo não for cumprido. Nenhum domínio conta como "pronto" (§10.1) se os seus dashboards ainda estiverem na pasta `General`.

**Checklist de conclusão (estado 2026-06-27):**
- [x] Todos os dashboards da tabela de migração acima estão na pasta de domínio correcta (nenhum em `General`) — executado 2026-06-27
- [x] Todos os títulos seguem a convenção §4.0 (`Nx · Domínio [· Âmbito] — Propósito`) — executado 2026-06-27
- [ ] Todos os UIDs canónicos (coluna "UID canónico" da tabela) estão atribuídos no Grafana — **pendente**: requer sessão dedicada; renomear UIDs invalida links em todos os `.js`
- [x] Dashboards de teste em `99 · Arquivo` (`test-push-check`, `TESTE utils v9`, `BPC Teste API`, `teste-panel`) — executado 2026-06-27
- [x] `CLAUDE.md` constraint "Pastas Grafana" actualizado — executado 2026-06-27
- [x] `GET /api/search?folderIds=<General>` devolve 0 dashboards de produção — verificado 2026-06-27

**Regra de execução:** esta reorganização é uma **sessão dedicada** — não intercalar com construção de painéis. Requer confirmação explícita de push antes de mover qualquer dashboard. Ao concluir, actualizar este checklist e o constraint do `CLAUDE.md`.

#### Workflow obrigatório após qualquer alteração com impacto no Grafana

Aplicar sempre nesta ordem — não saltar passos, não inverter:

```
1. REVALIDAR   — verificar o estado actual antes de qualquer acção
                 (API Grafana ou node --check conforme o tipo de alteração)
2. COMITAR     — commit git dos ficheiros locais alterados
                 (pedir confirmação; incluir mensagem descritiva)
3. PUSH        — push para o Grafana
                 (pedir confirmação; uma operação de cada vez)
4. REVALIDAR   — verificar o resultado no Grafana após o push
                 (screenshot + console se painel; API se estrutura)
5. CORRIGIR    — se a revalidação detectar desvios, corrigir o .js local
                 e repetir a partir do passo 1
6. DOCUMENTAR  — actualizar checklists, DoD e constraints afectados
                 (engenharia-do-sistema.md, CLAUDE.md, manifest.json)
```

Regras:
- O passo 2 (commit) precede o passo 3 (push) — o repo é sempre a fonte de verdade; nunca subir algo que não está no git.
- A revalidação do passo 4 usa os mesmos critérios da revalidação do passo 1 — confirmar que o estado melhorou e não introduziu regressões.
- O passo 6 (documentar) fecha o ciclo — uma alteração sem documentação actualizada está incompleta.

**Legado (65 dashboards das pastas `00`–`08` numeradas + `99 - Arquivo` +
`99 - Arquivo v5 legado`):** consolidar **tudo** numa única pasta `99 ·
Arquivo`. Destino final (apagar/manter) decide-se quando o v5 estiver
completo.

#### Portal NOC (N1) — porta de entrada única

O sistema precisa de **um dashboard de entrada** (não uma lista de dashboards
crua) — é o que torna isto um sistema de observabilidade e não uma amálgama.

- **Onde:** pasta `00 · Visão Geral`, definido como **Home Dashboard** da org
  (`PUT /api/org/preferences { homeDashboardUID }`) → abrir o Grafana cai aqui.
- **Topo:** logo BPC + título + relógio (reutiliza o header canónico do
  `utils.js`, §5.1).
- **Corpo:** grelha de **cartões, um por domínio** (Rede, Servidores Físicos,
  Servidores Virtuais, Armazenamento, Segurança, Bases de Dados, APIs, Serviços
  de Negócio, Agências). Cada cartão tem: ícone do domínio, nome, **rollup de
  saúde ao vivo** (contagem de down/warn via RPC, modelo de estado §6) e
  **liga ao N2 desse domínio** (drill-down por UID, §7).
- **Painel:** Business Text (`marcusolsson-dynamictext-panel`), mesmo contrato
  de bootstrap e estado dos restantes (§5, §6). Domínios ainda não construídos
  aparecem com cartão "em construção" (sem link), não escondidos — o portal é
  o mapa de cobertura do sistema.
- **Disco:** vive em `visao-geral/n1/` (§4.1), com o seu `manifest.json`.

> **Reconciliação com o CLAUDE.md:** o constraint actual "Pasta Grafana de
> trabalho = dashboards v5 / UID `efpbu5tvrhce8a`" deixa de fazer sentido quando
> os dashboards passam para pastas de domínio no topo. Ao **executar** esta
> reorganização (sessão dedicada, com confirmação de push), actualizar esse
> constraint do CLAUDE.md para a nova estrutura e esvaziar/arquivar a pasta
> `dashboards v5`. Enquanto a reorg não acontece, o constraint mantém-se válido.

## 5. Arquitectura do dashboard

### Painéis por nível (regra híbrida aplicada)

| Nível | Dynamic Text (`marcusolsson-dynamictext-panel`) | Nativo Grafana |
|---|---|---|
| N1 | cards compostos (1 por domínio) | — |
| N2 | KPI strip (topo) | tabela de hosts, top-triggers |
| N3 | header do host | séries (CPU/RAM/IO/rede), state-timeline, eventos |
| Agências | card KPIs do link | geomap |

### Contrato de métricas N3 por domínio (#10)

Cada N3 mostra o conjunto de séries/painéis abaixo. Os **nomes de item Zabbix**
confirmam-se ao sondar (§10) e fixam-se em `CFG.itemNames*` do card — esta
tabela é o alvo, não o palpite:

| Domínio | Séries / painéis N3 mínimos |
|---|---|
| Servidores Físicos | CPU %, RAM %, disco por volume, rede I/O, temperatura/HW, triggers, eventos |
| Servidores Virtuais | CPU %, RAM % (+balloon/swap), disco por volume, rede I/O, power state, **Datastores** (ver nota), triggers, eventos |
| Armazenamento | capacidade/livre por array, latência, IOPS, estado de pool/RAID, tape jobs, triggers |
| Bases de Dados | conexões, cache hit, locks, tamanho/crescimento, backup status, triggers |
| Segurança | sessões/throughput firewall, regras WAF, alertas Darktrace, estado HA |
| APIs & Serviços | latência endpoint, código HTTP, disponibilidade sintética, erros |
| Serviços de Negócio (eBankit) | estado da jornada, latência transacção, fila, dependências |
| Rede | disponibilidade ICMP, latência/perda, utilização de interface, estado de link |

**Nota Datastores (#9):** Datastores **não** é dashboard próprio — é um painel
*dentro* do N3 de Servidores Virtuais (`servidores-virtuais/n3/`), alimentado
pelos items de datastore que vivem nos hosts ESXi (grupo Hypervisores 608;
prefixo de item `Datastore discovery:` / `Total size of datastore` /
`Free space on datastore`). Estado por `% livre` (catálogo §6.2, dir `below`).

### 5.1 Contrato do painel utilitário (`utils`) — o que expõe

Obrigatório, **1 por dashboard** (`role: "utils"` no manifesto). É o primeiro
painel a carregar e o único autorizado a definir o runtime partilhado. Todos os
painéis de conteúdo **assumem** que estes símbolos existem (via `initWithRetry`,
§9) e **nunca** os redefinem. Contrato mínimo exposto em `window`:

| Símbolo | Tipo | Responsabilidade |
|---|---|---|
| `window.BPC` | objecto | namespace raiz (`BPC.utils`, `BPC.rpc`, `BPC.log`, `BPC.nav`) |
| `window.waitForBPC(cb)` | função | invoca `cb(rpc)` quando o runtime está pronto |
| `window.BPC.utils` | objecto | `waitForElement`, `startRefresh`, `buildSkeleton`, `fetchICMP` |
| `window.BPC_SHARED` | objecto | helpers puros: `esc`, `ts`, `cls`, `divider`, `pbar`, `fmtNum`, `fmtTb`, `worstState`, `severityToState`, `stateAbove/Below`, `toFloat` |
| `window.BPC_CHARTS` | objecto | SVG: `gaugeSemi`, `sparkline`, `pbar`, `dot` |
| `window.BPC.THEME` | objecto | tokens visuais consumidos pelos cards (`colorOk/Warn/Crit/Info/Mute/Dis`, `fontBody`, `sz*`, `cardPadding`, …) |
| `window.BPC.state` | objecto | API do modelo de estado (§6): `hostState(metrics)`, `worst(states)`, `color(state)` |
| CSS global `.bpc-*` | `<style>` | vive **só** aqui; nenhum card repete |

Por defeito **um** painel utils por dashboard (menos pontos de falha). Só se
separa em dois com justificação concreta (ex.: biblioteca de gráficos pesada
usada por poucos painéis). Nome canónico do ficheiro: `utils.js` (ou, em
dashboards herdados já aprovados, mantém-se `*-header-global.js` até refactor —
ver nota de conformidade em §11).

**Fonte de verdade do utils canónico:** `_comum/utils.js` (raiz). Como não há
bundler/imports, este ficheiro é **copiado** para cada `<dominio>/n2|n3/utils.js`;
qualquer melhoria ao runtime partilhado faz-se primeiro em `_comum/utils.js` e
depois propaga-se às cópias. Foi promovido (v9) a partir do header de referência
`servidores-virtuais/n2/l2-header-global.js`, acrescentando `BPC.THEME`,
`BPC_SHARED`, `BPC_CHARTS` e `BPC.state` (BLOCO 5).

**Reconciliação de cores (v9):** as cores de estado `ok/warn/crit` do `CFG_THEME`
passaram a seguir o catálogo canónico do modelo de estado (§6: `#22C55E` / `#d29922`
/ `#f85149`), para que `BPC.state.color()` e o CSS `.bpc-*` sejam uma única fonte
de verdade. O accent de marca `gold` (`#F0A500`) ficou distinto do `warn` (antes
eram iguais no header de referência).

**Contexto do objecto no título (`CFG_HEADER.objectContext`, 2026-07-02) —
obrigatório em qualquer N4/N5 com dropdown de selecção de objecto:** quando
um dashboard tem uma variável Grafana para escolher um router/interface/
provedor/agência, o **nome desse objecto tem de aparecer no final do título
do header**, ao lado do `nocLabel`, para que nunca haja ambiguidade sobre o
que está a ser mostrado. Configuração em `CFG_HEADER`:

```js
objectContext: {
  urlVars: ['routerName'],        // nome(s) da(s) variável(is) Grafana a ler do URL
  labelMap: null,                  // opcional — ver abaixo
  separator: ' · ',                // opcional — junta vários urlVars (default ' · ')
},
```

- `urlVars` — lista de nomes de variáveis (sem o prefixo `var-`). Um valor →
  mostra tal-e-qual (ex.: N4 Router, `['routerName']` → `DC1-RTE-WAN-INT`).
  Vários valores → concatenados pela ordem indicada (ex.: N5 Router
  Interfaces, `['routerName','iface']` → `DC1-RTE-PARC · Po2.421`).
- `labelMap` — só necessário quando o **valor** da variável não é
  directamente legível (ex.: N4 Provedor, onde `$provider` guarda a própria
  alternação regex `MST|MSTELECOM|MSTELCOM|KWANZA` em vez de uma chave
  simbólica). Mapa `{ 'valor-bruto': 'Label bonito' }`; tem de ficar **em
  sync manual** com a lista de opções da variável (mesmo problema dos
  `CFG.provedores` espalhados por vários painéis — não há uma fonte única
  ainda). `null` → mostra o valor bruto sem tradução.
- `null` (o valor por omissão do template) → sem contexto, para dashboards
  sem selecção de objecto (N1/N2/N3 tipo lista/comparação).

**Mecanismo:** o header lê `window.location.search` directamente (não
depende da query do painel referenciar a variável — as âncoras destes
dashboards são propositadamente fixas, para o header nunca desaparecer só
porque o objecto seleccionado está down) e actualiza `#bpc-noc-context` a
cada tick do relógio (1s), reaproveitando o `setInterval` já existente.
Como o Grafana actualiza o URL via `pushState` ao mudar uma variável (sem
recarregar a página), isto apanha a mudança sem precisar de um evento
dedicado. Ver `resolveObjectContext`/`renderContext` em `_comum/utils.js`.

### 5.2 Framework BPC do card (5 blocos) + contrato de dados

Detalhe completo do framework e do contrato `getData()→adapter()→render()` em
[`framework-de-criacao-de-cards.md`](framework-de-criacao-de-cards.md). Resumo
obrigatório:

1. **CFG** — config aninhada, única fonte de verdade (`CFG.id`, `CFG.behaviour`,
   `CFG.thresholds`, `CFG.labels`, `CFG.stateColors`…). Sem valores mágicos no
   corpo. (detalhe em `framework-de-criacao-de-cards.md`)
2. **getDemoData()** — dados estáticos para preview offline (mesma forma que o
   adapter devolve).
3. **getData(rpc)** — queries Zabbix via `rpc.call()`; devolve dados **crus**.
4. **adapter(raw)** — normaliza o cru para o **objecto de view** (forma abaixo).
5. **render(data, err)** — sub-funções ≤ 20 linhas, uma por secção visual.
6. **Bootstrap** — `initWithRetry` (§9), nunca `waitForBPC` directo.

**Contrato do objecto de view** (o que `adapter` devolve e `render` consome).
Forma mínima comum a todos os cards — cada domínio acrescenta o seu bloco:

```js
{
  state:   'ok' | 'warn' | 'crit',   // estado agregado do card (via BPC.state.worst)
  updated: <epoch ms>,               // timestamp da recolha
  stale:   <bool>,                   // algum host acima de staleThresholdSec?
  counts:  { total, ok, warn, crit, down },  // contagem de hosts/items
  hasData: <bool>,                   // false → render mostra estado vazio, nao erro
  signals: [                         // "golden signals" do dominio (0..n)
    { key, label, value, unit, state, spark? }
  ],
  // + bloco especifico do dominio (ex.: storage: {totalB, freeB, worstDs})
}
```

Regra: `render` **nunca** recalcula estado — lê `data.state`/`signals[].state`
já calculados pelo adapter via `BPC.state`. Se `getData` falhar, o bootstrap
chama `render(null, errorMsg)` (§9), nunca deixa o painel em branco.

## 6. Modelo de estado

- Estados: `ok` (#22C55E) · `warn` (#d29922) · `crit` (#f85149). Cor sempre via
  `BPC.state.color(state)` / `BPC.THEME`, nunca hex no card.
- Cada host/item → estado por thresholds documentados em `CFG.thresholds`.
- Agregação **bottom-up**: host → domínio (N2) → card N1. O pior estado
  propaga. Implementado no painel utils, consumido por todos.
- Regra: nenhuma lógica de estado hardcoded num card — sempre via utils + CFG.

### 6.1 Esquema do estado (forma única)

A API `window.BPC.state` (exposta pelo utils, §5.1) é a **única** fonte de
cálculo de estado. Esquema:

```js
// classifica UMA métrica contra um threshold { warn, crit }
BPC.state.metric(value, thr, dir = 'above')
  // dir 'above': value>=crit→'crit', >=warn→'warn', senão 'ok'
  // dir 'below': value<=crit→'crit', <=warn→'warn', senão 'ok' (ex.: espaco livre)
  // → 'ok' | 'warn' | 'crit'

// pior de uma lista de estados (precedência crit > warn > ok)
BPC.state.worst(['ok','warn','crit', ...])  // → 'crit'

// estado de um host a partir das suas métricas já classificadas
BPC.state.host({ cpu:'ok', ram:'warn', ... })  // → worst(...) ; 'down' se inalcançável

BPC.state.color('warn')  // → '#d29922'
```

Precedência fixa: `down`/`crit` > `warn` > `ok`. Host **stale** (sem dados há
mais de `CFG.behaviour.staleThresholdSec`) conta como `warn` por defeito (ou
`down` se o domínio o definir em `CFG.thresholds.staleAs`).

### 6.2 Catálogo de thresholds por domínio (única fonte de verdade)

Valores canónicos. Cada `CFG.thresholds` do card **copia daqui** — não inventa.
Mudança de threshold faz-se primeiro nesta tabela, depois no(s) card(s).
(Base inicial confirmada no card de referência Servidores Virtuais; restantes a
ratificar ao sondar cada domínio — marcar ⚠ enquanto provisório.)

| Métrica | warn | crit | dir | Domínios |
|---|---|---|---|---|
| CPU % | 70 | 90 | above | físicos, virtuais |
| RAM % | 70 | 85 | above | físicos, virtuais |
| Armazenamento/uso % | 75 | 90 | above | virtuais, armazenamento |
| Espaço livre % | 20 | 10 | below | armazenamento, bases-dados |
| Balloon (ratio) | 0.1 | 0.1 | above | virtuais (VMware) |
| Swap (ratio) | 0.1 | 0.5 | above | virtuais |
| Latência storage (ms) ⚠ | 5 | 20 | above | armazenamento |
| Disponibilidade ICMP (perda %) ⚠ | 1 | 10 | above | rede, agências |
| Severidade trigger → estado | sev≥`warn` | sev≥`critPriority` (4) | — | todos (`severityToState`) |

Mapeamento severidade Zabbix → estado: `0-1`→ok, `2-3`→warn, `4-5`→crit
(via `BPC_SHARED.severityToState`, `CFG.thresholds.critPriority` ajustável).

## 7. Contrato de navegação

Drill-down determinístico (sem links ad-hoc). Toda a construção de URL passa por
`BPC.nav` / `CFG.nav.basePath` (`/d/`) — nunca `/d/` hardcoded no render.

| Salto | Origem (clique) | Destino | URL |
|---|---|---|---|
| N1 → N2 | card de domínio inteiro | dashboard N2 | `/d/<dashUidN2>` (+ opcional `var-grupo=<groupId âncora>`) |
| N2 → N3 | linha de host na tabela | dashboard N3 | `/d/<dashUidN3>?var-hostid=<nomeHost>` |
| N3 → N2 | breadcrumb / botão voltar | dashboard N2 | `/d/<dashUidN2>` |

Regras:
- Cada card N1 conhece o `dashUid` do seu N2 em `CFG.id.dashUid`. O card inteiro
  é clicável (não um botão escondido).
- Cada N3 conhece o `dashUid` do seu N2 (volta) em `CFG.nav.parentUid`.
- **Variável de host canónica: `var-hostid`** — contém o **nome do host** Zabbix
  (campo `host.name`), não o hostid numérico. O JS resolve o hostid via
  `host.get {search: {name: $hostid}}` no arranque.
- `dashUid` tem de ser um UID real (não `PLACEHOLDER_*`); validar no DoD (§10.1)
  antes de marcar o domínio como pronto.

### 7.1 Padrão de variáveis Grafana nos dashboards N3 ("query dumb")

Os dashboards N3 usam variáveis Grafana para reactivididade ao selector de host.
O Business Text **re-executa o `afterRender`** quando a query ancora do painel
produz novos dados — logo, a âncora tem de referenciar a variável:

```
utilizador muda $hostid no dropdown
  → Grafana re-executa a query ancora do painel  (porque host: '$hostid')
  → query devolve novos dados
  → BT re-executa afterRender
  → JS lê window.location.search de fresco → var-hostid actualizado
```

**Variáveis obrigatórias num dashboard N3:**

| Variável | Tipo | Conteúdo | Visibilidade |
|---|---|---|---|
| `hostid` | query | nomes dos hosts do grupo âncora (`host: '/.*/'` + regex) | visível (dropdown) |

A variável `groupid` pode ser omitida — usar o nome do grupo **estático** tanto
na query da variável como na âncora. O `$groupid` intermédio introduz uma
dependência frágil entre variáveis que pode causar dropdown vazio.

**Âncora de cada painel N3** (campo `targets[0]`):
```json
{
  "group": {"filter": "BPC / INFRAESTRUTURA / <DOMINIO>"},
  "host":  {"filter": "$hostid"},
  "item":  {"filter": "ICMP ping"}
}
```

Esta âncora é definida no `manifest.json` do dashboard (`"anchor": {...}`) e
o `push_panel.py` aplica-a ao criar/actualizar painéis.

**Leitura no `afterRender`:**
```js
var hostRaw = new URLSearchParams(window.location.search).get('var-hostid') || ''
// hostRaw é o nome do host → resolver hostid via host.get
```

**O que NÃO usar:**
- ❌ Variável `textbox` sem âncora que a referencie — o `afterRender` não re-executa
- ❌ `window.BPC.L3` coordinator pattern para este problema — é desnecessário;
  o mecanismo nativo do BT (re-exec via query) é suficiente e mais simples
- ❌ `replaceVariables('$hostid')` — não está disponível no contexto `afterRender`
  desta versão do plugin; usar `window.location.search` directamente
- ❌ Usar grupo de enriquecimento (ex.: 608 HYPERVISORES) como fonte da variável —
  usar sempre o **grupo âncora do domínio** (§3) com regex a filtrar o subtipo
  (ex.: `/VIRT.*ESXi.*/`); a filtragem por tag faz-se no JS após resolução do host

## 8. Fluxo de trabalho de desenvolvimento

```
1. Editar o .js local
2. node --check ficheiro.js
3. Push do painel para o Grafana (pede confirmação — escrita partilhada)
4. Testar no browser (screenshot + console, esperar 15-20s pelos dados)
5. Aprovado → git commit | Reprovado → corrigir .js e repetir do passo 2
```

**Construção incremental, painel a painel** (não tudo de uma vez):
utils primeiro → cada painel de conteúdo → testar → aprovar → próximo.
Layout final (gridPos lado a lado) só depois de todos os painéis aprovados.

**Manifesto** (`manifest.json` por dashboard) liga ficheiro↔painel:
```json
{ "dashboardUid": "...", "panels": [
  { "file": "utils.js", "id": 1,    "role": "utils",   "title": "..." },
  { "file": "l2-...js", "id": null, "role": "content", "title": "..." }
] }
```
`id` = `null` até ao 1º push (atribuído pelo Grafana).

Para dashboards N3 com variáveis (§7.1), adicionar também:
```json
{
  "anchor": {
    "group": {"filter": "$groupid"},
    "host":  {"filter": "$hostid"},
    "item":  {"filter": "ICMP ping"}
  }
}
```
O `push_panel.py` usa a âncora do manifest quando presente, caso contrário usa
a âncora padrão (Storage IBM FS9500, sempre disponível — para dashboards sem
variáveis de host).

## 9. Padrões de código obrigatórios

**Bootstrap com retry** (todo painel de conteúdo) — evita que uma corrida de
carregamento derrube o dashboard inteiro:
```js
function start(rpc) { /* lógica */ }
function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(start); return }
  if (attempt > 50) { console.error('[BPC] <nome>: waitForBPC indisponivel'); return }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}
initWithRetry()
```

**Query âncora** — o `target` Zabbix do painel BT nunca tem `group`/`host`/
`item` vazios (0 linhas = render nunca acontece). Apontar para algo real.

**Reutilização** — nunca redefinir `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils`
localmente; nunca repetir CSS `.bpc-*` (vive no utils); gauges via
`BPC_CHARTS.gaugeSemi()`.

**Limites** — funções ≤ 20 linhas; ficheiros < 500 linhas.

## 10. Estratégia de teste

| Quando | Como |
|---|---|
| Antes de codar um painel | sondar a API (`hostgroup.get`/`item.get`) — confirmar que dados existem no grupo/host |
| Antes de push | `node --check` |
| Após push | screenshot + `read_console_messages` (zero erros) + esperar dados |
| Render vazio | inspeccionar DOM (`dt-row` preenchido?) + verificar query âncora |
| Aprovação | estado correcto vs realidade Zabbix; navegação drill-down funciona |

### 10.2 Procedimento de sondagem (antes de codar qualquer painel)

Confirmar sempre que os dados existem **antes** de escrever o card. Há duas vias:

**Via A — API Zabbix directa** (mais rápida para inventário/items). Tokens no
ficheiro `C:\Repositorios\zabbix\tok3n` (nunca colar em chat/commit):

| Zabbix | Endpoint | Usar para |
|---|---|---|
| Infra | `http://10.10.126.22/zabbix/api_jsonrpc.php` | físicos, virtuais, armazenamento, segurança, bases-dados, apis, serviços |
| Network | `http://10.10.233.140/zabbix/api_jsonrpc.php` | rede, agências |

Header: `Authorization: Bearer <token>`, `Content-Type: application/json-rpc`.
Métodos típicos:
```
apiinfo.version            → smoke test (não precisa auth)
hostgroup.get {output:[groupid,name], selectHosts:count}   → inventário
host.get      {groupids:[<id>], output:[hostid,name]}       → hosts do grupo
item.get      {groupids:[<id>], search:{name:'CPU'}, output:[name,key_,lastvalue]}  → confirmar items/thresholds
```

**Via B — proxy Grafana** (o que os painéis usam em runtime, valida o caminho
real): `POST /api/datasources/uid/<dsUid>/resources/zabbix-api` com um token
**Grafana** (service account `sa-1-dev`). `dsUid`: `3_KgG43nz` (infra) ou o UID
de network (a confirmar com `GET /api/datasources`).

Saída esperada: registar no `mapa-host-groups.md` / `CFG.itemNames*` os nomes
de item exactos antes de construir. Item inexistente = render vazio (§7 âncora).

### 10.1 Definição de pronto (DoD) — critério de aceitação

Uma unidade só conta como ☑ na §12 quando cumpre o seu DoD. Sem isto, "pronto"
é subjectivo.

**Painel** (pronto):
- [ ] `node --check` passa; ficheiro < 500 linhas; funções ≤ 20 linhas
- [ ] usa `initWithRetry`; não redefine `BPC_SHARED`/`BPC_CHARTS`/`THEME`
- [ ] CFG aninhado; sem strings/cores/thresholds hardcoded (lê do catálogo §6.2)
- [ ] `target` âncora aponta para host/item real; render não fica em branco
- [ ] testado no Grafana (≥15-20s), estado bate certo com a realidade Zabbix
- [ ] `id` registado no `manifest.json`

**Dashboard N2/N3** (pronto): todos os painéis prontos + 1 painel `utils` +
layout final aplicado + `dashboard-snapshot.json` gravado (fecho, CLAUDE.md §4)
+ navegação de entrada/saída testada (N1→N2→N3) + commit.

**Dashboard N4/N5 com dropdown de objecto** (pronto, adicional ao acima):
- [ ] `CFG_HEADER.objectContext` configurado (§5.1) — nome do objecto
      seleccionado aparece no final do título do header
- [ ] testado trocando o objecto no dropdown **real** (não só por URL — os
      dois caminhos de interpolação do Grafana podem divergir; ver
      `cronograma.md` 4.25 sobre o bug do `${provider:raw}`, encontrado
      exactamente por só ter sido testado por URL antes)

**Domínio** (pronto): N2 pronto **e** N3 pronto **e** card N1 do domínio liga ao
N2 (`dashUid` real) **e** drill-down N1→N2→N3→volta verificado ponta-a-ponta.

## 11. Operação e manutenção

- **Dois Zabbix, dois datasources** (mesmo Grafana `http://10.10.126.22:3000`):

  | Zabbix | Servidor API | Datasource Grafana | Domínios |
  |---|---|---|---|
  | Infra | `10.10.126.22/zabbix` (v7.4.8) | `3_KgG43nz` | físicos, virtuais, armazenamento, segurança, bases-dados, apis, serviços-negócio |
  | Network | `10.10.233.140/zabbix` | `ffo8sp8zllog0e` ("BPC-NETWORK") | **rede**, **agências** |

  Cada painel/manifesto declara o datasource correcto. Um card de Rede aponta
  para o datasource de network, não para `3_KgG43nz`. UID Grafana de network
  confirma-se com `GET /api/datasources` (token Grafana) ao iniciar a Rede.
  Procedimento de sondagem completo em §10.2.
- **Coordenadas Grafana:** pasta canónica `efpbu5tvrhce8a` ("dashboards v5");
  arquivo `efp8usobcfeo0d` ("99 - Arquivo v5 (legado)"); service account API
  `sa-1-dev`.
- **Credenciais** em `C:\Repositorios\zabbix\tok3n` (nunca colar em
  chat/commit): tokens da **API Zabbix directa** (infra, network, network2). O
  token **Grafana** (SA `sa-1-dev`, para `GET /api/datasources` e push de
  dashboards) é separado — pedir/renovar quando necessário.
- **Referência (não tocar):** `d01-v1` (N1), `5b6b0e85-…` (N2 virtuais),
  `ad040c90-…` (N3 detalhe VM) — no arquivo, só consulta/salvamento.
- **Versionamento Grafana:** cada push cria versão; revertível em Version
  history. O repo é a fonte de verdade do código.
- **Alterações partilhadas:** qualquer escrita no Grafana partilhado pede
  confirmação explícita.

## 12. Bugs conhecidos e dívida técnica

> Actualizado 2026-06-27 — reconstrução do N4 Agência (triagem NOC). Bugs B-01/B-02/B-03/T-01/T-03 **resolvidos**.

### 12.0 Resolvidos (2026-06-27)

| ID | Nível | Causa **real** | Correcção |
|---|---|---|---|
| B-01 | N2 Rede | `window.BPC.NET_THR` (thresholds RTT/perda) consumido por `l2-kpi`/`l2-segmentos` mas **nunca definido** no utils (o `.css` registado antes era impreciso) | + `BPC.NET_THR` (RTT 5/50, perda 1/10) em `_comum/utils.js` + cópia N2 |
| B-02 | N2 Rede | Mesma raiz (NET_THR) **+** `CFG_META.apiUrl` do utils apontava ao Zabbix **Infra**; grupos 24-29 só existem no Network → arrays vazios sem erro | NET_THR + `apiUrl`→`ffo8sp8zllog0e` (Network) no `rede/n2/utils.js` |
| B-03 | N4 Agência | **Mismatch de datasource**: painel = Network, mas o *target* da âncora = Infra (Storage) → query corre na rede com filtro Infra → 0 linhas (não era só o host da agência) | Âncora própria no manifest: `DC1-RTE-WAN-INT` (host de rede sempre UP), datasource da âncora == datasource do painel |
| T-01 | N1 | Card Agências `dashUid: null` | Liga a `n3-agencias` + `linkLabel` configurável |
| T-03 | N4 Agência | Link com `var-iface=Gi0/1` hardcoded | N4 passa a fazer drill ao **N5** com `var-host` (sem iface fixa) |

### 12.1 Bugs activos (bloqueantes)

*(nenhum)*

### 12.2 Dívida técnica (não bloqueante)

| ID | Nível | Descrição | Prioridade |
|---|---|---|---|
| T-02 | N1 | Painel utils com título "Header + Shared" visível (no N4 já corrigido; rever N1/outros) | Média |
| T-04 | Todos | ✅ **UIDs canónicos migrados** (domínio Rede, 2026-07-01): 15 dashboards renomeados no Grafana para formato `dominio-nivel-funcao`. Nota: Grafana 12 não aceita '.' em UIDs — separador é '-'. Manifests, .js e dashboard-completo.json actualizados localmente. Drill-downs N1→N6 funcionais. | CONCLUÍDO |
| T-05 | Todos | ✅ **Pastas locais renomeadas** (domínio Rede + todos os domínios, 2026-07-01): pastas top-level 00-visao-geral…09-agencias; sub-pastas 04-rede 01-n2-rede…16-n4-rede-wan-router. Commits 2f74d5e + d6ea207. | CONCLUÍDO |
| T-05b | N1/N3 | Links BT vs Grafana data links — testar no browser real | Média |
| T-06 | N4/N5 | Provider/Tipo/nº de links derivados das **tags** manuais; derivar do **nome real da interface** (verdade viva SNMP) e sinalizar divergências | Média |
| T-07 | Agências | Agências **ponto-a-ponto sem router próprio** ficam invisíveis (não estão em `HG_AGENCIAS_ROUTERS`) — mapear pela sub-interface do router-pai | Alta (pós-N5) |
| T-08 | N5 Agência | Bloco **Utilização %** fora — `net.if.speed` = 0 nas interfaces tunnel/DMVPN; reactivar quando o speed estiver populado no Zabbix | Baixa |
| T-09 | N4/N5 Agência | Para agências **totalmente DOWN** o drill não chega à causa raiz (SNMP cai com o router). Adicionar **correlação por provider via hub DMVPN** (`DC1-RTE-WAN-AG`, estado por provider Tu101/Tu105…) — distingue outage-de-provider de problema-local. Validado caso CUNHINGA (cronograma 9.6 / Z.15) | Média |

### 12.3 Estado do fluxo Agências (2026-06-27, pós-reconstrução)

`N1 ✅ → N2 ✅(corrigido) → N3 ✅ → N4 ✅(reconstruído) → N5 ☐(pendente)`

| Nível | UID | Estado |
|---|---|---|
| N1 Visão Geral | `n1-visao-geral-noc` | ✅ card Agências liga ao N3 |
| N2 Rede | `ec590abd` | ✅ 315 disp., 649 alertas reais (NET_THR + apiUrl Network) |
| N3 Agências | `n3-agencias` | ✅ geomap + tabela → N4 |
| **N4 Agência** | `n4-agencia-detalhe` | ✅ **reconstruído** — triagem NOC (ESTADO/PORQUÊ/LINKS WAN/PROBLEMAS nativos/TENDÊNCIA), dropdown por nome, ficha nativa. Detalhe em `fluxo-agencias-n4-n5.md` |
| **N5 Agência Interfaces** | `n5-agencia-interfaces` | ✅ **criado** — Estado&flaps + Tráfego + Erros + Descartes (todas as ifaces); dropdown Agência+Interface; back-link N4. Utilização % fora (speed=0 → T-08) |

## 13. Roadmap e checklist

O roadmap detalhado e o estado de cada ponto vivem no **`../cronograma.md`**
(painel de controlo vivo, ponto por ponto, com datas). Este documento define a
arquitectura e os contratos; o cronograma rastreia a execução. Não duplicar o
estado aqui — actualizar sempre o `cronograma.md`.

Ordem das fases: 0 Fundação → 1 Servidores Físicos → 2 Armazenamento →
3 Servidores Virtuais (conformar) → 4 Rede → 5 Segurança → 6 Bases de Dados →
7 APIs & Serviços → 8 Serviços de Negócio → 9 Agências → 10 N1 Visão Geral →
11 (fase 2) N0 Executivo/SLA. As acções Zabbix do lado do utilizador também
estão no cronograma (secção própria).
