# Ordens — demonstração da Parte 1 (21/10/2026)

## Executar

Os comandos abaixo usam Linux/Mac. Abra dois terminais na raiz
do repositório, um para o backend e outro para o frontend.

No primeiro terminal:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

No segundo terminal, também a partir da raiz do repositório:

```bash
cd frontend
npm ci
npm run dev
```

Abra http://localhost:5173. O Vite encaminha `/api` para o backend na porta 8000.
O proxy é de desenvolvimento; o build publicado precisa de um proxy equivalente.
Use um único processo do backend, pois o estado fica em memória.

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
As cotações são simuladas no servidor a cada três segundos e enviadas
aos clientes conectados pelo evento `PRICE_UPDATED` via WebSocket.

As ordens continuam sendo enviadas por REST. Os eventos `ORDER_ACCEPTED`
e `ORDER_REJECTED` são enviados somente às conexões do investidor responsável.
Ao receber esses eventos, o frontend consulta `/state` para atualizar
saldo, carteira e histórico.

Ao conectar ou reconectar o WebSocket, o cliente também consulta `/state`.
Eventos perdidos durante uma desconexão não são reenviados.
O cliente tenta reconectar após dois segundos. Se a sessão for inválida,
o servidor fecha a conexão com código `1008` e a tela retorna ao login.

Persistência e autenticação real ainda dependem de integração.
Reiniciar ou recarregar o backend apaga contas, sessões e ordens.

## Contrato REST implementado

| Método | Rota | Corpo / resultado |
|---|---|---|
| POST | `/demo/sessions` | Recebe `username`; retorna `access_token`, `token_type`. |
| GET | `/state` | Retorna `user_id`, `balance`, `positions`, `orders`, `assets`, `equity`. |
| POST | `/orders` | Recebe `ticker`, `side`, `quantity`, `price`; retorna `order` e `state` atualizados. |

`/state` e `/orders` exigem `Authorization: Bearer <access_token>`.
As rotas estão documentadas também em http://127.0.0.1:8000/docs.
Valores monetários são devolvidos como strings decimais.
Os cálculos das operações usam `Decimal` no backend.
O frontend converte os valores para número na exibição, nos gráficos
e no cálculo do patrimônio ao receber novas cotações.

Exemplo de comando:

```json
{"ticker":"PETR4","side":"BUY","quantity":10,"price":"38.50"}
```

Uma ordem devolvida contém `order_id`, `user_id`, `ticker`, `side`, `quantity`,
`price`, `status` (`FILLED`) e `created_at` (ISO 8601 UTC).

Após a execução simulada, o backend publica `ORDER_ACCEPTED` com os dados
da ordem. Rejeições por ativo desconhecido, saldo ou posição insuficientes
publicam `ORDER_REJECTED` com `order_id` nulo, `user_id` e `reason`.

Erros de validação que retornam `422` não geram `ORDER_REJECTED`.
O contrato dos eventos está em [API.md](API.md).

`positions` é um objeto de ticker para quantidade. Cada ativo em `assets` contém
`ticker`, `name`, `price`, `opening_price`, `history`, `change_percent`.
A variação é relativa ao preço de abertura da sessão do servidor.

Erros: `401` para sessão ausente ou inválida, `422` para campos inválidos,
`400` para ativo desconhecido, saldo ou posição insuficientes.
Não reenvie automaticamente uma ordem se a conexão cair: não há deduplicação
por chave de idempotência nesta etapa. Consulte o histórico antes de tentar novamente.

## Testar pelo Swagger

1. Abra http://localhost:8000/docs.
2. Em POST `/demo/sessions`, clique em **Try it out**.
3. Informe `{"username": "venisson"}` e clique em **Execute**.
4. Copie o `access_token` retornado.
5. Clique em **Authorize**, no topo da página.
6. Cole somente o token, sem o prefixo `Bearer`.
7. Confirme em **Authorize** e feche a janela.
8. Execute GET `/state` para consultar a conta.
9. Execute POST `/orders` para enviar uma ordem.

O Swagger adiciona automaticamente o cabeçalho `Authorization`.
Essa configuração permite utilizar a sessão de demonstração;
não representa autenticação por senha ou JWT.

Após reiniciar ou recarregar o backend, crie uma nova sessão
e substitua o token no botão **Authorize**.

## Roteiro de apresentação

Use dois nomes ainda não utilizados nesta execução do servidor.
Nos exemplos, `venisson` representa a primeira conta; substitua-o
pelo nome escolhido se essa conta já tiver sido utilizada.

Na interface, digite manualmente os preços indicados no roteiro,
pois o formulário pode iniciar com uma cotação diferente.

1. Entre com `venisson`: saldo e patrimônio iniciais de R$ 1.000,00.
2. Compre 10 PETR4 a R$ 38,50: saldo R$ 615,00 e posição de 10 ações.
3. Venda 3 PETR4 a R$ 40,00: saldo R$ 735,00 e posição de 7 ações.
4. Tente vender 8 PETR4: rejeição sem alterar o histórico, saldo ou carteira.
5. Tente comprar 100 PETR4 a R$ 38,50: rejeição por saldo insuficiente.
6. Abra outra aba e entre com outro nome: saldo inicial de
   R$ 1.000,00, carteira zerada e histórico vazio.
   Nessa conta, compre 1 PETR4 a R$ 38,50: saldo de R$ 961,50
   e posição de uma ação. A primeira conta deve permanecer
   com R$ 735,00 e 7 PETR4.
7. Entre com `venisson` em outra aba. Nessa aba, compre
   1 PETR4 a R$ 38,50. As duas telas dessa conta devem passar
   a mostrar R$ 696,50, 8 PETR4 e três ordens no histórico,
   após o recebimento do evento WebSocket e a consulta bem-sucedida a `/state`.
8. Confira se as datas das ordens permanecem fixas enquanto as cotações mudam.

O patrimônio após operações varia com a cotação atual; o saldo dos exemplos
permanece exato porque a execução simulada usa o preço digitado.

## Verificação automatizada

Com as dependências instaladas, execute em um terminal
a partir da raiz do repositório:

```bash
cd backend
source venv/bin/activate
python -m unittest discover -s tests -v
```

Os testes cobrem compras, vendas, rejeições sem efeitos, entradas inválidas,
isolamento de contas, reentrada, precisão decimal, compras concorrentes e
cotações compartilhadas.

No mesmo terminal, passe de backend para frontend:

```bash
cd ../frontend
npm run build
npm run lint
```
