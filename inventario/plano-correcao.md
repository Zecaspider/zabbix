# Plano de correção host-a-host — 2026-07-17T07:56:30

**Nada foi aplicado.** Cada item tem evidência e risco; marcar a checkbox = aprovado para aplicar.
Fontes: vCenter PRD live 2026-07-17, snapshot Excel 2026-05-04, Zabbix Infra (608 hosts).

| Secção | Itens |
|---|---|
| 0_nao_mexer | 3 |
| 10_politicas | 3 |
| 1_ip_interface | 5 |
| 2_uuid_macro | 33 |
| 3_hosts_sem_vm | 24 |
| 4_onboarding | 29 |
| 5_templates_so | 13 |
| 6_tags_conflito | 30 |
| 7_tags_ausentes | 99 |
| 8_grupos_reintegrar_03 | 57 |
| 9_grupos_servico | 23 |

## 0. NÃO MEXER — revoga propostas anteriores

- ⛔ `SWIFT - VM - VS8000126 (Win · Produção · Camada Aplicacional | DTI - SWP)` (hostid 11736): **NENHUMA — manter ativo**
  - Evidência: live 2026-07-17: VS8000126 POWERED_ON em CS9000002 ip=10.10.13.5; as copias '_Migrada_Nao_Ligar' do Cluster Swift foram apagadas do vCenter desde maio
  - REVOGA a proposta da 1a rodada de desativar estes 3 hosts
- ⛔ `SWIFT - VM - VS8000127 (Win · Produção · Segurança | DTI - SWIFT Jump Server)` (hostid 11737): **NENHUMA — manter ativo**
  - Evidência: live 2026-07-17: VS8000127 POWERED_ON em CS9000002 ip=10.10.13.60; as copias '_Migrada_Nao_Ligar' do Cluster Swift foram apagadas do vCenter desde maio
  - REVOGA a proposta da 1a rodada de desativar estes 3 hosts
- ⛔ `SWIFT - VM - VS8000128 (Win · Produção · Camada Aplicacional | DTI - Token Server)` (hostid 11738): **NENHUMA — manter ativo**
  - Evidência: live 2026-07-17: VS8000128 POWERED_ON em CS9000002 ip=192.168.8.2; as copias '_Migrada_Nao_Ligar' do Cluster Swift foram apagadas do vCenter desde maio
  - REVOGA a proposta da 1a rodada de desativar estes 3 hosts

## 1. IPs de interface divergentes

| ✓ | Host | hostid | IP no Zabbix | IP proposto | Fonte | Confiança |
|---|---|---|---|---|---|---|
| [ ] | SWIFT - VM - VS9000316 (Win · Produção · Camada Aplicacional | DTI) | 11957 | 10.10.238.54 | **10.10.238.162** | vCenter live 2026-07-17 | alta |
| [ ] | SWIFT - VM - VS8000128 (Win · Produção · Camada Aplicacional | DTI - Token Server) | 11738 | 10.10.13.8 | **192.168.8.2** | vCenter live 2026-07-17 | baixa — IP live em rede isolada; possivel NIC secundaria (verificar antes) |
| [ ] | Exchange - VM - VS8000393 (Win · Produção · Serviços de Infraestrutura | DTI) | 11875 | 10.10.236.61 | **10.10.236.97** | snapshot 2026-05-04 | media (confirmar quando PowerFlex live) |
| [ ] | Canal de denuncias - VM - VS8000741 (Win · Produção · Camada Aplicacional | DTI - PWC) | 11718 | 192.168.1.29 | **10.10.203.29** | snapshot 2026-05-04 | media (confirmar quando PowerFlex live) |
| [ ] | Exchange - VM - VS8000392 (Win · Produção · Serviços de Infraestrutura | DTI) | 11874 | 10.10.236.38 | **10.10.236.96** | snapshot 2026-05-04 | media (confirmar quando PowerFlex live) |

Risco comum: agente Zabbix pode só responder no IP antigo — validar ping/agente no IP novo antes de aplicar.

## 2. Backfill da macro {$VMWARE.VM.UUID} (33 hosts sem macro)

