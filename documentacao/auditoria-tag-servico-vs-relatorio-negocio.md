# Auditoria — Tag `servico` (Zabbix Infra) × 50 Sistemas do Relatório de Negócio (2026-07-05)

> Resultado do pendente §12/§13.1 do handoff
> `bpc-workspace/mapeamento-apps-vms-webscenarios-handoff-20260705.md`:
> "cruzar os 166 valores `servico` contra os 50 sistemas do relatório Excel".
> Decisão de consolidação continua **em aberto** — este documento é só o
> cruzamento/achados, nenhuma escrita foi feita no Zabbix.

## 0. Fontes cruzadas (4, não só 2 — para dar boa cobertura)

| # | Fonte | Conteúdo | Como foi obtida |
|---|---|---|---|
| 1 | `RELATORIO DIARIO...SERVIÇOS COM PARCEIROS_05-03-2026.xlsx` | 50 sistemas oficiais (34 Sistemas e Aplicações + 16 Serviços com Parceiros), com Owner/departamento | parse `zipfile`+XML (`openpyxl` não funciona neste ambiente) |
| 2 | `host.get` + `selectTags` ao vivo, Zabbix Infra | **168** valores distintos da tag `servico` em **650** hosts (2 a mais que os 166 do handoff — provavelmente 2 hosts novos entretanto) | API directa, token existente, só leitura |
| 3 | `host.get` grupo `BPC / APLICACOES / SINTETICOS` (groupid 663) | 39 hosts `app-*` (web scenarios) com macro `{$URL}` — mapeamento app→sistema é 1:1 por design do nome do host | API directa, só leitura |
| 4 | `Mapa_VMs_Servicos_Zabbix_Grafana.xlsx` (139 linhas, já produzido nesta linha de trabalho) | Cruzamento por IP/URL já confirmado, coluna "Correlação c/ Relatório Excel" | parse local, já existia |

A fonte 4 é o que torna este cruzamento mais forte que uma simples comparação
tag↔nome: onde a tag mente ou está incompleta, a correlação por IP (já feita)
diz a verdade.

## 1. Resultado por sistema (34 Sistemas e Aplicações)

