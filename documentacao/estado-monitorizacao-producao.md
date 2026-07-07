# Estado da monitorização — VMs de Produção, Serviços, BDs e Aplicações

> **Documento de continuidade (2026-07-04, actualizado 2026-07-07 §2.1).** Condensa
> o essencial de 2 sessões de trabalho (recuperação de agentes + auditoria
> transversal do Zabbix) para responder a uma pergunta concreta: **o que corre,
> onde corre, se está a ser monitorizado, e como.** Detalhe operacional completo
> (host a host) fica nos ficheiros referenciados no fim — este documento é o
> ponto de entrada.

---

## 1. A pergunta que motivou tudo isto

> "Quero saber o estado de monitorização das VMs. Preciso de monitorar
> serviços, bases de dados e aplicações, mas não tenho ideia de o que corre,
> onde corre, se corre e como corre."

Duas coisas distintas têm de estar resolvidas para responder a isto:
1. **O sinal é fiável?** (o agente Zabbix na VM está a reportar dados reais)
2. **Sabemos o que cada VM faz?** (classificação de negócio — serviço, BD,
   aplicação — não só o nome técnico `VS80009XX`)

Hoje avançámos muito no (1). O (2) está a começar (achados concretos, mas
a maioria das ~280 VMs de Produção continua sem classificação de negócio
explícita no Zabbix).

---

## 2. Estado actual medido (2026-07-04, ao vivo)

| Métrica | Valor |
|---|---:|
| VMs de Produção activas no Zabbix (grupo 609, tag `ambiente=Produção`) | **281** |
| — das quais, com agente configurado (template ligado) | 238 |
| — das quais, `agent.ping` **fresco agora** (<15 min) | **122 (43%)** |
| — das quais, **nunca reportaram** | 116 |
| — sem agente por desenho (só VMware/ping) | 43 |

**Ponto de partida (03/07, antes de qualquer correcção)**: 68/280 (24%) a
reportar. **Progresso**: +54 VMs recuperadas em 2 sessões (46 + ~21 novas
instalações − alguns casos que ainda dependem de bloqueios externos).

---

## 2.1 Validação ao vivo (2026-07-07) — o número de "parados" estagnou, mas não é regressão

Medição repetida directamente na API Zabbix (não a snapshot antiga) para validar
se o esforço de recuperação estava mesmo a reflectir-se nos números:

| Métrica | 04/07 | 07/07 (ao vivo) |
|---|---:|---:|
| Com agente configurado (grupo 609, tag `ambiente=Produção`) | 238 | **256** (+18 instalações novas) |
| `agent.ping` fresco agora (<15min) | 122 (43%) | **136 (53%)** |
| Parado / nunca reportou | 116 | **120** |

**Explicação:** o pool cresceu 18 hosts (novas instalações que entraram na
contagem mas ainda não arrancaram) mais depressa do que a recuperação líquida
(+14 frescos) — o número de "parados" ficar quase igual não significa que o
trabalho parou, é aritmética de um denominador em crescimento.

**Cruzamento com os handoffs de 03/07–04/07:** dos 120 parados hoje, **65 já
estavam nomeados** nesses handoffs como itens em aberto (SWIFT, UAC Server
2008, "acesso negado" com a credencial, IPv6 link-local, "só ping responde")
— não são recuperações que caíram outra vez, são os mesmos bloqueios antigos
ainda por resolver. Os outros **55 nunca tinham sido tocados**.

**Achado sobre os 55 novos — appliances de fabricante, não template mal
aplicado (revisto 2026-07-08, ver correcção abaixo):** 24 destes 55 são VMs
de infra-estrutura especializada (12 `vProxy-EMC Networker`, 7 PowerFlex
management/SVM, 4 Tenable/Nessus, 1 JumpServer). Hipótese inicial era
template Linux/Windows mal aplicado — **descartada** depois de confirmar no
vCenter PRD (`10.10.101.9`, credencial válida) 6 das VMs `vProxy`: são
**SLES 12/15 genuínas, ligadas, VMware Tools activo, IP real** (não
appliance "fantasma" nem isolada de rede) — e **5/6 com a porta 22 (SSH)
aberta e alcançável**. As restantes **18 das 24** (8 vProxy + PowerFlex
SVM/pfm + Tenable) apontam para o vCenter **PowerFlex** (`10.10.232.84`),
que já tem credencial confirmada inválida (Z.8) — mesmo bloqueio antigo,
não verificável sem credencial nova. Os outros **32 dos 55** (Graylog,
Cacti, Netbox, PHPIPAM, DNS externos NS3/NS4, jump servers, WAF,
Securesphere, etc.) são servidores normais nunca antes trabalhados —
candidatos genuínos a entrar na fila de recuperação de agentes.

