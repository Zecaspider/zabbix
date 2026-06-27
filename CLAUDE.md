# CLAUDE.md — BPC-Observe

> **Autoridade única e auto-suficiente deste directório.** Todo o trabalho vive
> dentro de `bpc-observe/` — não depender de nada fora dele.
> Documentos de referência (todos internos a esta pasta):
> - `README.md` — índice da estrutura
> - `cronograma.md` — painel de progresso vivo (estado de cada ponto)
> - `documentacao/engenharia-do-sistema.md` — arquitectura, contratos, DoD
> - `documentacao/blueprint-observabilidade.md` — mapa de drill-down N1→N2→N3
> - `documentacao/mapa-host-groups.md` — domínio → groupId/datasource
> - `documentacao/framework-de-criacao-de-cards.md` — contrato de dados do card
> - `<dominio>/CLAUDE.md` — regras específicas de um domínio (quando existir)

---

## CONSTRAINTS IMUTÁVEIS — ler antes de qualquer acção

Estas regras são sempre verdade. Não requerem verificação por sessão — violá-las é sempre um erro.

| Constraint | Valor / Regra |
|---|---|
| **Pastas Grafana por domínio** | Cada dashboard vive na pasta de domínio do seu nível, não numa pasta única (reorg Fase 12, 2026-06-19). UIDs das pastas: `00·Visão Geral` `bfpm0sdaos074d` · `01·Infraestrutura VMware` `bfpm0sdhhi22od` · `02·Armazenamento` `dfpm0sdnq8x6oe` · `03·Servidores Virtuais` `cfpm0sdsxjb40c` · `04·Rede` `bfpm0sdxiclxcf` · `05·Segurança` `afpm0se1lombkb` · `06·Bases de Dados` `afpm0se5rij28d` · `07·APIs e Serviços` `bfpm0sedbpgqob` · `08·Serviços de Negócio` `dfpm0sej5gxs0f` · `99·Arquivo` `dfpm0sey9ut4wb`. **Agências = sub-domínio de Rede** — pasta `04·Rede`; `09·Agências` está vazia/para arquivo. Cada `manifest.json` tem o `folderUid` correcto. A pasta antiga "dashboards v5" (`efpbu5tvrhce8a`) está vazia/legada. Estrutura completa em `documentacao/engenharia-do-sistema.md §4.2` |
| **Naming de dashboards** | Título: `Domínio · Âmbito — Propósito · Nx` (sentence case, ` · ` entre hierarquia, ` — ` antes do propósito, `· Nx` sufixo). UID: `dominio.nivel.funcao`. Detalhes e exemplos em `documentacao/engenharia-do-sistema.md §4.0` |
| **Utils canónico** | `_comum/utils.js` é a fonte de verdade · para cada dashboard: **copiar** o ficheiro inteiro e ajustar só o `nocLabel` · nunca editar a cópia directamente |
| **Push ao Grafana** | Parar e pedir confirmação explícita ao utilizador antes de qualquer escrita |
| **Git commit** | Parar e pedir confirmação explícita ao utilizador antes de qualquer commit |
| **`content` no manifest** | Cada entrada de painel em `manifest.json` **deve** ter `"content": "<div id=\"...\"></div>"` com o `elementId` exacto declarado no CFG do `.js` · sem este campo o `push_panel.py` gera um ID errado e o painel fica em branco |
| **Sem scroll nos painéis** | Cada painel deve ter `gridPos.h` dimensionado para que o seu conteúdo caiba inteiramente no viewport sem barra de scroll interna · ajustar no passo de layout final (§4) |

---

## 0. Âmbito e infra

**Stack:** Grafana **12.4.2** · Zabbix **7.4** (Infra) e **7.0** (Network) · plugin Business Text (`marcusolsson-dynamictext-panel`) v6.2.0

**Datasources Grafana:**
| UID | Nome | Zabbix |
|---|---|---|
| `3_KgG43nz` | BPC - INFRA | Zabbix 7.4 Infra |
| `ffo8sp8zllog0e` | BPC-NETWORK | Zabbix 7.0 Network |

**Plugin para painéis BPC:** Business Text (`marcusolsson-dynamictext-panel`).
- Nome no código: `"type": "marcusolsson-dynamictext-panel"`
- **Atenção:** o nome antigo `marcusolsson-businesstext-panel` é incorrecto nesta versão do Grafana e provoca falha silenciosa do painel.
- Opções obrigatórias num painel DT funcional: `renderMode: "allRows"`, `editors: ["afterRender"]`, `transformations: [{id:"reduce"}]`.

