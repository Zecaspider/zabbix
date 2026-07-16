# Integrações de notificação Zabbix — SMS/WhatsApp (BPC)

Media types Webhook prontos para importar no Zabbix (**Alerts → Media types →
Import**), um por provedor, para notificar por SMS/WhatsApp — requisito do BPC
para incidentes em fins de semana.

Pesquisa de mercado que fundamenta as escolhas: [`provedores-sms-angola.md`](provedores-sms-angola.md)

## Integradores disponíveis

| Arquivo | Provedor | Canais | Rota | Estado |
|---|---|---|---|---|
| [`media_mimo_sms.yaml`](media_mimo_sms.yaml) | Mimo (Backbone, Luanda) | SMS | Local Angola | Pronto — **confirmar spec HTTP com a Backbone** |
| [`media_wesender_multicanal.yaml`](media_wesender_multicanal.yaml) | WeSender (Digital Factory, Luanda) | SMS + WhatsApp* | Local Angola | Pronto — API pública documentada |
| [`media_telcosms_sms.yaml`](media_telcosms_sms.yaml) | TelcoSMS (Angola) | SMS | Local Angola | **Bloqueado — exigir endpoint HTTPS oficial** |
| [`media_twilio_sms_whatsapp.yaml`](media_twilio_sms_whatsapp.yaml) | Twilio | SMS + WhatsApp | Internacional | Pronto |
| [`media_infobip_sms_whatsapp.yaml`](media_infobip_sms_whatsapp.yaml) | Infobip | SMS + WhatsApp | Internacional | Pronto |
| [`media_sms_mimo_twilio.yaml`](media_sms_mimo_twilio.yaml) | Mimo → Twilio | SMS com fallback automático | Local + Internacional | Pronto |

\* No WeSender o canal não é escolhido por envio — a plataforma distribui
conforme os canais ativos na conta (contratar WhatsApp com eles).

## Requisitos comuns (lado Zabbix)

- **Zabbix 6.0+** — os scripts usam `HttpRequest` e `btoa` do engine Duktape.
- Saída **HTTPS do Zabbix server** (o webhook executa no server) para o
  endpoint do provedor escolhido.
- Após importar: preencher os parâmetros `<PREENCHER_*>` do media type.
- **Media do usuário** (Users → Media → Add):
  - *Send to*: número em `9XXXXXXXX`, `2449XXXXXXXX` ou `+2449XXXXXXXX`.
    Nos integradores Twilio/Infobip, o prefixo `whatsapp:` no Send to força
    o canal WhatsApp (ex.: `whatsapp:+244923000000`).
  - *When active*: para o requisito de fim de semana do BPC use
    `6-7,00:00-24:00` (sábado+domingo); `1-7,00:00-24:00` para sempre.
  - *Use severity*: marcar só High/Disaster para poupar créditos.
- **Action** (Alerts → Actions → Trigger actions) com escalation: ex. passo 1
  e-mail; passo 2 (após 10 min sem acknowledge) SMS/WhatsApp.
- **Teste**: botão *Test* do media type; logs no server com `DebugLevel=4`
  (prefixos `[Mimo SMS]`, `[Twilio ...]`, `[WeSender]`, `[TelcoSMS]`,
  `[Infobip ...]`).

## Canal WhatsApp — regra que vale para Twilio e Infobip

Alertas são mensagens **business-initiated**: fora de uma janela de sessão de
24h, a Meta só entrega **templates aprovados**. Portanto:

1. Criar na plataforma (Twilio Content ou portal Infobip) um template com um
   único placeholder, ex.: `Alerta Zabbix: {{1}}`, e submeter à aprovação Meta.
2. Preencher `twilio_content_sid` (Twilio) ou `whatsapp_template` +
   `whatsapp_language` (Infobip) no media type.
3. Sem template configurado, os scripts enviam texto livre — que **só chega**
   se o destinatário tiver interagido com o número nas últimas 24h.

No WeSender essa complexidade fica do lado deles (conta com canal WhatsApp
ativo) — confirmar condições comerciais.

## Checklist por provedor

### Mimo (Backbone)
- [ ] Confirmar se o BPC já tem conta (BPC é cliente listado em mimo.it.ao)
- [ ] Pedir spec oficial da API HTTP + ambiente de testes
      (suporte@backbone.it.ao / +244 943 33 33 33)
- [ ] Validar host (`mimo_host`), token e sender ID
- [ ] Confirmar se a API devolve 200 com erro no corpo (endurecer script)

### WeSender (Digital Factory)
- [ ] Criar conta (10 SMS grátis) e testar
      (suportewesender@digitalfactory.co.ao / +244 945 953 197)
- [ ] Cotar canal WhatsApp e volumes
- [ ] Gerar ApiKey e preencher `wesender_apikey`

### TelcoSMS
- [ ] **Exigir endpoint HTTPS/hostname oficial** — o endpoint público
      conhecido é IP direto sem TLS com credenciais na query string:
      inaceitável para banco sem correção
      (suporte@telcosms.co.ao / +244 940 620 227)
- [ ] Confirmar formato do `recipient` e resposta da API
- [ ] Alternativa imediata sem código: serviço **E2S** (e-mail-para-SMS)
      usando o media type Email nativo do Zabbix

### Twilio
- [ ] Conta paga + habilitar Angola em Messaging **Geo Permissions**
- [ ] SMS: definir `twilio_from_sms` (número ou sender ID alfanumérico)
- [ ] WhatsApp: sender aprovado + template aprovado (`twilio_content_sid`)

### Infobip
- [ ] Obter `base_url` próprio da conta + API key com scopes de SMS/WhatsApp
- [ ] Acordar sender ID SMS com o account manager
- [ ] WhatsApp: sender + template aprovados no portal

## Estratégia recomendada (BPC)

Cadeia com redundância local→internacional: **Mimo (primário) → WeSender
(2º local) → Twilio (internacional)**. O arquivo `media_sms_mimo_twilio.yaml`
já implementa Mimo→Twilio num único media type; os integradores individuais
permitem testar/homologar cada provedor isoladamente antes de compor a cadeia
final. WhatsApp entra por Twilio/Infobip (template aprovado) ou WeSender
(gerido pela plataforma).
