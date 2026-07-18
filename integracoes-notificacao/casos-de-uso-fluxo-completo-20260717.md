# 5 Casos de Uso Reais — fluxo completo de observabilidade BPC

Data: 2026-07-17. Âmbito: **Zabbix Infra 7.4** (10.10.126.22) + **Zabbix
Network 7.0** (10.10.233.140). Cada caso parte de um **incidente/achado real
já documentado** neste repositório e desenha o fluxo completo:

```
[1 Detecção]     items/templates/macros — o que mede e como
[2 Dashboard]    onde o NOC vê (N1→N5, dashboards existentes + gaps)
[3 Alarmística]  triggers calibradas a nível de template (persistência,
                 histerese, dependências, macros de contexto)
[4 Notificação]  user groups NOTIF/* × canais (Email / WhatsApp / SMS) ×
                 escalation — matriz do plano-sistema-notificacoes.md §4
```

> **Regras que governam a execução** (CLAUDE.md + plano §8): nenhuma escrita
> no Zabbix sem confirmação caso a caso; mediatype Email global continua OFF
> (incidente GLPI — 21.878 alertas falhados/7d); qualquer canal novo passa
> primeiro pelo **teste canário** (1 trigger + 1 destinatário); os gates
> F0→F5 do plano aplicam-se a todos os casos abaixo. Este documento é
> desenho, não execução.

Media types de referência (YAML prontos nesta pasta):
`media_mimo_sms.yaml` (SMS Angola, BPC já é cliente Mimo) ·
`media_twilio_sms_whatsapp.yaml` / `media_infobip_sms_whatsapp.yaml`
(WhatsApp+SMS internacional) · `media_wesender_multicanal.yaml` ·
`media_telcosms_sms.yaml` (contingência email→SMS). Email = mediatype
nativo (a reativar só nas actions novas, nunca nas 3/7/9 antigas).

---

## CASO 1 — DNS Externo indisponível (Infra · 10 Serviços de Suporte)

**Histórico real** (`documentacao/incidente-dns-externo-20260716.md`): a
equipa reportou por email 2 indisponibilidades do DNS Externo com impacto
directo no email corporativo — e o Zabbix **nunca apanhou nada**, porque
NS3/NS4 só tinham templates genéricos (VMware Guest + agente que nunca
reportou). O pedido literal foi *"garante que este serviço esteja a ser
monitorizado no zabbix"*. O secundário (NS4) reproduz timeouts intermitentes
ao vivo.

### 1. Detecção
| Peça | Estado | Detalhe |
|---|---|---|
| Template `BPC DNS Check` (14722) | ✅ criado | macros `{$DNS.IP}`/`{$DNS.ZONE}`/`{$DNS.TYPE}`/`{$DNS.TIMEOUT}`/`{$DNS.RETRIES}` |
| Item `net.dns[...]` | ✅ **corrigido 2026-07-17** | era o bug: criado como Simple check, `net.dns` é item de **Zabbix agent**. Agora corre no host-prober `BPC DNS Prober` (14752) contra o agente do próprio server — `state=0`, coleta 1/min |
| DNS internos (DCs `VS9000003`/`VS9000007`, zona `bpc.intranet`) | ✅ validado (`[s|1]`) | prober-no-server funciona — **alargar já** (item VS9000007 + triggers) |
| DNS externos (NS3/NS4, `10.5.0.x`) | ⏸ bloqueado por firewall | server não alcança `10.5.0.x:53` (provado por SSH: `dig` timeout UDP+TCP). Item NS3 fica como **canário sem trigger** até a rede abrir 53/UDP+TCP ou existir prober noutro segmento |

### 2. Dashboards
- `suporte-n2` (pasta `10·Serviços de Suporte`): actualizar
  `l2-cards-servicos.js` — os cards "DNS Externo"/"DNS Interno" ainda lêem
  só `service.info`; passam a ler o item `net.dns` (verde=1, vermelho=0,
  cinzento=canário sem dados). Gap conhecido, registado no incidente §6.
- N1 v3.0: o card "Serviços de Suporte" (problem.get por tags) apanha
  automaticamente os novos triggers — sem alteração.
