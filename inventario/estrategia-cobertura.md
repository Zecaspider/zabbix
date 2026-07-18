# Estratégia de cobertura — SUPERSEDED

> Este rascunho (2026-07-17) introduziu uma nomenclatura "L1-L4" que colidia
> com os web scenarios (L1-L4) e com os dashboards (N1-N5). Foi **reconciliado**
> e substituído por:
>
> **`../documentacao/reconciliacao-cobertura-e-inventario-20260717.md`**
>
> Ler esse. Resumo do que mudou:
> - "L1-L4" → eixo **fonte de dados** (infra/SO/funcional), separado da
>   **superfície** (dashboards N1-N5 + notificações). São 3 fontes, não 4 camadas.
> - O "piloto DNS" que aqui propus **já existia** (`BPC DNS Check`, 2026-07-16) e
>   estava bloqueado — bug identificado (`net.dns` posto como Simple check em vez
>   de item de Zabbix agent).
> - Os web scenarios L1-L4 são a **profundidade interna** da fonte funcional para
>   HTTP, não uma camada à parte.
