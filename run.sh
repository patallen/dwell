#!/bin/bash
cd "$(dirname "$0")"

trap 'kill 0' EXIT

cd daemon && source venv/bin/activate && python main.py &
cd frontend && npm run dev &

wait
