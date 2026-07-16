# Provedores de SMS em Angola — levantamento para notificações Zabbix (BPC)

Pesquisa: julho/2026. Objetivo: alternativas de gateway SMS integráveis ao
media type Webhook do Zabbix (chamada HTTP a partir do Zabbix server).

## 1. Provedores locais (Angola)

### Mimo (Backbone, Lda) — Luanda
- Site: https://www.mimo.it.ao · suporte@backbone.it.ao · +244 943 33 33 33
- **BPC já aparece como cliente no site** (junto com BNA, TAAG, Worten...).
- API HTTP: `POST {host}/mimosms/v1/message/send?token={token}` com JSON
  `{sender, recipients, text}` — não documentada publicamente (levantada via
  biblioteca comunitária [python-mimo-sms](https://github.com/jocaetano1/python-mimo-sms)).
  Pedir spec oficial à Backbone.
- Integração Zabbix: **pronta neste repositório** (`media_sms_mimo_twilio.yaml`).

### TelcoSMS — telcosms.co.ao
- geral@telcosms.co.ao · suporte@telcosms.co.ao · +244 947 192 732 / +244 940 620 227
- Serviços: Bulk SMS, **E2S (e-mail-para-SMS)**, "SMS Corporativa" com API para
  ERP/CRM, suporte 24x7.
- **Preços públicos em Kwanza** (por SMS, degressivo por volume):
  | Volume | AOA/SMS |
  |---|---|
  | 1–50.000 | 11,00 |
  | 50.001–150.000 | 9,25 |
  | 150.001–1M | 8,00 |
  | 1M–6M | 6,99 |
  | 6M–7M | 5,00 |
- API mencionada mas sem documentação pública — pedir spec.
- Nota: o E2S permite integração imediata via media type **e-mail** do Zabbix
  (sem webhook), útil como rota de contingência de implantação rápida.

### WeSender (Digital Factory Angola) — wesender.co.ao
- suportewesender@digitalfactory.co.ao · +244 945 953 197
- Multicanal: **SMS + WhatsApp + Facebook Messenger** na mesma API.
- **API pública e documentada** (https://www.wesender.co.ao/devs.html):
  - `POST https://api.wesender.co.ao/envio/apikey`
  - Corpo JSON: `{ApiKey, Destino: ["929000000", ...], Mensagem, CEspeciais}`
  - Resposta: `{Exito: true, Mensagem: "...", Objeto: {...}}`
  - Autenticação só pela ApiKey no corpo.
- É a API local mais simples de integrar no webhook do Zabbix (documentação
  aberta, sem login/token dinâmico). 10 SMS grátis no registo para teste.
- Ponto forte extra: caminho natural para o canal **WhatsApp** depois.

### NexaSMS — nexasms.vercel.app
- API SMS para o mercado angolano: API key, preços em Kwanza, sender ID
  com nome da empresa, exemplos em cURL/JS/PHP/Python.
- **Ressalvas**: hospedado em subdomínio vercel.app (sem domínio próprio),
  site retornou 404 durante a pesquisa. Maturidade/continuidade duvidosa —
  **não recomendado para um banco** sem due diligence forte.

### SMS Marketing Angola — smsmarketingangola.com
- **Site fora do ar durante a pesquisa (DNS não resolve).** Descartar ou
  verificar se a empresa ainda opera.

## 2. Direto nas operadoras (produtos corporativos)

As três operadoras vendem bulk SMS corporativo diretamente. Vantagem: rota
100% on-net e contrato local; desvantagem: processo comercial mais lento e
API (quando existe) só revelada após contato comercial.

| Operadora | Produto/Canal | Contato |
|---|---|---|
| **Unitel** (~72% do mercado) | "SMS Bulk" (Unitel Empresas) | Linha grátis **19300** |
| **Africell** (~24%) | "SMS Bulk" empresarial — sem API mencionada no site | **360** · corporate.sales@africell.ao |
| **Movicel** (~4%) | Planos Empresa (voz+SMS+dados) | **19191** · ApoioPME@movicel.co.ao · grandescontas@movicel.co.ao |

Nota: como a Unitel detém ~72% do mercado, se os destinatários dos alertas
forem todos Unitel, o produto corporativo da Unitel cobre o caso com rota
direta. Perguntar na reunião comercial se expõem API HTTP/SMPP.

## 3. Agregadores internacionais com cobertura em Angola (referência)

| Provedor | Preço indicativo | Observação |
|---|---|---|
| Twilio | tabela pública (USD) | Fallback já implementado no nosso media type; habilitar Angola nas Geo Permissions |
| Infobip | ~US$ 0,098/SMS | Enterprise; mesma conta serve WhatsApp |
| Vonage | tabela pública | Tem página de restrições específica de Angola |
| D7 Networks / EasySendSMS / BudgetSMS / SMS.to / SMSPM / Releans / Afilnet / Messaggio | € 0,035+ | Rotas mais baratas = risco de gray route; testar entrega real na Unitel/Africell/Movicel antes de confiar |

## 4. Leitura para o caso BPC

1. **Mimo** continua o melhor candidato primário (relação existente com o BPC,
   rota local) — pendente confirmação da spec HTTP com a Backbone.
2. **WeSender** é o plano B local mais forte: API documentada e aberta, fácil
   de adicionar como segundo fallback no mesmo script do webhook
   (Mimo → WeSender → Twilio).
3. **TelcoSMS** vale cotação pelo preço público em AOA e pelo E2S (integração
   por e-mail sem código, boa contingência).
4. **Unitel SMS Bulk** vale uma consulta comercial (19300) se a rota on-net
   direta for prioridade para números Unitel.
5. Evitar NexaSMS (maturidade) e SMS Marketing Angola (site off) por ora.

## Fontes

- https://www.mimo.it.ao/en/ · https://www.mimo.it.ao/en/developers
- https://github.com/jocaetano1/python-mimo-sms
- https://telcosms.co.ao/
- https://www.wesender.co.ao/ · https://www.wesender.co.ao/devs.html
- https://nexasms.vercel.app/
- https://www.africell.ao/en/business-en/sms-bulk/
- https://x.com/unitelao/status/1966037745601495439 (Unitel SMS Bulk, 19300)
- https://messaggio.com/messaging/carriers/angola/movicel/
- https://www.twilio.com/en-us/sms/pricing/ao · https://www.twilio.com/en-us/guidelines/ao/sms
- https://www.infobip.com/docs/api/channels/sms/outbound-sms/send-sms-message
- https://api.support.vonage.com/hc/en-us/articles/204018103-Angola-SMS-Features-and-Restrictions
