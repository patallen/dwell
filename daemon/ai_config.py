import json
from pathlib import Path

DEFAULT_CONFIG = {
    "endpoint": "http://localhost:11434/v1/chat/completions",
    "api_key": "",
    "model": "llama3",
    "max_tokens": 4096,
}


def _config_path() -> Path:
    return Path.home() / ".adhdeez" / "ai.json"


def load_ai_config() -> dict:
    path = _config_path()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(DEFAULT_CONFIG, indent=2))
        return dict(DEFAULT_CONFIG)
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULT_CONFIG)
    result = dict(DEFAULT_CONFIG)
    result.update(data)
    return result


def is_ai_configured() -> bool:
    config = load_ai_config()
    return bool(config.get("endpoint"))
