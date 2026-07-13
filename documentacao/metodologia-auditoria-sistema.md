# Metodologia de Auditoria do Sistema — Zabbix + Grafana (BPC Observe)

> **Para que serve:** checklist a correr quando se pede uma "auditoria profunda do
> sistema" ou um "relatório de estado do projecto". Complementa a
> `metodologia-auditoria-topologia.md` (que é por segmento/domínio, antes de
> desenhar dashboards) — esta é transversal, à instância inteira.
>
> **Origem:** auditoria de 2026-07-13 (relatório em
> `bpc-workspace/pds/relatorio-estado-projecto-20260713.md`, limpeza registada
> em `cronograma.md` Z.53). Os passos desta metodologia são exactamente os que
> apanharam resíduos que auditorias anteriores tinham deixado passar — ver §9
> para a explicação de porquê.
>
> **Regras de ouro (herdadas do CLAUDE.md, valem sempre):**
> - Toda a auditoria é **100% leitura**. Qualquer correcção descoberta entra num
>   plano à parte, aprovado **caso a caso** antes de qualquer escrita.
> - Queries dirigidas com `countOutput` sempre que possível — nunca varreduras
>   `output:extend` à instância inteira (já causou HTTP 500 em produção).
> - Antes de escrever a primeira query, reler as armadilhas de API do CLAUDE.md
>   e da memória do projecto (§8 abaixo tem as que já morderam).

---

## Prompt a dar no futuro

Um único comando chega, desde que aponte a este documento:

> *"Corre a metodologia de auditoria do sistema
> (`documentacao/metodologia-auditoria-sistema.md`), só leitura, e apresenta o
> relatório de achados com um plano de limpeza para eu aprovar caso a caso."*

Variantes mais cirúrgicas (quando só interessa um tema):

- *"Audita só a etapa 3 (consistência classificação × recolha)"* — apanha
  templates esquecidos em hosts reclassificados.
- *"Audita só a etapa 4 (alarmística): problemas mais antigos, fantasmas
  congelados, triggers sobre items mortos"*.
- *"Audita só a etapa 6 (Grafana): pastas, drift de títulos, datasources"*.
- Depois do plano apresentado: *"aplica as acções N e M"* (nomeadas) — nunca
  "aplica tudo" sem ver a lista.

---

## Etapa 1 · Saúde da plataforma (5 min)

| Check | Como | Sinal de alarme |
|---|---|---|
| Versões Zabbix ×2 | `apiinfo.version` (SEM header de auth) | API não responde |
| Grafana vivo | `GET /api/health` | ≠ `database: ok` |
| Plugin Zabbix | `GET /api/plugins/alexanderzobnin-zabbix-app/settings` | 404 = plugin desapareceu (runbook `incidente-plugin-zabbix-grafana-20260710.md`) |
| Datasources (4) | `GET /api/datasources/uid/<uid>/health` para cada | qualquer ≠ OK |

## Etapa 2 · Inventário e cobertura

- `host.get countOutput` por `status` 0/1 — nas 2 instâncias.
- Contagem por grupos-chave (Infra: 355/602/603/605/608/609/663/664; Network: 24/26/27).
- **Frescura de agentes**: `item.get key_=agent.ping` → % com `lastclock` < 2h.
  A verdade sobre o agente é o `lastclock`, nunca a interface dita "available".
- Templates BPC × nº de hosts (`template.get search name:"BPC" selectHosts:count`)
  — comparar com a última auditoria: um template a crescer/encolher sem registo
  no cronograma é achado.
- Web scenarios: `httptest.get countOutput monitored:true` + estado actual dos
  `web.test.fail` dos `app-*` (**`webitems: true` obrigatório**).

## Etapa 3 · Consistência classificação × recolha ⭐

*A etapa que apanha "resíduos honestos" — verificar que aquilo que o Zabbix
tenta recolher ainda faz sentido para o que o host É hoje.*

Para cada template aplicado a N hosts, perguntar: **"o host tem o perfil que o
template assume?"** Concretamente:

1. `template.get` → hosts de cada template BPC.
2. Cruzar com as tags do host (`camada`, `ambiente`, `servico`) **e** com o erro
   real do item principal (`item.get` com campo `error`).
3. Classificar cada host: *coerente* (recolhe, ou falha por razão esperada, ex.
   credencial) vs *incoerente* (template de BD num host `camada=integração`,
   template MSSQL num host Oracle, etc.).

> Porque existe esta etapa: quando se **reclassifica** um host (tag) ninguém se
> lembra de remover o template antigo — a contradição só nasce no momento da
> reclassificação, por isso tem de ser re-verificada em cada auditoria, mesmo
> que a anterior estivesse limpa (caso real: 11 hosts reclassificados a 12/07,
> template MSSQL esquecido, apanhado a 13/07).

## Etapa 4 · Alarmística: problemas, fantasmas e órfãos ⭐

1. `problem.get` por severidade (suprimidos à parte), nas 2 instâncias.
2. **Ordenar por `clock` ascendente** — para *cada* problema com >30 dias,
   validar o item por trás antes de o aceitar como "condição real":
   - item com `status=0` e `lastclock` fresco → **condição real** (ex. swap
     esgotado há 1 ano — accionável, não é resíduo);
   - item com `status=1` (desactivado) ou `lastclock` congelado → **fantasma**
     (o problema nunca mais pode resolver-se sozinho; candidato a fecho).
3. **Triggers activas sobre items desactivados** — a query que apanha os
   fantasmas em massa:
   `item.get filter status:1 + selectTriggers` … **com `webitems: true`**, senão
   os items de web scenario vêm VAZIOS e a auditoria conclui — falsamente — que
   está tudo limpo (foi exactamente isto que escondeu 13 triggers legadas).
   Separar: triggers legadas em hosts/VMs (resíduo) vs triggers L3/L4 do
   template v2 sobre steps desligados (**deliberadas, não tocar**).