- **Novo painel** no `suporte-n2`: mini-histórico 24h dos 4 checks DNS
  (timeseries nativo 1/0) — mostra a intermitência do NS4 que originou o
  incidente, coisa que um estado instantâneo esconde.

### 3. Alarmística (calibrada)
| Trigger | Expressão | Severidade | Racional |
|---|---|---|---|
| Por host (template) | `min(/BPC DNS Check/net.dns[...],3m)=0` | High | 3 min sustentados — o timeout isolado visto no NS4 **não** alarma (anti-blip, mesmo padrão da histerese aplicada ao disco SWIFT) |
| Correlação par interno | AMBOS `VS9000003`+`VS9000007` a 0 (172225) | **Disaster** | é o cenário do incidente real ("email parou"), não um nó do par |
| Correlação par externo | AMBOS NS3+NS4 a 0 (172224) | **Disaster** | **só activar depois do canário NS3 passar a 1** — senão é alarme falso permanente |
| Dependência | triggers por host **dependem** da trigger de correlação | — | 1 causa = 1 alerta: quando o par inteiro cai, o NOC recebe 1 Disaster, não 2 High + 1 Disaster |

Nota operacional já provada: o próprio Zabbix server resolve via o DC
`VS9000003` — se esse DC cair, o server perde DNS interno. A trigger do par
interno é, na prática, também auto-protecção da plataforma.

### 4. Notificação
| Passo | Canal | Destino |
|---|---|---|
| Imediato (High) | Email + ticket GLPI (webhook id 33, nunca email-to-ticket) | `NOTIF/Suporte` |
| Imediato (Disaster) | + WhatsApp | `NOTIF/Suporte` |
| +15 min sem ack (Disaster) | Email + SMS (Mimo) | `NOTIF/Gestao` |
| Fim de semana | SMS activo por *When active* `6-7,00:00-24:00` na media | `NOTIF/Plantao-FDS` |
| Recovery | Email + WhatsApp + fecho do ticket GLPI | mesmos grupos |

Racional do canal: DNS externo em baixo = email corporativo em baixo — o
**Email como único canal seria notificar a avaria pelo próprio serviço
avariado**. Este caso é o argumento mais forte do projecto para WhatsApp/SMS.

### Pendências para fechar o ciclo
1. Alargar item+triggers aos DCs (aprovação de escrita pendente).
2. Escalação rede/segurança: abrir 53/UDP+TCP `10.10.126.22 → 10.5.0.128-129`.
3. Editar `l2-cards-servicos.js` (local→push com confirmação).
4. Canário de notificação: trigger do par interno + 1 destinatário.

---

## CASO 2 — Serviço de negócio web em Disaster silencioso (Infra · 07 APIs e Serviços de Negócio)

**Histórico real** (`plano-sistema-notificacoes.md §0.1`): em 2026-07-16
foram encontrados **9 serviços de negócio em Disaster**, alguns há 6-7 dias —
incluindo o **BNA Angola RTGS (SPTR), 503 real durante 6 dias, sem aviso a
ninguém** (commit `aaa3c10`). Causa-raiz dupla: (a) mediatype Email OFF desde
o incidente GLPI ⇒ zero notificações; (b) **pool de HTTP pollers do server
saturado a 100%** há ≥7 dias (~13.300 itens em fila) ⇒ metade dos "down" são
ambíguos entre serviço em baixo e poller sem capacidade. Histórico anterior
do mesmo domínio: o bug do `count()` sem `#` na trigger L1 (a macro tinha de
conter o `#`; a trigger nunca disparava — memória do projecto), e o SMS
Banking 8h em recusa de ligação apanhado na validação da Fase 7.0.12.

### 1. Detecção
- **Fonte**: template único `BPC Web Monitoring v2` — 40+ hosts sintéticos
  `app-*` (tags `tipo`/`servico`/`vm`/`ip`), web scenarios L1 (disponibilidade)
  a L4 (transacção), `webitems:true` obrigatório ao ler via API.
