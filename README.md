# Jacob File Manager

A self-hosted, password-protected web file manager. Access and manage files on your server from any browser — no client software required.

## Features

- Browse directories and navigate the file tree
- Upload individual files or entire folders (preserving folder structure)
- Download files directly, or download folders as a `.zip` archive
- Preview text files in-browser
- Create folders, rename files/folders, delete files/folders
- Password-protected login with persistent session

## Requirements

- [Node.js](https://nodejs.org/) v16 or later

## Setup

1. Clone the repository:

```bash
git clone https://github.com/JacobTalaat/files.git
cd files
```

2. Install dependencies:

```bash
npm install
```

3. Build the production CSS bundle:

```bash
npm run build:css
```

4. Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

## Configuration

Edit `.env` with your settings:

| Variable                | Description                                                | Default       |
| ----------------------- | ---------------------------------------------------------- | ------------- |
| `PORT`                  | Port the server listens on                                 | `9000`        |
| `ROOT_DIR`              | Absolute path to the directory to expose                   | `/home/jacob` |
| `PASSWORD`              | Login password for the web UI                              | _(required)_  |
| `SESSION_SECRET`        | Secret key used to sign session cookies                    | _(required)_  |
| `SESSION_COOKIE_SECURE` | Set to `1` if behind HTTPS proxy                           | _(optional)_  |
| `BOOKMARKS`             | Comma-separated sidebar bookmarks (paths under `ROOT_DIR`) | _(optional)_  |

Example `.env`:

```
PORT=9000
ROOT_DIR=/home/youruser
PASSWORD=yourpassword
SESSION_SECRET=some-long-random-string
SESSION_COOKIE_SECURE=
BOOKMARKS=/,/Documents,/Downloads
```

## Running

```bash
npm start
```

Then open `http://localhost:9000` (or your configured port) in a browser.

## HTTPS / TLS (recommended)

Do **not** expose this app over plain HTTP on the public internet. Put it behind a reverse proxy that terminates TLS.

### Caddy (simple)

Example `Caddyfile`:

```
files.example.com {
  reverse_proxy 127.0.0.1:9000
}
```

Then set `SESSION_COOKIE_SECURE=1` in `.env` so cookies are marked `Secure`.

### Nginx (example)

```
server {
  listen 443 ssl;
  server_name files.example.com;

  location / {
    proxy_pass http://127.0.0.1:9000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

## Docker

Build and run with Compose:

```bash
docker compose up --build
```

## Project Structure

```
files/
├── public/
│   ├── index.html       # Browser UI (single-page app)
│   ├── app.js           # Frontend logic
│   ├── tailwind.css     # Compiled Tailwind CSS (build artifact)
│   └── tailwind.input.css
├── server.js            # Express server and API routes
├── package.json
├── .env                 # Your local config (gitignored)
└── .env.example         # Config template
```
