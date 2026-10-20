# Especificação da API

## WebSocket

**Rota:** `ws://localhost:8000/ws?token=<JWT>`

Todas as mensagens seguem o formato:

```json
{ "type": "<TIPO>", "timestamp": "<ISO 8601>", "data": { } }
```

| Tipo | Quando | `data` |
|---|---|---|
| `ORDER_ACCEPTED` | ordem validada e registrada | `order_id`, `user_id`, `ticker`, `side`, `quanty`, `price` |
| `ORDER_REJECTED` | ordem recusada | `order_id`, `user_id`, `reason` |
| `BOOK_UPDATED` | livro de ofertas mudou | `ticker`, `buy_orders` [{`price`, `quanty`}], `sell_orders` [{`price`, `quanty`}] |
| `PRICE_UPDATED` | preço de um ativo mudou | `ticker`, `price`, `change_percent` |

- `side`: `"BUY"` ou `"SELL"`.
- `ORDER_ACCEPTED` e `ORDER_REJECTED` são enviados apenas ao dono da ordem.
- `BOOK_UPDATED` e `PRICE_UPDATED` são enviados a todos os clientes conectados.

### Exemplo

```json
{
  "type": "PRICE_UPDATED",
  "timestamp": "2026-10-21T14:30:00Z",
  "data": { "ticker": "PETR4", "price": 38.42, "change_pct": 1.25 }
}
```

### Desconexão e reconexão

- O servidor remove da lista de clientes ativos qualquer conexão encerrada.
- Ao perder a conexão, o cliente tenta reconectar a cada 2 segundos.
- Ao reconectar, o cliente busca o estado atual via REST (saldo, carteira, ordens, cotações), pois eventos enviados durante a queda não são reenviados.
- O servidor é a fonte da verdade; a tela do cliente tem consistência eventual e se corrige ao reconectar.
