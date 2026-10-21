"""Estado compartilhado do protótipo, sem persistência ou matching real."""
from datetime import datetime, timezone
from decimal import Decimal
from random import randint
from threading import RLock
from uuid import uuid4


class TradingError(Exception):
    pass


class DemoMarket:
    def __init__(self):
        self.lock = RLock()
        self.accounts = {}
        self.sessions = {}
        self.assets = {
            ticker: {"ticker": ticker, "name": name, "price": Decimal(price),
                     "opening_price": Decimal(price), "history": [Decimal(price)]}
            for ticker, name, price in (
                ("PETR4", "Petrobras", "38.50"),
                ("VALE3", "Vale", "65.20"),
                ("ITUB4", "Itaú", "32.10"),
            )
        }

    def login(self, username):
        with self.lock:
            if username not in self.accounts:
                self.accounts[username] = {
                    "user_id": str(uuid4()), "balance": Decimal("1000.00"),
                    "positions": {ticker: 0 for ticker in self.assets}, "orders": [],
                }
            token = str(uuid4())
            self.sessions[token] = username
            return token

    def tick(self):
        with self.lock:
            for asset in self.assets.values():
                asset["price"] = max(Decimal("1.00"), asset["price"] + Decimal(randint(-25, 25)) / 100)
                asset["history"] = (asset["history"] + [asset["price"]])[-15:]

    def _snapshot(self, account):
        assets = [{
            **asset, "history": list(asset["history"]),
            "change_percent": ((asset["price"] - asset["opening_price"])
                               / asset["opening_price"] * 100).quantize(Decimal("0.01")),
        } for asset in self.assets.values()]
        return {
            "user_id": account["user_id"], "balance": account["balance"],
            "positions": dict(account["positions"]),
            "orders": [dict(order) for order in reversed(account["orders"])],
            "assets": assets,
            "equity": account["balance"] + sum(
                self.assets[ticker]["price"] * quantity
                for ticker, quantity in account["positions"].items()),
        }

    def snapshot(self, username):
        with self.lock:
            return self._snapshot(self.accounts[username])

    def submit(self, username, command):
        with self.lock:
            if command.ticker not in self.assets:
                raise TradingError("Ativo desconhecido.")
            account = self.accounts[username]
            total = command.price * command.quantity
            position = account["positions"][command.ticker]
            if command.side == "BUY" and total > account["balance"]:
                raise TradingError("Saldo insuficiente para esta compra.")
            if command.side == "SELL" and command.quantity > position:
                raise TradingError("Quantidade de ações insuficiente para esta venda.")
            # Contraparte simulada: execução imediata ao preço informado.
            direction = 1 if command.side == "BUY" else -1
            account["balance"] -= direction * total
            account["positions"][command.ticker] += direction * command.quantity
            order = {
                "order_id": str(uuid4()), "user_id": account["user_id"],
                "ticker": command.ticker, "side": command.side,
                "quantity": command.quantity, "price": command.price,
                "status": "FILLED", "created_at": datetime.now(timezone.utc).isoformat(),
            }
            account["orders"].append(order)
            return {"order": dict(order), "state": self._snapshot(account)}
