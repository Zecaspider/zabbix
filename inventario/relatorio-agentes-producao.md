# Templates e agentes — VMs de produção (2026-07-17)

318 hosts de produção no domínio 03 (207 Windows, 105 Linux, 6 sem SO
identificado). Gerado por `levantar_templates_agentes.py` +
`validar_agentes.py` (ping + TCP 10050 a partir desta máquina — sinal, não
prova definitiva; o Zabbix server pode ver a rede de forma diferente).

## Já resolvido (lado configuração, aditivo, aplicado)

**44 hosts Linux** tinham confirmado `so=Linux` mas **nenhum template de
agente do SO** (só `VMware Guest` + `BPC Ping`) — Elasticsearch (10),
Graylog, Imperva, DHCP/Stork, INTEGRADOR, etc. Adicionado
`Linux by Zabbix agent active` a todos (aditivo, backup+verificação OK).
**Isto prepara a configuração — não faz o agente arrancar na VM.** 1 destes
já respondia na porta 10050 e deve começar a coletar em breve; os restantes
43 continuam sem o agente instalado/ligado (ver categoria B abaixo).

Nenhum host Windows de produção estava sem template de agente — a lacuna
Windows é 100% operacional (agente declarado, sem dados).

## Pendente — não resolvível por API, precisa de ação na VM/rede

155 hosts de produção têm o template certo mas **sem dados recentes**.
Separados por sinal de rede (ping/porta 10050) para orientar quem for agir:

### A — 24 hosts: agente responde na porta 10050, mas o Zabbix não tem dado
O agente está vivo e acessível **desta máquina**, mas o Zabbix server não
está a receber. Causas típicas: `Hostname=` no `zabbix_agentd.conf` não
bate com o nome do host no Zabbix; firewall específico entre o **Zabbix
server** e a VM (diferente da rota desta máquina); item mal configurado.
**Ação sugerida: confirmar a partir do próprio Zabbix server** (não desta
máquina) e olhar o `Hostname=` do agente.
Exemplos: VS8000711 (PMSI Compute Node), VS8000816 (Bastion), VS8000932
(Zabbix), VS8000138 (Swift Token Server DR), VS8000294 (BFTeller),
VS8000855 (Sigcap LB) — lista completa em
`levantamento-templates-agentes.json` (`ping=true, tcp10050=true` mas
`saude_agente` ≠ ok).

### B — 94 hosts: ping OK, porta 10050 fechada/filtrada
O host está ligado mas o **agente Zabbix não está a responder** — não
instalado, serviço parado, ou firewall a bloquear a porta. É o maior grupo.
Inclui: `Coletas_auditoria_rede`, `Darktrace`, os 3 `Dhcp server`
(Stork), e a maioria dos 43 hosts Linux recém-templados. **Ação: verificar
serviço `zabbix-agent`/`zabbix-agent2` na VM e regra de firewall para
10050/tcp** — trabalho da equipa dona das VMs, fora do alcance da API.

### C — 29 hosts: sem resposta a ping
Rede inacessível a partir desta máquina — pode ser ICMP bloqueado
(comum) ou host realmente inacessível. Inclui os 5 hosts criados na §4 sem
IP conhecido (`vHMC9`, `VD5000IA007/NP010`, `VS8000744`, `VS9000313` — só
têm entrada DNS) e VMs Linux legítimas (Kafka `VS8000868`, etc). **Ação:
confirmar rota de rede / obter IP real para as 5 sem IP.**

### D — 8 hosts: sem IP utilizável para validar
Interface só tem endereço IPv6 link-local (`fe80::...`) — não dá para
testar. **Achado à parte**: `VS8000833/834` (Fircosoftapp) e
`VS8000835/836` (Digiwave) **partilham o mesmo `fe80::8da1:91da:...`** —
não é anómalo por si (link-local não é roteável, cada NIC gera o seu, mas
pode coincidir por vir do mesmo template de VM/vNIC clonado) mas vale
confirmar que cada VM tem mesmo o seu IPv4 principal configurado no Zabbix.

## Achado extra: 2 pares de hosts de produção com o MESMO IPv4

- `10.10.236.12`: `Sophos - VM - VS8000219` **e** `IBM IB9 - VS9000346`
  (este último ainda estava desativado — secção 3, retido por "sinal de
  vida"; **agora faz sentido**: o ping media a resposta da VS8000219, não
  da IBM IB9, que pode estar mesmo morta).
- `10.10.203.76`: `GUEST-OS - PMSI - VS8000711` **e**
  `Integrador/Bastionnode - VS8000816`.

Um dos dois hosts de cada par tem o IP errado no Zabbix (cópia de outro,
ou desatualizado). **Não corrigido** — precisa de confirmação de qual dos
dois é o IP certo (o vCenter live não resolve isto sozinho porque pode ser
um erro de digitação/cópia antigo do lado Zabbix, não do vCenter).

## Resumo para decisão

| Categoria | Hosts | Quem resolve | Ação da API? |
|---|---|---|---|
| Templates Linux em falta | 44 | — | ✅ Aplicado |
| A — agente ok, Zabbix não recebe | 24 | Zabbix admin (Hostname/firewall) | ❌ |
| B — sem agente a responder | 94 | Equipa dona da VM (instalar/arrancar) | ❌ |
| C — sem ping | 29 | Rede / obter IP (5 casos) | ❌ |
| D — só IPv6 link-local | 8 | Confirmar IPv4 real | ❌ |
| IPs duplicados | 2 pares | Investigar qual está certo | ❌ (precisa decisão) |
