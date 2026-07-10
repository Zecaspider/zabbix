# arquivo-n2 (2026-07-09)

## `l2-correlacionador-de-eventos.js` — painel órfão arquivado

Correlacionador de eventos do N2 VMs. Estava **fora de qualquer `manifest.json`**
e não existia no dashboard N2 ao vivo (confirmado por API: N2 só tem 4 painéis —
header, KPI strip, tabela, triggers). Ficheiro mantido correcto (thresholds §7,
ES5) mas nunca implantado.

**Resolução (auditoria 2026-07-09):** arquivado. A vista de triggers do grupo 609
no N2 já é servida pelo `l2-triggers.js` (implantado). O correlacionador é uma vista
mais pesada de correlação de eventos.

> **Reversível:** se se quiser a correlação de eventos no N2, reviver este ficheiro
> (adicionar entrada no `../manifest.json`, atribuir `content`/`elementId`, push) em
> vez de arquivar. Decisão deixada em aberto para o utilizador.
