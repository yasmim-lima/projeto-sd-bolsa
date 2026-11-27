"""Mercado experimental com livro e liquidação em um único processo."""
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from app.market_store import deserialize, serialize
from app.observability import log_event
from app.trading import DemoMarket, TradingError


INITIAL_SHARES = 10
CENT = Decimal("0.01")


class OrderKeyConflict(Exception):
    pass


class OrderBookMarket(DemoMarket):
    def __init__(self, store=None):
        super().__init__()
        self.books = {ticker: {"BUY": [], "SELL": []} for ticker in self.assets}
        self.trades = []
        self.revision = 0
        self.order_keys = {}
        self.store = store
        if store is not None:
            self.committed = store.load() or self._checkpoint()
            self._restore(self.committed)

    def _checkpoint(self):
        return serialize({
            "accounts": self.accounts,
            "sessions": self.sessions,
            "assets": self.assets,
            "trades": self.trades,
            "revision": self.revision,
            "books": {
                ticker: {
                    side: [(username, order["order_id"]) for username, order in orders]
                    for side, orders in book.items()
                }
                for ticker, book in self.books.items()
            },
            "order_keys": [
                (username, key, fingerprint, order["order_id"])
                for (username, key), (fingerprint, order) in self.order_keys.items()
            ],
        })

    def _restore(self, checkpoint):
        state = deserialize(checkpoint)
        self.accounts = state["accounts"]
        self.sessions = state["sessions"]
        self.assets = state["assets"]
        self.trades = state["trades"]
        self.revision = state["revision"]
        orders = {
            order["order_id"]: order
            for account in self.accounts.values() for order in account["orders"]
        }
        self.books = {
            ticker: {
                side: [(username, orders[order_id]) for username, order_id in entries]
                for side, entries in book.items()
            }
            for ticker, book in state["books"].items()
        }
        self.order_keys = {
            (username, key): (tuple(fingerprint), orders[order_id])
            for username, key, fingerprint, order_id in state["order_keys"]
        }

    @contextmanager
    def _mutation(self):
        first_trade = len(self.trades)
        try:
            yield
            if self.store is not None:
                checkpoint = self._checkpoint()
                self.store.save(checkpoint)
                self.committed = checkpoint
        except Exception:
            if self.store is not None:
                self._restore(self.committed)
            raise
        for trade in self.trades[first_trade:]:
            log_event("TRADE_EXECUTED", **{
                key: str(value) if isinstance(value, Decimal) else value
                for key, value in trade.items() if key != "participant_ids"
            })

    def login(self, username):
        with self.lock, self._mutation():
            new_account = username not in self.accounts
            token = super().login(username)
            if new_account:
                self.accounts[username]["positions"] = dict.fromkeys(self.assets, INITIAL_SHARES)
            return token

    def tick(self):
        """Neste modo, a cotação só muda quando há negócio."""

    @staticmethod
    def _levels(orders):
        totals = {}
        for _, order in orders:
            price = order["price"]
            totals[price] = totals.get(price, 0) + order["remaining_quantity"]
        return [{"price": price, "quantity": quantity} for price, quantity in totals.items()]

    def _available(self, account):
        reserved_cash = Decimal("0.00")
        reserved_positions = dict.fromkeys(self.assets, 0)
        for order in account["orders"]:
            remaining = order["remaining_quantity"]
            if order["side"] == "BUY":
                reserved_cash += order["price"] * remaining
            else:
                reserved_positions[order["ticker"]] += remaining

        return (
            account["balance"] - reserved_cash,
            {
                ticker: quantity - reserved_positions[ticker]
                for ticker, quantity in account["positions"].items()
            },
        )

    def _snapshot(self, account):
        state = super()._snapshot(account)
        available_balance, available_positions = self._available(account)
        quantity = dict.fromkeys(self.assets, INITIAL_SHARES)
        cost = {ticker: asset["opening_price"] * INITIAL_SHARES for ticker, asset in self.assets.items()}
        volume = dict.fromkeys(self.assets, 0)
        own_trades = []
        for trade in self.trades:
            ticker, units = trade["ticker"], trade["quantity"]
            volume[ticker] += units
            buyer, seller = trade["participant_ids"]
            if account["user_id"] == buyer:
                cost[ticker] += trade["price"] * units
                quantity[ticker] += units
            elif account["user_id"] == seller:
                remaining = quantity[ticker] - units
                cost[ticker] = cost[ticker] * remaining / quantity[ticker]
                quantity[ticker] = remaining
            else:
                continue
            own_trades.append({key: value for key, value in trade.items() if key != "participant_ids"})

        portfolio = {}
        for asset in state["assets"]:
            ticker = asset["ticker"]
            units = quantity[ticker]
            asset["volume"] = volume[ticker]
            portfolio[ticker] = {
                "average_price": (cost[ticker] / units).quantize(CENT) if units else None,
                "unrealized_profit": (asset["price"] * units - cost[ticker]).quantize(CENT),
            }
        state.update(
            revision=self.revision,
            available_balance=available_balance,
            available_positions=available_positions,
            books={
                ticker: {
                    "buy_orders": self._levels(book["BUY"]),
                    "sell_orders": self._levels(book["SELL"]),
                }
                for ticker, book in self.books.items()
            },
            portfolio=portfolio,
            trades=list(reversed(own_trades)),
        )
        return state

    def submit(self, username, command):
        return self.submit_once(username, command, None)[0]

    def _submit(self, username, command):
        with self.lock:
            if command.ticker not in self.books:
                raise TradingError("Ativo desconhecido.")

            account = self.accounts[username]
            available_balance, available_positions = self._available(account)
            if command.side == "BUY" and command.price * command.quantity > available_balance:
                raise TradingError("Saldo disponível insuficiente para esta compra.")
            if command.side == "SELL" and command.quantity > available_positions[command.ticker]:
                raise TradingError("Quantidade disponível insuficiente para esta venda.")

            book = self.books[command.ticker]
            is_buy = command.side == "BUY"
            opposing = book["SELL" if is_buy else "BUY"]
            crossing = []
            for owner, resting in opposing:
                price = resting["price"]
                if (is_buy and price > command.price) or (not is_buy and price < command.price):
                    break
                if owner == username:
                    raise TradingError("Ordem cruza uma oferta da própria conta.")
                crossing.append((owner, resting))

            order = {
                "order_id": str(uuid4()),
                "user_id": account["user_id"],
                "ticker": command.ticker,
                "side": command.side,
                "quantity": command.quantity,
                "remaining_quantity": command.quantity,
                "price": command.price,
                "status": "OPEN",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            account["orders"].append(order)
            for owner, resting in crossing:
                if not order["remaining_quantity"]:
                    break
                self._execute(username, order, owner, resting)
                if not resting["remaining_quantity"]:
                    opposing.pop(0)

            if order["remaining_quantity"]:
                orders = book[command.side]
                orders.append((username, order))
                orders.sort(key=lambda entry: entry[1]["price"], reverse=is_buy)

            self.revision += 1
            return {
                "order": dict(order),
                "state": self._snapshot(account),
            }

    def submit_once(self, username, command, key):
        with self.lock:
            scoped_key = (username, key)
            account = self.accounts[username]
            fingerprint = (command.ticker, command.side, command.quantity, command.price)
            previous = self.order_keys.get(scoped_key) if key is not None else None
            if previous is not None:
                previous_fingerprint, order = previous
                if previous_fingerprint != fingerprint:
                    raise OrderKeyConflict("Chave já usada em outra ordem.")
                return {"order": dict(order), "state": self._snapshot(account)}, True
            with self._mutation():
                result = self._submit(username, command)
                if key is not None:
                    self.order_keys[scoped_key] = (fingerprint, account["orders"][-1])
                return result, False

    def _execute(self, username, order, owner, resting):
        ticker = order["ticker"]
        quantity = min(order["remaining_quantity"], resting["remaining_quantity"])
        price = resting["price"]
        buyer, seller = self.accounts[username], self.accounts[owner]
        if order["side"] == "SELL":
            buyer, seller = seller, buyer

        buyer["balance"] -= price * quantity
        seller["balance"] += price * quantity
        buyer["positions"][ticker] += quantity
        seller["positions"][ticker] -= quantity
        for matched in (order, resting):
            matched["remaining_quantity"] -= quantity
            matched["status"] = "PARTIALLY_FILLED" if matched["remaining_quantity"] else "FILLED"

        asset = self.assets[ticker]
        asset["price"] = price
        asset["history"] = (asset["history"] + [price])[-15:]
        self.trades.append({
            "trade_id": str(uuid4()),
            "ticker": ticker,
            "price": price,
            "quantity": quantity,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "participant_ids": (buyer["user_id"], seller["user_id"]),
            "incoming_order_id": order["order_id"],
            "resting_order_id": resting["order_id"],
        })

    def cancel(self, username, order_id):
        with self.lock, self._mutation():
            account = self.accounts[username]
            for order in account["orders"]:
                if order["order_id"] != order_id or not order["remaining_quantity"]:
                    continue
                orders = self.books[order["ticker"]][order["side"]]
                orders.remove((username, order))
                order["cancelled_quantity"] = order["remaining_quantity"]
                order["remaining_quantity"] = 0
                order["status"] = "CANCELLED"
                self.revision += 1
                return {"order": dict(order), "state": self._snapshot(account)}
            raise TradingError("Ordem aberta não encontrada.")
