"""
Static list of available TTS voices for Kokoro and Supertonic models.
This module maintains a definitive list of all available voices for both TTS engines
to ensure consistency across the application without runtime discovery.

This mirrors the JavaScript version in shared/ttsVoices.js for consistency.
"""

# Supertonic TTS Voices - 10 voices total (5 male, 5 female)
# All voices are English only
# Voice naming: M1-M5 (Male), F1-F5 (Female)
SUPERTONIC_VOICES = [
    {"name": "M1", "language": "en", "gender": "male", "description": "English Male M1"},
    {"name": "M2", "language": "en", "gender": "male", "description": "English Male M2"},
    {"name": "M3", "language": "en", "gender": "male", "description": "English Male M3"},
    {"name": "M4", "language": "en", "gender": "male", "description": "English Male M4"},
    {"name": "M5", "language": "en", "gender": "male", "description": "English Male M5"},
    {"name": "F1", "language": "en", "gender": "female", "description": "English Female F1"},
    {"name": "F2", "language": "en", "gender": "female", "description": "English Female F2"},
    {"name": "F3", "language": "en", "gender": "female", "description": "English Female F3"},
    {"name": "F4", "language": "en", "gender": "female", "description": "English Female F4"},
    {"name": "F5", "language": "en", "gender": "female", "description": "English Female F5"},
]

# Kokoro TTS Voices - Multilingual support
# Voice naming convention: [language_code][gender]_[name]
# Language codes: a=American, b=British, j=Japanese, k=Korean, z=Chinese, e=Spanish, f=French, g=German, i=Italian, p=Portuguese
# Gender codes: f=female, m=male
KOKORO_VOICES = [
    # American English voices (a + gender)
    {"name": "af_heart", "language": "en", "gender": "female", "description": "American Female Heart"},
    {"name": "af_bella", "language": "en", "gender": "female", "description": "American Female Bella"},
    {"name": "af_nicole", "language": "en", "gender": "female", "description": "American Female Nicole"},
    {"name": "af_sarah", "language": "en", "gender": "female", "description": "American Female Sarah"},
    {"name": "af_amber", "language": "en", "gender": "female", "description": "American Female Amber"},
    {"name": "am_adam", "language": "en", "gender": "male", "description": "American Male Adam"},
    {"name": "am_michael", "language": "en", "gender": "male", "description": "American Male Michael"},
    {"name": "am_john", "language": "en", "gender": "male", "description": "American Male John"},

    # British English voices (b + gender)
    {"name": "bf_emma", "language": "en", "gender": "female", "description": "British Female Emma"},
    {"name": "bf_olivia", "language": "en", "gender": "female", "description": "British Female Olivia"},
    {"name": "bm_lewis", "language": "en", "gender": "male", "description": "British Male Lewis"},
    {"name": "bm_james", "language": "en", "gender": "male", "description": "British Male James"},

    # Japanese voices (j + gender)
    {"name": "jf_nanako", "language": "ja", "gender": "female", "description": "Japanese Female Nanako"},
    {"name": "jf_akari", "language": "ja", "gender": "female", "description": "Japanese Female Akari"},
    {"name": "jm_hayato", "language": "ja", "gender": "male", "description": "Japanese Male Hayato"},
    {"name": "jm_daichi", "language": "ja", "gender": "male", "description": "Japanese Male Daichi"},

    # Korean voices (k + gender)
    {"name": "kf_minji", "language": "ko", "gender": "female", "description": "Korean Female Minji"},
    {"name": "kf_soyeon", "language": "ko", "gender": "female", "description": "Korean Female Soyeon"},
    {"name": "km_junho", "language": "ko", "gender": "male", "description": "Korean Male Junho"},
    {"name": "km_sung", "language": "ko", "gender": "male", "description": "Korean Male Sung"},

    # Chinese voices (z + gender)
    {"name": "zf_xiaoxiao", "language": "zh", "gender": "female", "description": "Chinese Female Xiaoxiao"},
    {"name": "zf_xiaowan", "language": "zh", "gender": "female", "description": "Chinese Female Xiaowan"},
    {"name": "zm_xiaoyu", "language": "zh", "gender": "male", "description": "Chinese Male Xiaoyu"},
    {"name": "zm_yunxi", "language": "zh", "gender": "male", "description": "Chinese Male Yunxi"},

    # Spanish voices (e + gender)
    {"name": "ef_carmen", "language": "es", "gender": "female", "description": "Spanish Female Carmen"},
    {"name": "ef_rosa", "language": "es", "gender": "female", "description": "Spanish Female Rosa"},
    {"name": "em_carlos", "language": "es", "gender": "male", "description": "Spanish Male Carlos"},
    {"name": "em_juan", "language": "es", "gender": "male", "description": "Spanish Male Juan"},

    # French voices (f + gender)
    {"name": "ff_léa", "language": "fr", "gender": "female", "description": "French Female Léa"},
    {"name": "ff_marie", "language": "fr", "gender": "female", "description": "French Female Marie"},
    {"name": "fm_bruno", "language": "fr", "gender": "male", "description": "French Male Bruno"},
    {"name": "fm_jean", "language": "fr", "gender": "male", "description": "French Male Jean"},

    # German voices (g + gender)
    {"name": "gf_anna", "language": "de", "gender": "female", "description": "German Female Anna"},
    {"name": "gf_birgitta", "language": "de", "gender": "female", "description": "German Female Birgitta"},
    {"name": "gm_lars", "language": "de", "gender": "male", "description": "German Male Lars"},
    {"name": "gm_markus", "language": "de", "gender": "male", "description": "German Male Markus"},

    # Italian voices (i + gender)
    {"name": "if_giulia", "language": "it", "gender": "female", "description": "Italian Female Giulia"},
    {"name": "if_paola", "language": "it", "gender": "female", "description": "Italian Female Paola"},
    {"name": "im_marco", "language": "it", "gender": "male", "description": "Italian Male Marco"},
    {"name": "im_stefano", "language": "it", "gender": "male", "description": "Italian Male Stefano"},

    # Portuguese voices (p + gender)
    {"name": "pf_helena", "language": "pt", "gender": "female", "description": "Portuguese Female Helena"},
    {"name": "pf_fernanda", "language": "pt", "gender": "female", "description": "Portuguese Female Fernanda"},
    {"name": "pm_paulo", "language": "pt", "gender": "male", "description": "Portuguese Male Paulo"},
    {"name": "pm_sergio", "language": "pt", "gender": "male", "description": "Portuguese Male Sergio"},
]


