# Topologia de Rede BPC — Inventário Auditado

> Auditoria directa ao Zabbix Network (`ffo8sp8zllog0e`, via proxy Grafana) em
> **2026-06-18**. Substitui a topologia preliminar do handoff. Fonte de verdade
> do inventário de Rede para os dashboards N2/N3/N4. Complementa
> `rede-arquitectura.md` (o desenho) com **o que existe de facto**.

---

## 1. Contagens confirmadas

| Grupo | Nome | Hosts | Papel |
|---|---|---|---|
| 26 | HG_DC_SWITCHES | **7** | Fabric Spine-Leaf Nexus |
| 27 | HG_DC_ROUTERS | **5** | Routers WAN / edge / voz |
| 28 | HG_EDIFICIOS_ROUTERS | 9 | Routers de edifícios |
| 29 | HG_EDIFICIOS_SWITCHES | 46 | Switches de edifícios |
| 35 | LINKS | **0** | vazio — os links vivem como interfaces nos routers g27 |
| 22 | Switchs Gestão | 1 | gestão out-of-band |

---

## 2. Fabric DC — grupo 26 (Spine-Leaf, 7 switches Nexus)

| hostid | Host | Tier |
|---|---|---|
| 10847 | DC1-SPINE-11 | SPINE |
| 10848 | DC1-SPINE-12 | SPINE |
| 10843 | DC1-LEAF-101 | LEAF |
| 10845 | DC1-LEAF-102 | LEAF |
| 10842 | DC1-LEAF-103 | LEAF |
| 10846 | DC1-LEAF-104 | LEAF |
| 10844 | DC1-LEAF-105 | LEAF |

LEAFs concentram as ligações a: firewalls Checkpoint, storage (Unity 400, IBM Storwize/TS3200), Power (VIOS/P9), Darktrace (port-mirror), CCTV, PowerFlex mgmt, EMIS/ACS.

---

## 2.1 Topologia física verificada — adjacências reais (≥97%)

> Extraída das **descrições de interface** (`net.if.status`) auditadas em
> 2026-06-18. Só inclui ligações comprovadas pelos dados; as marcadas **[2 pontas]**
> têm os dois extremos a confirmar a mesma ligação (confiança >99%). Não há
> inferência por modelo/posição.

**Arquitectura: VXLAN/EVPN Spine-Leaf** (SPINEs com `BGP PEERING`, `NVE/VTEP`,
`ANYCAST RP`, `MULTISITE INTERFACE (VIP VTEP)` → route-reflectors EVPN).

### Underlay Spine↔Leaf — **[2 pontas]** (10 links, full-mesh 2×5)
| | LEAF-101 | LEAF-102 | LEAF-103 | LEAF-104 | LEAF-105 |
|---|---|---|---|---|---|
| **SPINE-11** | ✓ | ✓ | ✓ | ✓ | ✓ |
| **SPINE-12** | ✓ | ✓ | ✓ | ✓ | ✓ |

Spine: `LEAF-10X UNDERLAY`. Leaf: `LINK TO SPINE-11` + `LINK TO SPINE-12`.

### Pares vPC (peer-link + keepalive + backup routing) — **[2 pontas]**
| Par vPC | Membros | Modelo | Estado |
|---|---|---|---|
| Domínio A | LEAF-101 + LEAF-102 | N9K-C93180YC-FX3 | vPC peer-link UP |
| Domínio B | LEAF-103 + LEAF-104 | N9K-C93108TC-FX | vPC peer-link UP |
| (standalone) | LEAF-105 | N9K-C93108TC-FX | sem vPC |

### Routers WAN ↔ fabric
| Router | Modelo | Liga a | Evidência | Conf. |
|---|---|---|---|---|
| DC1-RTE-WAN-AG | C8500L-8S4X | LEAF-101 + LEAF-102 | `To_LEAF1`/`To_LEAF2` ↔ `TO_C8500` | **[2 pontas]** |
| DC1-RTE-WAN-INT | ISR4451 | LEAF-103/104 | `ROUTER DC1-RT-4451-x` | alto |
| DC1-RTE-WAN-EMIS | ISR4451 | LEAF-103/104 (`P2P_CORE`) | `ROUTER DC1-RT-4451-x` | alto |
| DC1-RTE-PARC | ISR4451 | CORE/LEAF-103/104 | `P2P_RTE-WAN-PARC_to_CORE` | alto |
| DC1-RTE-GTW01 | C8200 | CORE (gateway VRFs/parceiros) | `P2P_DC-IMP-FW-PARC0` | médio |

Gateways de voz adicionais vistos no fabric: `DC1-RTE-VGTW02` (LEAF-104),
`RT-VC-GW00` (LEAF-103).

