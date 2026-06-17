# Revisão de Conformidade — Dashboards vs Contratos

> **Objectivo:** Validar que cada dashboard construído respeita os contratos
> definidos na documentação de engenharia antes de promover a produção NOC.
> Cronograma: ponto 1.20.

---

## Contratos a verificar por dashboard

Para cada dashboard, validar os itens abaixo contra:
- `documentacao/engenharia-do-sistema.md` — arquitectura, §4 (estrutura), §5 (utils), §6 (cores/thresholds), §10.1 (DoD)
- `documentacao/blueprint-observabilidade.md` — drill-down N1→N2→N3, o que cada nível deve mostrar
- `documentacao/framework-de-criacao-de-cards.md` — contrato de dados do card
- `documentacao/mapa-host-groups.md` — groupIds correctos por domínio
- `CLAUDE.md` — constraints imutáveis (tipo de painel, push flow, transparent, scroll)

---

## Checklist por dashboard

### Para cada dashboard (N2 e N3)

- [ ] `"type": "marcusolsson-dynamictext-panel"` em todos os painéis BT (não `businesstext`)
- [ ] `renderMode: "allRows"`, `editors: ["afterRender"]`, `transformations: [{id:"reduce"}]`
- [ ] Âncora Zabbix aponta para host real e permanentemente disponível (não VMware como âncora)
- [ ] `transparent: true` em **todos** os painéis
- [ ] `title: ""` em todos os painéis de conteúdo (role ≠ utils)
- [ ] Sem scroll interno — `gridPos.h` dimensionado para caber no viewport
- [ ] Painel utils usa gabarito canónico de `_comum/utils.js` (nocLabel ajustado, sem divergências)
- [ ] Painéis de conteúdo usam gabarito `initWithRetry` (nunca `waitForBPC` directo)
- [ ] Nenhum painel de conteúdo redefine `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils` localmente
- [ ] `manifest.json` tem `"content": "<div id=\"...\"></div>"` com elementId exacto do CFG
- [ ] CFG aninhado no topo do ficheiro, sem valores hardcoded espalhados no código
- [ ] Labels, cores e thresholds do catálogo §6.2 (não inventados)
- [ ] Navegação: link de volta ao nível superior presente e funcional
- [ ] Drill-down para o nível seguinte presente (quando aplicável)

---

## Estado por dashboard

| Dashboard | UID | Nível | Revisão | Notas |
|---|---|---|---|---|
| N3 ESXi | `8f6a94be` | N3 | ☐ | Construído em sessão anterior; nocLabel desactualizado (era "Servidores Físicos") |
| N3 ESXi-Detalhe | `b55d5481` | N3 | ☐ | |
| N2 Armazenamento | `993834a3` | N2 | ☐ | Adapter Z.9/Z.10 pronto mas não testado com dados reais |
| N2 Infraestrutura VMware | `a967e936` | N2 | ☐ | cards vCenter com cluster table; âncora a confirmar |
| N3 vCenter Detalhe | `59e7e4b2` | N3 | ☐ | 4 painéis separados; dropdown pendente (1.19) |
| N2 Servidores Virtuais | `0758c24e` | N2 | ☐ | CPU/RAM fix 3.2 aguarda confirmação visual |

---

## TODO — Dropdown selector de vCenter (1.19)

O dashboard N3 vCenter lê `?var-vcenter_hostid=<id>` do URL para saber qual vCenter
mostrar. Actualmente só é acessível via drill-down do N2. Para uso autónomo (ex.:
bookmarks de NOC, abertura directa), é necessário um mecanismo de selecção.

**Opções:**

**A — Variável nativa Grafana** (`$var-vcenter_hostid`)
- Adicionar via Settings → Variables no dashboard N3
- Tipo: `Query`, datasource BPC-INFRA, query: `host.get` no grupo 608
- Vantagem: standard Grafana, funciona no URL e no dropdown nativo
- Desvantagem: exige configuração no Grafana (não é ficheiro local)

**B — Painel de selecção BT** (antes do topo)
- Painel extra que faz `host.get` grupo 608, lista os vCenters como botões/links
- Ao clicar num vCenter, navega para `?var-vcenter_hostid=<id>`
- Vantagem: sem configuração Grafana, segue o mesmo padrão BT
- Desvantagem: recarrega a página ao navegar

**Recomendação:** Opção B — um painel "picker" de vCenter acima do topo,
mostrando os vCenters como pills clicáveis. Quando `var-vcenter_hostid` já está
no URL, o picker destaca o vCenter activo. Custo: 1 painel extra simples.

---

## Gaps de dados em aberto

Ver `documentacao/gaps-de-dados.md` — G.1 a G.5. Os gaps afectam a fidelidade
dos dashboards e devem ser resolvidos antes de promover a produção NOC.

---

*Documento criado em 2026-06-17. Actualizar à medida que cada dashboard for revisto.*