- **Pré-requisito de infra-estrutura (sem ele, tudo o resto mente)**:
  aumentar `StartHTTPPollers` (e avaliar `StartPingers`, a 50%) no
  `zabbix_server.conf` — acção do dono do servidor, com janela. Depois do
  fix, **re-auditar os 9** para separar "genuinamente down" de artefacto de
  fila (só o BNA 503 está provado como sinal real).
- **Meta-detecção nova** (o que faltou): o próprio server já expõe
  `zabbix[process,http poller,avg,busy]` e `zabbix[queue,10m]` — ver Caso 5.

### 2. Dashboards
- Já existem e validados ao vivo (Fase 7.0.12): `apis-n2` (tabelas MySQL
  suppression-aware, 1:1 com o Zabbix), `apis-n3` (cartões de
  disponibilidade — lição: params de funções do datasource têm de ser
  strings), `apis-n4-sistema` (ficha por sistema, departamentos reais).
- `visao-notificacoes` (Fase 17.2): é o dashboard que **expôs a cadeia
  partida** (action 9 ON → mediatype OFF = 100% falhas) — mantém-se como
  painel de saúde da própria cadeia de notificação deste caso.
- Gap a fechar: cartão "estado do colector" no `apis-n2` — se o http poller
  está >75%, os cartões L1 exibem selo "medição degradada" em vez de
  vermelho enganador (os dados para isso já existem, ver Caso 5).

### 3. Alarmística (calibrada)
| Trigger | Desenho | Racional |
|---|---|---|
| L1 site down (template) | `count(/host/web.test.fail[...],#{$WEB.FAIL.COUNT})={$WEB.FAIL.COUNT}` com a macro a **conter o `#`** | bug histórico: sem `#` o parâmetro é segundos e a trigger nunca dispara; `find("required pattern")` separa conteúdo-errado de site-down |
| Severidade por criticidade | `servico` crítico (RTGS/SPTR, SMS Banking, eBankit) = Disaster; restantes = High | os 50 sistemas do relatório diário já estão classificados (`reconciliacao-50-sistemas-excel.md`) — a severidade segue o negócio, não o default |
| Dependência da plataforma | TODAS as triggers L1 dependem da trigger "http poller >75% durante 30m" do server | quando o colector satura, o NOC recebe **1 alarme de plataforma**, não 40 Disasters de negócio falsos — é exactamente o erro de leitura de 2026-07-16 |
| Persistência | 6+ falhas consecutivas mantém-se, mas só conta **depois** do fix de capacidade | hoje as falhas consecutivas podem ser timeouts do próprio poller |

### 4. Notificação
| Passo | Canal | Destino |
|---|---|---|
| Disaster imediato | Email + GLPI + WhatsApp + SMS | `NOTIF/Aplicacoes` |
| High imediato | Email + GLPI + WhatsApp | `NOTIF/Aplicacoes` |
| +15 min sem ack (Disaster) | Email + SMS | `NOTIF/Gestao` — um RTGS do banco central 6 dias em baixo **tem** de subir à chefia sozinho |
| Recovery/ack | fecha/comenta o ticket GLPI | — |

Action `NOTIF Aplicacoes`: condição `host group = BPC/DOMINIO/07` AND
severidade ≥ High AND `pause_suppressed=1`. As actions 3/7/9 antigas ficam
OFF e arquivadas (fonte dos 21.878 falhados).

### Pendências
1. `StartHTTPPollers` (dono do servidor, janela) → re-auditoria dos 9.
2. Verificação independente (curl externo) dos 5 do Grupo A — o BNA 503 já
   está confirmado como resposta real.
3. Auditar as macros L1 de todos os `app-*` para o padrão `#` correcto.
4. Canário: `app-` do site institucional + 1 destinatário WhatsApp, 1 semana.

---

## CASO 3 — Agência offline vs. ruído de porta de acesso (Network · 04 Rede / 04.1 Agências)

