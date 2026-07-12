# BPC-Observe — O que é, como foi montado, como se opera

> Documento de apresentação (2026-07-12). Três públicos, três secções:
> **§1–2** para gestão e cliente (o quê e o valor), **§3** como foi montado
> (engenharia), **§4–5** para quem vai operar no dia-a-dia (NOC).
> Detalhe técnico completo: `engenharia-do-sistema.md` e `blueprint-observabilidade.md`.

---

## 1. O que é

O **BPC-Observe** é o sistema de observabilidade do banco: uma superfície
única, no Grafana, que mostra em tempo real o estado de **toda a
infraestrutura tecnológica** — do hardware VMware até ao serviço de negócio
que o cliente final usa — e permite, em poucos cliques, ir do alarme geral
("há um problema na Rede") até à causa concreta ("a interface X do router da
agência Y está em baixo desde as 14:32").

Não é "um conjunto de dashboards bonitos": é um fluxo de trabalho NOC completo
— **detecção → triagem → correlação → resposta** — desenhado para três
consumidores distintos:

| Quem | Onde olha | O que obtém |
|---|---|---|
| Operador NOC (wallboard) | N1 · Visão Geral | vermelho/verde imediato, 1 card por domínio |
| Técnico em triagem | N2 → N3 → N4 → N5 | drill-down até ao host/interface que causa o problema |
| Gestão / cliente | Relatórios (Excel/PDF) e visão executiva | disponibilidade, estado por domínio, evidência do serviço |

### Números actuais

- **10 domínios** de monitorização, **~36 dashboards** de produção em drill-down hierárquico
- **~650 hosts** monitorizados no Zabbix Infra + toda a rede (DC, agências, edifícios, WAN) no Zabbix Network
- **50 sistemas de negócio** do relatório diário mapeados a sintéticos + VMs
- Cobertura: VMware (4 vCenters), VMs de produção, storage, rede (4 segmentos), bases de dados, APIs/serviços de negócio (41 apps sintéticas), serviços de suporte (DNS/DHCP/AD/NTP/Email)

---

## 2. O que cobre (domínios)

Cada domínio é um "card" no ecrã principal (N1) e uma pasta própria no Grafana:

| # | Domínio | Âmbito | Profundidade |
|---|---|---|---|
| 00 | Visão Geral | wallboard NOC, índice, notificações, relatórios | N1 |
| 01 | Infraestrutura VMware | vCenters, clusters, hosts ESXi | N2→N3 |
| 02 | Armazenamento | storage arrays, tape library | N2 |
| 03 | Servidores Virtuais | saúde das VMs de produção | N2→N3 |
| 04 | Rede | 4 segmentos: **Agências** (geomap→router→interfaces), **Borda DC** (5 routers WAN, por router/provedor), **DC Fabric** (7 switches spine-leaf), **Edifícios** | N2→N6 |
| 05 | Segurança | firewalls, WAF, Darktrace | em construção |
| 06 | Bases de Dados | instâncias MSSQL/Oracle, por tier de sinal | N2 (N3 em curso) |
| 07 | APIs e Serviços de Negócio | endpoints técnicos, sintéticos, eBankit, relatório diário | N2→N4 + R1 |
| 10 | Serviços de Suporte | DNS, DHCP, AD, NTP, WSUS, Email, IAM | N2 |

O princípio do drill-down é sempre o mesmo: **cada nível responde a uma
pergunta mais específica** — N1 "onde está o problema?", N2 "que host/segmento?",
N3/N4 "que dispositivo, e o que tem?", N5/N6 "que interface/detalhe exacto?".

---

## 3. Como foi montado

### Arquitectura em 3 camadas, cada uma com a sua fonte de verdade

| Camada | Papel | Fonte de verdade de |
|---|---|---|
| **Zabbix** (7.4 Infra + 7.0 Network) | recolha de dados, triggers, alertas | dados e alarmes |
| **Grafana** (12.4.2) | superfície única: visualização, navegação, correlação | apresentação |
| **Repositório Git** | código de todos os painéis + manifestos + documentação | código e história |

Regra estrutural: o Grafana **não duplica alertas** — o alarme vive no Zabbix;
o Grafana mostra, navega e correlaciona. Isto evita dois sistemas de alerta a
divergir.

### Princípios de engenharia que sustentam o sistema

1. **Tudo é código versionado.** Cada painel é um ficheiro `.js` no
   repositório; cada dashboard tem um `manifest.json` que liga ficheiros a
   painéis Grafana. Nada se edita "à mão" no Grafana — o fluxo é sempre
   *editar local → validar sintaxe → publicar → testar no browser → commit*.
   Resultado: qualquer dashboard pode ser reconstruído, auditado ou revertido.
2. **Auditoria de topologia antes de desenhar.** Nenhum dashboard foi
   desenhado a partir de suposições: antes de cada segmento correu-se um
   checklist contra os dados reais do Zabbix (inventário de hosts, interfaces,
   circuitos), porque tags e nomes herdados provaram estar errados várias
   vezes (ex.: um router rotulado "AZURE/GOV" que não tinha nenhum circuito
   Azure).
3. **Construção incremental, painel a painel.** Cada painel é escrito,
   publicado e testado individualmente antes do seguinte — nunca "big bang".
4. **Runtime partilhado.** Um painel utilitário por dashboard (`utils.js`,
   copiado de `_comum/`) fornece tema, cores, thresholds e acesso à API — os
   painéis de conteúdo nunca reinventam estado, garantindo que o N1 nunca
   contradiz o N2/N3.
5. **Segurança operacional por contrato.** Leituras à API Zabbix são livres;
   **qualquer escrita** (Zabbix, Grafana, VMs) exige confirmação humana
   explícita, caso a caso. Nunca se activa um template/notificação sem avaliar
   o risco a jusante (houve um incidente real de flood de tickets no GLPI que
   fundamentou esta regra).

### O trabalho invisível (e porque tem valor)

Grande parte do esforço não foi "fazer gráficos" — foi **sanear a base de
dados de monitorização** para que os dashboards digam a verdade:

- recuperação de dezenas de agentes Zabbix mortos em VMs de produção;
- remoção de 23 hosts duplicados e correcção de UUIDs VMware errados;
- reclassificação host a host das VMs de bases de dados (39 → 23 hosts
  genuínos, com evidência real por porta/serviço);
- template único de web monitoring com esquema de tags coerente
  (`tipo`/`servico`/`vm`/`ip`) nos 41 sistemas sintéticos;
- reconciliação dos 50 sistemas do relatório diário de negócio com as VMs e
  sintéticos que os suportam.

Um dashboard só vale o que valem os dados por baixo — este saneamento é o que
distingue este sistema de um Grafana "de demonstração".

---

## 4. Como se opera (dia-a-dia NOC)

**Acesso:** `http://10.10.126.22:3000` → pasta `00 · Visão Geral` →
dashboard **N1 · Visão Geral — Estado global** (é o wallboard; refresh
automático a cada minuto).

### Rotina de turno

1. **Wallboard N1 no ecrã grande.** 8 cards, um por domínio, com contagem de
   CRÍTICOS e AVISOS. Verde = seguir; vermelho = triagem.
2. **Triagem por drill-down.** Clicar "Ver N2 →" no card afectado. Em cada
   nível, o caminho está sempre visível (breadcrumb) e há botão de retorno ao
   nível acima. Exemplos de caminho completo:
   - *Agência sem comunicação:* N1 → N2 Rede → N3 Agências (geomap) → N4
     Agência (ficha + diagnóstico) → N5 Interfaces do router.
   - *VM com problema:* N1 → N2 Servidores Virtuais → N3 Detalhe da VM
     (CPU/RAM/disco/triggers).
   - *Sistema de negócio em baixo:* N1 → N2 APIs e Serviços → N3 App →
     N4 Sistema (app sintética + VMs que a suportam).
3. **Confirmar no Zabbix quando necessário.** O alarme oficial (trigger,
   duração, ack) vive no Zabbix; o Grafana diz *onde olhar*.
4. **Relatórios.** Dashboard `R0 · Relatórios` (pasta Visão Geral) exporta
   Excel/PDF por domínio; o `R1 · Relatório Diário` (pasta 07) cobre os 50
   sistemas de negócio.

### Leitura dos ecrãs (convenções)

- **Cores:** verde = OK · amarelo = aviso · vermelho = crítico · cinzento =
  sem dados/desconhecido. Badge "dados desactualizados" = a fonte parou de
  reportar (é sinal real, não erro do ecrã).
- **Títulos:** `Nx · Domínio · Âmbito — Propósito` — o prefixo Nx diz sempre a
  que profundidade se está.
- **Esperar pelo carregamento:** os painéis compostos demoram 10–20 s a
  preencher no primeiro load — não concluir "está partido" antes disso.

### Incidente conhecido — dashboards Zabbix sem dados após corte de energia

Se, depois de um reboot/corte no servidor Grafana, os dashboards ficarem todos
sem dados: **não reinstalar nada às cegas** — seguir o runbook
`documentacao/incidente-plugin-zabbix-grafana-20260710.md` (diagnóstico em 3
passos sem SSH; causa típica: o plugin Zabbix desaparece da lista de plugins e
resolve-se com reinstalação do plugin + restart do serviço).

### O que o operador NÃO faz

- Não edita dashboards no Grafana (qualquer correcção segue o fluxo do §5).
- Não activa templates/discovery/notificações no Zabbix — risco real de flood
  de alertas e tickets automáticos (incidente GLPI documentado).
- Não apaga nem move dashboards entre pastas.

---

## 5. Como se mantém e evolui

Qualquer alteração (novo painel, correcção, novo domínio) segue o mesmo ciclo,
descrito em detalhe no `CLAUDE.md` da raiz:

```
editar .js local → node --check → push ao Grafana → testar no browser
→ aprovado? → git commit  (reprovado? → corrigir local e repetir)
```

- O Grafana é o **ambiente de teste**, o Git é o **repositório**. Nunca ao
  contrário.
- Layout final (posições/tamanhos) só se fecha depois de todos os painéis do
  dashboard estarem aprovados.
- Depois de aprovado e testado, a documentação (`documentacao/*`,
  `cronograma.md`) é actualizada de imediato — o estado do projecto está
  sempre escrito, não na cabeça de ninguém.

### Estado actual e próximos passos

- **Em produção:** domínios 00–04, 06, 07 e 10 com drill-down funcional.
- **Em construção:** 05 · Segurança (placeholder no N1); N3 de Bases de Dados
  (mockup aprovado, código por escrever).
- **Decisão pendente de negócio:** reactivação das notificações por email
  (estão deliberadamente desligadas desde o incidente GLPI — reactivar exige
  plano de supressão/dependências para não reabrir o flood de tickets).
- **Fase seguinte (roadmap):** vista N0 executiva (SLA/disponibilidade) e
  relatórios automáticos por domínio (Fase 17, plano em
  `plano-melhorias-observabilidade-20260712.md`).
