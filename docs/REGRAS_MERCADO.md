# Regras do mercado

## Objetivo

Simular um mercado de ativos virtuais com vários investidores.
O servidor recebe e valida ordens, controla as contas e fornece o estado consultado pelos clientes.

## Investidores e ativos

Cada investidor começa com R$ 1.000,00 de capital virtual e nenhuma ação na carteira.

Os ativos disponíveis são PETR4, VALE3 e ITUB4.
Esses códigos são usados na simulação; as cotações não representam dados reais da bolsa.

## Ordens

Cada ordem informa:

- Ativo negociado.
- Operação: compra (BUY) ou venda (SELL).
- Quantidade de ações.
- Preço por ação.

A quantidade deve ser inteira, entre 1 e 1.000.000.
O preço deve ser positivo, com até duas casas decimais e dez dígitos inteiros.

O investidor pode operar somente os ativos cadastrados.
O servidor identifica a conta pela sessão recebida.

## Validação das operações

Uma compra exige saldo suficiente para pagar o valor total:

valor total = quantidade × preço por ação

Uma venda exige que o investidor possua a quantidade solicitada do ativo.

Não são permitidos empréstimos, saldo negativo ou venda de ações que o investidor não possui.

Ordens recusadas não alteram saldo, carteira ou histórico de ordens executadas.

## Execução na Parte 1

As ordens válidas são executadas imediatamente ao preço informado, contra uma contraparte simulada.

Não é necessário existir uma ordem de outro investidor para executar uma compra ou venda nesta etapa.

Na compra, o valor total é descontado do saldo e as ações são adicionadas à carteira. Na venda, ocorre o inverso.

Não são cobradas taxas. Todas as operações usam reais virtuais.

## Formação de preços e patrimônio

As cotações são simuladas pelo servidor a cada três segundos. Cada atualização aplica uma variação aleatória entre -R$ 0,25 e R$ 0,25, respeitando o preço mínimo de R$ 1,00.

Nesta etapa, as ordens não alteram as cotações.
O preço informado na ordem determina sua execução simulada.

A variação percentual é calculada em relação ao preço inicial do ativo na execução atual do servidor.

O patrimônio corresponde ao saldo disponível somado ao valor das ações pelas cotações atuais:

patrimônio = saldo + soma de (quantidade de cada ativo × sua cotação atual)

## Concorrência e ordenação atuais

A validação e a atualização de cada operação ocorrem sob uma trava no processo do backend.

As operações são processadas uma por vez nessa região, evitando o uso simultâneo indevido de saldo ou ações.

A ordem de aquisição da trava não garante prioridade pela chegada das requisições. A Parte 1 ainda não possui uma política de prioridade de preço e tempo.

## Proposta para a Parte 2

As regras abaixo estão planejadas e ainda não foram implementadas:

- Manter ordens abertas em um livro de ofertas.
- Priorizar compras pelo maior preço.
- Priorizar vendas pelo menor preço.
- Desempatar pelo registro de chegada ao servidor.
- Executar ordens quando o preço de compra for maior ou igual ao preço de venda.
- Permitir execução parcial quando as quantidades diferirem.
- Reservar saldo e ações comprometidos em ordens abertas.
- Criar bots que enviem ordens pelas mesmas validações aplicadas aos demais investidores.

Antes da implementação, o grupo definirá o preço usado em cada negociação, o cancelamento de ordens, a liberação das reservas e o tratamento de ordens do mesmo investidor.

## Limitações do protótipo

As sessões atuais são identificadas por nome, sem comprovação de identidade. Os dados permanecem em memória e são perdidos quando o backend reinicia.

A proteção de concorrência atende a um único processo servidor.
A execução com múltiplos processos exigirá coordenação adicional.

As instruções de execução, o contrato REST e o roteiro de testes estão em [PROTOTIPO_ORDENS.md](PROTOTIPO_ORDENS.md).
