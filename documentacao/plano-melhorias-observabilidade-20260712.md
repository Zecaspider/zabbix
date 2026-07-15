# Plano de Melhorias — Relatórios, Notificações, Índice, Serviços de Suporte, N1

> Pedido do utilizador em 2026-07-12 (6 pontos). Este documento é o resultado do
> ponto 6 ("pesquisa, planifica, documenta e depois implementa uma de cada vez"):
> pesquisa feita ao vivo (APIs Zabbix Infra/Network directas, API Grafana,
> datasource MySQL) + plano por feature. Implementação segue a ordem F1→F5,
> uma feature de cada vez, com push/commit sempre confirmados caso a caso.

## 0. Factos apurados na pesquisa (2026-07-12)

| Facto | Evidência | Impacto no plano |
|---|---|---|
| O modelo Excel aprovado é o relatório Backbone DC | `bpc-workspace/pds/Relatorio_Backbone_DC_2026-07-12_*.xlsx`, gerado por `relatorios/backbone-dc/gerar_relatorio.py` | F1 generaliza este gerador (escrita OOXML directa via `zipfile`, sem openpyxl — pip crasha nativo neste ambiente) |
| `grafana-image-renderer` **não** está instalado (HTTP 404) | `GET /api/plugins/grafana-image-renderer/settings` | PDF não pode vir do Grafana. Solução: HTML imprimível + **Edge headless** (`msedge --headless --print-to-pdf`), confirmado instalado na máquina |
| `action.get`/`mediatype.get`/`alert.get` funcionam na **API directa** (token Admin) | sonda 2026-07-12 | O bloqueio conhecido era só no proxy Grafana (`zabbix-api` resource). Scripts Python usam API directa |
| O datasource **MySQL Infra** (`afor1g5862fb4c`) lê `alerts`/`actions`/`media_type`/`media`/`users` | `POST /api/ds/query` testado | Painéis Grafana do F2 usam MySQL nativo (sem cache de 30min do proxy, sem métodos bloqueados) |
| **21.878 alertas de email nos últimos 7 dias, 100% falhados (status=2)** | `SELECT status,COUNT(*) FROM alerts` | A action `Send Notification Email` (id 9) está **ON** e a gerar alertas a cada minuto para `bpc.suporte@bravantic.co.ao` + `suporte@informantem.co.ao`, mas o mediatype `Email` (id 1) está **OFF** → tudo falha. É exactamente o estado pós-incidente GLPI (ver CLAUDE.md). O F2 expõe esta cadeia; **nunca** ligar o mediatype sem o runbook do CLAUDE.md |
| 8 actions (2 ON de trigger-source relevante), 35 mediatypes (Email OFF, Email BPC OFF, SMS ON, webhooks default ON mas sem uso) | `action.get`/`mediatype.get` | F2 mostra a cadeia action→mediatype→destinatário com estado real |
| Grafana tem 14 pastas, 106 dashboards (≈33 de produção fora do 99·Arquivo) | `GET /api/search` | F3 constrói o índice a partir do `/api/search` ao vivo (nunca hardcode da lista) |
| Hosts de serviços de suporte **já existem** no Zabbix Infra | `host.get` por nome + tag `servico` | DNS externo: `NS3`,`NS4` · DHCP: `VS8000927..931` (5, prod) · Domain Controllers: `VS9000003`,`VS9000007` (prod) + `VS6000001` (QA), `VS8000004` (QA, OFF) · WSUS: `VS8000228` (+`VS8000229` OFF) · Azure AD Connect: `VS8000403` · AD Audit: `VS8000214` · Exchange: `VS8000220` · Jump/IAM: `SRV-JUMP01/02` |
| **NTP: zero hosts/itens dedicados** | busca por nome e tag | Gap real a reportar no F4 (é o exemplo clássico de serviço de suporte ignorado) |
| Grupos CAMADA existentes: `658` INFRA REDE, `480` A-CLASSIFICAR, `355` Bases de Dados, `345` Camada Aplicacional | `hostgroup.get` | Não existe grupo "Serviços de Suporte" — F4 propõe criá-lo (escrita Zabbix ⇒ pedir confirmação) ou operar só por tag |
| 501 items `service.info` no Infra | `item.get countOutput` | O modelo de tier do domínio 06 (ODBC/Perfmon/Serviço/Sem-sinal) é reutilizável no F4 |
| N1 actual está desactualizado | `00-visao-geral/n1/n1-cards.js` | Card "Bases de Dados" diz `dashUid: null` ("Em Construção") mas o `bd-n2` já existe no Grafana — F5 corrige |