### Blocos de serviço pendurados nos LEAFs (south)
Agrupados por função (descrições de interface; ✓=presente, ⚠=interface(s) down):

| Bloco | LEAFs | Notas |
|---|---|---|
| **Firewall Checkpoint** (farm IN/OUT) | 101,102 (`UPLINK-CHKPOINT-FARM-1/2`); 103,104 (`FW-CHKPT-OUT_*`) | ⚠ DMZ/Internet-Banking down em LEAF-103; `CHKPT-DOWN` em LEAF-104 |
| **VxBlock / Converged** (Nexus 9000/3000) | 101,102,103,104 | ⚠ `To_Nexus3000_VXBLOCK` down (103/104); `To_Nexus9000` down (102) |
| **IBM Power** (P9 VIOS01/02, P7 770/ACS) | 103,104 (P9); 105 (P7) | ⚠ `P7_770`/`MGMT_P7` down (105) |
| **Storage / SAN** (Unity 400, Storwize/V7000/TS3200, DataDomain, Brocade) | 104,105 | Unity 400 UP em 104+105 (multipath) |
| **UC / Voz** (CUCM/CUPS/IPCC/Unity/CUBE, WLC01/02) | 101-105 | ⚠ `WLC02 Data`/`WLC01 RP` down (103/104) |
| **Segurança avançada** (Darktrace port-mirror, Imperva WAF) | 102,103,104,105 | ⚠ Darktrace e-mail mgmt down (104/105); `IMPERVA_BAIXO` down (104) |
| **CCTV / Biometria** | 101,102,105 | — |
| **SWIFT** (`SWIFT-BOX-A`, `HOST_SWIFT`) | 103,104,105 | ⚠ `SWIFT-BOX-A` down (104), `HOST_SWIFT` down (105) |
| **PowerFlex mgmt** | 105 (`DC1-SW_PWFLEX-MGMT`) | — |

> **Observação a verificar:** `VXLAN OVERLAY` aparece **down nos dois SPINEs** —
> dado o fabric estar claramente a encaminhar (tudo a jusante UP), é provável ser
> uma interface de monitorização/loopback secundária, não a overlay de produção.
> Confirmar com a equipa de rede (candidato a Z).

---

## 2.2 Taxonomia de tags — categorização SEM regex (confirmado 2026-06-18)

> **Achado fundamental:** quase todos os hosts de rede já trazem tags ricas no
> Zabbix. Isto torna a categorização **robusta por tag**, não por string de nome.
> Onde houver decisão de agrupamento (cards, tabelas, drill), usar **tags**, não
> heurísticas de nome.

| Tag | Valores reais |
|---|---|
| `tipo` | `switch`, `router` |
| `funcao` | `switch-spine`, `switch-leaf`, `switch-access`, `switch-distrib`, `gateway`, `wan-internet`, `wan-agencias`, `wan-parceiro`, `router-edificio` |
| `local` | `datacenter`, `sede` |
| `dc` | `DC1` |
| `edificio` | `sede`, `mutamba`, `maura-junior`, `arquivo-mulemba`, `morro-bento`, `pelourinho`, `fenix`, `lara`, `transportes` |
| `andar` | `P0`…`P20` (pisos da Sede) |
| `zona` | direcção/departamento (`DAI`, `PMSI`, `DTM`, `DCO`, `GAA`, `DTI`, `DCH`, …) |
| `parceiro` | `EMIS`, `IMPORAFRICA` (nos routers WAN) |
| `modelo` | modelo Cisco exacto por host |

> **Limite real:** as tags são **por host**. Os *links WAN* são sub-interfaces
> (não hosts) → não têm tag. Por isso a categorização de **routers** é por
> `funcao`/`parceiro` (robusto), mas a de **links** continua a depender da
> descrição da interface (ver §2.1 / §4). O card WAN do N2 contorna isto
> categorizando por **hostid do router** (estável) e medindo saúde por IP SLA.

---

## 3. Routers WAN — grupo 27 (5 routers, papéis distintos)

| hostid | Host | Papel | Modelo (handoff) |
|---|---|---|---|
| 10840 | DC1-RTE-GTW01 | Gateway/core + VRFs + parceiros via FW | C8200 |
| 10838 | DC1-RTE-WAN-INT | Internet — peers BGP | ISR4451 |
| 10996 | DC1-RTE-WAN-AG | Hub agências — DMVPN + Azure ExpressRoute | C8500L |
| 10839 | DC1-RTE-WAN-EMIS | Parceiro EMIS | ISR4451 |
| 11001 | DC1-RTE-PARC | Parceiros/Gov + Voz (CUBE/CUCM) | ISR4451 |

---

