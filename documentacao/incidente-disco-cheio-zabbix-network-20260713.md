# Incidente — disco cheio no Zabbix Network (2026-07-13)

> **Runbook rápido para a próxima vez**: ver "Diagnóstico" e "Correcção" abaixo.
> Padrão do incidente: dashboards BT muito lentos + "refresh absurdo" (na verdade
> o mesmo refresh de 1m sem nunca terminar) + Zabbix Network indisponível.
> Servidor: **VS8000932** (`10.10.233.140`, CentOS Stream, Zabbix 7.0.16 + MySQL 8.0.42).

## Sintomas (durante o PDS de 2026-07-13)

- Dashboards Business Text muito lentos, aparência de "refresh constante"
  (spinner + re-render dos cards em ciclo).
- Dashboards do domínio Rede/Agências (datasource BPC-NETWORK) sem dados.
- Lentidão espalhada também a dashboards de Infra — o plugin Zabbix do
  Grafana serve os dois datasources no mesmo processo backend; chamadas
  penduradas ao Network saturam-no e degradam tudo.

## Causa raiz

`/` (XFS, 220G) a **100%** — bytes e inodes (no XFS os inodes são alocados
dinamicamente, por isso "inodes 100%" é consequência do disco cheio, não um
segundo problema). Distribuição: 209G em `/var/lib/mysql`, dos quais só 85G
eram a base `zabbix` — o resto (~123G) eram **binlogs do MySQL 8** com a
retenção por defeito de 30 dias (`binlog_expire_logs_seconds=2592000`).
Um Zabbix gera ~4-5G/dia de binlog ⇒ 30 dias ≈ 120-130G. O disco encheu
"por design".

Com 0 bytes livres o InnoDB entra em stall de escrita: os serviços
continuam todos `active running` e a API até responde (`apiinfo.version`
OK), mas as queries de dashboard ficam penduradas — **não há alerta de
"serviço down" porque nada caiu**.

Reincidência: já tinha acontecido pelo menos 2x (Fev e Abr 2026) — a
"solução" anterior foi copiar 152G de binlogs para
`/home/mysql_backup_binlogs` em vez de corrigir a retenção. Esses binlogs
soltos (sem backup base da mesma altura) não servem para point-in-time
recovery — são candidatos a apagar (152G recuperáveis no `/home`, decisão
pendente do utilizador).

## Diagnóstico (SSH ao VS8000932)

```bash
df -h / && df -ih /                                   # cheio? bytes E inodes
systemctl list-units --type=service --no-pager | grep -Ei 'zabbix|mysql|maria|http|nginx|php'
du -xh --max-depth=1 /var 2>/dev/null | sort -rh | head
du -xh --max-depth=1 /var/lib/mysql | sort -rh | head # zabbix/ vs binlogs
ls -lhS /var/lib/mysql/zabbix/ | head                 # maiores tabelas
```

Sem SSH, a partir de qualquer máquina: health dos datasources
(`GET /api/datasources/uid/ffo8sp8zllog0e/health`) e frescura do histórico
via `ds/query` MySQL Network (ver query em baixo, "Validação").

## Correcção aplicada (2026-07-13, pelo utilizador via SSH)

O ovo-e-a-galinha: com 0 bytes livres, o próprio `PURGE BINARY LOGS` falha
(`ERROR 29 ... binlog.~rec~ ... errno 28`) e o `SET PERSIST` também
(`ERROR 3549`) — ambos precisam de escrever um ficheiro pequeno. Primeiro
libertar uns MB fora do MySQL, depois purgar:

```bash
rm -rf /var/cache/dnf/*          # ~145M, é só cache de pacotes — seguro
# (journalctl --vacuum-* não serviu: o journal vive em /run, tmpfs)
mysql -u root -p
```
```sql
SHOW REPLICAS;                                   -- Empty set ⇒ purge seguro
PURGE BINARY LOGS BEFORE NOW() - INTERVAL 2 DAY; -- libertou ~106G
SET PERSIST binlog_expire_logs_seconds = 172800; -- retenção 2 dias, sobrevive a reboot
```

**Nunca `rm` aos ficheiros `binlog.*`** — o MySQL mantém um índice
(`binlog.index`); apagar à mão dessincroniza-o. Resultado: `/` de 100% para
**49%** (114G livres). O InnoDB retomou sozinho, sem restart de nada.

## Validação

- Health dos 3 datasources (BPC-NETWORK, BPC-INFRA, MySQL Network): `OK`.
- Frescura real da escrita (via `ds/query` MySQL Network): último valor em
  `history_uint` com **4 segundos** de atraso —

```sql
SELECT FROM_UNIXTIME(MAX(hu.clock)) AS ultimo,
       TIMESTAMPDIFF(SECOND, FROM_UNIXTIME(MAX(hu.clock)), NOW()) AS atraso_seg
FROM history_uint hu
JOIN (SELECT i.itemid FROM items i JOIN hosts h ON h.hostid=i.hostid
      WHERE i.key_ LIKE 'net.if.in%' AND i.status=0 AND h.status=0 LIMIT 20) t
  ON t.itemid=hu.itemid
WHERE hu.clock > UNIX_TIMESTAMP(NOW()) - 86400;
```

  (armadilha: sem o `JOIN hosts ... h.status=0`, o `LIMIT` apanha items de
  **templates** — também vivem em `items` — e o resultado vem `NULL`.)

- Auditoria de refresh dos 113 dashboards (`/api/search` + `refresh` de cada
  um): produção está toda a `1m` ou sem refresh — **não havia refresh
  agressivo mal configurado**; o "refresh absurdo" era o ciclo de 1m a
  re-renderizar painéis BT cujas queries nunca terminavam.

## Pendentes (fase 2 — decisão do utilizador)

1. **Housekeeping do Zabbix Network** — `history_uint.ibd` com 65G; rever
   retenção de history/trends para o crescimento orgânico não repetir isto.
2. **Trigger de disco no próprio VS8000932** — o Zabbix Network não estava a
   alertar sobre o seu próprio disco; um trigger `/ > 80%` teria apanhado
   isto semanas antes.
3. **Apagar `/home/mysql_backup_binlogs`** (152G, Fev–Abr, sem valor de
   recovery).
4. **Rodar as passwords do MySQL** (root e grafana) — estavam "documentadas"
   em comentário no fim de `/etc/zabbix/zabbix_server.conf` e foram expostas
   no chat desta sessão.
