# Rascunho — Email: Solicitar credenciais de acesso ao vCenter02

---

**Para:** [responsável pela infraestrutura VMware / equipa de virtualização]  
**CC:** [gestor NOC / responsável Zabbix]  
**Assunto:** Zabbix Monitoring — Credenciais de acesso ao vCenter02 (10.10.232.84)

---

Boa tarde,

No âmbito da plataforma de monitorização BPC NOC (Zabbix), identificámos um problema
que está a impedir a recolha de dados de **270 servidores virtuais** geridos pelo
**vCenter02** (`10.10.232.84`).

**Sintoma:** o Zabbix VMware Poller não consegue autenticar-se no vCenter02 e reporta
o erro "Cannot complete login due to an incorrect user name or password" em 17 hosts
do grupo de Hypervisores. Como resultado, os itens de monitorização dessas VMs
(estado de energia, CPU, memória, etc.) não têm dados desde a sua criação.

**Conta actualmente configurada:** `agonzaga@vsphere.local`  
**Estado:** autenticação rejeitada pelo vCenter02 — password inválida ou conta expirada/desactivada

---

Para resolver a situação, necessitamos de uma **conta de serviço com acesso de leitura**
ao vCenter02, com as seguintes permissões mínimas:

- **Read-only** a nível de vCenter (suficiente para inventário e métricas)
- Sem necessidade de permissões de escrita ou administração

Se já existir uma conta de serviço dedicada para este fim (equivalente à usada no
vCenter PRD: `administrator@vsphere.local`), agradecemos que nos forneçam:

1. **Username** (formato: `utilizador@dominio` ou `dominio\utilizador`)
2. **Password**
3. **URL de ligação SDK** — confirmar se mantém `https://10.10.232.84/sdk`

Após recebermos as credenciais, a correcção é aplicada em menos de 5 minutos e
os dados das 270 VMs ficam disponíveis na plataforma de monitorização dentro de ~15 minutos.

Ficamos ao dispor para qualquer esclarecimento.

Cumprimentos,  
[Nome]  
BPC NOC — Equipa de Observabilidade

---

*Referência interna: Z.8 — diagnóstico completo em `documentacao/z8-diagnostico-vcenter-credenciais.md`*