**Histórico real** (`triagem-alarmes-ativos-20260716.md`): a Network tinha
**953 problemas activos**, dos quais **~875 (92%) são ruído estrutural** —
595 "Interface Link down" de portas de acesso mortas (PC desligado, porta
vaga) e 265 "lower speed", alguns com 210+ dias. No meio desse ruído
escondiam-se sinais reais: **32 agências offline por ICMP** (28 recentes —
padrão nocturno de energia a confirmar; 6 crónicas), fans avariados em 6
routers há 55-225 dias, e um PSU/fan de switch **do core do datacenter
avariado há 339 dias**. A instância Network tem hoje **zero notificação
configurada** — e é justamente a que cobre agências ao fim de semana, o
requisito original do BPC.

### 1. Detecção
- Routers de agência: `icmpping`/`icmppingsec` (template Cisco IOS by SNMP) —
  já colecta; é a fonte de verdade "agência viva".
- Interfaces: LLD SNMP com triggers de link-down por interface — o mecanismo
  de controlo **já existe no template oficial e nunca tinha sido usado**:
  `{$IFCONTROL:"<ifname>"}=0` desliga a trigger por porta (provado ao vivo
  2026-07-16 em `SWJAMB00 Fa0/6`, 1.417 eventos/7d → 0 imediato).
- Energia/ambiente: sensores de fan/PSU/temperatura SNMP — já colectam; o
  problema era estarem enterrados no ruído.

### 2. Dashboards
- Fluxo canónico já construído: N2 Rede → `rede-n3` Agências (**geomap** —
  32 pontos vermelhos saltam à vista) → `n4-agencia-detalhe` (triagem NOC) →
  `n5-agencia-interfaces` (só interfaces do router).
- O geomap N3 é o dashboard-resposta ao padrão nocturno: de manhã vê-se em
  10 segundos se as 28 recuperaram ou não — sem abrir 28 problemas um a um.
- Gap: painel "crónicas" no N3 (idade >7d) para separar as 6 agências-caso-
  de-inventário das quedas operacionais do dia.

### 3. Alarmística (calibrada)
| Mecanismo | Aplicação | Base histórica |
|---|---|---|
| Política `{$IFCONTROL}` por classe de porta | alertar link-down **só** em uplinks/WAN (regex de ifAlias: `*UPLINK*`, `Tu*`, `WAN*`) — via filtro no LLD ou prototype; portas de acesso ficam em silêncio | 595 falsos activos; 8.323 triggers link-down na frota, 0 overrides antes de 2026-07-16. **Requer convenção de ifAlias com a equipa de redes — não executar em massa sem revisão** (risco: silenciar um uplink mal rotulado; caso `SWLARG00 Gi1/0/21 CENTRAL_INTRUSAO` deliberadamente não tocado) |
| Dependências router→resto | trigger ICMP do router de agência é **pai** de todas as triggers do switch/interfaces dessa agência | agência caiu = 1 alerta, não cascata |
| Calibração por baseline medido | `{$ICMP_RESPONSE_TIME_WARN}` por host só quando o p50/p90 histórico o justifica (caso real: `RTLOFIN00` p50=140ms colado no default 0.15s → override 0.3s; os outros 5 routers do padrão **não** tocados, os picos deles eram genuínos) | aplicado e confirmado 2026-07-16: 0 eventos em 8 min (antes 5-7/h) |
| Janela nocturna | se se confirmar o padrão "agência desliga energia à noite": maintenance window com supressão por grupo de agências afectadas + `pause_suppressed=1` na action | 22 das 28 quedas eram ~22h30 de Angola |
| Hardware ambiente | fan/PSU = High com persistência 10m; sem dependência (não podem ficar atrás do ruído outra vez) | PSU do core 339 dias ignorado |

### 4. Notificação
| Cenário | Canal | Destino |
|---|---|---|
| Agência down (High, fora de maintenance) | Email + GLPI + WhatsApp | `NOTIF/Redes` |
| Agência down ao FDS | + SMS (media *When active* `6-7,00:00-24:00`) | `NOTIF/Plantao-FDS` — **é o requisito que originou todo o plano de SMS** |
| ≥N agências down em simultâneo (correlação) | Disaster imediato, todos os canais | `NOTIF/Redes` + `NOTIF/Gestao` — cheiro de falha de transporte/energia regional, não de 1 agência |
| Hardware (fan/PSU/temp) | Email + GLPI (ticket é o que garante que não morre esquecido 339 dias) | `NOTIF/Redes` |

