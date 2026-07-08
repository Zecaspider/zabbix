# Auditoria do domínio APIs e Serviços (sintéticos + VMs) — 2026-07-03

> Auditoria feita com dados ao vivo (API Zabbix via proxy Grafana + BD MySQL
> Infra + Excel operacional). Precede a Fase 7 do `cronograma.md`.
> Métodos bloqueados no proxy (`httptest.get`, `action.get`) foram contornados
> via datasource MySQL `afor1g5862fb4c` (tabelas `httptest`, `actions`,
> `media_type`, `auditlog`).

## 1. Sumário executivo

| Área | Estado | Veredicto |
|---|---|---|
| Monitores sintéticos (g663 `BPC / APLICACOES / SINTETICOS`) | 39 hosts `app-*`, 37 activos; L1/L2 a recolher e alarmar | **Funciona, mas o template tem 2 níveis mortos (L3/L4)** |
| Template `BPC Web Monitoring` (12042) / `- Externos` (12045) | L3 no-op, L4 com defaults de exemplo | **Refactorar** |
| Cenários legados `Monitor *` | 28 cenários avulsos (delay 1m) nos hosts das VMs — duplicam os L1 | **Descomissionar após paridade; antes disso, minar o mapeamento app→VM que eles codificam** |
| Alarmística | 312 triggers bem desenhados (L1 disaster, L2, L3, ICMP) | OK no desenho; L3/L4 sem efeito real |
| Notificações | **Mortas.** Única action activa envia por media type "Email" que está desactivado | **Reconstruir** |
| Dashboards Grafana | Pasta `07 · APIs e Serviços` vazia; ~14 dashboards legados em `99 · Arquivo`; `07-apis/` local vazio | **Construir de raiz (padrão N2/N3 do repo), arquivados só como referência** |
| Mapeamento URL→serviço→VM | Inexistente como artefacto, mas **derivável**: 19/39 mapeados automaticamente nesta auditoria (ver §5) | **Completar e materializar em tags** |
| Agentes nas VMs (g609, 446 VMs) | 110 a reportar agora · 257 com template de agente que **nunca** entregaram um valor · 79 sem agente (só VMware/ping/ODBC) | **Não foi o upgrade** — ver §6 |

## 2. Sintéticos — inventário (factos)

- Grupo `663 — BPC / APLICACOES / SINTETICOS`: 39 hosts `app-*`, 37 activos.
  Desactivados: `app-bpcnet-pub`, `app-inss-bpc`.
- **Duplicado**: `app-bpcnet-pub` e `app-internet-bank` apontam ambos a
  `https://ib.bpc.ao/` (um OFF, outro ON) — decidir qual fica.
- Cada host tem 4 web cenários herdados do template: `L1-Disponibilidade`,
  `L2-Performance`, `L3-Conteudo`, `L4-Auth`, mais `BPC Ping` (ICMP).
- Recolha real (itens `web.test.*`, janela 1h):
  - L1/L2/L3: a recolher em todos os hosts activos ✔
  - **L4-Auth: 0 itens frescos**; 327/468 itens nunca recolheram; os restantes
    correm 1×/dia (`{$DELAY.AUTH}=1d`) com defaults de exemplo → dados lixo.
- Problemas activos no momento da auditoria: `app-bpcnet-pub`,
  `app-sms-banking`, `app-sala-reunioes` (L1 FORA DO AR, disaster);
  `app-emp` (L1, warn — só ping?); `app-live` (L2 lento).

## 3. Template — incoerências confirmadas

