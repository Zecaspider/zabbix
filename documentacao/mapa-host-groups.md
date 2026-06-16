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
| Servidores Físicos | `603` | BPC / INFRAESTRUTURA / SERVIDORES FISICOS | 27 |
| Servidores Virtuais | `609` | BPC / INFRAESTRUTURA / SERVIDORES VIRTUAIS | 453 |
| └ Hypervisores (ESXi) | `608` | BPC / INFRAESTRUTURA / HYPERVISORES | 24 |
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

## Lacunas de classificação (cobertura)

| groupId | Grupo | Hosts | Nota |
|---|---|---|---|
| `480` | BPC/CAMADA/A-CLASSIFICAR | 25 | hosts sem camada atribuída |
| `632` | Novos_Inventario | 21 | staging de descoberta? |
| `12` | Applications | 20 | grupo default Zabbix |
| `481` | BPC/TECNOLOGIA/Desconhecido | 1 | OS por classificar |

## Problemas de higiene (ver propostas de acção Zabbix)

1. **Separador inconsistente:** eixo INFRAESTRUTURA usa `" / "` (com espaços),
   eixos SERVICO/CAMADA/TECNOLOGIA usam `"/"` (sem espaços). Filtros por regex
   ficam frágeis.
2. **Espaço duplo:** grupo `602` = `"BPC / INFRAESTRUTURA  / STORAGE"`.
3. **Quase-duplicado:** `412` "Git lab" vs `416` "Gitlab".
4. **Casing misto:** INFRAESTRUTURA em MAIÚSCULAS, SERVICO em Title Case.
