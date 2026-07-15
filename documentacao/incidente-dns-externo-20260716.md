# Incidente DNS Externo — indisponibilidade intermitente afectando email (2026-07-16)

> **⚠ HANDOFF — estado no fecho desta sessão**: template, macros, hosts e
> triggers estão criados e correctamente configurados no Zabbix, mas **o
> item ainda não está a produzir dados** — erro `Unsupported item key`
> persistente, causa não identificada. Ver §4 antes de continuar.

> Origem: email da equipa (Jacira → Luís/Helder/José Muque, 2026-07-16) reportando
> **2 indisponibilidades do DNS Externo**, com impacto directo em envio/recepção
> de email. Pedido explícito: "garante que este serviço esteja a ser monitorizado
> no zabbix". Resposta técnica de João António aponta a validação pendente na
> Firewall — "é necessário validar se a consulta do DNS externo é enviada para
> os dois endereços" (fora do alcance do Zabbix, ver §5).

## 1. Diagnóstico — porque o Zabbix nunca apanhou isto

`NS3`/`NS4` (hosts `Dns externo - VM - NS3/NS4`, tag `servico=DNS EXTERNO`,
`ambiente=Produção`) tinham **zero monitorização do protocolo DNS**: só
templates genéricos (`VMware Guest`, `Windows by Zabbix agent active`,
`BPC Ping`). Achado adicional: `agent.ping` **nunca teve um valor nos últimos
30 dias** em nenhum dos dois — o agente Windows nunca reportou, mesmo a
monitorização genérica de VM está degradada. Isto já estava listado em
`estado-monitorizacao-producao.md` (linha 79) como parte de ~32 hosts
"nunca antes trabalhados" — candidatos à fila de recuperação de agentes
(Fase 14). A recuperação do agente é trabalho à parte; o check de DNS abaixo
**não depende dele** (corre do lado do servidor Zabbix, sem agente).

## 2. Verificação por protocolo (antes de escrever qualquer coisa no Zabbix)

Consulta directa (`nslookup`) aos dois IPs, sem depender de tags:

| Host | IP | SOA `bpc.ao` | Nota |
|---|---|---|---|
| NS3 | 10.5.0.128 | ✅ responde | serial `2022022821`, bate com o público (`8.8.8.8`) |
| NS4 | 10.5.0.129 | ✅ responde, **1 timeout em 4 tentativas** | reproduz ao vivo o padrão intermitente do email |

Delegação pública confirmada via `8.8.8.8`: `bpc.ao` está delegado exactamente
a `ns3.bpc.ao`/`ns4.bpc.ao` — não há mais nenhum DNS externo autoritativo.

**Levantamento fleet-wide** (608 hosts Infra, por tag+nome+`service.info`) +
teste de protocolo directo nos candidatos encontrados:

| Host | Tipo | IP | Zona | SO | Estado | Prova |
|---|---|---|---|---|---|---|
| NS3 | Externo | 10.5.0.128 | bpc.ao | Windows | Produção | protocolo + delegação pública |
| NS4 | Externo | 10.5.0.129 | bpc.ao | Windows | Produção | protocolo + delegação pública |
| VS9000003 | Interno (AD) | 10.10.240.135 | bpc.intranet | Windows | Produção | protocolo + `service.info` (DNS=running) |
| VS9000007 | Interno (AD) | 10.10.240.133 | bpc.intranet | Windows | Produção | protocolo (zero `service.info` no Zabbix — gap de visibilidade que o protocolo preencheu) |
| VS6000001 | tag diz "DC" | 10.10.227.135 | — | Windows | QA | ⚠️ **não confirmado** — não respondeu SOA de `bpc.intranet`; não incluído na cobertura |
| VS8000004 | tag diz "DC" | 10.10.240.140 | — | Windows | QA, desactivado | não testável |

Nenhum candidato Linux encontrado. Ressalva: esta busca depende de tag/nome/
`service.info` existir — não é prova de que não há mais nenhum DNS escondido
sem qualquer tag (exigiria varrimento de porta, fora do âmbito de hoje).

## 3. O que foi criado no Zabbix (aprovado pelo utilizador 2026-07-16)

