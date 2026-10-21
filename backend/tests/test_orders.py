from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
import unittest

from fastapi.testclient import TestClient
from main import OrderCommand, create_app
from app.trading import TradingError


class OrdersTest(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = TestClient(self.app)
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.headers = self.login('venisson')

    def login(self, username):
        response = self.client.post('/demo/sessions', json={'username': username})
        self.assertEqual(response.status_code, 201)
        return {'Authorization': 'Bearer ' + response.json()['access_token']}

    def submit(self, **changes):
        return self.client.post('/orders', headers=self.headers, json={
            'ticker': 'PETR4', 'side': 'BUY', 'quantity': 10, 'price': '38.50', **changes,
        })

    def state(self):
        return self.client.get('/state', headers=self.headers).json()

    def test_initial_equity_and_session_required(self):
        self.assertEqual(self.client.get('/state').status_code, 401)
        self.assertEqual(self.client.post('/orders', json={
            'ticker': 'PETR4', 'side': 'BUY', 'quantity': 1, 'price': '1.00',
        }).status_code, 401)
        self.assertEqual(Decimal(self.state()['equity']), Decimal('1000'))

    def test_buy_sell_and_persisted_order_date(self):
        bought = self.submit()
        self.assertEqual(bought.status_code, 201)
        order = bought.json()['order']
        self.assertEqual(order['status'], 'FILLED')
        self.assertIn('+00:00', order['created_at'])
        self.assertEqual(Decimal(self.state()['balance']), Decimal('615.00'))
        self.assertEqual(self.state()['positions']['PETR4'], 10)
        sold = self.submit(side='SELL', quantity=3, price='40.00')
        self.assertEqual(sold.status_code, 201)
        state = self.state()
        self.assertEqual(Decimal(state['balance']), Decimal('735.00'))
        self.assertEqual(state['positions']['PETR4'], 7)
        self.assertEqual(state['orders'][1], order)
        self.assertNotEqual(state['orders'][0]['order_id'], order['order_id'])

    def test_rejections_do_not_change_account(self):
        before = self.state()
        for changes in ({'quantity': 1000}, {'side': 'SELL'}, {'ticker': 'INVALID'}):
            with self.subTest(changes=changes):
                self.assertEqual(self.submit(**changes).status_code, 400)
                self.assertEqual(self.state(), before)

    def test_invalid_fields(self):
        for changes in (
            {'quantity': 0}, {'quantity': -1}, {'quantity': 1.5},
            {'quantity': True}, {'quantity': '2'}, {'quantity': 1000001},
            {'price': '0'}, {'price': '-1.00'}, {'price': '1.001'},
            {'price': 'NaN'}, {'price': 'Infinity'}, {'price': '10000000000'},
            {'side': 'COMPRA'}, {'user_id': 'someone-else'},
        ):
            with self.subTest(changes=changes):
                self.assertEqual(self.submit(**changes).status_code, 422)
        self.assertEqual(self.state()['orders'], [])

    def test_accounts_are_isolated_and_relogin_retains_state(self):
        self.submit()
        other = self.login('outro')
        other_state = self.client.get('/state', headers=other).json()
        self.assertEqual(other_state['orders'], [])
        self.assertNotEqual(other_state['user_id'], self.state()['user_id'])
        self.headers = self.login('venisson')
        self.assertEqual(len(self.state()['orders']), 1)

    def test_decimal_precision(self):
        self.assertEqual(self.submit(quantity=3, price='0.10').status_code, 201)
        self.assertEqual(Decimal(self.state()['balance']), Decimal('999.70'))

    def test_concurrent_buys_cannot_overspend(self):
        command = OrderCommand(ticker='PETR4', side='BUY', quantity=1, price='600.00')
        market = self.app.state.market

        def buy(_):
            try:
                market.submit('venisson', command)
                return True
            except TradingError:
                return False

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(buy, range(8)))
        self.assertEqual(sum(results), 1)
        self.assertEqual(Decimal(self.state()['balance']), Decimal('400.00'))
        self.assertEqual(self.state()['positions']['PETR4'], 1)

    def test_shared_quotes_and_history(self):
        market = self.app.state.market
        for _ in range(20):
            market.tick()
        other = self.login('outro')
        other_state = self.client.get('/state', headers=other).json()
        self.assertEqual(self.state()['assets'], other_state['assets'])
        for asset in self.state()['assets']:
            self.assertEqual(len(asset['history']), 15)
            self.assertGreaterEqual(Decimal(asset['price']), 1)


if __name__ == '__main__':
    unittest.main()