| Sistema (Excel) | Tag(s) `servico` encontrada(s) | Evidência adicional (app-*/Mapa) | Confiança |
|---|---|---|---|
| EQUATION - Core Bancário | `equation` (1) | — | Confirmado (nome exacto) |
| SACC | `SACC` (3) | `app-sacc` → VS8000789 | **Confirmado (IP+tag)** |
| EBA - Caixa Agências | `EBA` (2) | Mapa: VS1800002 confirmado (Server 2003) | Confirmado |
| BFTELLER - Caixa Agências | `bfteller` (1, minúsculas) + `Gestão do BFTELLER` (1) | — | Confirmado, mas **2 grafias diferentes da mesma tag** — candidato a consolidar (não listado no handoff original) |
| STC - Transferência a Crédito | ❌ nenhuma | ❌ sem `app-*` também | **GAP real** — sem tag e sem web scenario; provavelmente módulo interno do Equation/CORE, nunca individualizado |
| Portal de Operações / SOP | ❌ nenhuma tag "SOP" | `app-sop` → VS8000454, **tag real = `TOBE`** (12 hosts) — **CONFIRMADO por WinRM (2026-07-05, host nomeado)**: sites IIS `POv2`/`PO_MW`/`PO_MW_External` ("PO" = Portal de Operações); porta 91 devolve HTTP 401, exactamente o comportamento já documentado do `app-sop` real (único dos 39 web scenarios com `{$HTTP.CODE.OK}` a aceitar 401, por exigir login) | ✅ **Confirmado tecnicamente** — 2 sinais independentes (nome dos sites + assinatura HTTP 401). Nenhum software chamado "TOBE" encontrado no host, mas apps internas .NET raramente aparecem no registo de programas — não invalida a equivalência |
| SICV-R/SCC - Compensação Cheques | `sistema de compensacao de cheques` (1, descritiva) | `app-sicv` → VS8000427 | Confirmado (via descrição, não sigla) |
| PSI - Pagamento Salários BPC | `PSI` (1) + `pagamento de salarios bpc` (1, descritiva) | `app-psi` → VS8000305 (9-apps) | Confirmado, **2 tags para o mesmo sistema em VMs diferentes** |
| SIB - Pagamento Salários Outros Bancos | `pagamento de salarios outros bancos` (1, é a tag da VS8000305) | `app-sib` mesma VM | Confirmado, mas **a tag só nomeia SIB** enquanto a VM hospeda **9 sistemas** (ver §3) |
| SWIFT - Transferências Interbancárias | `SWIFT` (18) + `Swift SAA` (1) + `Swift SWP` (1) | — | Confirmado; família ambígua já sinalizada no handoff (§12), decisão pendente |
| BANK TRADE - Carta de Crédito | `BANK TRADE` (3) + `BANKTRADE` (2) | `app-banktrade` → VS9000912 | Confirmado; duplicado já identificado no handoff |
| INTIX - Relatórios SWIFT | `INTIX` (1) | `app-intix` → VS8000418 | **Confirmado (IP+tag+app)** |
| MATCH CASH - Reconciliação Bancária | `MATCH CASH` (3) + `RECONCILIADOR` (1) + `MatchWeb` (1) | Mapa: `matchweb`/`reconciliadorApi` são sites IIS na VS8000305 | ⚠️ **3 tags diferentes para o mesmo conceito** (Match Cash / Reconciliador / MatchWeb) — mesmo padrão de fragmentação já visto em Fircosoft; candidato extra a decisão de consolidação (não estava na lista original do handoff) |
| SGC - Integração Movimentos Contabilísticos | `SGC` (4) | Mapa: VS9000309 "SGC (serviços SGC *)" | Confirmado — **mas atenção**: "SGC" também aparece dentro da descrição do próprio SOP ("Rup,**SGC**,Extracto de Conta,..."), possível colisão de sigla entre 2 conceitos distintos, não resolvido |
| CTB/400 (Equation) - Contabilidade | ❌ nenhuma tag "CTB" | `SERVIDOR DE APLICACOES` (2: VS8000320/321) — hipótese não confirmada (handoff §6) | **GAP, hipótese em aberto**, precisa validação de negócio |
| PORTAL CONTIF | `CONTIF` (1) | `app-contif` mesma VS8000305 | Confirmado |
| LIVE - Gestão de Risco | ❌ nenhuma | `app-live` → hospedado na VS8000305, cuja tag é "pagamento de salarios outros bancos" | **GAP** — LIVE não tem representação própria em nenhuma tag |
| EURONET - Emissão Cartões Débito | ❌ nenhuma | `app-euronet` aponta a `10.10.241.153`/`ACS9`, **não registado em nenhum Zabbix** (achado já no handoff §5) | **GAP confirmado — nem VM existe no Zabbix** |
| BPCNET - Internet Banking | ❌ nenhuma tag "BPCNET" | `ebankit` (**20 hosts**) — **CONFIRMADO por WinRM (2026-07-05, host nomeado)**: `VS8000724` tem o site IIS `ebk-ib.bpc.intranet` com binding literal `443:ib.bpc.ao` — o mesmo domínio de produção do `app-internet-bank` real (`https://ib.bpc.ao/`). Mesma VM também serve `acesso.bpc.ao`/`gatewaycanais.bpc.ao`/`cdn.bpc.ao`/`conteudo.bpc.ao` (ecossistema eBankIT completo) | ✅ **Confirmado tecnicamente** — não é semelhança de nome, é a binding de domínio de produção a bater. Sem necessidade de confirmação de negócio adicional |
| SMS BANKING (Consultas) | `SMS BANKING+CHAT BOT` (2) | `app-sms-banking` → VS8000438 (app real corre na VS8000439, ver handoff §8) | Confirmado, com a ressalva já conhecida do web scenario apontar porta errada |
| Audit Bank | ❌ nenhuma (`AD AUDIT` é Active Directory, não relacionado) | ❌ sem `app-*` | **GAP** |
| PAYMENT MAGER (Manager) | ❌ nenhuma | ❌ sem `app-*` | **GAP** |
| SAP - Processamento BPC | `SAP` (1) | `app-sap` (ERP cloud, `.ondemand.com`) | Confirmado (nome exacto) — mas confirmar se a VM com tag SAP (interna) é gateway do SAP Cloud, ou coisa distinta |
| Site Institucional | ❌ nenhuma | `app-bpcao` (`www.bpc.ao`, site público) | Sem tag interna — plausível (site pode ser hospedado fora/CDN) |
| CEZZANE (Cezanne) - Gestão Pessoal | `CEZANNE` (1) | `app-cezanne` → VS9000235, confirmado em detalhe no handoff | **Confirmado (IP+IIS)** |
| FORGEST - Salários Funcionários | `FORGEST` (1) | `app-forgest` → VS9000480 | Confirmado |
| SIR 3.0 - Relatórios | ❌ nenhuma tag "SIR" | `app-sir` → VS8000304 (tag real = `APLICACOES INTERNAS`) | GAP de tag específica, mas confirmado por IP via Mapa |
| UYSIG - Relatórios BNA | `UYSIG` (2) | Mapa: VS8000437 "UYSIG (Tomcat)" | Confirmado |
| SPCC - Concessão Crédito | ❌ nenhuma tag "SPCC" | `app-spcc` → VS8000305 (tag "pagamento de salarios outros bancos") | GAP de tag específica, confirmado por IP |
| Sistema Abertura de Contas | tag `ABC` (1, host **VS8000102**) — **confirmado, não é este sistema** | `app-abc` → VS8000305 (10.10.236.50) — **IPs diferentes** | 🔴 **Colisão de sigla CONFIRMADA (2026-07-05, WinRM)**: `VS8000102` inspeccionado ao vivo (host nomeado explicitamente) — é um servidor SQL Server 2016 completo (DB Engine+SSRS+SSAS+SSIS+MDS) + `IBM iSeries Access` (cliente AS/400), **sem nenhum site IIS/app web**. Departamento tag `DGE` — único host de toda a instância com esse departamento, sem vizinhos para comparar. **Não é o Sistema de Abertura de Contas** (esse corre confirmado na VS8000305 via IIS). "ABC" em `VS8000102` continua sem significado confirmado — possivelmente ligado a integração AS/400 (mesmo indício de `VS8000320`/`VS8000321`), não decidido. **Não consolidar/fundir esta tag com a família Abertura de Contas** |
| SIC - Cobranças | tag `SIC` (corrigida 2026-07-05, era `MICROCREDITO`) | `app-sic` → `10.10.236.161` = **VS8000813** | ✅ **Resolvido por WinRM+HTTP (2026-07-05)**: sites IIS `ACS1MFA`(:8081)/`ACS6MFA`(:8080) confirmados a servir a porta do `app-sic`; conteúdo real da página tem `<title>Sistema Integral de Cobranças (SIC)</title>` + ícone BPC — confirma que a VM corre mesmo o SIC. "ACS"/"MFA" era só nomenclatura interna do módulo de autenticação da app, não outro sistema. Tag Zabbix corrigida de `MICROCREDITO` para `SIC` (`host.update`, confirmado pelo utilizador) |
| Salas de Reuniões (sisgenda) | ❌ nenhuma | `app-sala-reunioes` → VS8000305 ("SisGenda" confirmado como site IIS) | GAP de tag específica, confirmado por IP |
| Clientes Falecidos (SGF) | ❌ nenhuma tag "SGF" | `app-sgf` → VS8000305 ("BPC-SGF" confirmado como site IIS) | GAP de tag específica, confirmado por IP |
| SAFT BPC - Facturas | ❌ nenhuma | `app-saft` → VS8000304 (tag `APLICACOES INTERNAS`) | GAP de tag específica, confirmado por IP |

