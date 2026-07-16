# Identificação dos Serviços de Suporte e suas VMs — esquema e 1ª passada

Data: 2026-07-16. Objetivo: mapear todas as VMs que prestam serviços de
suporte (monitorização, DNS, DHCP, AD, NTP, e-mail, backup, acesso...),
colocá-las no grupo `BPC/DOMINIO/10 Servicos de Suporte` (666) com a tag
`servico` correta — pré-requisito para calibrar items e triggers por papel.

Regra do contrato canónico (`documentacao/taxonomia-grupos-tags.md`):
VM ⇒ sempre em `03 Servidores Virtuais` **+** grupo funcional (10);
subdomínio = tag `tipo`; o nome do serviço = tag `servico`.

## O esquema de identificação (5 métodos, executados em cascata)

| # | Método | Fonte | Custo | Confiabilidade |
|---|---|---|---|---|
| M1 | Visible name / host técnico | `host.get` + keywords | zero | média (nomes mentem/faltam) |
| M2 | Tags existentes (`servico`, `camada=Serviços de Infraestrutura`) | `host.get selectTags` | zero | média (herança de classificação manual antiga) |
| M3 | Grupo 666 atual (23 membros) | `hostgroup` | zero | alta (já validado na Fase 17) |
| M4 | Evidência técnica no próprio Zabbix: items `service.info[<svc>]`, `net.dns[...]`, templates dedicados (`BPC DNS Check`), processos do `BPC Top Processos`, IP das interfaces | `item.get`/`template.get` | baixo | **alta** (o serviço está de facto lá) |
| M5 | WinRM/SSH (Get-Service, portas em escuta) — só para inconclusivos | credencial DPAPI, fluxo do CLAUDE.md | alto | máxima |

**Regra de decisão**: classifica-se sem M5 quando ≥2 métodos concordam;
M5 reserva-se para os casos com sinal único ou contraditório.

## Resultado da 1ª passada (M1–M4, só leitura)

### Já no grupo 10 (M3 — 23 hosts, base validada)
AD Audit (VS8000214) · Azure AD Connect (VS8000403) · **DHCP Kea/Stork ×5**
(VS8000927-931) · **DNS externo NS3/NS4** · **Domain Controllers ×4**
(VS6000001, VS8000004 OFF, VS9000003, VS9000007) · **Exchange ×6**
(VS8000220/390-394) · IAM SRV-JUMP01/02 · WSUS ×2 (VS8000228, VS8000229 OFF).

### Candidatos NOVOS — monitorização/observabilidade (pedido explícito do utilizador)

| VM | hostid | IP (M4) | Serviço proposto | Evidência |
|---|---|---|---|---|
| PLAT - Mgmt - Zabbix server | 10084 | **10.10.126.22** | Zabbix Infra + Grafana | M1+M4 (IP = frontend Infra/Grafana) |
| Zabbix - VM - VS8000932 | 14275 | **10.10.233.140** | **Zabbix Network** | M1+M4 (IP = API Network) |
| Graylog - VM - graylog-vm01 | 14136 | 10.10.233.148 | Graylog (logs) | M1+M2 |
| Graylog - VM - graylog-vm02 | 14137 | 10.10.233.134 | Graylog (logs) | M1+M2 |
| Graylog - VM - Graylog (Win) | 14134 | ⚠ só IPv6 link-local | Graylog? | M1 — **anomalia: interface sem IPv4, provável host quebrado/legado → M5** |
| Prtgnetwork - VM - VS9000403 | 10539 | 10.10.126.32 | PRTG | M1+M2 |
| PRTG - VM - VS8000223 (OFF) | 11653 | 10.10.126.32 | — | ⚠ **mesmo IP que o anterior = host duplicado** (candidato a remoção, padrão Z.39-Z.52) |
| Observer - VM - Observer_PRD | 14179 | 10.10.101.40 | Observer (network monitor?) | M1 — confirmar função (M5) |
| Observe it - VM - VS9000449 (OFF) | 14178 | 10.10.238.188 | ObserveIT (session rec?) | M1, host OFF — decidir destino |

### Candidatos NOVOS — outras categorias (âmbito a validar com o utilizador)

