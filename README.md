# Relabelsystem

Sistema de reetiquetado para el proyecto **Telcel — Radiomovil Dipsa** (~3,732 equipos Dell). Web app con scanner USB, tablero matriz virtual y flujo de 4 pasos con verificación anti-error.

## Contexto

El operador reetiqueta laptops, monitores y CPUs. Cada equipo tiene:
- **Asset Tag** (SN físico Dell, ej. `1NZX0K4`) — viene impreso de fábrica
- **Inventario / Activo Fijo** (etiqueta a pegar, ej. `AM2150010001`, `EQR000002001`) — 12 caracteres

Se manejan 2 líneas de producción concurrentes que ven la misma DB en tiempo real.

## Flujo de 4 pasos

| Paso | Nombre | Qué escanea | Qué hace |
|---|---|---|---|
| ① | **TAG** | Asset Tag | Asigna cuadrante libre en el tablero (llenado vertical `A1..A10, B1..B10, …`) |
| ② | **PAIR** | Etiqueta grande (Inventario) | Le dice al operador en qué cuadrante ponerla junto con la pequeña — arma el paquete de etiquetas |
| ③ | **LABEL** | Asset Tag | Le dice qué cuadrante tiene el paquete listo; el operador etiqueta equipo + caja y el cuadrante se libera |
| ④ | **MATCH** | Pequeña + Asset Tag + Grande (3 scans) | Verificación triple; ✅ verde o 🚨 overlay rojo con sirena si no coincide |

## Stack

- **Next.js 15** (App Router) + React 18 + TypeScript
- **Prisma** + **SQLite** (archivo local, ~5MB con toda la data)
- **Tailwind CSS**
- **xlsx** para importar el Excel del cliente

## Setup local

```bash
git clone https://github.com/TmsDevelopmentTeam/Relabelsystem.git
cd Relabelsystem
npm install
cp .env.example .env
npx prisma db push
npm run dev
```

Abrir `http://localhost:3000`.

## Importar datos

1. `/import` → subir el Excel `Radiomovil Dipsa PO XXX_reporte activos.xlsx`
2. Se leen los sheets `Equipo computo central` (AM2150…) y `Equipo de respaldo` (EQR…)
3. Se importan ~3,732 equipos con su Asset Tag, Inventario y tipo (LAPTOP / MONITOR / DESKTOP)

## Uso multi-PC (2 líneas de producción)

Ambas PCs abren la misma URL (localhost si están en misma red, o el dominio público en producción). La DB es única y las operaciones son atómicas: si dos operadores escanean simultáneamente, no hay colisiones.

## Producción

### Build

```bash
npm run build
npm start
```

Server escucha en `0.0.0.0:3000` (accesible desde LAN o reverse proxy).

### Variables de entorno

Ver `.env.example`. La única obligatoria es `DATABASE_URL`.

### Persistencia

- **SQLite**: archivo `prisma/relabelsystem.db` — hacer backup con copia simple del archivo
- Alternativa: cambiar `provider = "mysql"` en `prisma/schema.prisma` para usar MariaDB/MySQL

### Deploy en un VPS con PM2 + Nginx

```bash
# En el VPS
git clone https://github.com/TmsDevelopmentTeam/Relabelsystem.git
cd Relabelsystem
npm ci --production=false
npx prisma generate
npx prisma db push
npm run build
pm2 start "npm run start" --name relabelsystem
```

Nginx reverse proxy:

```nginx
server {
  server_name relabel.<dominio>.com;
  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Y `certbot --nginx -d relabel.<dominio>.com` para HTTPS.

## Endpoints API

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/import` | Subir Excel del cliente |
| POST | `/api/paso1-tag` | Escanear Asset Tag (paso 1) |
| POST | `/api/paso2-pair` | Escanear etiqueta grande (paso 2) |
| POST | `/api/paso3-label` | Escanear Asset Tag para etiquetar (paso 3) |
| POST | `/api/paso4-match` | MATCH triple (paso 4) |
| POST | `/api/reset` | Reiniciar proceso (equipos vuelven a PENDING) |
| GET  | `/api/board` | Estado del tablero |
| GET  | `/api/stats` | KPIs y últimos eventos |
| GET  | `/api/export` | Descargar Excel con todos los estados |
| GET  | `/api/network` | IPs locales del server (para acceso multi-PC) |

## Scripts

- `npm run dev` — desarrollo (Next.js dev server en 0.0.0.0:3000)
- `npm run build` — build producción
- `npm start` — servir el build
- `npm run prisma:push` — sincronizar schema con la DB
- `npm run seed:reset` — reset completo de la DB

## Vida útil

Proyecto de emergencia para una entrega puntual de Telcel (~2-3 semanas). Al terminar el reetiquetado, la app puede archivarse o reciclarse para futuras entregas similares.

---

**Autor:** TMS Development Team
