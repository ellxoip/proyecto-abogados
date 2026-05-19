#!/bin/bash
set -e

# Resolve script directory so it works from any path
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

LF_DIR="/home/re00vs/Descargas/legal-finance-mvp-main"
ATI_DIR="/home/re00vs/At_informa-main"

echo "========================================"
echo " CRM Abogados Tributarios — 3 Sistemas"
echo "========================================"

# ── CRM Backend ──────────────────────────────────────────────────────────
echo ""
echo "[1/5] Iniciando CRM Backend (FastAPI + SQLite)..."
cd "$DIR/backend"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "  AVISO: Se creó .env desde .env.example — edítalo antes de producción."
fi

if [ ! -d venv ]; then
  echo "  Creando entorno virtual..."
  python3 -m venv venv
  ./venv/bin/pip install -r requirements.txt --quiet
fi

./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "  CRM Backend PID: $BACKEND_PID  →  http://localhost:8000"

# ── WhatsApp QR Service ───────────────────────────────────────────────────
echo ""
echo "[2/5] Iniciando WhatsApp QR Service (Node.js)..."
cd "$DIR/whatsapp-qr-service"

if [ ! -d node_modules ]; then
  npm install --legacy-peer-deps --silent
fi

fuser -k 3001/tcp 2>/dev/null || true
QR_SERVICE_PORT=3001 FASTAPI_URL=http://localhost:8000 MEDIA_BASE_URL=http://localhost:3001 node server.js &
QR_PID=$!
echo "  WhatsApp QR PID: $QR_PID  →  http://localhost:3001"

# ── CRM Frontend ──────────────────────────────────────────────────────────
echo ""
echo "[3/5] Iniciando CRM Frontend (React + Vite)..."
cd "$DIR/frontend"

if [ ! -d node_modules ]; then
  npm install --silent
fi

npm run dev -- --port 5173 --host &
FRONTEND_PID=$!
echo "  CRM Frontend PID: $FRONTEND_PID  →  http://localhost:5173"

# ── AT Informa ────────────────────────────────────────────────────────────
echo ""
echo "[4/5] Iniciando AT Informa (Next.js, puerto 3000)..."
if [ -d "$ATI_DIR" ]; then
  cd "$ATI_DIR"
  if [ ! -d node_modules ]; then
    npm install --silent
  fi
  npm run dev -- -p 3000 &
  ATI_PID=$!
  echo "  AT Informa PID: $ATI_PID  →  http://localhost:3000"
else
  echo "  AVISO: Directorio AT Informa no encontrado en $ATI_DIR"
  ATI_PID=""
fi

# ── Legal Finance ─────────────────────────────────────────────────────────
echo ""
echo "[5/5] Iniciando Legal Finance MVP (Next.js, puerto 4000)..."
if [ -d "$LF_DIR" ]; then
  cd "$LF_DIR"
  if [ ! -d node_modules ]; then
    npm install --silent
  fi
  npm run dev -- -p 4000 &
  LF_PID=$!
  echo "  Legal Finance PID: $LF_PID  →  http://localhost:4000"
else
  echo "  AVISO: Directorio Legal Finance no encontrado en $LF_DIR"
  LF_PID=""
fi

echo ""
echo "========================================"
echo " TODOS LOS SISTEMAS INICIADOS"
echo "========================================"
echo ""
echo "  CRM           →  http://localhost:5173"
echo "  CRM API       →  http://localhost:8000/docs"
echo "  WhatsApp QR   →  http://localhost:3001"
echo "  AT Informa    →  http://localhost:3000"
echo "  Legal Finance →  http://localhost:4000"
echo ""
echo "  Para detener todos: kill $BACKEND_PID $QR_PID $FRONTEND_PID ${ATI_PID:-} ${LF_PID:-}"
echo "========================================"
echo ""

wait