## 2. Resultado por serviço (16 Serviços com Parceiros)

Todos os 16 apontam para **domínios externos** (`bna.ao`, `minfin.gov.ao`,
`inss.gov.ao`, `rtcom.pt`, `gasodata.pt`, etc. — confirmado nas macros
`{$URL}` dos 39 hosts `app-*`). É **esperado** que nenhum tenha tag `servico`
própria — não há VM BPC a tagar. A única excepção com sinal interno é:

- **EMP** (Emissão Cartões de Crédito, parceiro externo) — o host `VS8000728`
  (tag `ebankit`) tem correlação registada no Mapa como "EMP/fila EMIS"
  (`EmisQueueKeyConverter1`) — ou seja, existe **um componente interno** (fila
  de integração) ligado ao EMP, mesmo sendo o serviço em si externo. Não é
  inconsistência, é o handoff correcto: o synthetic monitora o parceiro, a
  fila é o lado BPC da integração.

Os restantes 15 (PRÉ-AVISO, SINOC, SSIF, PIF, SIGMA, SGMC, MINFIN, INSS,
INSS2, BLOOMBERG, Portal EMIS*, BODIVA, SPTR, PAGAMENTO MUNDIAL SEGURO,
Pumangol) — sem tag, sem VM interna dedicada. Confirma o desenho: só
monitorização sintética (URL), sem infra BPC a classificar.

