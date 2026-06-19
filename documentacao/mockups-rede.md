# Mockups — Domínio 04 · Rede

> Gerado em 2026-06-19. Aprovado pelo utilizador antes de qualquer implementação.
> Todos os mockups seguem o padrão NOC BPC v5.
> Referências: `blueprint-observabilidade.md` · `mapa-host-groups.md` · `engenharia-do-sistema.md`

---

## Decisões de design aprovadas nesta sessão

| # | Decisão | Racional |
|---|---|---|
| D1 | **Agências integradas em Rede** (domínio 04) | Agências e Edifícios têm a mesma natureza — routers + switches de acesso. Separar era fragmentação sem valor operacional. |
| D2 | **Organização WAN por serviço/router**, não por provider | A arquitectura BPC mapeia directamente router→serviço. A vista por provider é comercial, não operacional. |
| D3 | **N4 · Ficha de dispositivo** parametrizado por `var-hostid` — 1 dashboard único para todos os sub-domínios | Evita 4 dashboards quase idênticos. O tipo de dispositivo é inferido pelo hostid. |
| D4 | **Triggers: Nativo Grafana Table + Data links** | Table nativo com override Data link na coluna Host passa `var-hostid` para o N4. Sem necessidade de Dynamic Text só para triggers. |
| D5 | **Time series: 4 painéis separados em grid 2×2** | Um painel por sub-domínio/contexto — fácil de ler, sem sobreposição de séries. |
| D6 | **Cards de sub-domínio com drill-down directo** para o N3 respectivo | Cada card no N2 tem link explícito `→ N3`. Cada linha no N3 tem link `↗ ficha` para o N4. |

---

## Hierarquia completa de dashboards

```
N2 · Rede  (uid: ec590abd-c1ab-4b83-ac26-2b998aa80556)
  ├── Card WAN       → N3 · WAN — Serviços
  ├── Card DC Fabric → N3 · DC — Fabric
  ├── Card Edifícios → N3 · Edifícios
  └── Card Agências  → N3 · Agências

N3 · WAN — Serviços  (pasta: rede/n3-wan/)
  ├── Card INTERNET   → N4 · Ficha (var-hostid=10838)
  ├── Card EMIS       → N4 · Ficha (var-hostid=10839)
  ├── Card AGÊNCIAS   → N4 · Ficha (var-hostid=10996)
  ├── Card PARCEIROS  → N4 · Ficha (var-hostid=11001)
  └── Card AZURE/GOV  → N4 · Ficha (var-hostid=10840)

N3 · DC — Fabric  (pasta: rede/n3-dc/)
  └── Tabela SPINEs/LEAFs → N4 · Ficha (var-hostid=<hostid do switch>)

N3 · Edifícios  (pasta: rede/n3-edificios/)
  └── Tabela por edifício → N4 · Ficha (var-hostid=<hostid do router/switch>)

N3 · Agências  (pasta: rede/n3-agencias/)  ← pasta nova
  └── Lista agências DOWN → N4 · Ficha (var-hostid=<hostid agência>)

N4 · Ficha de Dispositivo  (pasta: rede/n4-device/)  ← pasta nova, substitui n4-wan-router
  Parametrizado: var-hostid
  Link de retorno: dinâmico para N3 pai (via variável var-parent-uid ou link fixo por sub-domínio)
```

---

## Ficheiros a criar / apagar / manter

| Pasta | Acção | Motivo |
|---|---|---|
| `rede/n2/` | **Manter + rever** | Funcional; actualizar links dos cards para N3 correcto |
| `rede/n3-wan/` | **Apagar e recriar** | Versão antiga (por router estático); nova versão é por serviço com 5 cards |
| `rede/n3-wan-carriers/` | **Apagar** | Conceito errado (por carrier/provider) |
| `rede/n3-dc/` | **Manter + rever** | Existe; verificar se cobre SPINEs + LEAFs + OOB |
| `rede/n3-edificios/` | **Manter + rever** | Funcional; verificar se cobre grupos 28+29 |
| `rede/n3-agencias/` | **Criar** | Sub-domínio novo — agências passam de domínio independente para N3 de Rede |
| `rede/n4-wan-router/` | **Renomear → `n4-device/`** | Base reutilizável; generalizar para todos os sub-domínios |
| `rede/n4-wan-provedor/` | **Apagar** | Conceito "por provider" abandonado |
| `rede/n4-dc-switch/` | **Fundir em `n4-device/`** | Lógica absorvida pelo N4 genérico parametrizado |

