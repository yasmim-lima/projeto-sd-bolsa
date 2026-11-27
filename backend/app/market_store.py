"""Checkpoint transacional do mercado de demonstração em um SQLite separado."""
from contextlib import closing
from decimal import Decimal
import json
from pathlib import Path
import sqlite3


def _encode(value):
    if isinstance(value, Decimal):
        return {"__decimal__": str(value)}
    raise TypeError(f"Tipo de checkpoint inválido: {type(value).__name__}")


def _decode(value):
    if set(value) == {"__decimal__"} and isinstance(value["__decimal__"], str):
        return Decimal(value["__decimal__"])
    return value


def serialize(state):
    return json.dumps(state, default=_encode, ensure_ascii=False)


def deserialize(payload):
    return json.loads(payload, object_hook=_decode)


class SQLiteMarketStore:
    def __init__(self, path):
        self.path = Path(path).resolve()
        if self.path.name.lower() == "sql_app.db":
            raise ValueError("Use um arquivo separado do SQLite de autenticação.")
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS market_checkpoint "
                "(id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)"
            )

    def load(self):
        with closing(sqlite3.connect(self.path)) as connection:
            row = connection.execute(
                "SELECT payload FROM market_checkpoint WHERE id = 1"
            ).fetchone()
        return row[0] if row else None

    def save(self, payload):
        with closing(sqlite3.connect(self.path)) as connection, connection:
            connection.execute(
                "INSERT INTO market_checkpoint (id, payload) VALUES (1, ?) "
                "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload",
                (payload,),
            )
