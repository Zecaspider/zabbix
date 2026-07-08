# Reconciliação — 50 Sistemas do Relatório Diário × `app-*` × VM (2026-07-09)

> Tabela mestra para os objectivos 1-4 combinados (ver `cronograma.md` 7.0.5):
> (1) cada sistema do Excel tem `app-*`+VM mapeados e tagueados; (2) a tag
> `servico` bate entre o sintético e a VM; (3) sistemas multi-VM estão
> identificados e mapeados; (4) monitoria (sintético+agente) está activa.
> Construída a partir de `auditoria-tag-servico-vs-relatorio-negocio.md`
> (05/07), `mapa-apps-vms.md` (08/07) e `host.get` ao vivo dos 41 `app-*`
> (grupo 663, 2026-07-09) — sem escrita nenhuma.

## 1. Sistemas e Aplicações internos (34)

Legenda: ✅ fechado nos 4 objectivos · ⚠️ fechado com ressalva (ver nota) ·
🔶 multi-VM por resolver · ❌ falta `app-*` (VM já identificada) · 🔴 gap real
(sem `app-*`, sem VM)

| # | Sistema (Excel) | `app-*` | VM(s) | Tag bate? | Estado |
|---|---|---|---|---|---|
| 1 | EQUATION - Core Bancário | — | `VS8000320`/`VS8000321` (hipótese, não confirmada) | n/a | 🔴 bloqueado — sem URL, sem confirmação; ver §3-ter |
| 2 | SACC | `app-sacc` | `VS8000789` (gateway, `vm=`) + `VS8000134`/`VS8000347`/`VS8000867` | ✅ (4/4 = `SACC`) | ✅ **multi-VM fechado** (§3-bis) |
| 3 | EBA - Caixa Agências | — | `VS1800002` + `SV9000401` (BD) | n/a | 🔴 bloqueado — não é app web (serviços Windows `BranchAutomation`); ver §3-ter |
| 4 | BFTELLER - Caixa Agências | — | `VS8000452` (hipótese "Gestão do BFTELLER") | n/a | 🔴 bloqueado — sem URL, sem confirmação; ver §3-ter |
| 5 | STC - Transferência a Crédito | — | nenhuma | n/a | 🔴 gap real (provável módulo interno do Equation) |
| 6 | Portal de Operações / SOP | `app-sop` | `VS8000454` | ✅ (ambos `TOBE`) | ✅ confirmado por WinRM (nomes divergem do Excel de propósito) |
| 7 | SICV-R/SCC - Compensação Cheques | `app-sicv` | `VS8000427` | ✅ | ✅ |
| 8 | PSI - Pagamento Salários BPC | `app-psi` | `VS8000305` (partilhada, 9 apps) | ✅ (VM tem tag `servico=PSI` própria, ver §3) | ✅ |
| 9 | SIB - Pagamento Salários Outros Bancos | `app-sib` | `VS8000305` (partilhada) | ✅ | ✅ |
| 10 | SWIFT - Transferências Interbancárias | `app-swift-swp` | `VS8000141` (+ ~19 VMs com tag `SWIFT`, não mapeadas 1:1) | ✅ | 🔶 multi-VM (~20), decisão do utilizador de não mexer por agora |
| 11 | BANK TRADE - Carta de Crédito | `app-banktrade` | `VS9000912` | ✅ | ✅ |
| 12 | INTIX - Relatórios SWIFT | `app-intix` | `VS8000418` | ✅ | ✅ |
| 13 | MATCH CASH - Reconciliação Bancária | — | 4 VMs confirmadas (`MATCH CASH`×3+`RECONCILIADOR`×1, mesmo software `Match Cash-2`) | n/a | 🔴 bloqueado — não é app web (app desktop/on-demand); ver §3-ter |
| 14 | SGC - Integração Movimentos Contabilísticos | `app-sgc` | `VS8000305` (partilhada) | ✅ (VS8000305) | ⚠️ **suspeita de colisão de sigla** — ver §3-bis, `VS9000309`/`VS8000475`/`VS8000476` parecem ser **outro sistema** ("Gestão de Carteiras"), não multi-VM do mesmo SGC |
| 15 | CTB/400 (Equation) - Contabilidade | — | hipótese não confirmada | n/a | 🔴 gap, precisa negócio |
| 16 | PORTAL CONTIF | `app-contif` | `VS8000305` (partilhada, `vm=`) + `VS9000359` | ✅ (2/2 = `CONTIF`) | ✅ **multi-VM fechado** (§3-bis) |
| 17 | LIVE - Gestão de Risco | `app-live` | `VS8000305` (partilhada) | ✅ | ✅ |
| 18 | EURONET - Emissão Cartões Débito | `app-euronet` | **nenhuma** (VM nunca registada no Zabbix) | n/a | 🔴 gap crítico — infra não existe no Zabbix |
| 19 | BPCNET - Internet Banking | `app-internet-bank` | `VS8000724` + **17 VMs** (18 total, fechado 7.0.4) | ✅ (`ebankit`) | ✅ **fechado** |
| 20 | SMS BANKING (Consultas) | `app-sms-banking` | `VS8000438` (app real corre em `VS8000439` — mismatch de porta conhecido) | ✅ | ⚠️ web scenario aponta VM errada (defeito conhecido, não corrigido) |
| 21 | Audit Bank | — | nenhuma | n/a | 🔴 gap real |
| 22 | PAYMENT MAGER (Manager) | — | nenhuma | n/a | 🔴 gap real |
| 23 | SAP - Processamento BPC | `app-sap` | externo (SaaS `.ondemand.com`), sem VM interna | n/a | ✅ (tipo=parceiro correcto) |
| 24 | Site Institucional | `app-bpcao` | externo/CDN, sem VM interna | n/a | ✅ |
| 25 | CEZZANE (Cezanne) - Gestão Pessoal | `app-cezanne` | `VS9000235` (Server 2003 EOL) | ✅ | ✅ |
| 26 | FORGEST - Salários Funcionários | `app-forgest` | `VS9000480` | ✅ | ✅ |
| 27 | SIR 3.0 - Relatórios | `app-sir` | `VS8000304` (partilhada c/ SAFT) | ✅ | ✅ |
| 28 | UYSIG - Relatórios BNA | `app-uysig` + `app-uysig-bna` | `VS8000422` + `VS8000437` | ✅ | ✅ **multi-VM já mapeado correctamente** (2 apps, 2 VMs, mesma tag) |
| 29 | SPCC - Concessão Crédito | `app-spcc` | `VS8000305` (partilhada) | ✅ | ✅ |
| 30 | Sistema Abertura de Contas | `app-abc` | `VS8000305` (partilhada) | ✅ | ✅ (nota: `VS8000102` tem tag `ABC` mas é sistema **diferente**, confirmado, não confundir) |
| 31 | SIC - Cobranças | `app-sic` | `VS8000813` | ✅ | ✅ |
| 32 | Salas de Reuniões (sisgenda) | `app-sala-reunioes` | `VS8000305` (partilhada) | ✅ | ✅ |
| 33 | Clientes Falecidos (SGF) | `app-sgf` | `VS8000305` (partilhada) | ✅ | ✅ |
| 34 | SAFT BPC - Facturas | `app-saft` | `VS8000304` (partilhada c/ SIR) | ✅ | ✅ |

