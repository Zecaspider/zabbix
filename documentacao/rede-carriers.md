# Carriers WAN — Mapa de Circuitos por Operadora

> Extraído da auditoria `rede-topologia.md` (2026-06-18).
> Fonte de verdade para o painel `l3-wan-carriers.js`.
>
> **Insight principal:** um carrier como UNITEL tem circuitos em 3 ou 4 routers
> diferentes para propósitos distintos. A vista por carrier mostra a presença
> total de cada operadora na rede BPC — algo invisível na vista por dispositivo.

---

## Carriers identificados (≤ 7 ISPs reais)

| Carrier | Variantes no Zabbix |
|---|---|
| **UNITEL** | `UNITEL`, `SP_EMIS_UNITEL` |
| **AT / Angola Telecom** | `AT`, `ATELECOM`, `SP_EMIS_ATELECOM`, `BGP_PEER_AT` |
| **ITA** | `ITA`, `BGP_PEER_ITA`, `SP_EMIS_ITA` (se existir) |
| **MST / Mstelecom** | `MST`, `MSTELECOM`, `MST_FIBRA`, `MST_VSAT`, `MST_MW`, `SP_EMIS_MSTELECOM`, `BGP_PEER_MSTELCOM` |
| **MULTITEL** | `MULTITEL` |
| **IPWORLD** | `IPWORLD` |
| **CONNECTIS** | `CONNECTIS` |
| **Azure** | `Po2.2931`, `Po2.2932` (ExpressRoute — carrier Microsoft) |

> Regra de detecção: substring case-insensitive nas descrições de interface.
> Kwanza Connect = reseller/alias MST (tratar como MST).

---

## Mapa completo: carrier × router × propósito

### UNITEL

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-AG (10996) | Tu101 | DMVPN hub agências (DC) | UP |
| WAN-AG (10996) | Tu201 | DMVPN hub agências (edifícios) | UP |
| WAN-EMIS (10839) | Po2.1158 | Circuito EMIS | UP |
| WAN-PARC (11001) | Po2.x | SIP / SMS / USSD / MONEY | UP |
| WAN-PARC (11001) | Po2.x | BNA via UNITEL | UP |
| GTW01 (10840) | Gi0/0/1.452 + Tu30 | MINFIN via UNITEL | UP |

> **6 circuitos em 4 routers** — carrier mais presente na rede BPC.

---

### AT / Angola Telecom / ATELECOM

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-INT (10838) | Po2.960 | Internet BGP (BGP_PEER_AT) | UP |
| WAN-EMIS (10839) | Po2.110 | Circuito EMIS (SP_EMIS_ATELECOM) | UP |
| WAN-PARC (11001) | Po2.x | BNA via AT | UP |
| WAN-PARC (11001) | Po2.x | MINFIN via AT | UP |

> **4 circuitos em 3 routers.**

---

### ITA

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-INT (10838) | Po2.65 (BGP_PEER_ITA) | Internet BGP | UP (mas **IP SLA 65 FAIL** — Z.13) |
| WAN-AG (10996) | Tu102 | DMVPN hub agências (DC) | UP |
| WAN-AG (10996) | Tu202 | DMVPN hub agências (edifícios) | UP |

> **3 circuitos em 2 routers.** ⚠ Incidente activo no circuito de Internet.

---

### MST / Mstelecom (inclui Kwanza Connect)

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-INT (10838) | Po2.1576 (BGP_PEER_MSTELCOM) | Internet BGP | UP |
| WAN-AG (10996) | Tu105 | DMVPN hub MST Fibra (DC) | UP |
| WAN-AG (10996) | Tu106 | DMVPN hub MST VSAT (DC) | UP |
| WAN-AG (10996) | Tu107 | DMVPN hub MST MW (DC) | UP |
| WAN-AG (10996) | Tu205-207 | DMVPN hub MST ×3 (edifícios) | UP |
| WAN-AG (10996) | Po2.341 | MST-MW P2P | UP |
| WAN-AG (10996) | Po2.904/905 | MST-VSAT | UP |
| WAN-EMIS (10839) | Po2.835 | Circuito EMIS (SP_EMIS_MSTELECOM) | UP |
| GTW01 (10840) | Gi0/0/1.1571 + Tu20 | MINFIN via Kwanza/MST | UP |
| GTW01 (10840) | Gi0/0/1.802 | BODIVA via MST | UP |

