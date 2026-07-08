# CLAUDE.md — BPC-Observe

> **Autoridade única e auto-suficiente deste directório.** Todo o trabalho vive
> dentro de `bpc-observe/` — não depender de nada fora dele.
> Documentos de referência (todos internos a esta pasta):
> - `README.md` — índice da estrutura
> - `cronograma.md` — painel de progresso vivo (estado de cada ponto)
> - `documentacao/engenharia-do-sistema.md` — arquitectura, contratos, DoD
> - `documentacao/blueprint-observabilidade.md` — mapa de drill-down N1→N2→N3
> - `documentacao/mapa-host-groups.md` — domínio → groupId/datasource
> - `documentacao/framework-de-criacao-de-cards.md` — contrato de dados do card
> - `documentacao/fluxo-agencias-n4-n5.md` — fluxo de drill das Agências (N1→N5)
> - `documentacao/metodologia-auditoria-topologia.md` — checklist a correr antes de desenhar/redesenhar dashboards de qualquer segmento
> - `documentacao/auditoria-apis-servicos.md` — auditoria do domínio APIs e Serviços + veredicto sobre agentes silenciosos nas VMs (precede a Fase 7)
> - `documentacao/mapa-apps-vms.md` — fecho do template único de web monitoring (`BPC Web Monitoring v2`), schema de tags `tipo`/`servico`/`vm`/`ip` nos 41 hosts `app-*`, mapa VM confirmado por IP, e investigação inicial de dependências de BD/backend (2026-07-08/09) — ler antes de continuar a decisão de domínio/pasta Grafana por sistema ou de aprofundar dependências multi-VM
> - **`documentacao/estado-monitorizacao-producao.md` — PONTO DE ENTRADA para continuar o trabalho de VMs/serviços/BDs/aplicações de Produção** (condensado 2026-07-04; ler este antes do `cronograma.md` Fase 14/15 se só precisares do estado actual, não do histórico completo)
> - `documentacao/auditoria-tag-servico-vs-relatorio-negocio.md` — cruzamento das 168 tags `servico` (650 hosts Zabbix Infra) contra os 50 sistemas do relatório diário de negócio + achados de mismatch/fragmentação (Fase 14.20, 2026-07-05) — ler antes de decidir consolidação da tag `servico` ou a ligação app↔VM do Eixo B (`mapeamento-apps-vms-webscenarios-handoff-20260705.md` §12)
> - `documentacao/auditoria-zabbix-infra-20260707.md` — auditoria e limpeza de ruído do Zabbix Infra (2026-07-07, registo Z.27–Z.35 do `cronograma.md`): hosts ESXi/vCenter duplicados removidos, 2 templates de web monitoring desligados, items MSSQL órfãos apagados, achados de segurança (password root ESXi expirada, Defender desligado) — ler antes de continuar a limpeza de ruído ou decidir o destino do template `VMware Guest` (454 VMs, levantamento feito, ainda não executado)
> - `<dominio>/CLAUDE.md` — regras específicas de um domínio (quando existir)
> - **Fora desta pasta** (excepção deliberada — trabalho operacional de VM, não de dashboard): `C:\Repositorios\zabbix\bpc-workspace\vm-agente-recuperacao-handoff-*.md` — histórico detalhado, host a host, da recuperação de agentes Zabbix (Fase 14 do `cronograma.md`)
> - **Fora desta pasta** — `C:\Repositorios\zabbix\bpc-workspace\mapeamento-apps-vms-webscenarios-handoff-20260705.md` — histórico do mapeamento sistemas de negócio → VM → web scenario (Fase 14.17/14.18 do `cronograma.md`); inclui o deliverable `Mapa_VMs_Servicos_Zabbix_Grafana.xlsx` e a auditoria da tag `servico`. O "elo em falta" (tag `vm=`) que este ficheiro deixava pendente em §12 foi fechado em 2026-07-08 — ver o handoff seguinte
> - **Fora desta pasta** — `C:\Repositorios\zabbix\bpc-workspace\handoff-webmonitoring-tags-inventario-20260708.md` — **PONTO DE ENTRADA** para continuar o domínio APIs e Serviços (Fase 7 do `cronograma.md`): template único `BPC Web Monitoring v2` fechado e calibrado, tags `tipo`/`servico`/`vm`/`ip` aplicadas aos 41 hosts `app-*`, gaps de cobertura EQUATION/EBA/BFTELLER resolvidos por VM (falta criar o `app-*`), e achado de `PMSI`/`SAFIRA` como candidatos a domínio Grafana próprio (detalhe completo em `documentacao/mapa-apps-vms.md`)
> - **Fora desta pasta** — `C:\Repositorios\zabbix\bpc-workspace\zabbix-infra-limpeza-ruido-handoff-20260707.md` — **PONTO DE ENTRADA** para continuar a limpeza de ruído do Zabbix Infra (registo Z.27–Z.36 do `cronograma.md`): decisão pendente do template `VMware Guest` (454 VMs, 3 grupos já medidos, plano do Grupo A validado e pronto a executar), reescrita dos templates de web monitoring desligados, e lições de API a não repetir (filtro `hostids`+`templateids` não fiável, corrida da cascata, hosts `flags=4`)
> - **Fora desta pasta** — `C:\Repositorios\zabbix\bpc-workspace\handoff-duplicados-e-agentes-20260708.md` — **PONTO DE ENTRADA** para continuar a limpeza de hosts duplicados e a recuperação de agentes (registo Z.39–Z.52 do `cronograma.md`): 23 duplicados já apagados (restam `sv9001206` "Vcenter DR" — conector incompleto, não duplicado — e o par PMSI pendente de SSH), 13 agentes recuperados/instalados (grupo "syscall signal" fechado a 100%, causa-raiz = BOM+NVIDIA+parâmetro MSSQL obsoleto empilhados sobre um reboot de patch de Windows), e 15 hosts genuinamente esgotados sem decisão do utilizador (credencial 3ª via, Server 2003, dispositivo edge/DMZ)

