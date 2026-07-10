# Mapa Apps ↔ VMs — correlação, tags e dependências (2026-07-08/09)

> Fecha a pendência F1 do plano de `auditoria-apis-servicos.md §7` e o
> "elo em falta" deixado aberto em
> `bpc-workspace/mapeamento-apps-vms-webscenarios-handoff-20260705.md §12`.
> Precede a decisão de domínio/pasta Grafana de cada sistema (ainda em aberto).

## 1. Template único — fecho da Fase C

Template canónico: **`BPC Web Monitoring v2`** (templateid `14715`), substitui os
2 antigos (`BPC Web Monitoring` 12042, `BPC Web Monitoring - Externos` 12045 —
apagados em 2026-07-08, `hosts:[]` confirmado antes da escrita). 1 único
template para interno+externo, diferenciado por **macros por host**, não por
2 templates:

| Macro | Interno (herdado do template) | Externo (override por host) |
|---|---:|---:|
| `{$TIMEOUT.L1/L2/L3}` | 15s | 30s |
| `{$TEMPO.NORMAL}` (warning) | 5s | 10s |
| `{$TEMPO.LENTO}` (disaster) | 8s | 25s |
| `{$FAILS.BEFORE.ALERT}` | 3 | 6 |

Decisão do utilizador (2026-07-08): **não calibrar internos por app** —
todos os 26 internos usam o default do template, sem override. Motivo:
muitos falsos positivos com calibração atómica por app; a análise fina fica
para quando se cruzar com os dados reais da VM (CPU/RAM/serviço), não antes.
Excepção: nenhuma — mesmo `app-live` (baseline real ~6.3s) usa o default.

Bug de template corrigido: os steps de L2/L3 apontavam para `{$TIMEOUT.L1}`
em vez de `{$TIMEOUT.L2}`/`{$TIMEOUT.L3}` (macros existiam por host mas
nunca eram lidas) — corrigido nos steps do template + macros de template
criadas com o mesmo default do L1.

L3 (`{$STRING.CHECK}`) e L4 (`{$AUTH.ENABLED}`) desligados por omissão ao
nível do template (`status=1`), só ligados por host quando há valor real
configurado — evita o problema antigo do L4 fazer POST diário para
`example.com` com `test/test`.

28 cenários legados `Monitor *` (20 internos directos nas VMs + 8 no host
`BNA`) desactivados em 2026-07-08 — confirmados como duplicados 1:1 dos
`app-*` novos por paridade de dados (`web.test.fail` histórico dos dois
lados, 5 dias). 3 "falhas" do legado que pareciam reais eram só o cenário
antigo aceitar só HTTP 200 (apps devolvem 301/400/404 legítimos que o novo
`{$HTTP.CODE.OK}` por host já trata correctamente).

## 1.1 Calibração dos triggers L1/L3 — bug crítico corrigido (2026-07-10)

Auditoria ao vivo do estado dos dashboards N2/N3 de APIs revelou que a coluna
**Estado mentia nos dois sentidos** — apps genuinamente fora do ar apareciam
verdes, e sites saudáveis apareciam "conteúdo errado". A causa **não eram os
web scenarios** (esses reportam a realidade fielmente), mas sim **os triggers
do template**. Corrigido por `trigger.update` (só o template, propaga aos 40
hosts). IDs: `171845` (L1 P5 indisponível), `171987` (L1 P4 HTTP inesperado),
`171848` (L3 conteúdo).

**Bug 1 — L1 nunca disparava.** Expressão original
`count(/…/web.test.fail[L1-Disponibilidade],{$FAILS.BEFORE.ALERT},"eq","1")={$FAILS.BEFORE.ALERT}`.
O período do `count()` **sem `#`** significa **segundos**, não amostras; com o
item a correr de 60 em 60s, nunca há 3 (ou 6) amostras numa janela de 3 (ou 6)
**segundos** → a condição é matematicamente impossível. Prova: **0 eventos de
L1 em 30 dias** no grupo 663, contra 2 do L2 e 8 do L3, apesar de vários apps
solidamente em baixo há 24h+.

**Bug 2 — L3 sobre-disparava e rotulava mal.** Expressão original
`last(/…/web.test.fail[L3-Conteudo])>0`: (a) sem guarda de consecutivas (1 blip
alarmava); (b) o cenário L3 falha **também** quando o site está em baixo (SSL/
timeout), pelo que um site inacessível aparecia como "conteúdo ausente" (visto
no `app-bpcao`/`app-sap`).

**Correcção (validada ao vivo).**
- **Macro nova `{$FAILS.WINDOW}`** — contém já o `#` (`#3` no template, `#6`
  override nos 15 hosts externos). Necessária porque o Zabbix **não aceita**
  `#{$MACRO}` (hash fora da macro) nem `{$MACRO}` com `#` do lado do limiar; a
  macro tem de **conter** o `#`. `{$FAILS.BEFORE.ALERT}` (3/6) mantém-se para o
  nome do trigger e o limiar, garantindo que o nome ("3+/6+ falhas") bate com o
  comportamento real.
- **L1**: `count(/…/web.test.fail[L1-Disponibilidade],{$FAILS.WINDOW},"eq","1")={$FAILS.BEFORE.ALERT} and find(…error…,"like","Response code")=0` (P5)
  / `=1` (P4). Dispara com N falhas consecutivas (3 internos, 6 externos).
- **L3**: `count(/…/web.test.fail[L3-Conteudo],{$FAILS.WINDOW},"eq","1")={$FAILS.BEFORE.ALERT} and find(…error…,"like","required pattern")=1`.
  O `find("required pattern")` só casa o erro real de conteúdo em falta
  (`required pattern "X" was not found`), **não** os erros de ligação (SSL/
  timeout) — separa "conteúdo em falta" de "site em baixo" (esse fica para o L1).

**Resultado confirmado:** os 7 apps em baixo (bpcao, emp, inss, mundial-seguro,
pumangol, sap, sms-banking) passaram a acender [L1]; `app-bpcao`/`app-sap`
deixaram de dar falso [L3]; `app-sgc` (falta real de `SgcIntegracao`) mantém
[L3]; `app-live` [L2] inalterado. Nenhuma notificação disparou — a única
acção ligada ("Send Notification Email") entrega só pelo mediatype `Email`
(id 1, **OFF**); verificado antes da escrita.

**Achados dos web scenarios (a maioria estava bem):** dos 40 hosts, 21 têm
`{$STRING.CHECK}` com string de conteúdo **legítima** (`SgcIntegracao`,
`Cezanne 8`, `BPC-SACC`…), 15 têm-no vazio com L3 desligado (correcto). Só o
**`app-bpcao`** tem lixo (um GUID `0666e2b2-…`) — **pendência: limpar/corrigir
essa string** (1 host, não bloqueia). O `app-sap` usa o subdomínio `ahh6kcgnj`,
por confirmar se aparece na página.

