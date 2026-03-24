"""
Supabase-backed config reader for the print renderer.

Reads render_config from Supabase with a 5-second TTL cache.
Falls back to local config.yaml if Supabase is unreachable.
This fallback is REQUIRED — thermal prints are time-sensitive
and a Supabase outage must not block printing.
"""

import os
import time
import logging
import yaml
from typing import Any

logger = logging.getLogger(__name__)

_cache: dict[str, Any] | None = None
_cache_time: float = 0
_CACHE_TTL = 5.0  # seconds

_supabase_client = None
_yaml_fallback: dict[str, Any] | None = None


def _init_supabase():
    """Lazily initialize Supabase client. Returns None if not configured."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        logger.info("Supabase not configured — using YAML fallback only")
        return None

    try:
        from supabase import create_client
        _supabase_client = create_client(url, key)
        logger.info("Supabase config reader initialized")
        return _supabase_client
    except Exception as e:
        logger.warning("Failed to init Supabase client: %s", e)
        return None


def _load_yaml_fallback(config_path: str) -> dict[str, Any]:
    """Load local config.yaml as fallback."""
    global _yaml_fallback
    if _yaml_fallback is None:
        with open(config_path) as f:
            _yaml_fallback = yaml.safe_load(f)
        logger.info("Loaded YAML fallback from %s", config_path)
    return _yaml_fallback


def _row_to_config(row: dict) -> dict[str, Any]:
    """Convert a render_config DB row to the config dict format
    expected by templates.py and other renderers.

    The DB stores JSONB per section (dict_config, helv_config, etc.).
    The renderer expects top-level keys: 'dictionary', 'helvetica', 'acidic', 'halftone', 'portrait'.
    """
    paper_px = row.get("paper_px", 576)

    # Inject paper_px into each template dict so templates.py can find it
    # (templates.py reads cfg.get("paper_px", 576) from the template sub-dict)
    def with_paper(d: dict) -> dict:
        return {**d, "paper_px": paper_px}

    return {
        "dictionary": with_paper(row.get("dict_config", {})),
        "helvetica": with_paper(row.get("helv_config", {})),
        "acidic": with_paper(row.get("acid_config", {})),
        "serif": with_paper(row.get("serif_config", {})),
        "halftone": row.get("halftone_config", {}),
        "portrait": row.get("portrait_config", {}),
        "_meta": {
            "template": row.get("template", "dictionary"),
            "paper_px": paper_px,
            "slice": row.get("slice_config", {}),
            "source": "supabase",
        },
    }


def get_render_config(config_path: str = "config.yaml") -> dict[str, Any]:
    """Get the current render config.

    1. If cache is fresh (< 5s old), return cached.
    2. Try fetching from Supabase.
    3. On failure, fall back to local config.yaml.
    """
    global _cache, _cache_time

    now = time.time()
    if _cache is not None and (now - _cache_time) < _CACHE_TTL:
        return _cache

    client = _init_supabase()
    if client is not None:
        try:
            result = client.table("render_config").select("*").eq("id", True).single().execute()
            config = _row_to_config(result.data)
            _cache = config
            _cache_time = now
            return config
        except Exception as e:
            logger.warning("Supabase fetch failed, using fallback: %s", e)

    fallback = _load_yaml_fallback(config_path)
    fallback["_meta"] = {"source": "yaml_fallback"}
    _cache = fallback
    _cache_time = now
    return fallback


def get_active_template(config: dict[str, Any]) -> str:
    """Get the active template name from config."""
    meta = config.get("_meta", {})
    return meta.get("template", "dictionary")


def get_paper_px(config: dict[str, Any]) -> int:
    """Get paper width in pixels."""
    meta = config.get("_meta", {})
    return meta.get("paper_px", 576)