**\*Portal EMIS é o único caso ambíguo**: dois hosts (`VS8000769` tag `ACM`,
`VS8000802` tag `SUPPORTSERVER`) já estavam anotados no Mapa como "EMIS -
componente dentro do ACM... confirmar se é o Portal EMIS ou só integração
interna" — permanece por confirmar, não resolvido aqui.

## 3. Achado estrutural que atravessa todo o cruzamento

**VS8000305 (10.10.236.50) é o maior ponto cego do cruzamento por tag.**
Só tem 1 tag (`pagamento de salarios outros bancos` = SIB), mas hospeda
**9 dos 34 sistemas** da lista (ABC, SGF, CONTIF, PSI, SIB, SGC, SPCC,
Salas de Reuniões, LIVE) — já achado maior do handoff (§5), mas este
cruzamento mostra que **6 dos 9** (STC não está lá, mas SIR/SAFT/SPCC/SGF/
Salas/LIVE, sim) são exactamente os que aparecem como "GAP de tag" na
tabela acima. Ou seja: **grande parte dos "gaps" de tag não são sistemas
sem infraestrutura — são sistemas cuja infraestrutura está numa VM cuja
tag só capta 1 de vários papéis.** Reforça a recomendação do handoff (§12)
de tratar `vm_relacionada`/ligação app↔VM como relação N:M, nunca 1:1.

## 4. Tags `servico` sem nenhum sistema correspondente (dos 168)

A maioria (~140 de 168) são plataformas/ferramentas internas, fora do
âmbito dos 50 sistemas do relatório diário — **esperado, não é gap**:
infraestrutura (`ACM` 17, `OCP` 18, `INTEGRADOR` 17, `DIGIWAVE` 16,
`JUMP SERVER` 11, `ESSENCE` 9, `SIRIS` 8, `FINANTECH` 8, família `vProxy`
12, `TOBE` 12 — confirmado 2026-07-05 que é SOP), segurança/monitorização
(`SOPHOS`, `DARKTRACE`, `IMPERVA`, `PORTNOX`, `TENABLE`, `GRAYLOG`,
`ZABBIX`, etc.), plataformas corporativas (`TALENTIA`, `PRIMAVERA`,
`SYSTEM CENTER`, `EXCHANGE`), e as famílias já sinalizadas no handoff
(`FIRCOSOFT`, `CREDITQUEST`).

**Maior oportunidade de limpeza**: **25 hosts com tag `SEM-ANOTACAO`** +
1 `SEM-CLASSIFICAÇÃO` = 26 VMs sem classificação nenhuma — candidato
óbvio a próxima ronda de classificação manual (nem entra neste
cruzamento, porque não há como saber se algum deles é um dos 50 sem
inspeccionar).