---

## N2 · Rede

**Ficheiro:** `rede/n2/`
**Dashboard UID:** `ec590abd-c1ab-4b83-ac26-2b998aa80556`
**Pasta Grafana:** `04 · Rede` (`bfpm0sdxiclxcf`)
**Datasource:** `ffo8sp8zllog0e` (BPC-NETWORK)
**Grupos Zabbix:** 24, 25, 26, 27, 28, 29

### Layout (aprovado)

```
┌─ Header (utils) ────────────────────────────────────────────────────────┐
├─ KPI Strip (4 métricas) ────────────────────────────────────────────────┤
│  Total Dispositivos · UP · DOWN/Degradado · Alertas Activos             │
├─ 4 Cards de Sub-domínio ────────────────────────────────────────────────┤
│  [WAN]         [DC Fabric]    [Edifícios]     [Agências]                │
│  5 routers     8 switches     9R + 46SW        220R + 27SW              │
│  lista serviços lista camadas lista edifícios  breakdown carrier        │
│  → N3-WAN      → N3-DC        → N3-Edif        → N3-Agên               │
├─ Time Series 2×2 ───────────────────────────────────────────────────────┤
│  [Tráfego WAN]    [Tráfego DC]                                          │
│  [Tráfego Edif]   [Tráfego Agên]                                        │
└─ Triggers Activos (todos os grupos) ────────────────────────────────────┘
```

### Especificação de painéis

| Painel | Tipo | Fonte | Dados-chave |
|---|---|---|---|
| Header + utils | Dynamic Text (utils) | — | `nocLabel: 'REDE · VISÃO GERAL · NÍVEL 2'` |
| KPI Strip | Dynamic Text | `trigger.get` + `host.get` grupos 24-29 | UP/DOWN count, alertas activos |
| Card WAN | Dynamic Text | `item.get` net.if.status · hostids 10838/39/40/96/01 | Estado por serviço, link → N3-WAN |
| Card DC Fabric | Dynamic Text | `trigger.get` + `icmpping` · grupos 26+22 | UP/DOWN switches, link → N3-DC |
| Card Edifícios | Dynamic Text | `trigger.get` + `icmpping` · grupos 28+29 | UP/DOWN por edifício, link → N3-Edif |
| Card Agências | Dynamic Text | `trigger.get` + `icmpping` · grupos 24+25 | UP/DOWN count + carrier breakdown, link → N3-Agên |
| TS Tráfego WAN | Time series (nativo) | `net.if.in/out` · grupo 27 | Agregado dos 5 routers |
| TS Tráfego DC | Time series (nativo) | `net.if.in/out` · grupo 26 | Uplinks PortChannel |
| TS Tráfego Edif | Time series (nativo) | `net.if.in/out` · grupos 28+29 | Agregado routers edifícios |
| TS Tráfego Agên | Time series (nativo) | `net.if.in/out` · interfaces Tu* de 10996 | DMVPN tunnels WAN-AG |
| Triggers Activos | Table (nativo) | `trigger.get` grupos 24-29 | Colunas: Sev · Host (data link → N4) · Descrição · Duração · Sub-domínio |

---

## N3 · WAN — Serviços

**Ficheiro:** `rede/n3-wan/` ← recriar do zero
**Datasource:** `ffo8sp8zllog0e`
**Grupos:** 27 (5 routers)
**Hostids:** WAN-INT=10838 · WAN-EMIS=10839 · GTW01=10840 · WAN-AG=10996 · PARC=11001

### Layout (aprovado)

```
┌─ Header (utils) ──────────────────────────────────────────────────────────┐
├─ KPI Strip (5): Routers · Serviços UP · Degradado · Circuitos · Alertas ──┤
├─ 5 Cards (1 por router/serviço) ──────────────────────────────────────────┤
│  [INTERNET]   [EMIS]      [AGÊNCIAS]   [PARCEIROS]  [AZURE/GOV]           │
│  WAN-INT      WAN-EMIS    WAN-AG       PARC         GTW01                  │
│  3 BGP UP     3 circ UP   5 tunnels    4 parceiros  Po1 DOWN ⚠            │
│  → N4:10838   → N4:10839  → N4:10996   → N4:11001   → N4:10840            │
├─ Time Series 2×2 (tráfego por router) ────────────────────────────────────┤
│  [WAN-INT]    [WAN-EMIS]                                                   │
│  [WAN-AG]     [GTW01]                                                      │
│  (PARC omitido ou 5º painel full-width se tráfego disponível)              │
└─ Triggers WAN ─────────────────────────────────────────────────────────────┘
```