## 2. Serviços com Parceiros (16) — todos externos por desenho

| # | Serviço (Excel) | `app-*` | Estado |
|---|---|---|---|
| 1 | PRÉ-AVISO | `app-bna-preaviso` | ✅ |
| 2 | SINOC | `app-bna-sinoc` | ✅ |
| 3 | SSIF | `app-bna-ssif` | ✅ |
| 4 | PIF | `app-bna-pif` | ✅ |
| 5 | SIGMA | `app-bna-sigma` | ✅ (URL de teste, pendência de negócio já conhecida) |
| 6 | SGMC | `app-bna-sgmc` | ✅ |
| 7 | MINFIN | `app-minfin` | ✅ |
| 8 | INSS | `app-inss` | ✅ |
| 9 | INSS2 | `app-inss-bpc` | ✅ |
| 10 | BLOOMBERG | — | 🔴 **bloqueado** — sem URL |
| 11 | Portal EMIS | — | 🔴 **bloqueado** — sem URL (pista: `ACM`/`VS8000769` pode ser componente interno, não confirmado) |
| 12 | BODIVA | — | 🔴 **bloqueado** — sem URL — **marcado degradado no próprio relatório do dia** |

**Confirmado 2026-07-09** (`extract_hyperlinks.py`, já existente no
workspace, sobre o Excel-fonte): estes 3 não têm hyperlink nem qualquer
coluna de URL/Owner preenchida no relatório diário (linhas 57-59, só nome
+ código de estado) — não é falha da nossa investigação, é ausência de
dado na própria fonte. **Pendência de negócio formal**: obter a URL real
de cada um junto de quem gere o relatório diário antes de criar o
`app-*`. Sem escrita nenhuma feita.
| 13 | SPTR | `app-bna-sptr` | ✅ (URL de teste, mesma pendência do SIGMA) |
| 14 | PAGAMENTO MUNDIAL SEGURO | `app-mundial-seguro` | ✅ |
| 15 | Pumangol | `app-pumangol` | ✅ |
| 16 | EMP | `app-emp` | ✅ (+ fila interna `EbankitEmisQueueKeyConverter1` em `VS8000728`, correcto) |