## 5. Resumo executivo

| Categoria | Contagem |
|---|---|
| Sistemas/serviços (dos 50) com tag directa confirmada | ~20 |
| Sistemas com tag existente mas nome divergente (TOBE/SOP, ebankit/BPCNET, ABC/VS8000102 vs VS8000305) | 3 novos achados |
| Sistemas cuja "tag em falta" se explica pela VS8000305 (9-apps) | 6 |
| Gaps reais (sem tag, sem app-*, sem VM identificável) | STC, Audit Bank, PAYMENT MAGER, CTB/400 |
| Gap crítico (VM nem existe no Zabbix) | EURONET |
| **Mismatch concreto novo** (tag aponta para sistema errado na mesma VM do web scenario) | **SIC → VM tagueada MICROCREDITO** |
| Serviços de parceiros (16) sem tag — correcto por desenho (externos) | 15 de 16 |
| Tags `servico` sem classificação nenhuma (oportunidade separada) | 26 (`SEM-ANOTACAO`+`SEM-CLASSIFICAÇÃO`) |

## 6. Recomendações (nenhuma escrita feita — só leitura nesta sessão)

1. **Antes de decidir se `servico` é reaproveitada para a ligação app↔VM
   (pendência §12 do handoff)**: o achado da VS8000305 mostra que uma tag
   1:1 por VM **não chega** — qualquer tag nova (`vm_relacionada` ou
   correcção da `servico`) precisa suportar múltiplos valores por host.
2. ~~Validar com o negócio `TOBE`↔SOP e `ebankit`↔BPCNET~~ — **CONFIRMADOS
   TECNICAMENTE 2026-07-05 via WinRM** (hosts nomeados: VS8000454,
   VS8000724), sem necessidade de validação de negócio adicional.
   `TOBE`→SOP: sites IIS "PO"* + assinatura HTTP 401 idêntica ao
   `app-sop` real. `ebankit`→BPCNET: binding de domínio de produção
   `ib.bpc.ao` literal no site `ebk-ib.bpc.intranet`.
2.1. ~~`ABC` (VS8000102) vs o "ABC" da VS8000305~~ — **CONFIRMADO
   2026-07-05 via WinRM**: são sistemas diferentes (VS8000102 é BD
   SQL Server + AS/400 client, sem web app; nada a ver com Abertura de
   Contas). **Excluir `VS8000102` de qualquer consolidação da tag `ABC`.**
3. ~~Investigar a VM `VS8000813`~~ — **RESOLVIDO 2026-07-05**: confirma-se
   que a VM corre o SIC (não Microcrédito); tag corrigida para `SIC`.
4. ~~Fircosoft/SWIFT~~ — **DECIDIDO 2026-07-05** (sem escrita, ver §7 novo
   abaixo): Fircosoft (12 hosts) mantém-se separado — são camadas
   arquitecturais reais (MQ/Utilities/App em Produção, genérica em QA),
   fundir perderia informação. SWIFT (20 hosts) mantém-se separado por
   agora — decisão do utilizador de não mexer, apesar de `Swift SAA`/
   `Swift SWP` (2 hosts QA) quebrarem o padrão dominante de tag genérica
   + sub-papel no nome visível usado pelos outros 18.
5. ~~`MATCH CASH`/`RECONCILIADOR`/`MatchWeb`~~ — **INVESTIGADO 2026-07-05
   via WinRM** (5 hosts nomeados). `MATCH CASH`(3)+`RECONCILIADOR`(1)
   confirmam todos `Match Cash-2` instalado — mesmo software, tag
   inconsistente. **Decisão do utilizador: não fundir agora**, apesar da
   evidência. `MatchWeb` (VS8000914) não pertence a esta família — IP
   registado resolve na verdade para `VS8000867`/SACC, mesmo
   `{$VMWARE.VM.UUID}` (`5023ddde-6a85-ae81-b19c-98f41af6b618`, mesmo
   padrão de duplicado já visto), já desactivado — só documentado.