| Categoria | VMs | Nota de decisão |
|---|---|---|
| **Backup** | EMC Networker VS8000108 · vProxies EMC ×3 (VS8000114/116/145) + GUEST-OS vProxy ×9 · Veeam (VeeamSA, VEEAM-POWERFLEX, VEEAM-VXBLOCK, VeeamRepo — 3 em A-CLASSIFICAR) · Backup Exec VS9000381 · appliances Data Domain/RecoverPoint ×3 | Backup é serviço de suporte? Proposta: sim (tag `tipo=backup`). Appliances físicos → talvez 08 Datacenter Físico |
| **E-mail (higiene)** | Sophos MTA I/II (VS8000218/219) | Par do Exchange que já está no 10 |
| **SCCM/updates** | System Center VS8000221 (+ SCCM BD VS8000415 — BD fica no 06, com tag) | WSUS já está no 10; SCCM é o mesmo papel |
| **IAM/rede** | tacacsubuntu (11912) | TACACS+ = autenticação de equipamentos de rede |
| **DHCP teste** | "Teste Kea DHCP" (14282, A-CLASSIFICAR) | juntar aos 5 Kea (tag ambiente=Teste) |
| **Jump/acesso** | ~13 jump servers (VD5000*, VS9000506-509, VS8000528, PowerFlex JumpServer, bastion VS8000816) | Hoje tagueados `camada=Segurança`. Taxonomia manda VMs de segurança em 03 por tag — **decidir**: 10 (acesso é suporte) ou permanecem só 03+05? |
| **Ficheiros/FTP** | File servers VS9000105/106, VS8000913 · FTP VS8000363, VS9000711, VS9000282, SFTP ubuntu | São "suporte" ou aplicacional? decidir âmbito |
| **Segurança-infra** | Imperva ×3, WAF VS8000257, Check Point ×4 (físicos) | Provável 05 Segurança, não 10 — só registado para completude |

### Gap de calibração já visível (alimenta a fase de items)

- **Só o VS9000003** tem `service.info[DNS/NTDS/Netlogon/W32Time]`; o
  VS9000007 (o outro DC de produção!), NS3 e NS4 não têm monitorização dos
  serviços core — só o check funcional `net.dns` (template `BPC DNS Check`,
  presente nos 4). Uniformizar por papel é a primeira calibração de items.
- Nenhum host tem `service.info[DHCPServer]` — o DHCP é Kea/Linux (correto),
  mas confirmar que os 5 Kea têm check funcional de DHCP (não só o trigger
  "Kea HA degradado" que apareceu na triagem).
- 2 anomalias de inventário achadas de graça: PRTG duplicado (mesmo IP) e
  Graylog Windows sem IPv4.

## Fases seguintes (após validação desta lista)

| Fase | Conteúdo | Escrita? |
|---|---|---|
| **F-B Classificar** | Aplicar grupo 666 + tags `servico`/`tipo` aos validados (host.update, aprovação caso a caso) | sim |
| **F-C Validar agentes** | Cruzar os classificados com os 161 agentes mortos da triagem; recuperar/corrigir (Graylog Win, PRTG dup...) | por VM |
| **F-D Calibrar items** | Por papel: DC/DNS = `service.info` core + `net.dns` uniforme; DHCP = check funcional Kea; Zabbix/Graylog/PRTG = checks de processo+porta+self-monitoring | sim |
| **F-E Calibrar triggers** | Limiares por papel (ex.: DC com CPU alta ≠ file server com CPU alta), dependências ICMP→agente→serviço, severidades (serviço de suporte core = High/Disaster) | sim |

## Tag scheme proposto (para validação)

```
grupo:   BPC/DOMINIO/03 Servidores Virtuais  +  BPC/DOMINIO/10 Servicos de Suporte
tags:    servico = <nome canónico>   (ex.: Zabbix Infra, Zabbix Network, Graylog,
                                       PRTG, DNS Interno, DNS Externo, DHCP (Kea),
                                       Domain Controller, Exchange, WSUS, SCCM,
                                       EMC Networker, Veeam, TACACS, ...)
         tipo    = <categoria>       (monitorizacao | dns | dhcp | ad | email |
                                       updates | backup | iam | acesso | ficheiros)
```
