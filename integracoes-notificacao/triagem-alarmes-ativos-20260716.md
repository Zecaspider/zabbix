# Triagem dos alarmes ativos — 2026-07-16

Levantamento completo dos problemas ativos nas 2 instâncias, agrupados por
domínio e padrão de trigger, classificados em **4 baldes**:
**A** = incidente/risco real (escalar, NÃO mexer na trigger) ·
**B** = resolver operacionalmente (higiene de inventário/host) ·
**C** = suprimir por configuração ·
**D** = calibrar limiar.

Totais no momento do snapshot: **Infra 398 ativos** · **Network 953 ativos**.
A idade mediana de meses na maioria dos padrões mostra que a lista de
problemas é hoje um backlog não triado — ninguém fecha nem responde.

## INFRA (398)

### A — Incidente/risco real (escalar aos donos; trigger está certa)

| Padrão | Qtd | Idade mediana | Nota |
|---|---|---|---|
| VMware "Datastore free space (critically) low" — Data-DBS, Data-APP, Data-INF, DATA-EXCH, EXH-VS, Veeam-Backup, DATA_UNT... | **~157** | **74 dias** | Capacidade real esgotando há 2,5 meses. A contagem é inflacionada porque **cada datastore partilhado alerta em cada hypervisor que o monta** (~6×) — são ~15-20 datastores únicos. Ação dupla: (1) equipa de virtualização tratar capacidade; (2) de-duplicar via dependência/alerta só no vCenter, não por hypervisor |
| Discos de VM criticamente cheios (SSS_X64FREV 11×, WIN, EXCHANGESERVER, SqlSetup...) | ~16 | 53-91d | Discos realmente cheios há meses — limpar/expandir |
| Zabbix server: http poller >75% (8,4d) · value cache em low memory mode (29d) · >1000 items sem dados (29d) | 3 | 8-29d | **Auto-diagnóstico do próprio servidor** — consistente com a causa-raiz da secção 0.1 do plano (StartHTTPPollers + adicionar ValueCacheSize) |
| "Microsoft Defender Antivirus/Core Service is not running" | 2 | 20d | Antivírus parado em VM de produção há 20 dias — **segurança**, escalar (era achado conhecido da auditoria Z.27-Z.36, continua) |
| VMware: Root password expired / expires (ESXi) | 2 | 80d | Já conhecido da auditoria de 2026-07-07 — continua por resolver |
| VMware: Failover Failed Alarm · Host hardware system board status · health Red | 4 | 0,3-80d | Verificar no vCenter |
| Kea HA degradado (DHCP) | 1 | 1d | Recente — verificar par HA do DHCP |
| [L1] 9 serviços indisponíveis (Disaster) | 9 | 0,5d mediana | **Já investigado — secção 0.1 do plano** (BNA RTGS 503 real; restantes ambíguos com poller saturado) |

### B — Resolver operacionalmente (higiene de inventário)

| Padrão | Qtd | Idade | Ação |
|---|---|---|---|
| **"Zabbix agent is not available"** (03: 126 · 06: 25 · 10: 10) | **161** | **81d** | O maior bloco da Infra (40%). Cruzar com o handoff de recuperação de agentes (Fase 14): para cada host, ou recupera-se o agente, ou o host está morto/desativado e deve ser **desativado no Zabbix**. Enquanto ficarem ativos, qualquer dashboard/notificação mente |
| "Unavailable by ICMP ping" (03: 38 + outros) | ~45 | 53-90d | Mesmo tratamento: VM/host morto → desativar; vivo → investigar rede |
| System time out of sync | 7 | 75d | Consertar NTP nas VMs |
| Serviços Windows parados genuínos (SQL Server Agent FORGEST, SQL Browser, Task Scheduler, WinRM, OracleServiceRMANQA) | ~6 | 14-103d | Confirmar com dono se deviam correr; ligar ou mudar startup type |
| High swap space usage | 6 | 55d | Investigar pressão de memória (2 estão com severidade Not-classified — anomalia de config) |

### C — Suprimir por configuração

| Padrão | Qtd | Mecanismo |
|---|---|---|
| Discos temporários do **EMC NetWorker** (`C:\Program Files\EMC NetWorker\nsr\tmp\...`, BBBMountPoint) | 6 (2 domínios) | Volumes de snapshot de backup montados temporariamente disparam "disk critically low" — falso positivo estrutural. Adicionar `EMC NetWorker` ao `{$VFS.FS.FSNAME.NOT_MATCHES}` do template Windows (ou por host nos servidores de backup) |
| "Google Updater Service/Internal is not running" · "Microsoft Edge Update" | 3 | 92d | Serviços de updater que o discovery apanhou — adicionar aos regex `{$SERVICE.NAME.NOT_MATCHES}` (o default do template já exclui `gupdate`/`edgeupdate` mas estas variantes novas `GoogleUpdaterService#`/`edgeupdate` renomeadas escapam) |
| "System name has changed" | 3 | 1,5d | Info de renomeação — fechar manualmente (é evento pontual, `manual_close`) |

### D — Calibrar

Nada relevante na Infra nesta rodada (os casos de calibração do top-15 de
eventos — disco SWIFT, UCS, paging — já foram aplicados; ver plano §5.6).

## NETWORK (953)

### A — Incidente/risco real (hardware avariado, ignorado há meses)

