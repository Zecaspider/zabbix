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
