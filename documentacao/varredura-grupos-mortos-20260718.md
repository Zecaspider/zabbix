# Varredura de grupos mortos nos dashboards (2026-07-18)

> Origem: o utilizador reparou que o card VMware do N1 e o dashboard novo
> `visao-triggers` contavam histórias diferentes. A causa era um groupid
> morto — investigação alargada a todos os dashboards geridos pelo repo.

## Mapa de grupos: morto → canónico (Infra)

Cruzamento de `hostgroup.get` ao vivo (2026-07-18) com todas as referências
nos dashboards. A migração de taxonomia (F1-F3, 2026-07-14) renumerou/renomeou
os grupos, mas vários dashboards ficaram pendurados nos IDs/nomes antigos.

| Referência antiga | Estado | Canónico vivo |
|---|---|---|
| groupid `608` (HYPERVISORES) | **apagado** | `603` = `BPC/DOMINIO/01 Virtualizacao` (24 hosts) |
| groupid `602` (nome `BPC / INFRAESTRUTURA / STORAGE`) | vivo mas legado (14 hosts) | `668` = `BPC/DOMINIO/02 Armazenamento` (17 hosts, já inclui a tape) |
| groupid `605` (tape library) | **apagado** | fundido em `668` |
| groupid `345`, `391` (APIs) | **apagados** | só `663` = `BPC/DOMINIO/07 ...` (93 hosts) |
| groupid `664` (vCenters) | **apagado** | vCenters agora em `603` |
| nome `BPC / INFRAESTRUTURA  / STORAGE` (2 espaços) | **morto** (regressão Fase 15.E) | usar âncora canónica `_SISTEMA/ANCORA-RENDER` |
| nome `BPC / INFRAESTRUTURA / SERVIDORES FISICOS` | **morto** | idem |
| Network `26-29` (HG_DC/EDIFICIOS) | **vivos**, sem alteração | — |

## Correcções aplicadas nos ficheiros runtime (.js) — resolução dinâmica

Em vez de trocar um ID fixo por outro (que voltaria a morrer na próxima
migração), os 3 ficheiros passaram a **resolver o groupid por NOME**
(`BPC/DOMINIO/NN`) uma vez no arranque, com o ID canónico como fallback:

1. **`00-visao-geral/n1/n1-cards.js`** — o bug principal. O card VMware
   apontava a `608` (morto) → mostrava **0 problemas (verde)** quando havia
   **88 críticos** em `603` (a crise de datastores de 75 dias). Também
   corrigido storage (`602/605`→`668`) e APIs (`663/345/391`→`663`). Novo
   `resolveInfraGroups()` + `domainPrefix` por domínio.
2. **`00-visao-geral/notificacoes/l1-resumo-triggers.js`** — o mesmo bug do
   608, no dashboard de notificações. Mesmo resolvedor aplicado.
3. **`01-infraestrutura-vmware/n3-vcenter/l3-vcenter-topo.js`** — o resolvedor
   nome→hostid do vCenter filtrava pelo grupo `664` (morto). Partia-se sempre
   que o N2 passava o vCenter por nome (padrão desde a Fase 1.24). Removido o
   filtro de grupo (o nome do vCenter é único) — imune a futuras migrações.

## Âncoras BT mortas em dashboards de produção (pendente de push)

Painéis Business Text cuja âncora de render aponta a grupo morto → o painel
não desbloqueia o render (fica em branco). A âncora só serve para destravar
o render (os dados vêm por RPC); logo o fix certo é a âncora universal
`_SISTEMA/ANCORA-RENDER` (grupo 667, host `IBM FS9500`, item `ICMP ping`) —
criada para nunca morrer (CLAUDE.md), já o default do `push_panel.py`.

| Dashboard | Painéis | Âncora morta |
|---|---|---|
| `b55d5481` N3 · VMware · ESXi — Detalhe | 100, 101, 102 | `BPC / INFRAESTRUTURA / SERVIDORES FISICOS` |
| `rede-n3-dc` N3 · Rede · DC Fabric | 104 | `BPC / INFRAESTRUTURA  / STORAGE` (2 espaços) |
| `75f53aac` **TESTE** - utils v9 | 1 | `BPC / INFRAESTRUTURA  / STORAGE` — dashboard de teste, candidato a arquivo, não corrigir |

## Fora de âmbito (dashboards legados, NÃO geridos por este repo)

O scan cru apanhou ~40 dashboards legados (`bpc-web-*`, `bpc-overview`,
`bpc-host-count`, `d-web-*`, UIDs aleatórios `adXXXXX`) que usam a
nomenclatura pré-BPC-Observe (`BPC / CAMADA / SINTETICOS`, `BPC/LAYER/SYNTHETIC`,
`BPC Servidores Virtuais`, etc.). Não fazem parte do sistema actual (não têm
manifest neste repo) — são candidatos a **arquivo/limpeza**, decisão separada
do utilizador, não corrigidos nesta passagem.

## Falsos positivos confirmados
- Variáveis de dashboard `$groupid` / `${group}` (N3 VM diagnóstico e todos
  os N4/N5/N6 de Rede) — são variáveis resolvidas em runtime, não grupos.
- Grupos `HG_*` em dashboards de Rede — vivos na instância Network; só
  pareciam mortos porque o 1º scan comparou contra grupos Infra.
