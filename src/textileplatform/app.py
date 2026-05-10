from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

app = Flask("textileplatform")

# In-memory limiter (no Redis, no external service). Per-worker only,
# which is fine for this app's single-worker deployment. Limits are
# applied per-route via @limiter.limit(...).
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    storage_uri="memory://",
    default_limits=[],
    headers_enabled=False,
)
