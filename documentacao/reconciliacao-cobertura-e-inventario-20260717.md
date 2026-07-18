# Reconciliação — cobertura de serviços + inventário vCenter↔Zabbix (2026-07-17)

> Reconcilia (a) o trabalho de inventário/tags de 2026-07-16/17 feito em
> `inventario/` com o `cronograma.md` (parado em 2026-07-13), e (b) a
> "estratégia de cobertura por camadas" que foi rascunhada em
> `inventario/estrategia-cobertura.md` com a arquitectura N1-N5 do
> `blueprint-observabilidade.md` e com os web scenarios L1-L4 do
> `mapa-apps-vms.md`. Escrito depois de o utilizador pedir explicitamente para
> "reconciliar tudo — CLAUDE, cronograma e restantes documentações".

## 0. A confusão a desfazer: três eixos com nomes colididos

O projecto usa dois sistemas de numeração e a estratégia rascunhada introduziu
um terceiro — todos com "N" ou "L", o que gera confusão. **São ortogonais, não
competem.**

| Eixo | Pergunta que responde | Valores | Estado |
|---|---|---|---|
| **N1-N5 · Dashboard** | *Como navego/agrego a vista?* | N1 NOC → N2 domínio → N3 host → N4 sistema/device → N5 interface | maduro (blueprint §4) |
| **Fonte de dados · tier** | *De onde vem o sinal e quão fundo mede?* | infra (vCenter) · SO (agente) · funcional (check de serviço) | parcial (BD já tem tiers; falta generalizar) |
| **Profundidade do check funcional · L1-L4** | *Quão fundo vai o teste sintético?* | web: L1 disponibilidade → L3 conteúdo → L4 auth; DNS: resolve?; porta: aberta? | web maduro; DNS bloqueado |

A "estratégia L1-L4" que rascunhei **misturava dois destes eixos** e reusava o
"L" dos web scenarios — erro de nomenclatura. Corrigido abaixo.

## 1. Como a "estratégia L1-L4" rascunhada mapeia no vocabulário do projecto

| Rascunho (`estrategia-cobertura.md`) | É na verdade | Já existe como |
|---|---|---|
| "L1 — Infra" | **fonte infra** (vCenter) | template `VMware Guest`; desbloqueio = **Z.8** |
| "L2 — Sistema Operativo" | **fonte SO** (agente) | `Windows/Linux by Zabbix agent active`; desbloqueio = campanha de agente |
| "L3 — Serviço (funcional)" | **fonte funcional** | web scenarios (`BPC Web Monitoring v2`, L1-L4) · `BPC DNS Check` (`net.dns`) · `net.tcp.service` · perfmon BD (tier) |
| "L4 — Observação/Notificação/Troubleshoot" | **NÃO é fonte de dados — é a superfície** | dashboards N1-N5 + `action`/notificações + runbooks |

**Correcção conceptual central:** o meu "L4" não é uma quarta camada de dados —
é o **consumo** das três fontes. As fontes são **3** (infra/SO/funcional); a
superfície (N-dashboards, notificações, runbooks) consome as três. O modelo de
**tier** do domínio BD (6.1.8: ODBC→perfmon→serviço→sem-sinal) já é exactamente
este eixo "fonte de dados" aplicado a um domínio — a generalização é adoptar
esse vocabulário ("fonte"/"tier"), não inventar "L1-L4".

## 2. Onde os web scenarios (L1-L4) encaixam

Os web scenarios **são uma instância da fonte funcional**, para o protocolo
HTTP. O seu L1-L4 é a **profundidade interna** desse check, não uma camada de
dados:
- **L1** disponibilidade (responde? código HTTP esperado?)
- **L3** conteúdo (`{$STRING.CHECK}` — a página tem a string esperada?)
- **L4** autenticação (`{$AUTH.ENABLED}` — login/transacção; off por omissão)

O mesmo padrão de profundidade aplica-se a outros protocolos da fonte funcional:
- **DNS**: "resolve uma query real?" (`net.dns`) — equivalente ao L3 (funcional),
  não só "porta 53 aberta" (que seria o equivalente ao L1).
- **Porta/serviço TCP**: `net.tcp.service` — equivalente ao L1 (disponibilidade).
- **BD**: tier ODBC = equivalente ao L3/L4 (query real); tier serviço = L1
  (processo a correr).

Ou seja: **web L1-L4, DNS, porta, BD-tier são todos a mesma fonte "funcional"**,
cada um com a sua profundidade. Não há conflito com N nem com as outras fontes.

## 3. Estado real da fonte funcional por serviço (o "piloto" que já existe)

O "piloto DNS" que rascunhei **já foi construído** (2026-07-16, incidente DNS
externo) e **está bloqueado por um bug agora identificado**:

| Serviço | Fonte funcional | Estado | Bloqueio |
|---|---|---|---|
| **DNS** | `BPC DNS Check` (`net.dns`), NS3/NS4 + DCs, triggers de correlação | criado, **items em erro** | **`net.dns` foi posto como Simple check; é item de Zabbix agent** (ver §4) |
| **HTTP/Apps** | `BPC Web Monitoring v2` (L1-L4), 41 hosts `app-*` | **em produção** (Fase 7) | — (maduro) |
| **BD** | tiers ODBC/perfmon/serviço, N2+N3 | **em produção** (Fase 6.2) | credencial `zbx_monitor` em 16 hosts (6.1.7) |
| **Serviços Windows** | `service.info` (DNS/DHCP/NTDS/…) | parcial | só `VS9000003`; replicar `VS9000007` (17.6) |
| **NTP** | — | sem cobertura | Fase 17.6.c |

## 4. Achado desbloqueante: o bug do `BPC DNS Check`

`item.get` ao vivo (2026-07-17): os 4 items (`543125-543128`) têm
**`type=3` (Simple check)** com a chave `net.dns[...]`. Em Zabbix, **`net.dns`
e `net.dns.record` são items de _Zabbix agent_, não Simple checks** — daí o
`Unsupported item key` (o poller de Simple checks não conhece a chave). Prova
ao lado: `net.tcp.service` (esse *é* Simple check) coabita com `state=0`.

Isto explica também o "achado intrigante" do §4.5 do incidente: o item no
pseudo-host do template não dá erro porque as macros ficam literais e o item
nunca é avaliado; só nos hosts reais, ao expandir e correr, o poller rejeita a
chave.

**Correcção (2 caminhos, ambos precisam de aprovação):**
1. Mudar o item para **tipo Zabbix agent** — mas corre no agente da VM, e
   NS3/NS4 têm o agente morto (`agent.ping` sem dados há 30d). Não desbloqueia
   sozinho.
2. **Recomendado:** um **host-prober** com agente saudável (o próprio Zabbix
   server/proxy, ou uma VM Linux com agente OK) corre
   `net.dns[10.5.0.128,bpc.ao,SOA,2,3]` do tipo Zabbix agent, apontando o IP ao
   DNS remoto a testar. O agente do prober faz a query — **não depende do agente
   de NS3/NS4**. Desbloqueia já, sem esperar pela recuperação de agentes.
   (Alternativa mínima de disponibilidade: `net.tcp.service[tcp,<ip>,53]` como
   Simple check — vê a porta 53, não a resolução; é o "L1" do DNS, não o "L3".)

## 5. Trabalho de 2026-07-16/17 a incorporar no cronograma

Feito em `inventario/` (fora do fluxo de dashboards, é saneamento de dados que
os alimenta) e ainda não reflectido no `cronograma.md`:
- **Inventário live-first** vCenter PRD+BackupSwift (231 VMs) + snapshot
  PowerFlex (307) reconciliado com Zabbix; parser corrigido (secções, dedup por
  UUID, anotação decomposta em servico/ambiente/departamento).
- **Comparação 3-vias** (live×Excel×Zabbix): Excel de Maio quase sem gaps no PRD
  (1 VM nova); 27 VMs onboarding confirmadas por 2 fontes.
- **Correcções lado-Zabbix aplicadas** (backup+dry-run+verificação): tags `so`
  (436 hosts), grupo 03 reintegrado (57), 20 grupos `BPC/SERVICO/*`, tags
  ausentes (99), macros UUID (18 criadas + 2 corrigidas BIOS→instance),
  templates SO trocados (13), conflitos de tag (12, regra "vCenter vence"),
  §3 desactivados (19), §4 onboarding (27 hosts criados), `esxi_host` **removida**
  de 420 hosts (volátil por DRS), cirurgia de identidade VS8000319×VS9000319,
  renames ex-"Integrador" 809/811, template Linux agente (44).
- **Diagnóstico consolidado**: Z.8 é o desbloqueador de 5 pendentes (243 hosts
  PowerFlex sem coleta vCenter, 6 dos "cat A", metade dos IPs em falta). Coleta
  com **agente** é ortogonal ao Z.8 — depende da campanha de instalação
  (Linux 71/75 com SSH aberto).
- Detalhe: `inventario/README.md`, `inventario/pendentes.md`,
  `inventario/relatorio-agentes-producao.md`.

## 6. Sequência recomendada (reconciliada, sem duplicar o que existe)

1. **Desbloquear o `BPC DNS Check`** (§4, caminho 2) — fecha o incidente de
   ontem, prova a fonte funcional para DNS, não depende de nada. **Menor esforço,
   maior valor imediato** (responde ao email da Jacira).
2. **Fechar a fonte funcional dos serviços de suporte** (Fase 17.6): replicar
   `service.info` no VS9000007, cobrir NTP, ligar o card `suporte-n2` ao novo
   `net.dns`.
3. **Z.8** — destrava a fonte infra de 243 hosts PowerFlex de uma vez (pedir
   credencial; email já redigido em `z8-email-solicitar-credenciais-vcenter.md`).
4. **Campanha de agente** (fonte SO) — Linux via SSH primeiro (71 hosts).
5. **Credencial `zbx_monitor`** — fecha os 16 hosts BD (fonte funcional BD).