**Template `BPC DNS Check`** (templateid `14722`, grupo `Templates/Modules`,
mesmo grupo do `BPC Ping`):

| Elemento | Detalhe |
|---|---|
| Macros | `{$DNS.ZONE}` (default `bpc.ao`) · `{$DNS.TYPE}` (default `SOA`) · `{$DNS.TIMEOUT}` (default `2`s) · `{$DNS.RETRIES}` (default `3`) |
| Item | `net.dns[{$DNS.IP},{$DNS.ZONE},{$DNS.TYPE},{$DNS.TIMEOUT},{$DNS.RETRIES}]` — **Simple check** (sem agente), 1/0, polling 1min. ⚠️ Configurado mas **sem dados** — ver §4 |
| Trigger (por host) | `min(/BPC DNS Check/<key>,3m)=0` — High, exige 3min de falha sustentada (evita alarme por 1 blip, como o timeout isolado visto no NS4) |

**Ligado a 4 hosts**, macro `{$DNS.ZONE}` só sobrescrita nos internos:

| Host | `{$DNS.ZONE}` |
|---|---|
| NS3, NS4 | `bpc.ao` (default do template) |
| VS9000003, VS9000007 | `bpc.intranet` (override por host) |

**2 triggers de correlação** (fora do template — atravessam hosts, criados
directamente): Disaster, disparam só quando **os dois do mesmo par** falham
ao mesmo tempo — é o cenário real do email ("email parou"), não um blip
isolado de um dos dois:
- `AMBOS os DNS Externos (NS3+NS4) indisponiveis` (triggerid `172224`)
- `AMBOS os DNS Internos AD (VS9000003+VS9000007) indisponiveis` (triggerid `172225`)

## 4. HANDOFF — item sem dados, causa não resolvida (fim de sessão 2026-07-16)

**Estado real no Zabbix, confirmado ao vivo:**
- Template `BPC DNS Check` (`14722`) existe, com as 5 macros (`{$DNS.IP}`,
  `{$DNS.ZONE}`, `{$DNS.TYPE}`, `{$DNS.TIMEOUT}`, `{$DNS.RETRIES}`).
- Ligado aos 4 hosts (NS3 `11986`, NS4 `14099`, VS9000003 `10532`,
  VS9000007 `10529`), cada um com `{$DNS.IP}` correcto e `{$DNS.ZONE}`
  correcto (`bpc.ao` para os externos, `bpc.intranet` para os internos).
- **Os 4 items (`543125`-`543128`) estão todos em `state=1`
  (`"Not supported"`), erro `"Unsupported item key."`, `lastclock=0` —
  **nunca produziram um único valor**, apesar de dezenas de re-tentativas
  ao longo de >30 minutos.

**O que já foi eliminado como causa** (para não repetir trabalho):
1. ~~Macro `{HOST.CONN}` a não resolver~~ — trocado por `{$DNS.IP}`
   explícito por host (padrão já usado no projecto, ex. `{$VMWARE.URL}`).
   **Mesmo erro persiste**, exactamente igual, depois da troca.
2. ~~Cache de configuração desactualizada~~ — confirmado que a chave
   armazenada no Zabbix já reflecte a versão nova (`item.get` mostra
   `net.dns[{$DNS.IP},{$DNS.ZONE},...]`), não a antiga.
3. ~~Intervalo de retry mais longo para items "Not Supported" (~10min)~~ —
   esperado >30 minutos com poll a cada 30s, sem qualquer mudança.
4. ~~Simple checks de rede não funcionam nesta instância~~ — descartado:
   `icmpping` (mesmo `interfaceid`) e `net.tcp.service[...]` noutros hosts
   funcionam normalmente (`state=0`), confirmando que o mecanismo geral
   de Simple check está operacional.
5. **Achado intrigante, não explicado**: o item ao nível do próprio
   template (itemid `543124`, "hostid" `14722` = o pseudo-host do
   template) mostra `state=0, error=''` — sem erro — enquanto os 4 items
   herdados nos hosts reais mostram erro idêntico. Não percebido porquê
   esta diferença.

