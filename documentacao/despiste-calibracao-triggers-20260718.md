# Despiste e calibração de triggers — varrimento dos 10 domínios (2026-07-18)

> Sequência do pedido: "garantir que não é falha na calibração dos triggers
> nem falsos positivos", domínio a domínio, começando pelos 9 serviços de
> negócio em Disaster. **Sessão 100% de leitura** — nenhuma escrita no
> Zabbix; todas as correcções propostas ficam pendentes de aprovação caso a
> caso. Continua a triagem de `integracoes-notificacao/triagem-alarmes-ativos-20260716.md`
> com verificação ao vivo + testes independentes fora do Zabbix.

**Metodologia do despiste (3 vias, por problema):**
1. **Expressão da trigger** expandida (`trigger.get` + `expandExpression`) —
   procurar bugs de construção (ex.: o histórico `count()` sem `#`).
2. **Histórico real do item** (`history.get`, 48h+, por hora) — frescura da
   coleta (mata/confirma a hipótese "artefacto do poller saturado") e padrão
   temporal (contínuo vs janela vs flap).
3. **Verificação independente** fora do Zabbix (curl/TCP daqui da estação) —
   separa "serviço em baixo para todos" de "bloqueio no caminho do server".

---

## 1. DOMÍNIO 07 · APIs e Serviços de Negócio (despiste completo)

Estado no arranque: 9 Disaster + 12 High (ICMP) = 21 problemas High+.

### 1.1 As triggers estão bem construídas — o bug histórico está corrigido

Expressão real dos 9 (todas iguais, do template `BPC Web Monitoring v2`):
```
count(/host/web.test.fail[L1-Disponibilidade],#6,"eq","1")=6
  and find(/host/web.test.error[L1-Disponibilidade],,"like","Response code")=0
```
- ✅ `count(...,#6,...)` tem o `#` — o bug "sem # = segundos" (que fazia a
  trigger nunca disparar) está corrigido nestes 9.
- ✅ Items frescos: `lastclock` de segundos atrás, coleta 1/min — **descarta
  em definitivo a hipótese "artefacto do poller saturado"**: os checks
  executam e devolvem erros reais do destino (timeout de 30s contado,
  connection refused, resposta 503 completa, handshake TLS iniciado).
- ⚠️ **Bug latente encontrado**: a condição `find(...,"like","Response code")=0`
  (que devia separar "código errado" de "site em baixo") **nunca casa** — o
  texto real do erro do Zabbix é minúsculo: `response code "503" did not
  match any of the required status codes`. O `like` é case-sensitive, logo a
  condição é sempre verdadeira e a separação está morta. Consequência: um
  mero código inesperado (ex. 307) dispararia "indisponível" Disaster.
  **Correcção proposta** (template, 1 mudança): `"Response code"` →
  `"response code"` (ou `"status codes"`).

### 1.2 Veredicto dos 9 Disaster — teste independente (curl desta estação)

| Serviço | Do Zabbix server | Daqui (independente) | **Veredicto** |
|---|---|---|---|
| SMS Banking (`10.10.238.214:8091`, interno) | Connection refused | **Connection refused** | 🔴 **REAL — 8+ dias.** Serviço interno não está à escuta na porta. Escalar já ao dono |
| EMP (`213.131.67.206/login`) | Timeout 30s | **Timeout** | 🔴 **REAL — 8+ dias**, 24/7 (100% de falha em todas as horas de 48h) |
| INSS Portal BPC (`bpc.inss.gov.ao`) | Timeout 30s | **Timeout** | 🔴 **REAL — 6+ dias**, 24/7 |
| BNA RTGS SPTR (`sptrtst247.bna.ao`) | HTTP 503 | **HTTP 503** | 🟠 **REAL, MAS**: a URL é `sptr`**`tst`**`247` — **ambiente de TESTE do BNA**, não produção. 503 de 7 dias num TST é plausível/benigno. Confirmar com o dono qual é o alvo certo antes de tratar como incidente de negócio |
| BPC.AO site público | SSL_ERROR_ZERO_RETURN | **HTTP 200 OK** | 🟡 **FALSO POSITIVO nocturno** (ver 1.3) |
| INSS Portal Público (`inss.gov.ao`) | SSL_ERROR_ZERO_RETURN | **HTTP 200 OK** | 🟡 Falso positivo nocturno **+ 1 queda real já recuperada** (16/07 10h30 → 17/07 ~15h, bate com o registo do dia 16) |
| Mundial Seguro (`.pt`) | SSL_ERROR_ZERO_RETURN | **HTTP 200 OK** | 🟡 Falso positivo nocturno |
| Pumangol (`.pt`) | SSL_ERROR_ZERO_RETURN | **HTTP 200 OK** | 🟡 Falso positivo nocturno |
| SAP Cloud (`.ondemand.com`) | SSL_ERROR_ZERO_RETURN | **HTTP 301** (válido: codes=200,301,302) | 🟡 Falso positivo nocturno |

