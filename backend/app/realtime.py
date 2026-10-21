"""Eventos em tempo real via WebSocket.

O servidor é a fonte da verdade: os eventos apenas avisam os clientes de que
algo mudou. Eventos enviados enquanto um cliente está desconectado não são
reenviados; ao reconectar, o cliente busca o estado atual via REST (/state).
"""
import asyncio
import json
from datetime import datetime, timezone

from fastapi import WebSocket


def make_event(event_type, data):
    """Monta uma mensagem no formato do contrato (docs/API.md)."""
    return {
        "type": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


class ConnectionManager:
    """Guarda as conexões abertas, agrupadas por usuário.

    Um mesmo usuário pode ter várias abas abertas, por isso cada usuário
    aponta para um conjunto de conexões.
    """

    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    async def connect(self, username: str, websocket: WebSocket):
        await websocket.accept()
        # Guarda o event loop para permitir publicar a partir de rotas síncronas.
        self.loop = asyncio.get_running_loop()
        self.connections.setdefault(username, set()).add(websocket)

    def disconnect(self, username: str, websocket: WebSocket):
        sockets = self.connections.get(username)
        if not sockets:
            return
        sockets.discard(websocket)
        if not sockets:
            del self.connections[username]

    def count(self):
        return sum(len(sockets) for sockets in self.connections.values())

    async def _send(self, targets, event):
        message = json.dumps(event, default=str)
        for username, websocket in targets:
            try:
                await websocket.send_text(message)
            except Exception:
                # Conexão caiu no meio do envio: remove e segue para os demais.
                self.disconnect(username, websocket)

    async def broadcast(self, event):
        """Envia o evento a todos os clientes conectados."""
        targets = [(u, ws) for u, sockets in self.connections.items() for ws in list(sockets)]
        await self._send(targets, event)

    async def send_to_user(self, username, event):
        """Envia o evento apenas às conexões de um usuário."""
        targets = [(username, ws) for ws in list(self.connections.get(username, ()))]
        await self._send(targets, event)

    def publish(self, event, username=None):
        """Publica a partir de código síncrono (ex.: rota /orders, que roda em thread).

        Agenda o envio no event loop do servidor sem bloquear quem chamou.
        """
        if self.loop is None or self.loop.is_closed():
            return  # Nenhum cliente conectou ainda.
        coro = self.send_to_user(username, event) if username else self.broadcast(event)
        asyncio.run_coroutine_threadsafe(coro, self.loop)
