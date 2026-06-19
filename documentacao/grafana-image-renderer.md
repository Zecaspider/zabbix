# Grafana Image Renderer — Instalação

> Necessário para: geração de screenshots PNG via API (`/render/d/...`),  
> alertas com imagem, e envio de screenshots pelo Claude no mobile.

## Instalar no servidor Grafana (Linux)

```bash
# Como root ou com sudo
grafana-cli plugins install grafana-image-renderer
systemctl restart grafana-server
```

## Verificar instalação

```bash
grafana-cli plugins ls | grep renderer
# deve aparecer: grafana-image-renderer
```

Ou via API:
```
GET http://10.10.126.22:3000/api/plugins/grafana-image-renderer/settings
# 200 OK = instalado
```

## Dependências do sistema (Ubuntu/Debian)

O renderer usa Chromium headless — instalar antes:

```bash
apt-get install -y \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxi6 libxrender1 libxtst6 \
  libglib2.0-0 libnss3 libcups2 libdbus-1-3 libxss1 libxrandr2 \
  libgtk-3-0 libasound2 libpangocairo-1.0-0 libatk1.0-0 \
  libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libgbm1
```

## Após instalação — testar render

```
GET http://10.10.126.22:3000/render/d/31bace26-1af8-4b82-a6c1-f5c9116f4b83/n3-rede-wan-carriers?orgId=1&from=now-6h&to=now&width=1400&height=900
Authorization: Bearer <token>
```

Deve devolver `image/png` (actualmente devolve erro "No image renderer available").