Pré-requisito absoluto (síntese da triagem): **limpar os ~875 primeiro** —
ligar qualquer canal na Network hoje despejaria o backlog inteiro nos
destinatários e queimaria a credibilidade do canal no primeiro dia.

### Pendências
1. Convenção de ifAlias + política link-down com a equipa de redes.
2. Confirmar padrão nocturno das 28 (observar 2-3 manhãs no geomap).
3. Escalar o PSU/fan do core (339d) e os 6 fans de agência — hardware.
4. Users da Network sem nenhuma media configurada: carregar medias nos
   `NOTIF/*` (idealmente via LDAP JIT — o AD já está ligado para login).

---

## CASO 4 — Capacidade de datastore VMware esgotando em silêncio (Infra · 01 Infraestrutura VMware)

**Histórico real** (`triagem-alarmes-ativos-20260716.md` §A-Infra): **~157
alarmes "Datastore free space critically low" activos há mediana de 74
dias** — capacidade de produção (Data-DBS, Data-APP, Veeam-Backup...) a
esgotar-se há 2,5 meses sem resposta. A contagem real é ~15-20 datastores
únicos: **cada datastore partilhado alerta em cada hypervisor que o monta
(~6×)**, o que transforma um problema de capacidade legítimo em ruído que
ninguém lê. Agravante histórica: parte da frota ESXi nem colecta (Z.8 —
`{$VMWARE.URL}`/credenciais erradas em 2 dos 3 vCenters, password root ESXi
expirada desde a auditoria de 2026-07-07).

### 1. Detecção
- Items `vmware.hv.datastore.*` via vCenter (grupo 603, 20 ESXi reais;
  lição da Fase 1.24: o grupo 608 são VMs/appliances, **não** ESXi).
- Pré-requisito de cobertura: fechar Z.8 — sem credencial válida no
  PowerFlex/vCenter02, um terço da frota está cego para capacidade.
- Complemento por VM: discos de guest criticamente cheios (16 activos,
  53-91d) já vêm do template Windows/Linux por agente.

### 2. Dashboards
- N2 VMware (`a967e936`): cards por vCenter com clusters — acrescentar
  coluna "pior datastore %" por cluster (dado já disponível).
- N3 vCenter: tabela de datastores único-por-datastore (não por hypervisor)
  com % usado, tendência 7d e dias-até-cheio estimados — é a vista que
  faltou durante os 74 dias.
- `vm-n3-ficha` (N3 canónico das VMs): já mostra discos do guest.

### 3. Alarmística (calibrada)
| Mecanismo | Desenho | Base histórica |
|---|---|---|
| **De-duplicação** | alarme de datastore só **1× por datastore** — dependência das triggers por-hypervisor para uma trigger única ao nível do vCenter, ou desactivar o prototype por-HV e manter só a agregada | 157 activos → ~15-20 reais; é a acção dupla já proposta na triagem |
| Persistência + histerese | problem `min(pused,30m)>{$WARN}` · recovery `max(pused,30m)<{$WARN}-5` | padrão **provado em produção 2026-07-16** no disco SWIFT `VS9000312`: serra 29%↔89% gerava 78% de todo o ruído da Infra (10.295 eventos/7d); depois do fix no template (341 hosts), **0 eventos** — e a trigger continua a apanhar enchimento real (30 min sustentados) |
| Limiar por contexto | `{$VFS.FS.PUSED.MAX.CRIT:"<datastore>"}` para datastores com perfil próprio (Veeam-Backup enche por design durante janelas de backup) | mesmo racional dos limiares por contexto UCS/Homewood |
| Exclusões estruturais | `{$VFS.FS.FSNAME.NOT_MATCHES}` para volumes temporários EMC NetWorker (`nsr\tmp`, BBBMountPoint) | 6 falsos positivos estruturais identificados na triagem |
| Preditiva (fase 2) | trigger em `timeleft()` <14 dias para datastores de produção | transforma "está cheio" (reactivo) em "vai encher a 3 de Agosto" (planeável) — é o que 74 dias de alarme ignorado provam ser necessário |

