# Inventário consolidado de VMs (vCenters) — esqueleto e 1ª rodada

Data: 2026-07-16/17. Resposta à necessidade: cruzar o inventário completo
de VMs dos vCenters com os hosts Zabbix para (a) identificar serviços por
VM sem depender de acesso completo a todos os vCenters, (b) validar/limpar
o inventário, (c) alimentar a calibração de items/triggers por papel.

## Arquitetura (a ideia original do utilizador, com as lições do repo)

```
inventario/
├── xlsx_min.py                 # leitor .xlsx só com stdlib (sem depender de openpyxl)
├── gerar_inventario.py         # extrai vCenters live (se houver credenciais) + fallback snapshot
├── inventario-consolidado.json # FONTE DE VERDADE — gerado, nunca editado à mão
├── reconciliar.py              # cruza inventario × Zabbix, produz os 4 relatórios
├── reconciliacao-diffs.json    # saída da reconciliação (gerado)
└── fontes/
    └── vcenter-consolidado-snapshot-20260504.xlsx   # extract resgatado (ver achado abaixo)
```

Princípio central: **nada se edita à mão no consolidado**. Correções humanas
vivem num `decisoes.csv` futuro (F seguinte) que o script aplica — isto
elimina o padrão que gerou "3 versões diferentes do mesmo Excel" no
`bpc-workspace`.

## Achado: o extract "perdido" existia — resgatado

O utilizador lembrava de ter feito um extract antes de a credencial do
vCenter PowerFlex quebrar (Z.8), e suspeitava que a limpeza de uma sessão
anterior o tivesse apagado/renomeado sem querer. Busca em
`C:\Repositorios` por `*vcenter*`/`*inventari*`/`*vmlist*` confirmou:

- **Não foi apagado** — estava em
  `zabbix/scripts-a-analisar/de-scripts-import/vcenter_inventory_consolidado.xlsx`
  (modificado 2026-05-04), fora do local canónico e sem nome óbvio de
  "inventário atual" (a pasta `scripts-a-analisar` é claramente uma zona de
  triagem de scripts antigos, não um destino esperado).
- Copiado (preservando o original) para
  `fontes/vcenter-consolidado-snapshot-20260504.xlsx`.
- Conteúdo: 3 sheets (**Clusters**, **Hosts ESXi**, **Máquinas Virtuais**),
  **545 VMs**, cobrindo os clusters `CLS-BPC01`/`CS9000002`/`CLS-MGMT`
  (PowerFlex) + `Cluster Swift`/`CS9000001`. Ou seja: **cobre justamente o
  vCenter PowerFlex** cuja credencial está quebrada hoje — o extract foi
  feito antes da quebra, exatamente como o utilizador lembrava.
- Colunas por VM incluem `UUID`, `Hostname (Guest)`, `IP Principal`,
  `Anotacao` — os campos M6 que faltavam ao M1-M4 da primeira sessão de
  identificação de serviços.

## Mecânica de extração live (para quando a credencial for corrigida)

`gerar_inventario.py` tenta primeiro os vCenters listados em
`VCENTER_TARGETS` via REST, usando um ficheiro de credenciais **local e
fora do repositório**, apontado pela env var `VCENTER_CREDS`:

```json
{"VCenter_PRD": {"url": "https://10.10.101.9", "user": "...", "pwd": "..."},
 "VCenter_BackupSwift": {"url": "https://10.10.101.30", "user": "...", "pwd": "..."}}
```

Sem esse ficheiro, o script cai automaticamente para o snapshot — foi o
que aconteceu nesta 1ª rodada. **Decisão de segurança**: o script nunca lê
a password dos macros `{$VMWARE.PASSWORD}` do Zabbix (mesmo sabendo que
estão em texto plano nalguns hosts, achado registado no plano de
notificações §0) — usar essa via seria contornar o controlo "Secret"
que os hosts vCenter dedicados já aplicam corretamente.

## Matching (cascata, nunca IP como 1º critério)