## 4. Inventário de LINKS WAN (o que o card "WAN" deve reflectir)

Os links **não são hosts** — são sub-interfaces/túneis nos routers. Mapa real:

### 4.1 Internet / BGP — DC1-RTE-WAN-INT
Sinal de saúde: **IP SLA** (`rttMonCtrlAdminSense`=1 OK / `CompletionTime`=RTT ms) + oper-status.

| Link | Interface | BGP | IP SLA | Estado actual |
|---|---|---|---|---|
| ITA | Po2.65 (BGP_PEER_ITA) | ✓ | SLA 65 | ⚠ **IP SLA NOT OK** (sense=4) — if UP mas SLA falha |
| AT | Po2.960 (BGP_PEER_AT) | ✓ | — | UP |
| MSTELCOM | Po2.1576 (BGP_PEER_MSTELCOM) | ✓ | — | UP |
| Public IPs BPC | Po1.963 | — | SLA 2/3/60/62 | UP |

> **BGP-proxy correcto = 3 interfaces** `BGP_PEER_*` (só neste router), todas oper-UP.
> Mas a verdade de serviço é o **IP SLA**: ITA está degradado mesmo com if UP.

### 4.2 Agências (hub DMVPN + Azure) — DC1-RTE-WAN-AG
| Categoria | Links |
|---|---|
| Azure ExpressRoute | Po2.2931 (Link 1), Po2.2932 (Link 2) |
| DMVPN hubs (datacenter) | Tu101 UNITEL · Tu102 ITA · Tu103 IPWORLD · Tu104 MULTITEL · Tu105 MST_FIBRA · Tu106 MST_VSAT · Tu107 MST_MW |
| DMVPN hubs (edifícios) | Tu201-208 (variantes _EDIFICIO dos mesmos providers) |
| MPLS / colectora | Po2.1506 MSTELCOM MPLS (DC ITA) · Po2.341 MST-MW · Po2.904/905 MST-VSAT |
| Uplinks fabric | Te0/1/2 To_LEAF2 · Te0/1/3 To_LEAF1 |
| ⚠ Down | Tu2028 (DOWN) |

### 4.3 EMIS — DC1-RTE-WAN-EMIS
| Link | Interface |
|---|---|
| EMIS via ATELECOM | Po2.110 (SP_EMIS_ATELECOM) |
| EMIS via UNITEL | Po2.1158 (SP_EMIS_UNITEL) |
| EMIS via MSTELECOM | Po2.835 (SP_EMIS_MSTELECOM) |

### 4.4 Parceiros / Governo + Voz — DC1-RTE-PARC
Service-provider sub-interfaces (Po2.x): UNITEL (SMS/USSD/MONEY/SIP), AT→BNA, AT→MINFIN,
MULTITEL→BNA, UNITEL→BNA, CONNECTIS→MJDH, CONNECTIS→UCALL, Min_Just, Mundial Seguros,
Multitel→MinFin. **Também é gateway de Voz (CUBE/CUCM)**: portas FXS (status=4 = idle,
normal), VoiceEncapPeer, VoiceOverIpPeer (PSTN/BNA).

### 4.5 Gateway/Core — DC1-RTE-GTW01
MINFIN via Kwanza Connect MST (Gi0/0/1.1571, Tu20) · MINFIN via UNITEL (Gi0/0/1.452, Tu30) ·
INSS via MULTITEL (Gi0/0/1.442, Tu603) · BODIVA via MST (Gi0/0/1.802) · P2P para FW Checkpoint
parceiros (Gi0/0/0.896). ⚠ **Po1 DOWN**.

### 4.6 IP SLA — probes Cisco no DC1-RTE-WAN-INT (auditado 2026-06-18)

5 probes `rttMon` (cada um com `sense`/`completion time`/`threshold`/`timeout`/`frequency`).
`sense=1` OK; `≠1` = falha. **É a verdade de serviço do edge de internet.**

| Probe | Sense | RTT (ms) | Threshold | Freq | Estado |
|---|---|---|---|---|---|
| IP SLA 2  | 1 | 3 | 40 ms   | 30 s | OK |
| IP SLA 3  | 1 | 1 | 40 ms   | 30 s | OK |
| IP SLA 60 | 1 | 1 | 5000 ms | 60 s | OK |
| IP SLA 62 | 1 | 3 | 5000 ms | 60 s | OK |
| **IP SLA 65** | **4** | 0 | 5000 ms | 60 s | ⚠ **FAIL (ITA)** → Z.13 |

> **Gap:** os probes têm só IDs numéricos, sem nome descritivo do destino. O
> mapeamento 65→ITA vem da correlação com a trigger `IP SLA 65 ... is not OK` e a
> interface `BGP_PEER_ITA`. Probes 2/3 (threshold 40 ms) são prováveis testes de
> latência fina; 60/62/65 (threshold 5000 ms) testes de alcançabilidade. Pedir à
> equipa de rede para nomear os probes no Zabbix (inventory/description).