## F1 — Relatórios exportáveis por domínio (Excel + PDF)

**Objectivo:** 1 comando → relatório do dia de um domínio, em `.xlsx` (modelo
pds/Backbone) **e** `.pdf` imprimível (+ `.html` intermédio).

**Arquitectura:**
```
relatorios/
  _comum/relatorio_lib.py     ← NOVO: ZabbixClient, tokens, xlsx OOXML, HTML print, PDF (Edge headless)
  por-dominio/
    gerar_relatorio.py        ← NOVO: python gerar_relatorio.py --dominio bases-dados [--data --hora] [--pdf]
    dominios.json             ← NOVO: config por domínio (zabbix, groupids, filtros, colunas)
    saida/                    ← xlsx/pdf gerados (git-ignored se ficar pesado)
  backbone-dc/                ← mantém-se como está (modelo aprovado; migração p/ lib fica para depois)
  relatorio-diario-sistemas/  ← mantém-se (usa template Excel próprio do negócio)
```

**Domínios cobertos e fonte:**
| `--dominio` | Zabbix | Grupos | Colunas específicas |
|---|---|---|---|
| `vmware` | Infra | 603 (só hosts `VIRT - ESXi -*`) | estado vmware.hv.status, CPU%, RAM%, nº VMs, uptime |
| `servidores-virtuais` | Infra | 609 + tag ambiente=Produção | CPU%, RAM%, disco C:% pior FS, ping, disp.(dia) |
| `armazenamento` | Infra | 602+605 | saúde SNMP onde existe, ping, disp.(dia) |
| `bases-dados` | Infra | 355 | motor (tag), tier de sinal, serviço MSSQL/Oracle, disp.(dia) |
| `apis-servicos` | Infra | 663 | estado web scenario (item `web.test.fail`), tempo resposta, disp.(dia) |
| `seguranca` | Infra | 656 | ping, disp.(dia), problemas activos |
| `backbone-dc` | Network | delega no gerador existente | (sem duplicar) |
| `suporte` | Infra | (após F4) | por serviço DNS/DHCP/AD/... |

Estado por host = mesma regra do Backbone (ICMP down ⇒ Crítico; trigger ≥High ⇒
Crítico; ≥Warning ⇒ Atenção). Disponibilidade do dia = média do `icmpping` no
`history.get` desde as 00:00. Tudo **só leitura**.

**PDF:** gerar HTML com CSS `@media print` (tabela com as mesmas cores de
estado) → `msedge --headless --disable-gpu --print-to-pdf=<saida.pdf> <saida.html>`.
Sem dependências Python novas.

### F1-b — Painel self-service de exportação (pedido follow-up, 2026-07-12)

Dashboard `visao-relatorios` (`R0 · Visão Geral · Relatórios — Exportação
Excel/PDF`, pasta 00, local `00-visao-geral/relatorios/`): o mesmo relatório,
mas gerado **no browser** a partir de um painel com selectores — domínio (ou
"Todos", que produz 1 xlsx com 1 folha por domínio), período início/fim, e 2
botões de exportação. Decisões:
- **Excel no browser sem bibliotecas**: port 1:1 do OOXML do `relatorio_lib.py`
  para JS, com ZIP "stored" + CRC32 manual (~60 linhas) → Blob → download.
- **PDF via `window.print()`** numa janela imprimível com o mesmo CSS do HTML
  do CLI — o browser sugere o `<title>` como nome do ficheiro, por isso o
  title é o nome canónico `Relatorio_<Dominio>_<YYYY-MM-DD>_<HHMM>`.
- **DISP.(período)** calculada de `trends_uint` via `ds/query` MySQL (validado
  ao vivo: `icmpping`/`agent.ping`/`web.test.fail` são todos unsigned) — o
  período escolhido é respeitado hora a hora; as métricas CPU/RAM/disco são
  lastvalue (nota visível no painel, mesmo limite do CLI).
- A config de domínios é um **port manual** de `dominios.json` — mudanças
  fazem-se primeiro no CLI e replicam-se no painel.
- O CLI mantém-se como caminho de automação/agendamento; o painel é o caminho
  self-service do NOC. Link no rodapé do N1 (`📊 Exportar relatórios`).

## F2 — Dashboard de notificações e estado de triggers

