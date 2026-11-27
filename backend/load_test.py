"""Gera carga REST no modo experimental e verifica invariantes após cada cenário."""
import argparse
import asyncio
from collections import Counter
from decimal import Decimal
import json
from math import ceil
from statistics import mean
from time import perf_counter
from uuid import uuid4

import httpx


async def scenario(client, users, rounds):
    prefix = uuid4().hex[:12]

    async def login(index):
        response = await client.post("/demo/sessions", json={"username": f"load-{prefix}-{index}"})
        response.raise_for_status()
        return {"Authorization": "Bearer " + response.json()["access_token"]}

    async def snapshot(headers):
        response = await client.get("/state", headers=headers)
        response.raise_for_status()
        state = response.json()
        if "books" not in state:
            raise RuntimeError("O teste exige BOLSA_MATCHING=1.")
        return state

    accounts = await asyncio.gather(*(login(index) for index in range(users)))
    before = await asyncio.gather(*(snapshot(headers) for headers in accounts))
    latencies = []
    statuses = Counter()
    order_ids = set()
    errors = []

    async def submit(headers, side, key, replay):
        payload = {"ticker": "PETR4", "side": side, "quantity": 1, "price": "38.50"}
        start = perf_counter()
        try:
            response = await client.post("/orders", headers={**headers, "Idempotency-Key": key}, json=payload)
        except httpx.RequestError as error:
            statuses["transport"] += 1
            errors.append(type(error).__name__)
            return None
        finally:
            latencies.append((perf_counter() - start) * 1000)
        statuses[str(response.status_code)] += 1
        if response.status_code != (200 if replay else 201):
            errors.append(f"HTTP {response.status_code} em {side}")
            return None
        return response.json()["order"]["order_id"]

    split = users // 2
    sides = ["SELL"] * split + ["BUY"] * (users - split)
    started = perf_counter()
    for step in range(rounds):
        keys = [f"{prefix}-{step}-{index}" for index in range(users)]
        issued = await asyncio.gather(*(
            submit(headers, side, key, False)
            for headers, side, key in zip(accounts, sides, keys)
        ))
        order_ids.update(order_id for order_id in issued if order_id)
        for index in (0, split):
            if issued[index]:
                repeated = await submit(accounts[index], sides[index], keys[index], True)
                if repeated != issued[index]:
                    errors.append("Reenvio retornou outro ID de ordem.")
    elapsed = perf_counter() - started
    after = await asyncio.gather(*(snapshot(headers) for headers in accounts))
    trade_counts = Counter(trade["trade_id"] for state in after for trade in state["trades"])

    if sum(Decimal(state["balance"]) for state in before) != sum(Decimal(state["balance"]) for state in after):
        errors.append("A soma dos saldos mudou.")
    for ticker in before[0]["positions"]:
        if sum(state["positions"][ticker] for state in before) != sum(state["positions"][ticker] for state in after):
            errors.append(f"A quantidade total de {ticker} mudou.")
    recorded = [order["order_id"] for state in after for order in state["orders"]]
    if len(recorded) != users * rounds or len(set(recorded)) != len(recorded) or set(recorded) != order_ids:
        errors.append("Quantidade ou unicidade de ordens divergente.")
    if len(trade_counts) != split * rounds or any(count != 2 for count in trade_counts.values()):
        errors.append("Negociação ausente, duplicada ou sem as duas contrapartes.")

    for state in after:
        open_orders = [order for order in state["orders"] if order["remaining_quantity"]]
        reserved_cash = sum(Decimal(order["price"]) * order["remaining_quantity"]
                            for order in open_orders if order["side"] == "BUY")
        available = Decimal(state["available_balance"])
        if available < 0 or available != Decimal(state["balance"]) - reserved_cash:
            errors.append("Reserva de saldo divergente.")
        for ticker, position in state["positions"].items():
            reserved = sum(order["remaining_quantity"] for order in open_orders
                           if order["side"] == "SELL" and order["ticker"] == ticker)
            if position - reserved < 0 or state["available_positions"][ticker] != position - reserved:
                errors.append(f"Reserva de {ticker} divergente.")

    for side, levels in (("BUY", "buy_orders"), ("SELL", "sell_orders")):
        expected = Counter()
        for state in after:
            for order in state["orders"]:
                if order["side"] == side and order["remaining_quantity"]:
                    expected[Decimal(order["price"])] += order["remaining_quantity"]
        actual = {
            Decimal(level["price"]): level["quantity"]
            for level in after[0]["books"]["PETR4"][levels]
        }
        if actual != expected:
            errors.append(f"Livro de {side} diverge das ordens abertas.")

    cancelled = await asyncio.gather(*(
        client.post(f"/orders/{order['order_id']}/cancel", headers=headers)
        for headers, state in zip(accounts, after)
        for order in state["orders"] if order["remaining_quantity"]
    ))
    if any(response.status_code != 200 for response in cancelled):
        errors.append("Falha ao limpar as ordens abertas do cenário.")
    latencies.sort()
    return {
        "users": users,
        "rounds": rounds,
        "seconds": round(elapsed, 3),
        "orders_per_second": round(len(order_ids) / elapsed, 2),
        "trades_per_second": round(len(trade_counts) / elapsed, 2),
        "mean_ms": round(mean(latencies), 2),
        "p95_ms": round(latencies[ceil(0.95 * len(latencies)) - 1], 2),
        "max_ms": round(latencies[-1], 2),
        "statuses": dict(statuses),
        "errors": sorted(set(errors)),
    }


async def run(args):
    limits = httpx.Limits(max_connections=max(args.users), max_keepalive_connections=max(args.users))
    failed = False
    async with httpx.AsyncClient(base_url=args.url, limits=limits, timeout=15) as client:
        for users in args.users:
            result = await scenario(client, users, args.rounds)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            failed |= bool(result["errors"])
    return int(failed)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8080/api")
    parser.add_argument("--users", nargs="+", type=int, default=[5, 20, 50, 100])
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args()
    if min(args.users) < 2 or not 1 <= args.rounds <= 10:
        parser.error("Use pelo menos 2 investidores e de 1 a 10 rodadas.")
    raise SystemExit(asyncio.run(run(args)))