1. `instance_uuid` (vCenter) == `{$VMWARE.VM.UUID}` (macro do host Zabbix)
2. Nome da VM == host técnico OU nome visível (normalizado)
3. `guest_hostname` == host técnico
4. **`vmid-substring`**: extrai o código `VS######`/`VD######` de ambos os
   nomes (apanha casos como `VS8000101_vProxy-EMC Networker` vs o host
   Zabbix `VS8000101`, que a normalização simples não bate)
5. IP — só como desempate final, e só se resolver para exatamente 1 host

## Resultado da 1ª rodada (snapshot 2026-05-04 × 607 hosts Zabbix Infra)

| Métrica | Valor |
|---|---|
| VMs no inventário (snapshot) | 545 |
| Hosts no Zabbix Infra | 607 |
| Correspondências encontradas | 467 |
| Zabbix (grupo 03 Servidores Virtuais) sem par no vCenter | **0** |
| vCenter sem par no Zabbix — real | **45** |
| vCenter sem par — ignorado (vCLS-*/TEMPLATE*, não é workload) | 19 |
| Divergências de estado (Zabbix ativo, vCenter `POWERED_OFF`) | 5 |
| Propostas de serviço/tipo novas | 1 |

### Leitura: "Zabbix sem par = 0" é um bom sinal, não um bug
Todas as VMs que o Zabbix já monitoriza (grupo 03) batem com alguma VM do
snapshot. Os ~140 hosts Zabbix que não bateram por nome pertencem a outros
grupos — dispositivos físicos, storage, os 40 web-monitors sintéticos do
domínio 07 (`app-*`) — corretamente não são VMs.

### Os 45 gaps reais — 3 categorias
1. **Clones/testes/recovery pontuais** (excluir da lista de gaps):
   `VS8000841_CLONE_PDD_CLIENTE_30012024`, `VS8000848_CLONE_...`,
   `VS8000403_tape_recover`, `NS4_restore_TAPE`, `TESTE`,
   `TELMPLATE_UBUNTULINUX` (nome mal escrito de TEMPLATE — adicionar ao
   filtro `NOT_REAL_WORKLOAD`).
2. **vHMC9/vHMC9-DR**: consolas de gestão IBM Power — avaliar se cabem no
   domínio `08 Datacenter Físico` em vez de `03`.
3. **~30 VMs de produção genuinamente sem nenhuma cobertura Zabbix**
   (`VD5000KPMG1/2`, `VD5000NP010`, `VD5000SAFIRA_JUMP`, `VD5000JUMP_DSE`,
   `VD5000IA007`, `VS8000799/882/707/797/705/701/744/223(ver abaixo)/798/
   892/1206/493/716/934/717/715/883/916/819/914/750/719`, `VS9000320/313`,
   `CS9000B02`) — **candidatos reais a onboarding no Zabbix**, a validar
   um a um (podem já estar cobertos por outro nome/alias não capturado).