Esta pasta mapeia para a pasta **"dashboards v5"** no Grafana
(`http://10.10.126.22:3000`, UID `efpbu5tvrhce8a`). Estrutura: 1 pasta por
domínio (`servidores-fisicos/`, `servidores-virtuais/`, `armazenamento/`,
`seguranca/`, `bases-dados/`, `apis/`, `servicos-negocio/`, `rede/`,
`agencias/`), mais `visao-geral/` (N1). Cada domínio tem subpastas `n2/` e `n3/`
— **1 subpasta = 1 dashboard Grafana = 1 `manifest.json`** (regra completa em
`documentacao/engenharia-do-sistema.md` §4.1).

## 1. Princípio: ficheiros locais primeiro, Grafana depois

Fluxo obrigatório para qualquer alteração:

```
1. Editar o ficheiro .js localmente
2. node --check ficheiro.js          (sintaxe válida antes de subir)
3. Subir para o Grafana (push)
4. Testar no browser (screenshot + console, com tempo suficiente
   para a query Zabbix e o RPC assentarem — não concluir "está partido"
   antes de esperar ~15-20s)
5. Aprovado → git commit do(s) ficheiro(s) alterado(s)
   Reprovado → corrigir o .js local e repetir a partir do passo 2
```

**Nunca corrigir directamente no Grafana sem reflectir a alteração no
ficheiro local primeiro.** O Grafana é o ambiente de teste, não o repositório.

## 2. Porque é que cada painel não é só um ficheiro

O Grafana (plugin Business Text — ID: `marcusolsson-dynamictext-panel`) guarda cada painel como um objecto JSON com
dois tipos de campo bem distintos:

| Campo | Onde vive localmente | Conteúdo |
|---|---|---|
| `options.afterRender` (a lógica/render do painel) | o `.js` do painel | JS puro, sem imports, autónomo |
| `gridPos`, `targets` (query Zabbix), `datasource`, `fieldConfig` | só existe no JSON do dashboard | estrutura/posição/dados, não lógica |

**Nunca duplicar o conteúdo do `.js` dentro de um ficheiro `.json` mantido à
mão.** Um JSON de dashboard completo, gravado em disco, só deve existir como
**snapshot pontual** (ver secção 4) — nunca como cópia permanentemente
sincronizada à mão do `afterRender`. Manter os dois em sync manualmente é
frágil e gera duplicação inútil (já aconteceu nesta pasta — fail a evitar).

## 3. Construção incremental, painel a painel

Ao construir ou reconstruir um dashboard, **não** escrever todos os painéis
de uma vez e só depois testar. Em vez disso:

```
para cada painel (pela ordem do manifest.json, ver secção 5):
  1. escrever/editar o .js localmente
  2. node --check
  3. push: substituir/adicionar apenas este painel no dashboard Grafana
     - painel novo  → adicionado com gridPos provisório (full-width,
       empilhado abaixo do último painel existente) — não perder tempo
       a acertar o layout final nesta fase
     - painel já existente → só o afterRender é substituído; gridPos
       fica como estava
  4. testar no browser
  5. aprovado → manifest.json actualizado (id atribuído pelo Grafana) →
     avançar para o próximo painel
     reprovado → corrigir o .js e repetir a partir do passo 2
```

O ajuste de **layout final** (gridPos de todos os painéis, lado a lado,
tamanhos definitivos) só acontece **depois de todos os painéis do dashboard
estarem aprovados** — é um passo único, no fim, não um ajuste por painel.

## 4. JSON completo do dashboard — só no fecho

Quando todos os painéis de um dashboard estão aprovados:

1. `pull` do dashboard completo do Grafana → escrever `dashboard-completo.json`
   (ou `<nome-dashboard>.json`) nessa subpasta.
2. Ajustar `gridPos` de todos os painéis nesse ficheiro (passo manual, é só
   estrutura — nunca o texto do `afterRender`).
3. Definir **`"transparent": true`** em **todos** os painéis e **`"title": ""`**
   nos painéis de conteúdo (`role != utils`). Regra obrigatória NOC — aplica-se
   a todos os dashboards N2 e N3, sempre, sem excepção.
4. `push` do JSON completo de volta (operação única de layout).
5. `git commit`: os `.js` de cada painel + `manifest.json` + este JSON final.

Este ficheiro JSON deixa de ser tocado depois disso, a não ser que se repita
este processo de fecho (ex.: dashboard ganhou um painel novo mais tarde).

## 5. Manifesto por dashboard

Cada subpasta/dashboard tem um `manifest.json` pequeno, que é a ligação
robusta nome-de-ficheiro ↔ painel Grafana (evita ter de adivinhar a
correspondência por tamanho/conteúdo do script):

