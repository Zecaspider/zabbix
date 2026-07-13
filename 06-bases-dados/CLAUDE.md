# CLAUDE.md — Bases de Dados

> Regras e desenho específicos deste domínio. Ver `CLAUDE.md` raiz para as
> constraints imutáveis (pastas Grafana, naming, workflow de push) — este
> ficheiro só documenta o que é próprio de Bases de Dados.

---

## 1. Contexto: porque este domínio é diferente

Ao contrário de VMs/APIs (onde o agente Zabbix já dá tudo), Bases de Dados
depende de um passo extra que a maioria dos hosts ainda não tem: uma
**credencial SQL** (`zbx_monitor`) criada pela equipa de infra dentro de
cada instância. Sem ela, o template `BPC MSSQL by ODBC` (78 items, liga do
servidor Zabbix pela rede) fica sem dados.

Investigação de 2026-07-12 (ver `cronograma.md` Fase 6, 6.1.1–6.1.9)
confirmou, host a host, que **isto não é sinónimo de "sem monitorização
nenhuma"**: mesmo sem a credencial, o agente Windows já instalado em cada
VM dá sinais reais de saúde via 3 canais adicionais, sem tocar no motor SQL:

1. **Perfmon (contadores de desempenho do Windows)** — o SQL Server
   regista os seus próprios contadores no sistema operativo no momento da
   instalação (`\MSSQL$<instância>:...`). PLE, cache hit ratio, ligações,
   batch requests/seg, deadlocks/seg e memória total ficam acessíveis via
   `perf_counter_en[...]`, sem autenticação SQL nenhuma.
2. **WMI (`Win32_PerfFormattedData_MSSQL<inst>_MSSQL<inst>Databases`)** —
   o mesmo mecanismo, mas por base de dados individual: nome, tamanho de
   dados, tamanho de log, % de log usado. Dá para enumerar e medir cada
   base sem SQL.
3. **`service.info[<nome>,state]`** — estado real (a correr/parado) de um
   serviço Windows específico (ex. `MSSQL$GERAL`, `OracleServiceSICO`).

Isto é o que torna Bases de Dados um domínio de **"4 fontes de dados"**, em
vez do habitual "tem dados ou não tem".

## 2. Modelo de fonte de dados (tier) — conceito central

Para cada host, verificar por esta ordem (a mesma lógica em N2 e N3):

| Tier | Condição | O que mostra |
|---|---|---|
| **`odbc`** (●) | Item `db.odbc.select[mssql.business.master,...]` existe, sem erro, JSON válido | Conjunto completo: PLE, ligações, bloqueados, deadlocks, jobs falhados, backups 24h, bases suspeitas |
| **`perfmon`** (◐) | ODBC falha/não existe, mas há items `perf_counter_en[...]` com nome `"MSSQL ..."` | PLE, cache hit ratio, ligações, batch req/seg, deadlocks/seg, memória total + estado do serviço da instância + tabela de bases (se a discovery WMI existir no host) |
| **`servico`** (◑) | Só `service.info`/`proc.num` (nenhum perfmon "MSSQL ...") | Só o(s) pill(s) de estado running/parado |
| **`sem_sinal`** (○) | Nada disto existe | Estado explícito "sem sinal", sugestão de próximo passo |

**Isto é o mecanismo de "preparado para o futuro"**: o código verifica
sempre `odbc` primeiro. No dia em que a credencial `zbx_monitor` for criada
num host, o item ODBC passa a ter dados válidos e esse host sobe
automaticamente ao tier `odbc` — **zero alterações de código** em N2 ou N3.

### Detecção por host (chaves reais usadas)

```
ODBC:     search key_ = "db.odbc.select[mssql.business.master"
Perfmon:  search name  = "MSSQL "   (substring — nunca colide com os
                                      items "MSSQL: ..." do template ODBC,
                                      que usam dois-pontos, não espaço)
Serviço:  search key_  = "service.info["   OU   "proc.num["
```

**Nunca pesquisar por `key_` com `$`/aspas/barras sem testar primeiro** —
a chave real do perfmon tem caracteres especiais (`\MSSQL$GERAL:...`) que
precisam de escaping exacto; pesquisar por `name` evita o problema por
completo e já está confirmado a funcionar.

## 3. Achados operacionais reutilizáveis (não repetir a investigação)

- **23 hosts** `camada=base de dados` + `ambiente=Produção` (2026-07-12,
  depois de corrigir 16 hosts mal classificados — ver `cronograma.md`
  6.1.6). Lista completa e motor confirmado por host: `classificacao_final_bd.csv`
  (entregue ao utilizador na sessão, não vive no repo).
