# CLAUDE.md — v5 (dashboards v5)

> Regras de fluxo de trabalho para **todos** os dashboards desta pasta `v5/`.
> Para regras de arquitectura específicas de um domínio (ex.: VMs), ver o
> `CLAUDE.md` dentro da respectiva subpasta (ex.: `servidores-virtuais/CLAUDE.md`).
> Este ficheiro complementa — nunca substitui — o `CLAUDE.md` raiz do projecto.

---

## 0. Âmbito

Esta pasta (`v5/`) mapeia 1:1 para a pasta **"dashboards v5"** no Grafana
(`http://10.10.126.22:3000`). Cada subpasta de `v5/` corresponde a um ou mais
dashboards reais nesse Grafana. As regras abaixo aplicam-se a todas as
subpastas: `visao-geral/`, `servidores-virtuais/`, `servidores-fisicos/`,
`armazenamento/`, `seguranca/`, `bases-dados/`, `apis/`, `datastores/`,
`servicos/`, `rede/`, `agencias/`.

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

O Grafana (plugin Business Text) guarda cada painel como um objecto JSON com
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
3. `push` do JSON completo de volta (operação única de layout).
4. `git commit`: os `.js` de cada painel + `manifest.json` + este JSON final.

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
- **Convenção de nomes:** por agora mantêm-se os nomes descritivos existentes
  (`l2-*.js`, `l3-*.js`, prefixo de nível conforme o `CLAUDE.md` raiz do
  projecto). Não se renomeia para `p0-/p1-/p2-...` — decisão pendente de
  confirmação explícita; se vier a ser adoptada, actualizar esta secção.

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
- Continua a aplicar-se a regra do `CLAUDE.md` raiz: nunca redefinir
  `window.BPC_SHARED`/`window.BPC_CHARTS`/`BPC.utils`/`BPC.rpc` localmente
  num painel de conteúdo — usar sempre o que o painel utilitário expôs.

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

O painel Business Text só renderiza `options.content` quando a query Zabbix
configurada no `target` do painel devolve **pelo menos uma linha**
(`renderMode: allRows`). Os filtros (`group`/`host`/`item`) não precisam de
ser os dados reais mostrados (isso é feito via RPC dentro do `afterRender`)
— servem só de "âncora" para destravar o render. **Nunca deixar estes
filtros vazios** — apontar sempre para um host/item Zabbix real e
permanentemente disponível.

## 8. Checklist antes de aprovar um painel

- [ ] `node --check` passa
- [ ] Usa o gabarito `initWithRetry` (secção 6) se for painel de conteúdo
- [ ] Não redefine `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils` localmente
- [ ] `target` do painel tem `group`/`host`/`item` apontados para algo real
- [ ] Testado no browser com espera suficiente (15-20s) antes de concluir
      que falhou
- [ ] `manifest.json` actualizado com o `id` do painel
- [ ] Checklist do `CLAUDE.md` raiz do projecto também cumprida (CFG, labels,
      cores de estado, etc.)
