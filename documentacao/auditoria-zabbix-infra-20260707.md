# Auditoria Zabbix Infra — 2026-07-07

**Autor:** BPC NOC / Observabilidade
**Âmbito:** Zabbix Infra (`10.10.126.22`, v7.4.8) — auditoria completa de saúde da instância, triagem do backlog de problemas activos, e limpeza de ruído estrutural. Todas as escritas (`*.update`/`*.delete`) foram feitas com aprovação explícita, caso a caso, e precedidas de backup (`bpc-workspace/backup-*.json`).

---

## 1. Números do dia

| Métrica | Início do dia | Fim do dia | Variação |
|---|---:|---:|---:|
| Problemas activos | 589 | **460** | −129 (−22%) |
| Items `unsupported` | 21.310 | **14.583** | −6.727 (−32%) |
| Hosts totais | 650 | **630** | −20 (duplicados removidos) |

---

## 2. O que foi corrigido hoje (referências ao `cronograma.md`)

| # | Achado | Acção |
|---|---|---|
| **Z.27** | ~4.900 items `mssql.*`/`db.odbc.*` órfãos em 12 VMs (rescaldo do unlink-sem-clear do template MSSQL, incidente GLPI anterior) | Apagados (28+56 discovery rules, ~5.400 items, ~3.200 triggers). 226 problemas fantasma fechados |
| **Z.28** | Template `BPC Web Monitoring` — falsos positivos, thresholds apertados (26 hosts sintéticos internos) | Desligado (unlink-and-clear), mantido `BPC Ping`. Fechou os 4 `disaster` do dia (EURONET real, SMS Banking/Sisgenda/Sala Reuniões = endpoints desactualizados) |
| **Z.29** | 19 hosts ESXi **duplicados** (host-prototype LLD fantasma) + causa raiz: `vCenter 02` duplicado de `sv9000206` (mesmo endpoint PowerFlex) | 19 hosts + `vCenter 02` apagados (`host.delete`). −118 problemas. Causa raiz neutralizada — só `sv9000206` continua activo |
| **Z.30** | Template gémeo `BPC Web Monitoring - Externos` (13 hosts: BNA, MINFIN, INSS, EMP, Mundial Seguro, Pumangol), nunca antes auditado | Desligado (unlink-and-clear), mantido `BPC Ping`. Fechou o problema `EMP` (aberto desde 17/04) |
| **fix directo** | LLD `vfs.fs.discovery` do template Windows sem filtro (descobria CD-ROMs/disquetes como discos reais) | Filtro `FSDRIVETYPE=fixed` reposto. Auto-limpa-se em 30 dias |
| **fix directo** | Macro `{$VMWARE.PASSWORD}`/`{$VMWARE.URL}` trocados no host `Vcenter DR` — password exposta em claro via API | Tipos corrigidos (Secret/Text). Achado: o `Vcenter DR` afinal nunca teve endpoint configurado (não é duplicado funcional) |

---

## 3. Achados registados, sem acção Zabbix (fora de âmbito ou pendentes de decisão)

| # | Achado | Estado |
|---|---|---|
| **Z.31** | Password root do vCenter/ESXi PowerFlex (`sv9000206`) expirada desde 27/04 | Acção no vSphere, não no Zabbix |
| **Z.32** | 2 SNMP mortos adicionais (Dell EMC Data Domain, Cisco UCS `015644`) — juntar ao Z.9 | Por investigar |
| **Z.33** | `VS8000704 (PMSI - CEPH)` — swap a ~0% livre há quase 1 ano, dado confirmado fresco | Decisão de arquitectura CEPH, fora do Zabbix |
| **Z.34** | `Canal de denúncias - VS8000741` — Windows Defender desligado há 11 dias | Achado de segurança, escalar à equipa própria |
| **Z.35** | `VS8000758` reporta hostname `VS8000765` — desalinhamento de inventário (não é duplicado, UUIDs diferentes) | Housekeeping, baixa prioridade |
| Cisco UCS `svucs020084` — 18 alertas de temperatura | **Falso positivo confirmado**: threshold genérico (50/60°C) aplicado por engano a sensores de CPU (deveria ter contexto próprio, como já existe para "Ambient"). Ventoinhas confirmadas operacionais, sem tendência de fuga térmica. Fix proposto (contexto `"CPU"` nos macros `{$TEMP_WARN}`/`{$TEMP_CRIT}`) ainda não aplicado — falta confirmar valor seguro na ficha do fabricante |
| `SSS_XNFREV_EN-US_DVN(D:)` — 12 hosts | **Não é bug**: `{#FSLABEL}` reporta correctamente o rótulo real de uma ISO de instalação montada como `D:` (5,5GB, sempre 100% cheio por natureza). Resolve-se sozinho com o fix do filtro `vfs.fs` acima, dentro de 30 dias |
| Serviços Windows `disabled`/`manual` "is not running" (~9 activos) | Falso positivo estrutural confirmado: o LLD `service.discovery` não filtra por tipo de arranque. Fix de filtro desenhado mas **não aplicado** — a regra tem `lifetime: Never`, exige limpeza manual adicional depois do fix |
| `VMware Guest` ligado a 454 VMs (fallback criado durante a crise de agentes) | Investigado a fundo: **0 problemas activos** causados por ele hoje, mas 9.152 items (31%) permanentemente quebrados (credencial Z.8 + MSSQL via ODBC embutido). Levantamento feito (Grupo A: 181 hosts com agente já fresco, seguro remover; Grupo B: 190 com agente parado; Grupo C: 83 sem agente nenhum) — **decisão de não avançar ainda**, à espera da conclusão da actualização de agentes em curso |
| 2 incidentes em massa identificados na distribuição de idade | `2026-04-26`: 112 problemas "agent not available" de uma só vez (origem da Fase 14). `2026-05-04`: 129 problemas VMware datastore de uma só vez (momento em que a credencial Z.8 falhou). Juntos, 53% do backlog activo — resolvem-se sozinhos quando Z.8 e a Fase 14 fecharem, não são "ruído esquecido" |

---

## 4. Lições técnicas (para reutilizar em limpezas futuras)

1. **Corrida da cascata**: apagar discovery rules antes de items causa falhas transitórias "No permissions to referred object" — re-consultar existência antes de repetir o delete.
2. **`item.get(hostids=X, templateids=Y)` não é fiável** para restringir por origem — devolve mais items do que os que pertencem realmente ao template (confirmado hoje, Grupo A do `VMware Guest`). Resolver a herança comparando o `templateid` directo de cada item aos itemids-mestre reais do template.
3. **Hosts `flags=4` (LLD-criados)** recusam `templates_clear` e `discoveryrule.delete` mesmo com a regra de origem desactivada — o único caminho é `host.delete` directo, seguro se a fonte estiver confirmadamente inactiva.
4. **Desactivar um host não fecha os problemas já abertos** (ficam presos sem `manual_close`) — só apagar o host/items resolve de facto.

---

## 5. Backups desta sessão

Todos em `C:\Repositorios\zabbix\bpc-workspace\`, prefixo `backup-*-20260707-*.json`. Cobrem, com `output:extend`, todo o estado anterior a cada escrita (items, triggers, discovery rules, hosts, macros).