> **10+ circuitos em 4 routers** — carrier com mais circuitos activos (diversidade de tecnologia: fibra + VSAT + MW).

---

### MULTITEL

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-AG (10996) | Tu104 | DMVPN hub agências (DC) | UP |
| WAN-AG (10996) | Tu204 | DMVPN hub agências (edifícios) | UP |
| WAN-PARC (11001) | Po2.x | BNA via MULTITEL | UP |
| WAN-PARC (11001) | Po2.x | MinFin via MULTITEL | UP |
| GTW01 (10840) | Gi0/0/1.442 + Tu603 | INSS via MULTITEL | UP |

> **5 circuitos em 3 routers.**

---

### IPWORLD

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-AG (10996) | Tu103 | DMVPN hub agências (DC) | UP |
| WAN-AG (10996) | Tu203 | DMVPN hub agências (edifícios) | UP |

> **2 circuitos, 1 router** — apenas agências DMVPN.

---

### CONNECTIS

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-PARC (11001) | Po2.x | MJDH via CONNECTIS | UP |
| WAN-PARC (11001) | Po2.x | UCALL via CONNECTIS | UP |

> **2 circuitos, 1 router.** Nota: CONNECTIS é carrier mas MJDH/UCALL são os destinos.

---

### Azure (Microsoft ExpressRoute)

| Router | Interface | Propósito | Status auditado |
|---|---|---|---|
| WAN-AG (10996) | Po2.2931 | ExpressRoute link 1 | UP |
| WAN-AG (10996) | Po2.2932 | ExpressRoute link 2 | UP |

> **2 circuitos redundantes, 1 router** — ligação dedicada à cloud Azure.

---

## Matriz resumo (carriers × routers)

| Carrier | WAN-INT | WAN-AG | WAN-EMIS | WAN-PARC | GTW01 | Total |
|---|---|---|---|---|---|---|
| UNITEL | — | 2 (DMVPN) | 1 (EMIS) | 2 (BNA/SIP) | 1 (MINFIN) | **6** |
| AT/ATELECOM | 1 (BGP) | — | 1 (EMIS) | 2 (BNA/MINFIN) | — | **4** |
| ITA | 1 (BGP ⚠) | 2 (DMVPN) | — | — | — | **3** |
| MST/Mstelecom | 1 (BGP) | 7+ (DMVPN+P2P) | 1 (EMIS) | — | 2 (MINFIN/BODIVA) | **11+** |
| MULTITEL | — | 2 (DMVPN) | — | 2 (BNA/MinFin) | 1 (INSS) | **5** |
| IPWORLD | — | 2 (DMVPN) | — | — | — | **2** |
| CONNECTIS | — | — | — | 2 (MJDH/UCALL) | — | **2** |
| Azure | — | 2 (ER) | — | — | — | **2** |

---

## Destinos / Parceiros (não são carriers)

Aparecem nas descrições como destino do circuito, não como transportador:

| Destino | Tipo | Via carrier(s) |
|---|---|---|
| BNA | Banco Nacional de Angola | AT, MULTITEL, UNITEL |
| MINFIN | Ministério das Finanças | AT, MULTITEL, MST, UNITEL |
| INSS | Instituto Nacional de Seg. Social | MULTITEL |
| BODIVA | Bolsa de Dívida e Valores | MST |
| MJDH | Min. da Justiça e Direitos Humanos | CONNECTIS |
| EMIS | Sistema interbancário | AT, UNITEL, MST |
| UCALL | Call center | CONNECTIS |
| Agências BPC | 220 agências | UNITEL, ITA, MULTITEL, IPWORLD, MST ×3, Azure |

---

## Gaps de dados para o painel

| Gap | Impacto |
|---|---|
| Sub-interfaces de PARC sem descrição exacta auditada | Alguns links de parceiros podem não ser encontrados pelo regex — aparecem como "não identificado" |
| IP SLA só no WAN-INT (5 probes) | RTT real só disponível para circuitos de internet; DMVPN/EMIS/Parceiros: só oper-status |
| DMVPN tunnel state por proxy | oper-status UP ≠ DMVPN funcional; sem template DMVPN SNMP |
| Nomes dos probes IP SLA sem label | Mapeamento 65→ITA por correlação manual; pedir à equipa de redes para nomear os probes |