**Objectivo:** ver num só ecrã, sem entrar no Zabbix: (a) resumo de triggers
activos por domínio; (b) a cadeia de notificação (que actions estão ON, que
mediatype usam, se esse mediatype está ON, para quem vai); (c) histórico real de
envios (quem, quando, assunto, sucesso/falha e o erro).

**Local:** pasta Grafana `00 · Visão Geral` · pasta local `00-visao-geral/notificacoes/`
· UID `visao-notificacoes` · título `N1 · Notificações — Triggers e envios`.

**Fontes de dados (decisão):**
- Triggers por domínio: datasource Zabbix (`problem.get` via BPC.rpc para os cards
  Business Text) — mesmos groupids do N1.
- Envios/cadeia: **datasource MySQL Infra nativo** (`afor1g5862fb4c`) — tabelas
  `alerts` (p.status: 0=pendente, 1=enviado, 2=falhado, 3=novo), `actions`,
  `media_type`, `media`+`users`. Painéis table/timeseries nativos ⇒ sem o cache
  de 30min do proxy e sem métodos bloqueados. (`alert.get` directo fica para os
  scripts, não para painéis.)

**Painéis (ordem de construção):**
1. `utils.js` (cópia canónica de `_comum/utils.js`)
2. `l1-resumo-triggers.js` (BT): grelha por domínio — nº crít/aviso, pior trigger, link p/ N2
3. `l1-cadeia-notificacao.js` (BT via MySQL? não — via rpc `action.get` é bloqueado no proxy ⇒ **painel nativo table MySQL** com join actions×media_type + BT só para o "semáforo" da cadeia lido do mesmo MySQL via ds/query)
4. Nativo: tabela "Últimos envios" (`alerts` join `media_type`, colunas hora/destino/assunto/estado/erro/retries)
5. Nativo: timeseries "Envios por hora, por estado" (7 dias)
6. Nativo: tabela "Destinatários configurados" (`users`×`media`×`media_type`, activo/inactivo)

**Aviso permanente no painel 3:** o semáforo da cadeia deve mostrar em vermelho
o estado actual (action ON → mediatype OFF → 100% falhas) com nota "reactivar só
com o runbook GLPI do CLAUDE.md".

## F3 — Índice de dashboards por domínio (tabela)

**Objectivo:** tabela única: colunas = domínio/camada (pastas Grafana), por
baixo os dashboards com link, ordenados por nível (N1→N5, R*).

**Como:** Business Text a chamar `GET /api/search?type=dash-db` (fetch
same-origin com credenciais da sessão — sem token no código). Agrupa por
`folderTitle`; pastas `04.x` aninham sob "04 · Rede"; `99 · Arquivo` excluída
(toggle para mostrar). Nível extraído do prefixo do título (`N1`…`N5`, `R1`).
Sempre ao vivo — dashboards novos aparecem sozinhos.

**Local:** pasta `00 · Visão Geral` · pasta local `00-visao-geral/indice/` ·
UID `visao-indice-dashboards` · título `N1 · Índice — Todos os dashboards`.

## F3.1 — Índice alternativo com painéis nativos

Mesma informação, zero JS custom: 1 painel **dashlist** nativo por pasta
(filtrado por `folderUID`, já conhecidos do CLAUDE.md), dispostos em grelha de
colunas por domínio + um painel text/markdown de cabeçalho. Vantagem:
sobrevive a qualquer mudança do plugin BT; desvantagem: sem agrupamento por
nível nem colunas verdadeiras. UID `visao-indice-nativo` · título
`N1 · Índice — Dashboards (nativo)` · pasta local `00-visao-geral/indice-nativo/`.
Push via `push_native.py` (painéis .json no manifest).

## F4 — Novo domínio: Serviços de Suporte (DNS, DHCP, AD, NTP, …)

**Justificação (dados reais):** já são monitorizados como VMs anónimas mas sem
vista própria: 2 DNS externos, 5 DHCP, 2 DCs de produção, WSUS, Azure AD
Connect, AD Audit, Exchange, 2 jump servers. **NTP não tem qualquer
monitorização** — gap a reportar. São os serviços cuja falha "parece outra
coisa" (DNS falha ⇒ tudo falha) e nunca têm dono.

**Antes de desenhar:** correr o checklist `metodologia-auditoria-topologia.md`
(inventário autoritativo por item.get destes hosts: que items reais têm — ping
só? agent? service.info dos serviços DNS/DHCP/NTDS?).

