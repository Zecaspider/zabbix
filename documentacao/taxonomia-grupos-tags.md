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
| `BPC/DOMINIO/07 APIs e Servicos de Negocio` | hosts sintéticos `app-*` | rename do `663` | Fase B |
| `BPC/DOMINIO/08 Datacenter Fisico` | IBM Power, HMC, Cisco UCS FIs, Dell R650 PowerFlex, service processors; futuro: chassis/racks/PDUs | **novo** — recebe os ~30 físicos do `603` | Fase B |
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
