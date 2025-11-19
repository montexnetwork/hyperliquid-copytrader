# Dashboard Deployment Guide

## Quick Deployment to DigitalOcean

Since you're already running the monitor on your DigitalOcean droplet with PM2, follow these steps to deploy the dashboard:

### 1. Push Code to Your Droplet

**Option A: Using Git**
```bash
# On your local machine
git add .
git commit -m "Add dashboard for snapshot visualization"
git push origin master

# On your DigitalOcean droplet
cd /root/copyscalper  # or wherever your project is
git pull origin master
```

**Option B: Using rsync**
```bash
# From your local machine
rsync -avz --exclude 'node_modules' --exclude 'dist' \
  /Users/jovinkenroye/Sites/copyscalper/ \
  root@YOUR_DROPLET_IP:/root/copyscalper/
```

### 2. Install Dependencies

```bash
# On your DigitalOcean droplet
cd /root/copyscalper
npm install
```

### 3. Open Firewall Port

```bash
# Allow port 3000 for dashboard access
sudo ufw allow 3000/tcp
sudo ufw status  # Verify it's open
```

### 4. Start Dashboard with PM2

**Option A: Start dashboard only**
```bash
pm2 start npm --name "copyscalper-dashboard" -- run dashboard
pm2 save
```

**Option B: Use ecosystem config (recommended)**
```bash
# This will manage both monitor and dashboard
pm2 delete all  # Stop existing processes
pm2 start ecosystem.config.js
pm2 save
```

### 5. Verify Dashboard is Running

```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs copyscalper-dashboard --lines 50

# Test locally on the droplet
curl http://localhost:3000/api/snapshots
```

### 6. Access Dashboard

Open your browser and go to:
```
http://YOUR_DROPLET_IP:3000
```

Replace `YOUR_DROPLET_IP` with your actual DigitalOcean droplet's IP address.

## PM2 Management Commands

```bash
# View all processes
pm2 list

# View dashboard logs
pm2 logs copyscalper-dashboard

# Restart dashboard
pm2 restart copyscalper-dashboard

# Stop dashboard
pm2 stop copyscalper-dashboard

# Monitor resources
pm2 monit

# Save current PM2 configuration
pm2 save
```

## Troubleshooting

### Dashboard not accessible from browser

1. **Check if server is running:**
   ```bash
   pm2 status
   pm2 logs copyscalper-dashboard
   ```

2. **Check if port is listening:**
   ```bash
   netstat -tulpn | grep 3000
   # or
   ss -tulpn | grep 3000
   ```

3. **Verify firewall:**
   ```bash
   sudo ufw status
   # Should show: 3000/tcp ALLOW Anywhere
   ```

4. **Check DigitalOcean firewall:**
   - Go to DigitalOcean dashboard
   - Navigate to Networking > Firewalls
   - Ensure inbound rule allows TCP port 3000

### No snapshot data showing

1. **Check if monitor is running:**
   ```bash
   pm2 logs copyscalper
   ```

2. **Verify snapshot files exist:**
   ```bash
   ls -la /root/copyscalper/data/
   # Should see snapshots-YYYY-MM-DD.jsonl files
   ```

3. **Check file permissions:**
   ```bash
   chmod 644 /root/copyscalper/data/snapshots-*.jsonl
   ```

### Port 3000 already in use

Change the port by setting environment variable:
```bash
# Edit ecosystem.config.js and change PORT in env section
# Or run manually:
PORT=8080 npm run dashboard
```

## Configuration

### Change Dashboard Port

Edit `ecosystem.config.js`:
```javascript
env: {
  NODE_ENV: 'production',
  PORT: '8080'  // Change to desired port
}
```

Then restart:
```bash
pm2 restart copyscalper-dashboard
```

Don't forget to open the new port in firewall:
```bash
sudo ufw allow 8080/tcp
```

## Security Considerations

Currently the dashboard has no authentication. Consider:

1. **Use a reverse proxy with authentication** (nginx + basic auth)
2. **Restrict access by IP** in firewall
3. **Use a VPN** to access the dashboard
4. **Set up HTTPS** with Let's Encrypt if you have a domain

For production use, it's recommended to add at least basic authentication.
