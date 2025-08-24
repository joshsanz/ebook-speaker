#!/bin/bash

# Graceful shutdown handler
cleanup() {
    echo "🔄 Received shutdown signal, gracefully stopping..."
    # Send SIGTERM to the uvicorn process
    if [[ -n "$uvicorn_pid" ]]; then
        kill -TERM "$uvicorn_pid" 2>/dev/null
        echo "⏳ Waiting for uvicorn to finish..."
        
        # Wait up to 25 seconds for graceful shutdown
        for i in {1..25}; do
            if ! kill -0 "$uvicorn_pid" 2>/dev/null; then
                echo "✅ Uvicorn stopped gracefully"
                break
            fi
            sleep 1
        done
        
        # Force kill if still running
        if kill -0 "$uvicorn_pid" 2>/dev/null; then
            echo "⚠️  Force killing uvicorn"
            kill -KILL "$uvicorn_pid" 2>/dev/null
        fi
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

echo "🚀 Starting TTS service with graceful shutdown handling..."

# Start uvicorn in the background
uvicorn main:app --host 0.0.0.0 --port 5005 --workers 1 --timeout-graceful-shutdown 30 &
uvicorn_pid=$!

echo "📡 Uvicorn started with PID: $uvicorn_pid"

# Wait for uvicorn to finish
wait "$uvicorn_pid"
exit_code=$?

echo "🏁 TTS service stopped with exit code: $exit_code"
exit $exit_code