### 1.3 Causa-raiz dos 5 falsos positivos: janela nocturna de firewall 22h→07h

Histórico por hora (48h, `web.test.fail`) dos 5 com `SSL_ERROR_ZERO_RETURN`:
**padrão idêntico e perfeito** — 100% de falha das ~22:00 às ~07:00, 0% todo
o dia, todos os dias. O "Grupo B caiu em simultâneo às 22:16:20" do registo
de dia 16 era simplesmente o início da janela dessa noite.

- Não é queda dos 5 destinos (confirmados UP daqui, destinos sem nada em
  comum: .ao, .pt, SAP cloud).
- É **política nocturna no caminho de saída do Zabbix server** (firewall/
  proxy a cortar TLS — o TCP liga, o handshake morre: assinatura
  `SSL_ERROR_ZERO_RETURN`).
- Mesma classe de problema do incidente DNS (o server não alcança
  10.5.0.x:53): a **posição de rede do server** tem restrições de egress
  que os utilizadores reais não têm.

**Correcções propostas:**
1. **Escalar à equipa de rede/segurança**: egress TLS do `10.10.126.22`
   bloqueado ~22h-07h — é política deliberada? O monitor externo precisa de
   saída estável 24/7 (ou de um prober noutro segmento).
2. **Entretanto, no Zabbix (aprovação pendente)**: criar 1 check canário de
   egress (URL externa estável) e pôr as triggers L1 dos alvos externos
   **dependentes** da trigger do canário → nas noites bloqueadas o NOC
   recebe 1 alarme honesto ("saída TLS do server bloqueada"), não 5
   Disasters de negócio falsos.

### 1.4 Os 12 High "ICMP ping" de 56 dias — falso positivo estrutural

São os nós dos clusters OpenShift (9× `ibm-cp-*` do OCP/IBM Cloud Pak + 3×
`VS800098x` do OKD) com a **interface Zabbix apontada a IPs `10.128–131.x.x`
— a rede interna de pods do OpenShift** (CIDR `10.128.0.0/14`), que não é
routável a partir do Zabbix. Há até IPs repetidos entre hosts de clusters
diferentes (`VS8000982` e `ibm-cp-worker-04` ambos `10.131.0.2`;
`VS8000984` e `ibm-cp-worker-05` ambos `10.129.2.2`) — prova de que são
endereços de overlay, não de máquina. Ping a estes IPs **nunca** poderia
funcionar. Origem provável: inventário importado com o IP errado (1º IP do
guest no vCenter = interface SDN).
**Correcção proposta**: trocar a interface para o IP real de máquina de cada
nó (a obter da equipa dos clusters) — ou desactivar o ICMP destes 12 até
haver IP verdadeiro. (Relacionado: CLAUDE.md já regista o cluster OKD como
"em construção por outra equipa" — validar lá os IPs.)

---

## 2. INFRA · restantes domínios (padrões, idades medianas, veredictos)

### 2.1 · 01 Virtualização — 158 activos

| Padrão | Qtd | Idade | Veredicto |
|---|---|---|---|
| Datastore free space critically low / low | 137+5 | **75d** | 🔴 **REAL** — de-duplicado ao vivo: **22 datastores únicos**, dos quais **13 em crítico <10%** (`Data-DBS-01..05` — bases de dados! —, `Data-APP-01..06`, `DATA-EXCH-02`, `EXH-VS8000310`, `datastore1`) e 9 em warning <20%. Inflação exacta medida: cada datastore alerta 6× (1 por hypervisor que o monta). Trigger correcta; o problema é capacidade real + falta de dedup |
| Health is Red / system board / Failover Failed | 4 | 0,4–81d | 🔴 Real — verificar no vCenter (2 são de ontem) |
| Root password expired / expires (ESXi) | 2 | 81d | 🔴 Conhecido desde a auditoria 07-07, continua por resolver |
| Skyline Health / Overall Health VC | 4 | 11–72d | 🟠 Investigar no vCenter |
| VM CPU usage | 2 | 52d | 🟠 Capacidade da VM — escalar ao dono |
| Agent not available | 2 | 0,5d | ver §2.7 (rodada templates de ontem) |

