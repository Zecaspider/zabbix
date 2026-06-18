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
