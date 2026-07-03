# Relatório de Avaliação — Sistema de Observabilidade BPC (Zabbix + Grafana)

**Data:** 2026-07-03 · **Âmbito:** avaliação de engenharia sénior (rede + sistemas) com testes ao vivo
**Método:** auditoria do repositório e documentação + teste no browser de 13 dashboards de produção, incluindo drill-downs reais por clique (N1→N2→N3→N4→N5), interacção com dropdowns e verificação directa da API Zabbix via os dois datasources.

---

## Veredicto

**Não está pronto para comercialização.** Está pronto para **operação interna piloto no NOC do BPC** (sobretudo o domínio Rede, que é maduro e profundo até N5/N6). Para produto vendável faltam: consistência de dados entre níveis (1 bug crítico activo), performance de arranque, 4 de 9 domínios por construir, higiene de alertas, e empacotamento/gestão (deploy reprodutível, backup do código, RBAC/multi-tenancy).

Estimativa honesta de maturidade: **~60% como produto; ~85% como ferramenta interna do domínio Rede.**

---

## 1. O que está bom (forças reais, verificadas ao vivo)

| Força | Evidência |
|---|---|
| **Arquitectura de drill coerente N1→N6** | Testado por cliques reais: N1 → N2 Rede → N3 Agências (geomap 218 pontos) → N4 CUNHINGA (`var-host=RTCUNH00` resolvido para nome) → N5 Interfaces Uíge (timeline por interface + tráfego/erros/descartes). Back-links e breadcrumbs correctos em todos os níveis. |
| **Honestidade dos dados** | "Sem SNMP" em vez de zeros falsos (N4 Agência DOWN); "sem dados (Z.8)" nos cards vCenter; anotação nve1 down no DC Fabric com interpretação ("provável loopback, confirmar com equipa"). Isto é raro e é um diferenciador. |
| **Coerência entre eixos paralelos** | SPINE-11/12 "Degradado" no N3 Dispositivos e o mesmo nve1 DOWN sinalizado no N3 Saúde do Fabric — os dois eixos contam a mesma história. |
| **Fix do dropdown regex (`:raw`) confirmado** | Regressão testada: seleccionar "MST / MSTELECOM" (valor com pipes) no dropdown real do N4 Provedor funciona — 14 circuitos, header e triggers filtrados correctamente. |
| **Densidade NOC** | N2 Servidores Virtuais: 446 VMs, cobertura métrica 84%, pior-VM CPU/RAM, fonte agente/vmware por linha, storage por volume. N3 Borda DC: 5 routers, 48 ligações categorizadas por serviço. |
| **Processo de engenharia acima da média** | CLAUDE.md com constraints, cronograma vivo, manifests por dashboard, utils canónico, metodologia de auditoria de topologia antes de desenhar, arquivo disciplinado de dashboards antigos. |

---

## 2. Defeitos encontrados nesta avaliação (novos ou confirmados)

### CRÍTICOS

**D-01 · N2 Rede mostra tudo a 0 — inconsistência N1↔N2 (bug activo em produção).**
O N1 mostra Rede com 5 críticos/259 avisos; o N2 Rede mostra "0 dispositivos, 0 alertas, Sem alertas activos". Causa isolada ao vivo: o `BPC.rpc` do utils **pushed no Grafana** aponta ao datasource INFRA (`host.get` grupos 24/26–29 → 0 hosts) enquanto o endpoint NETWORK devolve 288 hosts. O `utils.js` local está correcto — **o fix B-10 não está no Grafana** (nunca pushed para este dashboard, ou regressado). Um operador que confie no N2 conclui que a rede está limpa quando há 31 agências em baixo. *Acção: re-push do utils do N2 Rede + criar verificação automática de diff local↔Grafana para os 27 utils.*

**D-02 · Tempo de primeiro render: 40–120 segundos por dashboard.**
Medido de forma consistente em todos os dashboards com painéis Business Text (N1 ~35s, N3 Agências ~50s, N3 Borda DC ~80s, N3 DC Dispositivos ~80s, N2 SV ~120s). Causas prováveis combinadas: cadeia de lazy loading do Grafana 12, carga do plugin BT por painel, RPCs sequenciais à API Zabbix, e queries MySQL. Para wallboard NOC (TVs) e para venda, é inaceitável; agrava-se com o problema conhecido de janela não visível (observers throttled → painéis nunca renderizam em kiosk/TV sem foco).

### MÉDIOS

- **D-03 · Título "Header + Shared" visível no N1** — regra B-11 (título vazio) não aplicada ao dashboard de entrada, precisamente o mais visto.
- **D-04 · N4 Agência DOWN mostra "Latência ICMP 0 s" a verde** — para uma agência 100% perda, latência 0 a verde é leitura enganosa; devia mostrar "—" ou vermelho.
- **D-05 · N2 Armazenamento auto-contradiz-se** — card "ARRAYS IBM · SNMP: OK — TODOS HEALTHY" ao lado de FS9200/FS9500 em WARN com trigger "No SNMP data collection" (Z.9) e coluna "Saúde SNMP" vazia; gauge "Disponibilidade 1h" sem valor.
- **D-06 · Contradição em ecrã no N4 Provedor (MST)** — circuito Tu20 "UP" na tabela e, no mesmo ecrã, alerta "Tu20: Link down" aberto há 7 meses (Z.16, trigger corrompida no Zabbix). Mina a credibilidade perante um cliente.
- **D-07 · Semântica de estado nos cards N3 Edifícios** — "Crítico" com todos os links UP, 0% perda e RTT normal (estado guiado só pela contagem de alertas); "Down" com "3/3 links WAN". O operador não consegue prever o que o estado significa.
- **D-08 · N6 em acesso directo** — variável Switch é caixa de texto vazia (sem dropdown, sem default); título "N6 - Rede - Edificio - Switch - Detalhe" fora da convenção de naming (`Nx · Domínio · Âmbito — Propósito`).

