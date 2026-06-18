# Arquitectura do Domínio Rede — N2 → N3 → N4

> Documento de referência da Fase 4 (Rede). Aprovado em 2026-06-18 (lente dupla:
> engenheiro NOC + engenheiro de redes). Complementa o `blueprint-observabilidade.md`
> (que define até N3) — este eleva o detalhe por-dispositivo a **N4** e fecha a
> tarefa 4.1 (links WAN). Fonte de inventário: `mapa-host-groups.md` §Network.

---

## 0. Princípio orientador (lente dupla)

| Lente | Pergunta que o nível responde |
|---|---|
| **NOC** (operação) | "Está tudo verde? Se não, **onde** dói e com que **gravidade**?" — vermelho/verde a 3 m |
| **Redes** (causa raiz) | "**Porquê**? Que interface, peer BGP, link WAN, erro de porta?" — dados densos, séries |

Cada nível só mostra o que esse persona precisa para decidir descer mais um.
NOC vive em N2; engenharia vive em N3/N4.

---

## 1. Topologia física (o que ditam os níveis)

```
                          INTERNET / PARCEIROS / AGÊNCIAS
                                     │
          ┌──────────┬──────────┬────┴─────┬──────────┐
       RTE-GTW01  WAN-INT     WAN-AG     WAN-EMIS    WAN-PARC      ← grupo 27 (5 routers WAN)
       gateway    (BGP×3)   (DMVPN 7p   (EMIS 3p)  (MINFIN,BNA,
          │       MSTELCOM   +Azure ER)            BODIVA,INSS…)
          │        ITA,AT)
          └────────────────┬──────────────────────┘
                    ╔═══════╧═══════╗
                    ║  FABRIC DC    ║   ← grupo 26 (7 switches Nexus)
                    ║  Spine-Leaf   ║
                    ║ SPINE-11/12   ║   2× N9K-C9332C (32×100G), NX-OS 10.1(1)
                    ║ LEAF 101-105  ║   N9K-93180YC-FX3 / 93108TC-FX
                    ╚═══════════════╝
                                     ┊ (uplinks)
              EDIFÍCIOS: 9 routers (g28) + 46 switches (g29)
              AGÊNCIAS: 220 routers (g24) + 27 switches (g25)  ← domínio próprio (Fase 9)
```

**Insight nº 1 — links WAN (fecha 4.1):** o grupo 35 (`LINKS`) está vazio. Os
links WAN **não são hosts** — são **interfaces** (`net.if.in/out/status/errors`)
e items **IP SLA RTT** *nos próprios routers WAN do grupo 27*. A vista WAN
constrói-se a partir do grupo 27; não se espera por hosts no grupo 35.

**Insight nº 2 — BGP sem MIB:** não há OID BGP. Estado de sessão inferido por
**proxy de interface** (`BGP_PEER_*` up/down + IP SLA RTT por provider).
Sinalizar sempre como "estado por proxy" — nunca fingir BGP nativo.

---

## 2. Os 4 níveis

### N2 · Rede — wallboard do domínio (1 dashboard, persona NOC)

Agrega os 3 segmentos num ecrã; resumo de saúde, não tabela gigante.

| Painel | Tipo | Conteúdo |
|---|---|---|
| `utils.js` | DT utils | runtime BPC + nocLabel "REDE — NÍVEL 2" |
| `l2-kpi.js` | DT | 5 KPIs domínio: Dispositivos UP/total · Alertas (por sev) · Pior segmento · Links WAN UP · BGP peers UP (proxy) |
| `l2-segmentos.js` | DT | 3 cards (DC / Edifícios / WAN) — estado agregado + up/down + drill p/ N3 |
| `l2-triggers.js` | DT | Top triggers de toda a rede (sev desc) + link directo ao N4 do host |

> Funde o que hoje está em `l2-dc.js` + `l2-edificios-rt.js` + `l2-edificios-sw.js`.

### N3 · Rede · ‹Segmento› — sala de triagem (3 dashboards, NOC/engenharia)

| Dashboard | Grupos | Estado | Conteúdo |
|---|---|---|---|
| **N3 · DC Core** | 26+27 | existe (`l3-dc-table.js`) | Fabric Spine-Leaf + Routers WAN — promover |
| **N3 · Edifícios** | 28+29 | existe (`l3-edificios-table.js`) | tabs Routers/Switches por andar — manter |
| **N3 · WAN** | 27 (interfaces) | **novo** `rede/n3-wan/` | links por provider: RTT IP SLA, perda, estado interface, BGP-proxy |

Cada linha → drill N4 via `var-hostid`. Estrutura: utils + KPI segmento + tabela(s) + triggers.

### N4 · Rede · Detalhe Device/Link — bancada do engenheiro (1 dashboard parametrizado)

Nível novo (blueprint ia só até N3). Um dashboard único por `var-hostid`
(padrão N3-vCenter), reutilizado para qualquer device. Painéis condicionais por
classe de host (switch Nexus vs router WAN).

