# BugPixel - Production Deployment Guide

## Architecture

```
Client Website (any domain)
  └─ <script src="https://portal.yourdomain.com/inspector/inspector.js">
       (stays inert for anonymous visitors)

Browser (Portal UI)
  └─ https://portal.yourdomain.com
       React SPA + API (single Node.js process)

Server (VPS)
  ├─ Node.js 22.5+
  ├─ SQLite (data/portal.db)
  ├─ Caddy (TLS + reverse proxy)
  └─ systemd (process manager)

Storage
  └─ Cloudflare R2 (screenshots + attachments)
```

## Prerequisites

- A VPS (DigitalOcean, Hetzner, Linode - $6-12/month is sufficient)
- A domain (e.g. `portal.yourdomain.com`)
- DNS A record pointing to your VPS IP
- Cloudflare account (for R2 storage)

## Step 1: Server Setup

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Install Node.js 22 (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Caddy (automatic TLS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Create app user
sudo useradd -m -s /bin/bash bugpixel
sudo su - bugpixel
```

## Step 2: Deploy Code

```bash
# As bugpixel user
cd ~
git clone https://github.com/CloudGenZ-Projects/bugpixel.git
cd bugpixel
npm install
npm run build
npm run build:inspector --workspace packages/frontend
```

## Step 3: Cloudflare R2 Setup

1. Go to Cloudflare Dashboard → R2 → Create bucket → Name: `bugpixel-storage`
2. Go to R2 → Manage R2 API Tokens → Create API token
   - Permissions: Object Read & Write
   - Specify bucket: `bugpixel-storage`
3. Save the Access Key ID and Secret Access Key

## Step 4: Environment Configuration

```bash
# Create env file
cat > /home/bugpixel/.env << 'EOF'
NODE_ENV=production
PORT=3000
CRP_DB_PATH=/home/bugpixel/data/portal.db
CRP_STORAGE_ROOT=/home/bugpixel/data/storage
CRP_INSPECTOR_SECRET=GENERATE_WITH_openssl_rand_-hex_32
CRP_SPA_DIR=/home/bugpixel/bugpixel/packages/frontend/dist
CRP_INSPECTOR_DIR=/home/bugpixel/bugpixel/packages/frontend/dist-inspector

# R2 Storage
CRP_R2_ACCOUNT_ID=your_cloudflare_account_id
CRP_R2_ACCESS_KEY=your_r2_access_key_id
CRP_R2_SECRET_KEY=your_r2_secret_access_key
CRP_R2_BUCKET=bugpixel-storage
EOF

# Generate the secret
sed -i "s/GENERATE_WITH_openssl_rand_-hex_32/$(openssl rand -hex 32)/" /home/bugpixel/.env

# Create data directory
mkdir -p /home/bugpixel/data
```

## Step 5: Seed Database

```bash
cd /home/bugpixel/bugpixel
source /home/bugpixel/.env
# Change default passwords!
CRP_SEED_ADMIN_EMAIL=you@yourdomain.com \
CRP_SEED_ADMIN_PASSWORD=your-secure-admin-password \
CRP_SEED_CLIENT_EMAIL=client@theirdomain.com \
CRP_SEED_CLIENT_PASSWORD=their-secure-password \
node packages/backend/dist/seed.js
```

## Step 6: Systemd Service

```bash
sudo tee /etc/systemd/system/bugpixel.service << 'EOF'
[Unit]
Description=BugPixel Change Request Portal
After=network.target

[Service]
Type=simple
User=bugpixel
WorkingDirectory=/home/bugpixel/bugpixel
EnvironmentFile=/home/bugpixel/.env
ExecStart=/usr/bin/node packages/backend/dist/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable bugpixel
sudo systemctl start bugpixel

# Verify it's running
sudo systemctl status bugpixel
curl http://localhost:3000/api/auth/me  # Should return 401
```

## Step 7: Caddy Reverse Proxy (Automatic HTTPS)

```bash
sudo tee /etc/caddy/Caddyfile << 'EOF'
portal.yourdomain.com {
    reverse_proxy localhost:3000

    # Security headers (app already sets these, but belt + suspenders)
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy no-referrer
    }
}
EOF

sudo systemctl reload caddy
```

Caddy automatically provisions a Let's Encrypt TLS certificate. Done.

## Step 8: Inject Inspector on Client Websites

On each client website, add before `</body>`:

```html
<script
  src="https://portal.yourdomain.com/inspector/inspector.js"
  data-portal-origin="https://portal.yourdomain.com"
  data-website-id="THE_WEBSITE_ID_FROM_PORTAL"
></script>
```

The Website ID comes from the portal's database (visible in admin panel or via the seed output).

## Step 9: Cross-Origin Setup (client sites on different domains)

**No extra configuration needed in v2.** The portal automatically allows cross-origin
requests from any registered website URL (derived from the `website` table, cached 60s).

When you add a website in the admin panel (e.g. `https://clientsite.com`), its origin
is automatically CORS-allowed. Cookies are already `SameSite=None; Secure`, so the
inspector works cross-origin out of the box.

Just ensure:
- The portal runs behind HTTPS (Caddy handles this)
- The client website loads the inspector script from the portal's HTTPS URL

---

## Updating

```bash
cd /home/bugpixel/bugpixel
git pull
npm install
npm run build
npm run build:inspector --workspace packages/frontend
sudo systemctl restart bugpixel
```

## Backup

```bash
# Database backup (run daily via cron)
cp /home/bugpixel/data/portal.db /home/bugpixel/backups/portal-$(date +%Y%m%d).db
```

R2 storage is durable by default (11 nines). No backup needed for blobs.

## Monitoring

```bash
# Logs
sudo journalctl -u bugpixel -f

# Health check (add to uptime monitor)
curl -sf https://portal.yourdomain.com/api/auth/me > /dev/null && echo "UP" || echo "DOWN"
```

## Cost Estimate

| Item | Monthly Cost |
|------|-------------|
| VPS (2GB RAM) | $6-12 |
| Domain | ~$1 (amortized) |
| R2 storage (10GB free tier) | $0 |
| R2 operations (10M free/month) | $0 |
| Caddy + Let's Encrypt | $0 |
| **Total** | **~$7-13/month** |