def get_voices_by_model(model: str) -> list[dict]:
    """
    Get voices by model name.

    Args:
        model: Model name ('kokoro' or 'supertonic')

    Returns:
        List of voice dictionaries for the specified model
    """
    if model == "supertonic":
        return SUPERTONIC_VOICES
    elif model == "kokoro":
        return KOKORO_VOICES
    return []


def get_voice_by_name(voice_name: str, model: str) -> dict | None:
    """
    Get voice by name and model.

    Args:
        voice_name: The voice name (e.g., 'af_heart', 'M1')
        model: Model name ('kokoro' or 'supertonic')

    Returns:
        Voice dictionary or None if not found
    """
    voices = get_voices_by_model(model)
    for voice in voices:
        if voice["name"] == voice_name:
            return voice
    return None


def get_default_voice(model: str) -> str:
    """
    Get default voice for a model.

    Args:
        model: Model name ('kokoro' or 'supertonic')

    Returns:
        Default voice name
    """
    if model == "supertonic":
        return "F1"
    return "af_heart"  # Default to Kokoro American Female Heart


def get_voice_names(model: str) -> list[str]:
    """
    Get voice names only (useful for validation).

    Args:
        model: Model name ('kokoro' or 'supertonic')

    Returns:
        List of voice names
    """
    return [v["name"] for v in get_voices_by_model(model)]


def is_valid_voice(voice_name: str, model: str) -> bool:
    """
    Check if a voice name is valid for a given model.

    Args:
        voice_name: Voice name to validate
        model: Model name ('kokoro' or 'supertonic')

    Returns:
        True if voice is valid for the model
    """
    return voice_name in get_voice_names(model)
