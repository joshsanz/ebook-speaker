from contextlib import asynccontextmanager
from typing import Any, cast
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
import io
import kokoro_onnx
import numpy as np
import onnxruntime as ort
import wave
import os
import requests
import signal
import sys
import asyncio
from threading import Event
from kokoro_onnx.config import MAX_PHONEME_LENGTH, SAMPLE_RATE
from supertonic_wrapper import SupertonicTTS
from voices import (
    SUPERTONIC_VOICES,
    KOKORO_VOICES,
    get_voices_by_model,
    get_voice_names,
    is_valid_voice,
)


# Initialize Kokoro TTS
kokoro_model = None
supertonic_model = None
supertonic_voice_styles = {}
kokoro_model_lock = asyncio.Lock()
supertonic_model_lock = asyncio.Lock()
shutdown_event = Event()
ASSETS_DIR = os.environ.get(
    "TTS_ASSETS_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "assets"))
)
ALLOWED_MODEL_FAMILIES = ["kokoro", "supertonic"]
DEFAULT_TTS_MODEL = os.environ.get("TTS_DEFAULT_MODEL", "supertonic")
if DEFAULT_TTS_MODEL not in ALLOWED_MODEL_FAMILIES:
    print(
        "⚠️  TTS_DEFAULT_MODEL is not supported, falling back to 'kokoro': "
        f"{DEFAULT_TTS_MODEL}"
    )
    DEFAULT_TTS_MODEL = "kokoro"
TTS_MODEL_FILE = os.environ.get("TTS_MODEL_FILE")
TTS_SUPERTONIC_STEPS = int(os.environ.get("TTS_SUPERTONIC_STEPS", "5"))


def signal_handler(signum, frame):
    """Handle shutdown signals"""
    print(f"🔴 Received signal {signum}, initiating graceful shutdown...")
    shutdown_event.set()
    # Exit after a short delay to allow current requests to complete
    import threading

    def delayed_exit():
        import time
        time.sleep(2)  # Wait 2 seconds for current requests
        print("🔴 Forcing exit...")
        os._exit(0)

    threading.Thread(target=delayed_exit, daemon=True).start()


def setup_signal_handlers():
    """Setup signal handlers for graceful shutdown"""
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    print("📡 Signal handlers registered (SIGTERM, SIGINT)")