### Especificação de painéis

| Painel | Tipo | Dados-chave |
|---|---|---|
| Header + utils | Dynamic Text (utils) | `nocLabel: 'REDE · WAN — SERVIÇOS · NÍVEL 3'` |
| KPI Strip | Dynamic Text | `trigger.get` + `item.get` · grupo 27 |
| Card INTERNET | Dynamic Text | `item.get` net.if.status · hostid 10838 · interfaces Gi0/0/0-2 |
| Card EMIS | Dynamic Text | `item.get` net.if.status · hostid 10839 |
| Card AGÊNCIAS | Dynamic Text | `item.get` net.if.status · hostid 10996 · interfaces Tu101-105 |
| Card PARCEIROS | Dynamic Text | `item.get` net.if.status · hostid 11001 · sub-interfaces |
| Card AZURE/GOV | Dynamic Text | `item.get` net.if.status · hostid 10840 · destaque Po1 DOWN |
| TS × 4 (2×2) | Time series (nativo) | `net.if.in/out` por hostid, todas interfaces agregadas |
| Triggers WAN | Table (nativo) | `trigger.get` hostids=[10838,10839,10840,10996,11001] · Data link Host → N4 |

---

## N3 · DC — Fabric

**Ficheiro:** `rede/n3-dc/` ← manter, verificar cobertura
**Datasource:** `ffo8sp8zllog0e`
**Grupos:** 26 (7 switches) + 22 (1 OOB) = 8 dispositivos

### Layout (aprovado)

```
┌─ Header (utils) ──────────────────────────────────────────────────────────┐
├─ KPI Strip (5): Switches · UP · PortChannels · Interfaces DOWN · Alertas ─┤
├─ 4 Blocos de Fabric (2×2) ────────────────────────────────────────────────┤
│  [SPINE (2)]          [vPC-A — LEAF-101/102]                              │
│  Route reflectors     Uplink WAN-AG + GTW01                               │
│  EVPN state           PortChannel state                                   │
│                                                                            │
│  [vPC-B — LEAF-103/104]  [LEAF-105 standalone + OOB]                      │
│  Uplink ISR4451          Sem vPC · alerta util                            │
│  PortChannel state       DC-IMP-SWA-EDGE                                  │
│  Cada linha → N4 (hostid)                                                 │
├─ Time Series 2×2 (tráfego uplinks por camada) ────────────────────────────┤
│  [SPINEs E1/49+50]    [vPC-A Po uplinks]                                  │
│  [vPC-B Po uplinks]   [LEAF-105 interfaces activas]                       │
└─ Triggers DC ──────────────────────────────────────────────────────────────┘
```

### Especificação de painéis

| Painel | Tipo | Dados-chave |
|---|---|---|
| Header + utils | Dynamic Text (utils) | `nocLabel: 'REDE · DC — FABRIC · NÍVEL 3'` |
| KPI Strip | Dynamic Text | `trigger.get` + `icmpping` · grupos 26+22 |
| 4 Blocos Fabric | Dynamic Text | `item.get` net.if.status por hostid · agrupamento por vPC |
| TS × 4 (2×2) | Time series (nativo) | `net.if.in/out` Po/E1 de cada camada |
| Triggers DC | Table (nativo) | `trigger.get` grupos 26+22 · Data link Host → N4 |

---

## N3 · Edifícios

**Ficheiro:** `rede/n3-edificios/` ← manter, verificar cobertura
**Datasource:** `ffo8sp8zllog0e`
**Grupos:** 28 (9 routers) + 29 (46 switches) = 55 dispositivos

### Layout (aprovado)

