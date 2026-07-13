# arquivo-n3 — scaffolding de dev arquivado (2026-07-09)

Ficheiros movidos para aqui na auditoria de dashboards de VMs. **Nenhum é
implantado.** Mantidos só como histórico (git preserva-os de qualquer forma).

| Ficheiro | Porque foi arquivado |
|---|---|
| `manifest-versao-a.json` | Duplicado leaner do `../manifest.json` (mesmo UID `0ae673a3`). O `../manifest.json` é o canónico (tem `folderUid`, `anchor`, título correcto). |
| `manifest-n3-original.json` | Versão N3 anterior (UID `7b09c683`), superseded pela Versão A. UID já não usado. |
| `versao-a-layout.json` | Snapshot de alturas usado uma única vez pelo `fix_versao_a_layout.py`. |
| `fix_versao_a_layout.py` | Script one-off de ajuste de layout da Versão A. Trabalho já aplicado. |

## Duas versões N3 em produção (mantidas em `../`)

- **Versão A — all-BT** · UID `0ae673a3-44c8-41e0-98f5-f5c53473ad54` · `../manifest.json` + `../dashboard-completo.json`
- **Versão B — nativo** · UID `0812353b-3da2-4b65-a884-862633c7d70a` · `../manifest-versao-b.json` + `../versao-b-corrected.json` (build: `../build_versao_b.py`)

> Nota: `../build_versao_b.py` tem um path de saída stale (`servidores-virtuais/n3/…`,
> anterior à renomeação para `03-servidores-virtuais/`) — corrigir antes de o reexecutar.