**Correcção (2026-07-08) — conclusão "agente nunca instalado" estava
errada para a maioria das vProxy:** o utilizador reparou num problema activo
"Zabbix agent is not available" em `VS8000110_vProxy-EMC Networker" e
perguntou se era o mesmo host já analisado — a resposta revelou que **cada
VM `vProxy` tem 2 registos Zabbix distintos para a mesma máquina física**
(mesmo IP, hostids diferentes): um `GUEST-OS - VSxxxxxxx (vProxy VxBlock)`
com template `Linux by Zabbix agent` (passivo) — **este é que tem o agente
real, a reportar** — e o `..._vProxy-EMC Networker` com `VMware Guest` +
`Linux by Zabbix agent active`, que é o registo **morto/duplicado** que eu
tinha analisado (o `agent.ping` nunca teve dado nenhum). Verificado nas 12
vProxy: **8 têm o duplicado `GUEST-OS` com agente fresco** (`VS8000110/111/
101/105/100/120/121/122`) — já estão monitorizadas correctamente, só
"escondidas" atrás do registo duplicado morto. **1** (`VS8000109`) tem o
duplicado mas sem dado de agente nele também. **3** (`VS8000145`,
`VS8000114`, `VS8000116`) não têm duplicado nenhum — continuam como
candidatas reais a "sem agente confirmado". Método de verificação: mesma
técnica dos duplicados ESXi (Z.29)/UUID (Z.25) — `host.get` por substring
do nome devolve os 2 registos, compara-se `interfaces[].ip` (igual) e
`agent.ping.lastclock` (um fresco, outro `0`) para confirmar qual é o real.
**Pendente**: decidir se se desactiva/apaga os registos `..._vProxy-EMC
Networker` duplicados e mortos (mesma família de limpeza do Z.29), já que
a monitorização real já existe no `GUEST-OS`.

**Actualização 2026-07-08 — limpeza executada (Z.43-Z.46):** levantamento
alargado a toda a instância (630 hosts) confirmou **25 máquinas com registo
Zabbix duplicado** no total (9 vProxy + vCenter PRD + vCenter DR + 6
zombies confirmados por `agent.ping` + 3 UUID já conhecidos + 3 confirmados
por WinRM + par PMSI + 1 recovery/DR). **20 já apagados** com aprovação
explícita do utilizador, backups pré-delete gravados (macros de password
sempre redactadas antes de persistir em disco): os 9 vProxy, os 6 zombies
(`VS8000810_netbox`, `LTTI44`, `VS8000806`, `VS8000808`, `TACACS UBUNTU`,
`VS8000115`), os 2 do grupo vCenter (`SV9000204` — que também continha a
password exposta — e `VS9001206`), e os 3 confirmados por inspecção WinRM
directa à VM (Sigcap/Ebankit/SGC). **Restam 5**: 3 pares já conhecidos por
UUID de sessão anterior (2º lado já desactivado, baixo risco), o par PMSI
(pendente de decisão sobre credencial SSH), e `sv9001206` ("Vcenter DR")
— que afinal **não é duplicado**, é um conector vCenter com
`{$VMWARE.URL}` vazio, nunca configurado — decisão à parte (consertar ou
desactivar). Detalhe completo por trigger/hostid em
`bpc-workspace/zabbix-infra-limpeza-ruido-handoff-20260707.md §10`.

**Achado lateral (segurança, não relacionado com agentes):** durante esta
verificação, a password do vCenter PRD (`administrator@vsphere.local`) foi
encontrada em claro numa macro **não-Secret** de um host Zabbix duplicado
(`SV9000204`, distinto do host oficial `sv9000204` que a guarda correctamente
como Secret) — e foi acidentalmente impressa num script de diagnóstico desta
sessão. Tratar como comprometida: **precisa de rotação no vSphere** e correcção
do tipo do macro no host duplicado (escrita Zabbix de baixo risco, mas por
confirmar caso a caso).

---

## 3. Causas conhecidas das 116 que não reportam (todas diagnosticadas, nenhuma "mistério")

| Causa | Escopo | Estado |
|---|---|---|
| `ServerActive`/`Hostname` errados | 46 já corrigidas | ✅ Feito |
| Agente nunca instalado | 17 confirmados, 10+7 já instalados | ✅ Maioria feita |
| Bug de BOM no script de instalação (`Install-ZabbixAgent2-MSSQL.ps1`) | Corrigido na fonte | ✅ Feito — não volta a acontecer em instalações novas |
| Plugin NVIDIA do Zabbix Agent 2 (bug conhecido, Won't fix) | Não bloqueia monitorização base, só métricas MSSQL/NVIDIA nalguns hosts | ℹ️ Sem acção necessária na maioria dos casos |
| IP inválido registado no Zabbix (13 hosts) | 3 resolvidos, 2 diagnosticados (consola), 1 por decidir (edge/DMZ), 7 bloqueados | ◐ Em curso |
| VMs SWIFT sem acesso (segregação por política) | 5 hosts | ✅ Decisão tomada — não mexer |
| Credencial sem direitos (não-SWIFT) | 2 hosts | ⏸ Precisa de outra via de acesso |
| Isolamento de rede completo (sub-rede não alcança o servidor Zabbix) | `VS8000904` confirmado + outros suspeitos | ⏸ Escalar à equipa de rede |
| Windows Server 2003 (EOL) | 3 hosts | ⏸ Decisão de arquitectura pendente |
| UAC Remote Restriction (Server 2008/2008R2) | 2 hosts | ✅ Decisão tomada — não enfraquecer segurança |
| Credencial errada no vCenter PowerFlex (bloqueia 7+ hosts e o `powerstate` de outros) | — | ⏸ **Maior bloqueio único restante** — precisa de credencial nova |

**Conclusão prática**: dos 116, a fatia maior e mais imediatamente accionável
é a que depende da **credencial do vCenter PowerFlex** — resolver isso
desbloqueia mais hosts de uma vez do que qualquer outra causa isolada.

---

## 4. O que já sabemos sobre serviços/BDs/aplicações (o lado "o quê" e "onde")

### 4.1 Aplicações de negócio (auditoria de 03/07, `documentacao/auditoria-apis-servicos.md`)
- 39 aplicações com monitor sintético (`app-*`), mas **só 19 já ligadas a uma
  VM concreta** de forma confirmada (URL→IP→VM). As restantes precisam de
  validação com o negócio.
- **Gaps de cobertura conhecidos** (sistemas reais, sem monitor sintético
  ainda): EQUATION Core Bancário, EBA, BFTELLER, STC, Match Cash, CTB/400
  (relaciona-se com o template `AS400` encontrado hoje, nunca aplicado a
  nenhum host — Fase 15.A), Audit Bank, Payment Manager, UYSIG, Bloomberg,
  Portal EMIS, BODIVA.
- Notificações de alerta **mortas** (nenhum alerta sai do Zabbix hoje —
  causa e plano em `auditoria-apis-servicos.md §4/§7 Fase D`).

### 4.2 Serviços de infra-estrutura descobertos hoje (Fase 15.A, grupo "A-CLASSIFICAR")
25 VMs estavam activas e monitorizadas mas sem nenhuma etiqueta de negócio.
Identificados por nome/hostname real via vCenter:
- **3 Veeam** (backup): `VEEAM-POWERFLEX`, `VEEAM-VXBLOCK`, `VeeamRepo`
- **7 cluster OpenShift/OKD** (plataforma de containers, ambiente dev):
  `master1`, `worker1/2/3`, + `okd_ha_proxy`, `rhcoreos_bootstrap`,
  `rhocp-helper` — 4 já renomeados no Zabbix (visible name) para reflectir
  isto
- 1 proxy Nginx, 1 servidor DHCP piloto (`Teste Kea DHCP` — possível relação
  com falhas de DHCP encontradas noutra VM, por confirmar), 1 nó de gestão
  PowerFlex
- 12 ainda sem classificação (4 no vCenter PRD sem pista disponível, 8 no
  vCenter PowerFlex ainda bloqueado)

### 4.3 Taxonomia de tags no Zabbix (base para classificar o resto)
Cada VM já tem tags técnicas (`cluster`, `esxi_host`, `vcenter`,
`hw_plataforma`) preenchidas automaticamente. As tags de **negócio**
(`servico`, `departamento`, `ambiente`) é que estão incompletas/por
confirmar em muitos hosts — é isto que separa "sei que a VM existe e está
viva" de "sei o que ela faz".

---

## 5. Bloqueios que precisam de ti (nada disto avança sem uma decisão ou acesso tua)

1. **Credencial válida para o vCenter PowerFlex** (`10.10.232.84`) — desbloqueia
   7+ hosts de agente, a classificação de mais 8 VMs "A-CLASSIFICAR", e a
   confirmação de `powerstate` de várias VMs sem dado nenhum
2. **Decidir SWIFT** — aceitar que ficam fora da monitorização geral, ou abrir
   via canal próprio de segurança
3. **Escalar à equipa de rede** — isolamento de sub-rede (`VS8000904` e
   possivelmente outros) e os hosts sem resposta nenhuma
4. **Decidir Server 2003** — vale a pena o Zabbix Agent 1 legado, ou aceitar
   sem monitorização
5. **Acesso à consola de 2-3 VMs** (`Graylog`, `VS9000711`, `VS8000394`) —
   causas já isoladas, só falta olhar por dentro do guest OS
6. **Rotação da password do vCenter PRD** — exposta em claro numa macro
   não-Secret de um host Zabbix duplicado (achado 07/07, §2.1); trocar no
   vSphere antes de eu corrigir o tipo do macro
7. **Decidir as 6 VMs `vProxy-EMC Networker` confirmadas vivas/alcançáveis**
   (§2.1) — tentar instalar o agente Zabbix (acção de escrita por VM nomeada)
   ou aceitar como "sem agente por desenho" (appliance de fabricante)

---

## 6. Próximo passo recomendado (para responder à pergunta original)

1. Resolver o bloqueio nº1 (credencial PowerFlex) — é o que mais destrava de
   uma vez só.
2. Completar a classificação de negócio (`servico`/`departamento`) nas VMs
   de Produção que já reportam mas não têm tag preenchida — sem isto,
   "está a monitorizar" não é o mesmo que "sei o que está a monitorizar".
3. Só depois: desenhar a alarmística/notificações novas (Fase D do plano de
   `auditoria-apis-servicos.md`) e os dashboards Grafana do domínio
   APIs/Serviços (Fase 7 do `cronograma.md`) — em cima de sinal já fiável e
   já classificado, não antes.

---

## 7. Onde está o detalhe (se precisares de ir mais fundo nalgum ponto)

- `cronograma.md` — Fase 14 (recuperação de agentes, host a host) e Fase 15
  (auditoria transversal Zabbix, achados A/B/C/D) + catálogo `Z.1`–`Z.25`
- `documentacao/auditoria-apis-servicos.md` — auditoria original de
  aplicações/sintéticos/agentes (03/07), plano de Fases A–F
- `bpc-workspace/vm-agente-recuperacao-handoff-20260703.md` e
  `...-20260704.md` (fora deste repo) — log operacional completo,
  comando a comando, de cada VM tocada
- `bpc-workspace/zabbix-infra-limpeza-ruido-handoff-20260707.md` (fora deste
  repo) — §8, validação ao vivo dos "parados" e achado das appliances
  `vProxy`/PowerFlex/Tenable (2026-07-07)
- `CLAUDE.md` — constraints e técnicas reutilizáveis (acesso WinRM/vCenter/
  Zabbix API, o que já foi tentado e não deve repetir-se)
