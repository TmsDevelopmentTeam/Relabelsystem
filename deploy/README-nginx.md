# Configurar relabel.tmslp-sys.com en el VPS

Todo esto se corre **dentro del VPS** (SSH). Orden: DNS → app arriba → Nginx → HTTPS.

---

## 0. DNS (una sola vez, en tu proveedor de dominio)

Crea un registro **A**:

| Tipo | Nombre / Host | Valor |
|------|---------------|-------|
| A    | `relabel`     | (la IP pública de tu VPS) |

Verifica que ya propagó (debe devolver la IP del VPS):

```bash
dig +short relabel.tmslp-sys.com
```

---

## 1. App corriendo en el puerto 3000 (si aún no)

```bash
cd /var/www/Relabelsystem        # ajusta a tu ruta real
npm ci
npx prisma generate
npx prisma db push
npm run build
pm2 start "npm run start" --name relabelsystem
pm2 save
pm2 startup                      # copia/pega el comando que imprime

# Prueba local:
curl -I http://localhost:3000    # debe dar HTTP/1.1 200 OK
```

---

## 2. Nginx

```bash
# Sube el archivo de este repo (deploy/nginx-relabel.conf) al VPS y colócalo:
sudo cp deploy/nginx-relabel.conf /etc/nginx/sites-available/relabel
sudo ln -s /etc/nginx/sites-available/relabel /etc/nginx/sites-enabled/

# Valida y recarga
sudo nginx -t
sudo systemctl reload nginx
```

Prueba: `http://relabel.tmslp-sys.com` ya debería abrir la app (aún sin candado).

---

## 3. HTTPS gratis (Let's Encrypt)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d relabel.tmslp-sys.com
```

Certbot edita el Nginx solo, agrega el 443 y renueva automático.
Al terminar: **https://relabel.tmslp-sys.com** con candado. 🔒

---

## Comprobación final

```bash
curl -I https://relabel.tmslp-sys.com     # HTTP/2 200
pm2 status                                # relabelsystem: online
```
