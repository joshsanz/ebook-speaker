"""
SupertonicTTS wrapper class for integration with main.py
Provides a unified API compatible with the FastAPI endpoints
"""

import os
import shutil
from typing import Optional
import numpy as np

from supertonic import (
    load_text_to_speech,
    load_voice_style,
    Style,
    TextToSpeech
)


def download_supertonic_models(assets_dir: str) -> None:
    """Download Supertonic models from HuggingFace if missing"""
    from huggingface_hub import hf_hub_download
    import sys

    repo_id = "Supertone/supertonic"
    required_files = [
        "onnx/tts.json",
        "onnx/unicode_indexer.json",
        "onnx/duration_predictor.onnx",
        "onnx/text_encoder.onnx",
        "onnx/vector_estimator.onnx",
        "onnx/vocoder.onnx"
    ]

    print(f"📥 Checking Supertonic model files in {assets_dir}...", flush=True)
    sys.stderr.flush()
    os.makedirs(assets_dir, exist_ok=True)

    # Download main model files
    for filepath in required_files:
        # Extract just the filename for the target (remove onnx/ prefix)
        basename = os.path.basename(filepath)
        target_path = os.path.join(assets_dir, basename)
        if not os.path.exists(target_path):
            print(f"📥 Downloading {basename} from HuggingFace...", flush=True)
            import sys
            sys.stderr.flush()
            try:
                downloaded_path = hf_hub_download(repo_id=repo_id, filename=filepath)
                shutil.copy(downloaded_path, target_path)
                print(f"✓ Downloaded {basename}", flush=True)
            except Exception as e:
                print(f"❌ Failed to download {basename}: {e}", flush=True)
                import sys
                sys.stderr.flush()
                raise

    # Download voice style files
    voice_styles_dir = os.path.join(assets_dir, "voice_styles")
    os.makedirs(voice_styles_dir, exist_ok=True)

    for voice_name in ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"]:
        filename = f"{voice_name}.json"
        target_path = os.path.join(voice_styles_dir, filename)
        if not os.path.exists(target_path):
            print(f"📥 Downloading voice style {filename}...", flush=True)
            import sys
            sys.stderr.flush()
            try:
                # Voice styles are in voice_styles subdirectory in repo
                downloaded_path = hf_hub_download(
                    repo_id=repo_id,
                    filename=f"voice_styles/{filename}"
                )
                shutil.copy(downloaded_path, target_path)
                print(f"✓ Downloaded {filename}", flush=True)
            except Exception as e:
                print(f"❌ Failed to download {filename}: {e}", flush=True)
                import sys
                sys.stderr.flush()
                raise

    print("✅ Supertonic model files ready", flush=True)


class SupertonicTTS:
    """
    Wrapper class for Supertonic TTS model that provides a unified API
    compatible with the FastAPI endpoints in main.py
    """

    VOICE_LIST = [f"M{i}" for i in range(1, 6)] + [f"F{i}" for i in range(1, 6)]

    def __init__(self, assets_dir: str, auto_download: bool = True):
        """
        Initialize SupertonicTTS wrapper

        Args:
            assets_dir: Directory containing Supertonic models and voice styles
            auto_download: Whether to auto-download missing model files from HuggingFace
        """
        self.assets_dir = assets_dir
        self._voice_style_cache = {}

        # Auto-download if requested
        if auto_download:
            download_supertonic_models(assets_dir)

        # Load the TTS model
        print(f"🔧 Loading Supertonic TTS model from {assets_dir}...", flush=True)
        import sys
        sys.stderr.flush()
        try:
            self.tts: TextToSpeech = load_text_to_speech(assets_dir, use_gpu=False)
            print("✓ Supertonic TTS model loaded successfully", flush=True)
        except Exception as e:
            print(f"❌ Failed to load Supertonic TTS model: {e}", flush=True)
            import sys
            sys.stderr.flush()
            raise

        # Get denoising steps from environment variable
        self.total_steps = int(os.environ.get("TTS_SUPERTONIC_STEPS", "5"))
        print(f"🎛️  Supertonic denoising steps: {self.total_steps}")

    def get_voices(self) -> list[str]:
        """
        Get list of available voice names

        Returns:
            List of voice names (e.g., ["M1", "M2", ..., "F5"])
        """
        return self.VOICE_LIST

    def get_voice_style(self, voice_name: str) -> Style:
        """
        Get voice style for the given voice name
        Caches loaded styles to avoid reloading from disk

        Args:
            voice_name: Name of the voice (e.g., "M1", "F2")

        Returns:
            Style object containing TTL and DP style vectors

        Raises:
            ValueError: If voice_name is not valid
            FileNotFoundError: If voice style file is missing
        """
        if voice_name not in self.VOICE_LIST:
            raise ValueError(
                f"Invalid voice '{voice_name}'. "
                f"Available voices: {', '.join(self.VOICE_LIST)}"
            )

        # Return cached style if available
        if voice_name in self._voice_style_cache:
            return self._voice_style_cache[voice_name]

        # Load voice style from file
        voice_style_path = os.path.join(
            self.assets_dir,
            "voice_styles",
            f"{voice_name}.json"
        )

        if not os.path.exists(voice_style_path):
            raise FileNotFoundError(
                f"Voice style file not found: {voice_style_path}\n"
                f"Please ensure voice style files are in the voice_styles directory."
            )

        print(f"📖 Loading voice style: {voice_name}")
        try:
            style = load_voice_style([voice_style_path], verbose=False)
            # Cache the loaded style
            self._voice_style_cache[voice_name] = style
            return style
        except Exception as e:
            raise RuntimeError(f"Failed to load voice style {voice_name}: {e}")

    def synthesize(
        self,
        text: str,
        voice_style: Style,
        speed: float = 1.05
    ) -> tuple[np.ndarray, float]:
        """
        Synthesize speech from text using the given voice style

        Args:
            text: Input text to synthesize
            voice_style: Voice style object (from get_voice_style)
            speed: Speed factor (>1 = faster, <1 = slower)

        Returns:
            Tuple of (audio_data, duration) where:
                - audio_data: numpy array of audio samples (float32)
                - duration: duration in seconds (float)
        """
        try:
            # Call underlying TextToSpeech with chunking support
            audio, duration = self.tts(
                text=text,
                style=voice_style,
                total_step=self.total_steps,
                speed=speed,
                silence_duration=0.3  # Silence between chunks
            )

            # Return audio data and total duration
            # duration is a numpy array, convert to scalar
            total_duration = float(duration.sum()) if hasattr(duration, 'sum') else float(duration)

            return audio, total_duration

        except Exception as e:
            raise RuntimeError(f"Failed to synthesize speech: {e}")

    @property
    def sample_rate(self) -> int:
        """
        Get the sample rate of the TTS model

        Returns:
            Sample rate in Hz (e.g., 24000)
        """
        return self.tts.sample_rate
