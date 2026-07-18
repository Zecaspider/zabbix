# Taxonomia canónica de hosts — Grupos e Tags (Zabbix Infra)

> **Contrato vivo**, aprovado pelo utilizador em 2026-07-15. Define como
> qualquer host do Zabbix Infra é classificado — a ler **antes de criar,
> classificar ou reorganizar hosts/grupos/tags**. O registo histórico da
> operação que originou este modelo está em
> `reconciliacao-dominios-taxonomia-20260714.md`.

## 1. O princípio (porquê domínio, não camadas)

**Camadas descrevem arquitectura; domínios organizam operação.** Quando uma
trigger dispara, as perguntas são operacionais — *quem actua, que dashboard,
que runbook* — e a resposta é sempre um domínio (storage, BD, segurança…),
nunca uma camada. Camadas não particionam: todo o host está em várias ao
mesmo tempo (uma VM MSSQL é "física"+"virtualização"+"BD"+"aplicação"), o
que obriga a escolhas arbitrárias — foi por isso que o modelo antigo
degenerou (tag `camada` com 15 valores, 3 grafias de "Segurança", 30 hosts
"A-CLASSIFICAR", 91 hosts invisíveis aos N2). O eixo de **grupos** carrega a
dimensão operacional (navegação, permissões, routing de actions, espelho
1:1 das pastas Grafana); todas as outras dimensões — incluindo `camada` —
vivem como **tags**, onde sobreposição e ambiguidade não fazem mal.

**Regra de ouro**: *se tem (ou vai ter) pasta/N2 no Grafana, é grupo
`BPC/DOMINIO/*`; senão, é tag.* Subdomínio = tag `tipo`.

## 2. Grupos-alvo (modelo aprovado 2026-07-15)

| Grupo | Conteúdo | Origem (groupid actual) | Estado |
|---|---|---|---|
| `BPC/DOMINIO/01 Virtualizacao` | ESXi + vCenters (a plataforma que corre VMs) | rename do `603` + fusão do `664`; físicos saem para 08 | Fase B |
| `BPC/DOMINIO/02 Armazenamento` | arrays, controladoras, FC switch, tapes, backup appliances | **✅ criado** (groupid `668`) com os hosts do `602`+`605` via pertença dupla — `602` **não foi renomeado** (é a âncora de render, ver §6) | Fase B |
| `BPC/DOMINIO/03 Servidores Virtuais` | **todas** as VMs (SO convidado, workloads) | rename do `609` | Fase B |
| `BPC/DOMINIO/05 Seguranca` | só appliances dedicados (Check Point, Imperva); VMs de segurança ficam em 03 com tag `servico` | rename do `656` | Fase B |
| `BPC/DOMINIO/06 Bases de Dados` | hosts com motor de BD (dupla pertença com 03) | rename do `355` | Fase B |
| `BPC/DOMINIO/07 Servicos de Negocio` | serviços de negócio: sintéticos `app-*` + sistemas internos por tag `servico` (método via tag `fonte`, ver §8.1) | rename do `663` (era "APIs e Servicos de Negocio") | Fase B / §8 |
| `BPC/DOMINIO/08 Datacenter Fisico` | IBM Power, HMC, Cisco UCS FIs, Dell R650 PowerFlex, service processors; futuro: chassis/racks/PDUs | **novo** — recebe os ~30 físicos do `603` | Fase B |
| `BPC/DOMINIO/09 Integracao e APIs` | EAI + Integrador ESB (Kafka, NiFi, Elastic-do-Integrador, CEPH, nodes); dupla pertença com `03` por tag `servico` | **novo** (§8.2) — reclama o slot `09` (Agências é segmento de Rede) | §8 |
| `BPC/DOMINIO/10 Servicos de Suporte` | VMs DNS/DHCP/AD/NTP/WSUS/Email/IAM (dupla pertença com 03) | **novo** — povoado pelas tags que o `suporte-n2` usa | Fase B |

**Nomenclatura**: prefixo `BPC/DOMINIO/`, número = pasta Grafana, **ASCII
sem acentos** (o duplicado 655/656 nasceu de uma cedilha), separador `/`
sem espaços. Renomear grupo preserva o groupid — referências por ID nos
dashboards sobrevivem; as por nome não (ver §5 Fase B).

