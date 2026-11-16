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

`BOOK_UPDATED` está planejado para a Parte 2 e ainda não é emitido.
O formato proposto é `ticker`, `buy_orders` e `sell_orders`, com itens
contendo `price` e `quantity`; a semântica de agrupamento ainda será definida.

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
