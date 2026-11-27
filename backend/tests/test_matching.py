from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Event
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from main import OrderCommand, create_app
from app.trading import TradingError


class MatchingTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app(matching=True)
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)

    def login(self, username):
        response = self.client.post("/demo/sessions", json={"username": username})
        self.assertEqual(response.status_code, 201)
        return {"Authorization": "Bearer " + response.json()["access_token"]}

    def order(self, headers, side, quantity, price, status=201):
        response = self.client.post("/orders", headers=headers, json={
            "ticker": "PETR4", "side": side, "quantity": quantity, "price": price,
        })
        self.assertEqual(response.status_code, status)
        return response.json()

    def test_price_time_priority_and_partial_execution(self):
        older, newer, best, buyer = [self.login(name) for name in ("older", "newer", "best", "buyer")]
        self.order(older, "SELL", 4, "39.00")
        self.order(newer, "SELL", 4, "39.00")
        self.order(best, "SELL", 2, "38.00")
        result = self.order(buyer, "BUY", 5, "40.00")

        self.assertEqual(result["order"]["status"], "FILLED")
        state = result["state"]
        self.assertEqual(state["balance"], "807.00")
        self.assertEqual(state["positions"]["PETR4"], 15)
        self.assertEqual(state["portfolio"]["PETR4"], {
            "average_price": "38.53", "unrealized_profit": "7.00",
        })
        self.assertEqual(next(asset for asset in state["assets"] if asset["ticker"] == "PETR4")["volume"], 5)
        self.assertEqual(state["books"]["PETR4"]["sell_orders"], [{"price": "39.00", "quantity": 5}])
        self.assertEqual([(trade["price"], trade["quantity"]) for trade in state["trades"]],
                         [("39.00", 3), ("38.00", 2)])
        older_state = self.client.get("/state", headers=older).json()
        newer_state = self.client.get("/state", headers=newer).json()
        self.assertEqual(older_state["orders"][0]["status"], "PARTIALLY_FILLED")
        self.assertEqual(older_state["balance"], "1117.00")
        self.assertEqual(older_state["positions"]["PETR4"], 7)
        self.assertEqual(older_state["portfolio"]["PETR4"], {
            "average_price": "38.50", "unrealized_profit": "3.50",
        })
        self.assertEqual(newer_state["orders"][0]["status"], "OPEN")
        order_id = older_state["orders"][0]["order_id"]
        cancelled = self.client.post(f"/orders/{order_id}/cancel", headers=older).json()
        self.assertEqual(cancelled["order"]["cancelled_quantity"], 1)
        self.assertEqual(cancelled["state"]["available_positions"]["PETR4"], 7)
        self.assertEqual(cancelled["state"]["trades"][0]["quantity"], 3)

    def test_reservations_cancel_authorization_and_self_cross(self):
        owner, other = self.login("owner"), self.login("other")
        result = self.order(owner, "BUY", 10, "80.00")
        self.assertEqual(result["state"]["available_balance"], "200.00")
        self.order(owner, "BUY", 3, "80.00", status=400)
        self.order(owner, "SELL", 1, "80.00", status=400)
        cancel = f"/orders/{result['order']['order_id']}/cancel"
        self.assertEqual(self.client.post(cancel, headers=other).status_code, 404)

        self.order(other, "SELL", 10, "90.00")
        self.order(other, "SELL", 1, "91.00", status=400)

        cancelled = self.client.post(cancel, headers=owner)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()["order"]["status"], "CANCELLED")
        self.assertEqual(cancelled.json()["state"]["available_balance"], "1000.00")
        self.assertEqual(self.client.post(cancel, headers=owner).status_code, 404)

    def test_concurrent_orders_cannot_reserve_same_balance(self):
        market = self.app.state.market
        market.login("buyer")
        command = OrderCommand(ticker="PETR4", side="BUY", quantity=1, price="600.00")

        def submit(_):
            try:
                market.submit("buyer", command)
                return True
            except TradingError:
                return False

        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(sum(pool.map(submit, range(8))), 1)
        self.assertEqual(market.snapshot("buyer")["available_balance"], Decimal("400.00"))

    def test_book_notification_recovers_state_through_rest(self):
        seller, buyer = self.login("seller"), self.login("buyer")
        token = seller["Authorization"].split()[1]
        with self.client.websocket_connect(f"/ws?token={token}") as socket:
            self.order(buyer, "BUY", 1, "40.00")
            self.assertEqual(socket.receive_json()["type"], "BOOK_UPDATED")
        self.order(seller, "SELL", 1, "39.00")
        with self.client.websocket_connect(f"/ws?token={token}"):
            state = self.client.get("/state", headers=seller).json()
        self.assertEqual(state["revision"], 2)
        self.assertEqual(state["trades"][0]["price"], "40.00")

    def test_order_retry_after_lost_response_does_not_trade_twice(self):
        seller, buyer = self.login("retry-seller"), self.login("retry-buyer")
        self.order(seller, "SELL", 4, "39.00")
        headers = {**buyer, "Idempotency-Key": "lost-response"}
        command = {"ticker": "PETR4", "side": "BUY", "quantity": 2, "price": "40.00"}
        self.client.post("/orders", headers=headers, json=command)

        retry = self.client.post("/orders", headers=headers, json=command)
        self.assertEqual(retry.status_code, 200)
        state = retry.json()["state"]
        self.assertEqual(state["revision"], 2)
        self.assertEqual(state["balance"], "922.00")
        self.assertEqual(len(state["orders"]), 1)
        self.assertEqual(len(state["trades"]), 1)
        conflict = self.client.post("/orders", headers=headers, json={**command, "quantity": 3})
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(self.client.get("/state", headers=buyer).json(), state)

    def test_idempotency_under_concurrent_http_requests(self):
        headers = {**self.login("concurrent-retry"), "Idempotency-Key": "same-order"}
        command = {"ticker": "PETR4", "side": "BUY", "quantity": 1, "price": "20.00"}

        def submit(_):
            return self.client.post("/orders", headers=headers, json=command)

        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(submit, range(4)))
        self.assertEqual(sorted(response.status_code for response in responses), [200, 200, 200, 201])
        self.assertEqual(len({response.json()["order"]["order_id"] for response in responses}), 1)