| Painel | Tipo | Conteúdo |
|---|---|---|
| `l4-header.js` | DT | ficha: nome, modelo, NX-OS/IOS, papel, uptime, localização |
| séries CPU/RAM/Temp | nativo | timeseries (histórico) |
| **tabela interfaces** | nativo/DT | por porta: status, in/out bps, erros, descartes, %util — coração do N4 |
| BGP / IP SLA por provider | DT (cond.) | só routers WAN — peers proxy, RTT/perda por provider |
| sensores fan/PSU/temp | DT (cond.) | só Nexus |
| `l4-eventos.js` | DT/nativo | histórico de eventos/triggers do host |

---

## 3. Navegação (contrato)

```
N1 (Fase 10) ──card Rede──► N2 · Rede
                               │
   ┌───────────────┬──────────┴───────────┐
   ▼ card DC        ▼ card Edifícios       ▼ card WAN
N3 · DC Core     N3 · Edifícios         N3 · WAN
   └────────────────┴──────────┬──────────┘
                               ▼ var-hostid
                       N4 · Detalhe Device/Link
```

Back-links em cada nível (padrão N3-ESXi→N2-VMware). UIDs no `manifest.json`.

---

## 4. Catálogo de estado / thresholds (fixar no utils de rede)

> Inventário de items **auditado** em `rede-topologia.md` (2026-06-18). Chaves
> reais confirmadas — usar exactamente estas.

| Métrica | warn | crit | chave Zabbix real |
|---|---|---|---|
| ICMP RTT | 5 ms | 50 ms | `icmppingsec` |
| Perda ICMP | 1% | 10% | `icmppingloss` |
| CPU | 60% | 85% | `system.cpu.util[N]` |
| RAM | 80% | 92% | `vm.memory.util[N.1]` (já %; **não** usar free/used em bytes) |
| Util. interface | 70% | 90% | `net.if.in/out` ÷ `net.if.speed[ifHighSpeed.N]` |
| Erros interface | 1 | 10 /interv | `net.if.*.errors` / `*.discards` |
| Temp (Nexus) | 60°C | 75°C | `sensor.temp.value[ID]` (pior sensor) |
| Estado interface | — | down | `net.if.status[ifOperStatus.N]` (1=UP, 2=DOWN) |
| BGP (proxy) | — | down | `net.if.status` de interfaces `BGP_PEER_*` (3, só WAN-INT) |
| **IP SLA saúde** | — | ≠1 | `rttMonCtrlAdminSense[N]` (1=OK) — sinal real de link |
| IP SLA RTT | 5 ms | 50 ms | `rttMonCtrlAdminCompletionTime[N]` |

(Promovido para o utils partilhado em 4.2 via `BPC.NET_THR`. **Nota crítica:**
oper-status UP ≠ link saudável — o IP SLA é a verdade de serviço, ex. ITA está
UP mas com IP SLA NOT OK.)

---

## 5. Decisões técnicas herdadas (mantêm-se)

- **Âncora:** Storage IBM FS9500 / Infra `3_KgG43nz` em todos os painéis (Network
  Zabbix lento). Dados reais via RPC ao datasource Network dentro do `afterRender`.
- **Datasource de dados:** Network `ffo8sp8zllog0e` (Zabbix 7.0).
- **Estilo NOC:** `transparent:true`, título vazio nos painéis de conteúdo, +4px fontes.
- **utils canónico:** copiar `_comum/utils.js`, ajustar só `nocLabel`.

---

## 6. Reconciliação com o existente

| Já existe | Acção |
|---|---|
| `rede/n2/` (kpi/triggers/dc/edificios-rt/edificios-sw) | refactor: fundir DC+edifícios em `l2-segmentos.js`; N2 slim |
| `rede/n3-dc/` (`l3-dc-table.js`) | promover + ligar drill N4 |
| `rede/n3-edificios/` | manter + ligar drill N4 |
| grupo 35 vazio | fechar 4.1: WAN = interfaces do grupo 27 |
| — | criar `rede/n3-wan/` |
| — | criar `rede/n4-device/` (parametrizado) |

---

## 7. Ordem de construção (incremental, painel-a-painel)

```
1 · Fundação rede   — consolidar utils.js de rede (thresholds §4, nocLabel)
2 · N2 refactor     — l2-kpi (5 KPIs) → l2-segmentos (3 cards) → l2-triggers
3 · N3 DC           — promover l3-dc-table + drill N4
4 · N3 Edifícios    — drill N4
5 · N3 WAN (novo)   — links/IP SLA/BGP-proxy a partir do grupo 27
6 · N4 device (novo)— header → séries nativas → tabela interfaces → BGP/sensores cond. → eventos
7 · Navegação       — back-links + UIDs + teste browser ponta-a-ponta
8 · Layout final    — gridPos, snapshot JSON, sem scroll, commit
```

Cada passo: editar `.js` → `node --check` → push → testar 15-20 s → aprovar →
manifest → commit (com confirmação). Push e commit pedem confirmação explícita.

---

## 8. Decisões aprovadas (2026-06-18)

1. **N4 parametrizado** — detalhe por device/link como nível novo (1 dashboard por `var-hostid`).
2. **WAN via interfaces do grupo 27** — não esperar por hosts no grupo 35; fecha 4.1.
3. **N3 WAN separado** — dashboard próprio, 3.º irmão de DC e Edifícios.
