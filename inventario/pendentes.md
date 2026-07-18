# Pendentes — consolidado para decisão (2026-07-17)

## ATUALIZAÇÃO (fim do dia 2026-07-17) — o que se resolveu/esclareceu

- **2.2** confirmado: `10.10.236.12` é do VS8000219 (live); VS9000346 não
  existe no vCenter → fica desativado. Sem ação.
- **2.3 APLICADO**: IP `10.10.203.76` é do VS8000816; o host VS8000711
  passou a interface DNS (deixou de medir a máquina errada). Backup
  backup-2.3-vs8000711.json.
- **2.6 APLICADO**: tag `esxi_host` removida de 420 hosts
  (remover_esxi_host.py; backup+verif OK).
- **2.7 NÃO é regressão**: dos 26 `A-CLASSIFICAR`, ZERO têm código na
  anotação para derivar — é o resíduo irredutível, precisa de levantamento
  humano (não algo que se perdeu).
- **3.1 reclassificado**: dos 24 "cat A", ~18 já coletam os itens base (os
  erros eram só de itens calculados/triggers sem histórico — hosts a
  aquecer); **6 são Z.8** (macro do vCenter PowerFlex 10.10.232.84 com a
  credencial `agonzaga` quebrada → itens vmware.vm.* dão "incorrect
  password"). Ou seja 3.1 NÃO tinha problema de agente — junta-se ao Bloco 1.
- **3.2 mapeado** (acesso-vms.json, scan de portas, sem auth em massa para
  não accionar lockout AD): dos 94 cat B, **Linux 71/75 com SSH aberto**
  (instalável via SSH/Ansible), Windows 10 WinRM + 4 RDP + 4 sem via. É a
  base para a campanha de instalação do agente.
- **3.3/3.4 esgotado por meios automáticos**: DNS local não resolve
  (falta search domain) e o vCenter guest tools não reporta IPv4 nesses
  (tools off) ou são PowerFlex (Z.8). Os IPs em falta só via consola da
  VM/donos ou Z.8.

---



Tudo o que ficou por resolver nas rodadas de reconciliação/correção, com a
solução provável recomendada. Colunas: **Rec.** = a minha recomendação;
**Decisão** = o que precisas de dizer para eu avançar (ou delegar).

## Bloco 1 — Bloqueados pela credencial do PowerFlex (Z.8)

| # | Pendente | Detalhe | Solução provável (Rec.) | Decisão |
|---|---|---|---|---|
| 1.1 | 15 macros UUID por criar | Hosts de VMs PowerFlex; só temos BIOS UUID (inútil na macro) | Corrigir a credencial Z.8 → extract live do PowerFlex → `aplicar_seccao2.py` resolve tudo automaticamente | Priorizar a resolução do Z.8 com quem gere credenciais |
| 1.2 | 18 macros UUID erradas (BIOS) | Idem — hosts que hoje nunca coletam itens VMware | Mesmo caminho do 1.1 | idem |
| 1.3 | 8 tags em conflito (exceção PowerFlex) | §6: valores Zabbix mantidos por não haver vCenter live para confrontar | Após Z.8, reexecutar `comparar_campos.py` + regra "vCenter vence" | idem |
| 1.4 | Gémeas INTEGRADOR sem cobertura | VS8000809/811 do PowerFlex (Kafka/NiFi) não têm host Zabbix (os hosts homónimos monitorizam as VMs PRD) | Após Z.8: criar 2 hosts com UUID/IP corretos do PowerFlex | idem |
| 1.5 | 237 hosts com UUID 50xx sem coleta | Provável: collector não fala com o vCenter PowerFlex | Z.8 deve destravar; confirmar coleta 24-48h depois | idem |

## Bloco 2 — Precisam de decisão/validação TUA (rápidas)

| # | Pendente | Detalhe | Solução provável (Rec.) | Decisão |
|---|---|---|---|---|
| 2.1 | IP do VS8000128 | Zabbix diz `10.10.13.8`; vCenter diz `192.168.8.2` (rede isolada SWIFT, sem ping daqui) | **Manter `10.10.13.8`** — provável NIC de gestão correta; `192.168.8.2` deve ser NIC secundária da rede SWIFT isolada | Confirmar com quem conhece a rede SWIFT |
| 2.2 | IP duplicado `10.10.236.12` | `Sophos VS8000219` e `IBM IB9 VS9000346` partilham o IP | **VS9000346 tem o IP errado** (host já desativado-candidato; o ping "vivo" era o Sophos) → confirmar e deixar desativado | Confirmar qual VM tem realmente o IP |
| 2.3 | IP duplicado `10.10.203.76` | `VS8000711 (PMSI Compute)` e `VS8000816 (Bastion)` partilham o IP | Verificar no vCenter live o `guest_ip` de cada (posso fazer já — read-only) e corrigir o errado | Autorizar a checagem + correção validada |
| 2.4 | 5 hosts §3 retidos com sinais de vida | SCSM_DB e MIM Sync (dados recentes); VS9000319*, IBM IB9*, Support Server (ping) — *2 já explicados (IP era de outra VM / cirurgia feita) | Identificar donos: se SCSM/MIM ainda são usados, ficam; senão desativar | Dizer o destino de SCSM/MIM/Support Server |
| 2.5 | 2 VMs POWERED_OFF não onboardadas | VS8000511, VD5000JD006 (desligadas no vCenter) | **Não criar** hosts; rever no próximo ciclo de reconciliação | Confirmar (default: não criar) |
| 2.6 | Política tag `esxi_host` | 98 valores foram atualizados do live, mas a tag volta a mentir com o próximo vMotion | **Remover a tag**; usar o item `vmware.vm.hv.name` (sempre fresco) | Aprovar remoção OU manter com refresh periódico |
| 2.7 | 26 hosts `ambiente=A-CLASSIFICAR` restantes* | Sem código na anotação para derivar | Levantamento manual com os donos; ou herdar do serviço (ex.: tudo do serviço X = Produção) | Escolher abordagem |

## Bloco 3 — Ação operacional (equipa das VMs / rede; fora do alcance da API)

| # | Pendente | Detalhe | Solução provável (Rec.) | Decisão |
|---|---|---|---|---|
| 3.1 | 24 hosts (cat. A) — agente vivo, Zabbix sem dado | Porta 10050 responde daqui, mas o server não recebe | Verificar `Hostname=` no agentd.conf vs nome do host Zabbix; firewall VM→server | Encaminhar à equipa Zabbix/VM |
| 3.2 | 94 hosts (cat. B) — agente não responde | Ping OK, 10050 fechada — agente não instalado/parado (inclui 43 dos Linux recém-templados) | Campanha de instalação/arranque do zabbix-agent2 + firewall 10050 | Encaminhar à equipa dona das VMs (lista pronta no relatório) |
| 3.3 | 29 hosts (cat. C) — sem ping | Inclui 5 onboarded sem IP (vHMC9, VD5000IA007/NP010, VS8000744, VS9000313) | Levantar IPs reais dos 5; confirmar rota/ICMP dos restantes | Encaminhar à rede + donos |
| 3.4 | 8 hosts (cat. D) — só IPv6 link-local | Fircosoft/Digiwave partilham fe80:: idêntico | Obter IPv4 real de cada e corrigir interface | Encaminhar aos donos |
| 3.5 | Confirmação 24-48h | 54 hosts PRD com itens VMware novos sem histórico + 13 hosts §5 pós-troca de template | Reexecutar `verificar_uuid.py`/levantamento amanhã; se continuarem mudos, investigar | Posso agendar/reexecutar quando pedires |

## Bloco 4 — Entregas a terceiros (não mexemos)

| # | Pendente | Detalhe | Solução provável (Rec.) | Decisão |
|---|---|---|---|---|
| 4.1 | Lista C1-C5 de anotações erradas no vCenter | vProxyr/LQI, 8 códigos com SO trocado, typos, anotações pobres (proposta-politicas.md) | Entregar à equipa dona do vCenter como lista de melhoria | Enviar a lista (por ti) |
| 4.2 | Credenciais em texto plano no repo | vCenters, Unity, BDs SQL em `scripts-a-analisar/` (+ histórico git) | Rotacionar passwords + migrar pipeline p/ ficheiro fora do repo (chip de tarefa já criado) | Priorizar rotação |
| 4.3 | 25 VMs sem serviço identificável | Nem anotação, nem nome, nem tag (lista em mapa-servicos.json) | Levantamento com os donos; depois tags+grupos | Agendar levantamento |

*2.7: número estimado da última contagem; pode ter baixado com a Fase A (ambiente preenchido onde havia código).
