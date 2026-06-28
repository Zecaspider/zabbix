# Cobertura de monitorização das Agências — Overview & Plano de Acção

> Consolidação 2026-06-28. Fontes: `BPC/Dados das agências.xlsx`, `BPC/BPC_Lista das
> Agências CEs CNs CPs e Postos.xlsx`, cruzamento ao vivo com o Zabbix Network, e os
> mapas derivados `BPC/mapa_agencias_zabbix.csv` e `BPC/mapa_balcoes_dependentes.csv`.

## Arquitectura (corrigida 2026-06-28)

- **Não existe proxy Zabbix.** Toda a recolha (ICMP e SNMP) é **directa do DC** ao IP de
  gestão de cada unidade, pelo túnel WAN/DMVPN da operadora.
- **Excepção:** unidades **sem router próprio** ligam **ponto-a-ponto a uma unidade-pai**,
  partilham o **link WAN do pai**, mas **têm IP de gestão** → são alcançáveis a partir do DC
  **através do encaminhamento do pai** (logo, pingáveis directamente).

## Funil de cobertura (factos medidos)

| Etapa | Nº | Fonte |
|---|---|---|
| Unidades registadas (Lista Geral) | **251** | Excel |
| Com IP de gestão (Dados) | **226** | Excel |
| Configuradas no Zabbix (`HG_AGENCIAS_ROUTERS`) | **221** | Zabbix |
| **Observadas por ICMP** (disponibilidade) | **221** (194 UP · 27 DOWN) | Zabbix ao vivo |
| Com **SNMP completo** (interfaces/CPU/RAM) | **143** | Zabbix ao vivo |
| Marcadas no **geomap N3** | ~**172** | limitado por coordenadas/inventário |

**Leitura:** a disponibilidade (ICMP) já cobre os 221; o que falta é (a) a camada **SNMP**
em 78 routers e (b) **inventário/coordenadas** para o geomap mostrar todos e (c) trazer as
unidades **sem router** e as **não onboarded** para dentro.

## Categorias da lacuna (situações distintas)

| Cat. | Situação | Nº | Natureza |
|---|---|---|---|
| **A** | Router próprio, **SNMP partido** (Z.14) | **78** | Sessão SNMP não fecha — **não** é falta de template (templates + SNMPv3 já aplicados). Causa device-side: `snmp-server user`/ACL no IOS, ou UDP 161 bloqueado no túnel. |
| **B** | **Sem router próprio** (intermitente/móvel) | **14** confirmados | Balcões Intermitentes/Móveis: sem IP no Excel, dependem de um pai (mapa filha→pai feito, 11/14 alta confiança). Monitorizar pela **sub-interface do pai**. |
| **C** | **Não onboarded** (IP no Excel, sem host Zabbix) | **9** | CE Luena, Vila Luanda, CN Institucionais, CE Angochin, Compão, Posto Chibia, Sanza Pombo, Finança Chinguar, Mercado Feijão. Podem ser sem-router-com-IP **ou** IP diferente do registado. |
| **D** | Observadas mas **fora do geomap** | ~**49** | Sem coordenadas/inventário → não plotam. Resolve com ingestão do Excel. |
| **E** | Em Lista, **sem IP** sequer | ~25 | Inclui os 14 da Cat. B; resto a clarificar. |

> **Equívoco corrigido:** "sem SNMP" ≠ "sem router". Os 78 da Cat. A **têm** router (real,
> a responder a ICMP) — só a SNMP é que está partida. Os realmente sem-router (Cat. B) nem
> têm IP nos nossos dados. São conjuntos diferentes.

## Plano de acção (faseado)

### Fase 0 — Fundação de inventário (desbloqueia tudo; lado dashboards/Zabbix)
- Ingerir `mapa_agencias_zabbix.csv` → **inventory/tags** no Zabbix dos 221 (nome, tipo,
  direcção, província, município, comuna).
- **Renomear** os 4 hosts ainda nomeados por IP (`172.22.1.132→Andulo`, `.160→Jardim`,
  `.202→DRN_New`, `.213→Ukuma`).
- Efeito: ficha N4 rica, filtros por direcção/província, e **geomap passa a plotar os ~49**.

### Fase 1 — Fechar SNMP (Z.14) nos 78 (lado redes)
- `snmpwalk -v3` de teste **do servidor Zabbix no DC** (não há proxy) para uma amostra →
  isolar a causa comum (provável: user SNMPv3 não empurrado, ou ACL/UDP 161).
- Corrigir device-side; re-correr o LLD de interfaces.
- **Prioridade:** os routers que são **pais** de unidades sem router (Cunhinga/`RTCUNH00`,
  EBO, N'harea, Ukuma…) — fechar a SNMP neles desbloqueia a Fase 2 para os filhos.

### Fase 2 — Unidades sem router próprio (Cat. B + C)
- Usar `mapa_balcoes_dependentes.csv` (filha→pai); confirmar à mão os 3 pendentes
  (Gulungo Alto [grafia], Cangamba, Sanza Pombo).
- **Com IP de gestão:** adicionar como host **ICMP** (ping directo do DC via rota do pai) →
  disponibilidade imediata, mesmo sem SNMP.
- **Sem IP (14 intermitentes):** monitorizar pela **sub-interface/porto do pai** (depende de
  Fase 1 no pai) + ficha marca "sem router próprio (dependente de X)".
- Onboard das 9 da Cat. C.

### Fase 3 — Superfície nos dashboards
- **N3 geomap:** plotar todas (pós-inventário) + marcar visualmente as "sem router".
- **N4 ficha:** mostrar "sem router próprio (dependente de X)" + link para o pai.
- **9.6 / Z.15:** per-spoke no hub (`cipSecTunnelTable`) para a causa-raiz de agências DOWN.

## Artefactos
- `BPC/mapa_agencias_zabbix.csv` — 226 UN: IP↔nome↔tipo↔estado SNMP↔classificação.
- `BPC/mapa_balcoes_dependentes.csv` — 14 balcões → router-pai (com grau de confiança).
- Gaps Zabbix detalhados: `cronograma.md` (Z.14, Z.15) e `fluxo-agencias-n4-n5.md` §Riscos.
