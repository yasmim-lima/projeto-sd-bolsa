import json
import logging
from threading import Lock
from time import perf_counter


LOGGER = logging.getLogger("uvicorn.error")


def log_event(event, **fields):
    LOGGER.info(json.dumps({"event": event, **fields}, ensure_ascii=False))


class OrderMetrics:
    def __init__(self):
        self.started = perf_counter()
        self.lock = Lock()
        self.operations = {}

    def record(self, operation, status, elapsed):
        with self.lock:
            values = self.operations.setdefault(operation, {
                "requests": 0, "by_status": {}, "total_ms": 0.0, "max_ms": 0.0,
            })
            values["requests"] += 1
            status = str(status)
            values["by_status"][status] = values["by_status"].get(status, 0) + 1
            values["total_ms"] += elapsed
            values["max_ms"] = max(values["max_ms"], elapsed)

    def snapshot(self):
        with self.lock:
            uptime = perf_counter() - self.started
            return {
                "uptime_seconds": round(uptime, 3),
                "orders": {
                    name: {
                        "requests": values["requests"],
                        "by_status": dict(values["by_status"]),
                        "mean_ms": round(values["total_ms"] / values["requests"], 3),
                        "max_ms": round(values["max_ms"], 3),
                        "requests_per_second": round(values["requests"] / uptime, 3),
                    }
                    for name, values in self.operations.items()
                },
            }
