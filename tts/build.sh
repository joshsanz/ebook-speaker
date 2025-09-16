#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print usage
usage() {
    echo "Usage: $0 [cpu|cuda|coreml] [--no-cache] [--push]"
    echo ""
    echo "Build variants:"
    echo "  cpu     - Standard CPU build (default)"
    echo "  cuda    - NVIDIA CUDA GPU acceleration"
    echo "  coreml  - Apple CoreML acceleration (ARM64)"
    echo ""
    echo "Options:"
    echo "  --no-cache  Don't use Docker build cache"
    echo "  --push      Push image to registry after build"
    echo ""
    echo "Examples:"
    echo "  $0 cuda              # Build CUDA variant"
    echo "  $0 cpu --no-cache    # Build CPU variant without cache"
    echo "  $0 coreml --push     # Build CoreML variant and push"
    exit 1
}

# Default values
BUILD_TYPE="cpu"
NO_CACHE=""
PUSH_IMAGE=false
IMAGE_TAG="tts-service"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        cpu|cuda|coreml)
            BUILD_TYPE="$1"
            shift
            ;;
        --no-cache)
            NO_CACHE="--no-cache"
            shift
            ;;
        --push)
            PUSH_IMAGE=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Error: Unknown argument '$1'${NC}"
            usage
            ;;
    esac
done

# Validate Docker and tools
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# CUDA-specific checks
if [[ "$BUILD_TYPE" == "cuda" ]]; then
    echo -e "${BLUE}Checking CUDA requirements...${NC}"
    if ! command -v nvidia-smi &> /dev/null; then
        echo -e "${YELLOW}Warning: nvidia-smi not found. CUDA runtime may not be available.${NC}"
    fi
    
    # Check for nvidia-container-runtime
    if ! docker info 2>/dev/null | grep -q nvidia; then
        echo -e "${YELLOW}Warning: NVIDIA Container Runtime not detected. GPU access may be limited.${NC}"
        echo -e "${YELLOW}Install nvidia-container-toolkit for full GPU support.${NC}"
    fi
fi

# Set build parameters based on type
case $BUILD_TYPE in
    "cpu")
        DOCKERFILE="Dockerfile"
        COMPOSE_FILE="docker-compose.yml"
        TAG_SUFFIX=""
        echo -e "${BLUE}Building CPU variant...${NC}"
        ;;
    "cuda")
        DOCKERFILE="Dockerfile.cuda"
        COMPOSE_FILE="docker-compose.cuda.yml"
        TAG_SUFFIX="-cuda"
        echo -e "${BLUE}Building CUDA variant...${NC}"
        ;;
    "coreml")
        DOCKERFILE="Dockerfile.coreml"
        COMPOSE_FILE="docker-compose.coreml.yml"
        TAG_SUFFIX="-coreml"
        echo -e "${BLUE}Building CoreML variant...${NC}"
        
        # Check platform
        if [[ "$(uname -m)" != "arm64" ]] && [[ "$(uname -m)" != "aarch64" ]]; then
            echo -e "${YELLOW}Warning: Building CoreML variant on non-ARM64 platform.${NC}"
            echo -e "${YELLOW}This build is optimized for Apple Silicon.${NC}"
        fi
        ;;
esac

# Build the image
echo -e "${GREEN}Starting build process...${NC}"
echo -e "Dockerfile: ${DOCKERFILE}"
echo -e "Tag: ${IMAGE_TAG}${TAG_SUFFIX}"

BUILD_START=$(date +%s)

if ! docker build \
    -f "$DOCKERFILE" \
    -t "${IMAGE_TAG}${TAG_SUFFIX}" \
    $NO_CACHE \
    .; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

BUILD_END=$(date +%s)
BUILD_TIME=$((BUILD_END - BUILD_START))

echo -e "${GREEN}✅ Build completed successfully in ${BUILD_TIME}s${NC}"
echo -e "Image: ${IMAGE_TAG}${TAG_SUFFIX}"

# Push if requested
if [[ "$PUSH_IMAGE" == true ]]; then
    echo -e "${BLUE}Pushing image to registry...${NC}"
    if ! docker push "${IMAGE_TAG}${TAG_SUFFIX}"; then
        echo -e "${RED}Push failed!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Image pushed successfully${NC}"
fi

# Show image size
echo ""
echo -e "${BLUE}Image information:${NC}"
docker images "${IMAGE_TAG}${TAG_SUFFIX}" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}"

# Show usage instructions
echo ""
echo -e "${GREEN}🚀 Usage instructions:${NC}"
case $BUILD_TYPE in
    "cpu")
        echo "docker run -p 5005:5005 ${IMAGE_TAG}${TAG_SUFFIX}"
        echo "docker-compose up"
        ;;
    "cuda")
        echo "docker run --gpus all -p 5005:5005 ${IMAGE_TAG}${TAG_SUFFIX}"
        echo "docker-compose -f docker-compose.cuda.yml up"
        ;;
    "coreml")
        echo "docker run --platform linux/arm64 -p 5005:5005 ${IMAGE_TAG}${TAG_SUFFIX}"
        echo "docker-compose -f docker-compose.coreml.yml up"
        ;;
esac

echo -e "${GREEN}Build process complete!${NC}"