- **17 hosts MSSQL confirmados** (porta 1433 aberta + handshake de login
  real, `Login failed for user 'zbx_monitor'`) — só falta a credencial.
- **3 hosts MSSQL em instância nomeada** (porta dinâmica via SQL Browser,
  por isso o template ODBC falha estruturalmente): `VS8000435`=`GERAL`,
  `VS8000601`=`ICARD_PRO` (nome WMI sem underscore: `ICARDPRO`),
  `VS8000790`=`FENIXPENSOES`.
- **1 host Oracle** (`VS8000759`, Finantech/SAFIRA) — motor instalado mas
  **serviço parado** (`OracleServiceSICO`/`SIMO`). Achado operacional, não
  só gap de monitorização — confirmar com o dono do sistema.
- **2 hosts por confirmar** (`SV9000401`, `VS9000404`) — WinRM inacessível,
  piloto `proc.num[sqlservr.exe|sqlbrowser.exe|oracle.exe]` activo à espera
  de dados.
- **`PRISIGEP`** (base dentro de `VS8000790`) a **99% de log usado** —
  achado da descoberta WMI, risco real de disco cheio, não visível em
  nenhum outro sítio antes de hoje.

## 4. Templates e items Zabbix criados nesta ronda

| Template | Hosts ligados | Conteúdo |
|---|---|---|
| `BPC DB Engine Process Check` (14719) | `SV9000401`, `VS9000404` | 3 items `proc.num[]` genéricos (sqlservr/sqlbrowser/oracle) — piloto sem saber motor de antemão |
| `BPC MSSQL Perfmon sem Credencial` (14720) | `VS8000435`, `VS8000601`, `VS8000790` | 6 contadores perfmon + `service.info` da instância (macro `{$MSSQL.INSTANCE.NAME}`) + discovery WMI de bases de dados (macro extra `{$MSSQL.INSTANCE.WMICLASS}`, exclui master/model/msdb/tempdb/mssqlsystemresource) |
| Items directos em `VS8000759` | — | 2× `service.info[OracleService{SICO,SIMO}, state]` |

**Lição a não repetir**: `service_state[...]` **não existe** como chave do
agente — a certa é `service.info[<nome>,state]`. WMI: o nome da instância
perde o underscore na classe (`ICARD_PRO`→`ICARDPRO`), mas mantém-se no
caminho do contador perfmon (`MSSQL$ICARD_PRO:...`) — precisa das duas
macros separadas. `wmi.getall` como chave de discovery **não mapeia
colunas automaticamente** para `{#MACRO}` — exige `lld_macro_paths`
explícito (`{#NAME}` → `$.Name`).

## 5. Desenho dos dashboards (mockup aprovado 2026-07-12, antes da implementação)

### N2 · Bases de Dados

```
┌─ COBERTURA DE MONITORIZAÇÃO ─┐   5 mini-cards: total + 1 por tier (●◐◑○)
┌─ ATENÇÃO IMEDIATA ───────────┐   achados operacionais concretos, sempre
│  ex.: motor parado, base       │   no topo — não escondidos numa coluna
│  quase cheia, contagem de      │   de observação
│  credenciais em falta          │
┌─ SAÚDE AGREGADA ─────────────┐   só soma hosts tier odbc+perfmon,
│  (explicita quantos de quantos)│  diz claramente que não é 23/23
┌─ HOSTS (tabela) ─────────────┐   ordenada por severidade (crít. primeiro),
│  Estado│Host│Sistema│Motor│    │  não alfabética; coluna Motor separada
│  Fonte│Detalhe│→N3            │  da coluna Fonte; link Ver Detalhe por linha
```

### N3 · Instância (por host, `var-hostid`)

```
1. HEADER          nome, tags (sistema/dept/ambiente), badge de Fonte
2. SAÚDE            tiered — muda de conteúdo consoante o tier do host
                     (ver tabela §2); é a secção que "sobe" sozinha para
                     o conjunto completo assim que a credencial existir
3. BASES DE DADOS   só aparece se houver discovery WMI (hoje: os 3 hosts
                     de instância nomeada) — tabela por base, ordenada por
                     % log usado, para apanhar casos tipo PRISIGEP cedo
4. PROBLEMAS        painel nativo Zabbix (alexanderzobnin-zabbix-triggers-panel)
5. FICHA            identidade (SO/IP/cluster/host físico) — única secção
                     que aparece sempre, independente do tier
```

**Arquitectura de implementação**: N2 mantém-se BPC Runtime (`waitForBPC`,
já faz `host.get` sem problema aqui). N3 usa **Standalone** (boilerplate em
`_l3-base.js`, copiado de `03-servidores-virtuais/_l3-base.js`) — motivo:
tem de reagir à variável `var-hostid` sem estado residual do host anterior,
a mesma razão que já motivou essa escolha em Servidores Virtuais
(`03-servidores-virtuais/CLAUDE.md` §3.1).

