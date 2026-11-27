"""Agente de liquidez para o modo experimental de negociação."""
import argparse
from decimal import Decimal
import json
import logging
from random import Random
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


LOGGER = logging.getLogger(__name__)


class LiquidityBot:
    def __init__(self, base_url, username, seed):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.rng = Random(seed)
        self.token = None

    def request(self, path, body=None):
        headers = {}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = Request(
            self.base_url + path,
            data=json.dumps(body).encode("utf-8") if body is not None else None,
            headers=headers,
        )
        with urlopen(request, timeout=5) as response:
            return json.load(response)

    def cycle(self):
        if not self.token:
            self.token = self.request("/demo/sessions", {"username": self.username})["access_token"]
        state = self.request("/state")
        if "books" not in state:
            raise ValueError("Inicie o backend com BOLSA_MATCHING=1 para usar o NPC.")

        for asset in state["assets"]:
            ticker = asset["ticker"]
            reference = Decimal(asset["price"])
            prices = {
                "BUY": max(Decimal("0.01"), reference - Decimal("0.10")),
                "SELL": min(Decimal("9999999999.99"), reference + Decimal("0.10")),
            }
            for order in state["orders"]:
                if (order["ticker"] == ticker and order["remaining_quantity"]
                        and Decimal(order["price"]) != prices[order["side"]]):
                    result = self.request(f"/orders/{order['order_id']}/cancel", {})
                    state = result["state"]
            for side, price in prices.items():
                state = self.quote(state, ticker, side, price)

    def quote(self, state, ticker, side, price):
        if any(
            order["ticker"] == ticker and order["side"] == side
            and order["remaining_quantity"] and Decimal(order["price"]) == price
            for order in state["orders"]
        ):
            return state

        capacity = (
            int(Decimal(state["available_balance"]) // price) if side == "BUY"
            else state["available_positions"][ticker]
        )
        quantity = min(capacity, self.rng.randint(1, 3))
        if not quantity:
            return state
        result = self.request("/orders", {
            "ticker": ticker, "side": side, "quantity": quantity, "price": str(price),
        })
        LOGGER.info("%s %s %d a %s: %s", side, ticker, quantity, price, result["order"]["status"])
        return result["state"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--username", default="NPC Liquidez")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--interval", type=float, default=3)
    parser.add_argument("--once", action="store_true", help="Executa apenas um ciclo.")
    args = parser.parse_args()
    if not args.interval > 0 or args.interval == float("inf"):
        parser.error("--interval precisa ser positivo e finito")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    bot = LiquidityBot(args.url, args.username, args.seed)
    while True:
        try:
            bot.cycle()
        except HTTPError as error:
            if error.code == 401:
                bot.token = None
            LOGGER.warning("Ciclo interrompido pela API (HTTP %s).", error.code)
            if args.once:
                return 1
        except (URLError, TimeoutError) as error:
            LOGGER.warning("API indisponível: %s", error)
            if args.once:
                return 1
        except ValueError as error:
            parser.exit(1, f"{error}\n")
        if args.once:
            return 0
        sleep(args.interval)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
