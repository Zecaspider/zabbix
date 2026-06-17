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

## Inventário Network (Zabbix `10.10.233.140`) → domínios Rede / Agências

Sondado 2026-06-16 via API directa. 15 grupos; relevantes:

| Domínio (N2) | groupId | Grupo Zabbix | Hosts | Papel |
|---|---|---|---|---|
| **Agências** | `24` | HG_AGENCIAS_ROUTERS | 220 | âncora (routers das agências) |
| └ Agências | `25` | HG_AGENCIAS_SWITCHES | 27 | enriquecimento (switches) |
| **Rede** — Datacenter | `26` | HG_DC_SWITCHES | 7 | DC switches |
| **Rede** — Datacenter | `27` | HG_DC_ROUTERS | 5 | DC routers |
| **Rede** — Edifícios | `28` | HG_EDIFICIOS_ROUTERS | 9 | edifícios routers |
| **Rede** — Edifícios | `29` | HG_EDIFICIOS_SWITCHES | 46 | edifícios switches |
| **Rede** — WAN/Links | `35` | LINKS | 0 | links WAN (vazio agora — confirmar onde vivem os links) |
| (gestão) | `22` | Switchs Gestao | 1 | gestão out-of-band |

Notas:
- **Agências** ancora em `24` (routers, 220 hosts) — é a vista geomapa; `25`
  (switches) entra como enriquecimento por agência.
- **Rede** é multi-grupo por natureza (DC + Edifícios + WAN). O N2 de Rede
  agrega os grupos `26/27/28/29/35`; não há um único groupId âncora — usar a
  segmentação DC / Edifícios / WAN como sub-secções (alinha com a estrutura
  antiga `rede/l2-datacenter`, `l2-edificios`, `l2-wan`).
- `LINKS` (35) está a 0 hosts — antes de construir a vista WAN, confirmar onde
  estão modelados os links (item por interface vs host dedicado).
- Grupos genéricos Zabbix (Linux servers, Discovered hosts 111h, etc.) não são
  domínio — `Discovered hosts` pode conter equipamento por classificar.

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