4. **Triggers órfãs**: `trigger.get expandExpression:true` nos problemas
   suspeitos — expressão a resolver para `*ERROR*` = item/host apagado por trás
   (precedente Z.37: 66 órfãs presas 73 dias).
5. **Items unsupported**: `countOutput filter state:1` + amostrar os erros e
   agrupar por causa (credencial / template errado / device inacessível). O
   número absoluto interessa menos do que a variação desde a última auditoria.
6. Atenção aos **nomes de problemas**: são snapshots congelados do nome da
   trigger no momento em que dispararam — procurar problemas pelo nome ACTUAL
   da trigger falha ("Web Scenario Desev. Interno4" era a trigger hoje chamada
   "Aplicação Web CONTIF"). Ir sempre pelo `objectid`.

## Etapa 5 · Notificações

- `mediatype.get` (status de Email/Email BPC/GLPi) + `action.get` (status,
  eventsource) — directo à API (o proxy do Grafana bloqueia `action.get`).
- `alert.get countOutput` últimos 7d, partido por `status` 0/1/2 — a razão
  entregues/falhados é a prova do estado da cadeia.
- Nunca propor ligar mediatype/action sem o checklist anti-flood do CLAUDE.md.

## Etapa 6 · Grafana: organização e drift

- `GET /api/folders` — comparar com o mapa de pastas do CLAUDE.md (pastas a
  mais/vazias/a menos).
- `GET /api/search?type=dash-db` — dashboards por pasta; **General (raiz) tem de
  estar vazio** (o bug conhecido do `push_panel.py` deixa dashboards novos na
  raiz); títulos fora da convenção `Nx · Domínio — Propósito`.
- **Drift título/pasta vs repositório**: amostrar `manifest.json` locais e
  comparar `dashboardTitle`/`folderUid` com o live (caso real: manifest do N6
  já tinha o título certo, o Grafana não).

## Etapa 7 · Relatório e plano de limpeza

1. Escrever o relatório com: sumário executivo → saúde → cobertura →
   alarmística/notificações → **achados accionáveis numerados** → pendências
   por dono (cliente vs equipa) → trabalho restante.
2. Cada achado classificado como: **resíduo** (limpar), **condição real**
   (escalar a quem tem contexto), ou **deliberado** (documentar porquê e não
   tocar).
3. Plano de limpeza com âmbito EXACTO (hostids/triggerids/uids nomeados),
   impacto, e verificação prevista — aprovado caso a caso.
4. Ao aplicar: backup antes (`bpc-workspace/backup-*.json`), verificar depois
   (contagem esperada), documentar no `cronograma.md` (entrada Z.nn) e
   actualizar o relatório.

---

## §8 · Armadilhas de API que já falsificaram auditorias

| Armadilha | Efeito na auditoria | Antídoto |
|---|---|---|
| `item.get` sem `webitems:true` | items de web scenario invisíveis → "0 resíduos" falso | sempre `webitems:true` quando web está no âmbito |
| Nome do problema = snapshot antigo da trigger | grep por nome actual não encontra nada | procurar por `objectid`, não por nome |
| Desactivar trigger/host NÃO fecha problemas abertos | "limpei" mas os problemas ficam presos para sempre | fecho real = `manual_close=1` (se `templateid=0`) + `event.acknowledge action=1`; verificar 0 no fim |
| Filtro `hostids`+`templateids` no `item.get` | contagens erradas (não fiável, confirmado 07-07) | verificar por contagem total + inspecção de chaves |
| Cascata de deletes (rules→items) | falsos erros "No permissions to referred object" | ordem rules→items, re-consultar entre passos |
| Hosts desactivados | não geram polling — template neles NÃO é ruído | não os contar como resíduo activo |
| Proxy `zabbix-api` do Grafana | `action.get`/`httptest.get` bloqueados + cache 30 min | auditoria vai sempre directa à API com o token |
| `problem.get` devolve suprimidos misturado | manutenções contam como problema | separar `suppressed:false`/`true` |

## §9 · Porque é que auditorias anteriores não apanharam estes resíduos

Registo honesto, para calibrar expectativas de futuras passagens:

1. **Parte dos resíduos nem existia** — os 11 hosts com template MSSQL órfão
   nasceram na reclassificação de 12/07; uma auditoria anterior a essa data
   estava genuinamente limpa. Consequência: a etapa 3 corre-se SEMPRE, mesmo
   que "já se tenha visto isso".
2. **A query "óbvia" devolve vazio** — sem `webitems:true`, a busca por
   triggers sobre items web desactivados devolve 0 e parece conclusiva. Só quem
   conhece a armadilha (documentada no CLAUDE.md desde a Fase 3.11) desconfia
   do zero. Consequência: as armadilhas do §8 leem-se ANTES de escrever queries.
3. **Fantasmas disfarçados de incidentes reais** — o "desastre de 96 dias" da
   Sala de Reuniões foi registado como achado real numa auditoria anterior
   (7.0.6, e estava certo à data); só a validação item-a-item da etapa 4.2
   revelou que entretanto congelara. Consequência: idade de problema > 30d
   exige sempre verificar o item por trás.
4. **O âmbito da pergunta define o que se encontra** — "valida a monitoria"
   leva a contar hosts e cobertura; "procura resíduos" leva a cruzar
   classificação × recolha. A qualidade da auditoria depende menos do modelo e
   mais da checklist ser explícita — que é a razão de este documento existir.