| ✓ | Host | hostid | VM | UUID proposto | Tipo | Confiança |
|---|---|---|---|---|---|---|
| [ ] | GUEST-OS - VS8000101 (vProxy VxBlock) | 11914 | VS8000101_vProxy-EMC Networker | `5023d74c-4d4c-0348…` | instance_uuid (live) | alta |
| [ ] | APP - Compute - VS9000358 (eBanking Audit Sys | 10599 | VS9000358 | `5016a394-0f34-23d7…` | instance_uuid (live) | alta |
| [ ] | tacacsubuntu | 11912 | TACACS UBUNTU | `500dd79a-d751-badc…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - PMSI -  VS8000704 (PMSI - CEPH) | 11976 | VS8000704 | `502319ca-160d-28e4…` | instance_uuid (live) | alta |
| [ ] | PLAT - Web - VS8000703 (PMSI - Load Balancer  | 11975 | VS8000703 | `5023cc39-c669-c690…` | instance_uuid (live) | alta |
| [ ] | SO - Compute - VS9000352 (KMS/VAMT Server) | 10600 | VS9000352 | `50163b11-d417-be7d…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - VS8000105 (vProxy VxBlock) | 11915 | VS8000105_vProxy-EMC Networker | `50232397-4344-0075…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - PMSI - VS8000709 (PMSI - Compute N | 11978 | VS8000709 | `5023ff17-48d7-9449…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - PMSI - VS8000710 (PMSI - Compute N | 11979 | VS8000710 | `50233cdd-a9f2-fc51…` | instance_uuid (live) | alta |
| [ ] | GUESTO-OS - PMSI - VS8000702 (PMSI - Master N | 11974 | VS8000702 | `502314b4-d29c-cdbd…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - VS8000110 (vProxy VxBlock) | 11917 | VS8000110_vProxy-EMC Networker | `5023ab9f-e5a6-245e…` | instance_uuid (live) | alta |
| [ ] | sv9000204 (Vcenter PRD) | 11877 | SV9000204 | `52ad69e7-0737-fea4…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | 11916 | VS8000109_vProxy-EMC NetWorker | `50238ff1-a45b-8298…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - VS8000111 (vProxy VxBlock) | 11918 | VS8000111_vProxy-EMC NetWorker | `5023b85b-6a62-d2bd…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - PMSI - VS8000ASSECO (ACM Jump Serv | 11956 | VS8000ASSECO | `50230ecc-3077-a376…` | instance_uuid (live) | alta |
| [ ] | APP - Compute - VS8000409 (Talentia - BD) | 10562 | VS8000409 | `500dfa57-e4d7-85c8…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - PMSI - VS8000708 (PMSI - Compute N | 11977 | VS8000708 | `50234953-7b78-a937…` | instance_uuid (live) | alta |
| [ ] | APP - Compute - VS8000138 (Swift - Token Serv | 11923 | VS8000138 | `50232927-cba0-c0c2…` | instance_uuid (live) | alta |
| [ ] | GUEST-OS - VS8000122 (vProxy PowerFlex) | 11919 | VS8000122_vProxy-EMC Networker | `421dd1f9-53d4-cfc2…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | GUEST-OS - PMSI - VS8000713 (PMSI - Master No | 11982 | VS8000713 | `422327e9-123e-cb79…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Compute - VS8000735 (Whatsaap BPC | Loa | 11715 | VS8000735 | `4223c3b2-cc7e-3b7b…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | GUEST-OS - PMSI - VS8000711 (PMSI - Compute N | 11980 | VS8000711 | `4223bade-6c2b-6b36…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Compute - VS8000855 (Sigcap Load Balanc | 11971 | vs8000855 | `421db539-2e21-bba9…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | GUEST-OS - VS8000100 (vProxy PowerFlex) | 11920 | VS8000100_vProxy-EMC Networker | `421d514e-1016-1dd0…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | GUEST-OS - VS8000121 (vProxy PowerFlex) | 11922 | VS8000121_vProxy-EMC Networker | `421d4458-f3c2-7c3c…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Compute - VS8000789 (SACC) | 11733 | VS8000789 | `4223a931-ffa3-1b5e…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | SO - Compute - VS8000810 (Betbox) | 11876 | VS8000810_netbox | `421d25ae-3951-a19d…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | PLAT - Mgmt - Zabbix server | 10084 | VS8000115 | `42239ec7-a779-b749…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Compute - VS8000294 (BFTeller) | 11973 | VS8000294 | `564d4251-7938-4cce…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | SO - Compute - VS8000474 (Sistema de Gestão d | 11927 | vs8000474 | `420d3d90-e8d6-aab5…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Network - VS8000740 (Whatsaap BPC | Loa | 11717 | vs8000740 | `42230f53-965a-4756…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | GUEST-OS - VS8000120 (vProxy PowerFlex) | 11921 | VS8000120_vProxy-EMC Networker | `421d3623-d6ce-1fe7…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |
| [ ] | APP - Compute - VS8000829 (Fircosoft MQ PMSI  | 11968 | VS8000829 | `421d89bf-d90d-3f34…` | BIOS UUID (snapshot) | adiar — BIOS UUID pode nao ser o que o t |

## 3. Hosts do grupo 03 sem VM em nenhuma fonte (investigar → desativar; NUNCA apagar)

| ✓ | Host | hostid | IPs | Status |
|---|---|---|---|---|
| [ ] | SO - Compute - VS8000332 (BPC Net - Backoffice1) | 10549 | 10.10.11.37 | ativo |
| [ ] | SO - Compute - VS8000333 (BPC Net - Backoffice2) | 10550 | 10.10.11.38 | ativo |
| [ ] | SO - Compute - VS8000444 (BPC Net -BD) | 10554 | 10.10.11.68 | ativo |
| [ ] | SO - Compute - SV9000307 (SMS Banking) | 10569 | 172.16.254.123 | ativo |
| [ ] | SO - Compute - VS9000718 (ARGUS Front End V9) | 10584 | 10.10.236.82 | ativo |
| [ ] | PLAT - Mgmt - VS9000207 (SCSM_MgmtSrv02) | 10585 | 10.10.238.231 | ativo |
| [ ] | PLAT - Mgmt - VS9000201 (SCSM_MgmtSrv01) | 10586 | 10.10.238.230 | ativo |
| [ ] | PLAT - Mgmt - VS9000400 (SCSM_DB - Operations Database) | 10598 | 10.10.238.232 | ativo |
| [ ] | PLAT - Infra - VS9000304 (MIM Services (Admin) ) | 10601 | 10.10.238.203 | ativo |
| [ ] | PLAT - Infra - VS9000303 (MIM Services (Utilizadores)) | 10602 | 10.10.238.200 | ativo |
| [ ] | PLAT - Infra - VS9000302 (MIM Portal - Sharepoint) | 10603 | 10.10.238.197 | ativo |
| [ ] | PLAT - Infra - VS9000301 (MIM Sync and DB) | 10604 | 10.10.238.195 | ativo |
| [ ] | PLAT - Mgmt - VS8000415 (SCCM BASE DE DADOS) | 10614 | 10.10.236.94 | ativo |
| [ ] | PLAT - Mgmt - VS8000210 (Orquestrator Server para o SCSM) | 10623 | 10.10.236.241 | ativo |
| [ ] | SO - Compute - VS9000461 (TMG Report) | 10625 | 10.10.238.208 | ativo |
| [ ] | SO - Compute - VS9000478 (RELAY PRD Front-End) | 10631 | 10.10.238.136 | ativo |
| [ ] | SO - Compute - VS9000477 (OEM) | 10632 | 10.10.236.150 | ativo |
| [ ] | SO - Compute - VS9000468 (Transformação da Função de Risco - | 10633 | 10.10.238.159 | ativo |
| [ ] | SO - Compute - VS9000426 (Hermes) | 10634 | 10.10.236.144 | ativo |
| [ ] | SO - Compute - VS9000396 (Orion Solarwinds NPM 11.5.x) | 10635 | 10.10.126.39 | ativo |
| [ ] | Talentia - VM - VS9000319 (Win · QA · Camada Aplicacional |  | 11648 | 10.10.236.55 | ativo |
| [ ] | PLAT - Compute - VS9000346 (IBM IB9 - PRD) | 11656 | 10.10.236.12 | ativo |
| [ ] | SO - Compute - VS8000519 (Support Server) | 11696 | 10.10.237.50 | ativo |
| [ ] | SO - Compute - VS9000249 | 11712 | 10.10.238.237 | ativo |

Evidência comum: sem par no snapshot 2026-05-04 NEM no vCenter PRD live 2026-07-17; sem macro UUID. Risco: se a VM existir no PowerFlex (unica fonte nao verificavel live), desativar seria erro — validar dono/ping antes; Z.8 resolve

## 4. Onboarding — VMs sem cobertura Zabbix (confirmado por 2 fontes)

| ✓ | VM | Cluster | Estado | IP | Serviço (anotação) | Pendência |
|---|---|---|---|---|---|---|
| [ ] | LNX | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000798 | CS9000002 | POWERED_ON | — | INTEGRACAO | sem IP conhecido (tools off) — levantar IP a |
| [ ] | C9800-CL-04 (Cisco Catalyst 9800) | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000JUMP_DSE | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000KPMG2 | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000701 | CS9000002 | POWERED_ON | — | NEXUS | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000716 | CS9000002 | POWERED_ON | — | SMS Gateway | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000892 | CS9000002 | POWERED_ON | — | SAP ROUTER | sem IP conhecido (tools off) — levantar IP a |
| [ ] | vHMC9-DR | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000IA007 | CS9000002 | POWERED_ON | — | JUMP SERVER | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000797 | CS9000002 | POWERED_ON | — | DOCKER | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000NP010 | CS9000002 | POWERED_ON | — | JUMP SERVER | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000707 | CS9000002 | POWERED_ON | — | COMPUTE NODES | sem IP conhecido (tools off) — levantar IP a |
| [ ] | C9800-CL-03 (Cisco Catalyst 9800) | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000SAFIRA_JUMP | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000705 | CS9000002 | POWERED_ON | — | COMPUTE NODES | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000511 | CS9000002 | POWERED_OFF | — | ESSENCE | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS9000313 | CS9000002 | POWERED_ON | — | SWIFT | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000LNX | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | vHMC9 | CS9000002 | POWERED_ON | — | CONSOLA IBM HMC | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000493 | CS9000002 | POWERED_ON | 10.10.237.25 | CREDITQUEST | — |
| [ ] | VS8000799 | CS9000002 | POWERED_ON | — | STI | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VD5000KPMG1 | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS9001206 | CS9000002 | POWERED_ON | 10.10.101.30 | — | — |
| [ ] | VD5000JD006 | CS9000002 | POWERED_OFF | — | JUMP SERVER | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS9000320 | CS9000002 | POWERED_ON | — | SWIFT | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000882 | CS9000002 | POWERED_ON | — | PrivilegedAnalytics | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000744 | CS9000002 | POWERED_ON | — | NGINX | sem IP conhecido (tools off) — levantar IP a |
| [ ] | VS8000903 | CS9000002 | POWERED_ON | — | — | sem IP conhecido (tools off) — levantar IP a |

Ação: criar host com grupos 03 + domínio funcional, templates `VMware Guest` + `BPC Ping`, macro UUID. VMs desligadas: decidir caso a caso.

## 5. Templates de SO errados

| ✓ | Host | hostid | SO no vCenter | Ação |
|---|---|---|---|---|
| [ ] | Git lab - VM - VS8000700 (Win · QA · Camada A | 14133 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | E-learning - VM - VS8000884 (Win · QA · Camad | 14104 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Gitlab - VM - VS8000890 (Win · QA · Camada Ap | 14135 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | GLPI - VM - VS8000788 (Linux · Produção · Cam | 11988 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Fusion essence - VM - VS8000760 (Win · QA · C | 14128 | Red Hat Enterprise Linux 8 (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Integrador/Apachenifi - VM - VS8000811 (Linux | 14077 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Essence - VM - VS8000514 (Linux · QA · Bases  | 14116 | Red Hat Enterprise Linux 8 (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | GLPI - VM - VS8000896 (Linux · QA · Camada Ap | 11989 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Graylog - VM - Graylog (Win · Produção · Cama | 14134 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Essence - VM - VS8000515 (Linux · QA · Bases  | 14117 | Red Hat Enterprise Linux 8 (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Integrador/Apachenifi - VM - VS8000869 (Linux | 14154 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Digiwave - VM - VS8000832 (Linux · Produção · | 11970 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |
| [ ] | Integrador/Apachenifi - VM - VS8000812 (Linux | 14146 | Ubuntu Linux (64-bit) | trocar 'Windows by Zabbix agent active' por 'Linux by Zabbix agent active' |

Risco: histórico do template errado fica órfão; validar que o agente responde após a troca.

## 6. Tags em CONFLITO (decisão humana: Excel vs curadoria Zabbix)

| Vence | Host | Tag | Valor Excel/vCenter | Valor Zabbix | Nota |
|---|---|---|---|---|---|
| Excel [ ] / Zbx [ ] | GUEST-OS - PMSI -  VS8000704 (PMSI - CEP | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | PLAT - Web - VS8000703 (PMSI - Load Bala | ambiente | Qualidade | Produção | codigo anotacao=LQL |
| Excel [ ] / Zbx [ ] | GUEST-OS - VS8000105 (vProxy VxBlock) | ambiente | Qualidade | Produção | codigo anotacao=LQI |
| Excel [ ] / Zbx [ ] | GUEST-OS - PMSI - VS8000709 (PMSI - Comp | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | GUEST-OS - PMSI - VS8000710 (PMSI - Comp | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | GUESTO-OS - PMSI - VS8000702 (PMSI - Mas | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | Integrador/Apachenifi - VM - VS8000811 ( | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | GUEST-OS - VS8000110 (vProxy VxBlock) | ambiente | Qualidade | Produção | codigo anotacao=LQI |
| Excel [ ] / Zbx [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | ambiente | Qualidade | Produção | codigo anotacao=LQI |
| Excel [ ] / Zbx [ ] | GUEST-OS - VS8000111 (vProxy VxBlock) | ambiente | Qualidade | Produção | codigo anotacao=LQI |
| Excel [ ] / Zbx [ ] | GUEST-OS - PMSI - VS8000ASSECO (ACM Jump | ambiente | Qualidade | Produção | codigo anotacao=WQA |
| Excel [ ] / Zbx [ ] | APP - Compute - VS8000409 (Talentia - BD | ambiente | Qualidade | Produção | codigo anotacao=WQB |
| Excel [ ] / Zbx [ ] | Integrador/Apachekafka - VM - VS8000809  | ambiente | Qualidade | Produção | codigo anotacao=WQA |
| Excel [ ] / Zbx [ ] | GUEST-OS - PMSI - VS8000708 (PMSI - Comp | ambiente | Qualidade | Produção | codigo anotacao=LQA |
| Excel [ ] / Zbx [ ] | Cpi - VM - VS8000754 (Win · QA · Serviço | servico | CPI | ebankit | anotacao='CPI.WQI.DTI.ebankit servidor I |
| Excel [ ] / Zbx [ ] | Integrador/Apachenifi - VM - VS8000811 ( | servico | ANSIBLE | INTEGRADOR | anotacao='ANSIBLE.LQA.DTI' |
| Excel [ ] / Zbx [ ] | Sftp pmsi - VM - VS8000319 (Win · QA · C | servico | TALENTIA | SFTP PMSI | anotacao='TALENTIA.WQA.DCH' |
| Excel [ ] / Zbx [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | servico | vProxyr | EMC Networker vProxy | anotacao='vProxyr.LQI.DTI.This is Backup |
| Excel [ ] / Zbx [ ] | Psi - VM - LTTI44_CLONE (Win · Produção  | servico | PSI | Posto de Trabalho | anotacao='PSI.WPA.DTI.Processamento de S |
| Excel [ ] / Zbx [ ] | Integrador/Apachekafka - VM - VS8000809  | servico | EXCEL REPORT | INTEGRADOR | anotacao='EXCEL REPORT.WQA.PMSI.Relatóri |
| Excel [ ] / Zbx [ ] | Aplicacoes internas - VM - VS8000305 (Wi | servico | APLICACOES INTERNAS | LIVE | anotacao='APLICACOES INTERNAS.WPA.DTI' |
| Excel [ ] / Zbx [ ] | Microcredito - VM - VS8000813 (Win · Pro | servico | MICROCREDITO | SIC | anotacao='MICROCREDITO.WPA.DTI' |
| Excel [ ] / Zbx [ ] | Dhcp server - VM - VS8000929 (Linux · Pr | servico | DHCP Server | Stork Agent (DHCP) | anotacao='DHCP Server.LPA.Agent Stork' |
| Excel [ ] / Zbx [ ] | Dhcp server - VM - VS8000928 (Linux · Pr | servico | DHCP Server | Stork DB (DHCP) | anotacao='DHCP Server.LPB.Data Base Post |
| Excel [ ] / Zbx [ ] | Dhcp server - VM - VS8000927 (Linux · Pr | servico | DHCP Server | Stork Server (DHCP) | anotacao='DHCP Server.LPA.Web Applicatio |
| Excel [ ] / Zbx [ ] | Aplicacoes internas - VM - VS8000304 (Wi | servico | APLICACOES INTERNAS | SIR | anotacao='APLICACOES INTERNAS.WPA.DTI.RD |
| Excel [ ] / Zbx [ ] | ToBe - VM - VS8000427 (Win · Produção ·  | servico | TOBE | sistema de compensacao de cheq | anotacao='TOBE.WPG.DTI.Serv Aplic TOBE - |
| Excel [ ] / Zbx [ ] | APP - Network - VS8000740 (Whatsaap BPC  | servico | EBANKIT | canais digitais | anotacao='EBANKIT.WPL.DSE.Load balance d |
| Excel [ ] / Zbx [ ] | Integrador/Apachenifi - VM - VS8000811 ( | departamento | DTI | PMSI |  |
| Excel [ ] / Zbx [ ] | Sftp pmsi - VM - VS8000319 (Win · QA · C | departamento | DCH | DTI |  |

## 7. Tags AUSENTES (aplicar valor do inventário — baixo risco)

| ✓ | Host | Tag | Valor proposto |
|---|---|---|---|
| [ ] | GUEST-OS - PMSI -  VS8000704 (PMSI - CEPH) | servico | CEPH |
| [ ] | PLAT - Web - VS8000703 (PMSI - Load Balancer  | servico | NGINX |
| [ ] | SO - Compute - VS9000352 (KMS/VAMT Server) | servico | KMS |
| [ ] | GUEST-OS - PMSI - VS8000709 (PMSI - Compute N | servico | COMPUTE NODES |
| [ ] | GUEST-OS - PMSI - VS8000710 (PMSI - Compute N | servico | COMPUTE NODES |
| [ ] | GUESTO-OS - PMSI - VS8000702 (PMSI - Master N | servico | MASTER NODE |
| [ ] | sv9000204 (Vcenter PRD) | servico | VMWARE VCENTER |
| [ ] | APP - Compute - VS8000409 (Talentia - BD) | servico | TALENTIA |
| [ ] | GUEST-OS - PMSI - VS8000708 (PMSI - Compute N | servico | COMPUTE NODES |
| [ ] | GUEST-OS - PMSI - VS8000713 (PMSI - Master No | servico | MASTER NODE |
| [ ] | GUEST-OS - PMSI - VS8000711 (PMSI - Compute N | servico | COMPUTE NODES |
| [ ] | APP - Compute - VS8000855 (Sigcap Load Balanc | servico | Sigcap |
| [ ] | SO - Compute - VS8000810 (Betbox) | servico | NETBOX |
| [ ] | SO - Compute - VS8000474 (Sistema de Gestão d | servico | SGC |
| [ ] | APP - Compute - VS8000829 (Fircosoft MQ PMSI  | servico | FircosoftMQ |
| [ ] | GUEST-OS - VS8000101 (vProxy VxBlock) | departamento | DTI |
| [ ] | Cpi - VM - VS8000754 (Win · QA · Serviços de  | departamento | DTI |
| [ ] | APP - Compute - VS9000358 (eBanking Audit Sys | departamento | DTI |
| [ ] | tacacsubuntu | departamento | DTI |
| [ ] | GUEST-OS - PMSI -  VS8000704 (PMSI - CEPH) | departamento | PMSI |
| [ ] | PLAT - Web - VS8000703 (PMSI - Load Balancer  | departamento | PMSI |
| [ ] | SO - Compute - VS9000352 (KMS/VAMT Server) | departamento | DTI |
| [ ] | GUEST-OS - VS8000105 (vProxy VxBlock) | departamento | DTI |
| [ ] | GUEST-OS - PMSI - VS8000709 (PMSI - Compute N | departamento | PMSI |
| [ ] | GUEST-OS - PMSI - VS8000710 (PMSI - Compute N | departamento | PMSI |
| [ ] | GUESTO-OS - PMSI - VS8000702 (PMSI - Master N | departamento | PMSI |
| [ ] | Ebankit - VM - VS8000720 (Win · QA · Camada A | departamento | DSE |
| [ ] | Ebankit - VM - VS8000722 (Win · QA · Bases de | departamento | DSE |
| [ ] | GUEST-OS - VS8000110 (vProxy VxBlock) | departamento | DTI |
| [ ] | sv9000204 (Vcenter PRD) | departamento | DTI |
| [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | departamento | DTI |
| [ ] | GUEST-OS - VS8000111 (vProxy VxBlock) | departamento | DTI |
| [ ] | GUEST-OS - PMSI - VS8000ASSECO (ACM Jump Serv | departamento | PMSI |
| [ ] | APP - Compute - VS8000409 (Talentia - BD) | departamento | DCH |
| [ ] | GUEST-OS - PMSI - VS8000708 (PMSI - Compute N | departamento | PMSI |
| [ ] | Ebankit - VM - VS8000721 (Win · QA · Camada A | departamento | DSE |
| [ ] | GUEST-OS - PMSI - VS8000713 (PMSI - Master No | departamento | PMSI |
| [ ] | APP - Compute - VS8000735 (Whatsaap BPC | Loa | departamento | DSE |
| [ ] | GUEST-OS - PMSI - VS8000711 (PMSI - Compute N | departamento | PMSI |
| [ ] | Ebankit - VM - VS8000737 (Win · Produção · Ba | departamento | DSE |
| [ ] | APP - Compute - VS8000789 (SACC) | departamento | DTI |
| [ ] | SO - Compute - VS8000810 (Betbox) | departamento | DTI |
| [ ] | PLAT - Mgmt - Zabbix server | departamento | DTI |
| [ ] | Ebankit - VM - VS8000738 (Win · Produção · Ba | departamento | DSE |
| [ ] | APP - Compute - VS8000294 (BFTeller) | departamento | DTI |
| [ ] | SO - Compute - VS8000474 (Sistema de Gestão d | departamento | DTM |
| [ ] | APP - Network - VS8000740 (Whatsaap BPC | Loa | departamento | DSE |
| [ ] | APP - Compute - VS8000829 (Fircosoft MQ PMSI  | departamento | PMSI |
| [ ] | Ebankit - VM - VS8000742 (Win · Produção · In | departamento | DSE |
| [ ] | Ebankit audit system - VM - VS9000494 (Win ·  | departamento | DTI |
| [ ] | GUEST-OS - VS8000101 (vProxy VxBlock) | vcenter_cluster | Cluster Swift |
| [ ] | Cpi - VM - VS8000754 (Win · QA · Serviços de  | vcenter_cluster | CS9000002 |
| [ ] | APP - Compute - VS9000358 (eBanking Audit Sys | vcenter_cluster | CS9000002 |
| [ ] | tacacsubuntu | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - PMSI -  VS8000704 (PMSI - CEPH) | vcenter_cluster | CS9000002 |
| [ ] | PLAT - Web - VS8000703 (PMSI - Load Balancer  | vcenter_cluster | CS9000002 |
| [ ] | SO - Compute - VS9000352 (KMS/VAMT Server) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - VS8000105 (vProxy VxBlock) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - PMSI - VS8000709 (PMSI - Compute N | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - PMSI - VS8000710 (PMSI - Compute N | vcenter_cluster | CS9000002 |
| [ ] | GUESTO-OS - PMSI - VS8000702 (PMSI - Master N | vcenter_cluster | CS9000002 |
| [ ] | Ebankit - VM - VS8000720 (Win · QA · Camada A | vcenter_cluster | CS9000002 |
| [ ] | Ebankit - VM - VS8000722 (Win · QA · Bases de | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - VS8000110 (vProxy VxBlock) | vcenter_cluster | CS9000002 |
| [ ] | sv9000204 (Vcenter PRD) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - VS8000111 (vProxy VxBlock) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - PMSI - VS8000ASSECO (ACM Jump Serv | vcenter_cluster | CS9000002 |
| [ ] | APP - Compute - VS8000409 (Talentia - BD) | vcenter_cluster | CS9000002 |
| [ ] | GUEST-OS - PMSI - VS8000708 (PMSI - Compute N | vcenter_cluster | CS9000002 |
| [ ] | Ebankit - VM - VS8000721 (Win · QA · Camada A | vcenter_cluster | CS9000002 |
| [ ] | APP - Compute - VS8000138 (Swift - Token Serv | vcenter_cluster | Cluster-Swift |
| [ ] | GUEST-OS - VS8000122 (vProxy PowerFlex) | vcenter_cluster | CLS-MGMT |
| [ ] | GUEST-OS - PMSI - VS8000713 (PMSI - Master No | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Compute - VS8000735 (Whatsaap BPC | Loa | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000727 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | GUEST-OS - PMSI - VS8000711 (PMSI - Compute N | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Compute - VS8000855 (Sigcap Load Balanc | vcenter_cluster | CLS-BPC01 |
| [ ] | GUEST-OS - VS8000100 (vProxy PowerFlex) | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000731 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | GUEST-OS - VS8000121 (vProxy PowerFlex) | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000737 (Win · Produção · Ba | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Compute - VS8000789 (SACC) | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000728 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000725 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | SO - Compute - VS8000810 (Betbox) | vcenter_cluster | CLS-BPC01 |
| [ ] | PLAT - Mgmt - Zabbix server | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000729 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000738 (Win · Produção · Ba | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000730 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Compute - VS8000294 (BFTeller) | vcenter_cluster | CLS-BPC01 |
| [ ] | SO - Compute - VS8000474 (Sistema de Gestão d | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000724 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Network - VS8000740 (Whatsaap BPC | Loa | vcenter_cluster | CLS-BPC01 |
| [ ] | GUEST-OS - VS8000120 (vProxy PowerFlex) | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000726 (Win · Produção · Ca | vcenter_cluster | CLS-BPC01 |
| [ ] | APP - Compute - VS8000829 (Fircosoft MQ PMSI  | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit - VM - VS8000742 (Win · Produção · In | vcenter_cluster | CLS-BPC01 |
| [ ] | Ebankit audit system - VM - VS9000494 (Win ·  | vcenter_cluster | CS9000002 |

## 8. Reintegrar no domínio 03 (aditivo — não remove grupos atuais)

| ✓ | Host | hostid | Grupos atuais |
|---|---|---|---|
| [ ] | GUEST-OS - VS8000101 (vProxy VxBlock) | 11914 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | SWIFT - VM - VS8000142 (Win · Produção · Cama | 11996 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Emc networker - VM - VS8000108 (Win · Produçã | 10627 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sophos - VM - VS8000219 (Win · Produção · Ser | 10619 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | tacacsubuntu | 11912 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | VMware - VM - VS8000145_vProxy-EMC Networker  | 14290 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VD5000PD001 (Win · Produçã | 14161 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000105 (vProxy VxBlock) | 11915 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Backup exe - VM - VS9000381 (Win · Operações  | 14078 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump Server - VM - VD5000JUMP04 (Win · Produç | 14164 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sem-Classificação - VM - VeeamRepo (A-CLASSIF | 14236 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VS8000528 (Win · Produção  | 14163 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VS9000507 (Win · Produção  | 10547 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | SWIFT - VM - VS8000127 (Win · Produção · Segu | 11737 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Observer - VM - Observer_PRD (Linux · Produçã | 14179 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000110 (vProxy VxBlock) | 11917 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | sv9000204 (Vcenter PRD) | 11877 | BPC/DOMINIO/01 Virtualizacao |
| [ ] | GUEST-OS - VS8000109 (vProxy VxBlock) | 11916 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000111 (vProxy VxBlock) | 11918 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - PMSI - VS8000ASSECO (ACM Jump Serv | 11956 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VS9000506 (Win · Produção  | 10548 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VS9000509 (Win · Produção  | 10537 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sem-Classificação - VM - VEEAM-VXBLOCK (A-CLA | 14218 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Veeam - VM - VeeamSA (Linux · Produção · Serv | 14270 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Servidor ftp - VM - VS9000711 (Win · Produção | 14242 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VD5000UCALL005 (Win · Prod | 14162 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VS9000508 (Win · Produção  | 10630 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | sv9000206 (vCenter PowerFlex) | 11900 | BPC/DOMINIO/01 Virtualizacao |
| [ ] | GUEST-OS - VS8000122 (vProxy PowerFlex) | 11919 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sftpcall manager - VM - VS8000ubuntu (Linux · | 14243 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Fileserver_sharepoint_migration - VM - VS8000 | 14129 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | PowerFlex - VM - JumpServer (Win · Produção · | 14204 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | File server - VM - VS9000106 (Win · Produção  | 11972 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sophos - VM - VS8000218 (Win · Produção · Ser | 10587 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Servidortftp - VM - VS9000282 (Win · Produção | 10605 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VD5000AJ012 (Win · Produçã | 14158 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Jump server - VM - VD5000JM003 (Win · Produçã | 14160 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000100 (vProxy PowerFlex) | 11920 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000121 (vProxy PowerFlex) | 11922 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Zabbix - VM - VS8000932 (Linux · Produção · S | 14275 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Prtgnetwork - VM - VS9000403 (Win · Produção  | 10539 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Integrador/Bastionnode - VM - VS8000816 (Linu | 14149 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | VMware - VM - VS8000116_vProxy-EMC Networker  | 14286 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | PLAT - Mgmt - Zabbix server | 10084 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | VMware - VM - VS8000114_vProxy-EMC Networker  | 14285 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Imperva - VM - VS8000487 (Linux · Produção ·  | 14143 | BPC/DOMINIO/05 Seguranca |
| [ ] | Ftp - VM - VS8000363 (Win · Produção · Serviç | 10540 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Graylog - VM - graylog-vm01 (Linux · Produção | 14136 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Imperva - VM - VS8000485 (Linux · Produção ·  | 14141 | BPC/DOMINIO/05 Seguranca |
| [ ] | Jump server - VM - VD5000AVG0014 (Win · Produ | 14159 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | File server - VM - VS9000105 (Win · Produção  | 10536 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Graylog - VM - graylog-vm02 (Linux · Produção | 14137 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sem-Classificação - VM - VEEAM-POWERFLEX (A-C | 14217 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Imperva - VM - VS8000486 (Linux · Produção ·  | 14142 | BPC/DOMINIO/05 Seguranca |
| [ ] | System center - VM - VS8000221 (Win · Produçã | 11682 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | GUEST-OS - VS8000120 (vProxy PowerFlex) | 11921 | BPC/DOMINIO/10 Servicos de Suporte |
| [ ] | Sem-Classificação - VM - Teste Kea DHCP (A-CL | 14282 | BPC/DOMINIO/10 Servicos de Suporte |

## 9. Grupos de serviço (criar onde novo + adicionar membros; aditivo)

- [ ] `BPC/DOMINIO/05 Seguranca` — 5 hosts
  - VS8000487, VS8000485, VS8000486, VS8000481, VS8000257
- [ ] `BPC/DOMINIO/07 APIs e Servicos de Negocio` — 51 hosts
  - ibm-cp-storage-03, ibm-cp-worker-03, ibm-cp-infra-03, ibm-cp-storage-01, ibm-cp-worker-06, ibm-cp-worker-04, ibm-cp-worker-01, ibm-cp-worker-05, ibm-cp-infra-02, ibm-cp-master-01, ibm-cp-master-03, ibm-cp-worker-08 … +39
- [ ] `BPC/DOMINIO/10 Servicos de Suporte` — 90 hosts
  - VS8000142, VD5000PD001, VD5000JUMP04, VS8000528, VS9000507, VS9000506, VS9000509, VD5000UCALL005, VS9000508, JumpServer, VD5000AJ012, VD5000JM003 … +78
- [ ] **NOVO** `BPC/SERVICO/ACM` — 17 hosts
  - VS8000770, VS8000750, VS8000761, VS8000517, VS8000780, VS8000516, VS8000345, VS8000483, VS8000749, VS8000520, VS8000482, VS8000748 … +5
- [ ] **NOVO** `BPC/SERVICO/APLICACOES INTERNAS` — 4 hosts
  - VS8000305, VS8000430, VS8000304, VS8000414
- [ ] **NOVO** `BPC/SERVICO/CREDITQUEST` — 4 hosts
  - VS8000112, VS8000823, VS8000831, VS8000822
- [ ] **NOVO** `BPC/SERVICO/DIGIWAVE` — 16 hosts
  - VS8000503, VS8000504, VS8000506, VS8000507, VS8000508, VS8000502, VS8000490, VS8000491, VS8000509, VS8000505, VS8000835, VS8000836 … +4
- [ ] **NOVO** `BPC/SERVICO/EBANKIT` — 16 hosts
  - VS8000720, VS8000722, VS8000721, VS8000735, VS8000727, VS8000731, VS8000737, VS8000728, VS8000725, VS8000729, VS8000738, VS8000730 … +4
- [ ] **NOVO** `BPC/SERVICO/ELASTIC SEARCH` — 11 hosts
  - VS8000779, VS8000785, VS8000776, VS8000777, VS8000775, VS8000773, VS8000774, VS8000136, VS8000135, VS8000137, VS8000772
- [ ] **NOVO** `BPC/SERVICO/ESSENCE` — 9 hosts
  - VS8000513, VS8000510, VS8000512, VS8000526, VS8000514, VS8000743, VS8000515, VS8000510 Clone, VS8000746
- [ ] **NOVO** `BPC/SERVICO/EXCEL REPORT` — 5 hosts
  - VS8000807, VS8000809, VS8000330, VS8000808_Excel Report, VS8000806_Excel Report
- [ ] **NOVO** `BPC/SERVICO/FINANTECH` — 8 hosts
  - VS8000757, VS8000758, VS8000756, VS8000764, VS8000766, VS8000765, VS8000759, VS8000767
- [ ] **NOVO** `BPC/SERVICO/FIRCOSOFT` — 6 hosts
  - VS8000499, VS8000495, VS8000494, VS8000496, VS8000498, VS8000497
- [ ] **NOVO** `BPC/SERVICO/OPTICS` — 4 hosts
  - VS8000488, VS8000489, VS8000500, VS8000501
- [ ] **NOVO** `BPC/SERVICO/PRIMAVERA` — 5 hosts
  - VS6000100, VS6000101, VS6000100_CLONE_PDD_CLIENTE_DTI, VS6000101_CLONE_PDD_CLIENTE_DTI, VS8000791
- [ ] **NOVO** `BPC/SERVICO/SACC` — 4 hosts
  - VS8000134, VS8000789, VS8000347, VS8000867
- [ ] **NOVO** `BPC/SERVICO/SDVM` — 4 hosts
  - VS8000534, VS8000530, VS8000533, VS8000531
- [ ] **NOVO** `BPC/SERVICO/SGC` — 4 hosts
  - VS8000475, VS9000309, vs8000474, VS8000476
- [ ] **NOVO** `BPC/SERVICO/SIGCAP` — 16 hosts
  - VS8000781, VS8000783, VS8000752, VS8000753, VS8000751, VS8000312, vs8000855, VS8000412, VS8000848, VS8000843, VS8000844, VS8000841 … +4
- [ ] **NOVO** `BPC/SERVICO/SIRIS` — 8 hosts
  - VS8000225, VS8000227, VS8000837, VS8000226, VS8000838, VS8000224, VS8000839, VS8000840
- [ ] **NOVO** `BPC/SERVICO/SWIFT` — 17 hosts
  - VS8000324, VS8000141, VS8000140, VS8000124, VS9000312, VS9000239, VS8000125, VS9000242, VS8000127, VS9000316, VS8000123, VS8000317 … +5
- [ ] **NOVO** `BPC/SERVICO/TALENTIA` — 6 hosts
  - VS9000319, VS8000409, VS9000318, VS8000434, VS8000342, VS8000343
- [ ] **NOVO** `BPC/SERVICO/TOBE` — 11 hosts
  - VS8000912, VS8000923, VS8000852, VS8000849, VS9000424, VS8000113, VS8000454, VS8000851, VS8000413, VS8000427, VS8000850

## 10. Decisões de política (aplicam-se em lote depois de decididas)

- **tag esxi_host** — 98 hosts com valor obsoleto (DRS/vMotion)
  - [ ] remover a tag
  - [ ] automatizar via VMware discovery
  - [ ] manter e aceitar drift
- **vocabulario ambiente** — Zabbix usa QA/Producao; anotacoes usam P/Q
  - [ ] padronizar QA/PRD
  - [ ] padronizar Qualidade/Producao
- **12+2 divergencias Qualidade vs Producao** — inclui vProxy LQI — anotacao do vCenter parece errada nesses
  - [ ] corrigir tag Zabbix
  - [ ] corrigir anotacao no vCenter (fora do Zabbix)