def download_file_if_missing(url: str, filename: str) -> bool:
    """Download a file if it doesn't exist"""
    if os.path.exists(filename):
        print(f"✓ {filename} already exists")
        return True

    try:
        print(f"📥 Downloading {filename}...")
        response = requests.get(url, stream=True)
        response.raise_for_status()

        with open(filename, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        print(f"✓ Downloaded {filename} successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to download {filename}: {e}")
        return False


def find_model_files():
    """Find model files, checking assets directory first, then fallbacks, then download"""
    print("🔍 Checking for required Kokoro model files...")

    # Model file patterns - prioritize model.onnx
    model_patterns = ["model.onnx", "kokoro-v1.0.fp16.onnx",
                      "kokoro-v1.0.onnx", "kokoro.onnx", "model_quantized.onnx"]
    voice_patterns = ["voices-v1.0.bin", "voices.bin"]

    model_name = None
    voice_name = None
    requested_model = None

    if TTS_MODEL_FILE:
        requested_model = os.path.basename(TTS_MODEL_FILE.strip().strip("\""))
        model_patterns = [requested_model]
        print(f"🎯 TTS_MODEL_FILE set, requesting model: {requested_model}")

    # Check assets/kokoro directory first (new organized structure)
    kokoro_dir = os.path.join(ASSETS_DIR, "kokoro")
    os.makedirs(kokoro_dir, exist_ok=True)
    search_dirs = [kokoro_dir, "/app/models", os.getcwd()]
    model_search_dirs = [kokoro_dir] if requested_model else search_dirs

    for directory in search_dirs:
        if not os.path.exists(directory):
            continue

        if directory == kokoro_dir:
            print(f"📁 Checking Kokoro assets directory: {kokoro_dir}")

        directory_files = os.listdir(directory)

        if not model_name and directory in model_search_dirs:
            for pattern in model_patterns:
                if pattern in directory_files:
                    model_path = os.path.join(directory, pattern)
                    print(f"✓ Found model: {model_path}")
                    model_name = model_path
                    break

        if not voice_name:
            for pattern in voice_patterns:
                if pattern in directory_files:
                    voice_path = os.path.join(directory, pattern)
                    print(f"✓ Found voices: {voice_path}")
                    voice_name = voice_path
                    break

    # Download if still not found
    if not model_name or not voice_name:
        print("📥 Kokoro model files not found locally, downloading...")
        # Other defaults available:
        # model*.onnx for _quantized, _fp16, _q4, _q4f16, _q8f16, _uint8, _uint8f16, and ''
        default_model = requested_model or "model.onnx"
        default_voices = "voices-v1.0.bin"

        files_to_download = []
        if not model_name:
            model_path = os.path.join(kokoro_dir, default_model)
            files_to_download.append({
                "url": (
                    "https://huggingface.co/onnx-community/Kokoro-82M-ONNX/"
                    f"resolve/main/onnx/{default_model}"
                ),
                "filename": model_path
            })
            model_name = model_path

        if not voice_name:
            voice_path = os.path.join(kokoro_dir, default_voices)
            files_to_download.append({
                "url": f"https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/{default_voices}",
                "filename": voice_path
            })
            voice_name = voice_path

        all_files_present = True
        for file_info in files_to_download:
            if not download_file_if_missing(file_info["url"], file_info["filename"]):
                all_files_present = False

        if not all_files_present:
            raise Exception("Failed to download required model files")

    print("✅ All model files are ready")
    print(f"🎵 Using model: {model_name}")
    print(f"🗣️ Using voices: {voice_name}")

    return model_name, voice_name


def patch_kokoro_float_inputs(model):
    inputs = {inp.name: inp.type for inp in model.sess.get_inputs()}
    input_ids_type = inputs.get("input_ids")
    speed_type = inputs.get("speed")
    if not input_ids_type:
        return
    needs_float_input_ids = "float" in input_ids_type
    needs_float_speed = speed_type and "float" in speed_type
    if not needs_float_input_ids and not needs_float_speed:
        return

    def _create_audio_float(self, phonemes, voice, speed):
        if len(phonemes) > MAX_PHONEME_LENGTH:
            phonemes = phonemes[:MAX_PHONEME_LENGTH]

        tokens_dtype = np.float32 if needs_float_input_ids else np.int64
        tokens = np.array(self.tokenizer.tokenize(
            phonemes), dtype=tokens_dtype)
        assert len(tokens) <= MAX_PHONEME_LENGTH, (
            f"Context length is {
                MAX_PHONEME_LENGTH}, but leave room for the pad token 0 at the start & end"
        )

        voice = voice[len(tokens)]
        tokens = [[0, *tokens, 0]]

        audio = self.sess.run(None, {
            "input_ids": tokens,
            "style": np.array(voice, dtype=np.float32),
            "speed": np.array([speed], dtype=np.float32 if needs_float_speed else np.int32),
        })[0]
        return audio, SAMPLE_RATE

    model._create_audio = _create_audio_float.__get__(model, type(model))


async def get_kokoro_model():
    global kokoro_model
    if kokoro_model is not None:
        return kokoro_model

    async with kokoro_model_lock:
        if kokoro_model is not None:
            return kokoro_model

        try:
            # Find model files (mounted, local, or download)
            model, voices = find_model_files()

            # Create ONNX session to select an accelerator (CoreML/CUDA) if available
            # type: ignore[attr-defined]
            providers = ort.get_available_providers()
            print("Available EPs:", ", ".join(providers))

            # Remove TensorRT provider while debugging errors it causes
            providers = [provider for provider in providers if provider !=
                         "TensorrtExecutionProvider"]
            print("Filtered EPs (TensorRT removed):", ", ".join(providers))

            if "CUDAExecutionProvider" in providers:
                # Apply CUDA conv algo search performance tweak by modifying the provider in place
                providers = [provider if provider != "CUDAExecutionProvider"
                             else ("CUDAExecutionProvider", {"cudnn_conv_algo_search": "EXHAUSTIVE"})
                             for provider in providers]

            print("Using inference engines", providers)

            sess_opts = ort.SessionOptions()  # type: ignore[attr-defined]
            cpu_count = os.cpu_count()
            sess_opts.intra_op_num_threads = cpu_count
            session = ort.InferenceSession(
                model, session_options=sess_opts, providers=providers)

            kokoro_model = kokoro_onnx.Kokoro.from_session(session, voices)
            patch_kokoro_float_inputs(kokoro_model)
            print("🎵 Kokoro model initialized successfully")
        except Exception as e:
            print(f"❌ Failed to initialize Kokoro model: {e}")
            raise

    return kokoro_model


async def get_supertonic_model():
    global supertonic_model
    if supertonic_model is not None:
        return supertonic_model

    async with supertonic_model_lock:
        if supertonic_model is not None:
            return supertonic_model

        try:
            print("🔧 Initializing Supertonic TTS model...")
            supertonic_dir = os.path.join(ASSETS_DIR, "supertonic")
            supertonic_model = SupertonicTTS(supertonic_dir, auto_download=True)
            print("🎵 Supertonic model initialized successfully")
        except Exception as e:
            print(f"❌ Failed to initialize Supertonic model: {e}")
            raise

    return supertonic_model