> **Actualização Z.13 (2026-07-01):** `history.get` sobre `rttMonCtrlAdminCompletionTime[65]`
> mostra 0 em todos os 43.836 pontos dos últimos 31 dias (nunca uma resposta), e a trigger é
> um único evento aberto e ininterrupto desde 2025-11-21 (~7 meses, sem flap) — enquanto
> Po2.65 tem tráfego real (~23 Mbps). Isto é assinatura de sonda com alvo morto/inatingível
> no router, não de indisponibilidade real do link Internet. Rebaixado para P2 no
> `cronograma.md` — não tratar como incidente de serviço activo sem a equipa de redes
> validar o destino configurado da sonda 65.

---

## 5. Chaves de items confirmadas (corrige catálogo §4 da arquitectura)

| Métrica | Chave real Zabbix | Nota |
|---|---|---|
| CPU | `system.cpu.util[N]` | indexado por processador |
| RAM % | `vm.memory.util[N.1]` | **usar esta** (já é %); evitar `vm.memory.free/used` (bytes) |
| Temp | `sensor.temp.value[ID]` + `sensor.temp.status[ID]` | múltiplos sensores/host (módulos, transceivers) |
| Uptime | `system.uptime` | segundos |
| Interface estado | `net.if.status[ifOperStatus.N]` | 1=UP, 2=DOWN |
| Interface tráfego | `net.if.in[ifHCInOctets.N]` / `net.if.out[ifHCOutOctets.N]` | bits |
| Interface erros | `net.if.in.errors` / `out.errors` / `*.discards` | count |
| Interface speed | `net.if.speed[ifHighSpeed.N]` | para % utilização |
| **IP SLA saúde** | `rttMonCtrlAdminSense[N]` | **1=OK**; ≠1 = problema (link de serviço degradado) |
| **IP SLA RTT** | `rttMonCtrlAdminCompletionTime[N]` | ms |
| BGP (proxy) | `net.if.status` de interfaces nomeadas `BGP_PEER_*` | só no WAN-INT (3) |

---

## 6. Estado real no momento da auditoria (2026-06-18)

**61 triggers activos** em 26+27. Destaques:

| Sev | Host | Problema |
|---|---|---|
| P4 | LEAF-103/104/105 | Temperatura **acima do crítico** (módulo Homewood) |
| P4 | WAN-INT | **IP SLA 65 (ITA) NOT OK** |
| P3 | LEAF-101 | PSU-1 Fan down + PSU off |
| P3 | LEAF-101/102 | Memória alta (SPINE-11 ~90%) |
| P3 | GTW01 | Po1 link down |
| P2 | SPINE-11, LEAFs | Temperatura acima de aviso |
| P1 | vários LEAF | "Ethernet changed to lower speed" (~baseline/ruído; rever Z) |

> Os P1 "lower speed" são numerosos e provavelmente ruído de baseline — candidatos
> a revisão no lado Zabbix (não tratar como incidente).

---

## 7. Implicações para os dashboards

1. **Card WAN (N2)**: deve contar **links/providers** (interfaces de serviço), não 5 routers.
   Saúde por IP SLA onde existe, oper-status caso contrário.
2. **KPI BGP-proxy (N2)**: só `net.if.status` de `BGP_PEER_*` (3, WAN-INT). Sense IP SLA
   complementa (ITA degradado).
3. **N3-WAN (4.6)**: vista por provider/link — RTT (IP SLA), estado, tráfego, erros por
   sub-interface. Agrupar por router e por categoria (Internet/Agências/EMIS/Parceiros).
4. **N3-DC / N4 (tabela fabric)**: RAM via `vm.memory.util`, temp via `sensor.temp.value`
   (worst sensor), triggers de PSU/fan/temp são de primeira ordem.

---

## 8. Edifícios — grupos 28 (9 routers) + 29 (46 switches)

**Chaves de items DIFEREM do DC** (auditado 2026-06-18):

| Métrica | DC (Nexus/IOS) | Edifícios (g28/g29) |
|---|---|---|
| CPU | `system.cpu.util[N]` | `system.cpu.util` (sem índice) |
| RAM % | `vm.memory.util[N.1]` | `vm.memory.util` (sem índice) |
| Uptime | `system.uptime` | **`system.net.uptime`** (≠) |
| Temp | `sensor.temp.value[ID]` | `sensor.temp.value` (switches g29); **routers g28 sem temp** |
| ICMP | `icmpping` / `icmppingsec` / `icmppingloss` | idem |

