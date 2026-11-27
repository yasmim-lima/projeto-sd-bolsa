# Especificação da API

## WebSocket

**Rota direta:** `ws://localhost:8000/ws?token=<access_token>`

Use o `access_token` retornado por POST `/demo/sessions`. O token atual é
de uma sessão de demonstração em memória, não um JWT. Pelo proxy do Vite,
o frontend conecta em `/api/ws` no mesmo host da página.

Todos os eventos seguem o formato:

```json
{ "type": "<TIPO>", "timestamp": "<ISO 8601>", "data": { } }
```

| Tipo | Quando | `data` |
|---|---|---|
| `ORDER_ACCEPTED` | ordem validada, registrada e executada na simulação | `order_id`, `user_id`, `ticker`, `side`, `quantity`, `price`, `status`, `created_at` |
| `ORDER_REJECTED` | ativo desconhecido, saldo ou posição insuficientes | `order_id` nulo, `user_id`, `reason` |
| `PRICE_UPDATED` | preço de um ativo mudou | `ticker`, `price`, `change_percent` |

- `side`: `"BUY"` ou `"SELL"`.
- `ORDER_ACCEPTED` e `ORDER_REJECTED` são enviados apenas ao dono da ordem.
- `PRICE_UPDATED` é enviado a todos os clientes conectados, a cada atualização das cotações simuladas.
- `price` e `change_percent` são strings decimais; `quantity` é inteiro.
- No protótipo, `status` é `"FILLED"` e `created_at` é a data da ordem em ISO 8601 UTC.
- Erros REST `401` e `422` não geram `ORDER_REJECTED`.

### Modo experimental com livro de ofertas

Com `BOLSA_MATCHING=1`, `BOOK_UPDATED` é enviado a todos após uma ordem
aceita ou um cancelamento. Seu `data` contém apenas `ticker`. O cliente
consulta `GET /state` para obter o livro e seu estado privado. Neste modo,
a atualização do preço também chega por esse snapshot.

`/state` acrescenta `revision`, `available_balance`, `available_positions`,
`trades` (negociações da conta) e `books` (por ativo). Cada livro tem
`buy_orders` e `sell_orders`, com `price` e `quantity` agregados por nível.
`portfolio` informa `average_price` e `unrealized_profit` por ativo,
em strings decimais. Uma posição zerada tem `average_price` nulo.
Cada item de `assets` informa `volume`, a quantidade acumulada negociada.
A ordem pode ter estado `OPEN`, `PARTIALLY_FILLED`, `FILLED` ou `CANCELLED`
e inclui `remaining_quantity`. `POST /orders/{order_id}/cancel` cancela
o restante de uma ordem da conta autenticada e devolve `order` e `state`.

No modo experimental, `POST /orders` aceita o cabeçalho opcional
`Idempotency-Key` (1 a 128 caracteres). Se perder a resposta, repita a mesma
ordem com a mesma chave. Uma ordem nova recebe `201`. A repetição de uma
ordem já aceita recebe `200` com o estado atual e o mesmo ID, sem novo evento.
Reutilizar a chave com dados diferentes retorna `409`. A chave pertence à conta
e vale enquanto o estado do mercado estiver disponível. Sem
`BOLSA_MARKET_DB` ele é perdido no reinício. Com o SQLite experimental,
sessões, ordens e chaves são recuperadas juntas. Rejeições não reservam a
chave.

Se perder a confirmação, o Home Broker mantém a ordem original e oferece
o botão **Reenviar a mesma ordem** enquanto a sessão estiver ativa. A
confirmação pendente fica na página aberta e se perde ao recarregar.

### Exemplo

```json
{
  "type": "PRICE_UPDATED",
  "timestamp": "2026-10-21T14:30:00Z",
  "data": { "ticker": "PETR4", "price": "38.42", "change_percent": "-0.21" }
}
```

### Desconexão e reconexão

- O servidor remove da lista de clientes ativos qualquer conexão encerrada.
- Ao perder a conexão, o cliente tenta reconectar após 2 segundos.
- Ao conectar ou reconectar, o cliente busca o estado atual via GET `/state` (saldo, carteira, ordens e cotações), pois eventos enviados durante a queda não são reenviados.
- Ao receber eventos de ordens, o cliente também consulta `/state`; eventos de preço atualizam diretamente as cotações na tela.
- Sessão inválida fecha o WebSocket com código `1008`. O cliente retorna ao login sem continuar tentando reconectar com esse token.
- Reiniciar o backend apaga as sessões e os dados em memória; é necessário entrar novamente.
- O servidor é a fonte da verdade; a tela do cliente tem consistência eventual e se corrige ao reconectar.

As ordens são enviadas por POST `/orders`, não pelo WebSocket.
O servidor também responde ao texto `ping` com `pong`, fora do envelope de eventos.
O contrato REST e as instruções de execução estão em [PROTOTIPO_ORDENS.md](PROTOTIPO_ORDENS.md).