## 3. Achado — a "tensão N:M" já estava resolvida (2026-07-09)

A 1ª versão desta tabela assumia, com base na auditoria de 05/07, que a
**VM só pode ter 1 valor de tag `servico`** — o que tornaria o objectivo 2
("tags iguais nos dois lados") impossível de satisfazer 1:1 para os 9
sistemas que partilham `VS8000305`/`VS8000304`. **Essa premissa estava
errada**: confirmado ao vivo (`host.get`, `selectTags`, só leitura) que o
Zabbix já tem, em produção, **múltiplas tags `servico` no mesmo host**:

- **`VS8000305`**: 10 tags `servico` — `APLICAÇÕES INTERNAS` (legado) +
  `Abertura de Contas`, `CONTIF`, `PSI`, `Agendamento de Salas`, `SGC`,
  `SGF`, `SIB`, `SPCC`, `LIVE` — **cada uma bate exactamente com o `app-*`
  correspondente**.
- **`VS8000304`**: 3 tags `servico` — `APLICAÇÕES INTERNAS` (legado) +
  `SAFT`, `SIR` — também batem 1:1.

**Nenhuma escrita foi necessária** — o mecanismo já existe e já está
correcto, só a documentação (baseada numa auditoria anterior à correcção)
estava desactualizada. Não há sinal de que isto quebre nenhuma query
existente: os painéis usam `vm=` do lado do `app-*` para o drill N3→VM
(por hostname directo, não por correlação de tag), e qualquer filtro
`host.get`/tags por `servico=X` continua a devolver a VM correctamente
para cada X. **Objectivo 2 fechado para estes 2 casos** — não é preciso
decidir entre "aceitar assimetria" vs "tag multi-valor": já é a 2ª opção,
já em produção.

## 3-bis. Fecho dos 3 multi-VM pendentes — SACC/SGC/CONTIF (2026-07-09)

Confirmado ao vivo (`host.get`, tag `servico` exacta, só leitura):

**`SACC` — fechado.** 4 VMs, todas ACTIVAS, todas com `servico=SACC`
correcto: `VS8000789` (gateway, é onde `app-sacc` aponta via `vm=`),
`VS8000134`, `VS8000347`, `VS8000867` (todas "SACC - VM", departamento
DTI). Nenhuma escrita necessária — a tag já estava certa nas 4; só
faltava confirmar e documentar. `vm=` mantém-se em `VS8000789` (convenção
já usada no `ebankit`: aponta ao nó principal, a lista completa fica
documentada aqui).

**`CONTIF` — fechado.** 2 VMs: `VS8000305` (partilhada, onde `vm=` já
aponta) + `VS9000359` (dedicada, `servico=CONTIF` correcto, sem sinal de
ser outra coisa). Nenhuma escrita necessária.

**`SGC` — ⚠️ suspeita de colisão de sigla, NÃO fechado como multi-VM.**
`VS9000309`/`VS8000475`/`VS8000476` têm de facto `servico=SGC`, mas o
**visible name** dos 3 diz **"Sistema de Gestão de Carteiras"**
(`VS9000309`: departamento `DTM`; `VS8000475`: BD, `DTM`; `VS8000476`:
BD, `DTI`) — isto é **"gestão de carteiras" (portfólio/crédito)**, não
"Integração de Movimentos Contabilísticos com o CORE" (a definição do
`SGC` do relatório diário, confirmada em `app-sgc`/`VS8000305`). Mesmo
padrão já visto no `ABC` (`VS8000102` vs `VS8000305` — sigla partilhada,
sistemas diferentes, decisão de não consolidar). **Recomendação: não
tratar como multi-VM do mesmo sistema sem confirmação de negócio** — só
depois disso decidir se `VS9000309`/`475`/`476` merecem a sua própria tag
distinta (ex. `Gestão de Carteiras`) para parar de colidir com o `SGC`
real. Nenhuma escrita feita.

