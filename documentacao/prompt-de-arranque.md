# Prompt de Arranque — Nova Sessão

> Copiar o bloco abaixo para o início de cada sessão nova (substituir `[DATA]`).
> Mantém o contexto leve: a IA lê o cronograma e os contratos em vez de herdar
> uma conversa longa.
>
> **Modelo recomendado:** Sonnet 4.6 para construir (execução dos contratos já
> escritos); escalar para Opus 4.8 só em decisões de arquitectura genuínas.
> Regra prática: *Sonnet para construir, Opus para decidir.*

---

```
Estás a continuar a construção do Sistema de Observabilidade BPC NOC (Grafana 12 + Zabbix 7.4).

Directório de trabalho (auto-suficiente — não dependas de nada fora dele):
C:\Repositorios\zabbix\sistema-de-observabilidade

ARRANQUE — lê por esta ordem, antes de qualquer acção:
1. CLAUDE.md          → fluxo de trabalho e regras deste directório (autoridade única)
2. cronograma.md      → estado de cada ponto; identifica o próximo ponto ☐ a fazer
3. Só então, conforme o ponto exigir, lê o que for necessário:
   - documentacao/engenharia-do-sistema.md   (arquitectura, contratos §5.1/5.2/6/7, DoD §10.1, sondagem §10.2)
   - documentacao/blueprint-observabilidade.md (mapa drill-down N1→N2→N3)
   - documentacao/mapa-host-groups.md         (domínio → groupId / datasource; 2 Zabbix)
   - documentacao/framework-de-criacao-de-cards.md (contrato de dados do card)
   - o card de referência aprovado: servidores-virtuais/n2/

FLUXO (CLAUDE.md): editar .js local → node --check → push para Grafana → testar no
browser (esperar 15-20s) → se passar, commit; senão corrigir e repetir. Construção
incremental, painel a painel. 1 subpasta = 1 dashboard = 1 manifest.json.

CREDENCIAIS (nunca colar em chat/commit): tokens da API Zabbix directa (infra/
network) e token Grafana SA estão em C:\Repositorios\zabbix\tok3n. Ler do ficheiro.
Datasources: infra 3_KgG43nz, network ffo8sp8zllog0e.

DISCIPLINA OBRIGATÓRIA a cada passo:
- Sempre que tomarmos uma decisão nova (arquitectura, naming, convenção), regista-a
  no documento apropriado e, se mudar uma regra de trabalho, actualiza o CLAUDE.md.
- Sempre que concluíres um ponto, marca-o ☑ no cronograma.md (com data e nota) e,
  se cumpriu o DoD, avança para o próximo. Mantém o cronograma como única fonte de
  verdade do progresso.
- Escrita no Grafana partilhado e commits: pedir confirmação.

PRÓXIMO PONTO: começa pelo primeiro ☐ do cronograma (neste momento o 0.9 —
auditar servidores-virtuais/n2/l2-header-global.js contra o contrato do painel
utils, §5.1 da engenharia). Confirma o estado real lendo o cronograma antes de começar.

Hoje é [DATA]. Começa por ler o CLAUDE.md e o cronograma e diz-me qual é o próximo ponto antes de agir.
```
