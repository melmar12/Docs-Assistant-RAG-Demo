"""Structured JSON logging configuration for the RAG backend."""

import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone

# Async-safe ambient request ID — set by logging_middleware per request.
# Defaults to "-" when accessed outside a request context (e.g. ingest script).
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Standard LogRecord attributes that are NOT caller-supplied extras.
_LOGRECORD_ATTRS = frozenset({
    "name", "msg", "args", "levelname", "levelno", "pathname",
    "filename", "module", "exc_info", "exc_text", "stack_info",
    "lineno", "funcName", "created", "msecs", "relativeCreated",
    "thread", "threadName", "processName", "process", "taskName",
    "message",
})


class JsonFormatter(logging.Formatter):
    """Emit each log record as a single-line JSON object.

    Always-present fields:
        timestamp  — ISO-8601 UTC
        level      — DEBUG / INFO / WARNING / ERROR / CRITICAL
        logger     — logger name (e.g. "app.main")
        message    — formatted log message
        request_id — UUID from request_id_var, or "-" outside a request

    Any keys passed via ``extra=`` are merged in after the standard fields.
    If ``exc_info`` is set, an ``exc_info`` key is added with the formatted
    traceback string.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_var.get(),
        }

        for key, value in record.__dict__.items():
            if key not in _LOGRECORD_ATTRS and not key.startswith("_"):
                payload[key] = value

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def setup_logging(level: int = logging.INFO) -> None:
    """Configure the root logger to emit JSON to stdout.

    Call once at startup before any loggers are used. Replaces existing
    root-logger handlers and quiets noisy third-party libraries.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Suppress chatty third-party loggers that would otherwise flood stdout
    for name in ("uvicorn.access", "chromadb", "httpx", "openai"):
        logging.getLogger(name).setLevel(logging.WARNING)
