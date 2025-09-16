# GPU Acceleration Setup

This directory contains Docker configurations for building the TTS service with GPU acceleration support.

## Available Build Variants

### 1. CPU-only (Default)
- **Files**: `Dockerfile`, `docker-compose.yml`
- **Usage**: Standard CPU-based inference
- **Build**: `./build.sh cpu`

### 2. NVIDIA CUDA GPU
- **Files**: `Dockerfile.cuda`, `docker-compose.cuda.yml`
- **Usage**: GPU acceleration on NVIDIA cards
- **Build**: `./build.sh cuda`
- **Requirements**:
  - NVIDIA GPU with CUDA support
  - NVIDIA Docker runtime (`nvidia-container-toolkit`)
  - CUDA 12.6 compatible driver

### 3. Apple CoreML
- **Files**: `Dockerfile.coreml`, `docker-compose.coreml.yml`
- **Usage**: Neural Engine acceleration on Apple Silicon
- **Build**: `./build.sh coreml`
- **Requirements**:
  - Apple Silicon Mac (M1/M2/M3)
  - Docker Desktop for Mac

## Quick Start

### CUDA GPU Setup

1. **Install NVIDIA Container Toolkit**:
   ```bash
   # Ubuntu/Debian
   distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
   curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
   curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
   sudo systemctl restart docker
   ```

2. **Build and Run**:
   ```bash
   ./build.sh cuda
   docker-compose -f docker-compose.cuda.yml up
   ```

### CoreML Setup

1. **Build and Run** (on Apple Silicon Mac):
   ```bash
   ./build.sh coreml
   docker-compose -f docker-compose.coreml.yml up
   ```

## Build Script Usage

```bash
./build.sh [cpu|cuda|coreml] [--no-cache] [--push]
```

**Examples**:
- `./build.sh cuda` - Build CUDA variant
- `./build.sh cpu --no-cache` - Build CPU variant without cache
- `./build.sh coreml --push` - Build CoreML variant and push to registry

## Performance Comparison

| Variant | Build Time | Runtime Performance | Memory Usage | Hardware Required |
|---------|------------|-------------------|---------------|------------------|
| CPU     | ~10 min    | Baseline         | ~1GB         | Any x86_64       |
| CUDA    | ~45 min    | 3-5x faster      | ~2GB + VRAM  | NVIDIA GPU       |
| CoreML  | ~30 min    | 2-4x faster      | ~1.5GB       | Apple Silicon    |

## Troubleshooting

### CUDA Issues

1. **"CUDA provider not available"**:
   - Verify NVIDIA drivers: `nvidia-smi`
   - Check Docker runtime: `docker info | grep nvidia`
   - Restart Docker after installing nvidia-container-toolkit

2. **Out of memory errors**:
   - Reduce model precision in configuration
   - Increase Docker memory limits
   - Monitor GPU memory: `nvidia-smi -l 1`

### CoreML Issues

1. **"CoreML provider not available"**:
   - Ensure running on Apple Silicon hardware
   - Use `--platform linux/arm64` flag
   - Check Docker Desktop settings

2. **Slow performance**:
   - Verify Neural Engine availability
   - Check Activity Monitor for CPU/GPU usage
   - Ensure sufficient memory allocation

### General Build Issues

1. **Long build times**:
   - Building onnxruntime from source takes 30-60 minutes
   - Use Docker BuildKit for parallel builds
   - Consider using pre-built images for development

2. **Build failures**:
   - Ensure sufficient disk space (10GB+ recommended)
   - Check internet connection for source downloads
   - Review build logs for specific error messages

## Custom Configuration

### Environment Variables

- `NVIDIA_VISIBLE_DEVICES`: Control GPU visibility (CUDA)
- `OMP_NUM_THREADS`: Control CPU thread count
- `CUDA_VISIBLE_DEVICES`: Alternative GPU control

### Volume Mounts

```yaml
volumes:
  - ./models:/app/models:ro  # Model cache
  - ./logs:/app/logs         # Application logs
```

## Integration with Main Application

The GPU-accelerated TTS service integrates seamlessly with the main ebook-speaker application:

1. **Start TTS service** with desired acceleration:
   ```bash
   cd tts
   docker-compose -f docker-compose.cuda.yml up -d
   ```

2. **Start main application** (from project root):
   ```bash
   npm run dev
   ```

3. **Verify GPU acceleration** in TTS service logs:
   ```
   Using inference engines [('CUDAExecutionProvider', {...}), 'CPUExecutionProvider']
   ```