```
┌─ Header (utils) ─────────────────────────────────────────────────────────┐
├─ KPI Strip (5): Edifícios · Routers UP · Switches UP · Total · Alertas ──┤
├─ Tabela por Edifício ─────────────────────────────────────────────────────┤
│  Edifício | Router | ICMP | Switches | Tráfego IN (barra) | Alertas | → N4│
│  9 linhas · highlight vermelho/amarelo se problema                         │
├─ Time Series 2×2 (top 4 edifícios por tráfego) ───────────────────────────┤
│  [Sede BPC]     [DSI/Mutamba]                                              │
│  [DPS/Trans]    [Fénix]                                                    │
└─ Triggers Edifícios ───────────────────────────────────────────────────────┘
```

### Especificação de painéis

| Painel | Tipo | Dados-chave |
|---|---|---|
| Header + utils | Dynamic Text (utils) | `nocLabel: 'REDE · EDIFÍCIOS · NÍVEL 3'` |
| KPI Strip | Dynamic Text | `icmpping` + `trigger.get` · grupos 28+29 |
| Tabela Edifícios | Dynamic Text | `host.get` grupos 28+29 · `trigger.get` por host · barra tráfego |
| TS × 4 (2×2) | Time series (nativo) | `net.if.in/out` top 4 routers por tráfego |
| Triggers Edifícios | Table (nativo) | `trigger.get` grupos 28+29 · Data link Host → N4 |

---

## N3 · Agências

**Ficheiro:** `rede/n3-agencias/` ← criar
**Datasource:** `ffo8sp8zllog0e`
**Grupos:** 24 (220 routers) + 25 (27 switches)

### Layout (aprovado)

```
┌─ Header (utils) ──────────────────────────────────────────────────────────┐
├─ KPI Strip (5): Total · UP · DOWN · Com switch · Alertas ─────────────────┤
├─ 2 colunas ────────────────────────────────────────────────────────────────┤
│  [Geomap Angola — nativo Grafana]  [Breakdown por carrier + lista DOWN]    │
│  verde=UP · vermelho=DOWN          Barra por carrier (% disponibilidade)   │
│  lat/lon do inventário Zabbix      Lista das agências DOWN com → N4        │
├─ Time Series 2×2 (tráfego DMVPN por tunnel WAN-AG) ───────────────────────┤
│  [Tu101 Unitel]   [Tu102 ITA]                                              │
│  [Tu103 MST]      [Tu104+105 AT+Multitel]                                  │
└─ (sem painel de triggers separado — as agências DOWN já estão na lista) ───┘
```

### Especificação de painéis

| Painel | Tipo | Dados-chave |
|---|---|---|
| Header + utils | Dynamic Text (utils) | `nocLabel: 'REDE · AGÊNCIAS · NÍVEL 3'` |
| KPI Strip | Dynamic Text | `icmpping` + `trigger.get` · grupos 24+25 |
| Geomap | Geomap (nativo) | `icmpping` · grupo 24 · lat/lon de inventory fields |
| Carrier breakdown + lista DOWN | Dynamic Text | `trigger.get` grupos 24+25 + status Tu* de hostid 10996 |
| TS × 4 (2×2) | Time series (nativo) | `net.if.in/out` · interfaces Tu101-105 · hostid 10996 |

**Nota geomap:** as coordenadas das agências têm de estar no inventário Zabbix (`inventory.location_lat` / `inventory.location_lon`) — verificar antes de construir. Se não existirem, substituir geomap por tabela paginada.

---

## N4 · Ficha de Dispositivo

**Ficheiro:** `rede/n4-device/` ← criar (substituindo n4-wan-router, n4-dc-switch, n4-wan-provedor)
**Datasource:** `ffo8sp8zllog0e`
**Variável:** `var-hostid` (passado pelo N3 pai via data link)
**Variável:** `var-parent` (UID do N3 pai — para o link de retorno dinâmico)

### Layout (aprovado)

```
┌─ Header (utils) ─────────────────────────────────────────────────────────┐
├─ Breadcrumb: ← [N3 pai] / [nome do host] ────────────────────────────────┤
├─ Info Strip: ícone · nome · modelo · IOS · IP · uptime · sub-domínio ────┤
├─ KPI Strip (5): Interfaces UP · DOWN · Tráfego IN · OUT · Alertas ───────┤
├─ Tabela de Interfaces ────────────────────────────────────────────────────┤
│  Interface | Descrição | Estado | Velocidade | IN (Mbps) | OUT | Util%   │
│  barra de utilização · highlight se > threshold                           │
├─ Time Series 2×2 ─────────────────────────────────────────────────────────┤
│  [Tráfego IN top 3 interfaces]  [Tráfego OUT top 3 interfaces]            │
│  [CPU % (se disponível)]        [Memória % (se disponível)]               │
└─ Triggers deste Host ──────────────────────────────────────────────────────┘
```

