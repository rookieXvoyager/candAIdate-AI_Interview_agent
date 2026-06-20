"""Shared Gemini helpers: model fallback + retry on transient errors.

Handles both rate limits (429 RESOURCE_EXHAUSTED) and temporary server
overloads (503 UNAVAILABLE, 500 INTERNAL) by trying the next model, then
retrying the whole chain after a short backoff.
"""
import time

# Substrings that indicate a transient, retryable failure.
_RETRYABLE = (
    "RESOURCE_EXHAUSTED",
    "429",
    "UNAVAILABLE",
    "503",
    "INTERNAL",
    "500",
    "overloaded",
    "high demand",
    "try again",
)


def is_retryable_error(exc: Exception) -> bool:
    msg = str(exc)
    return any(tok in msg for tok in _RETRYABLE)


# Backwards-compatible alias.
def is_quota_error(exc: Exception) -> bool:
    return is_retryable_error(exc)


def generate_with_fallback(client, *, models, max_rounds: int = 2, backoff: float = 1.5, **kwargs):
    """
    Call client.models.generate_content, trying each model in `models` in order.
    On a transient error (rate-limit or overload) it moves to the next model;
    after every model fails in a round, it waits `backoff` seconds and retries
    the whole chain (up to `max_rounds`). Non-transient errors raise immediately.
    """
    last_exc = None
    for round_index in range(max_rounds):
        for model in models:
            try:
                return client.models.generate_content(model=model, **kwargs)
            except Exception as exc:  # noqa: BLE001 - non-transient errors re-raised below
                last_exc = exc
                if is_retryable_error(exc):
                    continue
                raise
        if round_index < max_rounds - 1:
            time.sleep(backoff)
    raise last_exc