### 4. Notificação
| Cenário | Canal | Destino |
|---|---|---|
| Datastore ≥ crítico (High, dedup) | Email + GLPI | `NOTIF/Infraestrutura` |
| `timeleft` < 14d (Average) | Email (digest) | `NOTIF/Infraestrutura` |
| Datastore de produção cheio a 95%+ (Disaster) | + WhatsApp + SMS | `NOTIF/Infraestrutura`; +30m sem ack → `NOTIF/Gestao` |
| Recovery | fecha ticket GLPI | — |

Este caso é o argumento para o **ticket GLPI como canal primário**: um alarme
de capacidade não é urgência de madrugada (não precisa de SMS imediato), mas
**precisa de dono e ciclo de vida** — exactamente o que 74 dias de alarme
sem resposta mostram que o dashboard sozinho não garante.

### Pendências
1. Decisão do modelo de dedup (dependência vs prototype agregado) — 1
   escrita de template, pedir aprovação com dry-run.
2. Fechar Z.8 (credenciais vCenter) para cobertura total.
3. Escalar a lista real de ~15-20 datastores à equipa de virtualização.

---

## CASO 5 — O vigia às escuras: auto-monitoração das duas plataformas Zabbix (Infra + Network · 10 Serviços de Suporte)

**Histórico real — dois incidentes distintos provam o mesmo gap:**
1. **Disco cheio no Zabbix Network, 2026-07-13**
   (`incidente-disco-cheio-zabbix-network-20260713.md`): `/` a 100% no
   `VS8000932` por binlogs MySQL com retenção default de 30 dias
   (~123 GB). InnoDB em stall de escrita, dashboards pendurados, **e nenhum
   alerta — porque nada "caiu"**: serviços todos `running`, API a responder.
   Já era a **3ª ocorrência** (Fev e Abr 2026) e a "solução" anterior tinha
   sido copiar binlogs para o `/home` (152 GB ainda lá).
