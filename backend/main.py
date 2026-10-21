import asyncio
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field

from app.realtime import ConnectionManager
from app.trading import DemoMarket, TradingError


class DemoSession(BaseModel):
    username: str = Field(min_length=1, max_length=60, pattern=r"^\S(?:.*\S)?$")


class OrderCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str = Field(min_length=1, max_length=10)
    side: Literal["BUY", "SELL"]
    quantity: int = Field(strict=True, gt=0, le=1_000_000)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)


def create_app():
    market = DemoMarket()
    realtime = ConnectionManager()

    @asynccontextmanager
    async def lifespan(app):
        async def update_prices():
            while True:
                await asyncio.sleep(3)
                market.tick()

        task = asyncio.create_task(update_prices())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Simulador Bolsa SD - UFS", lifespan=lifespan)
    app.state.market = market
    app.state.realtime = realtime

    bearer = HTTPBearer(auto_error=False)

    def current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    ):
        token = credentials.credentials if credentials else ""

        with market.lock:
            username = market.sessions.get(token)

        if username is None:
            raise HTTPException(
                status_code=401,
                detail="Sessão de demonstração inválida.",
            )

        return username

    @app.get("/")
    def read_root():
        return {"status": "Servidor do Simulador de Bolsa rodando com sucesso!"}

    @app.post("/demo/sessions", status_code=201)
    def demo_session(command: DemoSession):
        return {"access_token": market.login(command.username), "token_type": "bearer"}

    @app.get("/state")
    def state(username: str = Depends(current_user)):
        return jsonable_encoder(market.snapshot(username), custom_encoder={Decimal: str})

    @app.post("/orders", status_code=201)
    def order(command: OrderCommand, username: str = Depends(current_user)):
        try:
            return jsonable_encoder(market.submit(username, command), custom_encoder={Decimal: str})
        except TradingError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, token: str = ""):
        # Mesma validação das rotas REST: o token precisa ser de uma sessão ativa.
        with market.lock:
            username = market.sessions.get(token)

        if username is None:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await realtime.connect(username, websocket)
        try:
            # O cliente só escuta; mensagens recebidas servem apenas para manter
            # a conexão viva (ex.: "ping" -> "pong").
            while True:
                message = await websocket.receive_text()
                if message == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            pass
        finally:
            realtime.disconnect(username, websocket)

    return app


app = create_app()
