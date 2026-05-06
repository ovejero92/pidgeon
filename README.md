# Pidgeon

Microservicio HTTP independiente para **enviar correos** vía [Resend](https://resend.com/). Pensado para reutilizarse desde cualquier proyecto (apps de turnos, ecommerce, APIs propias, etc.). Por defecto usa el dominio configurado en `DOMAIN` para el remitente `noreply@${DOMAIN}` (ejemplo: `turnosok.com`).

## Características

- `POST /send` — un destinatario; `from` opcional; `idempotencyKey` opcional (ventana 5 min en memoria).
- `POST /send-batch` — varios destinatarios; hasta **5 envíos en paralelo por segundo**.
- `GET /health` — estado y marca de tiempo ISO.
- Sin base de datos.
- **Rate limit**: máximo **10 correos por minuto por IP** (en `/send` cuenta 1; en `/send-batch` cuenta `recipients.length`).
- **CORS**: cualquier origen puede llamar a la API.
- **Reintentos**: un fallo de envío se reintenta **una vez** tras **2 segundos**.
- **Modo desarrollo**: si no hay `RESEND_API_KEY`, los envíos se **simulan** en consola.
- **Keep-alive**: ping interno a `/health` cada **10 minutos** (y uno a los **30 s** del arranque) usando `RENDER_EXTERNAL_URL`, `PUBLIC_URL` o `http://127.0.0.1:PORT`.

### Nota sobre Render (plan gratuito)

Los servicios gratuitos pueden **entrar en reposo** cuando no reciben tráfico. El ping interno ayuda **mientras el proceso está en ejecución**. Si el servicio se apaga por inactividad, hace falta una petición externa (usuario, otro cron gratuito como [cron-job.org](https://cron-job.org/), etc.) para despertarlo. Para disponibilidad garantizada sin cold starts, Render (y otros) suelen ofrecer tiers de pago.

## Requisitos

- Node.js **18+** (usa `fetch` nativo).

## Configuración local

```bash
cd backend-email-service
cp .env.example .env
# Edita .env: RESEND_API_KEY (opcional para mock), DOMAIN, PORT
npm install
npm start
```

En otra terminal:

```bash
npm test
```

Variables:

| Variable | Descripción |
|----------|-------------|
| `RESEND_API_KEY` | API key de Resend. Vacío → modo mock en consola. |
| `DOMAIN` | Dominio del remitente por defecto (`noreply@${DOMAIN}`). |
| `PORT` | Puerto (Render define `PORT` automáticamente). |
| `PUBLIC_URL` | URL pública opcional para keep-alive si no estás en Render. |

En Render, **`RENDER_EXTERNAL_URL`** se define solo en producción y el keep-alive la usa automáticamente.

## API

### `POST /send`

```json
{
  "to": "usuario@ejemplo.com",
  "subject": "Asunto",
  "html": "<p>Cuerpo HTML</p>",
  "from": "opcional@tudominio.com",
  "idempotencyKey": "opcional-misma-respuesta-5-min"
}
```

Respuesta: `{ "success": true, "messageId": "..." }` o `{ "success": false, "error": "..." }`.

### `POST /send-batch`

```json
{
  "recipients": ["a@b.com", "c@d.com"],
  "subject": "Asunto",
  "html": "<p>HTML</p>",
  "from": "opcional@tudominio.com"
}
```

Respuesta incluye `sent`, `failed`, `results` por destinatario.

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-05-06T12:00:00.000Z" }
```

## Obtener API key de Resend

1. Crea cuenta en [https://resend.com](https://resend.com).
2. En el dashboard: **API Keys** → crear clave.
3. Verifica tu dominio en Resend (registros DNS); el microservicio **no** valida el dominio por ti.

Plan gratuito: hasta **3.000 correos/mes** (consulta límites actuales en su web).

## Despliegue en Render (gratis)

1. Sube este repo a GitHub/GitLab (o conecta el repo local).
2. En [Render](https://render.com): **New** → **Web Service**.
3. Conecta el repositorio y selecciona la carpeta raíz `backend-email-service` si el mono-repo contiene más cosas (Root Directory en Render).
4. Configuración sugerida:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Environment**:
   - `RESEND_API_KEY` = tu clave
   - `DOMAIN` = `turnosok.com` (o el dominio que uses)
   - `NODE_ENV` = `production` (opcional)
6. Crear servicio. Render asignará `PORT` y `RENDER_EXTERNAL_URL`.

### Docker (opcional)

```bash
docker build -t pidgeon .
docker run -p 3000:3000 -e DOMAIN=turnosok.com -e RESEND_API_KEY=re_xxx pidgeon
```

## Licencia

MIT