**Fora do eixo DOMINIO (permanecem):** 7 grupos default do Zabbix não
apagáveis (`2`,`4`,`6` presos a actions; `5` = `discovery_groupid` global;
`12`,`13` presos a host prototypes de templates; `341` preso à action 11) +
`480 A-CLASSIFICAR` como worklist temporária (15 hosts pendentes da equipa)
+ `657` (Cisco WLC, até haver decisão sobre Wi-Fi/domínio 04).

**Alvo final: ~16 grupos** (8 DOMINIO + 7 defaults + worklist), vindos de 84.

## 3. Invariantes (verificáveis por script — base do painel anti-regressão)

1. Todo o host **activo** pertence a **pelo menos 1** grupo `BPC/DOMINIO/*`.
2. Toda a **VM** pertence a `03 Servidores Virtuais` — e adicionalmente ao
   domínio funcional, se o tiver (BD, Suporte). Pertença dupla é desenho,
   não acidente.
3. Host novo entra com: 1+ grupo DOMINIO + tags mínimas `ambiente`,
   `camada`, `servico` (ou `A-CLASSIFICAR` explícito — nunca em branco).

## 4. Catálogo de tags canónicas

| Tag | Valores | Notas |
|---|---|---|
| `ambiente` | `Produção` · `QA` · `Desenvolvimento` · `Teste` · `Operações` · `A-CLASSIFICAR` | normalizada 2026-07-14 (grafia única) |
| `camada` | 13 valores actuais (`Camada Aplicacional`, `base de dados`, `Serviços de Infraestrutura`, `Plataforma de Contentores`, `Segurança`, …) | descritiva; **a tag ganha ao grupo** em conflitos (decisão F1) |
| `servico` | ~170 valores (sistema/aplicação) | consolidação pendente (auditoria Fase 14.20); `SWIFT`/`Swift SAA`/`Swift SWP` mantidos separados por decisão |
| `tecnologia` | `Windows` · `Linux` · … | substitui grupos TECNOLOGIA (Fase A) |
| `localizacao` | `DC Paratus` · … | **nova** — substitui o grupo 153 (Fase A) |
| `tipo` | subdomínio, por domínio: 02 → `array`/`controladora`/`fc-switch`/`tape`/`backup`; 05 → `firewall`/`waf`; 08 → `ibm-power`/`ucs-fi`/`hci-powerflex`/`service-processor`/`hmc`/`pdu`/`chassis` | criado na Fase B junto com os grupos novos; nos `app-*` já existe com outro sentido (web monitoring) — não colidir |
| `vm`, `ip`, `so`, `modelo`, `fabricante` … | operacionais existentes | não mexer (contrato do web monitoring / mapa-apps-vms) |

## 5. Plano de execução (aprovado; cada escrita pedida lote a lote)

**Fase A — colapso dos eixos redundantes** — ✅ **EXECUTADA 2026-07-15**
(5 lotes A1–A5, snapshots `faseA-*-antes.json` em
`bpc-workspace/reconciliacao-snapshots-20260714/`):
1. AMBIENTE (`134`,`353`,`351`,`379`,`464`) → tag `ambiente`. 96 hosts
   ganharam `ambiente=Produção` antes da remoção (grupo=377 vs tag=320);
   tag final: Produção 416 · QA 109 · A-CLASSIFICAR 26 · Operações 7.
2. CAMADA (`345`,`658`) → tag `camada` (2 sincronizações; os 2 conflitos
   OKD resolvidos a favor da tag `Plataforma de Contentores`). `355`
   mantém-se como âncora até à Fase B; `480` fica como worklist.
3. TECNOLOGIA (`348`,`360`,`481`) → tag `tecnologia` (4 sincronizações;
   final: Windows 288 · Linux 117 · RHCOS 18 · Desconhecido 1).
4. LOCALIZACAO (`153`) → tag `localizacao=DC Paratus` criada nos 95
   membros, grupo apagado.
5. `357`, `661`, `662`, `608` apagados (29 memberships removidas; todos
   os membros já tinham âncora de domínio).

Caso especial: `BNA` (12001) só existia em `134`+`153` — foi estacionado
no `480 A-CLASSIFICAR` (worklist) para não ficar sem grupos; é o único
host activo sem grupo de domínio, por decisão pendente da equipa.
**Resultado: 32 → 17 grupos** (8 âncoras + `480` + `657` + 7 defaults).

