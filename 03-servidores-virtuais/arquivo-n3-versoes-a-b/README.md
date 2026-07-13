# arquivo-n3-versoes-a-b — Versões A e B do N3, arquivadas (2026-07-13)

> Pasta `n3/` (ex-produção) renomeada e movida no Grafana para `99·Arquivo`
> (`dfpm0sey9ut4wb`) depois de a ficha híbrida (`n3-hibrido/`, UID
> `vm-n3-ficha`) ter estabilizado e ser promovida a **único N3 canónico** de
> Servidores Virtuais. Decisão do utilizador — ver `../CLAUDE.md` §13.8 e
> `../../CLAUDE.md` (constraint `Pastas Grafana por domínio`).

## Duas versões arquivadas

- **Versão A — all-BT** · UID `0ae673a3-44c8-41e0-98f5-f5c53473ad54` ·
  `manifest.json` + `dashboard-completo.json`
- **Versão B — nativo** · UID `0812353b-3da2-4b65-a884-862633c7d70a` ·
  `manifest-versao-b.json` + `versao-b-corrected.json` (build:
  `build_versao_b.py`, path de saída stale — não reexecutar sem corrigir)

Ambas continuam a existir no Grafana (não foram apagadas, só movidas de
pasta) — servem de referência histórica. Os dois `manifest*.json` têm
`folderUid` actualizado para `dfpm0sey9ut4wb` para que um push acidental
não as devolva a `03·Servidores Virtuais`.

**Nada aqui é implantado como canónico.** Qualquer novo desenvolvimento de
N3 de VMs vive em `../n3-hibrido/`.

## Links externos que ainda apontam para a Versão A (não corrigidos nesta arquivagem)

- `07-apis/n3/n3-app-vms-tabela.json` (drill "Detalhe da VM")
- `07-apis/n4-sistema/l4-sys-vms.js` (`CFG_S4VMS.svN3Url`)

O link continua a funcionar (dashboard só mudou de pasta), mas leva a um
dashboard arquivado em vez do híbrido. Corrigir para apontar a
`vm-n3-ficha` fica pendente — ver `../CLAUDE.md` §13.8.

## Sub-pasta `arquivo-n3/` (já existia antes desta arquivagem)

Scaffolding de dev arquivado em 2026-07-09 (ver `arquivo-n3/README.md`) —
duplicados/snapshots one-off, nenhum implantado.
