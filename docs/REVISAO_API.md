# Revisão do contrato de ordens e eventos

> Registro da situação antes da implementação das ordens. O backend e o
> frontend foram integrados posteriormente no protótipo; veja o estado atual
> em [PROTOTIPO_ORDENS.md](PROTOTIPO_ORDENS.md). Os pontos de alinhamento com
> persistência e eventos continuam sujeitos à combinação com a equipe.

Revisão em 21/10/2026 do contrato `docs/API.md` da branch `origin/realtime`,
commit `f37f9fbc1bc8417a9e5cdee727a16a1e0c078a18`, comparado com o código local.
Este documento registra uma proposta de alinhamento, não um contrato já aprovado
ou funcionalidades implementadas.

## Resultado

Os campos do contrato atendem à identificação e aceitação inicial de uma ordem.
Os nomes diferem do protótipo do frontend, mas podem ser mapeados sem mudar o
significado. Recomenda-se manter o padrão em inglês na comunicação da API.

Não é possível confirmar compatibilidade com a persistência: não há modelos
SQLAlchemy, tabelas ou migrações no repositório. O backend implementa somente
`GET /`; a rota WebSocket e as rotas REST mencionadas no contrato ainda não existem.
Na `main` local, `docs/API.md` está vazio; o contrato revisado está na `realtime`.

## Mapeamento observado

| Conceito | Frontend (`frontend/src/App.jsx`) | Contrato WebSocket | Avaliação |
|---|---|---|---|
| Identificador da ordem | `id` | `order_id` | Mapear na integração; o ID aleatório do protótipo deve ser substituído pelo ID do servidor. |
| Dono da ordem | Ausente no objeto de ordem | `user_id` | Obter da autenticação no servidor; não confiar em um dono informado pelo cliente. |
| Ativo | `ticker` | `ticker` | Compatível. |
| Operação | `lado` | `side` | Nomes diferentes; valores `BUY` e `SELL` já coincidem. |
| Quantidade | `quantidade` | `quantity` | Mesmo conceito; confirmar inteiro positivo. |
| Preço limite | `preco` | `price` | Mesmo conceito; definir precisão e representação JSON. |
| Estado da ordem | `status: 'EXECUTADA'` | Ausente em `ORDER_ACCEPTED` | Aceitação não significa execução; definir ciclo de vida. |
| Data da ordem | Não armazenada; a tela usa a hora atual | `timestamp` no envelope | O horário do evento não substitui necessariamente a data de criação persistida. |
| Cotação | `preco` no ativo | `price` em `PRICE_UPDATED` | Mapear na integração. |
| Variação percentual | Calculada sobre `precoAbertura` | `change_percent` | Confirmar que o servidor também usa o preço de abertura. |

## Proposta para a implementação das ordens

- Manter `ticker`, `side`, `quantity` e `price` como campos de entrada de uma
  ordem limitada. O servidor define `order_id`, `user_id`, estado e datas.
- Usar quantidade inteira maior que zero, coerente com a intenção do protótipo.
  Validar antes da conversão: o `parseInt` atual trunca quantidades fracionárias.
- Tratar `price` como preço limite positivo, com duas casas decimais para o
  escopo atual. Usar `Decimal` no backend e coluna `Numeric` com precisão
  combinada com a responsável pela persistência. Combinar se o JSON transporta
  número ou string decimal: o exemplo atual do contrato usa número, mas isso
  não define o tipo de armazenamento nem autoriza cálculos monetários com float.
- Persistir a data de criação e usar UTC em ISO 8601 nos eventos e respostas.
- Prever estado e quantidade executada na representação da ordem. Sugestão de
  estados a combinar: `OPEN`, `PARTIALLY_FILLED`, `FILLED`, `CANCELLED` e
  `REJECTED`, caso rejeições também sejam persistidas.
- Validar saldo e posição disponíveis no servidor, considerando reservas de
  ordens abertas. Aceitar uma ordem reserva recursos; executar uma negociação
  efetiva as alterações de saldo e posição. O protótipo hoje executa tudo localmente.

## Pontos para combinar com eventos e persistência

1. **Rejeição antes da persistência:** `ORDER_REJECTED` exige `order_id`, mas uma
   entrada inválida pode não ter ID. Definir se toda tentativa é registrada ou
   se `order_id` pode ser nulo. Para relacionar tentativas sem ID, considerar
   um `client_order_id` enviado no comando e devolvido na resposta/evento;
   definir seu escopo de unicidade e comportamento de repetição se for adotado.
2. **Execução e cancelamento:** combinar eventos de atualização da ordem com
   estado, quantidade executada e restante. `ORDER_ACCEPTED` sozinho não informa
   uma execução parcial, total ou cancelamento. Definir também como saldo e
   carteira serão atualizados no cliente após uma negociação.
3. **Livro de ofertas:** definir se cada item é uma ordem ou um nível agregado
   de preço. Sugestão: agrupar por preço, com `quantity` representando a soma
   restante, compras em preço decrescente e vendas em preço crescente.
4. **Cotação:** definir `change_percent` em relação à abertura, como no frontend,
   e como o preço de abertura será fornecido no estado inicial. O histórico do
   gráfico também precisa de uma fonte ao carregar ou reconectar.
5. **Reconexão:** especificar rotas e formatos REST para saldo, carteira,
   ordens e cotações, citados no contrato mas ainda não definidos. Tipos dos
   IDs devem coincidir nas respostas REST, nos eventos e na persistência.

## Mensagem sugerida ao colega

> Conferi o contrato da realtime com o protótipo. Podemos manter `order_id`,
> `user_id`, `ticker`, `side`, `quantity` e `price` na API. No frontend, precisamos
> mapear `id`, `lado`, `quantidade` e `preco`; os valores BUY/SELL já batem.
> O banco ainda não tem modelos no repo, então os tipos dos IDs e do preço
> precisam ser alinhados com a Yasmim. Para as ordens, proponho quantidade
> inteira e preço decimal com duas casas. Falta definir o ID nas rejeições
> antes de registrar a ordem, os eventos de execução/cancelamento e se o livro
> é agrupado por preço. A variação pode usar a abertura, como a tela já faz.