## 3-ter. `EQUATION`/`EBA`/`BFTELLER`/`MATCH CASH` — bloqueados, não é falta de esforço (2026-07-09)

Ao tentar criar o `app-*` destes 4, confirmado (já investigado em 05/07,
`mapeamento-apps-vms-webscenarios-handoff-20260705.md §6`, não repetido
nesta sessão) que **nenhum tem hyperlink no relatório diário** — mesmo
bloqueio do `Bloomberg`/`Portal EMIS`/`BODIVA` (§2). Mas há um problema
mais profundo do que "falta a URL": **pelo menos 2 destes não são sequer
apps web**, logo um `app-*` (web scenario) seria a ferramenta errada:

- **`EBA`** (`VS1800002`): confirmado por WinRM (04/07) — são **serviços
  Windows** (`EBA MsgServer`, `EBA Remote Referral Server`, `EBA SQL
  Status Monitor`, pasta `BranchAutomation`), sem site HTTP.
- **`MATCH CASH`**: confirmado por WinRM (05/07) — é `Match Cash-2`, uma
  **app desktop/on-demand** (instalada via registo, não corre como
  serviço permanente). Existe uma pista antiga (auditoria 05/07) de sites
  IIS `matchweb`/`reconciliadorApi` na `VS8000305`, mas **nunca
  confirmada** como o mesmo software — candidato a nova colisão de nome
  (mesmo padrão do `ABC`/`SGC`), não investigado a fundo.
- **`EQUATION`/`BFTELLER`**: nunca confirmados tecnicamente, só hipótese
  por descrição da VM — nem sequer se sabe se são web.

