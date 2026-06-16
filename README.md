# Sistema de Observabilidade BPC NOC

> Novo directorio de trabalho (substitui `dashs/novos_dashboards/v5`, que estava
> poluido com duplicados, rascunhos e versoes paralelas). Estrutura limpa,
> 1 pasta por dashboard N2 (cada uma cobre tambem o seu N3).

## Estrutura

```
sistema-de-observabilidade/
├── CLAUDE.md                  # fluxo de trabalho (local-first, incremental, manifest)
├── documentacao/
│   ├── engenharia-do-sistema.md       # documento mestre: arquitectura, fluxo, checklist/roadmap
│   ├── blueprint-observabilidade.md   # mapa de drill-down N1->N2->N3, naming, personas
│   └── mapa-host-groups.md            # dominio -> groupId Zabbix (inventario real)
├── visao-geral/                # o N1 (depende de todos os N2)
│   └── n1/                      # (vazio, por construir)
├── servidores-virtuais/        # REFERENCIA - unico ja a funcionar no Grafana
│   ├── CLAUDE.md               # regras especificas do dominio (VMs)
│   ├── n2/                     # APROVADO: manifest.json + l2-*.js + dashboard-snapshot.json
│   └── n3/                     # rascunho por validar: manifest.json + l3-*.js
├── servidores-fisicos/         # n2/ + n3/ (vazios) - Fase 1
├── armazenamento/              # n2/ + n3/ (vazios) - Fase 2
├── rede/                       # n2/ + n3/ (vazios) - Fase 3
├── seguranca/                  # n2/ + n3/ (vazios) - Fase 4
├── bases-dados/                # n2/ + n3/ (vazios) - Fase 5
├── apis/                       # n2/ + n3/ (vazios) - Fase 6
├── servicos-negocio/           # n2/ + n3/ (vazios) - Fase 7 (eBankit)
├── agencias/                   # n2/ + n3/ (vazios) - Fase 8
└── arquivo-referencia/
    └── v5-material-bruto/      # copia integral da pasta v5 antiga - so consulta,
                                 # nunca editar. Serve para reaproveitar trechos antes de reescrever.
```

> **1 subpasta = 1 dashboard Grafana = 1 manifest.json.** N2 e N3 são dashboards
> separados (UIDs distintos), por isso `n2/` e `n3/` são subpastas separadas.
> A pasta do domínio tem o nome do domínio (sem prefixo `n2-`); o nível é a
> subpasta. Regra completa e reproduzível em
> `documentacao/engenharia-do-sistema.md` §4.1.

## Regra de ouro

Todo o trabalho novo nasce dentro de `<dominio>/n2/`, `<dominio>/n3/` ou
`visao-geral/n1/`, seguindo o
`CLAUDE.md` desta pasta (fluxo local->Grafana->commit, construcao incremental,
manifest.json por dashboard). `arquivo-referencia/` e so para ir buscar ideias
ou trechos reaproveitaveis do trabalho anterior - nunca se edita ou se copia
um ficheiro de la directamente para um dashboard novo sem o conformar ao
padrao actual (CFG aninhado, `initWithRetry`, `CFG.labels`, etc. - ver
`CLAUDE.md` raiz do projecto em `C:\Repositorios\zabbix\CLAUDE.md`).

Ordem de construcao e estado de cada fase: ver
`documentacao/engenharia-do-sistema.md` secção 12 (roadmap/checklist).

A pasta antiga `dashs/novos_dashboards/v5/` deixa de ser tocada a partir de
agora - fica congelada como historico até confirmarmos que nada se perdeu,
podendo depois ser removida do repo.