**Fase B — renames/fusões/split das âncoras** — ⚠ **estimativa inicial
por grep estava incompleta**: a leitura do conteúdo real revelou que a
maioria dos hits em `.js` eram comentários/molde cosméticos (não filtros
funcionais), mas também revelou um risco não medido — o `602` é a
**âncora de render partilhada por todos os domínios**, incluindo um
default hardcoded em `push_panel.py` (`ANCHOR_TARGET`). Ver §6 para o
detalhe e o plano de mitigação.

**Executado 2026-07-15** (snapshots em `bpc-workspace/reconciliacao-snapshots-20260714/faseB-*`):
- `609`→`03 Servidores Virtuais`, `656`→`05 Seguranca`, `355`→`06 Bases de Dados`:
  0 refs funcionais confirmadas por leitura antes do rename; renomeados directamente.
- `663`→`07 APIs e Servicos de Negocio`: 6 filtros funcionais (2 dashboards,
  `07-apis/n2` + `07-apis/n3`) editados localmente, validados, `hostgroup.update`,
  6 painéis nativos re-enviados via `push_native.py`, verificado ao vivo
  (cascata grupo→host→item devolve dados frescos).
- `664`→fundido em `603`→`01 Virtualizacao` (split físico já tinha saído
  para o `08` mais cedo na sessão): 3 filtros funcionais no dashboard
  "vCenter — Inventário" (sem manifest local, dashboard antigo/full-JSON)
  actualizados via GET+edit+POST directo à API Grafana (mesmo padrão do
  `push_panel.py`) + 3 painéis nativos do `n3-esxi-detalhe` via
  `push_native.py`. Verificado: grupo com 24 hosts (20 ESXi + 4 vCenter),
  items ICMP frescos.
- Split do `603`: rename manteve o groupid para os ESXi (refs por ID
  intactas), os 30 físicos já tinham saído para o `08` novo antes deste passo.

**Pendente**: `602`+`605` (ver §6 — bloqueado até decisão sobre o mecanismo
de âncora).

**Fase C — pós**: painel anti-regressão "hosts sem domínio" (F5), pastas
Grafana renomeadas se desejado, actualizar `mapa-host-groups.md`.

## 6. O risco do `602` — âncora de render partilhada (descoberto 2026-07-15)