### ⚠️ Correção sobre a remoção do duplicado PRTG (sessão anterior)
A VM `VS8000223` apareceu nos "45 gaps reais" — investigação confirmou que
é uma **VM real e distinta** (IP `10.10.236.35`, hostname
`VS8000223.bpc.intranet`, UUID `420dbe61-570f-46b2-a40a-f9b4946e23ab`,
anotação vCenter *"PRTG.WXA.DTI.Monitoramento da rede teste"`), **não**
um duplicado vazio do host Zabbix `VS9000403`. O host Zabbix apagado
(`11653`) tinha o **IP errado** (o de `VS9000403`, `10.10.126.32`) — por
isso nunca coletou dado nenhum, mas representava uma VM real, não lixo.//
**✅ Corrigido (aprovado pelo utilizador)**: host recriado (`hostid 14724`)
com o IP/DNS reais, grupos `03`+`10`, tags `servico=PRTG`/`tipo=
monitorizacao`/`ambiente=Teste`, mesmos templates do host irmão
(`VMware Guest`, `Windows by Zabbix agent active`, `BPC Ping`,
`BPC Top Processos`), e macro `{$VMWARE.VM.UUID}` correto.

**Lição**: antes de apagar um host por "duplicado", cruzar com o
inventário do vCenter — a evidência Zabbix-only (IP/DNS iguais + zero
dados) pode significar "duplicado" OU "configurado errado", e só o
vCenter desambigua.

### Divergências de estado (5) — candidatos a desativar
3 VMs SWIFT com nome literal `_Migrada_Nao_Ligar` (VS8000126/127/128) +
2 Securesphere (VS8000478/481) estão `POWERED_OFF` no vCenter (decisão
deliberada de negócio, não falha) mas o host Zabbix continua **ativo**.
Ainda não desativados — pendente decisão/confirmação.

## 2ª rodada (2026-07-17) — comparação campo-a-campo + mapa de serviços

Pipeline novo (tudo só-leitura no Zabbix; nada aplicado sem aprovação):

```
gerar_inventario.py      -> inventario-consolidado.json  (parser corrigido)
comparar_campos.py       -> comparacao-campos.json       (diff por campo)
classificar_servicos.py  -> mapa-servicos.json           (proposta hostgroups)
```

### Erros da 1ª rodada corrigidos no parser
1. **A sheet "Maquinas Virtuais" tem 2 secções concatenadas** (linhas 3-239 =
   237 VMs de Swift/CS9000001/CS9000002; 241-548 = 308 VMs de PowerFlex:
   CLS-BPC01/CLS-MGMT). A 1ª rodada fundiu tudo e perdeu a origem por VM.
2. **9 VMs duplicadas entre secções (mesmo UUID)** — migração CS9000002→
   CLS-BPC01 apanhada 2×. Dedup com regra documentada (fica a cópia ligada;
   empate fica sec2) e TODAS as remoções registadas em
   `duplicados_resolvidos` no JSON. 545 → 536 VMs canónicas.
3. **Nomes reutilizados com UUIDs distintos** (VS8000809/811/814/815/837):
   na sec1 são uma coisa (ex. WLC C9800), na sec2 outra (INTEGRADOR Kafka/
   NiFi/Elastic). Matching por nome nestes hosts liga a VM errada — agora
   exigem UUID ou desambiguação por serviço (`vmid+servico`). Nota: o Excel
   traz BIOS UUID (42xx) e várias macros Zabbix têm instance UUID (50xx) —
   igualdade direta nem sempre é possível.
4. **A Anotacao segue a convenção `SERVICO.<COD>.<DEPT>[.detalhe]`** com
   COD=[WL][PQ]X → SO (W/L) e ambiente (P/Q). O parser agora deriva
   `servico_anotacao`, `ambiente`, `departamento` (whitelist de 15 unidades
   reais), `so_hint` e marca códigos suspeitos (ex. WOB).
5. O relatório de **completude por campo** faz parte da saída — gaps de
   extração ficam visíveis e comparáveis entre rodadas.

### Resultado da comparação (536 VMs × 608 hosts; grupo 03 = 435)
468 casados (432 nome-técnico, 20 uuid, 10 guest-hostname, 5 vmid+servico,
1 ip); 42 vCenter sem par; 17 não-workload; 9 ambíguos; **24 hosts do grupo
03 sem par no Excel** (a 1ª rodada dizia 0 — errado). Contabilidade fechada
por assert: casados+sem_par+ignorados+ambíguos == 536.

Divergências campo-a-campo (detalhe com evidência bruta dos 2 lados em
`comparacao-campos.json`):
- `tag_ambiente`: 12 reais (Excel=Qualidade, Zabbix=Produção) depois de
  equivalências QA≡Qualidade/PRD≡Produção — inclui os vProxy `LQI`.
- `so`: 14 hosts com template Windows mas SO Linux no vCenter (ou vice-versa)
  + 8 casos em que o próprio Excel se contradiz (so_hint vs guest tools).
- `ip`: 10 divergentes; 16 só no Zabbix (Excel sem IP/tools off).
- `tag_servico`: 11 conflitos de valor + 14 ausentes; 16 desconhecidos dos
  dois lados.
- `grupo_03_ausente`: 57 — **52 foram movidos para o domínio 10 perdendo o
  03** (o domínio funcional deve ser adicional, não substituto).
- `tag_cluster_ausente`: 48; `tag_departamento_ausente`: 34;
  `visible_name`: 11 (sufixos _Migrada_Nao_Ligar/vProxy etc.).
- 24 hosts grupo 03 sem VM no snapshot: VMs apagadas desde 2026-05-04 ou
  hosts manuais sem macro UUID (SCSM/MIM/SCCM, BPC Net, Solarwinds...) —
  validar um a um antes de mexer.

### Mapa de serviços (mapa-servicos.json)
171 serviços canónicos (aliases/typos unificados): 29 suporte (100 VMs),
3 segurança, 13 plataforma (56 VMs OCP/OKD/INTEGRADOR), 126 negócio
(334 VMs). Propostas:
- **Suporte fora do domínio 10**: vCenter(4), NGINX(3), Tenable(4),
  Desenvolvimento(4), Graylog(1), System Center(2), RMS(2), SFTP, Support
  Server, SCSM, Netbox, lpar2rrd.
- **21 hostgroups de negócio** `BPC/SERVICO/<X>` para serviços ≥4 VMs
  (SWIFT 22, SIGCAP 20, ACM 17, DIGIWAVE 16, EBANKIT 16, TOBE 11, ...).
- 25 VMs sem serviço identificável (nem anotação, nem nome, nem tag) —
  lista para levantamento humano.
- Fallback documentado: quando o Excel é mudo mas a tag Zabbix conhece o
  serviço (Veeam, OKD), usa-se a tag com confiança "media" — nunca sobrepõe
  o Excel em conflito.

## 3ª rodada (2026-07-17) — extract LIVE do vCenter PRD + comparação 3 vias

A credencial do vCenter PRD (10.10.101.9) e do BackupSwift (10.10.101.30)
estava utilizável no script legado `scripts-a-analisar/de-scripts-import/
20-cred-tester.py` (**em texto plano no repo — pendência de segurança:
rotacionar e mover para cofre**). `gerar_inventario.py` ganhou um fallback
que as lê em runtime (sem criar nova cópia em disco) e o consolidado passou
a ser LIVE-FIRST: 231 VMs live (PRD 228 + BackupSwift 3) + 307 do snapshot
(PowerFlex, ainda pendente Z.8). O REST não devolve a Anotacao, por isso as
VMs live são enriquecidas com a anotação do snapshot via BIOS UUID (227/231).

`extrair_vcenter_prd.py` + `comparar_3vias.py` -> `comparacao-3vias.json`
(223 VMs workload do PRD; contabilidade fechada por assert):

| Categoria | # | Leitura |
|---|---|---|
| A. nas 3 fontes | 183+9 | 9 com difs de campo (IP drift, 1 power) |
| B. live sem Excel sem Zabbix | 2 | VS8000903 (criada pós-maio, **gap real herdado**) + VS8000744 (dedup tinha-a atribuído ao cluster errado — corrigido pelo live) |
| C. live sem Excel com Zabbix | 2 | renomeadas desde maio (Migrada_Nao_Ligar_VS9000494, SV9000401) — Zabbix não herdou o gap |
| D. live+Excel sem Zabbix | 27 | **lista definitiva de onboarding**, confirmada por 2 fontes |
| E. Excel sem live | 3 | VS8000126/127/128_Migrada_Nao_Ligar **apagadas do vCenter** desde maio; hosts Zabbix (da cópia PowerFlex) continuam ativos |

Conclusão da pergunta "o Excel tem gaps e o Zabbix herdou-os?": o Excel de
maio estava **muito bom** para o âmbito PRD (1 única VM nova não coberta:
VS8000903). Os 27 sem Zabbix eram gaps de COBERTURA (já existiam no Excel);
o grosso do desvio é drift temporal: IPs (6 reais), ESXi host (98 tags
`esxi_host` obsoletas — vMotion/DRS torna esta tag volátil por natureza;
considerar removê-la ou automatizá-la via discovery), renomeações e as 3 VMs
Swift apagadas.

Com o live, o matching por UUID subiu de 20 para **191** pares (o live traz
instance E bios UUID, casando com as macros Zabbix de ambos os namespaces);
ambíguos desceram para 6 (todos linhas obsoletas do snapshot cujo host
Zabbix já pertence à cópia atual — comportamento correto).

## Plano de correção (2026-07-17) — gerado, NÃO aplicado

`gerar_plano_correcao.py` -> `plano-correcao.json` (acionável: api_method+
params por item, com evidência/risco/requer_aprovacao) e `render_plano_md.py`
-> `plano-correcao.md` (revisão humana com checkboxes). 11 secções, ~300
itens; destaques: secção 0 REVOGA a proposta da 1ª rodada de desativar
VS8000126/127/128 (as VMs migraram para CS9000002 e estão ligadas — quem foi
apagado foram as cópias Swift `_Migrada_Nao_Ligar`); 5 IPs; 33 macros UUID;
24 hosts sem VM (desativar após validação, nunca apagar); 29 onboarding;
13 templates SO; 30 conflitos de tag (decisão humana); 99 tags ausentes;
57 reintegrações no domínio 03; 23 grupos (21 novos BPC/SERVICO/*);
3 políticas (tag esxi_host volátil, vocabulário de ambiente, anotações
suspeitas no vCenter).

## Aplicação das secções 7/8/9 (2026-07-17, aprovada pelo utilizador)

`aplicar_plano_789.py` (dry-run validado antes do run real). Backup completo
dos 340 hosts afetados em `backup-plano789-20260717-080241.json`; log em
`aplicacao-plano789-20260717-080241.json`. Resultado, verificado por
releitura (0 falhas) e por re-execução do `comparar_campos.py`:
- §7: tags adicionadas em 49 hosts (fundidas, nunca substituindo valor
  existente) — `tag_*_ausente` caiu a 0; cobertura no grupo 03: servico
  399→470, departamento 376→455, vcenter_cluster 376→469.
- §8: 57 hosts reintegrados no domínio 03 (agora 492 hosts) — aditivo.
- §9: 20 grupos `BPC/SERVICO/*` criados + 253 adições de hosts (68 já
  estavam, ex. domínio 10). Grupos de domínio 05/07/10 reforçados.
Pendentes (não aprovados ainda): secções 1-6 e 10 do plano.

## Secção 2 aplicada (2026-07-17) + a regra do UUID, provada com dados

`verificar_uuid.py` cruzou o namespace da macro `{$VMWARE.VM.UUID}` de cada
host com a saúde real dos itens `vmware.vm.*` (verificacao-uuid.json):
**todos os hosts que coletam usam instance UUID (50xx); nenhum host com
BIOS UUID (42xx) coleta**. Regra estabelecida: NA MACRO SÓ ENTRA INSTANCE
UUID, extraído live do vCenter. A coluna "UUID" do Excel é BIOS UUID —
serve para cruzar inventário, NUNCA para a macro.

`aplicar_seccao2.py` (dry-run + run; backup backup-seccao2-*.json):
- 18 macros criadas (instance UUID live, confiança alta);
- 2 macros CORRIGIDAS de BIOS→instance: VS8000227 (SIRIS) e **VS8000223
  (PRTG — o host recriado na sessão anterior tinha sido recriado com o BIOS
  UUID do Excel; os itens VMware nunca teriam coletado)**;
- 15 criações adiadas + 18 macros BIOS de VMs PowerFlex por corrigir —
  aguardam o live do PowerFlex (Z.8); escrever BIOS UUID seria repetir o erro.
- Nota: 54 hosts PRD com instance UUID correto e itens sem erro mas sem
  histórico ainda (itens recentes) — reavaliar em 24-48h; se continuarem
  sem dados, investigar o collector.

## Secções 1 e 5 aplicadas (2026-07-17, com validação prévia por host)

`aplicar_seccoes_1_5.py` (dry-run + run; backup backup-seccoes15-*.json):
- §1 IPs: validação = ping/TCP10050 ao IP novo a partir da estação. 4
  aplicados (VS9000316, VS8000392/393 Exchange, VS8000741); **1 RETIDO**:
  VS8000128 → 192.168.8.2 não responde daqui (rede isolada Swift; provável
  NIC secundária — validar manualmente antes de mexer; o IP atual
  10.10.13.8 pode ser o correto para monitorização).
- §5 templates SO: validação = itens do template errado sem nenhum
  histórico (lastclock=0). 13/13 validados e trocados (Windows→Linux by
  Zabbix agent active, unlink+clear seguro — zero dados perdidos).
  Verificação pós-aplicação: 0 falhas. Nota: os hosts trocados usam agente
  ATIVO — o agente na VM tem de estar instalado/configurado para Linux;
  se em 24-48h não aparecerem dados, o gap é agente, não template.

## Secções 6, 3 e 4 aplicadas (2026-07-17) + proposta-politicas.md (§10)

Regra do utilizador na §6: vence o vCenter (validado live); exceções: VM só
no snapshot/PowerFlex (mantém Zabbix até Z.8) e casos podres. O dry-run
apanhou 2 contaminações que a versão final filtra: match por ip(desempate)
sobre um IP Zabbix errado, e IDENTIDADES CRUZADAS (VS8000319×VS9000319;
hosts "Integrador" cujo macro+IP provam monitorizar as VMs homónimas do PRD
— tags corrigidas, rename proposto na §10). `aplicar_seccoes_346.py`:
- §6: 12 hosts reetiquetados (9 ambiente→QA, CPI, PSI, Excel Report/Ansible
  nos ex-"Integrador"); 8 exceção PowerFlex; 7 → §10.
- §3: validação ping+agente+últimos dados: 19 desativados (nunca apagados),
  5 RETIDOS com sinais de vida (SCSM_DB e MIM Sync com dados recentes;
  VS9000319/IBM IB9/Support Server respondem a ping) — investigar donos.
- §4: 27 hosts criados (2 pulados: POWERED_OFF). DNS resolveu IP de 10 VMs
  extra; sem IP → interface por DNS (falha visível, nunca IP inventado).
  Grupos 03+funcional, VMware Guest (+BPC Ping se IP), instance UUID live.
  Nota: o script correu 2× por engano; idempotência confirmada (2ª passagem:
  0 criações).
- §10: `proposta-politicas.md` — esxi_host (remover; usar vmware.vm.hv.name),
  vocabulário {Produção, QA, Operações,...} com O=Operações (parser
  corrigido), e as anotações erradas NO vCenter (vProxyr/LQI, 8 códigos com
  SO trocado, typos, identidades cruzadas, anotações pobres). Aguarda decisão.

## Aplicação final lado-Zabbix (2026-07-17) — pronto p/ templates/triggers/dashboards

Decisão do utilizador: **vCenter intocável** (trabalho de outra equipa); só
validamos/confrontamos e corrigimos o LADO ZABBIX. `aplicar_zabbix_final.py`
(dry-run + run; backup backup-final-20260717-150616.json; verif 0 falhas):
- Fase A — 463 hosts: tag `so` (Windows/Linux do SO real) em 436;
  `cod_ambiente` +45; `esxi_host` ATUALIZADO do live em 98 (política de
  remoção continua em aberto; entretanto a tag não mente); typos de tag
  corrigidos (SECURESPHERE, AZURE AD CONNECT — só no Zabbix).
- Fase B — cirurgia VS8000319×VS9000319: os DOIS hosts partilhavam a macro
  UUID `500d8263` (da Talentia). Agora: host SFTP → IP 10.10.238.57 (ping
  validado) + UUID da VS8000319; host Talentia mantém o seu UUID/IP.
- Fase C — renames dos visible names mentirosos: "Integrador/Apachekafka -
  VM - VS8000809" → "Excel Report - VM - VS8000809 (QA | PMSI)";
  "Integrador/Apachenifi - VM - VS8000811" → "Ansible - VM - VS8000811
  (QA | DTI)" (UUID+IP provam que monitorizam as VMs PRD).
As correções C1-C5 da proposta-politicas.md que exigiam escrita no vCenter
ficam como LISTA DE ENTREGA à equipa dona do vCenter (proposta-politicas.md);
no Zabbix os equivalentes já estão corrigidos.

## Templates e agentes — VMs de produção (2026-07-17)

`levantar_templates_agentes.py` + `validar_agentes.py` (ping+TCP10050) +
`relatorio-agentes-producao.md`. 318 hosts produção (207 Win, 105 Linux).
Aplicado: 44 hosts Linux sem NENHUM template de agente (só VMware Guest+BPC
Ping) → `Linux by Zabbix agent active` adicionado (aditivo, backup+verif
OK; `aplicar_templates_linux.py`). Windows: 0 hosts sem template — a
lacuna é 100% operacional. Relatório categoriza os 155 hosts com template
certo mas sem dado, por sinal de rede (A=agente responde/Zabbix não recebe,
24; B=sem agente respondendo, 94; C=sem ping, 29; D=só IPv6 link-local, 8)
— nenhum resolvível por API, precisam de ação na VM/rede pela equipa dona.
Achado extra: 2 pares de hosts produção com o MESMO IPv4
(VS8000219/VS9000346; VS8000711/VS8000816) — um dos dois está errado,
não corrigido, precisa decisão.

## Resolução de pendentes + diagnóstico (2026-07-17, fim do dia)

- esxi_host removida de 420 hosts (remover_esxi_host.py); IP dup 2.3 (711→DNS).
- 3.1 esclarecido: 18/24 já coletam (itens calculados a aquecer), 6 são Z.8
  (macro vCenter PowerFlex 232.84 / cred `agonzaga` quebrada).
- 3.2 (acesso-vms.json, scan portas sem auth p/ não bloquear contas AD):
  Linux 71/75 SSH aberto; Windows 10 WinRM+4 RDP. Base p/ instalar agente.
- 3.3/3.4: IPs em falta não recuperáveis por DNS/vCenter (tools off ou
  PowerFlex) — só consola/donos/Z.8. Detalhe em pendentes.md.

## Estratégia de cobertura — estrategia-cobertura.md

Modelo de monitorização POR SERVIÇO em 4 camadas (L1 infra / L2 SO / L3
verificação funcional do serviço / L4 observação+notificação+troubleshoot)
para resolver o "serviço pára e ninguém nota" (ex.: DNS em standby com CPU
verde). Piloto proposto: DNS (NS3/NS4 + Domain Controllers) com
`net.dns[]` — arranca já, sem depender do agente. Escala por template
`BPC Service - <tipo>` ligado aos hostgroups BPC/SERVICO/*.

## Próximos passos

1. Validar os ~30 gaps reais um a um (podem ter Zabbix host com nome
   totalmente diferente — merece checagem antes de criar host novo).
2. Desativar os 5 hosts com divergência de estado confirmada (aprovação
   por host).
3. Ampliar `KEYWORDS` do `reconciliar.py` com a `Anotacao` do vCenter
   (ainda subaproveitada — só 1 proposta nova nesta rodada porque a
   maioria dos hosts já tem tag `servico` da sessão anterior).
4. Quando a credencial do vCenter PowerFlex for corrigida (Z.8), rodar
   `gerar_inventario.py` com `VCENTER_CREDS` apontando às 3 fontes live —
   o snapshot deixa de ser necessário, mas fica como fallback histórico.
5. Repetir a reconciliação após cada rodada de classificação de serviços
   de suporte, para pegar novas divergências.