**Calibração**: nada de errado nas triggers; a acção é (a) dedup do alarme
por datastore (dependência ou alerta só ao nível vCenter — decisão de
desenho, escrita pendente), (b) escalar capacidade à equipa de
virtualização com a lista dos 13.

### 2.2 · 02 Armazenamento — 5 activos
SNMP IBM / script Dell Unity sem coleta (73–91d) — são os bloqueios Z.9/Z.10
conhecidos (sem dados desde sempre), não miscalibração. Sem acção de trigger.

### 2.3 · 03 Servidores Virtuais — 272 activos

| Padrão | Qtd | Idade | Veredicto |
|---|---|---|---|
| Zabbix agent is not available | 167 | 82d | 🟠 **Higiene** (bucket B da triagem de 07-16): hosts mortos/desactivados a poluir. Dos 167, **51 são de ontem** — explicados em §2.7 (não é regressão, é visibilidade nova) |
| Unavailable by ICMP ping | 38 | 57d | 🟠 Higiene — VM morta → desactivar; viva → investigar rede |
| Disco crítico/low (vários) | ~19 | 1–61d | 🔴 Reais — limpar/expandir |
| System time out of sync | 7 | 77d | 🟠 NTP das VMs |
| High swap (2 em severidade Not-classified!) | 6 | 12–268d | 🟠 Investigar; **anomalia de config**: 2 triggers com severidade Not classified — corrigir severidade |

### 2.4 · 05 Segurança — 7 activos
5 agent-down de ontem (§2.7 — inclui **Imperva WAF ×3**, atenção: é
segurança de produção sem agente) + 2 ICMP de 28d (higiene).

### 2.5 · 06 Bases de Dados — 27 activos
23 agent-down (60d, higiene/recuperação de agentes) + 2 discos críticos
(61d, reais) + `SQLBrowser` parado há 100d (confirmar com dono) + 1 ICMP.

### 2.6 · 08 Datacenter Físico — 4 activos
2 ICMP 91d (higiene) + 1 link down 29d + 1 sem coleta SNMP 70d. Nada de
calibração; inventário/coleta.

### 2.7 · O "cluster das 17:42" — 44 agent-down novos em simultâneo (17/07)

51 problemas "agent not available" têm <2 dias; 44 deles abriram **no mesmo
minuto (17/07 17:41-17:42)**: frota Elasticsearch inteira, Graylog, Imperva,
Integrador (Kafka/CEPH/GitLab/Bastion), cluster OCP completo, InsightVM e os
2 vCenters. **Despiste concluído — não é incidente nem falso positivo:**
- Às **17:11** de 17/07 foi aplicado o template `Linux by Zabbix agent
  active` a 44 hosts Linux de produção que nunca tiveram template de agente
  (rodada Fase 18, `inventario/aplicar_templates_linux.py`).
- O agente **não está instalado/a correr** nessas VMs (o próprio log da
  aplicação regista `tcp10050: false` em todos) — passo operacional
  documentado como pendente.
- 30 minutos depois (timeout padrão da trigger) → 17:41-17:42, os 44 abrem.
**As triggers estão a dizer a verdade** (gap de agente que antes era
invisível). Acções: (1) instalar os agentes (lista em
`inventario/relatorio-agentes-producao.md`) — prioridade para **Imperva**
(segurança) e Elasticsearch/SWIFT logs; (2) rever os 2 vCenters
(`sv9000204`/`sv9000206`) — appliance VCSA normalmente **não** leva agente
Linux convencional: provável remover o template desses 2.

### 2.8 · 10 Serviços de Suporte — 80 activos
41 agent-down + 11 ICMP (higiene) + discos reais + **os 3 alarmes de
auto-diagnóstico do server** (poller HTTP >75% há 9,7d; >100 items sem dados
há 30,6d; value cache em low-memory há 30,6d) — 🔴 reais, são o Caso 5 do
plano; a fila subiu de ~13.300 (16/07) para **15.148** hoje. `StartHTTPPollers`
continua por aumentar.

---

## 3. NETWORK · domínio 04 (por grupo)

