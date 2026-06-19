# Mapa de Host Groups Zabbix → Domínios (v5)

> Inventário sondado via API Grafana em 2026-06-16. 74 host groups (datasource
> **Infra**), estrutura **facetada**: cada host pertence a vários grupos em
> eixos distintos (AMBIENTE, INFRAESTRUTURA, CAMADA, SERVICO, TECNOLOGIA,
> LOCALIZACAO). Os dashboards N2 ancoram no eixo INFRAESTRUTURA/CAMADA.

## Dois Zabbix → dois datasources

O mesmo Grafana (`http://10.10.126.22:3000`) liga a **dois** Zabbix via
datasources distintos. Cada domínio aponta para o seu:

| Zabbix | Servidor (API directa) | Datasource Grafana | Domínios | Inventário |
|---|---|---|---|---|
| **Infra** | `http://10.10.126.22/zabbix/api_jsonrpc.php` (v7.4.8) | `3_KgG43nz` | físicos, virtuais, armazenamento, segurança, bases-dados, apis, serviços-negócio | ☑ tabela abaixo |
| **Network** | `http://10.10.233.140/zabbix/api_jsonrpc.php` | `ffo8sp8zllog0e` ("BPC-NETWORK") | **rede**, **agências** | ☑ sondado (tabela network abaixo) |

Datasources Grafana confirmados (`GET /api/datasources`, 2026-06-16):
`3_KgG43nz` = "BPC - INFRA", `ffo8sp8zllog0e` = "BPC-NETWORK" (ambos
`alexanderzobnin-zabbix-datasource`). Há ainda datasources MySQL directos
(`afor1g5862fb4c` infra, `cfo3cgypdrdvkf` network) — acesso à BD do próprio
Zabbix, não usar nos cards (usar sempre o datasource Zabbix).

## Domínio → groupId (com nº de hosts)

| Domínio (N2) | groupId | Grupo Zabbix | Hosts |
|---|---|---|---|
| **Infraestrutura VMware** — N2 vCenters+ESXi | `608` | BPC / INFRAESTRUTURA / HYPERVISORES | 24 ESXi |
| └ N3-ESXi (tabela hosts) | `603` | BPC / INFRAESTRUTURA / SERVIDORES FISICOS | 27 (**6 físicos + 20 ESXi + 1 Dell**) |
| **Servidores Virtuais** — N2 saúde VMs | `609` | BPC / INFRAESTRUTURA / SERVIDORES VIRTUAIS | 453 |
| └ filtro padrão N2 | tag `ambiente` | `"Produção"` \| `"producao"` | ~306 prod |
| Armazenamento — Storage | `602` | BPC / INFRAESTRUTURA / STORAGE | 10 |
| └ Tape Library | `605` | BPC / INFRAESTRUTURA / TAPE LIBRARY | 1 |
| Segurança | `656` | BPC / INFRAESTRUTURA / DISPOSITIVOS DE SEGURANCA | 8 |
| Bases de Dados | `355` | BPC/CAMADA/Bases de Dados | 27 |
| APIs & Serviços — Sintéticos | `663` | BPC / APLICACOES / SINTETICOS | 39 |
| └ Camada Aplicacional | `345` | BPC/CAMADA/Camada Aplicacional | 88 |
| Serviços de Negócio — eBankit | `391` | BPC/SERVICO/Ebankit | 17 |

