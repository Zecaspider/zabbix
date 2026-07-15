# Reconciliação Domínios Grafana ↔ Taxonomia Zabbix — 2026-07-14

> Registo da auditoria e limpeza da taxonomia de hosts do Zabbix Infra
> (grupos + tags) contra os domínios Grafana, executada em 2026-07-14.
> Snapshots de rollback de cada lote em
> `C:\Repositorios\zabbix\bpc-workspace\reconciliacao-snapshots-20260714\`.
> Relatório host-a-host (estado ANTES da limpeza) em
> `C:\Repositorios\zabbix\bpc-workspace\reconciliacao-dominios-zabbix-grafana-20260714.xlsx`.

## 1. Diagnóstico que motivou a operação

Três taxonomias paralelas codificavam as mesmas dimensões no Zabbix Infra,
sem sincronização entre elas:

1. **Host groups facetados** — 84 grupos em 6 eixos (`AMBIENTE`,
   `INFRAESTRUTURA`, `CAMADA`, `SERVICO`, `TECNOLOGIA`, `LOCALIZACAO`),
   55 só no eixo `SERVICO` (34 com ≤2 hosts).
2. **Tags de host** — 26 chaves (`servico` com 172 valores, `camada` 15,
   `ambiente` 9 grafias).
3. **Prefixo do nome do host** (`SO - Compute -`, `PLAT - Mgmt -`, …).

Consequências medidas: **91 hosts (67 activos) fora de qualquer grupo-âncora
de domínio** (invisíveis em todos os N2), 148 hosts com grupo `CAMADA/*`
divergente da tag `camada`, grupo `355` (26 hosts) vs tag
`camada=base de dados` (53 hosts).

## 2. Decisões de desenho (F1, aprovadas pelo utilizador 2026-07-14)

1. **Grupos = eixo de domínio, tags = dimensões finas.** Um grupo-âncora por
   domínio Grafana; `servico`/`ambiente`/`tecnologia`/`camada` vivem como tags.
   Os nomes actuais dos grupos-âncora **não foram renomeados** (renomear parte
   âncoras Grafana — lição do incidente de 2026-07-06); um rebaptismo
   `BPC/DOMINIO/*` é possível no futuro, coordenado com os dashboards.
2. **Nos conflitos grupo CAMADA vs tag `camada`, a tag ganha** (foi revista
   host a host na Fase 6.1).
3. **Os 55 grupos `SERVICO/*` colapsam para a tag `servico`** (F3.5,
   ainda por executar — ver §5).

Mapa canónico domínio → grupo-âncora (Infra):

| Domínio Grafana | groupId âncora |
|---|---|
| 01 VMware | `603` (físicos+ESXi) + `664` (vCenter) |
| 02 Armazenamento | `602` + `605` (tape) |
| 03 Servidores Virtuais | `609` |
| 05 Segurança | `656` |
| 06 Bases de Dados | `355` |
| 07 APIs e Serviços | `663` |
| 10 Serviços de Suporte | tag `servico` (sem grupo próprio) |
| 04 Rede | Zabbix Network, grupos `HG_*` |

## 3. O que foi executado (tudo com aprovação lote a lote)

### F2 — Normalização de tags e grupos (Zabbix Infra)

| Lote | Resultado |
|---|---|
| F2.1 | Tag `ambiente` normalizada em 76 hosts: `producao`/`Producao`→`Produção`, `qa`→`QA`. Ficou: Produção 320 · QA 109 · A-CLASSIFICAR 26 · Operações 7 · Desenvolvimento 2 · Teste 1 |
| F2.2 | Tag `camada`: `seguranca`/`Seguranca`→`Segurança` (8 hosts; 13 pares — alguns tinham as 2 grafias) |
| F2.3 | Tags `01/02/04/05/06 camada` **apagadas** (108 hosts). Eram um esquema numerado paralelo que nenhum dashboard consumia. Chaves de tag: 26→21 |
| F2.4 | Grupo `490` (SERVICO/SGC, vazio) apagado. **Não apagáveis** (descoberto na pré-verificação): `5` Discovered hosts = `discovery_groupid` global do Zabbix; `12` Applications e `13` Templates/Databases = usados por host prototypes de templates (VMware `{#HV.UUID}`/`{#VM.*}`, Kubernetes); `2`/`4`/`6` = referenciados por actions; `341` = referenciado pela action 11 (off) |

### F3 — Reclassificação dos hosts sem domínio

| Lote | Resultado |
|---|---|
| F3.1 | 57 VMs órfãs (padrão `VS/SV#######`) adicionadas ao `609` via `massadd`; 2 delas (`VS8000409` Talentia-BD, `VS8000444` BPC Net-BD) também ao `355`. Órfãos 91→34 |
| F3.2 | 9 hosts OKD coerentes (`servico=OKD`, `camada=Plataforma de Contentores` — incluindo os 2 antigos que tinham `Camada Aplicacional`) + 3 Veeam (`servico=Veeam Software Appliance`, `camada=Serviços de Infraestrutura`); os 10 novos-classificados saíram do grupo `480` A-CLASSIFICAR (25→15) |
| F3.3 | 21 hardware do `Novos_Inventario` movidos: 16× PowerFlex R650 + 2× Cisco UCS → `603`; Dell Unity 550F → `602`; 2× tape → `605`. Grupo `632` Novos_Inventario ficou vazio e foi **apagado**. Nota: 18 dos 21 estão desactivados — decisão deliberada de os manter visíveis no inventário dos domínios |
| F3.4 | Zabbix server + `tacacsubuntu` + `VS8000ASSECO` → `609` (+ tags `servico=zabbix`/`tacacs`); Data Domain + 2× RecoverPoint → `602`; 4× IBM Power + HMC → `603`; `sv9001206` (Vcenter DR, IP = endpoint do vCenter Backup Swift) → `664` e removido do `609` |

### Estado final (verificado ao vivo após F3.4)

**Hosts sem domínio: 91 → 2** (ambos por decisão consciente: `BNA` activo
pendente da equipa + Cisco WLC desactivado). Contagens dos grupos-âncora:

| groupId | Grupo | Antes | Depois |
|---|---|---|---|
| `603` | SERVIDORES FISICOS | 27 | **50** |
| `609` | SERVIDORES VIRTUAIS | 428 | **487** |
| `602` | STORAGE | 10 | **14** |
| `605` | TAPE LIBRARY | 1 | **3** |
| `664` | VCENTER | 3 | **4** |
| `355` | CAMADA/Bases de Dados | 26 | **28** |
| `656` | DISPOSITIVOS DE SEGURANCA | 8 | 8 |
| `663` | APLICACOES/SINTETICOS | 40 | 40 |

## 4. Achado paralelo (Zabbix Network) — router novo na Borda DC

`10.10.205.55` (hostid `11014`) **criado manualmente em 2026-07-14 14:59 pelo
utilizador "Admin"** directo no `HG_DC_ROUTERS` — quebra a premissa "5 routers"
dos dashboards Borda DC. Template `Cisco IOS by SNMP` mas SNMP sem resposta
(só ICMP, RTT 0.26ms); zero tags, nome = IP. **Pendente: utilizador confirmar
internamente quem o criou e que equipamento é** antes de o classificar ou
os dashboards Borda DC serem ajustados.

## 5. F3.5 — colapso dos grupos SERVICO/* (executado 2026-07-14)

**Pré-verificação**: zero consumidores vivos confirmados — nenhuma action,
maintenance, permissão de user group ou host prototype referencia os
grupos `SERVICO/*`; o único hit no repo é código arquivado
(`arquivo-referencia/v5-material-bruto/servicos/ebankit/card-service-v2.js`,
dados de demo com grupos fictícios) que já tem fallback desenhado para a
tag `servico`. Amostragem confirmou 131/132 hosts com tag `servico`
coerente com o grupo (a única "divergência", `VS8000754` no grupo
histórico `Cpi` mas tagueado `ebankit`, é correcta — o próprio nome do
host confirma "ebankit servidor IIS"; a decisão anterior de não fundir
`SWIFT`/`Swift SAA`/`Swift SWP` — auditoria Fase 14.20 §7 — foi respeitada,
só a membership de grupo foi removida, os valores da tag ficaram intactos).

**Execução**: 50 grupos (132 hosts) em 5 lotes de ~10, cada um com
verificação pré-remoção (aborta se algum membro não tiver tag `servico`),
snapshot em `bpc-workspace/reconciliacao-snapshots-20260714/f3.5-lote{1..5}-antes.json`,
`hostgroup.massremove` + `hostgroup.delete`. **Resultado: 0 grupos
`SERVICO/*` restantes** (`hostgroup.get` confirma). Nenhuma tag foi escrita
— operação só de grupo. Total de grupos no Zabbix Infra: 84 → **32**.

> **Actualização 2026-07-15**: o modelo-alvo evoluiu para o contrato
> canónico em `taxonomia-grupos-tags.md` (8 grupos `BPC/DOMINIO/*`,
> incluindo `08 Datacenter Fisico` novo e split do 603; Fases A/B/C
> aprovadas). Este documento passa a registo histórico da operação de
> 2026-07-14; para decisões de classificação usar o contrato.

## 6. Pendentes (por ordem de prioridade)

1. ~~F3.5~~ — **concluído**, ver §5.
2. **15 hosts no grupo `480` A-CLASSIFICAR** sem classificação óbvia
   (`VS8000771/856/881/900/901/902/905/906/907/908/999`, `VS9000751`,
   `scg9000650`, `Teste Kea DHCP`, `rhcoreos_bootstrap`(?)) — perguntar à
   equipa o que corre em cada um.
3. **`BNA` (hostid 12001)** — IP `172.20.143.22` (gama distinta, provável
   ponta interbancária com o Banco Nacional de Angola); sem rasto VMware.
   Deixado sem domínio de propósito — perguntar à equipa.
4. **Router `10.10.205.55`** (ver §4).
5. **26 hosts com `ambiente=A-CLASSIFICAR`** — ausência de informação, não
   grafia; resolver com a equipa.
6. **Grupos CAMADA/* vs tag `camada`** — com a decisão "tag ganha", os grupos
   `345`/`355`/`480`/`658` do eixo CAMADA tornam-se redundantes a prazo;
   `355` continua âncora do domínio 06 até o N2 de BD migrar de âncora.
7. **Cisco WLC 9800-L** (desactivado) — pertence conceptualmente ao domínio
   04/Rede; decidir quando se tratar Wi-Fi.
8. **Processo anti-regressão (F5 do guia)** — painel/relatório "hosts sem
   domínio" para novos hosts nunca mais ficarem invisíveis (proposto, não
   construído).

## 6. Lições de API desta operação (reutilizáveis)

- `settings.get` → `discovery_groupid` identifica o grupo de discovery global;
  `hostgroup.delete` falha nele e em grupos usados por host prototypes — a
  mensagem de erro diz qual é o bloqueio, testar sempre um delete "à vez".
- `hostgroup.massadd`/`massremove` não tocam nos restantes grupos do host —
  ferramenta certa para mover hosts entre eixos sem efeitos colaterais.
- `host.update` com `tags` **substitui a lista inteira** — ler-modificar-
  escrever sempre, e deduplicar depois de normalizar valores (há hosts com a
  mesma chave em 2 grafias).
- Hosts com o mesmo prefixo de padrão (`sv9001206`) podem ser conectores de
  API (vCenter), não VMs — validar por template+IP antes de classificar em
  massa por regex de nome.