> Os adapters dos painéis de rede têm de tolerar ambas as formas (com e sem
> índice) e os dois keys de uptime. Pesquisa por substring (`system.cpu.util`,
> `vm.memory.util`) apanha as duas; uptime precisa de tentar os dois keys.

### 8.1 Routers de edifício — grupo 28 (9, 1 por edifício)

Tag `edificio` + `funcao=router-edificio`. Inventário real:

| Host | Edifício | Modelo |
|---|---|---|
| RTE-DRL-EDF-SEDE | sede | C8200-1N-4T |
| RTE-DRL-DSI-MUTA | mutamba | ISR4331/K9 |
| RTE-DRL-MAUR-JUN | maura-junior | ISR4331/K9 |
| RTLARA00 | lara | ISR4331/K9 |
| RTE-DRL-FENIX | fenix | C1111-4P |
| RTE-DRL-ARQU-MULE | arquivo-mulemba | CISCO2811 |
| RTE-DRL-DPS-MBEN | morro-bento | CISCO2811 |
| RTE-DRL-DPS-PELOU | pelourinho | CISCO2811 |
| RTE-DRL-DPS-TRANS | transportes | CISCO2811 |

> Drift de hardware: 4× CISCO2811 (fim de vida) vs C8200/ISR4331/C1111 modernos —
> sinalizar nos painéis (badge de modelo legado).

### 8.2 Switches de acesso da Sede — grupo 29 (46, por piso/zona)

Todos `funcao=switch-access` (Cisco Catalyst 9200L) **excepto** `SWD-EDS-P4-00`
(`funcao=switch-distrib`, sem modelo no inventário). Distribuídos P0→P20, tags
`andar` + `zona`. Nome = `SWA-EDS-‹andar›-‹zona›-‹nn›`. Zonas = direcções:

| Piso | Zonas (departamentos) | Switches |
|---|---|---|
| P0–P3, P6 | comum | acesso geral |
| P4 | DTI (×2) + comum (distrib SWD) | DTI = Tecnologias de Informação |
| P5 | DGC, PMSI | PMSI = Programa Modernização |
| P7 | DEM, DIP | |
| P8 | DCO, DPC | |
| P9 | DCC, DTM | |
| P10 | DOP (×2) | |
| P11 | DEC, DMI | |
| P12 | DCP, DGR | |
| P13 | DCH (×2) | |
| P14 | DAI, DJC | |
| P15 | DSE (×2), GAI | |
| P16 | DOQ, GAA (×2) | |
| P17 | GAA (×3) | |
| P18 | ACF (×3) | |
| P19 | PC (×3) | |
| P20 | A (×2) | |

Modelos: maioria `C9200L-48P-4G` (48 portas PoE), alguns `C9200L-24P-4G` (24 portas).

> Para o N3-Edifícios: dropdown por `andar` (tag), agrupar por `zona`. O
> `switch-distrib` (SWD-EDS-P4-00) é o ponto de agregação da Sede — destacar.

## 9. Breakdown de alertas activos (explica o KPI "Alertas")

Contagem por grupo no momento da auditoria:

| Grupo | Total | P4 | P3 | P2 | P1 |
|---|---|---|---|---|---|
| 26 DC switches | 59 | 3 | 4 | 5 | 47 |
| 27 DC routers | 2 | 1 | 1 | 0 | 0 |
| 28 Edif. routers | 15 | 0 | 12 | 1 | 2 |
| 29 Edif. switches | **382** | 0 | **220** | 5 | 157 |

**Dominante: 220× "Cisco IOS: Link down" (P3) nos switches de edifícios.** São
portas de acesso sem nada ligado — **ruído**, não incidentes. Inflacionam o KPI
"Alertas activos" (~249 aviso). Também há ~157 P1 "Ethernet changed to lower
speed" e, no DC, 47 P1 do mesmo tipo — igualmente ruído de baseline.

→ **Acção Zabbix (Z):** baixar severidade / suprimir "Link down" em portas de
acesso desligadas e rever os "lower speed"/"half-duplex". Até lá, considerar no
dashboard separar "portas down (acesso)" da contagem de alertas operacionais,
para o número NOC não ser dominado por ruído.

---

## 10. Gaps de monitorização (o que o Zabbix NÃO recolhe)

Limitações reais a documentar e propor à equipa de rede — condicionam o que os
dashboards podem honestamente mostrar (nunca fingir estado que não existe):

