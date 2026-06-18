# Z.8 — Diagnóstico: credenciais inválidas para vCenter02 bloqueiam 270 VMs

**Data:** 2026-06-17  
**Autor:** BPC NOC / Observabilidade  
**Estado:** aguarda credenciais vCenter02

---

## 1. Sintoma observado

Durante o desenvolvimento do dashboard N2 Infraestrutura VMware verificou-se que
**270 de 451 VMs** do grupo Zabbix `609 — BPC / INFRAESTRUTURA / SERVIDORES VIRTUAIS`
não têm dados recolhidos:

- `vmware.vm.powerstate` com `lastclock = 0` (never collected)
- `state = not_supported`
- Impacto directo: painéis N2/N3 SV mostram 181 VMs em vez de 451

---

## 2. Investigação — como chegámos à causa raiz

### Passo 1 — Hipótese inicial: UUID mismatch

A primeira hipótese baseou-se no erro "Unknown hypervisor uuid" observado em sessão anterior.
Foi corrigido o host `sv9000655` (URL trocado de vCenter PRD para vC02) e reiniciado o
`zabbix-server`. O problema persistiu — surgiu um novo host com o mesmo erro (`sv9001647`).
Conclusão: não era um caso isolado.

### Passo 2 — Audit completo dos itens not_supported no grupo 608

Query Zabbix API:
```
item.get
  groupids: [608]
  filter: { state: 1 }        ← state=1 significa "not supported"
  output: [hostid, key_, error]
  limit: 500
```

Resultado: **17 hosts** com 27–43 itens cada em estado `not_supported`.  
Erro uniforme em todos:
```
Cannot complete login due to an incorrect user name or password.
```

Isto descartou imediatamente a hipótese UUID — o erro é de autenticação, não de lookup de UUID.

### Passo 3 — Inspecção dos macros de credenciais

Query:
```
host.get
  groupids: [608]
  selectMacros: [macro, value]
  output: [hostid, host]
```

Comparação entre um host funcional (vCenter PRD) e um host falhado (vCenter02):

| Host | vCenter | `{$VMWARE.USERNAME}` | `{$VMWARE.PASSWORD}` | Estado |
|---|---|---|---|---|
| `VS9001206` | PRD `10.10.101.9` | `administrator@vsphere.local` | preenchida | ✅ OK |
| `sv9000206` | vC02 `10.10.232.84` | `agonzaga@vsphere.local` | **vazia** | ❌ falha |
| restantes 16 vC02 | vC02 `10.10.232.84` | `agonzaga@vsphere.local` | preenchida mas errada | ❌ falha |

### Passo 4 — Correlação com o grupo 609

Os 17 hosts do grupo 608 com login falho são exactamente os hypervisors que gerem as
270 VMs do grupo 609 sem dados. A cadeia de bloqueio é:

```
credencial errada no grupo 608
  → vCenter02 rejeita login do Zabbix VMware poller
    → poller não consegue inventariar VMs
      → itens vmware.vm.* no grupo 609 ficam "not supported"
        → 270 VMs sem dados nos dashboards
```

---

## 3. Estado actual

| vCenter | URL | Hosts monitorizados (gr. 608) | Username Zabbix | Credencial | VMs com dados |
|---|---|---|---|---|---|
| PRD | `https://10.10.101.9/sdk` | 7 | `administrator@vsphere.local` | ✅ válida | 181 / 451 |
| vC02 | `https://10.10.232.84/sdk` | 17 | `agonzaga@vsphere.local` | ❌ inválida/expirada | 0 / 270 |

**Hosts afectados no grupo 608 (hostids Zabbix):**
`11900, 14170, 14171, 14172, 14205, 14246, 14247, 14248, 14267, 14268, 14269, 14284, 14285, 14286, 14287, 14288, 14289`

---

## 4. Fix necessário

Quando as credenciais correctas para o vCenter02 forem fornecidas:

1. Actualizar macro `{$VMWARE.USERNAME}` e `{$VMWARE.PASSWORD}` nos 17 hosts via Zabbix API (`usermacro.update`) — operação em batch, ~2 min.
2. Aguardar 10–15 min para o poller VMware rein­ventar as VMs.
3. Verificar `vmware.vm.powerstate` no grupo 609 — deve passar de 181 para ~451 itens com `lastclock > 0`.

---

## 5. Workaround activo

Os dashboards N2/N3 continuam funcionais com os **181 VMs** do vCenter PRD.
O desenvolvimento prossegue normalmente — quando Z.8 for resolvido a contagem actualiza
automaticamente sem alterações ao código dos painéis.