---

## CONSTRAINTS IMUTÁVEIS — ler antes de qualquer acção

Estas regras são sempre verdade. Não requerem verificação por sessão — violá-las é sempre um erro.

| Constraint | Valor / Regra |
|---|---|
| **Pastas Grafana por domínio** | Cada dashboard vive na pasta de domínio do seu nível, não numa pasta única (reorg Fase 12, 2026-06-19). UIDs das pastas: `00·Visão Geral` `bfpm0sdaos074d` · `01·Infraestrutura VMware` `bfpm0sdhhi22od` · `02·Armazenamento` `dfpm0sdnq8x6oe` · `03·Servidores Virtuais` `cfpm0sdsxjb40c` · `04·Rede` `bfpm0sdxiclxcf` · `05·Segurança` `afpm0se1lombkb` · `06·Bases de Dados` `afpm0se5rij28d` · `07·APIs e Serviços` `bfpm0sedbpgqob` · `08·Serviços de Negócio` `dfpm0sej5gxs0f` · `99·Arquivo` `dfpm0sey9ut4wb`. **Agências = segmento de Rede** — pasta `04·Rede` › `04.1·Agências`; `09·Agências` está vazia/para arquivo. **Dentro de "04·Rede" há 4 pastas de segmento** (nested folders, 2026-07-01): `04.1·Agências` (`rede-seg-agencias`) · `04.2·Borda DC` (`rede-seg-bordadc`) · `04.3·DC Fabric` (`rede-seg-dcfabric`) · `04.4·Edifícios` (`rede-seg-edificios`); o N2 fica directo em `04·Rede`, fora de qualquer segmento. Cada `manifest.json` tem o `folderUid` correcto (aponta para a pasta de segmento, não para `04·Rede` directamente, excepto o N2). A pasta antiga "dashboards v5" (`efpbu5tvrhce8a`) está vazia/legada. Estrutura completa em `documentacao/engenharia-do-sistema.md §4.2` |
| **Naming de dashboards** | Título: `Nx · Domínio [· Âmbito] — Propósito` (prefixo Nx obrigatório para ordenação por nível; sentence case; ` · ` entre hierarquia; ` — ` antes do propósito). UID: `dominio-nivel-funcao` — **sem número de ordenação** (número só nas pastas/ficheiros para ordenação visual). Mapa canónico Rede em `documentacao/engenharia-do-sistema.md §4.0`. T-04 CONCLUÍDO — UIDs canónicos activos no Grafana. |
| **Naming de directorias locais** | Pastas de domínio: `NN-nome/` espelhando numeração Grafana (ex: `04-rede/`). Subpastas: `NN-nivel-dominio[-subdomain]/` onde NN é a ordem de drill (ex: `01-n3-rede-agencias/`). **Quando o domínio tem múltiplos segmentos paralelos** (só Rede, hoje): pasta intermédia `NN.M-segmento/` (ex.: `04.1-agencias/`, `04.2-borda-dc/`) — a numeração de drill reinicia dentro de cada segmento. "Segmento" é o termo correcto (não "subdomínio"): ver `documentacao/engenharia-do-sistema.md §4.0`. Mapa completo em `documentacao/engenharia-do-sistema.md §4.1`. T-05 CONCLUÍDO — pastas renomeadas e commitadas; reorg em segmentos CONCLUÍDA 2026-07-01. |
| **Reorganização de pastas** | Concluída 2026-06-27 — 16 dashboards de produção nas pastas de domínio correctas, `General` vazio. DoD e checklist em `documentacao/engenharia-do-sistema.md §4.2`. |
| **Utils canónico** | `_comum/utils.js` é a fonte de verdade · para cada dashboard: **copiar** o ficheiro inteiro e ajustar só o `nocLabel` · nunca editar a cópia directamente |
| **Push ao Grafana** | Parar e pedir confirmação explícita ao utilizador antes de qualquer escrita |
| **Git commit** | Parar e pedir confirmação explícita ao utilizador antes de qualquer commit |
| **Acesso à API Zabbix — leitura livre, escrita sempre pedida** | Leitura directa (`*.get`, `apiinfo.version`) usa o token Admin já existente em `tok3n` (Via A, `documentacao/engenharia-do-sistema.md §10.2`) sem pedir confirmação — é o mesmo acesso já usado para sondagem de items/thresholds. **Qualquer método de escrita** (`*.create`, `*.update`, `*.delete`, `user.*`, `action.*`, `script.*`, `configuration.import`, etc.), **mesmo que o token o permita tecnicamente**, exige parar e pedir confirmação explícita ao utilizador antes da chamada — caso a caso, igual à regra de Push ao Grafana/Git commit. Decisão do utilizador (2026-07-04): usar o token Admin único em vez de criar um utilizador/role Zabbix dedicado só de leitura. |
| **Nunca activar discovery rules/templates Zabbix sem avaliar o risco de flood de triggers/notificações — mesmo que a escrita em si seja "só 1 mudança"** | Incidente real do utilizador (antes desta sessão, contexto trazido em 2026-07-04): activar um template MSSQL gerou uma **enxurrada de triggers → emails → tickets abertos automaticamente no GLPI**. "Escrita pequena" (1 template/discovery rule) não é sinónimo de "risco pequeno" — o impacto real está a jusante (quantas triggers/itens a mudança activa, se há acção de notificação ligada a esses triggers, e se essa acção cria tickets/emails automaticamente). **Antes de propor ou activar qualquer discovery rule, template, ou item que estava desactivado**: (1) verificar explicitamente se há `action`/notificação Zabbix ligada aos triggers desse template (`action.get`, leitura); (2) se houver, confirmar com o utilizador o estado actual da integração GLPI/email antes de activar, mesmo que a integração pareça "morta" (ver nota em `documentacao/auditoria-apis-servicos.md` sobre notificações mortas — não assumir que continua morta sem verificar); (3) preferir sempre testar em 1 host isolado antes de activar ao nível do template (que se aplica a todos os hosts de uma vez). Nunca tratar "activar 1 discovery rule" como acção de baixo risco só porque tecnicamente é 1 chamada de API — o `service.discovery` nativo do template `Windows by Zabbix agent active` (achado e travado em `cronograma.md` Fase 14.16) fica **por decidir**, não activar sem este check. |
| **Acesso WinRM às VMs — credencial nunca passa pelo chat, escrita sempre pedida por VM nomeada** | O utilizador gera a credencial com `Get-Credential \| Export-Clixml -Path <caminho fora de qualquer repo Git>` no próprio terminal (nunca dentro desta sessão — `Get-Credential` bloquearia, é interactivo). Claude só faz `Import-Clixml` + passa o objecto `PSCredential` directamente a `-Credential`; nunca chama `.GetNetworkCredential().Password` nem imprime o segredo — a protecção real é a encriptação DPAPI do ficheiro (ligada à conta Windows + máquina), não o "apagar depois". **Qualquer acção de escrita numa VM** (arrancar/parar serviço, instalar software, editar config, reinstalar) exige o utilizador nomear explicitamente o(s) host(s) por nome antes de correr — uma aprovação genérica ("sim, corrige") não cobre acções compostas (ex. desinstalar + corrigir); cada acção distinta pede a sua própria confirmação. Pode existir mais do que uma credencial (`vm-admin-cred.xml`, `vm-admin-cred2.xml`, ...) quando VMs diferentes têm contas de admin diferentes. Detalhe do fluxo completo (incluindo o achado de que instalação limpa via download+SMB contorna falhas de TLS em SOs antigos) em `bpc-workspace/vm-agente-recuperacao-handoff-20260704.md`. |
| **Nunca enfraquecer segurança só para destravar monitorização** | Quando o obstáculo a uma VM/host é uma protecção de segurança deliberada (UAC Remote Restriction, segregação SWIFT/CSP, etc.), **não propor nem tentar contornar** — parar e apresentar o trade-off ao utilizador. Precedente (2026-07-04): `VS9000424`/`VS9000343` (Server 2008/2008R2) só precisavam de `LocalAccountTokenFilterPolicy=1` para destravar WinRM, mas o utilizador optou por **não** enfraquecer o UAC remoto só para monitorizar 2 VMs antigas — ficam de fora até alguém configurar localmente (consola/RDP). Mesmo princípio aplicado às 5 VMs SWIFT (Z.20): não insistir com mais credenciais, escalar via canal próprio. Ver `cronograma.md` Z.24/Z.20 |
| **3 vCenters mapeados — acesso confirmado em 2/3** | Grupo Zabbix `664`: **VCenter PRD** (`sv9000204`, `https://10.10.101.9/sdk`) e **vCenter Backup Cluster Swift** (`vcenter-backup`, `https://10.10.101.30/sdk`) — login testado e **OK**. **vCenter PowerFlex/"vCenter 02"** (`sv9000206`+`vcenter-02`, mesmo endpoint `https://10.10.232.84/sdk`) — login testado e **falha (401), credencial errada confirmada** no Zabbix (ver `cronograma.md` Z.8); tentado também o utilizador `administrator@vsphere.local` do PRD contra este vCenter — falhou também, não há conta partilhada entre vCenters. Testado via REST API (`POST /rest/com/vmware/cis/session`, Basic Auth), lendo as credenciais dos macros `{$VMWARE.*}` do host Zabbix — **nunca imprimir a password**: extrair dentro do próprio script e só reportar o resultado (HTTP 200/401), nunca o valor. **Nunca "caçar" credenciais alternativas por conta própria** (grep amplo por tok3n/macros à procura de algo escondido) — se uma credencial falha, perguntar ao utilizador qual tentar a seguir, no máximo testar uma conta já conhecida e explicitamente indicada por ele (ex.: a de outro vCenter), nunca uma busca exploratória. **Técnica reutilizável para investigar mudanças de config VM (ex. placa de rede desligada) antes de agir**: a API REST do vCenter não expõe histórico de eventos — foi construído um cliente SOAP mínimo (Login + `QueryEvents` no `EventManager`, filtrado por entidade) para confirmar se uma alteração (ex. NIC desligada) foi deliberada antes de a reverter; usado com sucesso para resolver 2/13 hosts de Z.19 (VCenter PRD). Endpoint de acção da API REST para (des)ligar uma placa de rede é `POST .../hardware/ethernet/{nic}/connect` (sub-caminho), não `?action=connect` (404 nesta instância). **Antes de tratar 2 IPs iguais como "conflito de rede entre 2 VMs", comparar `{$VMWARE.VM.UUID}` dos 2 hosts Zabbix** — se for idêntico, é o mesmo VM registado 2x (resíduo de rename/clone), não um conflito real; resolver desactivando o duplicado, nunca tentando "resolver" um conflito que não existe. Caso confirmado: `VS8000526`/`VS8000888`, mesmo UUID, mesmo VM. `filter.networks` (em `/rest/vcenter/vm` e `/rest/vcenter/network`) não filtra nesta versão da API — devolve a lista toda sem erro; confirmar portgroup por amostragem manual (`hardware/ethernet/{nic}` de candidatos), nunca confiar no filtro. **Cuidado: nem todo o UUID igual é duplicado real** — antes de assumir "mesmo VM registado 2x", confirmar que os 2 hosts Zabbix mostram dados VMware idênticos (CPU/RAM/hypervisor) para provar o impacto; se um dos nomes corresponder a uma VM genuinamente diferente no vCenter (nome/IP/hostname do guest não batem), é **erro de atribuição de UUID** (macro copiado da VM errada por um script de discovery), não duplicado — o fix é corrigir o UUID (via `instance_uuid` do endpoint `/rest/vcenter/vm/{vm}`, não `bios_uuid`), nunca desactivar nenhum dos 2 hosts. Caso confirmado 2026-07-04: `VS9000316` (UUID errado, corrigido) vs `VS8000371`/`VS8000526`/`VS8000888` (duplicados reais). Origem provável de todos estes casos: um script do utilizador (LLD/autodiscovery vCenter→Zabbix) que atribuiu UUID+user+password por VM — grupos `A-CLASSIFICAR` (Z.5) e `Novos_Inventario` (Z.6) são provavelmente resíduos do mesmo processo, nunca terminado. **Renomear sem perder o padrão local**: quando o hostname real (guest) diverge do nome técnico Zabbix mas se quer manter a convenção de nomes do domínio (ex. `VS80009XX`), actualizar só o campo `name` (visible name, via `host.update`) para reflectir o hostname real — não o campo `host` (técnico). Caso: `VS8000982`→"OKD Worker1"/`VS8000984`→"OKD Worker3" (hostname real `workerN.okd-dev.bpc.intranet`, cluster OpenShift). |
| **vCenter não é estático — é um sistema vivo, não "ground truth" congelado** | Confirmado 2026-07-04: uma VM (`VS8000982`, cluster OpenShift/IBM Cloud Pak em construção) mudou de portgroup de rede **durante a própria sessão de auditoria**, sem qualquer acção nossa — confirmado revendo todas as escritas vCenter da sessão (só 2 VMs tiveram a placa reconectada, nenhuma delas). Antes de usar um sinal do vCenter (portgroup, cluster, etc.) como prova definitiva de algo, considerar se a VM pertence a um cluster/projecto **activamente a ser trabalhado por outra equipa** — nesse caso, excluir da validação até estabilizar, em vez de tratar o sinal como facto permanente. **Origem confirmada dos erros de classificação `ambiente`/`camada`/`departamento`**: vêm de um fluxo manual (`2-extrair_inventario_transicao.py` gera Excel com colunas vazias para preenchimento humano → `1-zabbix_sync.py` aplica o CSV preenchido tal e qual) — são erros de classificação humana espalhados, não bug de código; diferente da origem dos erros de `VM.UUID` (script `34-zabbix-vmware-mapper.py`, que faz match Zabbix↔vCenter **por IP como método primário** — se o IP no Zabbix estava desactualizado, atribui o UUID da VM errada). **Ao validar uma tag "ambiente" contra o nome do portgroup de rede, não assumir convenção global** — um padrão sistemático (11+ hosts do mesmo departamento) pode reflectir uma convenção local desse departamento (ex. "PRD" no nome da rede não significar necessariamente Produção), não erro de classificação — tratar como 1 pergunta ao utilizador, não 11 correcções automáticas. |
| **Documentar após aprovado** | Depois de algo ser **aprovado e bem testado**, actualizar de imediato a documentação (`documentacao/*`), este `CLAUDE.md`, o `cronograma.md` e outros relevantes — antes de avançar. Contrato de processo do utilizador (2026-06-27) |
| **Fluxo Agências (N1→N5)** | `N1 → N2 Rede → N3 Agências (geomap) → N4 Agência (detalhe/diagnóstico, `n4-agencia-detalhe`) → N5 Interfaces (exclusivo, `n5-agencia-interfaces`)`. O N4 é o detalhe rico (triagem NOC); o N5 são só as interfaces do router. O `rede-n4-wan-dispositivo` genérico fica para hosts arbitrários (ex.: ficha WAN da própria agência); os 5 routers de borda do DC têm o seu próprio N4 canónico — ver linha "Fluxo Borda DC" abaixo. Detalhe em `fluxo-agencias-n4-n5.md` |
| **Fluxo Borda DC ("Borda DC", segmento N2)** | O segmento chamado **"WAN"** no N2 é especificamente os **5 routers de borda do DC** (`HG_DC_ROUTERS`, g27: `DC1-RTE-WAN-INT/WAN-EMIS/WAN-AG/PARC/GTW01` — confirmado por `hostgroup.get` ao vivo, sem 6º host escondido). **EM RECONSTRUÇÃO (2026-07-01+)**: os 4 dashboards antigos (`rede-n3-wan`, `rede-n4-wan-router`, `rede-n3-wan-carriers`, `rede-n4-wan-provedor`) foram arquivados em `04.2-borda-dc/arquivo-borda-dc/` (local) e movidos para `99·Arquivo` (Grafana) — investigação com dados reais (`host.get`/`item.get` ao vivo + `rede-topologia.md`) revelou que o design de 2 fluxos escondia 4 ambiguidades: (1) WAN-AG faz 3 papéis no mesmo hardware — hub DMVPN Agências (`Tu101-107`) **+** hub DMVPN Edifícios (`Tu201-208`, sufixo `_EDIFICIO`) **+** Azure ExpressRoute (`Po2.2931`/`Po2.2932`); (2) o parceiro MINFIN tem **4 circuitos em 2 routers diferentes** (GTW01: via Kwanza/MST + via Unitel; PARC: via AT + via Multitel); (3) PARC mistura circuitos de dados de parceiros com dezenas de trunks de voz/CUBE — dois domínios técnicos; (4) GTW01 estava rotulado "AZURE/GOV" sem ter **nenhum** circuito Azure (confirmado zero via `item.get`) — o correcto é só "Governo" (MINFIN/INSS/BODIVA). Nova arquitectura: **3 eixos** — por router (`01-n3-bdc-routers/` → `02-n4-bdc-router/`, 5 cards físicos, GTW01 relabelled, WAN-AG expõe as 3 funções), por provedor (`03-n3-bdc-provedores/` → `04-n4-bdc-provedor/`, igual ao fluxo antigo validado, novo UID), por serviço de negócio (`05-n3-bdc-servicos/` → `06-n4-bdc-servico/`, NOVO — 7 cards: Internet/EMIS/Agências/Edifícios/Azure/Governo/Voz, cada um mostrando explicitamente o(s) router(s); o card Governo mostra "2 routers" por causa do MINFIN partido). **Actualização 2026-07-01:** o eixo router GANHOU N5 (`07-n5-bdc-router-interfaces`, UID `rede-n5-bdc-router-interfaces`) — drill-down do N4 Router para o detalhe completo de uma única interface (estado+flaps, tráfego in/out, erros, descartes), clone do padrão `n5-rede-agencia-interfaces`. Dropdown de interface usa variável MySQL nativa contra a própria tabela `items` do Zabbix (`WHERE h.host='$routerName'`) — **sem depender de tags BPC**, que não existem para estes 5 routers; mesmo mecanismo comprovado das Agências, só troca a fonte de `$host`/tags para `$routerName` puro. Numeração local `07-` (não `05-`/`06-`, reservados ao eixo serviço ainda por construir). Botão N4→N5 em `l4-bdc-n5-button.js` (clone de `l4-n5-button.js`). Os outros 2 eixos (provedor/serviço) continuam sem N5 pela razão original (N4 já é ficha de provedor/serviço único). **N4 Provedor reconstruído nativo (2026-07-01):** `l4-bdc-provedor-ficha.js` (nunca tinha sido terminado — sem manifest, nunca pushed) substituído por painéis nativos, mesma filosofia do N4/N5 Router. Diferença chave face ao Router: um provedor tem circuitos em **vários** dos 5 routers, não um só — resolvido com a variável `$provider` a guardar a própria alternação regex (não uma chave simbólica), interpolada em `item.filter` com `host.filter=/.*/` (grupo inteiro). Confirmado que o triggers panel nativo consegue filtrar por regex sobre o nome da trigger (o ficheiro antigo assumia que não dava). Transform `extractFields` com capture groups nomeados falhou silenciosamente nesta versão do Grafana — evitar; usar `reduce`+`organize` simples com coluna de texto combinado em vez de tentar separar em colunas via regex. **Bug crítico encontrado depois do utilizador testar manualmente (2026-07-01):** `${provider}` puro funcionava perfeitamente ao navegar por URL directa mas partia a alternação regex ao seleccionar no dropdown — Grafana escapa caracteres regex (`|`, `\`, `[]`) na interpolação normal quando a mudança de variável acontece via SPA (sem reload de página), mas não escapa da mesma forma no bootstrap inicial a partir da URL. **Sempre usar `${provider:raw}`** (nunca a forma pura) em qualquer variável cujo valor seja um regex literal — e testar sempre via selecção real no dropdown, nunca só por URL directa (os dois caminhos podem divergir). Card "Edifícios" é só o handoff DC-side (túneis em WAN-AG) — árvore completa continua em `04.4-edificios/`, link de cross-segmento. **Regra de isolamento por segmento (2026-07-01):** cada dashboard vive só na pasta do seu segmento — nunca partilhado entre pastas. O `rede-n4-wan-dispositivo` (genérico, aceita qualquer host) foi **movido de Borda DC para `04.1·Agências`** por só ter consumidor real ali (`l4-ag-ficha.js`, botão "Interfaces WAN" da ficha de agência); Borda DC não usa nenhum dashboard genérico. Se um caso de uso futuro precisar de uma vista "dispositivo genérico" dentro de Borda DC, duplicar o dashboard com um UID novo — nunca reaproveitar o de Agências. |
| **Fluxo DC Fabric ("DC Fabric", segmento N2)** | Só os **7 switches Spine-Leaf** (`HG_DC_SWITCHES`, g26 — 2 SPINE + 5 LEAF). Os 5 routers WAN de borda (g27) **não aparecem aqui** — vivem exclusivamente em Borda DC (mesmo hardware, evita duplicação entre pastas Grafana; link cruzado no rodapé do eixo saúde). **REDESENHADO DO ZERO (2026-07-02)**: dashboard único antigo (`rede-n3-dc`) e N4 antigo (`rede-n4-dc-switch`) arquivados (local `04.3-dc-fabric/arquivo-dc-fabric/`, Grafana `99·Arquivo`). Nova arquitectura: **2 eixos paralelos** — por dispositivo (`rede-n3-dc-dispositivos` → `rede-n4-dc-fabric-switch` → `rede-n5-dc-switch-interfaces`, clone do padrão N4/N5 Router de Borda DC; classificação por tag Zabbix `funcao`/`modelo`, confirmada ao vivo, **nunca** regex sobre nome de host) e por saúde/correlação (`rede-n3-dc-fabric-saude`, matriz underlay spine×leaf + pares vPC + overlay VXLAN — mantido à parte porque a relação "1 link, 2 pontas" não cabe bem num card de dispositivo isolado). **Uplink LEAF→SPINE é assimétrico**: o LEAF descreve o seu lado como `LINK TO SPINE-XX`, nunca `UNDERLAY` — essa palavra só aparece do lado SPINE (`LEAF-10X UNDERLAY`) e, enganosamente, também numa loopback de BGP dos LEAFs (`BGP PEERING UNDERLAY`, não é uplink físico); regex de classificação tem de exigir um dos dois padrões específicos, nunca `UNDERLAY` isolado. Mapa completo de UIDs em `documentacao/engenharia-do-sistema.md` §4.0. |
| **Datasource Zabbix filtra por NOME** | Nos painéis nativos, o filtro `item` casa pelo **nome visível** do item, não pela chave (ex.: usar `/CPU utilization/`, não `system.cpu.util`). Lição do `d04agencia2` (dava "No data" por items renomeados) |
| **Proxy `zabbix-api` (BPC.rpc) tem cache de ~30min no servidor** | O endpoint `CFG_META.apiUrl` (`/api/datasources/uid/<uid>/resources/zabbix-api`), usado por `window.BPC.rpc` em todos os painéis Business Text, devolve respostas em cache no lado do Grafana durante ~30 minutos para os mesmos parâmetros de query — confirmado ao vivo (rebuild Borda DC, 2026-07-01): `lastclock` ficou congelado por >25min entre pedidos idênticos repetidos. Qualquer lógica de "stale" (dados desactualizados) baseada em `lastclock` desta via **tem de usar um limiar > 30min** (ex.: 2400s), senão sinaliza falso-positivo em dados que estão genuinamente ao vivo, só presos na janela de cache. Os painéis **nativos** (`ds/query`) não partilham este cache — só afecta chamadas via `BPC.rpc`/`zabbix-api` resource. |
| **Auditoria de topologia antes de desenhar dashboards** | Antes de decidir arquitectura de um segmento/domínio (quantas vistas, que eixos), correr o checklist de `documentacao/metodologia-auditoria-topologia.md`: inventário autoritativo (`hostgroup.get`) → tags/inventário do host (hipótese, nunca facto) → **inventário real de circuitos/interfaces por item.get (fonte de verdade)** → cruzar com docs existentes → procurar explicitamente mapeamentos N:M (1 dispositivo com várias funções, 1 função em vários dispositivos). Nunca aceitar tag de host, label de código, ou título de dashboard existente como fonte de verdade. Lição do rebuild Borda DC (2026-07-01): a tag `funcao=wan-agencias` e o label "AZURE/GOV" estavam ambos errados/incompletos face aos dados reais |
| **Dashboards de REDE → datasource Network** | Em dashboards de rede, o `CFG_META.apiUrl` do `BPC.rpc` **e** a âncora (datasource do *target*) têm de apontar ao Zabbix **Network** (`ffo8sp8zllog0e`); o datasource da âncora tem de ser **igual** ao datasource do painel (senão a query corre no datasource errado → vazio). Metadados de agência (ficha/dropdown por nome) via MySQL Network `cfo3cgypdrdvkf` |
| **Painel de problemas Zabbix está instalado** | `alexanderzobnin-zabbix-app v6.3.0` traz o `alexanderzobnin-zabbix-triggers-panel` — usar o painel **nativo** de problemas (não Business Text) para triggers de host |
| **`content` no manifest** | Cada entrada de painel em `manifest.json` **deve** ter `"content": "<div id=\"...\"></div>"` com o `elementId` exacto declarado no CFG do `.js` · sem este campo o `push_panel.py` gera um ID errado e o painel fica em branco |
| **Sem scroll nos painéis** | Cada painel deve ter `gridPos.h` dimensionado para que o seu conteúdo caiba inteiramente no viewport sem barra de scroll interna · ajustar no passo de layout final (§4) |

---

## 0. Âmbito e infra

**Stack:** Grafana **12.4.2** · Zabbix **7.4** (Infra) e **7.0** (Network) · plugin Business Text (`marcusolsson-dynamictext-panel`) v6.2.0

**Datasources Grafana:**
| UID | Nome | Tipo |
|---|---|---|
| `3_KgG43nz` | BPC - INFRA | Zabbix 7.4 Infra |
| `ffo8sp8zllog0e` | BPC-NETWORK | Zabbix 7.0 Network |
| `afor1g5862fb4c` | MYSQL - INFRA ZABBIX | MySQL (config/inventário Infra) |
| `cfo3cgypdrdvkf` | MYSQL - ZABBIX NETWORK | MySQL (tags/inventário Network — ficha + dropdown agências) |

**Plugin para painéis BPC:** Business Text (`marcusolsson-dynamictext-panel`).
- Nome no código: `"type": "marcusolsson-dynamictext-panel"`
- **Atenção:** o nome antigo `marcusolsson-businesstext-panel` é incorrecto nesta versão do Grafana e provoca falha silenciosa do painel.
- Opções obrigatórias num painel DT funcional: `renderMode: "allRows"`, `editors: ["afterRender"]`, `transformations: [{id:"reduce"}]`.

Esta pasta mapeia para a pasta **"dashboards v5"** no Grafana
(`http://10.10.126.22:3000`, UID `efpbu5tvrhce8a`). Estrutura: 1 pasta por
domínio (`servidores-fisicos/`, `servidores-virtuais/`, `armazenamento/`,
`seguranca/`, `bases-dados/`, `apis/`, `servicos-negocio/`, `rede/`,
`agencias/`), mais `visao-geral/` (N1). Cada domínio tem subpastas `n2/` e `n3/`
— **1 subpasta = 1 dashboard Grafana = 1 `manifest.json`** (regra completa em
`documentacao/engenharia-do-sistema.md` §4.1).

## 1. Princípio: ficheiros locais primeiro, Grafana depois

Fluxo obrigatório para qualquer alteração:

```
1. Editar o ficheiro .js localmente
2. node --check ficheiro.js          (sintaxe válida antes de subir)
3. Subir para o Grafana (push)
4. Testar no browser (screenshot + console, com tempo suficiente
   para a query Zabbix e o RPC assentarem — não concluir "está partido"
   antes de esperar ~15-20s)
5. Aprovado → git commit do(s) ficheiro(s) alterado(s)
   Reprovado → corrigir o .js local e repetir a partir do passo 2
```

**Nunca corrigir directamente no Grafana sem reflectir a alteração no
ficheiro local primeiro.** O Grafana é o ambiente de teste, não o repositório.

## 2. Porque é que cada painel não é só um ficheiro

O Grafana (plugin Business Text — ID: `marcusolsson-dynamictext-panel`) guarda cada painel como um objecto JSON com
dois tipos de campo bem distintos:

| Campo | Onde vive localmente | Conteúdo |
|---|---|---|
| `options.afterRender` (a lógica/render do painel) | o `.js` do painel | JS puro, sem imports, autónomo |
| `gridPos`, `targets` (query Zabbix), `datasource`, `fieldConfig` | só existe no JSON do dashboard | estrutura/posição/dados, não lógica |

**Nunca duplicar o conteúdo do `.js` dentro de um ficheiro `.json` mantido à
mão.** Um JSON de dashboard completo, gravado em disco, só deve existir como
**snapshot pontual** (ver secção 4) — nunca como cópia permanentemente
sincronizada à mão do `afterRender`. Manter os dois em sync manualmente é
frágil e gera duplicação inútil (já aconteceu nesta pasta — fail a evitar).

## 3. Construção incremental, painel a painel

Ao construir ou reconstruir um dashboard, **não** escrever todos os painéis
de uma vez e só depois testar. Em vez disso:

```
para cada painel (pela ordem do manifest.json, ver secção 5):
  1. escrever/editar o .js localmente
  2. node --check
  3. push: substituir/adicionar apenas este painel no dashboard Grafana
     - painel novo  → adicionado com gridPos provisório (full-width,
       empilhado abaixo do último painel existente) — não perder tempo
       a acertar o layout final nesta fase
     - painel já existente → só o afterRender é substituído; gridPos
       fica como estava
  4. testar no browser
  5. aprovado → manifest.json actualizado (id atribuído pelo Grafana) →
     avançar para o próximo painel
     reprovado → corrigir o .js e repetir a partir do passo 2
```

O ajuste de **layout final** (gridPos de todos os painéis, lado a lado,
tamanhos definitivos) só acontece **depois de todos os painéis do dashboard
estarem aprovados** — é um passo único, no fim, não um ajuste por painel.

## 4. JSON completo do dashboard — só no fecho

Quando todos os painéis de um dashboard estão aprovados:

1. `pull` do dashboard completo do Grafana → escrever `dashboard-completo.json`
   (ou `<nome-dashboard>.json`) nessa subpasta.
2. Ajustar `gridPos` de todos os painéis nesse ficheiro (passo manual, é só
   estrutura — nunca o texto do `afterRender`).
3. Definir **`"transparent": true`** em **todos** os painéis e **`"title": ""`**
   nos painéis de conteúdo (`role != utils`). Regra obrigatória NOC — aplica-se
   a todos os dashboards N2 e N3, sempre, sem excepção.
4. `push` do JSON completo de volta (operação única de layout).
5. `git commit`: os `.js` de cada painel + `manifest.json` + este JSON final.

Este ficheiro JSON deixa de ser tocado depois disso, a não ser que se repita
este processo de fecho (ex.: dashboard ganhou um painel novo mais tarde).

## 5. Manifesto por dashboard

Cada subpasta/dashboard tem um `manifest.json` pequeno, que é a ligação
robusta nome-de-ficheiro ↔ painel Grafana (evita ter de adivinhar a
correspondência por tamanho/conteúdo do script):

```json
{
  "dashboardUid": "5b6b0e85-0e65-4753-9d99-9602cfcd85d1",
  "dashboardTitle": "D4-N2-Servidores virtuais",
  "panels": [
    { "file": "l2-header-global.js",            "id": 1, "role": "utils",   "title": "Header + Shared" },
    { "file": "l2-kpi-card-v5.js",               "id": 3, "role": "content", "title": "KPI Strip" },
    { "file": "l2-correlacionador-de-eventos.js","id": 7, "role": "content", "title": "Event Correlation" }
  ]
}
```

- `id` fica `null` até ao primeiro push desse painel (é o Grafana que o
  atribui).
- `role: "utils"` identifica o(s) painel(ões) utilitário(s) — ver secção 6.
- **Convenção de nomes:** prefixo de nível `l2-*.js` / `l3-*.js`, painel utils
  `utils.js` (`documentacao/engenharia-do-sistema.md` §4). Mantêm-se nomes
  descritivos; não se renomeia para `p0-/p1-...`.
- **Fonte de verdade do utils:** o painel `utils.js` canónico vive em
  `_comum/utils.js` (raiz) e é **copiado** para cada dashboard. Melhorias ao
  runtime partilhado fazem-se primeiro em `_comum/utils.js` e só depois se
  propagam às cópias — nunca divergir uma cópia à mão.

## 6. Painel(ões) utilitário(s) — padrão obrigatório, não excepção

Como não há bundler nem imports, cada dashboard precisa de **pelo menos um**
painel "utilitário" que carregue primeiro e defina o que os outros painéis
vão consumir (`window.BPC`, `window.waitForBPC`, `window.BPC_SHARED`,
`window.BPC_CHARTS`, CSS global).

- **Por defeito: um único painel utilitário por dashboard** (`role: "utils"`
  no manifesto), fundindo header + shared + charts — menos pontos de falha
  do que vários painéis "early" a correr em paralelo.
- Só se separa em dois utilitários se houver justificação concreta (ex.: uma
  biblioteca de gráficos pesada e reutilizada só por alguns painéis daquele
  dashboard específico).
- Regra (contrato utils, `documentacao/engenharia-do-sistema.md` §5.1): nunca
  redefinir `window.BPC_SHARED`/`window.BPC_CHARTS`/`BPC.utils`/`BPC.rpc`/`THEME`
  localmente num painel de conteúdo — usar sempre o que o `utils.js` expôs.

### Bootstrap obrigatório em todo o painel de conteúdo

O painel utilitário pode ainda não ter terminado de definir `window.waitForBPC`
quando um painel de conteúdo arranca (corrida de carregamento — já causou um
dashboard inteiro em branco nesta pasta). Por isso, **todo** painel de
conteúdo usa este gabarito de arranque, nunca uma chamada directa:

```js
function start(rpc) {
  // lógica do painel aqui
}

function initWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(start)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] <nome-do-painel>: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { initWithRetry(attempt + 1) }, 100)
}

initWithRetry()
```

❌ Nunca: `window.waitForBPC(function (rpc) { ... })` directo, sem guarda.

## 7. Query Zabbix "âncora" de cada painel

O painel Dynamic Text só renderiza `options.content` quando a query Zabbix
configurada no `target` do painel devolve **pelo menos uma linha**
(`renderMode: allRows`). Os filtros (`group`/`host`/`item`) não precisam de
ser os dados reais mostrados (isso é feito via RPC dentro do `afterRender`)
— servem só de "âncora" para destravar o render. **Nunca deixar estes
filtros vazios** — apontar sempre para um host/item Zabbix real e
permanentemente disponível.

**Escolha da âncora:** preferir itens de **polling frequente e fiável** —
ICMP ping (`icmpping`) ou `ICMP Availability` são ideais. Evitar items
VMware (`vmware.hv.*`, `vmware.vm.*`) como âncora: o poller VMware tem
intervalos mais longos e pode não ter pontos no intervalo de tempo
seleccionado, causando render vazio mesmo com o host activo. Âncora
canónica recomendada: `Storage - IBM FS9500` / `ICMP ping` (grupo Storage) —
funciona para qualquer dashboard independentemente do domínio.

## 8. Checklist antes de aprovar um painel

- [ ] `node --check` passa
- [ ] Usa o gabarito `initWithRetry` (secção 6) se for painel de conteúdo
- [ ] Não redefine `BPC_SHARED`/`BPC_CHARTS`/`BPC.utils` localmente
- [ ] `target` do painel tem `group`/`host`/`item` apontados para algo real
- [ ] Testado no browser com espera suficiente (15-20s) antes de concluir
      que falhou
- [ ] `manifest.json` actualizado com o `id` do painel
- [ ] DoD do painel cumprido (`documentacao/engenharia-do-sistema.md` §10.1):
      CFG aninhado, labels/cores/thresholds do catálogo §6.2, sem hardcode
- [ ] Contrato de dados respeitado (`documentacao/framework-de-criacao-de-cards.md`)