class PersistentMatchingTest(unittest.TestCase):
    def test_buy_racing_cancellation_preserves_market_after_restart(self):
        for first in ("buy", "cancel"):
            with self.subTest(first=first), TemporaryDirectory() as directory:
                db = Path(directory) / "market-demo.db"
                self.check_buy_cancel_race(db, first)

    def check_buy_cancel_race(self, db, first):
        app = create_app(matching=True, market_db=db)
        first_writing = Event()
        second_arrived = Event()
        release_write = Event()

        @app.middleware("http")
        async def observe_competing_request(request, call_next):
            if request.headers.get("X-Test-Competitor") == "yes":
                second_arrived.set()
            return await call_next(request)

        with TestClient(app) as client:
            seller, buyer = [
                {"Authorization": "Bearer " + client.post(
                    "/demo/sessions", json={"username": name},
                ).json()["access_token"]}
                for name in ("seller", "buyer")
            ]
            sale = {"ticker": "PETR4", "side": "SELL", "quantity": 4, "price": "39.00"}
            offer = client.post("/orders", headers=seller, json=sale)
            self.assertEqual(offer.status_code, 201)
            cancel_path = f"/orders/{offer.json()['order']['order_id']}/cancel"
            purchase = {"ticker": "PETR4", "side": "BUY", "quantity": 2, "price": "40.00"}
            buyer["Idempotency-Key"] = "buy-during-cancellation"

            def request(operation):
                headers = buyer if operation == "buy" else seller
                if operation != first:
                    headers = {**headers, "X-Test-Competitor": "yes"}
                if operation == "buy":
                    return client.post("/orders", headers=headers, json=purchase)
                return client.post(cancel_path, headers=headers)

            save = app.state.market.store.save

            def pause_first_write(checkpoint):
                if not first_writing.is_set():
                    first_writing.set()
                    if not release_write.wait(10):
                        raise TimeoutError("A primeira gravação não foi liberada.")
                save(checkpoint)

            second = "cancel" if first == "buy" else "buy"
            with patch.object(app.state.market.store, "save", side_effect=pause_first_write), \
                    ThreadPoolExecutor(max_workers=2) as pool:
                first_response = pool.submit(request, first)
                try:
                    self.assertTrue(first_writing.wait(10))
                    second_response = pool.submit(request, second)
                    self.assertTrue(second_arrived.wait(10))
                finally:
                    release_write.set()
                responses = {first: first_response.result(10), second: second_response.result(10)}
            self.assertEqual(responses["buy"].status_code, 201)
            self.assertEqual(responses["cancel"].status_code, 200)
            before = [client.get("/state", headers=headers).json() for headers in (seller, buyer)]

        with TestClient(create_app(matching=True, market_db=db)) as client:
            after = [client.get("/state", headers=headers).json() for headers in (seller, buyer)]
            self.assertEqual(after, before)
            replay = client.post("/orders", headers=buyer, json=purchase)
            self.assertEqual(replay.status_code, 200)
            self.assertEqual(replay.json()["order"]["order_id"], responses["buy"].json()["order"]["order_id"])
            self.assertEqual(replay.json()["state"], after[1])

        seller_state, buyer_state = after
        book = seller_state["books"]["PETR4"]
        self.assertEqual(book["sell_orders"], [])
        self.assertEqual(buyer_state["books"]["PETR4"], book)
        self.assertEqual(seller_state["orders"][0]["status"], "CANCELLED")
        self.assertEqual(seller_state["revision"], 3)
        self.assertEqual(buyer_state["revision"], 3)
        traded = first == "buy"
        self.assertEqual(seller_state["orders"][0]["cancelled_quantity"], 2 if traded else 4)
        self.assertEqual(seller_state["positions"]["PETR4"], 8 if traded else 10)
        self.assertEqual(seller_state["available_positions"]["PETR4"], 8 if traded else 10)
        self.assertEqual(buyer_state["positions"]["PETR4"], 12 if traded else 10)
        self.assertEqual(seller_state["balance"], "1078.00" if traded else "1000.00")
        self.assertEqual(buyer_state["balance"], "922.00" if traded else "1000.00")
        self.assertEqual(buyer_state["available_balance"], "922.00" if traded else "920.00")
        self.assertEqual(buyer_state["orders"][0]["status"], "FILLED" if traded else "OPEN")
        self.assertEqual(book["buy_orders"], [] if traded else [{"price": "40.00", "quantity": 2}])
        self.assertEqual(seller_state["trades"], buyer_state["trades"])
        self.assertEqual(len(buyer_state["trades"]), int(traded))
        if traded:
            self.assertEqual(buyer_state["trades"][0]["quantity"], 2)
            self.assertEqual(buyer_state["trades"][0]["price"], "39.00")

    def test_partial_order_and_idempotency_survive_app_restart(self):
        with TemporaryDirectory() as directory:
            db = Path(directory) / "market-demo.db"
            sale = {"ticker": "PETR4", "side": "SELL", "quantity": 4, "price": "39.00"}
            purchase = {"ticker": "PETR4", "side": "BUY", "quantity": 2, "price": "40.00"}
            with TestClient(create_app(matching=True, market_db=db)) as client:
                seller, buyer = [
                    {"Authorization": "Bearer " + client.post(
                        "/demo/sessions", json={"username": name},
                    ).json()["access_token"]}
                    for name in ("seller", "buyer")
                ]
                self.assertEqual(client.post("/orders", headers=seller, json=sale).status_code, 201)
                buyer["Idempotency-Key"] = "purchase-before-restart"
                created = client.post("/orders", headers=buyer, json=purchase)
                self.assertEqual(created.status_code, 201)
                buyer_before = created.json()["state"]
                seller_before = client.get("/state", headers=seller).json()

            with TestClient(create_app(matching=True, market_db=db)) as client:
                recovered = client.get("/state", headers=seller).json()
                self.assertEqual(recovered, seller_before)
                self.assertEqual(recovered["balance"], "1078.00")
                self.assertEqual(recovered["positions"]["PETR4"], 8)
                self.assertEqual(recovered["orders"][0]["status"], "PARTIALLY_FILLED")
                self.assertEqual(recovered["books"]["PETR4"]["sell_orders"], [
                    {"price": "39.00", "quantity": 2},
                ])
                self.assertEqual(client.get("/state", headers=buyer).json(), buyer_before)
                self.assertEqual(buyer_before["balance"], "922.00")
                self.assertEqual(buyer_before["positions"]["PETR4"], 12)
                replay = client.post("/orders", headers=buyer, json=purchase)
                self.assertEqual(replay.status_code, 200)
                self.assertEqual(replay.json(), created.json())
                order_id = recovered["orders"][0]["order_id"]
                cancelled = client.post(f"/orders/{order_id}/cancel", headers=seller).json()
                self.assertEqual(cancelled["state"]["available_positions"]["PETR4"], 8)

    def test_failed_save_rolls_back_memory_and_publishes_no_event(self):
        with TemporaryDirectory() as directory:
            db = Path(directory) / "market-demo.db"
            app = create_app(matching=True, market_db=db)
            with TestClient(app, raise_server_exceptions=False) as client:
                token = client.post("/demo/sessions", json={"username": "buyer"}).json()["access_token"]
                headers = {"Authorization": "Bearer " + token, "Idempotency-Key": "retry"}
                command = {"ticker": "PETR4", "side": "BUY", "quantity": 1, "price": "38.00"}
                before = client.get("/state", headers=headers).json()
                with patch.object(app.state.market.store, "save", side_effect=OSError("disk unavailable")), \
                        patch.object(app.state.realtime, "publish") as publish:
                    failed = client.post("/orders", headers=headers, json=command)
                    self.assertEqual(failed.status_code, 500)
                    publish.assert_not_called()
                self.assertEqual(client.get("/state", headers=headers).json(), before)
                self.assertEqual(client.post("/orders", headers=headers, json=command).status_code, 201)