**Pendências relacionadas** (não bloqueiam):
1. ~~`{$STRING.CHECK}` do `app-bpcao` é lixo — corrigir para conteúdo real ou
   desligar L3 nesse host.~~ **RESOLVIDO 2026-07-10** — macro posto a vazio (L3
   off), ver §1.6.
2. Os 6 triggers do template **não aparecem no `configuration.export`** (só
   httptests + macros) — se o template for reimportado do export, os triggers
   perdem-se; recriar como parte exportável quando se tocar no template.
3. **Falso-DOWN vs real**: as falhas SSL do bpcao/sap (blocos, up ~62% do tempo)
   são conectividade de saída real, não bug de config — investigação
   operacional à parte.

## 1.2 Falhas externas = bloqueio de saída de rede do DC (2026-07-10)

Depois de o L1 passar a disparar correctamente (§1.1), 6 monitores **externos**
ficaram em DOWN persistente com `SSL_ERROR_ZERO_RETURN`: `app-bpcao`, `app-sap`,
`app-inss`, `app-mundial-seguro`, `app-pumangol`, `app-emp`. **Não é falso
positivo do trigger nem bug do web scenario — é a rede.**

Diagnóstico ao vivo a partir do **próprio servidor Zabbix** (curl/openssl/nc):
- `nc www.bpc.ao 443` → **TCP abre** (não é bloqueio de porta).
- `openssl s_client` → `written 335 bytes, read 0 bytes` + `unexpected eof`: o
  servidor **fecha a ligação logo após o ClientHello**, sem responder nada.
- Todas as variantes de curl (`--http1.1`, `--tlsv1.2/1.3`, `--ciphers`,
  user-agent) falham **exactamente igual** → não é negociação TLS/cipher/ALPN.
- **`curl https://www.google.com` → HTTP/2 200** e `www.microsoft.com` → 404
  (TLS OK). Logo o servidor **tem** saída HTTPS pública; só **estes destinos**
  estão bloqueados. Confirmação por contraste: `inss.gov.ao` bloqueado mas
  `bpc.inss.gov.ao` e `www6.minfin.gov.ao` passam (mesmo `.gov.ao`).

**Conclusão:** allow-list de saída do banco por destino. O servidor Zabbix não
está autorizado a alcançar estes 6 destinos externos. **Nenhuma opção do Zabbix
contorna um bloqueio de rede** (o `http_proxy` só ajudaria se existisse proxy —
não existe; a saída é directa).

**Fix real (rede):** autorizar a saída HTTPS (443) do IP do servidor Zabbix
para os 6 destinos — ver `documentacao/catalogo-50-sistemas.json`
`_meta.pendencia_saida_dc`. Assim que a rede abrir, os web scenarios funcionam
sem mexer no Zabbix. Os restantes externos (BNA `*.bna.ao`/`172.20.x`, minfin,
inss-bpc) já passam por já estarem autorizados.

**Acção provisória no Zabbix:** os 6 hosts postos em **manutenção** com nota
"Sem acesso de saída do DC — pendente allow-list de rede", para o NOC não
perseguir um não-incidente. **Nota importante:** a manutenção suprime os
eventos/notificações e o painel nativo de problemas, mas **não repinta a coluna
Estado do N2/N3** — essas tabelas derivam de `triggers.value=1` directo (MySQL/
RPC), que **não** é suppression-aware; para a vista custom reflectir "sem acesso"
é preciso, à parte, filtrar problemas suprimidos ou uma tag de estado própria.

## 1.3 Redesenho do N3 (App) — cards "No data" corrigidos + bug de produção (2026-07-10)

O N3 (`apis-n3`) tinha painéis nativos que ficavam "No data" em situações
normais, não em erro: (1) o painel nativo de triggers ficava vazio quando a
app não tinha problemas (a maioria do tempo); (2) o card de velocidade (KPI)
mostrava o último valor **bom** de tempo de resposta mesmo com a app fora do
ar há horas (idade real >8h, sem aviso de obsolescência — mesma armadilha
descrita em §1.2 para o `app-bpcao`).

