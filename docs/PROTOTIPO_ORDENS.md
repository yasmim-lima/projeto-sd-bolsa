# Ordens — demonstração da Parte 1 (21/10/2026)

## Executar

Em um terminal:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Em outro terminal:

```bash
cd frontend
npm ci
npm run dev
```

Abra http://localhost:5173. O Vite encaminha `/api` para o backend na porta 8000.
O proxy é de desenvolvimento; o build publicado precisa de um proxy equivalente.
Use um único processo do backend, pois o estado fica em memória.

Se a porta 8000 estiver ocupada, use `uvicorn main:app --reload --port 8001`
no terminal do backend e `BOLSA_API_TARGET=http://127.0.0.1:8001 npm run dev`
no terminal do frontend (Linux/Mac). No PowerShell, defina primeiro
`$env:BOLSA_API_TARGET="http://127.0.0.1:8001"` e depois execute `npm run dev`.

## Escopo demonstrável

Cada nome de demonstração começa com R$ 1.000,00 e carteira vazia. Entrar de
novo com o mesmo nome recupera o estado enquanto o servidor estiver ativo.
Os nomes são públicos e não têm senha: esta sessão temporária não substitui
JWT ou autenticação. O frontend mantém o token apenas enquanto a página está aberta.

O servidor valida compras e vendas, calcula com `Decimal`, cria UUIDs e datas
UTC e atualiza saldo, carteira e histórico em uma operação protegida por trava.
Tentativas rejeitadas não alteram a conta. A quantidade precisa ser um inteiro
positivo (até 1.000.000); o preço precisa ser positivo, com até duas casas
decimais e dez dígitos inteiros. O cliente não pode escolher `user_id`.

As ordens são executadas imediatamente ao preço informado contra uma contraparte
simulada, reproduzindo o comportamento do protótipo anterior. Não há livro,
reserva de recursos, execução parcial ou matching entre investidores nesta etapa.
As cotações são simuladas no servidor a cada três segundos e compartilhadas
por todos. O frontend busca o estado periodicamente; não usa WebSocket ainda.
Persistência, autenticação real e eventos serão integrados às partes da equipe.
Reiniciar ou recarregar o backend apaga contas, sessões e ordens.

## Contrato REST implementado

| Método | Rota | Corpo / resultado |
|---|---|---|
| POST | `/demo/sessions` | Recebe `username`; retorna `access_token`, `token_type`. |
| GET | `/state` | Retorna `user_id`, `balance`, `positions`, `orders`, `assets`, `equity`. |
| POST | `/orders` | Recebe `ticker`, `side`, `quantity`, `price`; retorna `order` e `state` atualizados. |

`/state` e `/orders` exigem `Authorization: Bearer <access_token>`.
As rotas estão documentadas também em http://127.0.0.1:8000/docs.
Valores monetários são devolvidos como strings decimais para preservar precisão;
a tela converte para número apenas na exibição e no gráfico.

Exemplo de comando:

```json
{"ticker":"PETR4","side":"BUY","quantity":10,"price":"38.50"}
```

Uma ordem devolvida contém `order_id`, `user_id`, `ticker`, `side`, `quantity`,
`price`, `status` (`FILLED`) e `created_at` (ISO 8601 UTC). Os nomes dos seis
campos comuns coincidem com `ORDER_ACCEPTED` do contrato na branch `realtime`.
O evento não é emitido por esta implementação. Sua serialização monetária ainda
precisa ser combinada com o responsável pelos eventos (o exemplo WebSocket usa número).

`positions` é um objeto de ticker para quantidade. Cada ativo em `assets` contém
`ticker`, `name`, `price`, `opening_price`, `history`, `change_percent`.
A variação é relativa ao preço de abertura da sessão do servidor.

Erros: `401` para sessão ausente ou inválida, `422` para campos inválidos,
`400` para ativo desconhecido, saldo ou posição insuficientes.
Não reenvie automaticamente uma ordem se a conexão cair: não há deduplicação
por chave de idempotência nesta etapa. Consulte o histórico antes de tentar novamente.

## Roteiro de apresentação

1. Entre com `venisson`: saldo e patrimônio iniciais de R$ 1.000,00.
2. Compre 10 PETR4 a R$ 38,50: saldo R$ 615,00 e posição de 10 ações.
3. Venda 3 PETR4 a R$ 40,00: saldo R$ 735,00 e posição de 7 ações.
4. Tente vender 8 PETR4: rejeição sem alterar o histórico, saldo ou carteira.
5. Tente comprar 100 PETR4 a R$ 38,50: rejeição por saldo insuficiente.
6. Abra outra aba e entre com outro nome: conta independente e mesmas cotações.
7. Entre com `venisson` em outra aba: veja a mesma conta e o histórico; a primeira
   aba recebe o estado atualizado no próximo polling.
8. Confira se as datas das ordens permanecem fixas enquanto as cotações mudam.

O patrimônio após operações varia com a cotação atual; o saldo dos exemplos
permanece exato porque a execução simulada usa o preço digitado.

## Verificação automatizada

Com as dependências instaladas:

```bash
cd backend
python -m unittest discover -s tests -v
```

Os testes cobrem compras, vendas, rejeições sem efeitos, entradas inválidas,
isolamento de contas, reentrada, precisão decimal, compras concorrentes e
cotações compartilhadas. No frontend:

```bash
cd frontend
npm run build
npm run lint
```

Verificação em 21/10/2026: oito testes passaram, build e lint passaram e o
fluxo de entrada, compra, venda, rejeição e consulta da mesma conta em outra
aba foi conferido no Chromium sem erros JavaScript.
