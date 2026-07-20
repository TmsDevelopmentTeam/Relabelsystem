#!/usr/bin/env bash
# =============================================================
#  Bootstrap del VPS para Relabelsystem  (correr UNA sola vez)
#  Subdominio objetivo: relabel.tmslp-sys.com
#
#  Uso:
#    chmod +x bootstrap-vps.sh
#    sudo ./bootstrap-vps.sh
#
#  Despues de esto, cada 'git push' a main actualiza todo solo
#  via GitHub Actions.
# =============================================================
set -e

APP_DIR="/var/www/Relabelsystem"
REPO="https://github.com/TmsDevelopmentTeam/Relabelsystem.git"
DOMAIN="relabel.tmslp-sys.com"

echo "==> 1/6 Node 20 LTS + git"
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y git nginx

echo "==> 2/6 PM2 global"
command -v pm2 >/dev/null || npm install -g pm2

echo "==> 3/6 Clonar / actualizar repo en $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"
[ -f .env ] || cp .env.example .env

echo "==> 4/6 Dependencias + base de datos + build"
npm ci
npx prisma generate
npx prisma db push
npm run build

echo "==> 5/6 Arrancar con PM2 (nombre: relabelsystem)"
pm2 reload relabelsystem --update-env 2>/dev/null || pm2 start "npm run start" --name relabelsystem
pm2 save
pm2 startup systemd -u "$(whoami)" --hp "$HOME" | tail -1 || true

echo "==> 6/6 Nginx reverse proxy para $DOMAIN"
cp deploy/nginx-relabel.conf /etc/nginx/sites-available/relabel
ln -sf /etc/nginx/sites-available/relabel /etc/nginx/sites-enabled/relabel
nginx -t && systemctl reload nginx

echo ""
echo "============================================================="
echo " App corriendo. Falta SOLO el candado HTTPS (paso manual):"
echo ""
echo "   apt-get install -y certbot python3-certbot-nginx"
echo "   certbot --nginx -d $DOMAIN"
echo ""
echo " (El DNS de $DOMAIN debe apuntar ya a la IP de este VPS.)"
echo " Prueba HTTP: http://$DOMAIN"
echo "============================================================="