### 3.1 Routers de agência — 372 activos
| Padrão | Qtd | Idade | Veredicto |
|---|---|---|---|
| Interface Link down | 273 | 108–115d | 🟡 Ruído estrutural (portas de acesso) — política `{$IFCONTROL}`/LLD pendente com a equipa de redes (decisão da triagem 07-16, confirmada) |
| **Unavailable by ICMP ping** | **49** | 0,4d | 🟡/🟠 **Padrão fim-de-semana**: 31 dos 49 começaram sexta 14:49–22h (agências a fechar/cortar energia); hoje é sábado. **6 com >7d são crónicos** (higiene/incidente real a tratar). Implicação de desenho: alarme "agência down" precisa de calendário de negócio (maintenance window fora do horário) senão o fim-de-semana é 100% ruído — em tensão directa com o requisito "notificar ao FDS"; o que interessa ao FDS são as agências que *deviam* estar up (ATMs?) — decisão de negócio a tomar |
| Lower speed / half-duplex | 30 | 120–344d | 🟡 Ruído (Info/Warn) — política |
| High ICMP response time | 9 | 1,0d | 🟠 Novo pico (verificar links); a calibração `RTLOFIN00` de 16/07 mantém-se válida |
| **Fan crítico** | 4 | **176d** | 🔴 Hardware avariado — escalar |
| CPU "Temperature too low" | 2 | 292d | ⚙️ **Miscalibração/sensor avariado** (leitura sem sentido há 10 meses) — desactivar sensor ou ajustar `{$TEMP_CRIT_LOW}` |
| Restarted | 2 | 42d | 🟠 Energia local |

### 3.2 Switches de agência — 117 activos
69 link down (16d) + 28 lower speed → política; 8 sensores temperatura em
warning (21d) → investigação análoga ao caso Homewood antes de mexer;
6 ICMP down 22d → higiene/reais a confirmar.

### 3.3 Edifícios — 440 activos (switches 425 + routers 15)
252 link down + 168 lower speed (164d!) → o grosso da política de supressão;
2 fans críticos 57d → 🔴 hardware; 4 HotSpot temp 46d → calibrar como Homewood.

### 3.4 DC Fabric (switches) — 56 activos
- 🔴 **PSU + Fan do mesmo Nexus em baixo há 340 dias** — core do datacenter
  com redundância comprometida há ~1 ano; continua exactamente como na
  triagem de 07-16, ninguém agiu. **Escalar com prioridade máxima.**
- 47 lower-speed Info 222d → fechar/política; 3 high memory 81d → verificar;
  4 high inbound bandwidth de hoje → observar (pode ser tráfego legítimo de
  sábado/backup).

### 3.5 Borda DC (routers) — 3 activos
- IP SLA em falha há **239d** → recalibrar sonda ou investigar caminho (da
  triagem, continua).
- 🔴 **Temp CPU Die above critical há 2,9d** num router de borda — novo e no
  core: **verificar já** (arrefecimento/sala).
- 1 link down 224d → política.

### 3.6 Auto-diagnóstico do próprio Zabbix Network — 3 activos
- `icmp pinger >75%` há **85 dias** (hoje medido: **100% busy**;
  `unreachable poller` a 95,8%) — os ~50 hosts down eternos consomem os
  pingers com timeouts. Ligação directa à higiene: limpar os hosts mortos
  **liberta os pingers** e melhora a fiabilidade de "agência down".
- `trends cache` acima do limiar há **239 dias** — config do server
  (`TrendCacheSize`) nunca ajustada. 🔴 Mesma classe do Caso 5: plataforma
  sem ninguém a vigiá-la.

---

## 4. Síntese — a lista real depois do despiste

| Classe | Qtd aprox. | Exemplos |
|---|---|---|
| 🔴 **Incidentes/riscos reais a escalar** | ~30 únicos | SMS Banking interno 8d; EMP; INSS-BPC; 13 datastores <10% (5 são de BD!); PSU/Fan core 340d; temp CPU die borda DC; 6 fans agência/edifícios; root ESXi expirada; discos de VM; pollers/pinger/caches dos 2 servers |
| 🟡 **Falsos positivos com causa identificada** | ~5+12 | 5 sintéticos na janela nocturna 22h-07h (egress firewall); 12 ICMP OCP/OKD (IP de pod-network) |
| 🟠 **Higiene de inventário** | ~290 | agent-down antigos (~120) e ICMP mortos (~60) na Infra; 6 agências crónicas; hosts a desactivar/recuperar |
| ⚙️ **Calibração de trigger/template** | 6 itens | `find("Response code")` case-sensitive morto; 2 severidades Not-classified no swap; sensores "temp too low" 292d; HotSpot/GREEN por investigar; dedup datastore; canário de egress |
| 🟢 **True positives novos por desenho** | 44 | rodada de templates Linux de 17/07 — aguardam instalação de agente (prioridade: Imperva, Elastic/SWIFT); rever os 2 vCenters |
| 🟡 **Padrão de negócio, não avaria** | ~31/dia | agências a fechar à noite/fim-de-semana — precisa de calendário/maintenance, decisão de negócio |