6. As 26 VMs `SEM-ANOTACAO`/`SEM-CLASSIFICAÇÃO` são a maior lacuna de
   classificação pura — candidatas a uma ronda de trabalho à parte (fora
   do âmbito deste cruzamento, que só olhou para os 50 sistemas
   conhecidos).
7. ~~Mapear tag `servico` dos 39 `app-*` contra a VM confirmada~~ —
   **FEITO 2026-07-05**, ver §8 novo abaixo.
8. **PENDÊNCIA FORMAL NOVA (pedido explícito do utilizador)**: este
   cruzamento cobriu só os 50 sistemas do relatório de negócio + as
   famílias apontadas — **não é uma auditoria das 292 VMs de Produção**.
   Cruzamento ao vivo mostra que só **33 (11%)** têm a tag `servico`
   confirmada com prova técnica; as restantes **259 (89%)** nunca foram
   verificadas. Ver §9 novo abaixo.

## 7. Investigação Fircosoft/SWIFT (2026-07-05, sem escrita)

**Fircosoft (12 hosts, não só os 4 conhecidos antes)**:

| Tag | Hosts | Ambiente |
|---|---|---|
| `FIRCOSOFT` (genérica) | 6 (VS8000494-499) | QA |
| `FircosoftMQ` | 2 (VS8000830, VS8000853) | Produção |
| `FircosoftUtilities` | 2 (VS8000824, VS8000825) | Produção — já achado antes: "genuinamente vazias", só Zabbix Agent |
| `FircosoftApp` | 2 (VS8000833, VS8000834) | Produção |

Não é fragmentação — MQ/Utilities/App são camadas reais de deployment
n-tier (típico de software de compliance/AML). QA só nunca replicou essa
granularidade. **Decisão: não fundir.**

**SWIFT (20 hosts)**: 18 já usam a tag genérica `SWIFT` com o sub-papel
(SAA/SWP/Jump Server/Token Server/FPM/Histórico) só no **nome visível**,
incluindo os pares SAA/SWP de Produção (`VS8000125`/`140`, `VS8000126`/
`141`). Só 2 hosts de QA (`VS8000894`=`Swift SAA`, `VS8000895`=`Swift SWP`)
têm tag separada, quebrando o padrão dominante. **Decisão do utilizador:
não mexer agora**, apesar da recomendação técnica ser fundir (alinharia
com o padrão sem perder informação).

## 8. Mapeamento VM ↔ host sintético (`app-*`) — 2026-07-05

Confirmado que só **2 dos 39** `app-*` tinham tag `servico` própria antes
desta ronda (`app-internet-bank`=`ebankit`, `app-sms-banking`=`canais
digitais`) — os restantes 37 não tinham tag nenhuma.

**Achado durante a construção do mapeamento**: `VS8000789` (alvo do
`app-sacc`) estava tagueado `equation`, mas o próprio **nome visível** do
host já diz `"APP - Compute - VS8000789 (SACC)"` — contradição interna
clara, corrigida para `SACC`.

