# Secção 10 — Políticas: todos os casos, o que está mal e a minha proposta

Gerado 2026-07-17. Nada daqui foi aplicado; cada bloco termina com a proposta
a aprovar (ou rejeitar) em separado.

## A. Tag `esxi_host` — 98 de 420 valores obsoletos em 2,5 meses

**O que está mal:** a tag grava onde a VM estava no dia da etiquetagem, mas o
DRS/vMotion move VMs continuamente. Exemplos (tag vs vCenter live hoje):
`VS8000522` diz `sv9000645`, está em `sv9000646`; `VS8000700` diz `sv9000640`,
está em `sv9000646`; `VS8000124` diz `sv9000640`, está em `sv9000646` — e mais
95. Qualquer relatório ou filtro por esta tag mente, e re-etiquetar hoje só
adia a próxima mentira.

**Proposta:** REMOVER a tag `esxi_host` de todos os hosts. A informação
existe sempre fresca no item `vmware.vm.hv.name` do template VMware Guest
(consultável e usável em triggers). Manter `vcenter_cluster` (estável — uma
migração de cluster é um evento raro e deliberado). Rejeito a alternativa de
re-carimbar por cron: institucionaliza o drift em vez de o eliminar.

## B. Vocabulário do ambiente — 3 dialetos para a mesma coisa

**O que está mal:** hoje coexistem a tag `ambiente` com {Produção 412, QA
129, Operações 7, Desenvolvimento 2, Teste 1, A-CLASSIFICAR 26}, as
anotações do vCenter com a 2ª letra do código {P, Q, O} e derivados textuais
{Producao, Qualidade}. A auditoria já tratou QA≡Qualidade e PRD≡Produção
como equivalentes para não gerar falsas divergências, mas o vocabulário
duplo continua a ser fonte de erro humano.

**Descoberta nesta rodada:** a 2ª letra O = **Operações** (códigos WOA/WOB,
15+ hosts) — o parser tratava O como typo; já corrigido
(`gerar_inventario.py` mapeia P/Q/O).

**Proposta:** vocabulário canónico da tag = **{Produção, QA, Operações,
Teste, Desenvolvimento}** (o que já é maioritário no Zabbix); mapeamento
oficial da anotação: P→Produção, Q→QA, O→Operações. Os 26 `A-CLASSIFICAR`
resolvem-se pelo código da anotação onde exista. Nenhuma mudança em massa é
necessária — só documentar e seguir daqui para a frente.

## C. Anotações erradas NO vCenter (a fonte de verdade também tem bugs)

A regra "o vCenter vence" só é sustentável se a anotação for corrigida
quando está provadamente errada. Casos, com evidência:

### C1. vProxys (4 hosts — retidos na §6 por isto)
Anotação: `vProxyr.LQI.DTI...` → typo (`vProxyr`) e ambiente Q(ualidade) em
appliances de backup da PRODUÇÃO (VxBlock/PowerFlex; o Zabbix diz Produção e
concordo). **Devia ser:** `vProxy.LPI.DTI...`. Até corrigir, a tag Zabbix
`Produção` fica como está.

### C2. Código com SO trocado (8 VMs — a 1ª letra mente)
| VM | Anotação diz | VM real é | Devia ser |
|---|---|---|---|
| VS8000700 (GitLab) | `WQA` | Ubuntu | `LQA` |
| VS8000884 (E-learning) | `WQA` | Ubuntu | `LQA` |
| TACACS UBUNTU | `WPI` | Ubuntu | `LPI` |
| VS8000890 (Gitlab) | `WQA` | Ubuntu | `LQA` |
| VS8000760 (Fusion Essence) | `WQA` | RHEL 8 | `LQA` |
| SV9000204 (vCenter) | `WPI` | Photon OS | `LPI` |
| Graylog | `WPA` | Ubuntu | `LPA` |
| vs8000855 (Sigcap LB) | `LPL` | Windows 2022 | `WPL` |

(As 8 são exatamente as VMs onde a §5 trocou o template — o SO real venceu.)

### C3. Typos de serviço/nome no vCenter
`SECURESHERE`→SECURESPHERE, `AZURE AD CONNET`→CONNECT,
`TELMPLATE_UBUNTULINUX`→TEMPLATE_, `VS8000519_Revovery`→Recovery.

### C4. Identidades cruzadas no Zabbix (cirurgia manual, 2 casos)
1. **VS8000319 × VS9000319**: o host `Sftp pmsi - VM - VS8000319` tem a
   macro UUID e o IP (10.10.236.55) da VM **VS9000319** (Talentia); e existe
   um segundo host `Talentia - VM - VS9000319` (retido na §3, ping OK).
   **Proposta:** o host "Sftp pmsi" passa a representar de facto a VM
   VS8000319 (IP live 10.10.238.57 + instance UUID do live); o host
   "Talentia" mantém a VS9000319 (IP 10.10.236.55 + macro corrigida).
2. **Integrador VS8000809/811 (e gémeas 814/815)**: macro+IP provam que
   estes hosts monitorizam as VMs do **PRD** (Excel Report / Ansible — tags
   já corrigidas na §6); só o visible name diz "Integrador" (PowerFlex).
   **Proposta:** renomear os visible names para o serviço real; criar
   cobertura para as gémeas INTEGRADOR do PowerFlex quando Z.8 abrir o
   acesso (com instance UUID correto de lá).

### C5. Anotações mais pobres que a curadoria Zabbix (regra aplicada, info a repor no vCenter)
Na §6, o vCenter venceu sobre valores Zabbix mais específicos: `SIC`
(VS8000813), `SIR` (VS8000304), `LIVE` (VS8000305), `Stork Agent/DB/Server`
(VS8000927-929), `sistema de compensação de cheques` (VS8000427), `canais
digitais` (vs8000740). **Proposta:** enriquecer a anotação no vCenter (ex.
`MICROCREDITO.SIC.WPA.DTI`) para que a especificidade não viva só no Zabbix.

## Como aplicar as correções C1-C3/C5 no vCenter
Temos credencial do PRD (a mesma do extract): posso gerar um script de
atualização de anotações (API REST, write) com dry-run + lista de diffs para
aprovação — dizes se queres. Alternativa: entregar esta lista a quem gere o
vCenter.