**Decisão**: não criar `app-*` para estes 4. Ficam reclassificados de
"falta criar app-*" para **bloqueado** — candidatos ao objectivo 5
(monitoria de item/serviço dentro da própria VM, ex. `Get-Service`/porta,
per o plano original `auditoria-apis-servicos.md` Fase C4: *"para os
restantes (EQUATION, STC…) monitorizar por porta/processo/ODBC na própria
VM"*), não ao objectivo 1. Nenhuma escrita feita.

## 4. Resumo executivo (objectivos 1-3)

| Categoria | Sistemas | Contagem |
|---|---:|---|
| **✅ Fechado** | SOP, SICV, SWIFT*, BANK TRADE, INTIX, BPCNET, CEZANNE, FORGEST, SIR, UYSIG, SIC, SAFT, SAP, Site Institucional, PSI, SIB, LIVE, SPCC, ABC, Salas, SGF, SACC, CONTIF (23) | 23 |
| **⚠️ Fechado com ressalva** (defeito conhecido não corrigido, ou suspeita de colisão de sigla) | SMS Banking (web scenario aponta VM errada), SGC (ver §3-bis) | 2 |
| **🔴 Gap real / bloqueado** (sem `app-*`, sem VM, sem URL, ou não é app web) | STC, CTB/400, Audit Bank, Payment Manager, EURONET (VM não existe), Bloomberg, Portal EMIS, BODIVA, EQUATION, EBA, BFTELLER, MATCH CASH | 12 |
| **✅ Parceiros OK por desenho** | 13 dos 16 | 13 |

**Multi-VM (objectivo 3) — estado final**: `ebankit` (18), `SACC` (4),
`CONTIF` (2), `UYSIG` (2) confirmados e fechados. `SWIFT` (~20) confirmado
mas deliberadamente não mapeado 1:1 (decisão do utilizador). `SGC`
suspenso por suspeita de colisão de sigla (não é multi-VM até confirmação
de negócio). `MATCH CASH` (3+ VMs) fica para quando se decidir criar o
`app-*`.

*SWIFT conta como "fechado" no sentido de app-*+tag, mas o multi-VM
(~20 VMs) fica deliberadamente por mapear (decisão do utilizador,
05/07: "não mexer agora").

## 5. Próximos passos sugeridos (ordem de esforço/impacto)

1. **Mais fácil, maior impacto imediato**: criar `app-*` para
   `BLOOMBERG`/`Portal EMIS`/`BODIVA` — são só monitor de URL externa
   (mesmo padrão dos outros 13 parceiros), sem trabalho de VM nenhum.
2. **EQUATION/EBA/BFTELLER**: VM já identificada, falta só confirmar
   URL/porta e criar o `app-*` (pendência já registada no handoff 08/07).
3. **MATCH CASH**: decidir se cria `app-*` dedicado (atravessa 3+ VMs) ou
   só documenta a relação (já investigado por WinRM, falta decisão).
4. **Decisão §3** (VM partilhada N:M) — desbloqueia fechar formalmente PSI/
   SIB/SGC/CONTIF/LIVE/SPCC/ABC/Salas/SGF.
5. **SACC/SGC/CONTIF** — confirmar as VMs extra encontradas em 14.29
   (`VS8000867`, `VS9000359`, `VS8000475/476/VS9000309/vs8000474`).
6. **Gaps reais de negócio** (STC, CTB/400, Audit Bank, Payment Manager) —
   precisam de input do negócio, não há mais nada a descobrir só com
   Zabbix.
7. **EURONET** — decidir se vale a pena registar o host no Zabbix (hoje
   monitorizado só por IP directo, sem VM).

## 6. Objectivo 5 — auditoria de saúde das 36 VMs dos sistemas fechados (2026-07-09)

Antes de desenhar items novos por app (objectivo 5), auditei (`host.get` +
`problem.get`, só leitura) as 36 VMs que sustentam os 23 sistemas já
fechados — templates, agentes, e problemas activos. **Resultado
tranquilizador na base**: todas as 36 têm o template certo (`Windows by
Zabbix agent active` + `BPC Ping` + `VMware Guest`, `BPC MSSQL by ODBC`
onde há BD), e **31/36 não têm nenhum problema activo hoje**.

**5 achados nas restantes 5 VMs** — a maioria são problemas **antigos
(meses), nunca resolvidos, silenciosos** (consistente com o achado do
objectivo 6 de que as notificações estão mortas — ninguém seria avisado
de nenhum destes):

| VM | Sistema | Problema | Severidade | Desde | Idade |
|---|---|---|---:|---|---|
| `VS8000305` | Salas de Reuniões | Aplicação Web indisponível | **Disaster (5)** | 2026-04-08 | **3 meses** |
| `VS9000480` | FORGEST | `SQLAgent$FORGEST` + `Task Scheduler` parados | Average (3) | 2026-04-04 | **3 meses** |
| `VS9000359` | CONTIF (2ª VM) | Agente Zabbix sem reportar | Average (3) | 2026-04-26 | **2,5 meses** |
| `VS8000305` | SAFT BPC | Aplicação Web degradada | Warning (1) | 2026-06-11 | ~1 mês |
| `VS9000358` | ebankit (Audit Prod) | Inacessível por ICMP (nunca teve dado de agente) | High (4) | 2026-04-18 | **3 meses** |
| `VS8000737` | ebankit (BD cluster Prod) | Memória >90% | Average (3) | 2026-07-08 | **fresco (ontem)** |

**Diagnóstico de rede (2026-07-09)**: tentei WinRM (`Get-Service`, só
leitura, host nomeado `VS9000480`) para investigar antes de qualquer
correcção — **ICMP chega** (confirmado, ping responde), mas as **portas
WinRM 5985/5986 estão bloqueadas** a partir desta sessão
(`Test-NetConnection` confirma `TcpTestSucceeded=False` nas duas,
mesmo com ICMP a passar) — segmentação de rede da BPC, não falta de
permissão. **Diagnóstico/correcção destes 2 tem de ser feito a partir de
uma sessão com acesso à rede de gestão** (terminal do utilizador ou
sessão anterior que já tinha feito WinRM com sucesso).

**Pendências formais**:
1. `VS9000480` (FORGEST) — confirmar porquê `SQLAgent$FORGEST`/`Schedule`
   estão parados há 3 meses antes de arrancar (pode ser intencional).
2. `VS9000358` (ebankit Audit Prod) — confirmar no vCenter se a VM está
   ligada; se sim, candidato ao backlog de instalação de agente da
   Fase 14 (mesmo padrão dos "123 VMs nunca reportaram").
3. `VS9000359` (CONTIF) — agente parado há 2,5 meses, mesma investigação
   do #2.
4. `VS8000305` (Salas de Reuniões, sev Disaster há 3 meses) — o achado
   mais grave dos 5, ilustra concretamente por que o objectivo 6
   (notificações mortas) importa: ninguém foi avisado disto.
5. `VS8000737` (ebankit BD) — o único **fresco** (desde ontem); vale a
   pena confirmar se é um pico transitório ou uma tendência.

Nenhuma escrita feita — só leitura (Zabbix API) e 1 tentativa de leitura
via WinRM que falhou por rede, não chegou a executar nada na VM.
