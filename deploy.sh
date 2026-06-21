#!/bin/bash
# ─────────────────────────────────────────────────────────────
# AskUp — GCP VM Deployment Script
# Run this on your Google Cloud VM after uploading the project
# ─────────────────────────────────────────────────────────────
set -e

echo "🚀 AskUp Deployment Script"
echo "================================"

# 1. Update system packages
echo "→ Updating system packages..."
sudo apt-get update -y

# 2. Install Docker
if ! command -v docker &> /dev/null; then
  echo "→ Installing Docker..."
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  echo "✓ Docker installed"
else
  echo "✓ Docker already installed"
fi

# 3. Install Docker Compose
if ! command -v docker compose &> /dev/null; then
  echo "→ Installing Docker Compose..."
  sudo apt-get install -y docker-compose-plugin
  echo "✓ Docker Compose installed"
else
  echo "✓ Docker Compose already installed"
fi

# 4. Build and start all services
echo "→ Building and starting services..."
sudo docker compose build --no-cache
sudo docker compose up -d

# 5. Wait for services to be healthy
echo "→ Waiting for services to start..."
sleep 10

# 6. Health checks
echo "→ Running health checks..."
if curl -sf http://localhost/health > /dev/null; then
  echo "✓ API Gateway healthy"
else
  echo "⚠ API Gateway may still be starting up"
fi

# 7. Open firewall port (GCP)
echo ""
echo "════════════════════════════════════"
echo "✓ Deployment complete!"
echo ""
echo "⚠  IMPORTANT: Ensure port 80 is open in your GCP firewall."
echo "   Run this gcloud command if needed:"
echo "   gcloud compute firewall-rules create allow-http \\"
echo "     --allow tcp:80 \\"
echo "     --target-tags http-server \\"
echo "     --description 'Allow HTTP traffic'"
echo ""
echo "   Or add the 'http-server' network tag to your VM."
echo ""
echo "   Access your app at: http://$(curl -sf http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip -H 'Metadata-Flavor: Google' 2>/dev/null || echo '<YOUR_VM_EXTERNAL_IP>')"
echo "════════════════════════════════════"
