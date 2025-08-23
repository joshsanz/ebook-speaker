from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
import io
import kokoro_onnx
import numpy as np
import wave
import os
import requests


# Initialize Kokoro TTS
tts_model = None


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


def ensure_model_files():
    """Ensure all required model files are present"""
    print("🔍 Checking for required model files...")

    files_to_download = [
        {
            "url": "https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/voices-v1.0.bin",
            "filename": "voices-v1.0.bin"
        },
        {
            "url": "https://github.com/nazdridoy/kokoro-tts/releases/download/v1.0.0/kokoro-v1.0.onnx",
            "filename": "kokoro-v1.0.onnx"
        }
    ]

    all_files_present = True
    for file_info in files_to_download:
        if not download_file_if_missing(file_info["url"], file_info["filename"]):
            all_files_present = False

    if not all_files_present:
        raise Exception("Failed to download required model files")

    print("✅ All model files are ready")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application lifespan events"""
    global tts_model
    # Startup
    try:
        # Ensure model files are present
        ensure_model_files()

        # Initialize TTS model
        tts_model = kokoro_onnx.Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
        print("🎵 TTS model initialized successfully")
    except Exception as e:
        print(f"❌ Failed to initialize TTS model: {e}")
        # Don't raise exception here to allow service to start even if TTS fails

    yield

    # Shutdown
    print("🔄 Shutting down TTS service")


app = FastAPI(
    title="TTS Service",
    description="Text-to-Speech API using Kokoro-ONNX",
    version="1.0.0",
    lifespan=lifespan
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SpeechRequest(BaseModel):
    model: str = Field(default="kokoro", description="TTS model to use")
    input: str = Field(..., min_length=1, max_length=4096, description="Text to convert to speech")
    voice: str = Field(default="af_heart", description="Voice to use for speech synthesis")
    response_format: str = Field(default="wav", description="Audio format (wav only)")
    speed: float = Field(default=1.0, ge=0.5, le=2.0, description="Speech speed (0.5 to 2.0)")


class VoiceResponse(BaseModel):
    name: str
    language: str
    gender: str
    description: str
    quality: str


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
    audio_data = audio_data.astype(np.float32)

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
                "quality": "high"
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
                "quality": "high"
            }
        else:
            return {
                "language": "en",
                "gender": "unknown",
                "description": voice_name,
                "quality": "high"
            }
    except Exception:
        return {
            "language": "en",
            "gender": "unknown",
            "description": voice_name,
            "quality": "high"
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
async def get_voices():
    """Get list of available voices"""
    if tts_model is None:
        raise HTTPException(status_code=500, detail="TTS model not initialized")

    try:
        voices = tts_model.get_voices()
        voice_responses = []

        for voice_name in voices:
            voice_info = parse_voice_name(voice_name)
            voice_responses.append(VoiceResponse(
                name=voice_name,
                **voice_info
            ))

        return voice_responses
    except Exception as e:
        print(f"Error getting voices: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve voices")


@app.get("/v1/audio/languages", response_model=list[LanguageResponse])
async def get_languages():
    """Get list of supported languages"""
    if tts_model is None:
        raise HTTPException(status_code=500, detail="TTS model not initialized")

    try:
        # Get languages from available voices
        voices = tts_model.get_voices()
        languages = set()

        for voice_name in voices:
            voice_info = parse_voice_name(voice_name)
            languages.add(voice_info["language"])

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
            name, native_name = lang_names.get(lang_code, (lang_code.upper(), lang_code.upper()))
            lang_responses.append(LanguageResponse(
                code=lang_code,
                name=name,
                native_name=native_name
            ))

        return lang_responses
    except Exception as e:
        print(f"Error getting languages: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve languages")


@app.post("/v1/audio/speech")
async def text_to_speech(request: SpeechRequest):
    """Convert text to speech"""

    # Validate model
    if request.model != "kokoro":
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{request.model}'. Only 'kokoro' is supported."
        )

    # Validate response format
    if request.response_format != "wav":
        raise HTTPException(
            status_code=400,
            detail="Invalid response format. Only 'wav' is supported."
        )

    try:
        if tts_model is None:
            raise HTTPException(
                status_code=500,
                detail="TTS model not initialized"
            )

        # Check if voice is available
        available_voices = tts_model.get_voices()
        if request.voice not in available_voices:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid voice '{request.voice}'. Available voices: {available_voices}"
            )

        # Generate speech
        result = tts_model.create(
            text=request.input,
            voice=request.voice,
            speed=request.speed
        )

        # Extract audio data from tuple (audio_data, sample_rate)
        audio_data, sample_rate = result

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
        print(f"TTS generation error: {e}")
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
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=5005,
        reload=True
    )