2. **HTTP pollers da Infra saturados a 100% durante ≥7 dias** (Caso 2): o
   server tinha as próprias triggers de auto-diagnóstico activas ("http
   poller >75%", "value cache low memory 29d", ">1000 items sem dados
   29d") — **ninguém as viu**, enterradas nos 398 activos, e sem notificação.

O padrão comum: a plataforma que vigia tudo **não tem ninguém a vigiá-la**,
e o modo de falha dela é silencioso (degradação, não queda).

### 1. Detecção
| Sinal | Item | Instância |
|---|---|---|
| Disco do servidor BD | `vfs.fs.size[/,pused]` no `VS8000932` + tamanho de `/var/lib/mysql` | Network (e espelho na Infra) |
| Retenção de binlog | item calculado/script: idade do binlog mais antigo vs `binlog_expire_logs_seconds` (agora 172800s — confirmar que persiste) | Network |
| Saturação de pollers | `zabbix[process,http poller,avg,busy]` · `zabbix[process,icmp pinger,avg,busy]` | ambas |
| Fila | `zabbix[queue]` · `zabbix[queue,10m]` | ambas |
| Value cache | `zabbix[vcache,buffer,pused]` + modo low-memory | Infra (já disparou 29d) |
| Frescura de escrita real | query MySQL: atraso do último valor em `history_uint` (validação usada no incidente: 4s saudável) | ambas, **cruzada**: a Infra vigia a Network e vice-versa |
| Cadeia de notificação | nº de alertas falhados/dia (tabela `alerts` via MySQL — o `action.get` é bloqueado no proxy) | ambas |

O último ponto fecha o círculo: foi o dashboard `visao-notificacoes` a
descobrir os 21.878 falhados — este caso transforma esse achado num
**alarme**, para nunca mais ser descoberto por acaso.

### 2. Dashboards
- `visao-notificacoes` (Fase 17.2) já mostra a cadeia
  action→mediatype→entregas via MySQL — é o N2 natural deste caso.
- **Novo**: painel "Saúde da Plataforma" (no `suporte-n2` ou dashboard
  próprio na pasta 10): disco dos 2 servers, busy% dos pollers, fila,
  vcache, atraso de escrita das 2 instâncias, alertas falhados/dia. Oito
  números que teriam apanhado **os dois incidentes com dias de avanço**.
- Runbooks já escritos ficam linkados no painel: o de disco cheio
  (diagnóstico sem SSH via health dos datasources) e o do plugin Grafana
  pós-corte de energia (`incidente-plugin-zabbix-grafana-20260710.md`).

### 3. Alarmística (calibrada)
| Trigger | Desenho | Racional histórico |
|---|---|---|
| Disco server ≥80% | Average, `min(30m)` | aos 80% ainda há semanas de binlog pela frente — é aviso planeável |
| Disco server ≥90% | **Disaster**, `min(10m)` | aos 100% até o `PURGE BINARY LOGS` falha (ovo-e-galinha provado no incidente — errno 28); 90% é o último ponto em que a correcção é trivial |
| http poller busy >75% durante 30m | High | já existia e estava activa — o que faltou foi **notificação**; passa a ser a trigger-mãe das dependências do Caso 2 |
| `zabbix[queue,10m]` > limiar calibrado | High | baseline medido: p50=4.421 em regime saturado — calibrar o limiar **depois** do fix de `StartHTTPPollers`, senão nasce em alarme permanente |
| Atraso de escrita history > 5m (check cruzado) | **Disaster** | é o único sinal que sobrevive ao modo de falha real: no incidente, serviços UP + API OK + escrita morta. Por isso é a **outra instância** que o mede |
| Alertas falhados > 100/dia | High | teria denunciado a cadeia partida no dia 1, não meses depois |

### 4. Notificação
| Cenário | Canal | Destino |
|---|---|---|
| Qualquer Disaster de plataforma | WhatsApp + SMS **imediatos**, das duas instâncias | `NOTIF/Suporte` (admins Zabbix) |
| High de plataforma | Email + GLPI + WhatsApp | `NOTIF/Suporte` |
| Escalation +15m | SMS → `NOTIF/Gestao` | — |

Regra especial deste caso: **nunca confiar num único caminho**. Se a Infra
degrada, é a action da Network que notifica (check cruzado) — e vice-versa.
O e-mail nunca é o único canal aqui, pelo mesmo motivo do Caso 1: a peça
avariada pode ser parte do próprio caminho do e-mail.

### Pendências
1. Confirmar `SET PERSIST binlog_expire_logs_seconds=172800` sobreviveu
   (leitura SQL) + decisão sobre os 152 GB órfãos no `/home`.
2. Criar os items de check cruzado (escrita nas 2 instâncias — aprovação).
3. `StartHTTPPollers` (partilhado com o Caso 2) → depois calibrar fila.
4. Canário: trigger de disco ≥80% do VS8000932 + 1 destinatário.

---

## Síntese — o que os 5 casos têm em comum

| # | Caso | Instância | Domínio | Incidente-origem | Canal decisivo |
|---|---|---|---|---|---|
| 1 | DNS Externo | Infra | 10 Suporte | 2 quedas DNS afectando email (2026-07-16) | WhatsApp/SMS (email é a vítima) |
| 2 | Serviço web Disaster silencioso | Infra | 07 APIs/Negócio | BNA RTGS 503, 6 dias sem aviso | Escalation à gestão |
| 3 | Agência offline vs ruído | **Network** | 04 Rede/Agências | 953 activos, 92% ruído; 32 agências down | SMS fim-de-semana |
| 4 | Datastore esgotando | Infra | 01 VMware | 157 alarmes ignorados 74 dias | Ticket GLPI com dono |
| 5 | Plataforma às escuras | **ambas** | 10 Suporte | Disco 100% Network + pollers 100% Infra | Check cruzado, nunca 1 caminho |

**Ordem de execução recomendada** (segue os gates F0→F5 do plano):
o Caso 5 primeiro (sem plataforma saudável, os outros 4 medem mal), depois
3-F0 (limpar os 875 da Network) e 2-pré-requisito (`StartHTTPPollers`), e
só então os canários de notificação de cada caso — 1 trigger + 1
destinatário + 1 semana de observação antes de alargar a cada grupo
`NOTIF/*`. Toda a escrita no Zabbix continua a ser pedida caso a caso.