def get_supertonic_voice_style(tts: SupertonicTTS, voice_name: str):
    if voice_name in supertonic_voice_styles:
        return supertonic_voice_styles[voice_name]

    style = tts.get_voice_style(voice_name=voice_name)
    supertonic_voice_styles[voice_name] = style
    return style


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application lifespan events"""
    # Startup
    print("🚀 Starting TTS service...")
    setup_signal_handlers()

    yield

    # Shutdown
    print("🔄 Shutting down TTS service")
    shutdown_event.set()

    # Give a moment for any ongoing requests to complete
    await asyncio.sleep(1)
    print("✅ TTS service shutdown complete")


app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech API using Kokoro-ONNX",
    version="1.0.0",
    lifespan=lifespan
)


# Configure CORS
app.add_middleware(
    cast(Any, CORSMiddleware),
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add shutdown check middleware
@app.middleware("http")
async def shutdown_middleware(request, call_next):
    """Check if service is shutting down before processing requests"""
    if shutdown_event.is_set():
        raise HTTPException(
            status_code=503,
            detail="Service is shutting down"
        )
    response = await call_next(request)
    return response


class SpeechRequest(BaseModel):
    model: str = Field(default=DEFAULT_TTS_MODEL,
                       description="TTS model to use")
    input: str = Field(..., min_length=1, max_length=4096,
                       description="Text to convert to speech")
    voice: str = Field(default="af_heart",
                       description="Voice to use for speech synthesis")
    response_format: str = Field(
        default="wav", description="Audio format (wav only)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0,
                         description="Speech speed (0.5 to 2.0)")


class VoiceResponse(BaseModel):
    name: str
    language: str
    gender: str
    description: str


class LanguageResponse(BaseModel):
    code: str
    name: str
    native_name: str


class HealthResponse(BaseModel):
    status: str
    message: str
    version: str


def create_wav_from_audio(audio_data: np.ndarray, sample_rate: int = 24000) -> bytes:
    """Convert numpy audio array to WAV format bytes"""
    # Ensure audio data is in the right format
    audio_data = np.squeeze(audio_data).astype(np.float32)

    # Convert to 16-bit PCM
    audio_data = (audio_data * 32767).astype(np.int16)

    # Create WAV buffer
    wav_buffer = io.BytesIO()

    with wave.open(wav_buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data.tobytes())

    return wav_buffer.getvalue()


def parse_voice_name(voice_name: str) -> dict:
    """Parse voice name to extract language and gender info"""
    try:
        # Voice names are in format: [language_gender]_[name]
        # e.g., "af_heart" -> language: "a" (American), gender: "f" (female), name: "heart"
        parts = voice_name.split('_', 1)
        if len(parts) != 2:
            return {
                "language": "en",
                "gender": "unknown",
                "description": voice_name,
            }

        lang_gender, name = parts

        # Parse language and gender
        if len(lang_gender) >= 2:
            language_code = lang_gender[0]
            gender_code = lang_gender[1]

            # Map language codes
            lang_map = {
                'a': 'en',  # American
                'b': 'en',  # British
                'j': 'ja',  # Japanese
                'k': 'ko',  # Korean
                'z': 'zh',  # Chinese
                'e': 'es',  # Spanish
                'f': 'fr',  # French
                'g': 'de',  # German
                'i': 'it',  # Italian
                'p': 'pt'   # Portuguese
            }

            # Map gender codes
            gender_map = {
                'f': 'female',
                'm': 'male'
            }

            language = lang_map.get(language_code, 'en')
            gender = gender_map.get(gender_code, 'unknown')

            # Create description
            lang_names = {
                'en': 'English',
                'ja': 'Japanese',
                'ko': 'Korean',
                'zh': 'Chinese',
                'es': 'Spanish',
                'fr': 'French',
                'de': 'German',
                'it': 'Italian',
                'pt': 'Portuguese'
            }

            lang_desc = lang_names.get(language, 'Unknown')
            gender_desc = gender.capitalize()
            description = f"{lang_desc} {gender_desc} {name.capitalize()}"

            return {
                "language": language,
                "gender": gender,
                "description": description,
            }
        else:
            return {
                "language": "en",
                "gender": "unknown",
                "description": voice_name,
            }
    except Exception:
        return {
            "language": "en",
            "gender": "unknown",
            "description": voice_name,
        }


def parse_supertonic_voice_name(voice_name: str) -> dict:
    gender = "unknown"
    if voice_name.startswith("M"):
        gender = "male"
    elif voice_name.startswith("F"):
        gender = "female"

    description = f"English {gender.capitalize()} {
        voice_name}" if gender != "unknown" else voice_name

    return {
        "language": "en",
        "gender": gender,
        "description": description,
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        message="TTS service is running",
        version="1.0.0"
    )


@app.get("/v1/audio/voices", response_model=list[VoiceResponse])
async def get_voices(model: str = DEFAULT_TTS_MODEL):
    """Get list of available voices from static voice list"""
    if model not in ALLOWED_MODEL_FAMILIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid model '{model}'. "
                f"Only {', '.join(ALLOWED_MODEL_FAMILIES)} is supported."
            )
        )

    try:
        # Return static voice list (no need to initialize models)
        voices_data = get_voices_by_model(model)

        voice_responses = []
        for voice in voices_data:
            voice_responses.append(VoiceResponse(
                name=voice["name"],
                language=voice["language"],
                gender=voice["gender"],
                description=voice["description"]
            ))

        return voice_responses
    except Exception as e:
        print(f"Error getting voices: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to retrieve voices")


@app.get("/v1/audio/languages", response_model=list[LanguageResponse])
async def get_languages(model: str = DEFAULT_TTS_MODEL):
    """Get list of supported languages from static voice list"""
    if model not in ALLOWED_MODEL_FAMILIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid model '{model}'. "
                f"Only {', '.join(ALLOWED_MODEL_FAMILIES)} is supported."
            )
        )

    try:
        # Get languages from static voices
        voices_data = get_voices_by_model(model)
        languages = set()

        for voice in voices_data:
            languages.add(voice["language"])

        lang_responses = []

        # Map language codes to full names
        lang_names = {
            'en': ('English', 'English'),
            'ja': ('Japanese', '日本語'),
            'ko': ('Korean', '한국어'),
            'zh': ('Chinese', '中文'),
            'es': ('Spanish', 'Español'),
            'fr': ('French', 'Français'),
            'de': ('German', 'Deutsch'),
            'it': ('Italian', 'Italiano'),
            'pt': ('Portuguese', 'Português')
        }

        for lang_code in sorted(languages):
            name, native_name = lang_names.get(
                lang_code, (lang_code.upper(), lang_code.upper()))
            lang_responses.append(LanguageResponse(
                code=lang_code,
                name=name,
                native_name=native_name
            ))

        return lang_responses
    except Exception as e:
        print(f"Error getting languages: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to retrieve languages")


@app.post("/v1/audio/speech")
async def text_to_speech(request: SpeechRequest):
    """Convert text to speech"""

    # Check if shutdown has been requested
    if shutdown_event.is_set():
        raise HTTPException(
            status_code=503,
            detail="Service is shutting down, not accepting new requests"
        )

    # Validate model
    if request.model not in ALLOWED_MODEL_FAMILIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid model '{request.model}'. "
                f"Only {', '.join(ALLOWED_MODEL_FAMILIES)} is supported."
            )
        )

    # Validate response format
    if request.response_format != "wav":
        raise HTTPException(
            status_code=400,
            detail="Invalid response format. Only 'wav' is supported."
        )

    try:
        # Validate voice against static voice list
        if not is_valid_voice(request.voice, request.model):
            available_voices = get_voice_names(request.model)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid voice '{request.voice}'. "
                    f"Available voices: {available_voices}"
                )
            )

        # Now initialize the models for actual TTS
        if request.model == "kokoro":
            tts_model = await get_kokoro_model()
        else:
            tts_model = await get_supertonic_model()

        # Check again before starting generation (in case shutdown was requested)
        if shutdown_event.is_set():
            raise HTTPException(
                status_code=503,
                detail="Service is shutting down, not accepting new requests"
            )

        if request.model == "kokoro":
            result = tts_model.create(
                text=request.input,
                voice=request.voice,
                speed=request.speed
            )
            audio_data, sample_rate = result
        else:
            voice_style = get_supertonic_voice_style(tts_model, request.voice)
            audio_data, _duration = tts_model.synthesize(
                request.input,
                voice_style=voice_style,
                speed=request.speed
            )
            sample_rate = getattr(tts_model, "sample_rate", SAMPLE_RATE)

        # Convert to WAV format
        wav_data = create_wav_from_audio(audio_data, sample_rate)

        # Return audio as streaming response
        return StreamingResponse(
            io.BytesIO(wav_data),
            media_type="audio/wav",
            headers={
                "Content-Disposition": 'attachment; filename="speech.wav"',
                "Content-Length": str(len(wav_data))
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"TTS generation error: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate speech: {str(e)}"
        )


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "TTS Service API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "speech": "/v1/audio/speech",
            "voices": "/v1/audio/voices",
            "languages": "/v1/audio/languages"
        }
    }


if __name__ == "__main__":
    # Setup signal handlers before starting uvicorn
    setup_signal_handlers()

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5005,
        reload=False,  # Disable reload for production
        access_log=False,  # Reduce logging overhead
        log_level="info"
    )