| Gap | Impacto | Acção recomendada |
|---|---|---|
| **BGP session state** (`bgpPeerState` MIB) | Não sabemos se BGP está Idle/Active sem o link descer; usamos proxy por interface `BGP_PEER_*` | Adicionar template Cisco BGP SNMP |
| **DMVPN tunnel state** | Proxy via oper-status do túnel `Tu1xx` é impreciso | Template DMVPN SNMP / Cisco EEM |
| **EVPN/VXLAN fabric state** | Só vemos o underlay; não sabemos se o overlay está funcional (ver obs. §2.1 `VXLAN OVERLAY` down nos spines) | Template NX-OS EVPN via SNMP |
| **BGP prefix count** | Não detectamos route flap / leak | Incluir no template BGP |
| **Nomes de IP SLA probes** | Probes 2/3/60/62/65 sem label de destino (ver §4.6) | Inventory/description por probe |
| **`system.location` vazio (Nexus)** | Sem contexto físico de rack/sala | Preencher snmp location |

> Estes gaps são honestos e devem aparecer como nota nos painéis ("estado por
> proxy — BGP MIB não monitorizado"), não escondidos.

---

## 11. Procedência

Tudo nesta página foi extraído por **auditoria directa ao Zabbix Network**
(`ffo8sp8zllog0e`) via proxy do datasource Grafana, em 2026-06-18 — `host.get`
(+tags +inventory), `item.get` (net.if.status, rttMon*, icmp*), descrições de
interface. Sem inferência por modelo/posição. Adjacências `[2 pontas]` (§2.1)
confirmadas pelos dois extremos. Diagrama ASCII do fabric: ver §12.

---

## 12. Metodologia de engenharia reversa da topologia

> Reproduzível em sessões futuras para re-auditar ou estender a outros domínios.
> A sequência foi executada via Bash + Python contra o endpoint
> `POST /api/datasources/uid/{DS_UID}/resources/zabbix-api` do Grafana.

### 12.1 Autenticação

O datasource `BPC-NETWORK` usa `authType: token` (token API Zabbix armazenado de
forma segura no Grafana). Ao chamar via proxy Grafana, **não se passa auth no
body** — o Grafana injeta o token Zabbix automaticamente. Só é preciso o Bearer
token de serviço do Grafana no header HTTP:

```
POST http://10.10.126.22:3000/api/datasources/uid/ffo8sp8zllog0e/resources/zabbix-api
Authorization: Bearer <grafana-service-token>
Content-Type: application/json

{"method": "host.get", "params": {...}}
```

> **Nota:** chamadas com `auth` no body falham (`Not authorized`) porque o Grafana
> já faz a autenticação internamente. `user.login` via este proxy devolve um token
> de sessão de curta duração que igualmente é rejeitado como campo `auth` — não usar.

### 12.2 Passo 1 — inventário de hosts

```json
{
  "method": "host.get",
  "params": {
    "groupids": ["26", "27"],
    "output": ["hostid", "host", "name"],
    "selectTags": "extend"
  }
}
```

Resultado: 12 hosts com tags (`funcao`, `modelo`, `local`, `dc`, etc.).
Os hostids são estáveis (usados nos dashboards como chaves, não os nomes).

**O que se lê das tags:**
- `funcao` distingue spine / leaf / gateway / wan-internet / wan-agencias / wan-parceiro
- `modelo` confirma hardware (N9K-C9332C, ISR4451, C8500L, C8200, …)
- Permite **categorizar por tag** em vez de regex sobre nomes — muito mais robusto

### 12.3 Passo 2 — todas as interfaces de todos os hosts DC

```json
{
  "method": "item.get",
  "params": {
    "hostids": ["10842","10843","10844","10845","10846",
                "10847","10848","10838","10839","10840","10996","11001"],
    "search": {"key_": "net.if.status"},
    "output": ["hostid", "name", "key_", "lastvalue"]
  }
}
```

`key_: net.if.status` devolve um item por interface física/lógica monitorizada,
com `name` = "Interface \<nome\>(\<descrição\>): Operational status" e
`lastvalue` = 1 (UP) / 2 (DOWN) / outro.

**O que se lê das descrições:**

| Padrão na descrição | Conclusão |
|---|---|
| `LEAF-101 UNDERLAY` (em SPINE) | link físico SPINE→LEAF-101 confirmado do lado SPINE |
| `LINK TO SPINE-11` (em LEAF) | confirma o mesmo link do lado LEAF → adjacência **[2 pontas]** |
| `VPC PEER-LINK` (em LEAF-101 e LEAF-102) | os dois fazem parte do mesmo domínio vPC |
| `VPC KEEPALIVE` | keepalive vPC separado do peer-link |
| `To_LEAF1` / `To_LEAF2` (em WAN-AG) + `TO_C8500` (em LEAF-101/102) | WAN-AG liga a vPC-A |
| `ROUTER DC1-RT-4451-1/2/3` (em LEAF-103 + LEAF-104) | os 3 ISR4451 ligam ao vPC-B |
| `P2P to DC-ITA-SWA-SP` (em WAN-INT/EMIS/PARC Po2) | todos os ISR4451 têm um Po2 ao mesmo switch externo ITA |
| `BGP_PEER_ITA/AT/MSTELCOM` (em WAN-INT Po2.x) | são sub-interfaces BGP, não hosts Zabbix |
| `DMVPN_HUB_*` / `DMVPN_HUB_*_EDIFICIO` (em WAN-AG Tu1xx/Tu2xx) | dois conjuntos de túneis (DC e edifícios) para os mesmos 7 providers |
| `VoiceOverIpPeer` / `EFXS` (em PARC) | confirma que PARC é também CUBE de voz |
| `Po1: DOWN` (em GTW01) | link do gateway de governo ao fabric está abaixo |

### 12.4 Passo 3 — verificação cruzada (confirmação [2 pontas])

Para cada adjacência candidata, verificou-se que a descrição existe nos **dois
extremos**:

| Link | Lado A | Lado B | Conf. |
|---|---|---|---|
| SPINE-11 ↔ LEAF-101 | `Ethernet1/25(LEAF-101 UNDERLAY)` | `Ethernet1/49(LINK TO SPINE-11)` | ✓ |
| SPINE-11 ↔ LEAF-102 | `Ethernet1/26(LEAF-102 UNDERLAY)` | `Ethernet1/49(LINK TO SPINE-11)` | ✓ |
| … (idem para LEAF-103/104/105 em ambos os spines) | … | … | ✓ |
| WAN-AG ↔ LEAF-101 | `Te0/1/3(To_LEAF1)` | `Ethernet1/1(TO_C8500)` | ✓ |
| WAN-AG ↔ LEAF-102 | `Te0/1/2(To_LEAF2)` | `Ethernet1/1(TO_C8500)` | ✓ |
| vPC peer-link LEAF-101+102 | `Ethernet1/51+52(VPC PEER-LINK)` | idem LEAF-102 | ✓ |
| vPC peer-link LEAF-103+104 | `Ethernet1/51+52(VPC PEER-LINK)` | idem LEAF-104 | ✓ |
| LEAF-103 ↔ ISR4451-1 | `Ethernet1/1(ROUTER DC1-RT-4451-1)` | `Po11(ROUTER DC1-RT-4451-1)` em LEAF-104 | ✓ (mesmo PC) |

### 12.5 Incertezas residuais (< 3%)

| Elemento | Incerteza | Razão |
|---|---|---|
| `SPINE-11 Ethernet1/33` (UP, sem descrição) | Destino desconhecido | Só visível de um lado; nenhum outro host monitorizado tem descrição correspondente |
| `P2P_RT_7200` (LEAF-101 E1/23+24) | Cisco 7200 não está em nenhum grupo Zabbix monitorizado | Dispositivo presente no fabric mas fora do inventário |
| Mapeamento exacto ISR4451-1/2/3 → WAN-INT/EMIS/PARC | Sabemos que os 3 ISR4451 ligam ao vPC-B mas as port-channels 11/12/13 não identificam qual router é qual | Seriam necessárias as IPs das sub-interfaces ou `system.name` por porta |
| SPINE-11 sem link directo ao SPINE-12 visível | Nenhuma interface com descrição `SPINE-12` no SPINE-11 e vice-versa | Pode existir mas sem descrição — ou realmente não há inter-spine directo (normal em Spine-Leaf puro) |

### 12.6 Diagrama ASCII resultante

```
  ┌────────────────────────────────────────────────────────────────────┐
  │  DC-ITA-SWA-SP  (switch externo — handoff operadoras)             │
  └──────────┬──────────────┬──────────────┬───────────────────────────┘
             │ Po2          │ Po2          │ Po2
      ┌──────┴──────┐ ┌─────┴──────┐ ┌────┴──────────────┐
      │  WAN-INT    │ │ WAN-EMIS   │ │      PARC          │
      │  ISR4451    │ │ ISR4451    │ │  ISR4451 + CUBE    │
      │ Internet    │ │    EMIS    │ │  Gov+Parc+VoIP     │
      └──────┬──────┘ └─────┬──────┘ └────┬───────────────┘
             │ Po1          │ Po1          │ Po1 (Po11/12/13 per LEAF)
             └──────────────┴──────────────┘
                                    │
            vPC-B ══════════════════╪════════════════════════════
            ┌───────────────────────┴────────────────────────────┐
            │     LEAF-103 ═════════════════════ LEAF-104        │
            │  N9K-93108TC-FX            N9K-93108TC-FX          │
            └───────────────────────┬────────────────────────────┘
                                    │ (E1/49+50 per LEAF)
        ┌───────────────────────────┼───────────────────────────────┐
        │  SPINE-11  N9K-C9332C    │        SPINE-12  N9K-C9332C   │
        │  route-reflector EVPN    │        route-reflector EVPN   │
        │  nve1(VXLAN OVERLAY)⚠   │        nve1(VXLAN OVERLAY)⚠  │
        └───────────────────────────┼───────────────────────────────┘
                                    │
            vPC-A ══════════════════╪════════════════════════════
            ┌───────────────────────┴────────────────────────────┐
            │     LEAF-101 ═════════════════════ LEAF-102        │
            │  N9K-93180YC-FX3           N9K-93180YC-FX3        │
            └───────────────────────┬────────────────────────────┘
                                    │ (Te0/1/3→LEAF-101 · Te0/1/2→LEAF-102)
                              ┌─────┴──────┐
                              │  WAN-AG    │
                              │  C8500L    │
                              │ DMVPN hub  │
                              │ Azure ER×2 │
                              └────────────┘
            ┌───────────────────────────────────────────────────────┐
            │     LEAF-105  (standalone, N9K-93108TC-FX)            │
            │     IBM Power/Storage/SAN · DataDomain · PowerFlex   │
            └───────────────────────────────────────────────────────┘
```

> `═══` = vPC peer-link · `│` = uplink físico Ethernet confirmado
> Serviços "south" (firewalls, storage, compute, voz, CCTV, SWIFT) omitidos
> para clareza — detalhe em §2.1 (blocos de serviço por LEAF).

---

## 13. Re-validação 2026-06-19 + diagrama SVG

> 2ª varredura completa (mesma metodologia §12) confirmou **integralmente** a
> topologia §2.1/§12.6. Diagrama visual legível gravado em
> [`topologia-dc.svg`](topologia-dc.svg) (caixas = hosts Zabbix com hostid;
> pílulas tracejadas = links que vivem em interfaces, não são hosts).

### 13.1 Tradução clássico → spine-leaf (para leitura do diagrama)

| Mundo clássico (3 camadas) | Equivalente spine-leaf (este DC) |
|---|---|
| Switch **core** | **SPINE** (`DC1-SPINE-11/12`, N9K-C9332C) — backbone |
| **Distribuição + acesso** (fundidas) | **LEAF** (`DC1-LEAF-101…105`) — onde routers/servidores/FW ligam |
| Uplink **trunk** acesso→core | **underlay**: cada LEAF tem 1 uplink a **cada** spine (full-mesh, sem STP a bloquear) |
| **EtherChannel / port-channel** | **Po** (`Po1`, `Po2`, `Po11/12/13`) — idêntico |
| **StackWise / VSS** | **vPC** — 2 switches como 1; cabo entre eles = `VPC PEER-LINK` |
| VLANs estendidas | **VXLAN/EVPN overlay** (`nve1`) — VLANs em túnel sobre o fabric |

### 13.2 Refinamentos novos (não estavam em §2.1/§12)

| Achado | Evidência (net.if.status) | Implicação |
|---|---|---|
| **2º uplink ITA `DC-ITA-SW-PFX`** | LEAF-101 `Po200(To DC-ITA-SW-PFX)` UP; LEAF-102 `E1/40(...PFX01)`+`E1/41(...PFX00)` UP | switch ITA distinto do `DC-ITA-SWA-SP`; LEAF-101/102 têm saída ITA directa além da via routers |
| **GWs de voz no vPC-B** | LEAF-103 `E1/4(ROUTER RT-VC-GW00)`; LEAF-104 `E1/4(DC1-RTE-VGTW02)` | gateways de voz pendurados no vPC-B (não são os 5 routers WAN) |
| **IMPORAFRICA DR link DOWN** | LEAF-101/102 `Po10`+`E1/47(LINK TO DC IMPORAFRICA)` DOWN | link ao DC de DR (Importáfrica) está abaixo |
| `nve1 (VXLAN OVERLAY)` DOWN nos 2 spines | confirmado de novo (UP em todos os LEAFs) | gap overlay persiste — candidato a Z (ver §2.1 obs.) |
| `SPINE-11 E1/33` UP sem descrição | só de um lado; SPINE-12 não tem | incerteza residual mantida (§12.5) |

> Os routers WAN ligam ao fabric pela **`Po1`** (lado router) → `Po11/12/13`
> (lado LEAF-103/104) para os 3 ISR4451; o WAN-AG por `Te0/1/2-3` → `E1/1
> (TO_C8500)` em LEAF-101/102. A **`Po2`** de cada ISR4451 é o handoff externo
> para `DC-ITA-SWA-SP` (operadoras), não uma ligação ao fabric.