Eixo SERVICO/* tem ~55 serviços de negócio (ACM, SWIFT, Essence, ToBe…) —
usados para a vista de Serviços de Negócio, não para os N2 de infraestrutura.

## Inventário Network (Zabbix `10.10.233.140`) → domínio 04 · Rede

> **Decisão de design 2026-06-19:** Agências passa a sub-domínio de **Rede**
> (domínio 04), não domínio independente. Edifícios e Agências são ambos
> extensões físicas da rede BPC com a mesma natureza (routers + switches de
> acesso); separá-los era uma decisão errada. O domínio 04 · Rede cobre agora
> toda a camada de conectividade: DC · WAN · Edifícios · Agências.

Sondado 2026-06-16 + re-validado 2026-06-19 via API Grafana proxy. 15 grupos totais.

### Tabela completa de grupos Network

| groupId | Grupo Zabbix | Hosts | Sub-domínio Rede | Papel |
|---|---|---|---|---|
| `27` | HG_DC_ROUTERS | 5 | **WAN** | 5 routers de borda WAN do DC (ISR4451 + C8500L + GTW01) |
| `26` | HG_DC_SWITCHES | 7 | **DC Fabric** | 2 SPINEs + 4 LEAFs + 1 LEAF standalone |
| `28` | HG_EDIFICIOS_ROUTERS | 9 | **Edifícios** | Routers Cisco dos edifícios BPC (prefixo `RTE-DRL-*`) |
| `29` | HG_EDIFICIOS_SWITCHES | 46 | **Edifícios** | Switches dos edifícios BPC |
| `24` | HG_AGENCIAS_ROUTERS | 220 | **Agências** | Routers das agências (prefixo `RT*`, ex: `RTMBANZ00`) |
| `25` | HG_AGENCIAS_SWITCHES | 27 | **Agências** | Switches das agências (enriquecimento por agência) |
| `22` | Switchs Gestão | 1 | **DC Fabric** | Switch de gestão OOB (`DC-IMP-SWA-EDGE`) |
| `35` | LINKS | 0 | — | Grupo de links WAN (vazio — links vivem como interfaces nos routers) |
| `5` | Discovered hosts | 111 | — | Equipamento por classificar (não usar em dashboards) |
| `19` | Applications | 0 | — | Grupo genérico vazio |
| `20` | Databases | 0 | — | Grupo genérico vazio |
| `7` | Hypervisors | 0 | — | Grupo genérico vazio |
| `6` | Virtual machines | 0 | — | Grupo genérico vazio |
| `2` | Linux servers | 0 | — | Grupo genérico vazio |
| `4` | Zabbix servers | 1 | — | Servidor Zabbix Network (infra interna) |

### Relações entre grupos

```
HG_DC_ROUTERS (27) — 5 routers WAN
  ├── DC1-RTE-WAN-INT  (10838) — BGP Internet     → interfaces físicas (Gi/Te) + túneis
  ├── DC1-RTE-WAN-EMIS (10839) — EMIS interbancário → interfaces por operadora
  ├── DC1-RTE-WAN-AG   (10996) — DMVPN hub agências → Tu* por carrier (1 tunnel/carrier)
  ├── DC1-RTE-PARC     (11001) — Parceiros + CUBE voz → sub-ifs por parceiro + EFXS
  └── DC1-RTE-GTW01    (10840) — Azure ExpressRoute + Gov (Po1 DOWN)
        │
        │ uplink físico (PortChannel)
        ▼
HG_DC_SWITCHES (26) — fabric Nexus
  ├── DC1-LEAF-101 (10843) ─┐ vPC-A (uplink dos routers WAN-AG + GTW01)
  ├── DC1-LEAF-102 (10845) ─┘
  ├── DC1-LEAF-103 (10842) ─┐ vPC-B (uplink dos ISR4451: WAN-INT/EMIS/PARC)
  ├── DC1-LEAF-104 (10846) ─┘
  ├── DC1-LEAF-105 (10844)   standalone
  ├── DC1-SPINE-11 (10847) ─┐ route-reflectors EVPN, ligados a todos os LEAFs
  └── DC1-SPINE-12 (10848) ─┘

  + Switchs Gestão (22): DC-IMP-SWA-EDGE (10667) — switch OOB, sem relação directa ao fabric

HG_EDIFICIOS_ROUTERS (28) — 9 routers de edifícios BPC (prefixo RTE-DRL-*)
  ├── RTE-DRL-EDF-SEDE  (10671)   Sede BPC
  ├── RTE-DRL-DSI-MUTA  (10852)   DSI / Mutamba
  ├── RTE-DRL-MAUR-JUN  (10899)   Maurício / Junqueiro
  ├── RTE-DRL-ARQU-MULE (10900)   Arquivo / Mulenvos
  ├── RTE-DRL-DPS-MBEN  (10901)   DPS / Mbengueira
  ├── RTE-DRL-DPS-PELOU (10902)   DPS / Pelouros
  ├── RTE-DRL-FENIX     (10903)   Fénix
  ├── RTLARA00          (11002)   Lara (convenção de nome de agência — reclassificar?)
  └── RTE-DRL-DPS-TRANS (11003)   DPS / Transportes
        │
        │ uplink WAN (via WAN-AG DMVPN ou circuito dedicado)
        ▼
HG_AGENCIAS_ROUTERS (24) — 220 routers de agências (prefixo RT*)
  Exemplos: RTMBANZ00, RTSAMB00, RTMALA00, RTNELI00, RTSIAC_LUENA00 …
  Cada agência: 1 router spoke DMVPN (grupo 24) + opcionalmente 1 switch (grupo 25)
        │
        └── HG_AGENCIAS_SWITCHES (25) — 27 switches de agências
              Relação: 1 switch por agência (enriquecimento, não todas têm switch)

LIGAÇÃO FÍSICA WAN-AG → Agências:
  WAN-AG (10996) actua como hub DMVPN
    Tu101 DMVPN_HUB_UNITEL  → todos os spokes Unitel (routers grupo 24)
    Tu102 DMVPN_HUB_ITA     → todos os spokes ITA
    Tu103 DMVPN_HUB_MST     → todos os spokes MST
    Tu104 DMVPN_HUB_AT      → todos os spokes AT
    Tu105 DMVPN_HUB_MULTI   → todos os spokes Multitel
  Estado do hub ≠ estado das agências individuais — hub UP apenas garante
  que o carrier está operacional.
```

### Grupos operacionalmente relevantes (usar em dashboards)

| Grupos | Sub-domínio | N2 âncora | N3 | N4 |
|---|---|---|---|---|
| 27 | WAN | ✓ | N3-WAN (5 cards por serviço) | N4-WAN-Device (var-hostid) |
| 26 + 22 | DC Fabric | ✓ | N3-DC (fabric: LEAFs + SPINEs) | N4-DC-Switch (var-hostid) |
| 28 + 29 | Edifícios | ✓ | N3-Edifícios (tabela por edifício) | N4-Rede-Device (var-hostid) |
| 24 + 25 | Agências | ✓ | N3-Agências (geomap + lista) | N4-Agência (var-hostid) |

## Sondagem 1.1 — Grupo 603 (Servidores Físicos) — 2026-06-16

**Composição real do grupo 603** (27 hosts):

| Subtipo | Prefixo de nome | Hosts | Items disponíveis |
|---|---|---|---|
| Cisco UCS (Fabric Interconnect) | `FIS - Compute - Cisco UCS` | 2 | Interfaces de rede SNMP (`cisco.ucs.*`), ICMP BPC customizado (`bpc.icmp.*`) |
| IBM Power | `FIS - Compute - IBM Power` | 2 | Apenas ICMP (`bpc.icmp.*`, `icmpping*`) — sem agente OS |
| Service Processor (IPMI) | `FIS - Compute - Service Processor` | 2 | ICMP apenas |
| **ESXi hypervisors** | `VIRT - ESXi - sv*` | 20 | `vmware.hv.*` completo: CPU%, RAM, datastores, rede, uptime, VMs, power, status |
| Dell EMC PowerEdge | `Dell EMC PE - R650XS` | 1 | 0 items activos (sem template atribuído) |

**Descoberta arquitectural — grupo 603 ≠ só físicos:**
O grupo 603 contém principalmente ESXi (20 de 27 hosts). Os verdadeiros servidores físicos
com agente SO não existem neste grupo — Cisco UCS e IBM Power têm apenas ICMP.
Os ESXi são monitorizados via VMware poller (`vmware.hv.*`).

**Items-chave para o N2 (fixados no CFG):**

| Métrica | Chave Zabbix | Fonte | Subtipo |
|---|---|---|---|
| Estado geral | `vmware.hv.status` (0=green,1=yellow,2=red) | VMware poller | ESXi |
| CPU % | `vmware.hv.cpu.usage.perf` | VMware poller | ESXi |
| CPU utilização | `vmware.hv.cpu.utilization` | VMware poller | ESXi |
| RAM total | `vmware.hv.hw.memory` | VMware poller | ESXi |
| RAM usada | `vmware.hv.memory.used` | VMware poller | ESXi |
| RAM balloon | `vmware.hv.memory.size.ballooned` | VMware poller | ESXi |
| Nº VMs | `vmware.hv.vm.num` | VMware poller | ESXi |
| Power (W) | `vmware.hv.power` | VMware poller | ESXi |
| Rede in/out | `vmware.hv.network.in/out` (bytes/s) | VMware poller | ESXi |
| Uptime | `vmware.hv.uptime` | VMware poller | ESXi |
| Cluster | `vmware.hv.cluster.name` | VMware poller | ESXi |
| Ping | `bpc.icmp.avail.1h`, `bpc.icmp.rtt.ms` | ICMP BPC | Cisco/IBM/Dell |

**Trigger-chave activos (sondado):** 15 activos, todos High:
- 2× `Unavailable by ICMP ping` (hosts físicos down)
- 12× `Free space is critically low` em datastores ESXi
- 1× `The health is Red` (ESXi com status vermelho)

**Query âncora recomendada para o painel utils N2:**
Grupo `BPC / INFRAESTRUTURA / HYPERVISORES` (608, 24 ESXi) — mais estável que 603 misturado.
Ou usar host `VIRT - ESXi - sv9000640` + item `vmware.hv.status`.

## Lacunas de classificação (cobertura)

| groupId | Grupo | Hosts | Nota |
|---|---|---|---|
| `480` | BPC/CAMADA/A-CLASSIFICAR | 25 | hosts sem camada atribuída |
| `632` | Novos_Inventario | 21 | staging de descoberta? |
| `12` | Applications | 20 | grupo default Zabbix |
| `481` | BPC/TECNOLOGIA/Desconhecido | 1 | OS por classificar |

## Sondagem 2.1 — Grupos 602/605 (Armazenamento) — 2026-06-17

**Composição real do grupo 602 (Storage) — 10 hosts:**

| Host (name) | hostid | Subtipo | Items disponíveis |
|---|---|---|---|
| Storage - IBM FS9200 | 11747 | Array Flash IBM | ICMP + SNMP: `system.status[systemHealthStat.0]` (0=OK,1=warn,2=crit), `system.uptime` |
| Storage - FS9200 Controladora1 | 11748 | Controladora IBM | ICMP only |
| Storage - FS9200 Controladora2 | 11749 | Controladora IBM | ICMP only |
| Storage - IBM FS9500 | 11750 | Array Flash IBM | ICMP + SNMP: `system.status[systemHealthStat.0]`, `system.uptime` |
| Storage - FS9500 Controladora 1 | 11751 | Controladora IBM | ICMP only |
| Storage - FS9500 Controladora 2 | 11752 | Controladora IBM | ICMP only |
| Storage - SV9000503 - DELL EMC Unity Storage | 11834 | Array Dell Unity | ICMP + script: `unity_get_state.py` (estado geral + discovery) |
| Cisco MDS DS-C9148S-K9 [Switch FC DS-C9148S] | 14707 | FC Switch | ICMP only |
| IBM Storage V7000 Gen2 [SAN Storage] | 14709 | Array SAN IBM | ICMP only |
| IBM Storage FS9200 (R3042) [All-Flash Storage] | 14710 | Array Flash IBM | ICMP only |

**Composição real do grupo 605 (Tape Library) — 1 host:**

| Host (name) | hostid | Subtipo | Items disponíveis |
|---|---|---|---|
| Tape - TS4300 | 11746 | Tape Library IBM | ICMP only |

**Triggers activos (value=1) no momento da sondagem:**

| triggerid | Descrição | Prioridade | Host |
|---|---|---|---|
| 124530 | `{HOST.NAME} -> No data from storage for 1 hours` | High | Dell Unity (11834) |
| 124531 | `{HOST.NAME} -> Exist unsupported items` | Average | Dell Unity (11834) |
| 164570 | `No SNMP data collection` | Warning | IBM FS9500 (11750) |
| 164592 | `No SNMP data collection` | Warning | IBM FS9200 (11747) — mesma causa |

**Conclusões arquitecturais:**
- Não existem métricas de capacidade (%), IOPS, latência, throughput no Zabbix — monitorização de Storage é ICMP + estado de saúde SNMP (só IBM).
- Os FS9500/FS9200 têm `system.status[systemHealthStat.0]` mas o SNMP não está a recolher de momento (triggers activos).
- Dell Unity usa script custom — também sem dados de momento.
- O N2 de Armazenamento focará em: disponibilidade (ICMP por host), estado de saúde onde disponível, contagem de alertas activos.

**Items-chave para o N2 (fixados):**

| Métrica | Chave Zabbix | Hosts |
|---|---|---|
| Estado de saúde | `system.status[systemHealthStat.0]` (0=OK, 1=warn, 2=crit) | IBM FS9200/FS9500 |
| Disponibilidade 1h | `bpc.icmp.avail.1h` | Todos |
| Conectividade | `icmpping` (1=up, 0=down) | Todos |
| Uptime | `system.uptime[sysUpTime.0]` | IBM FS9200/FS9500 |

**Query âncora recomendada para N2:** host `Storage - IBM FS9500` (11750) + item `ICMP ping` (`icmpping`) — ICMP é fiável e presente em todos os hosts.

---

## Problemas de higiene (ver propostas de acção Zabbix)

1. **Separador inconsistente:** eixo INFRAESTRUTURA usa `" / "` (com espaços),
   eixos SERVICO/CAMADA/TECNOLOGIA usam `"/"` (sem espaços). Filtros por regex
   ficam frágeis.
2. **Espaço duplo:** grupo `602` = `"BPC / INFRAESTRUTURA  / STORAGE"`.
3. **Quase-duplicado:** `412` "Git lab" vs `416` "Gitlab".
4. **Casing misto:** INFRAESTRUTURA em MAIÚSCULAS, SERVICO em Title Case.
