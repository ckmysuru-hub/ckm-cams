# Deploy CKM CAMS on Oracle Cloud Always Free

This deployment uses one OCI Always Free Ampere A1 VM, Docker Compose, MongoDB in a private container, and Caddy for automatic HTTPS.

## 1. Create the VM

1. Create an Oracle Cloud account and choose a home region.
2. Create an Ampere A1 Ubuntu VM. Use an Always Free eligible shape and a boot volume large enough for Docker images, MongoDB, and backups.
3. Add your SSH public key.
4. In the VM security list or NSG, allow:
   - TCP `22` from your IP only
   - TCP `80` from the internet
   - TCP `443` from the internet
5. Do not open MongoDB port `27017`.

## 2. Point DNS

Create an `A` record for your app domain, for example `cams.example.com`, pointing to the VM public IPv4 address.

## 3. Install Docker

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

## 4. Configure the app

```bash
git clone https://github.com/ckmysuru-hub/ckm-cams.git
cd ckm-cams
cp .env.prod.example .env
```

Edit `.env`:

- Set `APP_DOMAIN` to the DNS name.
- Set a strong `JWT_SECRET` with at least 32 random characters.
- Set a strong temporary `ADMIN_PASSWORD`; change it after first login.
- Fill academy, email, and WhatsApp settings only if needed.

## 5. Start production

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

Caddy will request and renew HTTPS certificates automatically once DNS points to the VM and ports `80`/`443` are reachable.

## 6. Verify

```bash
set -a
. ./.env
set +a
curl -fsS "https://$APP_DOMAIN/api/health"
```

Then open `https://$APP_DOMAIN`, log in, and verify:

- dashboard loads
- student creation works
- invoice and receipt PDFs open
- logout/login works after a browser refresh

## 7. Backups

Create a local backup folder:

```bash
mkdir -p ~/cams-backups
```

Run an on-demand backup:

```bash
set -a
. ./.env
set +a
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongodump --archive --gzip --db "$DB_NAME" > ~/cams-backups/ckm-cams-$(date +%F).archive.gz
```

Add a cron job on the VM:

```bash
crontab -e
```

Example daily backup at 2:15 AM:

```cron
15 2 * * * cd /home/ubuntu/ckm-cams && set -a && . ./.env && set +a && docker compose -f docker-compose.prod.yml exec -T mongo mongodump --archive --gzip --db "$DB_NAME" > /home/ubuntu/cams-backups/ckm-cams-$(date +\%F).archive.gz
```

Periodically copy backups off the VM and test restore before relying on them.

## 8. Update the app

```bash
cd ~/ckm-cams
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

## 9. Restore from backup

```bash
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongorestore --archive --gzip --drop < ~/cams-backups/ckm-cams-YYYY-MM-DD.archive.gz
```
