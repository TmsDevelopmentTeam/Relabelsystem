# Deploy al VPS con GitHub Actions

Cada vez que hagas `git push` a `main`, GitHub entra por SSH al VPS, baja el código,
compila y reinicia la app con PM2. La base de datos SQLite (`prisma/relabelsystem.db`)
vive **solo en el VPS** y nunca se sobreescribe (está en `.gitignore`).

---

## Paso 1 — Preparar el VPS (una sola vez)

Conéctate al VPS por SSH y corre:

```bash
# 1. Node 20 LTS (via NodeSource) — si ya tienes node, sáltalo
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. PM2 (mantiene la app viva y la relanza si el VPS reinicia)
sudo npm install -g pm2

# 3. Clonar el repo (usa la carpeta que quieras)
cd /var/www          # o /home/tu_usuario
git clone https://github.com/TmsDevelopmentTeam/Relabelsystem.git
cd Relabelsystem

# 4. Configurar el entorno y crear la base de datos
cp .env.example .env
npm ci
npx prisma generate
npx prisma db push        # crea prisma/relabelsystem.db vacía

# 5. Primer arranque manual
npm run build
pm2 start "npm run start" --name relabelsystem
pm2 save
pm2 startup               # copia y pega el comando que imprime (arranque automático al reboot)
```

La app queda escuchando en `0.0.0.0:3000`.

> **Importar los datos:** una vez arriba, abre `http://IP_DEL_VPS:3000/import`
> y sube el Excel del cliente. Los ~3,732 equipos quedan en la DB del VPS.

---

## Paso 2 — Llave SSH para que GitHub entre al VPS

En **tu máquina** (o en el propio VPS) genera un par de llaves **solo para el deploy**:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
```

Esto crea `deploy_key` (privada) y `deploy_key.pub` (pública).

En el **VPS**, autoriza la llave pública:

```bash
cat deploy_key.pub >> ~/.ssh/authorized_keys
```

---

## Paso 3 — Secrets en GitHub

En el repo → **Settings → Secrets and variables → Actions → New repository secret**.
Crea estos 6:

| Secret | Valor | Ejemplo |
|---|---|---|
| `VPS_HOST` | IP o dominio del VPS | `203.0.113.10` |
| `VPS_USER` | usuario SSH | `root` o `ubuntu` |
| `VPS_PORT` | puerto SSH | `22` |
| `VPS_SSH_KEY` | contenido de `deploy_key` (la **privada**, completa) | `-----BEGIN OPENSSH...` |
| `VPS_APP_DIR` | ruta donde clonaste el repo | `/var/www/Relabelsystem` |

> Copia la llave privada completa: `cat deploy_key` — incluye las líneas
> `-----BEGIN` y `-----END`.

---

## Paso 4 — Probar

Haz push a `main` (o ve a la pestaña **Actions** → **Deploy to VPS** → **Run workflow**).
En los logs verás cada paso hasta `==> Deploy OK`.

---

## Paso 5 (recomendado) — Nginx + HTTPS

Para servir por dominio con candado en vez de `IP:3000`:

```bash
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/relabel <<'EOF'
server {
  server_name relabel.tudominio.com;
  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
EOF
sudo ln -s /etc/nginx/sites-available/relabel /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# HTTPS gratis con Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d relabel.tudominio.com
```

---

## Backup de la base de datos

Es un solo archivo. Para respaldar:

```bash
cp /var/www/Relabelsystem/prisma/relabelsystem.db ~/backup-$(date +%F).db
```

O programa un cron diario. Para restaurar, solo copias el archivo de vuelta y
reinicias: `pm2 reload relabelsystem`.