**Variável `hostid` do N3**: query MySQL contra `MYSQL - INFRA ZABBIX`
(`afor1g5862fb4c`), não variável nativa Zabbix — este domínio não tem grupo
Zabbix dedicado (a tag `camada=base de dados` é o filtro real, o grupo 355
histórico só cobre um subconjunto). Schema confirmado (`hosts`+`host_tag`,
mesmo padrão do `07-apis/n2/n2-api-tabela-internos.json`):
```sql
SELECT h.name AS __text, h.name AS __value
FROM hosts h INNER JOIN host_tag ht ON h.hostid = ht.hostid
WHERE ht.tag = 'camada' AND ht.value = 'base de dados' AND h.status = 0
ORDER BY h.name
```

## 5-bis. IMPLEMENTADO (2026-07-13) — N2 v4 + N3 novo, testados ao vivo

O desenho do §5 foi implementado e validado no Grafana (detalhe completo e
pesquisa de KPIs em `DESIGN-N2-N3-20260712.md`):

- **N2 (`bd-n2`)**: `l2-resumo-bases-dados.js` v2 (novo bloco CONTEXTO
  OPERACIONAL: hosts/instâncias/bases/tamanho/motores) + `l2-tabela-hosts.js`
  v4 (colunas Motor/Bases/Tamanho, só Produção). Layout fechado sem scroll
  interno (h: 3/16/39, overflow medido = 0).
- **N3 (`bd-n3`)**: dashboard novo, híbrido — 3 painéis BT standalone
  (`n3/l3-instancia.js`, `n3/l3-bases.js`, `n3/l3-ficha.js`) + 3 timeseries
  nativos (CPU/RAM/disco por volume) + painel nativo de problemas. Variável
  `hostid` via MySQL (`__text`=host técnico, `__value`=nome visível — os
  nativos filtram pelo nome visível, os BT extraem o código curto).
  Testado com os 3 tiers reais: `VS8000413` (ODBC completo, 27 bases),
  `VS8000601` (perfmon+WMI, DWDiagnostics 81% log), `VS8000759` (Oracle
  PARADO ×2 em vermelho).
- **`VS8000413` subiu sozinho ao tier `odbc`** — a credencial `zbx_monitor`
  foi criada pela infra e o mecanismo de tier funcionou sem tocar em código
  (era exactamente o objectivo do desenho §2). Achado novo que ele revelou:
  70+ jobs SQL Agent falhados/dia e 0 backups nas últimas 24h.

### Lições novas (2026-07-13) — não repetir

1. **`proc.num[]` sem argumentos (template Windows) conta TODOS os
   processos** — nunca usar `proc.num > 0` como sinal de motor sem filtrar o
   key por processo de BD (`sqlservr|oracle|sqlbrowser|mysqld|postgres`).
   Sem o filtro, 12 hosts viraram tier "serviço" falso (apanhado no teste ao
   vivo; helper `isDbProcItem` nos 3 ficheiros).
2. **Serviço primário vs auxiliar**: `SQLBrowser`/`OLAP`/`FDLauncher`/
   `Launchpad`/`RMAN` parados NÃO são "motor parado" (RMAN é backup!).
   Primários: `MSSQLSERVER`, `MSSQL$<inst>`, `OracleService<SID>` excepto
   `*RMAN*`. Sem esta distinção, `VS9000404` (Oracle ok, RMAN parado) seria
   falso crítico — era o bug do v3 da tabela.
3. **Filtro de ambiente tem de ser case-insensitive por prefixo**
   (`produ...`) — a tag tem "Produção"/"Producao"/"Produção" misturados;
   match exacto perde hosts (25 activos hoje, não 23).
4. O service discovery do template Windows **já cria**
   `service.info["MSSQLSERVER",state]` em 8 hosts de produção — dá coluna
   Motor + estado up/down sem nenhum template custom.

## 6. Pendente
- Tag `motor` (mssql/oracle/nenhum) ainda não criada no Zabbix
- Credencial `zbx_monitor` nos 17 hosts confirmados MSSQL
- `VS8000759`: confirmar com o dono do sistema Finantech se o Oracle
  parado é intencional
- `SV9000401`/`VS9000404`: confirmar motor por outra via (WinRM inacessível)
- Estender a discovery WMI de bases de dados aos 17 hosts ODBC assim que
  tiverem credencial (hoje só cobre os 3 de instância nomeada)
- Thresholds locais (PLE, connections, etc.) continuam não ratificados no
  catálogo `engenharia-do-sistema.md` §6.2 — herdado do N2 anterior, não
  resolvido nesta ronda
