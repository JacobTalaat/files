# FILES

A self-hosted web file manager with a React frontend and an Express filesystem API. It is designed for simple VPS deployment behind Docker and a reverse proxy.

## Features

- Browse directories, navigate breadcrumbs, and switch between list/grid explorer views
- Upload files and folders
- Download files, folders, or batch selections
- Preview and edit text files in-browser
- Preview images, video, audio, and PDFs
- Create folders, rename items, delete items, and batch delete
- Transfers, security, disk usage, metadata, and terminal activity panels

## Requirements

- Node.js 18+ for local development
- Docker and Docker Compose for container deployment

## Local Development

1. Clone the repository:

```bash
git clone https://github.com/JacobTalaat/files.git
cd files
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the project root:

```env
PORT=9000
ROOT_DIR=/home/youruser
BOOKMARKS=/,/Documents,/Downloads
```

4. Build the frontend bundle:

```bash
npm run build
```

5. Start the server:

```bash
npm start
```

6. Open the app:

```text
http://localhost:9000
```

## Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | Port the server listens on | `9000` |
| `ROOT_DIR` | Absolute path to the directory exposed by the file manager | required |
| `BOOKMARKS` | Comma-separated sidebar bookmarks under `ROOT_DIR` | auto-generated if empty |
The server requires `ROOT_DIR`.

## Docker

The container build compiles the React frontend and then installs only production runtime dependencies in the final image.
The checked-in Compose file binds to loopback by default so the app is not directly exposed before a reverse proxy is configured.

### Run with Compose

Edit `docker-compose.yml` before starting:

```yaml
services:
  jacob-files:
    build: .
    ports:
      - "127.0.0.1:9000:9000"
    environment:
      PORT: "9000"
      ROOT_DIR: "/data"
    volumes:
      - /home/youruser/files-data:/data
```

Start it:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f
```

Stop it:

```bash
docker compose down
```

## VPS Setup

This is the recommended production path.

### 1. Install Docker

On Ubuntu:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable --now docker
```

### 2. Clone the repository

```bash
git clone https://github.com/JacobTalaat/files.git ~/jacob-files
cd ~/jacob-files
```

### 3. Create the data directory you want to manage

```bash
mkdir -p /home/jacob/files-data
```

### 4. Edit `docker-compose.yml`

Use loopback binding so the app is only reachable through a reverse proxy:

```yaml
services:
  jacob-files:
    build: .
    ports:
      - "127.0.0.1:9000:9000"
    environment:
      PORT: "9000"
      ROOT_DIR: "/data"
    volumes:
      - /home/jacob/files-data:/data
```

### 5. Start the app

```bash
sudo docker compose up -d --build
```

Verify:

```bash
sudo docker compose ps
sudo docker compose logs --tail=50
```

### 6. Put it behind HTTPS

Do not expose the app directly over plain HTTP on the public internet.

#### Caddy example

Install Caddy:

```bash
sudo apt install -y caddy
```

Set `/etc/caddy/Caddyfile`:

```caddy
files.example.com {
  reverse_proxy 127.0.0.1:9000
}
```

Restart Caddy:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

After HTTPS is working, restart the container:

```bash
sudo docker compose up -d
```

### 7. Open firewall ports

If you use `ufw`:

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Updating on the VPS

When you push changes to GitHub:

```bash
cd ~/jacob-files
git pull origin main
sudo docker compose down
sudo docker compose up -d --build
```

Then hard refresh the browser.

## Security Notes

- Files served through `/api/raw` now force downloads for active web content such as HTML, SVG, XML, JavaScript, and CSS.
- Inline raw responses remain intended for safe media/document preview cases like images, audio, video, and PDFs.
- Rename operations are limited to the current directory; cross-directory relocation should use the move action.
- The app no longer manages passwords, sessions, or cookies. Protect it with nginx auth, VPN, Tailscale, or network-level access controls if needed.

## Project Structure

```text
files/
├── public/
│   ├── index.html      # Static HTML entrypoint
│   ├── app.js          # Built React bundle
│   └── app.css         # Built frontend stylesheet
├── src/
│   ├── main.jsx        # React app entrypoint
│   └── styles.css      # Sovereign Console theme/styles
├── server/
│   ├── app.js          # Express app composition
│   ├── config.js       # Environment-backed config
│   ├── lib/
│   │   ├── errors.js
│   │   └── file-service.js
│   └── routes/
│       └── api.js
├── server.js           # Runtime entrypoint
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```