**Não tentado ainda** (ficou bloqueado pelo classificador de segurança —
criar um item de teste extra não estava coberto pela aprovação desta
sessão, correctamente):
- Testar `net.dns[10.5.0.128,bpc.ao,SOA,2,3]` com **IP literal, sem
  macro nenhuma** — isolaria em definitivo se o problema é a expansão de
  macros dentro da chave do Simple check, ou a própria chave `net.dns`
  nesta instância/versão do Zabbix.
- Verificar a versão exacta do Zabbix Server (via `zabbix[version]` ou
  logs do servidor) contra a documentação oficial de `net.dns` — possível
  incompatibilidade de sintaxe entre versões não considerada.
- Consultar `zabbix_server.log` no próprio servidor (sem acesso SSH nesta
  sessão) — o erro "Unsupported item key" costuma vir acompanhado de mais
  detalhe no log do processo poller, que a API não expõe.

**Próximo passo recomendado**: pedir explicitamente para criar o item de
teste com IP literal (passo 1 acima) — é o teste mais decisivo e mais
barato para separar as duas hipóteses restantes.

## 5. Isto resolve a questão do email?

**Ainda não — está desenhado para resolver, mas não está a funcionar.**

- ❌ **Hoje, um alerta ainda NÃO dispara.** O template/items/triggers estão
  configurados correctamente, mas o item está em erro (§4) e nunca produziu
  um valor — enquanto isso não se resolver, esta peça **não cumpre** o
  pedido literal de Jacira ("garante que este serviço esteja a ser
  monitorizado no zabbix"). É trabalho desenhado, não trabalho entregue.
- Quando o item começar a funcionar (§4, próximo passo), **então sim** —
  uma indisponibilidade do DNS Externo passa a disparar um trigger Zabbix,
  algo que não existia antes desta sessão.
- ⚠️ **Mesmo funcionando, não explica *porque* o secundário não assumiu.** O check confirma que
  o Zabbix agora *vê* quando um dos dois falha — não diagnostica a causa-raiz
  (a pergunta original: "o que está na base do secundário não assumir").
  Isso é infra-estrutura de DNS/rede (comportamento de failover client-side,
  TTL, ordem de resolvers), não algo que um trigger resolve sozinho.
- ⚠️ **A validação da Firewall continua pendente**, exactamente como o
  3º email diz — "é necessário validar se a consulta do DNS externo é
  enviada para os dois endereços". O Zabbix testa a partir da rede interna
  do BPC; não prova (nem desmente) que os clientes externos/Internet
  conseguem alcançar ambos os IPs através da Firewall. Isso é trabalho da
  equipa de segurança, não coberto por este template.

## 6. Dashboard e notificações — ainda não

**Não há dashboard nem notificação ligados a isto ainda.** O trigger existe
no Zabbix (visível no painel nativo de problemas de qualquer dashboard que já
liste triggers dos hosts NS3/NS4/VS9000003/VS9000007), mas:
- O card "DNS Externo"/"DNS Interno" no `suporte-n2` (`10-servicos-suporte/n2/l2-cards-servicos.js`)
  ainda só lê `service.info` — não foi actualizado para ler este novo item
  `net.dns`. Continua a mostrar "agente/ping (sem check do serviço em si)"
  até se editar o código do card.
- **Notificação à equipa** (email/Slack/etc.) depende de uma `action` Zabbix
  ligada a estes triggers — não foi criada. E há um bloqueio de fundo já
  documentado no `CLAUDE.md`: o mediatype `Email` está **OFF** desde o
  incidente GLPI (21.878 alertas falhados/7 dias antes disso) — reactivá-lo
  exige o runbook próprio, não uma decisão pontual.

**Pendente, se quiseres fechar o ciclo:**
1. Actualizar `l2-cards-servicos.js` para ler o item `net.dns` nos cards DNS.
2. Decidir o canal de notificação (não necessariamente o mediatype Email
   global — pode ser um canal dedicado/scoped só a estes triggers).
3. Investigar a causa-raiz do failover (fora do Zabbix).
4. Esclarecer `VS6000001` (QA) — tag diz DC, protocolo não confirmou.