| Padrão | Qtd | Idade | Nota |
|---|---|---|---|
| **Cisco Nexus: PowerSupply-# Fan down + PSU off/out of optimal** (DC Fabric!) | 2 | **339 dias** | Um switch Spine-Leaf do datacenter com PSU/fan avariado há ~1 ano — redundância comprometida no core. **Escalar já** |
| Fan is in critical state (4 routers agência + 2 edifícios) | 6 | 55-225d | Fans avariados — equipamento vai sobreaquecer; trocar hardware |
| IP SLA # on DC1-RTE-WAN-INT is not OK | 1 | **237d** | Sonda de qualidade de link da borda DC em falha há 8 meses — ou o alvo do SLA morreu (recalibrar sonda) ou há problema real de caminho |
| Temp: CPU Die R#: above critical (DC router borda) | 1 | 1,5d | Recente e no core — verificar |
| C# AC-POE Power Supply warning | 1 | 23d | Fonte PoE em warning |
| Power/PSU restarts recentes ("has been restarted") | 3 | 2-60d | Reinícios de router — verificar energia local |
| Unavailable by ICMP ping (28 routers agência, mediana 0,2d!) | 32 | 0,2d (22 recentes) | **28 agências offline agora** — mas é 22h30 em Angola: pode ser padrão noturno (agência desliga energia). Verificar se recuperam de manhã; os 6 com >7d são casos crónicos a tratar como inventário |
| Nexus Processor High memory | 3 | 80d | Verificar utilização real dos switches |

### C — Suprimir por configuração (o grosso: ~875 de 953)

| Padrão | Qtd | Idade | Mecanismo |
|---|---|---|---|
| **Interface *: Link down** (agências 275+66, edifícios 243+10, borda 1) | **595** | 20-210d | Portas de acesso mortas permanentes (PC desligado, porta vaga, equipamento removido). Política pendente do plano §5.6: `{$IFCONTROL:"<if>"}=0` porta a porta é inviável a esta escala — o caminho certo é **filtro no LLD** (descobrir/alertar link-down só em uplinks/WAN, por regex de ifAlias — ex. só interfaces com alias `*UPLINK*`, `Tu*`, `WAN*`) ou desativar o trigger prototype de link-down nos templates de switch de acesso. Requer convenção de nomenclatura de ifAlias — **decisão de política com a equipa de redes** |
| **Interface *: Ethernet changed to lower speed** | **265** | 118-220d | Severidade Info; renegociação permanente de velocidade (dispositivos 100Mb em portas Gb). Enquanto as actions futuras filtrarem severidade ≥ Warning, não notifica — mas polui a lista. Candidato a desativar o prototype ou fechar em massa |
| Interface *: In half-duplex mode | 17 | 289-342d | Mismatch de duplex crónico — ou corrigir a ponta (operacional) ou suprimir se for hardware legado aceite |
| System name changed / No SNMP data (287d, 261d) | 2 | ~270d | Fechar/investigar coleta |

### D — Calibrar

| Padrão | Qtd | Nota |
|---|---|---|
| SW##, Sensor GREEN: Temperature above warning (8× switches agência) + HotSpot Temp (4× edifícios) | 12 | Mesma classe do Homewood/UCS: verificar se o limiar do contexto do sensor é adequado ao spec — investigação análoga à já feita (history 7d vs macro) antes de mexer |
| CPU: Temperature is too low (2× routers agência, 342d!) | 2 | Sensor a reportar "too low" há 1 ano = leitura sem sentido (sensor avariado ou `{$TEMP_CRIT_LOW}` inadequado ao ambiente) — calibrar ou desativar o sensor |

## Síntese executiva

| | Infra | Network |
|---|---|---|
| Ativos | 398 | 953 |
| A — incidente/risco real | ~185 (46%) — dominado por datastores (157, dedup → ~15-20 reais) | ~49 (5%) — mas inclui hardware do core avariado há 1 ano |
| B — higiene inventário | ~206 (52%) — agentes/hosts mortos | ~6 crónicos de ICMP |
| C — suprimir | ~9 | **~875 (92%)** |
| D — calibrar | 0 (já feitos) | ~14 |

**Leitura para o plano de notificações**: ligar qualquer canal hoje, mesmo
com as actions bem desenhadas, despejaria este backlog nos destinatários.
A sequência continua a do plano (F0/F1): (1) escalar os itens A, (2) limpar
o inventário B (agentes/hosts mortos — 206 problemas somem), (3) política de
link-down/lower-speed com a equipa de redes (875 somem), (4) calibrar os D.
Feito isso, a lista de ativos cai de ~1.350 para ~50-80 problemas
verdadeiros — number defensável para operar notificação.

## Execução — o que esta sessão pode fazer via API (com aprovação caso a caso)

1. Filtro `{$VFS.FS.FSNAME.NOT_MATCHES}` para EMC NetWorker (Infra, template ou hosts de backup).
2. Regex `{$SERVICE.NAME.NOT_MATCHES}` para updaters (Infra, template Windows).
3. Fechos manuais em massa dos "System name changed" (evento pontual).
4. Investigação análoga ao Homewood para os sensores GREEN/HotSpot (Network).
5. Levantamento host a host dos 161 agentes mortos (lista para decisão desativar/recuperar).

O resto (datastores, hardware, política de portas, NTP, serviços) é
operacional/decisão de equipa — fora do Zabbix.