**`canais digitais`** (tag original do `app-sms-banking`) não é um erro
isolado — é uma categoria intencional partilhada por `SV9000307` ("SMS
Banking" no nome) e `VS8000740` ("Whatsapp BPC"). Decisão do utilizador:
trocar mesmo assim para `SMS BANKING+CHAT BOT`, alinhando com a tag
específica da VM em vez de manter a categoria guarda-chuva.

**Os 8 apps da `VS8000305`** (ABC/SGF/CONTIF/PSI/SIB/SGC/SPCC/Salas de
Reuniões) + `app-sir`/`app-saft` da `VS8000304`: copiar a tag genérica da
VM partilhada não os distinguiria entre si — decidido dar tag **própria e
específica** a cada um. `app-abc` usa `"Abertura de Contas"` (não `ABC`)
deliberadamente, para não colidir com a tag `ABC` já confirmada errada em
`VS8000102` (§2.1).

**21 escritas confirmadas e executadas, 21/21 OK**: `VS8000789`
(equation→SACC), `app-sms-banking` (canais digitais→SMS BANKING+CHAT
BOT), `app-swift-swp`=SWIFT, `app-intix`=INTIX, `app-sicv`="sistema de
compensacao de cheques", `app-banktrade`="BANK TRADE", `app-sic`=SIC,
`app-cezanne`=CEZANNE, `app-forgest`=FORGEST, `app-sop`=TOBE,
`app-sacc`=SACC, `app-abc`="Abertura de Contas", `app-sgf`=SGF,
`app-contif`=CONTIF, `app-psi`=PSI, `app-sib`=SIB, `app-sgc`=SGC,
`app-spcc`=SPCC, `app-sala-reunioes`="Agendamento de Salas", `app-sir`=SIR,
`app-saft`=SAFT.

Os 18 `app-*` restantes ficam sem tag — correcto: externos por desenho
(parceiros BNA/MINFIN/INSS/etc.) ou VM não resolvida (`app-live`/`bpc01`,
`app-euronet`/VM não registada, `app-sap`, `app-emp`,
`app-mundial-seguro`, `app-pumangol`, `app-bpcao`, `app-bpcnet-pub`).

## 8-bis. Verificação da ligação VM↔app-* + correcção `LTTI44_CLONE`

Verificação sistemática pós-§8: de 21 `app-*` tagueados, **10 ligam
limpo** a VM(s) via filtro de tag (SWIFT, INTIX, ebankit, SICV, BANK
TRADE, SMS Banking, SIC, CEZANNE, FORGEST, TOBE/SOP); **4 ligam a VMs
adicionais não esperadas** (SACC→4 VMs incl. `VS8000867`; CONTIF→
`VS9000359`; SGC→`VS8000475`/`476`/`VS9000309`/`vs8000474` — possível
infra dedicada legítima, não confirmada a fundo); **7 não ligam a
nenhuma VM** (ABC/SGF/SIB/SPCC/SAFT/SIR/Salas — por desenho, a VM
partilhada `VS8000305`/`VS8000304` manteve a tag genérica).

**Achado**: `PSI`→`LTTI44_CLONE` revelou-se **má classificação real**,
não infra legítima. WinRM (host nomeado pelo utilizador) confirmou que
`LTTI44_CLONE` é uma **estação de trabalho de developer**
(`$env:COMPUTERNAME`="LTTI44" — confirma o bug de `Hostname` já
documentado na Fase 14.15/Z.26; software: Visual Studio Enterprise,
drivers NVIDIA GeForce/ShadowPlay, Skype, BitComet, GOM Player, WinRAR,
Unity, touchpad Synaptics, diagnóstico HP — nenhum vestígio de PSI/
Salário/Payroll). **Corrigido** (`host.update`, confirmação explícita):
`servico` `PSI`→`Posto de Trabalho` (valor novo, sem convenção prévia
para postos de trabalho neste catálogo). Verificado ao vivo:
`servico=PSI` agora só devolve `app-psi`, sem ruído.

## 9. Pendência formal — auditoria completa das 292 VMs de Produção

Este cruzamento (e toda a Fase 14.20-14.28) cobriu **só os 50 sistemas do
relatório de negócio + as famílias ambíguas apontadas pelo utilizador** —
**não é uma auditoria completa das VMs de Produção**. Cruzamento ao vivo
(`ambiente=Produção`):

| | Hosts |
|---|---|
| Total VMs de Produção | 292 |
| Com tag `servico` confirmada com prova técnica nesta linha de trabalho | 33 (11%) |
| Com tag nunca verificada (herdada, pode estar certa ou errada) | 259 (89%) |

100 valores de tag distintos em Produção nunca tocados — maiores por
volume: `OCP`(18), `INTEGRADOR`(16), `SWIFT`(12), `vProxy`(12),
`JUMP SERVER`(11), `SIGCAP`(11), `Elasticsearch`(11). **Pedido explícito
do utilizador de registar isto como pendência formal**, para retomar
numa próxima sessão — não atacado aqui.