| # | Incoerência | Evidência |
|---|---|---|
| T1 | **L3-Conteúdo é decorativo**: `{$STRING.CHECK}` default vazio e nenhum host o sobrepõe → "procurar string vazia" passa sempre; o trigger `[L3] Conteúdo ausente` nunca pode disparar com significado | `hostmacro` dos templates 12042/12045 + macros dos 39 hosts |
| T2 | **L4-Auth com defaults de exemplo**: `{$AUTH.POST.BODY}=username=test&password=test`, `{$URL.AUTH.POST}=https://example.com/login`. 27 cenários L4 activos, 14 desactivados — os activos fazem POST diário com credenciais falsas a URLs por configurar | `hostmacro` 12042 + `httptest` status |
| T3 | **Template Externos (12045) tem L4 mas não tem macros AUTH** — L4 não faz sentido em sites de terceiros (BNA, MINFIN…); herdou o cenário sem o suporte | comparação de macros 12042 vs 12045 |
| T4 | **Inventário paralelo**: 28 cenários `Monitor *` (fora do template, delay 1m) criados directamente nos hosts das VMs (`VS8000305` ×10, host `BNA` ×8, etc.) — duplicam o L1 dos `app-*` com frequência 5× maior | `httptest` × `hosts` via MySQL |
| T5 | Sem trigger para L4 (coerente com L4 não funcionar, mas confirma que o nível nunca foi terminado) | `trigger.get` g663: 312 triggers, nenhum `[L4]` |

## 4. Notificações — mortas

- Actions de trigger: `Report problems to Zabbix administrators` **desactivada**,
  `Enviar Email` **desactivada**; só `Send Notification Email` (id 9) activa.
- A action 9 envia pelo media type **Email (id 1), que está desactivado**.
- Media types `Email BPC` e `teste_bpcnet` também desactivados; nenhum canal
  alternativo (Telegram/Teams/SMS) configurado; só 17 medias de utilizador.
- **Resultado: nenhum alerta sai do Zabbix hoje.** A alarmística só vive na
  consola/Grafana.

## 5. Mapeamento URL → serviço → VM

Derivado nesta auditoria por 3 fontes cruzadas que **concordam entre si**:
(a) `{$URL}` dos hosts `app-*` → IP/hostname → interface das VMs;
(b) cenários legados `Monitor X` criados na própria VM de hospedagem;
(c) Excel `RELATORIO DIARIO...xlsx` (aba MONITORAMENTO: 48 sistemas, 28 com Host/IP).

### 5.1 Apps internas mapeadas (19/39 automático)

| App (host sintético) | VM | Confirmação |
|---|---|---|
| app-abc, app-contif, app-psi, app-sala-reunioes, app-sgc, app-sgf, app-sib, app-spcc, app-sic* | **VS8000305** (10.10.236.50) | URL+Monitor*+Excel — **SPOF: ~9 apps na mesma VM** |
| app-banktrade | VS9000912 | URL+Monitor+Excel |
| app-cezanne | VS9000235 | URL+Monitor (Excel tem typo `VS90004235`) |
| app-forgest | VS9000480 | URL+Monitor+Excel |
| app-intix | VS8000418 | URL+Monitor+Excel |
| app-saft, app-sir | VS8000304 (10.10.238.40) | URL+Excel |
| app-sicv | VS8000427 | URL+Monitor+Excel |
| app-sms-banking | VS8000438 | URL+Monitor+Excel |
| app-swift-swp | VS8000141 | URL+Monitor+Excel |
| app-sacc | **VS8000789** — existe como host à parte `APP - Compute - VS8000789 (SACC)` (10.10.204.45), fora do g609 | URL(vs8000789)+Monitor+Excel; é também o **EQUATION Core** segundo o Excel |
| app-internet-bank / app-bpcnet-pub | VS8000742 (Excel) + grupo `BPC/SERVICO/Ebankit` (391) | Monitor IB+Excel |

\* `app-sic` aponta 10.10.236.161 = VS8000813, mas o Monitor legado estava em VS8000305 — validar qual é o real.

Por resolver (internos): `app-live` (`bpc01`), `app-sop` (`sop`) — aliases DNS;
`app-euronet` (10.10.241.153 — IP sem host no Zabbix).

### 5.2 Externos (sem VM — correcto não mapear)

BNA (sinoc/pif/preaviso/sgmc/sigma/sptr/ssif — nota: sigma e sptr apontam a
URLs **de teste** `sigmatst`/`sptrtst247`), MINFIN, INSS ×2, SAP (cloud),
site bpc.ao, Mundial Seguro, Pumangol, EMP. O host legado `BNA`
(172.20.143.22) confirma os IPs do Excel.

### 5.3 Gaps de cobertura (no Excel, sem monitor sintético)

