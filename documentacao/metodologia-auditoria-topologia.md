# Metodologia de auditoria de topologia — antes de desenhar/redesenhar dashboards

> Criado 2026-07-01, a partir da investigação que levou ao rebuild do
> segmento Borda DC (`documentacao/engenharia-do-sistema.md` §4.0, linha
> "Fluxo Borda DC" em `CLAUDE.md`). Aplicável a **qualquer** domínio/segmento,
> não só Rede — usar sempre que se for desenhar ou redesenhar a hierarquia de
> dashboards de um segmento.

## Quando usar

Antes de qualquer decisão de arquitectura de dashboards (quantas vistas,
que eixos, que agrupamento) — nunca depois. O objectivo é substituir
suposições (mesmo as que "parecem óbvias" olhando para nomes de host ou
para o código já existente) por dados reais confirmados.

Sinal de que este processo é necessário: alguém pergunta "quantos X temos"
ou "o Y é exclusivo do Z" e a resposta não está imediatamente confirmada
por uma fonte primária (não um doc, não um label de dashboard).

## Regra de ouro

> **Nunca aceitar a tag de host, o `funcao`/label do Zabbix, ou o título/label
> de um dashboard existente como fonte de verdade.** Só o nome + descrição
> real de cada item/interface (`item.get`) conta como facto. Tags e labels
> são pistas de partida — não substituem a verificação.

Prova do porquê: no caso Borda DC, a tag Zabbix `funcao=wan-agencias` do
router WAN-AG sugeria 1 função; o `item.get` revelou 3 (Agências + Edifícios
+ Azure ExpressRoute). O label de código "AZURE/GOV" do router GTW01 sugeria
uma delas; o `item.get` mostrou zero circuitos Azure ali. Em ambos os casos,
confiar na tag/label teria produzido um dashboard novo com o mesmo erro do
antigo.

## Checklist passo-a-passo

| # | Passo | Ferramenta | O que resolve |
|---|---|---|---|
| 1 | **Inventário autoritativo** — contar os dispositivos reais do segmento | `hostgroup.get` (filtro pelo grupo Zabbix) | Elimina "quantos são" como suposição numa única chamada |
| 2 | **Tags/inventário do host** — ler a classificação já atribuída | `host.get` com `selectTags: 'extend'`, `selectInventory: 'extend'` | Dá uma **hipótese de partida**, nunca a resposta final (ver Regra de ouro) |
| 3 | **Inventário real de circuitos/interfaces** — nome + descrição, por host | `item.get` (ex.: `search: {key_: 'net.if.status'}`, `output: ['hostid','name','key_','lastvalue']`), parseado por regex | **A fonte de verdade.** É aqui que tags/labels desactualizados são desmascarados |
| 4 | **Cruzar com documentação existente** | Ler docs do domínio (ex.: `rede-topologia.md`, `rede-carriers.md`, `mapa-host-groups.md`) | Dá contexto/nomenclatura, mas pode estar incompleta ou desactualizada — tratar como hipótese a confirmar no passo 3, não como facto |
| 5 | **Procurar activamente mapeamentos N:M** | Pergunta explícita: "este dispositivo serve mais de 1 função de negócio? esta função vive em mais de 1 dispositivo?" | É a pergunta que gera a lista real de ambiguidades — se não for feita em voz alta, passa despercebida |
| 6 | **Verificar triggers/descrições de item** (descartar rápido se não tiver valor) | `trigger.get`, `item.get` com `output: ['description']` | Geralmente é boilerplate genérico de template (MIB standard) — mas não saltar o passo, porque ocasionalmente há contexto de negócio custom ali |
| 7 | **Documentar o mapeamento real ANTES de escrever código** | Tabela markdown (dispositivo × função real × fonte) | O código de classificação (regex por interface) deve ser validado contra esta tabela, nunca inventado a partir do nome do host |

## Receita técnica: query ao vivo ao Zabbix via browser Grafana já autenticado

Não é preciso escrever um painel novo só para explorar dados. Se já existe
uma tab Chrome autenticada num dashboard Grafana com o runtime BPC carregado
(qualquer painel utils/`_comum/utils.js` já expõe `window.BPC.rpc`), dá para
correr queries Zabbix ad-hoc directamente na consola da página, via
`mcp__claude-in-chrome__javascript_tool`:

```js
// CERTO — top-level await, sem wrapper
const hosts = await window.BPC.rpc('host.get', {
  hostids: ['10838','10839'], output: ['hostid','host'], selectTags: 'extend'
});
JSON.stringify(hosts)
```

```js
// ERRADO — devolve {} silenciosamente, sem erro visível
(async () => {
  const hosts = await window.BPC.rpc('host.get', {...});
  return JSON.stringify(hosts);
})()
```

O `javascript_tool` já suporta `await` de topo (REPL semantics) — envolver
numa IIFE `async` quebra a captura do valor de retorno sem lançar excepção,
o que é enganador (parece que a chamada correu e devolveu vazio). Ferramentas
úteis para este tipo de investigação: `host.get`, `hostgroup.get`,
`item.get`, `trigger.get` — todos já usados pelos painéis BPC existentes,
por isso o método (`rpc(method, params)`) e os filtros (`hostids`, `search`,
`filter`, `output`) seguem sempre a mesma sintaxe da Zabbix API.

## Referências

- Caso de uso completo: rebuild do segmento Borda DC —
  `documentacao/engenharia-do-sistema.md` §4.0 (tabela + nota "EM
  RECONSTRUÇÃO"), `CLAUDE.md` linha "Fluxo Borda DC".
- Contrato de utils/rpc: `documentacao/engenharia-do-sistema.md` §5.1,
  `_comum/utils.js`.
