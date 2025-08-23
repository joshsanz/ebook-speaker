#!/usr/bin/env python3
"""
Simple script to run the TTS service
"""
import uvicorn
import sys
import os

# Add current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("🚀 Starting TTS Service...")
    print("📍 API will be available at: http://localhost:5005")
    print("📚 Documentation at: http://localhost:5005/docs")
    print("🔄 Health check at: http://localhost:5005/health")
    print("Press CTRL+C to stop")

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5005,
        reload=True,
        log_level="info"
    )