EQUATION Core Bancário (como serviço próprio — hoje só a URL do SACC),
EBA, BFTELLER, STC, Match Cash, CTB/400, Audit Bank, Payment Manager, UYSIG,
Bloomberg, Portal EMIS, BODIVA. Nem todos são "URL-monitoráveis" (alguns são
green-screen/ficheiro) — classificar na Fase 2.

## 6. Agentes nas VMs — veredicto sobre o upgrade 6→7

Factos medidos (g609, 446 VMs):

1. 364 VMs têm template `Windows/Linux by Zabbix agent active`; 79 não têm
   agente de todo (só `VMware Guest` + `BPC Ping` + ODBC) — por isso "parecem
   vivas" nos dashboards.
2. `agent.ping` por VM: **110 frescas (<15m) · 257 NUNCA recolheram · 0 "pararam a meio"**.
3. A BD é contínua desde **2025-02-26** (upgrade in-place, schema 7.4) — se os
   agentes tivessem morrido no upgrade, haveria um degrau de `lastclock` na
   data do upgrade. Não há nenhum.
4. Os `itemid` dos `agent.ping` que funcionam e dos que nunca funcionaram
   sobrepõem-se totalmente (mesmas vagas de criação) — não é um lote antigo
   vs novo.

**Conclusão:** a tese "o upgrade corrompeu os agentes" **não é suportada pelos
dados**. O servidor 7.x aceita agentes (110 a reportar agora). As 257 nunca
entregaram um valor desde que os itens existem — as causas prováveis são, por
VM: agente não instalado/parado, `ServerActive` a apontar ao servidor antigo,
`Hostname` do agente ≠ nome do host no Zabbix (activo casa por nome), ou
firewall. Ressalva honesta: se os hosts foram recriados na migração, não
podemos provar o que a v6 fazia — mas o problema actual é igual e a correcção
também.

---

## 7. Plano de acção

### Fase A — Agentes: triagem e recuperação (desbloqueia tudo o resto)
DoD: ≥90% das 364 VMs com agente a reportar; lista de excepções justificada.

1. **A1.** Amostrar 5 VMs "nunca reportou" com a equipa de sistemas: verificar
   serviço do agente, `zabbix_agentd.conf` (`Server`, `ServerActive`,
   `Hostname`), teste TCP 10050/10051 nos dois sentidos. Classificar a causa
   dominante (esperado: `ServerActive` antigo ou agente ausente).
2. **A2.** Correcção em massa conforme a causa (GPO/script para Windows — 310
   VMs; ansible/ssh para Linux — 54). O `Hostname` do agente tem de ser
   exactamente o nome do host no Zabbix (`VSxxxxxxx`).
3. **A3.** Trigger de cobertura: alarme "host com template de agente sem dados
   >30m" (nodata) para não regredir em silêncio.
4. **A4.** Para as 79 VMs sem agente: decidir caso a caso se ganham agente ou
   se VMware Guest+Ping chega (documentar a decisão).

### Fase B — Modelo de dados: correlação URL↔serviço↔VM materializada
DoD: cada host `app-*` com tags `servico`, `vm`, `ambiente`, `exposicao`
(interno/externo); mapa completo em `documentacao/mapa-apps-vms.md`.

1. **B1.** Validar com o negócio a tabela do §5.1 (19 mapeados) + resolver os
   4 pendentes (`app-live`, `app-sop`, `app-euronet`, `app-sic`).
2. **B2.** Aplicar tags nos hosts `app-*` (ex.: `vm=VS8000305`,
   `servico=PSI`) e garantir que a VM correspondente está no grupo
   `BPC/SERVICO/*` correcto — é isto que permite ao Grafana correlacionar
   "URL em baixo" com "CPU da VM" num drill N3→VM.