---

## 3. Dívidas de dados Zabbix que limitam o valor (não são defeito dos dashboards, mas o cliente vê-as)

| ID | Impacto observado ao vivo |
|---|---|
| **Z.8** (poller VMware) | Os 4 cards vCenter no N2 VMware marcados "⚠ dados desactualizados"; PowerFlex com "0 ligadas / 265 desligadas (sem dados)"; 210 VMs "sem dados" no N2 SV. O domínio VMware está efectivamente cego. |
| **Z.9/Z.10** (SNMP IBM / script Dell) | Armazenamento é só ICMP — sem capacidade, sem IOPS; N3 Armazenamento bloqueado. Para um banco, monitorizar storage por ping não é vendável. |
| **Z.14** (~73 routers de agência sem SNMP, 33%) | Um terço das agências sem CPU/memória/interfaces — o N4/N5 mostra "Sem SNMP" honestamente, mas o troubleshoot WAN fica cego nessas. |
| **Z.12** (ruído de alertas) | N1: 386 avisos Agências + 259 Rede; N2 SV: 553 triggers activos. Com este ruído os KPIs de alertas não discriminam nada. |
| **Z.13/Z.16** (alertas de 7 meses) | Os 2 problemas mais antigos do sistema estão fixos em todos os ecrãs Borda DC desde Nov/Dez 2025. |
| Temperatura Nexus | 3 alertas High reais de temperatura (LEAF-103/104/105, module-1 Homewood) visíveis no N3 DC Fabric — encaminhar à equipa de DC (achado de infra-estrutura, não de software). |

---

## 4. Cobertura funcional

- **Construído e testado:** N1 · Rede completa (4 segmentos, N2→N6) · VMware (N2+3×N3) · Armazenamento (N2) · Servidores Virtuais (N2+N3).
- **Em falta (cards "em construção" no N1):** **Segurança, Bases de Dados, APIs & Serviços, Serviços de Negócio (eBankit)** — para um banco, Segurança e BD são core; a promessa de observabilidade "do negócio à infra-estrutura" ainda não se cumpre.
- **Adiado:** N0 Executivo/SLA — sem relatório de disponibilidade/SLA não há proposta de valor para gestão, que é quem compra.

---

## 5. Gestão e engenharia (prontidão para produto)

1. **Git sem remote** — todo o código vive num único disco; 48 ficheiros modificados por commitar; branch `refactor/visao-geral-rebuild` aberta. Risco de perda total do trabalho.
2. **Deploy manual** — push por scripts Python sem pipeline; o D-01 (utils local correcto ≠ Grafana) é consequência directa: não há verificação de drift local↔Grafana. Recomenda-se provisioning-as-code (ou pipeline de push com diff) e ambientes dev/prod.
3. **Dependência pesada de JS custom** — utils de ~66 KB copiado em ~27 dashboards + painéis Business Text com lógica de negócio. Funciona, mas o custo de manutenção cresce linearmente com os dashboards; qualquer upgrade do Grafana/plugin é um risco sistémico (já aconteceu: lazy loading do Grafana 12).
4. **Cache de ~30 min no proxy `zabbix-api`** — as vias BPC.rpc não são "tempo real"; documentado, mas num produto tem de ser resolvido ou declarado.
5. **Sem modelo de comercialização técnica** — RBAC/permissões por cliente, multi-tenancy, instalação em ambiente do cliente, documentação de operação para terceiros: nada disto existe ainda (a documentação actual é excelente, mas é interna de desenvolvimento).

---

## 6. Recomendações priorizadas

**P0 — esta semana**
1. Re-push do `utils.js` do N2 Rede (D-01) e revalidar contagens contra o N1; criar script de diff local↔Grafana para todos os painéis.
2. Aplicar B-11 ao N1 (D-03) — é a montra do sistema.
3. Configurar remote git + commit da árvore actual.

**P1 — antes de qualquer demonstração comercial**
4. Performance: orçamento de render <10 s por dashboard (reduzir nº de painéis BT, paralelizar RPCs, avaliar library panels; medir antes/depois).
5. Higiene de alertas com a equipa Zabbix (Z.12/Z.13/Z.16) — sem isto os números do N1 não significam nada.
6. Dados: destravar Z.8 (VMware) e Z.9/Z.10 (storage) — dois domínios inteiros dependem disto.
7. Consistência semântica de estados (D-04/D-05/D-07) — definir e documentar uma única regra de cor/estado por card.

**P2 — para produto**
8. Construir Segurança e Bases de Dados (mínimo N2); N0 SLA executivo.
9. Naming e defaults do N6 (D-08); dropdown em vez de textbox.
10. Empacotamento: provisioning-as-code, guia de instalação, modelo de permissões por perfil (NOC / gestão / cliente).

---

## 7. Conclusão

O sistema tem uma **base arquitectónica invulgarmente sólida** — o drill N1→N6 coerente, a honestidade dos dados e a disciplina de engenharia são diferenciadores genuínos face a dashboards Grafana típicos. Mas hoje é um **sistema interno em maturação**: um bug crítico de consistência activo, arranque lento demais para NOC, quatro domínios por construir e zero empacotamento para terceiros. Com 2–3 meses de hardening focado (dados → performance → cobertura → empacotamento), torna-se um produto demonstrável; já hoje é utilizável como piloto interno do NOC BPC no domínio Rede.
