import asyncio
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from os import getenv
from time import perf_counter
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field

from app.database import Base, engine
from app.market_store import SQLiteMarketStore
from app.matching import OrderBookMarket, OrderKeyConflict
from app.observability import OrderMetrics, log_event
from app.realtime import ConnectionManager, make_event
from app.routers import auth
from app.trading import DemoMarket, TradingError

# Cria as tabelas do banco no SQLite se não existirem
Base.metadata.create_all(bind=engine)


class DemoSession(BaseModel):
    username: str = Field(min_length=1, max_length=60, pattern=r"^\S(?:.*\S)?$")


class OrderCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticker: str = Field(min_length=1, max_length=10)
    side: Literal["BUY", "SELL"]
    quantity: int = Field(strict=True, gt=0, le=1_000_000)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)


def create_app(*, matching=False, market_db=None):
    if market_db and not matching:
        raise ValueError("O SQLite experimental exige BOLSA_MATCHING=1.")
    store = SQLiteMarketStore(market_db) if market_db else None
    market = OrderBookMarket(store) if matching else DemoMarket()
    realtime = ConnectionManager()
    metrics = OrderMetrics()

    @asynccontextmanager
    async def lifespan(app):
        realtime.loop = asyncio.get_running_loop()

        async def update_prices():
            while True:
                await asyncio.sleep(3)
                market.tick()
                # Avisa todos os clientes da nova cotação de cada ativo.
                for quote in market.quotes():
                    await realtime.broadcast(make_event("PRICE_UPDATED", quote))

        task = None if matching else asyncio.create_task(update_prices())
        try:
            yield
        finally:
            if task is not None:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title="Simulador Bolsa SD - UFS", lifespan=lifespan)
    
    # Adiciona as rotas de Autenticação JWT do banco SQLite
    app.include_router(auth.router)

    app.state.market = market
    app.state.realtime = realtime

    @app.middleware("http")
    async def measure_orders(request: Request, call_next):
        path = request.url.path
        if request.method != "POST" or not (
            path == "/orders" or (path.startswith("/orders/") and path.endswith("/cancel"))
        ):
            return await call_next(request)
        start = perf_counter()
        code = 500
        try:
            response = await call_next(request)
            code = response.status_code
            return response
        finally:
            operation = "submit" if path == "/orders" else "cancel"
            metrics.record(operation, code, (perf_counter() - start) * 1000)

    @app.get("/metrics")
    def market_metrics():
        return metrics.snapshot()

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
    def order(
        command: OrderCommand,
        response: Response,
        username: str = Depends(current_user),
        idempotency_key: str | None = Header(default=None, min_length=1, max_length=128),
    ):
        try:
            if matching:
                result, replayed = market.submit_once(username, command, idempotency_key)
            else:
                result, replayed = market.submit(username, command), False
            result = jsonable_encoder(result, custom_encoder={Decimal: str})
        except OrderKeyConflict as error:
            log_event("ORDER_KEY_CONFLICT", ticker=command.ticker)
            raise HTTPException(status_code=409, detail=str(error)) from error
        except TradingError as error:
            log_event("ORDER_REJECTED", ticker=command.ticker, reason=str(error))
            # Só o dono da ordem é avisado da rejeição.
            realtime.publish(make_event("ORDER_REJECTED", {
                "order_id": None,
                "user_id": market.user_id(username),
                "reason": str(error),
            }), username=username)
            raise HTTPException(status_code=400, detail=str(error)) from error

        if replayed:
            log_event("ORDER_REPLAYED", order_id=result["order"]["order_id"])
            response.status_code = 200
            return result

        log_event("ORDER_ACCEPTED", order_id=result["order"]["order_id"],
                  ticker=command.ticker, status=result["order"]["status"])
        # Só o dono da ordem é avisado da aceitação (todas as abas dele).
        realtime.publish(make_event("ORDER_ACCEPTED", result["order"]), username=username)
        if matching:
            realtime.publish(make_event("BOOK_UPDATED", {"ticker": command.ticker}))
        return result

    if matching:
        @app.post("/orders/{order_id}/cancel")
        def cancel_order(order_id: str, username: str = Depends(current_user)):
            try:
                result = market.cancel(username, order_id)
            except TradingError as error:
                raise HTTPException(status_code=404, detail=str(error)) from error
            log_event("ORDER_CANCELLED", order_id=order_id, ticker=result["order"]["ticker"])
            realtime.publish(make_event("BOOK_UPDATED", {"ticker": result["order"]["ticker"]}))
            return jsonable_encoder(result, custom_encoder={Decimal: str})

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, token: str = ""):
        # Mesma validação das rotas REST: o token precisa ser de uma sessão ativa.
        with market.lock:
            username = market.sessions.get(token)

        if username is None:
            # Aceita e fecha com 1008 para o cliente saber que o token é inválido
            # (ex.: servidor reiniciado) e não ficar tentando reconectar.
            await websocket.accept()
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Sessão inválida")
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


app = create_app(
    matching=getenv("BOLSA_MATCHING") == "1",
    market_db=getenv("BOLSA_MARKET_DB"),
)
