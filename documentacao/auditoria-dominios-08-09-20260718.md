# Auditoria de dados + N2 dos domínios 08 (Datacenter Físico) e 09 (Integração)

Data: 2026-07-18. Antes de construir os N2 destes 2 domínios (os "N2 em
construção" do N1), auditoria dos dados reais (`item.get`, fonte de verdade).

## Domínio 08 · Datacenter Físico (grupo 665, 30 hosts)

### Achado: 70% estava sem monitoria nenhuma
Antes desta sessão, dos 30 hosts físicos:
- **SNMP rico** (saúde real): 2 UCS Manager (PRD01/02, 1493 items cada:
  blades, fan, temp, PSU) + svucs020084 (87 items).
- **Quase nada**: 4 "FIS - Compute" IBM Power/Service Processor (9 items ≈ ICMP).
- **ZERO items**: 23 hosts — **22 estavam DESACTIVADOS no Zabbix** (`status=1`),
  1 activo sem template. Incluíam **IBM Power E980/720×2/770** (suspeitos de
  correr o core bancário / AS-400), a **consola HMC**, e os **14 nós PowerFlex
  Dell R650**. Sem sequer ICMP — ninguém sabia se estavam de pé.

### Correcção aplicada (fechar o ping-gap, aprovado 2026-07-18)
Script `fechar_pinggap_dc_20260718.py`: activou os 22 + adicionou `BPC Ping`
(ICMP) aos 23 (o svucs015644 já tinha icmpping do template UCS → só activado).
Risco de flood: nulo (mediatype Email OFF, nenhuma action dispara). Backup em
`documentacao/backup-pinggap-dc-*.json` (reversível: repor status=1).

### Resultado — disponibilidade real a partir do servidor Zabbix
**26 UP / 4 DOWN** (primeiro polling):
- ✅ **UP**: IBM Power E980, 720#1, 770; todos os 14 PowerFlex; ambos UCS;
  Dell EMC PE; Service Processor 2.
- 🔴 **DOWN (o servidor não alcança — ESCALAR)**: `IBM Power 2` (FIS-Compute),
  `Service Processor 1`, `IBM Power 720 #2` (10.10.241.53), `IBM HMC` (10.10.126.97).
  A HMC está na mesma subnet do servidor (10.10.126.x) e mesmo assim não
  responde → ou está down ou ICMP filtrado. **Verificar com a equipa física**:
  firewall, descomissionado, ou genuinamente em baixo?

Nota: há provável **duplicação** entre os hosts "FIS - Compute - IBM Power/
Power 2/Service Processor 1/2" (antigos, 9 items) e os "IBM Power E980/720/770"
(inventário novo) — podem ser os mesmos servidores físicos representados 2×.
Candidato a consolidação (só documentado, sem acção).

### N2 08 — desenho (a construir, agora desbloqueado)
Modelo de fonte-de-dados (tier), como o domínio Bases de Dados:
- KPI: nº por tier (SNMP-rico / só-ICMP) + nº UP/DOWN.
- Tabela de hosts com tier honesto + disponibilidade ICMP + (onde há SNMP)
  saúde de fan/temp/PSU do UCS.
- Painel de triggers do grupo 665.

## Domínio 09 · Integração e APIs (grupo 689, 19 hosts)

Todos com métricas de VM (14 Linux + 5 Windows com agente, todos VMware Guest):
CPU (241 items), disco (159), memória (92), rede (30), vmware.* (442).
Componentes: **EAI×7, Elasticsearch×3, Kafka×2, CEPH×2, NiFi×2**, Bastion,
Master, Compute. **Zero métricas de plataforma** (filas Kafka, fluxos NiFi,
endpoints ESB) — gap conhecido; a monitoria de plataforma é trabalho futuro.

### N2 09 — desenho (a construir agora)
Saúde-de-VM por componente:
- KPI: nº de VMs por componente + estado agregado.
- Tabela por componente (Kafka/NiFi/Elastic/CEPH/EAI): CPU/RAM/disco/
  disponibilidade da VM.
- Triggers do grupo 689.
- Nota explícita do gap de monitoria de plataforma (aparece como tier
  "sem sinal de plataforma", igual ao modelo do domínio BD).

## Pastas Grafana
As pastas `08` e `09` não existem no Grafana — criadas no processo de build
dos N2 (com os `folderUid` a registar no CLAUDE.md quando criadas).