O grupo `602` (Storage) não é só a âncora do domínio Armazenamento: é a
**âncora de render partilhada por dashboards de todos os domínios** — o
mecanismo documentado no `CLAUDE.md` §7 ("Storage - IBM FS9500 / ICMP
ping... funciona para qualquer dashboard independentemente do domínio").
17 ficheiros (`manifest.json`/`dashboard-completo.json` de vários domínios)
têm um bloco `"anchor"` explícito que aponta para
`"BPC / INFRAESTRUTURA / STORAGE"`. **Pior**: `push_panel.py` tem este
mesmo nome **hardcoded** como `ANCHOR_TARGET` por omissão — qualquer
dashboard sem `anchor` próprio no manifest herda este default do script.
Renomear `602` sem sincronizar tudo ao mesmo tempo branqueia painéis em
cascata pelo sistema todo — é a mesma classe do incidente de 2026-07-06
(que partiu 7 dashboards com uma âncora bem mais restrita), maior desta vez.

**Mitigação estrutural proposta (não uma simples rename)**: criar um grupo
**novo, fora do eixo `DOMINIO`**, dedicado só a este papel — ex.:
`_SISTEMA/ANCORA-RENDER` — com o mesmo host `Storage - IBM FS9500`
(pertença dupla, o host físico continua no `02`). Actualizar os 17
`anchor` blocks + o `ANCHOR_TARGET` de `push_panel.py` para apontar a este
grupo novo, **depois** renomear `602`→`02 Armazenamento` + fundir `605`.
Custo de trabalho é o mesmo de um rename directo; o benefício é que esta
classe de incidente fecha-se de vez — o nome do grupo de domínio
Armazenamento pode mudar no futuro sem nunca mais arriscar a âncora.

**Alternativa rejeitada**: filtro de grupo vazio/wildcard na query âncora
— comportamento não verificado nesta versão do plugin
`alexanderzobnin-zabbix-datasource`; apostar a estabilidade de 17
dashboards nisso sem testar seria repetir o padrão de assunção não
verificada que já causou incidentes aqui.

**Estado: ✅ EXECUTADO 2026-07-15** (confirmação do utilizador recebida).
Investigação adicional revelou que o raio de impacto real era ainda maior
que os 17 ficheiros medidos: **13 manifests sem `anchor` próprio** também
herdam o default de `push_panel.py` — confirmado ao vivo (dashboard
"N2 · VMware — Estado geral", sem override local, tinha o filtro antigo
gravado no painel já publicado). Renomear `602` directamente teria
arriscado branquear praticamente todos os painéis Business Text do
sistema, não só 17 dashboards.

**Decisão final (mais segura que a mitigação inicialmente proposta)**:
não renomear `602` — criar dois grupos novos em vez de mexer no existente:
- `_SISTEMA/ANCORA-RENDER` (groupid `667`) — grupo dedicado fora do eixo
  DOMINIO, só com o host `Storage - IBM FS9500` (pertença dupla com `602`).
  `push_panel.py` (`ANCHOR_TARGET`) e os 17 ficheiros (`anchor` blocks +
  snapshots `dashboard-completo.json`) actualizados para apontar aqui —
  fecha esta classe de incidente **para todas as escritas futuras**, sem
  tocar em nenhum painel já publicado (zero pushes/testes necessários hoje).
- `BPC/DOMINIO/02 Armazenamento` (groupid `668`) — grupo canónico com os
  17 hosts do `602`+`605` (pertença dupla, `602` intacto). Dá a
  visibilidade rápida no Zabbix pedida pelo utilizador, sem qualquer risco.
- `605` (Tape Library) fundido no `668` e apagado (0 referências, confirmado).
- **`602` (nome antigo "BPC / INFRAESTRUTURA / STORAGE") fica para sempre**
  como âncora estável — decisão deliberada, documentada aqui para não ser
  "corrigida" por engano numa sessão futura.

### 6.1 Repush dos dashboards já publicados (2026-07-15/16)

Depois de `push_panel.py` + os 17 ficheiros passarem a apontar para a
âncora nova, foi feito o repush de **19 dashboards** para que a alteração
chegasse ao que já estava ao vivo (sem isto, o `602` continuava com
painéis dependentes dele até à próxima edição de cada dashboard).

**16/19 migrados e verificados ao vivo** (0 referências antigas, âncora
com dados frescos, confirmado via API — cascata grupo→host→item):
`visao-indice-dashboards`, `visao-notificacoes`, `bd-n2`, `apis-n2`,
`apis-n3`, `apis-n4-sistema`, `apis-r1-relatorio-diario`, `suporte-n2`,
`n1-visao-geral-noc`, N2 VMware, N3-ESXi, N3-vCenter, `armazenamento/n2`,
`servidores-virtuais/n2`, `bd-n2-nativo`, `bd-n3`.

**3 excepções (nenhuma causada por este trabalho):**

1. **`visao-relatorios`** (`00-visao-geral/relatorios`) e **`suporte-n3`**
   (`10-servicos-suporte/n3`) — `push_panel.py` falha com "Dashboard not
   found" (HTTP 404). Estes 2 dashboards **nunca foram publicados no
   Grafana**, apesar de o código estar completo e commitado (Fase 17).
   Não foram criados agora — publicar um dashboard novo é decisão à parte,
   com o próprio ciclo de revisão painel-a-painel. **Pendente**: decidir
   se se publicam.
2. **`vm-n3-ficha`** (`03-servidores-virtuais/n3-hibrido`, "Ficha da VM")
   — todas as tentativas de push falharam com `ConnectionResetError` do
   lado do servidor: push completo, painel a painel, com header
   `Connection: close`, e **mesmo um reenvio sem qualquer alteração**
   (teste de diagnóstico que prova a causa não estar na edição de hoje).
   Suspeita: algo na estrutura de um dos painéis (`l3h-vitais.js` "Sinais
   vitais" ou `l3h-processos.js` "Top processos") que o Grafana lê sem
   problema mas rejeita/crasha ao gravar — bug pré-existente, não
   introduzido hoje. **Este dashboard continua com a âncora antiga
   (`602`) e continua a funcionar normalmente** (o `602` não foi
   renomeado/apagado). **Pendente**: investigar qual painel especificamente
   causa o crash (bisecção campo a campo), possivelmente reportar como bug
   do Grafana 12.4.2.

Consequência prática: o `602` deixou de ter qualquer consumidor vivo
**excepto o `vm-n3-ficha`** — confirma que manter o grupo antigo (em vez
de forçar a migração de tudo) foi a decisão certa, já que pelo menos um
dashboard seria, hoje, impossível de migrar de qualquer forma.

## 7. Decisões de classificação já tomadas (para casos futuros análogos)

- **IBM Power** → `08 Datacenter Fisico`, `tipo=ibm-power`. ⚠ Suspeita de
  correrem o core bancário (indícios AS/400: iSeries Access no VS8000102,
  sistema CTB/400) com monitorização só-ICMP — **pergunta pendente à equipa**;
  se confirmado, é o maior gap de monitorização do banco.
- **OKD/OpenShift (nós)** → são VMs, ficam em 03 com `camada=Plataforma de
  Contentores` + `servico=OKD`. Promover a domínio próprio apenas quando
  houver monitorização da plataforma (não só das VMs) e dashboard N2.
- **VMs de segurança (Darktrace, Sophos, …)** → 03 + tag `servico`; o N2 de
  Segurança puxa-as por tag. Grupo 05 é só para appliances dedicados.
- **PowerFlex (Dell R650)** → `08`, `tipo=hci-powerflex` (é HCI: os nós são
  simultaneamente compute e storage; a associação ao storage faz-se por tag).
- **Racks/PDUs/chassis** → entram em `08` quando ganharem monitorização;
  não criar dashboards para inventário vazio.

## 8. Fronteira Negócio / Integração / Suporte — decisões (2026-07-18)

> Gatilho: o utilizador reparou que o grupo `07 APIs e Servicos de Negocio`
> misturava coisas arquitecturalmente diferentes (40 sintéticos `app-*` + 53
> VMs reais em dupla pertença com o `03`, incluindo EAI, Integrador ESB e nós
> OpenShift/OKD). Investigação em `varredura-grupos-mortos-20260718.md` e nesta
> sessão. As três perguntas de fronteira foram fechadas assim:

### 8.1 "Serviço de negócio" ≠ "host sintético" (o método não define o domínio)

O sintético `app-*` é um **método de monitoria** (check de URL de fora), não o
domínio. **Existem serviços de negócio que não são web e só se monitoram de
dentro** — já provados na reconciliação dos 50 sistemas: **EBA – Caixa
Agências** (serviços Windows `BranchAutomation`) e **MATCH CASH** (app
desktop/on-demand), ambos marcados "não é app web".

**Decisão:** o domínio `07` passa a chamar-se **`Servicos de Negocio`** (cai o
"APIs" — as APIs vão para o `09`, ver 8.2). É definido pelo *que* o sistema é
(um sistema bancário do relatório diário), **não** por ter URL. O **método de
monitoria é uma camada de fonte de dados**, expressa por **tag `fonte`**
(`sintetico` | `agente` | `bd`) — mesmo padrão do tier ODBC/Perfmon/Serviço/
Sem-sinal do domínio `06 Bases de Dados`. O grupo `07` contém os sintéticos
`app-*`; os sistemas monitorados de dentro (EBA, MATCH CASH) ficam em `03` e o
N2 de Negócio puxa-os por **tag `servico`** (dupla via, não dupla pertença de
grupo DOMINIO).

### 8.2 Domínio novo `09 Integracao e APIs` (a resposta a "onde estão as APIs")

O verdadeiro barramento de integração/API do banco estava disfarçado de VMs no
`07`. É uma **terceira categoria** — não é serviço de negócio (não serve
clientes directamente) nem suporte de IT (não é DNS/AD/backup).

**Decisão:** criar **`BPC/DOMINIO/09 Integracao e APIs`** (reclama o slot `09`,
hoje vazio — "Agências" é segmento de Rede, não domínio). **Conteúdo:** EAI +
Integrador ESB (Kafka, NiFi, o Elasticsearch **do Integrador**, master/compute/
bastion nodes). Povoado por **dupla pertença com `03`** via tag `servico`
(`INTEGRADOR`, `EAI`), como o `06` e o `10` já fazem. **Fonte de dados actual =
só nível de VM** (ping/SO); a monitoria real de plataforma (profundidade de
fila Kafka, saúde de fluxos NiFi/ESB, latência de endpoints) é o **gap
documentado** — o tier "sem sinal de plataforma" aparece até existir, igual ao
modelo do `06`.

### 8.3 OpenShift/OKD ≠ Integração — ficam em `03` + tag (regra mantida)

Um cluster de contentores é uma preocupação diferente de um barramento de
integração. **Decisão:** os 21 nós OCP + 6 OKD **saem do `07`** (remover dupla
pertença) e ficam em **`03` com `camada=Plataforma de Contentores` +
`servico=OKD/OCP`** — exactamente a regra já aprovada em §7. **Não** entram no
`09`. São candidatos a domínio próprio (`Plataforma de Contentores`) só quando
houver monitorização da plataforma (não só das VMs) + N2 — mesmo critério de
maturidade do §7. Resolve de raiz os 12 falsos-positivos ICMP dos nós OCP/OKD
(IP de rede de pods) do `despiste-calibracao-triggers-20260718.md`.

### 8.4 GitLab sai, CEPH fica (dentro da stack Integrador)

- **GitLab** (`VS8000817`) → **`10 Servicos de Suporte`** por tag: é ferramenta
  de CI/CD (DevOps), preocupação distinta do runtime de integração. `tipo=devops`.
- **CEPH** (`VS8000805/866`) → **fica no `09`**: é o armazenamento
  software-defined **da própria plataforma** Integrador, operacionalmente
  acoplado; não é um array empresarial (esses são o `02`). `tipo=storage-plataforma`.

### 8.5 Correcção de inconsistência: ELK de logs → Suporte

Há **dois Elasticsearch** distintos, separados pelo propósito (não pelo nome):
- **ELK/Graylog de logs** (`VS8000135/136/137/772-777` "Logs Swift"/Kibana/
  Logstash/FleetServer + `Graylog`×3) = observabilidade → **`10 Suporte`**.
  Hoje **inconsistente**: o `Graylog` já está em `10`, mas o Elastic de logs
  **só em `03`** → **decisão:** juntá-lo ao `10` por tag, alinhado com o Graylog.
- **Integrador/Elasticsearch** (`VS8000814/815/978` "PMSI") = parte do ESB →
  vai para o `09` (8.2). Mesmo software, domínios diferentes — a regra é o
  **propósito**, não o motor tecnológico.

### 8.6 Resumo executável — APROVADO 2026-07-18

Script: `aplicar_dominio09_20260718.py` (dry-run validado; corre com `--apply`).
A escrita no Zabbix a partir da sessão Claude é bloqueada pelo classificador —
o utilizador corre o `--apply` no terminal. Passos (idempotente, backup em
`documentacao/backup-dominio09-<ts>.json`):
1. Renomear grupo `07` (groupid `663`) → `BPC/DOMINIO/07 Servicos de Negocio`
   (o ID preserva-se; refs por nome exigem o resolvedor dinâmico já aplicado
   ao N1/notificações/dashboards por-domínio).
2. Criar `BPC/DOMINIO/09 Integracao e APIs`; adicionar **19 hosts** (5 EAI +
   14 Integrador, inclui CEPH; **exclui GitLab**).
3. **GitLab** (`VS8000817`) + **9 ELK-de-logs** → `10 Servicos de Suporte`.
4. Remover do `07` as **53 VMs reais** (ficam em `03` pela regra de ouro): 19
   passam a estar em 03+09, GitLab em 03+10, e **33 só em 03** (18 OCP + 9 OKD
   + 6 compute nodes).
5. **Tag `fonte`** (`sintetico`/`agente`/`bd`) — **DEFERIDA**: redundante
   enquanto o `07` é só sintéticos; aplica-se quando os sistemas internos
   (EBA, MATCH CASH) entrarem na vista de Negócio por tag `servico`.
6. Resultado: `07` = 40 sintéticos de negócio; `09` = plataforma de
   integração/APIs; `03` continua com todas as VMs (regra de ouro); `10` ganha
   DevOps (GitLab) + observabilidade de logs (ELK). Contagens confirmadas no
   dry-run: 53 = 19 (→09) + 1 (GitLab→10) + 33 (só 03).
