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

3. Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

## Configuration

Edit `.env` with your settings:

| Variable         | Description                                      | Default        |
|------------------|--------------------------------------------------|----------------|
| `PORT`           | Port the server listens on                       | `9000`         |
| `ROOT_DIR`       | Absolute path to the directory to expose         | `/home/jacob`  |
| `PASSWORD`       | Login password for the web UI                    | *(required)*   |
| `SESSION_SECRET` | Secret key used to sign session cookies          | *(required)*   |

Example `.env`:

```
PORT=9000
ROOT_DIR=/home/youruser
PASSWORD=yourpassword
SESSION_SECRET=some-long-random-string
```

## Running

```bash
node server.js
```

Then open `http://localhost:9000` (or your configured port) in a browser.

## Project Structure

```
files/
├── public/
│   └── index.html       # Browser UI (single-page app)
├── server.js            # Express server and API routes
├── package.json
├── .env                 # Your local config (gitignored)
└── .env.example         # Config template
```