### Especificação de painéis

| Painel | Tipo | Dados-chave |
|---|---|---|
| Header + utils | Dynamic Text (utils) | `nocLabel` dinâmico com nome do host |
| Info Strip | Dynamic Text | `host.get` hostids=[var-hostid] · `item.get` sysDescr, uptime, version |
| KPI Strip | Dynamic Text | `item.get` net.if.status + `trigger.get` · hostid=[var-hostid] |
| Tabela Interfaces | Dynamic Text ou Table nativo | `item.get` net.if.* · hostid=[var-hostid] |
| TS Tráfego IN (top3) | Time series (nativo) | `net.if.in` · hostid=[var-hostid] · top 3 por volume |
| TS Tráfego OUT (top3) | Time series (nativo) | `net.if.out` · hostid=[var-hostid] |
| TS CPU | Time series (nativo) | `system.cpu.util` ou `cisco.cpu.*` · hostid=[var-hostid] |
| TS Memória | Time series (nativo) | `vm.memory.utilization` ou `cisco.mem.*` · hostid=[var-hostid] |
| Triggers do host | Table (nativo) | `trigger.get` hostids=[var-hostid] |

**Nota tabela de interfaces:** se Dynamic Text, usa `item.get` com `search: {key_: "net.if."}` e renderiza linha a linha. Se Table nativo, o datasource Zabbix pode devolver as interfaces como rows — verificar suporte antes de implementar.

---

## Mapa de navegação completo

```
N1 · Visão Geral
  └─ Card "Rede" ──────────────────────────────────────────── → N2 · Rede

N2 · Rede
  ├─ Card WAN ─────────────────────────────────────────────── → N3 · WAN — Serviços
  ├─ Card DC Fabric ───────────────────────────────────────── → N3 · DC — Fabric
  ├─ Card Edifícios ───────────────────────────────────────── → N3 · Edifícios
  ├─ Card Agências ────────────────────────────────────────── → N3 · Agências
  └─ Triggers: col. Host (data link) ─────────────────────── → N4 · Ficha (var-hostid)

N3 · WAN — Serviços
  ├─ Card INTERNET  → N4 · Ficha (var-hostid=10838)
  ├─ Card EMIS      → N4 · Ficha (var-hostid=10839)
  ├─ Card AGÊNCIAS  → N4 · Ficha (var-hostid=10996)
  ├─ Card PARCEIROS → N4 · Ficha (var-hostid=11001)
  ├─ Card AZURE/GOV → N4 · Ficha (var-hostid=10840)
  └─ Triggers: col. Host ──────────────────────────────────── → N4 · Ficha

N3 · DC — Fabric
  ├─ Tabela: col. ↗ ficha (por switch) ───────────────────── → N4 · Ficha
  └─ Triggers: col. Host ──────────────────────────────────── → N4 · Ficha

N3 · Edifícios
  ├─ Tabela: col. ↗ ficha (por router/switch) ────────────── → N4 · Ficha
  └─ Triggers: col. Host ──────────────────────────────────── → N4 · Ficha

N3 · Agências
  └─ Lista DOWN: col. ↗ ficha ─────────────────────────────── → N4 · Ficha

N4 · Ficha de Dispositivo
  └─ Breadcrumb ← [N3 pai] ──────── (link de retorno via var-parent ou link fixo por sub-domínio)
```

---

## Questões abertas antes de implementar

| # | Questão | Impacto |
|---|---|---|
| Q1 | Inventário Zabbix tem lat/lon das agências? | Se não → geomap substituído por tabela paginada no N3-Agências |
| Q2 | Tabela de interfaces no N4: Dynamic Text ou Table nativo? | DT = mais controlo visual; Table nativo = menos código, mais manutenível |
| Q3 | `var-parent` para link de retorno dinâmico no N4? | Alternativa: 4 links fixos por sub-domínio (mais simples, menos elegante) |
| Q4 | PARC tem items `net.if.*` no Zabbix ou só ICMP? | Determina se o card Parceiros mostra interface-level ou só estado geral |
| Q5 | N3-DC existente cobre já SPINEs + LEAFs + OOB? | Se sim, só actualizar; se não, reescrever |
