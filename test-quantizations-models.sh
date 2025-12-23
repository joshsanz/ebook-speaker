#!/bin/bash

set -e

echo "Testing Kokoro quantizations..."
quantizations=("" _fp16 _quantized _q4 _q4f16 _q8f16 _uint8 _uint8f16)
for quant in "${quantizations[@]}"; do
    model_file="model${quant}.onnx"
    echo "  testing ${model_file}"
    if [[ "$(uname -s)" == "Darwin" ]]; then
        sed -i '' "s/TTS_MODEL_FILE=\"[^\"]*\"/TTS_MODEL_FILE=\"${model_file}\"/" docker-compose.yml
    else
        sed -i "s/TTS_MODEL_FILE=\"[^\"]*\"/TTS_MODEL_FILE=\"${model_file}\"/" docker-compose.yml
    fi
    docker compose up -d --build tts-service
    sleep 5
    log_suffix="${quant:-base}"
    node ./test-tts-realtime-factor.js 2>&1 | tee "rtf-${log_suffix}.log"
done

echo "Testing supersonic..."
echo "TBD!"
