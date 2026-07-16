# Plano do sistema de notificações — BPC Observe

Data: 2026-07-16. Âmbito: as duas instâncias (Zabbix **Infra 7.4** e
**Network 7.0**). Complementa os media types prontos nesta pasta
(`media_*.yaml`) e a pesquisa `provedores-sms-angola.md`.

> Regra do repositório que governa TODO este plano (CLAUDE.md): qualquer
> escrita no Zabbix — e em especial ligar o mediatype Email ou qualquer
> action — exige confirmação explícita do utilizador, caso a caso, com
> avaliação do risco de flood (incidente real: template MSSQL → enxurrada
> de e-mails → tickets em massa no GLPI).

## 1. Estado actual (auditoria só-leitura, 2026-07-16)

### Zabbix Infra (10.10.126.22, 7.4)

| Peça | Estado | Observação |
|---|---|---|
| Mediatype Email (id 1) | **OFF** | Desligado desde o incidente GLPI |
| Mediatypes "Email BPC" (35), "teste_bpcnet" (36) | OFF | Tentativas anteriores |
| Mediatype SMS GSM (id 3) | **ON** | Modem serial — sem modem ligado, inócuo mas enganador |
| Mediatype GLPi webhook (id 33) | OFF | **Já vem na instalação** — é o caminho certo para tickets |
| ~30 webhooks de fábrica (Slack, Teams, Telegram...) | maioria ON | Ativos por defeito, nenhum usado por action — ruído de configuração |
| Action 3 "Report problems to Zabbix administrators" | **ON** | → Email (desligado) |
| Action 7 "Enviar Email" | **ON** | → Email (desligado) |
| Action 9 "Send Notification Email" | **ON** | → Email (desligado); a origem dos 21.878 alertas falhados/7d |
| User groups | Só técnicos (Zabbix administrators, Administrator, IBM) | **Nenhum grupo por domínio/equipa** |
| Users | 22; 17 com media Email ativa (severidades variadas), 0 com SMS/WhatsApp | Números de telefone: nenhum carregado |

**As 3 actions ON martelam um mediatype desligado**: ~3.100 alertas/dia
falhados. Isto é a medida real do volume que qualquer canal novo herdaria
se fosse ligado hoje sem controlo de ruído.

### Zabbix Network (10.10.233.140, 7.0)

| Peça | Estado |
|---|---|
| TODOS os mediatypes | OFF |
| Única action (Report problems) | OFF |
| User groups | Users LDAP (14 membros — **há LDAP/AD ligado**), BPC_SUPPORT_INTERNAL (vazio), Internal |
| Users | 19, **nenhum com media configurada** |

Notificações efetivamente inexistentes na instância Network — que é
justamente a que cobre Rede e Agências (fins de semana!).

## 2. Resposta à pergunta "do lado do Zabbix é tudo?"

Não. Os media types (transporte) são 1 de 5 camadas. Falta construir:

```
[1 Transporte]   media types — FEITO (5 YAML nesta pasta) + Email + GLPi
[2 Destinatários] users/user groups com media atribuída (sendto, horário, severidade)
[3 Roteamento]   actions: condições (grupo de hosts + severidade) → operações → escalation
[4 Controlo de ruído]  dependências de triggers, maintenance, supressão — PRÉ-REQUISITO
[5 Registo]      GLPI via webhook (ticket com ciclo de vida), dashboards visao-notificacoes
```

## 3. Modelo de destinatários (camada 2)

### 3.1 User groups de notificação por equipa (a criar nas 2 instâncias)

Alinhados à taxonomia canónica de 8 grupos DOMINIO
(`documentacao/taxonomia-grupos-tags.md`) — grupo de notificação ≠ grupo de
hosts; o mapeamento é feito nas actions:

| User group (novo) | Domínios cobertos (host groups BPC/DOMINIO/*) | Instância |
|---|---|---|
| `NOTIF/Infraestrutura` | 01 VMware · 02 Armazenamento · 03 Servidores Virtuais · 08 Datacenter Físico | Infra |
| `NOTIF/Redes` | 04 Rede (+ segmentos, agências) | Network |
| `NOTIF/Seguranca` | 05 Segurança | Infra |
| `NOTIF/BasesDados` | 06 Bases de Dados | Infra |
| `NOTIF/Aplicacoes` | 07 APIs e Serviços de Negócio | Infra |
| `NOTIF/Suporte` | 10 Serviços de Suporte | Infra |
| `NOTIF/Plantao-FDS` | transversal — só High/Disaster | ambas |
| `NOTIF/Gestao` | escalation final (chefia) | ambas |

Membros: a definir pelo BPC (nomes/números nunca neste repositório).

**LDAP — estado confirmado (2026-07-16, `authentication.get`/`userdirectory.get`):**
a Network autentica contra o AD (`ldap://vs9000007.bpc.intranet:389`,
base `DC=bpc,DC=intranet`, busca por `sAMAccountName`) — mas é **só login**:
`ldap_jit_status=0` e `provision_media=[]`, ou seja, nenhum dado de
notificação vem do AD. A Infra está 100% em autenticação interna.
Oportunidades:
1. **Replicar o LDAP na Infra** (mesmo host/base DN) — unifica o login.
2. **JIT provisioning com media** (suportado nas duas versões, 7.0/7.4):
   mapear atributos AD → medias (`mail` → Email, `mobile` → SMS/WhatsApp)
   e grupos AD → user groups `NOTIF/*`. O número de telefone passa a viver
   no AD (fonte corporativa), não em edição manual no Zabbix.
3. **Correções recomendadas ao LDAP atual**: o bind é feito com uma conta
   pessoal nomeada (deveria ser conta de serviço) e em LDAP simples na
   porta 389 sem StartTLS (credencial em claro na rede — para um banco,
   usar LDAPS 636 ou StartTLS).

### 3.2 Medias por utilizador — padrão

Cada membro de equipa recebe até 3 medias no mesmo user:

| Media | Send to | When active | Severidades |
|---|---|---|---|
| Email | e-mail corporativo | `1-7,00:00-24:00` | Warning→Disaster |
| WhatsApp (Twilio/Infobip/WeSender) | `whatsapp:+2449XXXXXXXX` | `1-7,00:00-24:00` | High+Disaster |
| SMS (Mimo→fallback) | `+2449XXXXXXXX` | **`6-7,00:00-24:00`** + feriados | High+Disaster |

O requisito original do BPC (fim de semana) entra no *When active* da media
SMS — em semana o canal caro fica calado; o plantão FDS pode ter
`1-7` se for 24×7.

## 4. Matriz severidade × canal (camada 3)

| Severidade | Email | GLPI (ticket) | WhatsApp | SMS | Escalation |
|---|---|---|---|---|---|
| Disaster | ✔ imediato | ✔ imediato | ✔ imediato | ✔ imediato | +15min sem ack → NOTIF/Gestao |
| High | ✔ imediato | ✔ imediato | ✔ imediato | passo 2 (+10min sem ack/recovery) | +30min → NOTIF/Gestao |
| Average | ✔ | ✔ | — | — | — |
| Warning | ✔ (digest/agrupado) | opcional | — | — | — |
| Info/Not classified | — (só dashboards) | — | — | — | — |

### Actions propostas (substituem as 3 actuais)

Uma action por equipa/domínio + uma de plantão, com escalation embutida:

```
ACTION "NOTIF Infraestrutura"
  condições: host group ∈ {01,02,03,08} AND severidade >= Average
  op passo 1        : Email + GLPi → NOTIF/Infraestrutura
  op passo 1 (High+): WhatsApp → NOTIF/Infraestrutura
  op passo 2 (+10m) : SMS → NOTIF/Infraestrutura      (só chega a quem tem
                       a media SMS ativa nesse horário — FDS por defeito)
  op passo 3 (+30m) : Email+SMS → NOTIF/Gestao
  recovery op       : Email + GLPi (fecha o ticket) + WhatsApp
  update op         : GLPi (comenta o ticket com o ack)
```

(idem para Redes/Segurança/BDs/Aplicações/Suporte, mudando condição e grupo)

As actions 3, 7 e 9 atuais devem ser **desligadas e arquivadas** — são
redundantes entre si, sem condição de grupo, e são a fonte dos 21.878
falhados/7d.

## 5. Controlo de ruído — pré-requisito para ligar qualquer canal (camada 4)

Com ~3.100 alertas/dia ninguém pode ligar SMS (custo: a 11 AOA/SMS do
TelcoSMS seriam ~34.000 AOA/dia) nem WhatsApp (a Meta bloqueia remetentes
com spam).

**Distribuição medida (event.get, últimos 7 dias, 2026-07-16):**

| Severidade | Infra | Network |
|---|---|---|
| Disaster | 81 | 0 |
| High | **10.724** | 1.118 |
| Average | 283 | 3.305 |
| Warning | 2.124 | 2.873 |
| Information | 118 | 870 |

O High da Infra (10.724/7d ≈ 1.500/dia) é desproporcional — assinatura
clássica de poucas triggers a "flapar"; identificar o top de ofensores é o
primeiro passo da F1. Antes de ligar canais:

1. **Medir a distribuição real** — feito acima; falta o top de triggers
   ofensoras por `objectid` (leitura, a correr na F0/F1).
2. **Condições de action estritas**: nunca "todos os hosts" — sempre
   grupo DOMINIO + severidade mínima; excluir hosts A-CLASSIFICAR.
3. **Dependências de triggers** (switch pai → agências filhas; vCenter →
   VMs) para 1 causa = 1 alerta, não 1 cascata.
4. **Maintenance windows** com supressão para janelas de patch/backup.
5. **`pause_suppressed=1`** nas actions (não notificar em manutenção).
6. **Triggers "flappers" — top de ofensores MEDIDO (event.get, 7d, 2026-07-16)**:

   **Infra** (13.212 eventos Warn+, 390 triggers; top 15 = 86%):
   | Ofensor | Eventos/7d | Ação proposta |
   |---|---|---|
   | `VS9000312` (VM **SWIFT**) — "(C:) Disk space is low" | **10.295 (78% de TODO o ruído da Infra)** | Diagnóstico (history 24h): não é hover no limiar — é **serra de 29%↔89%** (uso 62→82 GiB em ciclos rápidos; workload escreve/apaga ~20 GiB). **✅ APLICADO 2026-07-16 (aprovado)**: protótipo "Disk space is low" do template `Windows by Zabbix agent active` (341 hosts) alterado — problem `min(pused,30m)>WARN` (persistência) + recovery `max(pused,30m)<WARN-5` (histerese). **✅ CONFIRMADO 2026-07-16 13:02** — trigger sincronizou (LLD) e o flap **parou por completo**: ~59-83 eventos/hora constantes até às 09h, **zero desde então** (4h sem nenhum evento novo, vs média de ~60/h antes). Redução medida: **de ~1.470/dia para 0** nesta trigger especificamente. **Pendente**: reportar à equipa SWIFT o workload cíclico (picos de 89,5% com ~10 GiB livres — risco real de encher; a trigger agora só voltará a disparar se o disco ficar 30 min contínuos acima do limiar, ou seja, um enchimento real) |
   | `svucs020084` (Cisco UCS 6248UP) — temperatura CPU dos blades (6 triggers, chassis 1 e 2) | ~514 | **Investigado a fundo (2026-07-16) — NÃO era ruído de config nem incidente físico, era limiar mal calibrado.** O template oficial `Cisco UCS SNMP` usa fallback genérico `{$TEMP_WARN}=50`/`{$TEMP_CRIT}=60` para TODOS os tipos de sensor (CPU, Ambient, IOH...) por não definir contexto `"CPU"` próprio — bug conhecido e documentado ([ZBX-20027](https://support.zabbix.com/browse/ZBX-20027)). Contra esse limiar genérico, `chassis-2/blade-1/cpu-2` ficou **95,4% do tempo "crítico"** em 7 dias (média 63,5°C, pico 73°C) — mas o spec real da Cisco para CPU de blade é desligamento automático a 82°C e crítico documentado em 86°C (classe B200 M4) — ou seja, o hardware estava operando dentro do normal, só o alarme estava errado. Não foi possível confirmar o modelo exato do blade (Zabbix só regista o Fabric Interconnect `6248UP`, não a blade) — decisão tomada com o utilizador foi aplicar valor conservador provisório. **✅ APLICADO 2026-07-16**: macros de contexto `{$TEMP_WARN:"CPU"}=75` e `{$TEMP_CRIT:"CPU"}=85` criadas **só no host `svucs020084`** (não no template — há um 2º host, `svucs015644`, com o mesmo template e ainda no default genérico, propositalmente não tocado sem confirmação). **✅ CONFIRMADO**: problemas ativos no host caíram de **14 → 0** no primeiro ciclo de polling (3 min) após a mudança — todos eram falso-positivo. **Pendente**: confirmar modelo exato da blade (via UCS Manager) para validar/ajustar os 75/85 definitivamente, e decidir se `svucs015644` recebe a mesma correção |
   | "Memory Pages/sec is too high" (VS9000105, VS8000305, VS9000509, VS8000789...) | ~305 | Limiar legado do template Windows, métrica isolada sem valor de alerta — subir limiar ou desativar no template |
   | Creditquest `VS8000823` "High ICMP ping loss" | 78 | Investigar rede/host; candidata a dependência |

   **Network** (7.303 eventos Warn+, 812 triggers; top 15 = 51%):
   | Ofensor | Eventos/7d | Ação proposta |
   |---|---|---|
   | `SWJAMB00` Fa0/6 "Ligacao de Telefones e PCs" link down | **1.417** | **✅ APLICADO 2026-07-16** — mecanismo oficial do template `Cisco IOS by SNMP` já existe para isto (`{$IFCONTROL:"{#IFNAME}"}=1` controla se a trigger de link-down dispara por interface) mas **nunca tinha sido usado em toda a frota** (0 overrides em 8.323 triggers "Link down" da Network, confirmado por query). Criado `{$IFCONTROL:"Fa0/6"}=0` no host — confirmado: problema saiu da lista de ativos imediatamente (sem esperar poll, a macro é avaliada na condição) |
   | `SWLARG00` Gi1/0/21 `***CENTRAL_INTRUSAO***` link down | 636 | Idem porta de acesso, MAS o nome sugere central de intrusão — **verificar fisicamente o cabo/equipamento** antes de silenciar. **Deliberadamente não tocado** |
   | `SWA-EDS-P0-01` Gi1/0/35 "AREA-COMERCIAL" link down | 100 | **✅ APLICADO 2026-07-16** — `{$IFCONTROL:"Gi1/0/35"}=0`, mesmo mecanismo, confirmado. **Achado de escala**: só este switch tem outras ~8 portas no mesmo padrão `**AREA-COMERCIAL**` (Gi1/0/7,13,16,19,24,26,37,39) ainda instáveis, **deliberadamente não tocadas** — escopo desta rodada foi só os 2 casos do top-15, não uma varredura da frota |
   | `RTLOFIN00`, `RTCACU00`, `RT-PST-POLICIAL`, `RTTEBA00`, `RTZANGO00`... "High ICMP ping response time" | ~1.100 somados | Trigger já usa `avg(...,5m)` (não é flap de amostra única). Diagnóstico por host (history 7d, p50/p90): **`RTLOFIN00` é o único caso de mismatch de baseline** — p50=140ms, p90=232ms, colado no limiar genérico `{$ICMP_RESPONSE_TIME_WARN}=0.15s` (template `Cisco IOS by SNMP`, uniforme para qualquer link Cisco). Os outros 5 (`RTCACU00` p50=4ms, `RT-PST-POLICIAL` p50=31ms, `RTTEBA00` p50=34ms, `RTZANGO00` p50=4ms, `172.22.1.202` p50=32ms) têm baseline rápido e eventos vêm de **picos genuínos pontuais** (máx 600-1000ms) — trigger correta nesses, **não tocados**. **✅ APLICADO 2026-07-16**: override `{$ICMP_RESPONSE_TIME_WARN}=0.3` só no host `RTLOFIN00`, calibrado pelo p90 medido (232ms) + margem — sem informação do tipo de enlace (satélite/rádio/fibra) disponível nesta sessão, calibração feita só por histórico observado. **✅ CONFIRMADO**: 0 eventos novos em 8 min de observação (antes ~5-7/hora) |
   | `DC1-LEAF-103/105` (Nexus 9000) "Temperature above critical" | 254 | **Investigado (2026-07-16) — mesma classe do achado UCS, mais claro ainda.** O template `Cisco Nexus 9000 Series by SNMP` já calibra limiares por tipo de sensor (`CPU=80/90`, `FRONT=70/80`, `BACK=42/70`, `Transceiver=70/75`) — só `module-1 Homewood` (nome padrão do NX-OS, aparece em qualquer `show environment temperature` deste hardware) não tinha regex, caindo no fallback genérico 50/60. Afeta pelo menos 3 dos 7 switches Spine-Leaf (`DC1-LEAF-103`, `-105`, e `-104` com 54 eventos históricos). Leituras reais (7d): média 58°C, pico 67°C — abaixo do que o sensor `CPU` do mesmo hardware já considera seguro. **✅ APLICADO 2026-07-16, no TEMPLATE** (afeta os 7 switches): `{$TEMP_WARN:regex:"Homewood"}=80` e `{$TEMP_CRIT:regex:"Homewood"}=90`, valor por analogia ao sensor `CPU` (sem spec exata do fabricante para "Homewood" especificamente). **✅ CONFIRMADO**: problemas ativos em `DC1-LEAF-104`/`105` caíram para 0 no primeiro ciclo de verificação |

   Ação combinada estimada: Infra 13.212 → ~2.000/7d; High da Infra
   10.724 → ~430/7d. Só depois disto os gates F2+ fazem sentido.

   **Decisão de escala pendente (Network)**: confirmado 8.323 triggers
   "Link down" na frota toda, mecanismo `{$IFCONTROL}` nunca usado antes
   desta sessão. Corrigidos só os 2 casos do top-15 (ver tabela acima) —
   uma varredura/política de classificação porta-a-porta (acesso vs
   uplink, por regex de ifAlias ou por convenção de nomenclatura) para
   o resto da frota fica como decisão do BPC, não executada em massa
   sem revisão humana caso a caso (risco de silenciar um uplink real
   mal rotulado).
7. **Teste canário obrigatório** (regra CLAUDE.md): 1 trigger + 1
   destinatário por canal, validado, antes de alargar a grupos.

## 6. Integração GLPI (camada 5) — sair do email-to-ticket

Mecanismo atual (confirmado em `auditoria-apis-servicos.md §4-bis`): GLPI
abre 1 ticket por e-mail recebido; sem dedup, sem fecho, sem severidade —
foi o incidente. Proposta: **webhook GLPi nativo** (mediatype id 33 na
Infra, id 43 na Network, já instalados):

| | email-to-ticket (atual) | webhook GLPi (proposto) |
|---|---|---|
| Criação | 1 e-mail = 1 ticket | 1 problema = 1 ticket |
| Recovery | novo ticket/nada | **fecha/atualiza o mesmo ticket** |
| Ack/update | — | comenta o ticket |
| Severidade | — | mapeada para prioridade GLPI |
| Requisitos | caixa de e-mail | GLPI ≥ 9.5/10 com API REST ativa, `App-Token` + `user_token` de um user API |

Config do lado GLPI: ativar API REST (Configuração → Geral → API), criar
cliente API (App-Token), user de serviço com perfil que possa criar/editar
tickets, e obter o user_token. Do lado Zabbix: preencher os 3 parâmetros do
mediatype (`glpi_url`, `glpi_token`, `glpi_user_token`) e associar às actions.
O e-mail deixa de ir para a caixa monitorizada pelo GLPI (ou a regra
email-to-ticket é desativada no GLPI) — senão duplica tickets.

## 7. Outros canais possíveis (avaliação)

| Canal | Custo | Esforço | Veredicto |
|---|---|---|---|
| **Telegram** | zero | mínimo (mediatype de fábrica; já existe um "Telegram Zabbix" id 34 na Infra — alguém já tentou) | **Quick win** para canal de equipa NOC; grupo por domínio; não depende de gateway pago. Limite: exige adesão dos técnicos à app |
| MS Teams / Slack | zero (se já houver tenant) | mínimo | Bom para canal de equipa se o BPC usa O365 |
| Ligação de voz (Twilio Voice) | $$ | médio | Último degrau de escalation para Disaster sem ack — considerar fase 2 |
| Mattermost/Rocket.Chat | zero | médio | Só se o BPC hospedar chat interno |
| E2S TelcoSMS (email→SMS) | AOA/SMS | zero código | Contingência: media type Email nativo apontado ao endereço E2S |

## 8. Fases de implementação

| Fase | Conteúdo | Gate de saída |
|---|---|---|
| **F0 — Higiene** | Desligar actions 3/7/9; desligar mediatypes de fábrica não usados (inclusive SMS GSM id 3); medir distribuição de eventos por severidade/grupo | nº de alertas/dia esperado por canal conhecido e aceite |
| **F1 — Ruído** | Dependências de triggers, maintenance windows, ajuste de flappers, condições por grupo DOMINIO | < X alertas/dia High+Disaster (X a acordar; sugerido < 30) |
| **F2 — Email + GLPI** | Importar/preencher webhook GLPi; nova action canário (1 grupo, 1 equipa); reativar Email só nas actions novas | canário validado 1 semana sem flood |
| **F3 — WhatsApp** | Conta WeSender ou template Meta aprovado (Twilio/Infobip); media nos users High+Disaster | entrega comprovada + custo/mês estimado |
| **F4 — SMS FDS** | Conta Mimo confirmada (BPC já é cliente); importar `media_mimo_sms.yaml`/fallback; medias `6-7,00:00-24:00` | teste real num fim de semana |
| **F5 — Escalation** | Passos 2/3 (+SMS, +Gestão), action de plantão, eventual voz | simulacro de incidente sem ack |

Cada passo de escrita no Zabbix é pedido individualmente ao utilizador
(contrato do CLAUDE.md) — este plano não executa nada sozinho.

## 9. Decisões pendentes (utilizador/BPC)

1. Composição real das equipas (quem entra em cada `NOTIF/*`) e números.
2. Plantão FDS: rotativo? 24×7 ou só horário estendido?
3. WhatsApp: WeSender (gerido, local) vs Twilio/Infobip (template Meta próprio)?
4. GLPI: quem cria o App-Token/user API; desativar email-to-ticket?
5. Limiar de ruído aceitável por canal (sugestão: SMS < 10/dia).
6. Telegram como canal de equipa: adotar já na F2 (custo zero) ou não?
7. Instância Network: carregar users por LDAP e replicar as mesmas actions?