```json
{
  "dashboardUid": "5b6b0e85-0e65-4753-9d99-9602cfcd85d1",
  "dashboardTitle": "D4-N2-Servidores virtuais",
  "panels": [
    { "file": "l2-header-global.js",            "id": 1, "role": "utils",   "title": "Header + Shared" },
    { "file": "l2-kpi-card-v5.js",               "id": 3, "role": "content", "title": "KPI Strip" },
    { "file": "l2-correlacionador-de-eventos.js","id": 7, "role": "content", "title": "Event Correlation" }
  ]
}
```

- `id` fica `null` até ao primeiro push desse painel (é o Grafana que o
  atribui).
- `role: "utils"` identifica o(s) painel(ões) utilitário(s) — ver secção 6.
- **Convenção de nomes:** prefixo de nível `l2-*.js` / `l3-*.js`, painel utils
  `utils.js` (`documentacao/engenharia-do-sistema.md` §4). Mantêm-se nomes
  descritivos; não se renomeia para `p0-/p1-...`.
- **Fonte de verdade do utils:** o painel `utils.js` canónico vive em
  `_comum/utils.js` (raiz) e é **copiado** para cada dashboard. Melhorias ao
  runtime partilhado fazem-se primeiro em `_comum/utils.js` e só depois se
  propagam às cópias — nunca divergir uma cópia à mão.

## 6. Painel(ões) utilitário(s) — padrão obrigatório, não excepção

Como não há bundler nem imports, cada dashboard precisa de **pelo menos um**
painel "utilitário" que carregue primeiro e defina o que os outros painéis
vão consumir (`window.BPC`, `window.waitForBPC`, `window.BPC_SHARED`,
`window.BPC_CHARTS`, CSS global).

- **Por defeito: um único painel utilitário por dashboard** (`role: "utils"`
  no manifesto), fundindo header + shared + charts — menos pontos de falha
  do que vários painéis "early" a correr em paralelo.
- Só se separa em dois utilitários se houver justificação concreta (ex.: uma
  biblioteca de gráficos pesada e reutilizada só por alguns painéis daquele
  dashboard específico).
- Regra (contrato utils, `documentacao/engenharia-do-sistema.md` §5.1): nunca
  redefinir `window.BPC_SHARED`/`window.BPC_CHARTS`/`BPC.utils`/`BPC.rpc`/`THEME`
  localmente num painel de conteúdo — usar sempre o que o `utils.js` expôs.

### Bootstrap obrigatório em todo o painel de conteúdo

O painel utilitário pode ainda não ter terminado de definir `window.waitForBPC`
quando um painel de conteúdo arranca (corrida de carregamento — já causou um
dashboard inteiro em branco nesta pasta). Por isso, **todo** painel de
conteúdo usa este gabarito de arranque, nunca uma chamada directa:

```js
function start(rpc) {
  // lógica do painel aqui
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] <nome-do-painel>: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
```

❌ Nunca: `window.waitForBPC(function (rpc) { ... })` directo, sem guarda.

## 7. Query Zabbix "âncora" de cada painel

O painel Dynamic Text só renderiza `options.content` quando a query Zabbix
configurada no `target` do painel devolve **pelo menos uma linha**
(`renderMode: allRows`). Os filtros (`group`/`host`/`item`) não precisam de
ser os dados reais mostrados (isso é feito via RPC dentro do `afterRender`)
— servem só de "âncora" para destravar o render. **Nunca deixar estes
filtros vazios** — apontar sempre para um host/item Zabbix real e
permanentemente disponível.

**Escolha da âncora:** preferir itens de **polling frequente e fiável** —
ICMP ping (`icmpping`) ou `ICMP Availability` são ideais. Evitar items
VMware (`vmware.hv.*`, `vmware.vm.*`) como âncora: o poller VMware tem
intervalos mais longos e pode não ter pontos no intervalo de tempo
seleccionado, causando render vazio mesmo com o host activo. Âncora
canónica recomendada: `Storage - IBM FS9500` / `ICMP ping` (grupo Storage) —
funciona para qualquer dashboard independentemente do domínio.

## 8. Checklist antes de aprovar um painel

- [ ] `node --check` passa
- [ ] Usa o gabarito `initWithRetry` (secção 6) se for painel de conteúdo
- [ ] Não redefine `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils` localmente
- [ ] `target` do painel tem `group`/`host`/`item` apontados para algo real
- [ ] Testado no browser com espera suficiente (15-20s) antes de concluir
      que falhou
- [ ] `manifest.json` actualizado com o `id` do painel
- [ ] DoD do painel cumprido (`documentacao/engenharia-do-sistema.md` §10.1):
      CFG aninhado, labels/cores/thresholds do catálogo §6.2, sem hardcode
- [ ] Contrato de dados respeitado (`documentacao/framework-de-criacao-de-cards.md`)