**Correcções:**
- **Hero de estado** novo (`l3-app-estado.js`, painel 104) — banner full-width
  com o nome da app + badge grande do estado (`NO AR`/`FORA DO AR`/`LENTA`/
  `CONTEÚDO ERRADO`/**`SEM ACESSO (DC)`**), maintenance-aware, mesma semântica
  do N2 (§1.2).
- **KPI (`l3-app-kpi.js`)**: card "Está no ar?" e "Velocidade"/"Conteúdo"
  passam a **`SEM ACESSO`** quando o host está em manutenção; quando o L1
  falha e o item de velocidade/conteúdo não é fresco (idade > 3× o próprio
  `delay` do item), mostra **"SEM DADOS RECENTES"** em vez do valor antigo
  como se fosse ao vivo. Card "Problemas activos" mostra "suprimidos" em vez
  de contar o trigger (que continua `value=1` mesmo em manutenção — supressão
  não muda o valor do trigger, só as notificações).
- **Painel de problemas (`l3-app-problemas.js`, painel 105)** substitui o
  nativo `alexanderzobnin-zabbix-triggers-panel` — mostra "✓ Sem problemas
  activos" (não "No data") quando saudável, lista traduzida quando há
  problemas, e "Notificações suprimidas" quando em manutenção.
- **Layout final** (todos os 11 painéis, gridPos único): hero no topo, KPI
  logo abaixo, disponibilidade+VM lado a lado, stats 24h/7d/30d em linha,
  velocidade+problemas lado a lado, botão N4 no fim.
- **Títulos zerados** nos 5 painéis nativos (regra NOC `title:""`) — os 3
  stats (24h/7d/30d) usam `fieldConfig.defaults.displayName` +
  `textMode:"value_and_name"` para manterem o rótulo dentro do próprio
  painel, já que a barra de título fica vazia.

**⚠️ Incidente de produção durante a construção, causa-raiz e fix:**
`push_native.py` tinha um bug real no passo de "reler dashboard e actualizar
ids no manifest": fazia match por **`title`**, sem verificar se a entrada já
tinha `id` resolvido. Como a convenção NOC exige `title:""` em **todos** os
painéis de conteúdo, qualquer dashboard com 2+ painéis nativos colide nessa
chave — o dicionário `{titulo: painel}` fica com um único painel arbitrário
para a chave `""`, e **todas** as entradas do manifest com título vazio são
reatribuídas ao `id` desse painel. Na prática: ao editar os títulos dos 5
painéis nativos do N3 para `""` e voltar a fazer push, o manifest corrompeu-se
(todos os 5 apontavam para `id=105`) e os pushes seguintes **sobrescreveram
sucessivamente o painel 105** (o novo painel de problemas) com o conteúdo dos
outros 4 ficheiros — o último a correr (`n3-app-disp-30d.json`) ficou a
"vencer", deixando o painel de problemas substituído por um stat de
disponibilidade 30 dias na posição errada. **Reparado** via API directa
(reconstruindo os 5 painéis a partir dos ficheiros locais + `gridPos` ao
vivo, sem depender do passo de readback) e **corrigido na fonte**:
`push_native.py` agora só faz o match por título quando a entrada **ainda não
tem `id`** (só se aplica a painéis recém-criados nesta run) — testado com um
push de controlo que confirmou zero corrupção cruzada. Lição: `title:""`
partilhado por múltiplos painéis não pode ser chave de correlação.

## 1.4 Redesenho N3 v2 — refinamento visual + ficha completa (2026-07-10)

Segunda ronda do redesenho do N3, a partir de feedback directo sobre o v1
(hero redundante, layout a rever, "impacto visual"). Mockup aprovado antes de
codificar (`n3_app_redesign_mockup_v2`).

**Mudanças:**
- **Hero removido** (`l3-app-estado.js` apagado) — era redundante com o card
  "Está no ar?" do KPI (ambos mostravam nome/estado grande). A identidade
  (nome, serviço, nº de VMs) passou a ser o **card 0** do KPI.
- **KPI agora com 5 cards**: Aplicação · Está no ar? (+ mini-barra de 24h,
  8 blocos) · Velocidade (+ sparkline) · Conteúdo (mostra a **string real**
  esperada, via macro `{$STRING.CHECK}`, não só "correcto/errado") ·
  Problemas activos. Ícones SVG inline por card (sem dependência de fonte
  externa — funciona dentro de um painel Business Text).
- **VMs (`l3-app-vm.js`) reescrito para multi-VM real**: descobre todas as
  VMs por `host.get` com `tags: servico=<mesmo valor do app>` (exclui o
  próprio host `app-*`) — funciona ao vivo para SACC (4), CONTIF (2), ebankit
  (18+) sem depender de nenhum ficheiro local. Gauges radiais SVG (CPU/RAM/
  Disco) em vez de barras lineares; cada card tem link de drill-down para o
  N3 Servidores Virtuais. Cap de 4 gauges visíveis + indicador "+N mais" para
  sistemas com muitas VMs (a lista completa fica na ficha).
- **Painel de problemas nativo reposto** (`n3-app-triggers.json` recuperado
  do git, `alexanderzobnin-zabbix-triggers-panel`) — desfaz o Business Text
  custom da ronda anterior, por pedido explícito (o nativo dá ack/prioridade/
  ordenação que o custom não tinha).
- **Ficha da aplicação** (`l3-app-ficha.js`, novo): nome, URL (`{$URL}`), e
  VMs ligadas com serviços monitorizados por VM (`item.get` chave
  `service.info["X",state]`, `0`=a correr) — só mostra o que existe
  realmente, nunca inventa (confirmado: `VS8000305` só tem 2 destes items,
  `W3SVC`/`WAS`; outras VMs têm 9-10, algumas 0).
- **Painéis nativos**: timeline de disponibilidade com título mais simpático
  ("Disponibilidade — últimas 24 horas") e o rótulo lateral em bruto
  suprimido via `fieldConfig.overrides` (`displayName` vazio); timeseries de
  velocidade com preenchimento sob a linha (`fillOpacity:18`,
  `gradientMode:"opacity"`).
- **Layout final** (11 painéis, todos full-width empilhados): KPI →
  disponibilidade → stats 24h/7d/30d → velocidade → VMs → problemas nativo →
  ficha → botão N4.

**Caveat conhecido (dado, não código)**: a descoberta de VMs por tag
`servico=` partilhada é o sinal correcto e ao vivo para a esmagadora maioria
dos casos, mas herda qualquer **colisão de sigla já documentada** — ex.:
`app-sgc` (SGC real, `VS8000305`) mostra "4 VMs" porque `VS9000309`/
`VS8000475`/`VS8000476` têm a mesma tag `servico=SGC` mas são na verdade
"Gestão de Carteiras", sistema diferente (`reconciliacao-50-sistemas-
excel.md §3-bis`). Não corrigido por hardcode — é o mesmo dado que o resto
do projecto já usa; o fix real é retaguear essas 3 VMs no Zabbix, pendente
de confirmação de negócio.

## 1.5 Validação ao vivo dos 3 dashboards + 2 correcções (2026-07-10)

Passagem de validação ponta-a-ponta dos 3 dashboards de APIs antes de os dar
como prontos para produção (cronograma 7.0.12). Cruzou dados reais do Zabbix
(`host.get`/`trigger.get`/`item.get`), do Grafana (`ds/query`) e o render no
browser.

**A monitoria está a funcionar — apanha problemas reais.** No momento da
validação, dos 40 sintéticos: `app-sms-banking` [L1] FORA DO AR há 8h
(`Failed to connect to 10.10.238.214 port 8091: Connection refused` — serviço
interno genuinamente em baixo, **candidato a escalar à operação**, não é bug
de dashboard); `app-inss-bpc` [L1] queda **externa** real (item mostrava HTTP
200 em 0.07s há ~100 min, agora `Connection timed out` — não é a assinatura
`SSL_ERROR_ZERO_RETURN` do bloqueio de saída da §1.2, é o portal mesmo em
baixo); 6 externos SEM ACESSO (DC) correctamente suprimidos por manutenção;
`app-sgc` [L3] e `app-live` [L2] reais.

**N2 (`apis-n2`) — pronto para produção, sem alterações.** KPI + tabela de
internos + tabela de parceiros + painel nativo de problemas. As duas tabelas
são MySQL directo contra a BD do Zabbix (sem a cache de ~30min do proxy RPC),
com o estado suppression-aware por `maintenance_status=1 → 6 (SEM ACESSO DC)`.
Confirmado 1:1 com o Zabbix ao vivo: 25 internos + 15 parceiros = 40; SMS
Banking/INSS-BPC = FORA DO AR, EMP/bpcao/inss/mundial/pumangol/sap = SEM
ACESSO, resto OK.

**N3 (`apis-n3`) — bug real corrigido e validado.** Os 3 cartões de stat de
disponibilidade (24h/7d/30d, painéis 203/204/205) davam **"No data"** mesmo
para apps saudáveis. Causa-raiz (isolada por `ds/query`): as funções
`scale(-100)`+`offset(100)` que convertem o item de falha L1 (0/1) em % de
disponibilidade tinham os `params` guardados como **números** (`[-100]`,
`[100]`), mas esta versão do datasource Zabbix exige **strings** — devolve
**HTTP 500** `failed to parse function param: failed to convert value to
string: -100`, que o painel mostra como "No data". Corrigido para
`["-100"]`/`["100"]` nos 3 `n3-app-disp-*.json` (params **e** `defaultParams`)
e via push directo dos 3 painéis (apis-n3 v34, patch cirúrgico só das
`functions`, preservando gridPos). Confirmado ao vivo: os 3 cartões passaram a
mostrar **100.00%**. **Lição reutilizável**: nos painéis nativos do datasource
Zabbix, os params de qualquer função de transformação (`scale`/`offset`/…)
têm de ser **strings**, nunca números — senão HTTP 500 silencioso → "No data".
Restante N3 validado nos dois estados: saudável (SACC — 5 KPIs, timeline 24h,
4 VMs com gauges radiais, ficha) e em baixo (SMS Banking — "Está no ar? NÃO"
com o erro real, "Velocidade SEM DADOS" sem mostrar valor obsoleto, "1 problema
há 8h") — o tratamento maintenance/stale da §1.3 funciona.

**N4 (`apis-n4-sistema`) — relabel honesto "camada"→"departamento".** O N4
agrupava as VMs por `s4camPapel(name)`/`s4kpiPapel(name)` — um regex
`/\|\s*(.*)\)\s*$/` que extrai o fim do visible name da VM depois do último
`|`, que na prática é o **departamento** (deu `DTI` / `Outros` para o SACC),
não uma camada arquitectural. O rótulo dizia "camada" e o subtítulo do cartão
KPI dizia "frontend · middleware · base de dados …" — ambos enganadores.
Decisão do utilizador: **renomear para "departamento"** (honesto, baixo
esforço) em vez de fingir camadas que não existem como tag. Alterado o texto
visível em `l4-sys-kpi.js` (cartão "Departamentos · N áreas", subtítulo passou
a **listar os departamentos reais** — `Object.keys(camadas).sort().join(' · ')`
→ "DTI · Outros" — em vez do texto fixo), `l4-sys-camadas.js` (zone label
"por departamento", coluna "Departamento", erro), e os títulos do
`manifest.json`. Variáveis internas (`camadas`/`papel`/`s4camPapel`) mantidas
para não introduzir risco. Push dos 2 painéis BT (101/105) via
`options.afterRender` (apis-n4-sistema v6), confirmado ao vivo. **Caveats do N4
que ficam (não bloqueiam):** (1) não é maintenance-aware — mas só é alcançável
para sistemas internos multi-VM (`vmCount>1`, gate do botão N3→N4) e nenhum
desses está em manutenção hoje; (2) herda a colisão de sigla do SGC como o
resto do projecto; (3) o agrupamento por departamento vem de parse do nome, não
de uma tag — se um dia existir uma tag `camada`/`papel` real (app/bd/gateway),
migrar a fonte para essa tag.

**Pendências herdadas:** o `{$STRING.CHECK}` lixo do `app-bpcao` foi **resolvido**
(ver §1.6). Ainda aberto: os 6 triggers do template `BPC Web Monitoring v2` não
saem no `configuration.export` (recriar como exportáveis quando se tocar no
template).

## 1.6 Ajustes de seguimento (2026-07-10) — macro bpcao + tabela de VMs do N3

Dois pedidos directos após a validação da §1.5:

**1. `{$STRING.CHECK}` do `app-bpcao` limpo.** O macro de host (hostmacroid
`16937`) tinha um GUID lixo (`0666e2b2-dc1b-4bc8-885d-909a3a3df2ec`), que
aparecia até na descrição do trigger L3 (`[L3] Conteudo "0666e2b2…" ausente`).
Posto a **vazio** (`usermacro.update`), o que **desliga o L3 de conteúdo** neste
host — mesma configuração dos outros 15 externos que têm o macro vazio (§1.1). A
descrição do trigger passou a `[L3] Conteudo "" ausente`, dormente. **Sem risco
de notificação**: o item L3 estava a `0`, o host está em manutenção, e o
mediatype `Email` continua OFF (verificado). Quando a saída de rede do DC abrir e
se souber uma string de conteúdo real de `www.bpc.ao`, preencher o macro para
reactivar o L3.

**2. Painel "VMs de Hospedagem" do N3 — cards → TABELA NATIVA MySQL
(`n3-app-vms-tabela.json`).** Substituídos os cards com gauges radiais por uma
**tabela nativa Grafana** (mesmo padrão das tabelas do N2, datasource `MYSQL -
INFRA ZABBIX` `afor1g5862fb4c`), 1 linha por VM: **VM · Nome · IP · CPU · RAM ·
Disco · Triggers**. As colunas de métrica usam o cell type nativo **gauge/basic
bar** com thresholds 70/90 (verde/âmbar/vermelho); a coluna Triggers é
`color-background` (fundo âmbar quando ≥1, `✓` verde quando 0); a coluna VM tem
`dataLink` de **drill-down** para o N3 Servidores Virtuais
(`?var-hostid=${__data.fields["VM"]}`). Ordena **pior-primeiro** (`ORDER BY`
Triggers desc, depois `GREATEST(CPU,RAM,Disco)` desc) e as colunas ficam
sortáveis/filtráveis nativamente.

*Detalhe técnico importante (SQL):* nesta versão do Zabbix (7.4) a coluna
`items.lastvalue` **já não existe** (`Unknown column 'lastvalue'`) — os valores
actuais dos items vivem nas tabelas de `history`. A query obtém o último valor de
cada métrica por **subquery correlacionada** `(SELECT value FROM history hh WHERE
hh.itemid=i.itemid ORDER BY clock DESC LIMIT 1)` — o índice PK `(itemid,clock)`
torna isto rápido (SACC, 4 VMs → 0.83s; escala bem porque o nº de items por VM é
pequeno). CPU=`system.cpu.util`, RAM=`vm.memory.util`, Disco=`MAX` dos
`vfs.fs.size[%,pused]`, IP da tabela `interface` (main=1,type=1), nº de triggers
por subquery `triggers⋈functions⋈items value=1`. Como é MySQL nativo, **não sofre
a cache de ~30min do proxy RPC** (é ao vivo), tal como as tabelas do N2. O host
sintético (`${app}`) resolve a tag `servico` e a query traz todas as VMs com essa
tag (excluindo `app-*`). Push apis-n3 v37, validado ao vivo com o SACC (VS8000789
no topo por ter 1 trigger + Disco 89%). A versão intermédia em Business Text
(`l3-app-vm.js`, tabela HTML custom) foi **descartada** a favor desta nativa.

## 1.7 N3 — coluna "Problema" na tabela de VMs + ficha da app redesenhada (2026-07-10)

Segunda ronda de melhorias ao N3, por pedido directo:

**1. Tabela de VMs — coluna "Problema" (nome do trigger activo).** A tabela
nativa (§1.6) ocupava só metade da largura; acrescentada uma coluna final
**Problema** que mostra a descrição do trigger activo mais grave da VM
(subquery `triggers⋈functions⋈items value=1 ORDER BY priority DESC LIMIT 1`),
em texto âmbar, ou `—` quando não há alerta. Enche a largura e dá o contexto
("Apache: Failed to fetch status page" na VS8000789 do SACC). As descrições dos
triggers de VM vêm limpas do Zabbix (sem macros por expandir). Push apis-n3 v38.

**2. Ficha da aplicação redesenhada (`l3-app-ficha.js` v2).** A v1 repetia a
lista de VMs + serviços por VM (redundante agora que a tabela mostra as VMs).
A v2 é um **cartão de identidade da aplicação**: header com nome + serviço +
badge de tipo (SISTEMA INTERNO/PARCEIRO, cor por tipo), linha de **URL**
destacada e clicável (`{$URL}`), grelha 2×2 de factos (Conteúdo esperado
`{$STRING.CHECK}` · VMs de hospedagem + principal · Tempo de resposta
normal/lento · Alerta após N falhas) e **pills de níveis de verificação**
(L1/L2/L3/L4, verde=activo por existir o item `web.test.fail[LN]` com status=0).
Sem a parafernália de serviços por VM da v1.

**Achado (proxy BPC.rpc):** a config de monitoria (`{$TEMPO.*}`,
`{$FAILS.BEFORE.ALERT}`) está por **host** só nos sistemas **externos**; os
**internos** herdam os defaults do template `BPC Web Monitoring v2`
(`{$FAILS.BEFORE.ALERT}=3`, `{$TEMPO.NORMAL}=5s`, `{$TEMPO.LENTO}=8s`). A 1ª
tentativa lia o template ao vivo com `template.get(selectMacros)` — mas **o proxy
`BPC.rpc` bloqueia `template.get` (HTTP 500)**, tal como já se sabia de
`httptest.get`/`action.get`. Também `host.get selectInheritedMacros` devolve vazio
para estes hosts. Solução: os defaults do template ficam **hardcoded** em
`CFG.templateDefaults` (comentado para manter em sync se o template mudar) e são
**sobrepostos** pelas macros de host (`usermacro.get`, que funciona). Confirmado
ao vivo pelo próprio `window.BPC.rpc`: SACC → conteúdo "BPC-SACC", tempo 5s/8s,
alerta 3 falhas, 4 VMs, níveis L1/L2/L3 activos. Push apis-n3 v41.

## 1.8 N3 — aviso cruzado entre "Problemas activos" (card 4) e a tabela de VMs (2026-07-10)

Achado do utilizador ao testar o SACC e o eBankit: o card 4 "Problemas activos"
(e o painel nativo de triggers, id 105) mostravam **0 problemas / "No problems
found"**, enquanto a tabela "VMs de hospedagem" (id 102, §1.6) tinha uma linha
com triggers activos — lido à primeira vista como contradição ("o topo diz que
está tudo bem, a tabela diz que não").

**Não é bug de dados — são dois escopos diferentes, por design**: o card 4 e o
painel 105 filtram só pelo host sintético `${app}` (checks externos L1-L4 —
disponibilidade/velocidade/conteúdo/autenticação); a tabela de VMs filtra pelas
VMs por trás (triggers de infra — agente/ICMP/CPU/RAM/disco/serviços).
Confirmado ao vivo com dois casos reais:
- **SACC**: `app-sacc` → 0 triggers; VM `VS8000789` → 1 trigger activo
  ("Apache: Failed to fetch status page").
- **eBankit**: `app-internet-bank` → 0 triggers; VM `VS9000358` ("eBanking
  Audit System Prod") → **2 triggers activos** ("Unavailable by ICMP ping" +
  "Zabbix agent is not available") — esta VM está genuinamente inacessível há
  meses (já conhecido do 7.0.6), só visível na tabela.

**Correcção aplicada (opção escolhida pelo utilizador: manter os 2 escopos
separados, não fundir numa métrica só — fundir misturaria severidades muito
diferentes, ex. site fora do ar vs disco a 89%)**:
1. **Rótulo explícito**: card 4 passa de "Problemas activos" para "Problemas
   activos (externo)"; sub-texto do estado saudável passa de "nenhum — tudo
   saudável" (frase que sugeria segurança total) para "nenhum nos checks
   externos". Título da tabela de VMs passa de "VMs de hospedagem" para "VMs
   de hospedagem — alertas de infraestrutura".
2. **Aviso cruzado**: `l3-app-kpi.js` ganhou `l3kpiFetchVmInfo` (substitui
   `l3kpiFetchVmCount`), que além do nº de VMs já existente também conta
   triggers activos nas VMs (`trigger.get` sobre os hostids das VMs, mesma
   descoberta por tag `servico=` do card 0). Quando `problemCount > 0`, o
   card 4 mostra uma linha extra em âmbar "⚠ +N alerta(s) de infra na(s)
   VM(s) ↓" — este número **nunca** entra na contagem principal do card
   (que continua só L1-L4), só sinaliza que a tabela abaixo tem algo.

Validado ao vivo (browser, ambos os apps): SACC e eBankit mostram "0
problemas · nenhum nos checks externos" + aviso "⚠ +N alertas de infra"
consistente com a tabela. Push apis-n3 (painéis 101 e 102, manifest
actualizado com o título novo do painel 102).

## 2. Schema de tags (decisão 2026-07-08)

Decisão: **tags**, não macros nem inventário — é o único mecanismo já
integrado nos painéis Grafana deste projecto (filtros, variáveis, drill-down).
Inventário existe e está parcialmente preenchido mas nunca foi usado por
nenhum dashboard construído até agora; macros servem para a config de
monitorização, não para correlação/filtro.

```
tag: tipo    = sistema | parceiro   (todos os 41 hosts app-*, espelha as
                                      2 secções do relatório diário:
                                      "Sistemas e Aplicações" vs
                                      "Serviços com Parceiros")
tag: servico = <nome do sistema>    (todos os 41; mantido — não renomeado
                                      para "app", já tinha validação extensa
                                      de 05/07)
tag: vm      = <hostname da VM>     (24 internos, confirmados por IP ao
                                      vivo — hostinterface.get, não por
                                      memória de documentos antigos)
tag: ip      = <IP real>            (25 internos, incl. app-euronet;
                                      estático — não segue a VM se o IP
                                      mudar, aceite pelo utilizador para
                                      validação rápida ad-hoc)
```

`app-euronet` fica sem `vm` — único gap real (host nunca registado em
nenhum Zabbix, Infra nem Network; reverse DNS na altura resolvia `ACS9`,
já não resolve).

Reciprocidade confirmada: as VMs também têm a tag `servico` correspondente.
13/15 VMs já estavam correctas; 2 corrigidas (`VS8000305` ganhou 9 tags
`servico` específicas — as 2 antigas descritivas ambíguas removidas por
duplicarem `PSI`/`SIB` com nomenclatura diferente; `VS8000304` ganhou
`SAFT`+`SIR`).

## 3. Mapa VM confirmado por IP (24 apps internas)

Método: `{$URL}` do host `app-*` → IP/hostname → `hostinterface.get` na API
Zabbix → hostname da VM. Não por memória de documentos anteriores — alguns
já estavam errados (ver nota abaixo).

| VM | Apps (`servico`) | IP |
|---|---|---|
| `VS8000305` | ABC, CONTIF, PSI, Agendamento de Salas, SGC, SGF, SIB, SPCC, LIVE (9) | 10.10.236.50 |
| `VS8000304` | SAFT, SIR (2) | 10.10.238.40 |
| `VS9000480` | FORGEST | 10.10.238.201 |
| `VS8000418` | INTIX | 10.10.236.20 |
| `VS8000813` | SIC | 10.10.236.161 |
| `VS8000427` | sistema de compensação de cheques (SICV) | 10.10.238.176 |
| `VS8000438` | SMS BANKING+CHAT BOT | 10.10.238.214 |
| `VS8000141` | SWIFT | 10.10.13.11 |
| `VS8000422` | UYSIG | 10.10.236.16 |
| `VS8000437` | UYSIG (BNA) | 10.10.236.27 |
| `VS9000912` | BANK TRADE | 10.10.238.8 |
| `VS9000235` | CEZANNE | 172.16.8.183 |
| `VS8000789` | SACC | 10.10.204.45 |
| `VS8000724` | ebankit (só o nó gateway — ver §4) | 10.10.11.112 |
| `VS8000454` | TOBE/SOP | 10.10.236.34 |

**Correcção feita ao vivo**: `app-saft`/`app-sir` vão para `VS8000304`, não
`VS8000305` como uma nota antiga (`mapeamento-apps-vms-webscenarios-handoff-20260705.md
§12`) sugeria — confirmado por IP em 2026-07-08, não é o mesmo host das
outras 9 apps.

`app-euronet` (10.10.241.153) — sem VM registada, gap real (ver §2). App
recuperou de um hang transitório real observado ao vivo em 2026-07-08
(timeout total → HTTP 200 em <0.3s, 5/5 tentativas) — reactivado.

## 4. Dependências de BD/backend (investigação inicial, sem aceder a VMs novas)

Pedido do utilizador: para cada app, saber se a BD/backend vive na mesma VM
do frontend ou depende de outra VM à parte (uma app pode depender de mais
que 1 VM — BD, frontend, fila, etc. — a relação pode não ser 1:1).

Método usado (sem WinRM novo): (a) `item.get` filtrado por chave `mssql` nas
15 VMs, (b) cruzamento com o levantamento WinRM já feito em 05/07
(`bpc-workspace/Mapa_VMs_Servicos_Zabbix_Grafana.xlsx`, colunas
`Serviços/Apps Confirmados` e `Sites IIS`).

### 4.1 Auto-contidas (BD local confirmada, sem dependência externa visível)

| VM | Evidência |
|---|---|
| `VS8000305` | `SQLWriter` (SQL Server local) |
| `VS8000418` | `postgresql-x64-9.6` local |
| `VS8000438` | `postgresql-x64-17` + `ActiveMQ` local |
| `VS8000454` | Suite completa MSSQL local (`MSSQLSERVER`, SSAS, SSIS, Report Server) |
| `VS8000422` | Suite completa MSSQL local + Tomcat |
| `VS8000437` | Item MSSQL confirmado no Zabbix + Tomcat9 |
| `VS9000480`, `VS8000427`, `VS9000912` | Itens MSSQL activos no Zabbix (5/2/4); detalhe de serviços não capturado em 05/07 |

### 4.2 Sem BD local visível — dependência externa provável, por identificar

| VM | O que se vê | Achado lateral |
|---|---|---|
| `VS8000304` (SAFT, SIR) | Só `WebLogic`/`Tomcat10`/`WAS` (app servers Java), nenhum serviço de BD | Em `VS8000305` correm também `bpc-sir-frontend`/`bpc-sir-api` e `bpc_saft_api` — sugere modernização em curso (stack antigo em `.304`, novo front/API em `.305`); **não confirmado se são a mesma coisa ou versões paralelas** |
| `VS8000813` (SIC) | Só `MSMQ` (fila de mensagens), sem serviço de BD local | — |

### 4.3 Multi-VM confirmado — a VM mapeada é só 1 nó

| VM | App | Nota |
|---|---|---|
| `VS8000724` | ebankit/internet-bank | Só mostra o gateway web (sites IIS `ebk-ib`/`ebk-ids`/`ebk-gtw-omnichannel`/`ebk-cdn`/`ebk-cms`), sem BD local. A tag `ebankit` cobre **20 hosts** no total (achado de 05/07) — o `vm=` aponta só à porta de entrada; BD/middleware reais ficam nas outras ~19 VMs desse grupo, ainda não mapeadas 1:1 |

### 4.5 `ebankit` — fechado (2026-07-08/09)

Retomada a validação das tags automáticas do `inventario_zabbix_final.csv`
(script `1-zabbix_sync.py`/`34-zabbix-vmware-mapper.py`, parseado da
`Anotacao_Original`, nunca validado 1:1). Cruzado o CSV (Abril) contra
`host.get` ao vivo (`tags: servico contains ebankit`), token Admin, só
leitura:

- **18 VMs reais confirmadas** hoje com `servico=ebankit` (2 Front End,
  2 Back Office, 4 Middleware, 2 BD cluster, 2 Load Balancer, 3 QA, 2 Audit
  System QA+Prod, 1 IIS/CPI) — reconcilia o "20 hosts" da auditoria 14.27:
  16 já vinham do CSV de Abril + 2 novas criadas/tagueadas depois
  (`VS9000358` "eBanking Audit System Prod", `VS8000735` "Load
  Balance_Camada_Backoffice (Ebanking)") + `app-internet-bank` (monitor
  sintético, `vm=VS8000724` já confirmado em 14.24) = 20 no total à data.
- **1 falso-positivo identificado e já resolvido por outra frente**:
  `vs8000740` (minúsculas) tinha tag `EBANKIT` no CSV antigo ("Load balance
  do Middleware") — mas era o **duplicado zombie** apagado no Z.46 (mesma
  sessão). O host real, `VS8000740` (maiúsculas, confirmado por WinRM),
  está correctamente tagueado **`servico=canais digitais`** ("Whatsapp BPC
  \| Load balance_Camada_Appcenter") — é um load balancer partilhado de
  outro canal digital, não pertence ao `ebankit`. Confirma que o parser
  antigo (baseado só na descrição) atribuía o serviço errado quando 2 VMs
  partilhavam o mesmo IP histórico.
- **Nenhuma escrita feita** — achado fechado só com leitura (`host.get`
  directo à API, sem passar pelo snapshot local desactualizado
  `audit_609_hosts_raw_20260708.json`, que também não continha
  `VS8000740`/`vs8000740` por ter um âmbito de grupo mais restrito).

### 4.4 Sem dados — precisa de investigação nova (WinRM nomeado) ou fica só com visible name (§5)

- `VS9000235` (Cezanne) — Server 2003 EOL, levantamento antigo muito limitado
- `VS8000141` (SWIFT) — nunca investigado (segregação de segurança, decisão de não mexer já tomada)
- `VS8000789` (SACC) — fora do universo dos 136 hosts inspeccionados em 05/07

## 5. Próximo passo (em curso) — visible name das VMs de Produção

Ideia do utilizador (2026-07-09): sem aceder a nenhuma VM em horário
laboral, o campo **visible name** (`host.name`, distinto do `host.host`
técnico `VSxxxxxxx`) de cada VM de Produção já dá uma pista forte sobre o
que ela faz — método 100% de leitura, sem tocar em nada. A levantar a
seguir, à escala de toda a Produção (grupo 609), não só as 15 deste grupo.

## 6. Impacto na decisão de domínio/pasta Grafana

Pendente — o utilizador ligou explicitamente esta investigação de
dependências à decisão de **manter ou mudar os domínios/pastas Grafana**
actuais (`07·APIs e Serviços` vs `08·Serviços de Negócio` etc.) para cada
sistema. Ainda não decidido; retomar depois do levantamento do §7.

## 7. Ficheiro-fonte encontrado — `inventario_zabbix_final.csv`

O utilizador lembrou que já existia um deliverable com o cruzamento
VM↔vCenter↔classificação: **`bpc-workspace/inventario_zabbix_final.csv`**
(463 linhas, actualizado 2026-04-23). Colunas: `Nome_Original;Visible_Name;
IP;Host_Fisico;Cluster;tag_activo;tag_camada;tag_servico;tag_ambiente;
tag_tecnologia;tag_departamento;tag_cod_ambiente;tag_cluster;Hostgroups;
Anotacao_Original;Tipo_Parse;VN_Chars;host_fisico;esxi_host;vcenter`.
Gerado pelo pipeline `scripts-a-analisar/de-scripts-import/` (`1-zabbix_sync.py`
consome este CSV; `2-extrair_inventario_transicao.py` gera a folha de revisão
manual; `34-zabbix-vmware-mapper.py` faz o cruzamento por UUID com os 3
vCenters). Torna redundante extrair o *visible name* à mão — já vem
parseado, mais o `esxi_host`/`vcenter`/`Cluster` que o *visible name* sozinho
não dá.

### 7.1 Cruzamento com as 15 VMs deste grupo — achados

- **`VS8000141` (SWIFT)**: `Cluster Swift` (não `CLS-BPC01`), `VCenter_MAIN`
  (não `VCenter_BPC01`), hardware Cisco UCS C220-M4 (não PowerFlex R650-C)
  — confirma segregação total de infra-estrutura, coerente com a decisão de
  segurança já tomada de não mexer.
- **`VS8000422` (UYSIG)**: nota original diz literalmente **"DB Novo"** —
  confirma auto-contida (já tínhamos visto suite MSSQL completa local).
- **`VS8000427`/`VS8000454` (TOBE)**: notas "Serv Aplic TOBE - STC" e
  "Serv Aplic TOBE - SOP" — TOBE é uma plataforma com vários módulos; achado
  que liga a um gap de cobertura (ver §7.2).

### 7.2 Gaps de cobertura (Fase C4 / `auditoria-apis-servicos.md §5.3`) — cruzados com o CSV completo

| Gap | Estado | VM(s) identificada(s) | Evidência |
|---|---|---|---|
| **EQUATION Core Bancário** | ✅ resolvido | `VS8000320`, `VS8000321` | `servico="Servidor de aplicacoes"`, nota **"Equation Teller and FPM"** |
| **EBA** | ✅ resolvido | `VS1800002` (app) + `SV9000401` (BD) | `SV9000401` tem `tag_camada="Bases de Dados"` — confirma a suspeita de 05/07 de que é o servidor de BD de apoio |
| **BFTELLER** | ✅ resolvido | `VS8000452` | `servico="Gestão do BFTELLER"`, nota "Aplicação Caixa das Agências" |
| **STC** | 🔀 confirmado mas espalhado por 3 VMs | `VS8000427` (TOBE), `VS8000416` (Match Cash — "Reconciliação de contas STC (EMIS)"), `VS8000912` (QA, "Serv Dev da TOBE - STC, SCC") | Parece ser um fluxo de negócio (ligado ao EMIS) que atravessa vários sistemas, não uma app isolada |
| **Match Cash** | ◐ mais completo | `VS8000401`, `VS8000416`, `VS8000417` | Departamento `DOP`; 3 VMs com notas distintas (reconciliação interna BPC / STC-EMIS / correspondentes BNA) — parecem servir tipos de reconciliação diferentes, não réplicas |
| **CTB/400** | ❌ sem pista | — | Zero menções a "iSeries"/"AS400"/"CTB" em toda a frota (463 VMs) |
| **Bloomberg** | ❌ sem pista | — | Zero menções |
| **BODIVA** | ❌ sem pista | — | Zero menções |
| **Audit Bank** | ❌ sem pista | — | Só existem "AD AUDIT" (auditoria de Active Directory) e "Ebankit audit system" — nenhum dos dois é o sistema do relatório |
| **Payment Manager** | 🔀 possível match, por confirmar | `VS8000317` (QA), `VS8000324` (Produção) | Ambos tagged `SWIFT`, nota "FPM - Fusion Payment Manager" — pode ser o mesmo sistema, mas fica dentro do perímetro SWIFT (não mexer) |
| **UYSIG** | ✅ já coberto | `VS8000422`, `VS8000437` | Já tinha `app-*` antes desta sessão |

Nenhuma escrita feita — só leitura do CSV e do Zabbix. Próximo passo natural
(não executado ainda): construir `app-*` novos para EQUATION/EBA/BFTELLER,
já que têm VM identificada e URL/porta ainda por confirmar.

## 8. Vista geral da frota (461 VMs, `inventario_zabbix_final.csv`)

### 8.1 Por ambiente / camada / vCenter

| Ambiente | VMs |
|---|---:|
| Produção | 311 (67%) |
| QA | 112 |
| A-CLASSIFICAR | 27 |
| Operações | 8 |
| Desenvolvimento | 2 |
| Teste | 1 |

| Camada | Total | Produção |
|---|---:|---:|
| Camada Aplicacional | 223 | 133 |
| Serviços de Infraestrutura | 75 | 69 |
| Bases de Dados | 70 | 43 |
| A-CLASSIFICAR | 27 | — |
| Virtualização | 24 | 24 |
| Plataforma de Contentores (OCP) | 18 | 18 |
| Segurança | 17 | 17 |
| Interface e Web | 7 | 7 |

- **`VCenter_BPC01`**: 275 VMs (60%) — clusters `CLS-BPC01` (263) + `CLS-MGMT` (12)
- **`VCenter_MAIN`**: 186 VMs (40%) — clusters `CS9000002` (180) + `CS9000001` (1)
- **`Cluster Swift`**: 5 VMs — isolado (confirma §7.1)

### 8.2 Por departamento (top)

`DTI` (247, 54% — genérico, espalhado por todas as camadas) > **`PMSI` (96, 21%)**
> `A-CLASSIFICAR` (28) > `DSI` (14) > `DSE`/`SAFIRA` (13 cada) > `DCH` (8) >
`FENIX` (5) > `DOP` (4).

Em Produção: `DTI` (192, espalhado por todas as camadas — app/infra/
virtualização/BD/contentores/segurança) vs `PMSI` (48, quase todo
`Camada Aplicacional`+`Bases de Dados` — perfil de departamento de negócio,
não de TI genérica).

### 8.3 `PMSI` (96 VMs) — não é 1 sistema, é um programa de modernização

| Sub-sistema | VMs | Notas |
|---|---:|---|
| **INTEGRADOR** | 16 | Plataforma de integração/dados completa: Kafka, NiFi, ElasticSearch, Ceph, GitLab, Bastion Node, Master Node — parece um cluster de dados moderno, não uma "app" |
| **DIGIWAVE** (+variantes) | 16 | `FINASTRA` |
| **FIRCOSOFT** (+App/MQ/Utilities) | 12 | Já conhecido de 05/07 — compliance/AML, `FINASTRA` |
| **ESSENCE / FUSION ESSENCE** | 11 | "Migration Tool"/"Equation Client" — ferramenta de migração ligada ao Equation |
| **ACM** | 8 (+1 `ACMRELATIONAL`) | Ver §8.6 — contexto técnico encontrado (2026-07-09), meaning de negócio ainda por confirmar |
| **CreditQuest** | 5 | `FINASTRA` |
| **TOBE (só BD)** | 4 | Achado: a camada BD do TOBE está tagged `PMSI`, não `DTI` (a camada app está); "Portal de Operações"/"Sistema de Compensação" |
| **OPTICS, NETMARKET, PRIMAVERA, BANKTRADE, GIT LAB, EXCEL REPORT, NGINX, E-Learning, SUPPORTSERVER** | ~1-4 cada | Menor escala, diversos |

Conclusão: `PMSI` é um **programa de transformação de TI**, centrado no
ecossistema **Finastra** (Fircosoft/Digiwave/CreditQuest) + uma plataforma
de integração de dados moderna (Kafka/NiFi/Ceph) + ferramentas de migração
(Essence/Equation). Não é um sistema de negócio único — quase todo fora do
universo dos 50 sistemas do relatório diário.

### 8.4 `SAFIRA` (13 VMs) — plataforma Fintech contida

- **`FINANTECH`** (8 VMs) — arquitectura completa: Front Office + Back Office
  + BD, ambientes QA e Produção
- **`SDVM`/`DSVM`** (5 VMs) — servidores de desenvolvimento/UAT

Muito mais contido que PMSI — 1 plataforma/produto específico
("FINANTECH"), com o seu próprio ciclo dev→UAT→produção.

### 8.5 Implicação para domínios/pastas Grafana (decisão ainda pendente)

`PMSI` e `SAFIRA` são candidatos fortes a **domínio/pasta Grafana próprios**
(1º nível, ex. `10·PMSI`/`11·SAFIRA`) — não são apps de negócio individuais,
são programas/plataformas inteiras com arquitectura própria. Não fazem
sentido dentro de "APIs e Serviços" ou "Serviços de Negócio" como estão
hoje. Decisão final por tomar; ver §8.6 para o contexto (parcial) já
encontrado sobre `ACM`.

### 8.6 `ACM` — contexto técnico encontrado, meaning de negócio por confirmar (2026-07-09)

Retomada a validação (`host.get` ao vivo, tag `servico`/`departamento`,
token Admin, só leitura). Confirmado ao vivo (departamento=PMSI, hoje: 94
VMs, vs 96 do CSV de Abril — ligeira deriva normal, sem investigar).

`ACM` **não é exclusivo do PMSI** — é maior e está fragmentado por 3
departamentos:

| Departamento | VMs | Ambiente | Nota |
|---|---:|---|---|
| `PMSI` | 8 `ACM` + 1 `ACMRELATIONAL` | 5 Produção + 4 QA | Confirma a tabela §8.3 |
| `DTI` | 8 `ACM` | Todas QA | Ambiente paralelo/legado, possivelmente pré-migração para PMSI |
| `DSE` | 1 `ACM` | QA | `VS8000345` — descrição menciona **"Aplicação da Assecco (MIA)"** |

**Pista de negócio (não confirmada)**: o próprio `visible name` de
`VS8000345` liga `ACM` ao fornecedor **Assecco** e ao produto **"MIA"** —
primeira pista concreta de que sistema é este. Reforça achado anterior
(`vm-agente-recuperacao-handoff-20260704.md`, WinRM em `VS8000768`):
**11 serviços Windows nomeados `ACM-*`** + `Keycloak` (autenticação) +
`RabbitMQ` (mensageria) — arquitectura de microserviços real, não um
artefacto de tag. `VS8000482` acrescenta outra pista: "Server ACM - MFT \
PRT Qualidade, Certificação" (MFT = Managed File Transfer).

**Ainda por confirmar com o negócio**: o que "ACM"/"MIA" fazem
concretamente (nenhuma das 50 linhas do relatório diário de negócio bate
com este nome) — candidato a pergunta directa ao utilizador antes de
decidir se `ACM` é sub-sistema do domínio `PMSI` ou merece o seu próprio
`app-*`/tratamento.