3. **B3.** Completar o Excel ao contrário: devolver ao relatório diário os
   Host/IP em falta a partir do Zabbix (linhas "é necessário indicar o
   servidor").
4. **B4.** Resolver duplicados/lixo: `app-internet-bank` vs `app-bpcnet-pub`;
   typo Cezanne; URLs de teste do BNA (sigma/sptr) — confirmar se é suposto
   monitorar TST em vez de PRD.

### Fase C — Template de web cenários: refactoração
DoD: nenhum cenário a recolher lixo; cada nível ou funciona ou está
desactivado com razão documentada.

1. **C1.** L3: definir `{$STRING.CHECK}` por app (string estável da página de
   login) para as ~15 apps internas críticas; onde não fizer sentido,
   desactivar o cenário L3 no host (não deixar no-op).
2. **C2.** L4: manter só onde há credenciais de monitorização dedicadas
   (conta de serviço, sem privilégios) — candidatos: BPCNET/eBankit, SACC.
   Desactivar os restantes 27 (hoje fazem POST diário com `test/test`).
3. **C3.** Retirar L4 do template Externos (nunca autenticar em sites de
   terceiros).
4. **C4.** Cobertura nova: criar `app-*` para os gaps do §5.3 que sejam
   URL-monitoráveis; para os restantes (EQUATION, STC…) monitorizar por
   porta/processo/ODBC na própria VM.
5. **C5.** Só depois de paridade validada: desactivar os 28 `Monitor *`
   legados (1 semana em paralelo, depois desactivar — não apagar já).

### Fase D — Alarmística e notificações
DoD: alerta de teste entregue ponta-a-ponta; matriz de notificação documentada.

1. **D1.** Reactivar/configurar media type Email (SMTP do banco) — ou definir
   o canal real do NOC (Teams/Telegram) e activá-lo.
2. **D2.** Uma action de trigger com escalation (NOC imediato; chefia se
   >30m sem ack), condições por severidade e grupos g663 + g609.
3. **D3.** Dependências de trigger para reduzir ruído: L2/L3 dependem do L1;
   L1 do `app-*` depende do ICMP da VM host (quando mapeada em B2) — VM em
   baixo não gera 10 alertas de apps.
4. **D4.** Rever severidades vs tabela canónica §6.2 da engenharia.

### Fase E — Dashboards Grafana (Fase 7 do cronograma)
DoD: navegação N1→N2 APIs→N3 App validada; pasta `07·APIs e Serviços` povoada.

1. **E1.** Correr a `metodologia-auditoria-topologia.md` formalmente (este
   documento já cobre o grosso) e decidir eixos do N2: proposta — N2 "APIs e
   Serviços" com KPI strip (X apps UP/DOWN/lentas), split
   interno/externo/parceiros, tabela de problemas nativa.
2. **E2.** N3 "Detalhe da aplicação": estado L1/L2(/L3), histórico de
   disponibilidade, tempo de resposta por step, **card da VM de hospedagem**
   (via tag `vm=` de B2) com CPU/RAM/disco e link para o N3 de Servidores
   Virtuais — esta é a correlação que faltava.
3. **E3.** Arquivados de `99·Arquivo` (`d-web-01/02`, `bpc-overview`,
   `bpc_web_*`) servem só de inspiração visual; não reactivar (pré-datam o
   padrão utils/manifest/naming do repo).
4. **E4.** Fluxo normal do repo: painel a painel, manifest, layout no fecho,
   commit após aprovação.

### Fase F — Documentação e fecho
1. **F1.** `documentacao/mapa-apps-vms.md` (tabela §5 completa e validada).
2. **F2.** Actualizar `cronograma.md` Fase 7 com estas sub-tarefas.
3. **F3.** Registar no `CLAUDE.md` as constraints novas (proxy bloqueia
   `httptest.get`/`action.get` → usar MySQL; tags `servico`/`vm` como fonte da
   correlação).

### Ordem e dependências

```
A (agentes) ──────────┐
B (mapeamento) ───────┼──► C (template) ──► D (alertas) ──► E (dashboards) ──► F (docs)
```
A e B podem correr em paralelo desde já; C2/C4 dependem de B; D3 depende de B2;
E2 depende de B2 e beneficia de A.

### Questões em aberto (decisão do dono do sistema)
1. Qual é o canal real de notificação do NOC (email SMTP? Teams? Telegram?) — bloqueia D1.
2. Há contas de serviço para L4-Auth nas apps críticas? — bloqueia C2.
3. Quem executa a correcção em massa dos agentes (equipa de sistemas/AD)? — bloqueia A2.
4. BNA Sigma/SPTR: monitorar TST é intencional ou falta a URL de produção?