**Decisões que exigem o utilizador (escrita):**
1. Criar host group `BPC/CAMADA/Servicos de Suporte` no Zabbix (host.update/
   hostgroup.create ⇒ confirmação caso a caso) **ou** operar só por tag
   `servico` existente (zero escrita Zabbix; dashboards filtram por hostids/tags).
2. Criar pasta Grafana `10 · Serviços de Suporte` (escrita Grafana ⇒ confirmação).
3. Estrutura local: `10-servicos-suporte/n2/`.

**N2 proposto:** cards por serviço (DNS · DHCP · Active Directory · WSUS ·
Email/Exchange · Acesso/IAM · NTP) com estado agregado dos hosts respectivos
(ping + triggers + `service.info` onde exista), reutilizando o modelo de tier
do domínio 06 (mostrar sinal real disponível, "subir" quando houver mais).
Card NTP nasce como "Sem monitorização — gap" (honesto, não inventado).

## F5 — Reformular o N1 Visão Geral

1. **Corrigir estado desactualizado:** card Bases de Dados passa a linkar
   `bd-n2` (existe desde a Fase 6.1).
2. **Novo card** "Serviços de Suporte" (após F4; nasce "Em Construção" se o F4
   ainda não tiver N2 no Grafana).
3. **Barra de acessos rápidos** no topo ou rodapé do grid: `Índice de
   dashboards` (F3) · `Notificações e envios` (F2) · `Relatório diário` (R1
   existente) · nota de como gerar relatórios por domínio (F1 é CLI local — o
   N1 só documenta/linka, não gera).
4. Grid passa de 7 para 8 cards (4×2 completo).

## Ordem de implementação e estado

| # | Feature | Escreve em | Estado |
|---|---|---|---|
| 1 | F1 relatórios por domínio | só ficheiros locais (testável já) | **FEITO e testado 2026-07-12** — `relatorios/_comum/relatorio_lib.py` + `relatorios/por-dominio/` (6 domínios geraram xlsx+html+pdf com dados reais) |
| 2 | F2 notificações | local + push Grafana (confirmar) | **FEITO** — `visao-notificacoes` pushed (aprovado 2026-07-12) + layout final + testado no browser (cadeia partida visível com 3074 falhas/24h) |
| 3 | F3 índice tabela | local + push Grafana (confirmar) | **FEITO** — `visao-indice-dashboards` pushed + testado (36 dashboards, colunas por domínio, 04.x aninhado) |
| 4 | F3.1 índice nativo | local + push Grafana (confirmar) | **FEITO** — `visao-indice-nativo` pushed + testado (12 dashlist em grelha 4 colunas) |
| 5 | F4 serviços de suporte | auditoria (leitura) + decisões do utilizador + push | **FEITO** — pasta Grafana `10 · Serviços de Suporte` (`dominio-suporte`) criada com aprovação; `suporte-n2` pushed + testado (apanhou logo `VS8000220` Exchange DOWN). Pendentes técnicos em `cronograma.md` 17.6 (service.info no VS9000007, NTP, agentes DHCP 930/931) |
| 6 | F5 N1 reformulado | local + push Grafana (confirmar) | **FEITO** — n1-cards.js v3.0 pushed + testado (8 cards, BD→bd-n2, card Suporte por tags, rodapé de acessos rápidos; painel content +3h) |

### Achados da auditoria F4 (2026-07-12, item.get real)

16 hosts de suporte activos, 14 com agente (`VS8000930`/`VS8000931` DHCP só ICMP).
`VS9000003` é o único DC com `service.info` de DNS/Dhcp/NTDS/Netlogon/W32Time/DFSR
(todos a 0 = running) — modelo a replicar no `VS9000007` (DC de produção sem
nenhum service check). NTP: nenhuma cobertura fora do W32Time desse DC.
Tag `servico` real usada nos cards: `DNS EXTERNO`, `DHCP Server`,
`DOMAIN CONTROLLER`, `WSUS`, `AZURE AD CONNET` [sic], `AD AUDIT`, `EXCHANGE`, `IAM`.

Regras transversais: fluxo local-primeiro do CLAUDE.md §1 (editar .js →
`node --check` → push confirmado → testar 15-20s → commit confirmado),
construção incremental painel a painel (§3), âncora Zabbix real em todos os
painéis BT (§7), `${var:raw}` em variáveis-regex, nunca activar
discovery/mediatype sem o check de flood.