**Conclusão do despiste**: as triggers do sistema estão, na sua grande
maioria, **bem construídas e bem calibradas** (as calibrações de 16/07
seguram — 0 reincidências nos ofensores corrigidos). O que os números
mostram não é miscalibração generalizada: é (1) **ruído estrutural por
política nunca decidida** (portas de acesso, ~850 na Network), (2) **higiene
de inventário parada** (~290 na Infra), (3) **duas restrições de rede na
posição do server** (egress TLS nocturno + DNS 10.5.0.x) que fabricam
falsos positivos de negócio, e (4) **incidentes reais genuínos que ninguém
fecha porque não há notificação** — a lista 🔴 acima.

## 5. Correcções propostas (cada uma pede aprovação individual)

| # | Correcção | Onde | Risco |
|---|---|---|---|
| C1 | `find(...,"Response code")` → `"response code"` | template `BPC Web Monitoring v2` (Infra) | baixo — restaura a separação código-vs-down |
| C2 | Canário de egress TLS + dependências das L1 externas | Infra, host novo + 5 trigger updates | baixo — reduz 5 FP/noite para 1 alarme honesto |
| C3 | Corrigir IP de interface dos 12 nós OCP/OKD (ou desactivar ICMP até haver IP real) | Infra | baixo — precisa dos IPs reais da equipa dos clusters |
| C4 | Remover template Linux agent dos 2 vCenters (VCSA) | Infra | baixo — reverte parte da rodada de 17/07 |
| C5 | Corrigir severidade dos 2 "High swap" Not-classified | Infra | baixo |
| C6 | Sensores "CPU Temperature too low" (2 routers, 292d) — desactivar ou `{$TEMP_CRIT_LOW}` | Network | baixo |
| C7 | Dedup datastore (dependência/alerta ao nível vCenter) | Infra, desenho a escolher | médio — desenhar antes de tocar |
| C8 | URL do BNA SPTR: teste→produção? | macro `{$URL}` do `app-bna-sptr` | decisão do dono do serviço |

### Estado de aplicação (actualizado 2026-07-18, pós-execução)

Lote C1-C6 aprovado pelo utilizador e **aplicado** via
`aplicar_calibracao_20260718.py --apply` (corrido pelo utilizador; a escrita
directa desta sessão foi bloqueada pelo classificador de permissões).
Verificação pós-apply (leitura):

| Fix | Resultado |
|---|---|
| C1 | ✅ Expressão propagada aos hosts (`find(...,"response code")` confirmado em `app-sms-banking`/`app-bna-sptr`) |
| C2 | ✅ Host `BPC Egress Canary` (14753) + trigger 173794 + dependências nos 5 — **mas o alvo google.com falha o handshake até DE DIA**: a saída do server é whitelist por destino, google nunca passa. Redesenho na fase 2 (F2a): par de destinos de negócio independentes (`www.bpc.ao` + `mundial.rtcom.pt`), trigger = AMBOS em falha (padrão de correlação do DNS) — só dispara em bloqueio de egress, nunca mascara a queda real de 1 site. Item google fica desactivado como prova da whitelist |
| C3 | ✅ 36/36 items icmp* desactivados. ⚠️ Os 12 problemas continuam listados — **confirmada ao vivo a armadilha "desactivar≠fechar"**; fecho na fase 2 (F2b: `manual_close=1` temporário na trigger-mãe do `BPC Ping` → close → repor 0) |
| C4 | ✅ Template Linux removido dos 2 vCenters; os agent-down deles fecharam sozinhos (unlink+clear apaga a trigger ⇒ apaga o problema — ao contrário do disable) |
| C5 | ✅ 0 problemas swap Not-classified restantes |
| C6 | ✅ 2 triggers desactivadas. ⚠️ 2 problemas órfãos (mesma armadilha; `manual_close=0`) — fecho na fase 2 (F2c) |

Fase 2 em `aplicar_calibracao_fase2_20260718.py` (dry-run validado; aguarda
`--apply` do utilizador). **Validação nocturna pendente**: o canário
redesenhado só prova o valor na próxima janela 22h-07h — confirmar de manhã
que (a) o canário disparou, (b) as 5 L1 ficaram suprimidas pela dependência.

**Fora do Zabbix (escalações)**: firewall egress nocturno + DNS 10.5.0.x
(rede/segurança) · SMS Banking/EMP/INSS-BPC (donos) · 13 datastores
(virtualização) · PSU core 340d + temp CPU die (redes/DC) · fans (hardware)
· `StartHTTPPollers`+`ValueCacheSize` (Infra) e `TrendCacheSize`+pingers
(Network) nos `zabbix_server.conf` · instalação dos 44 agentes Linux ·
política link-down/ifAlias (redes) · calendário de agências (negócio).
