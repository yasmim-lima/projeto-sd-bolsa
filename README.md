# Simulador de Bolsa de Valores Multiplayer

Projeto da disciplina **Sistemas Distribuídos (COMP0470)** — Universidade Federal de Sergipe. Professor: Rafael Oliveira Vasconcelos.

Simulação distribuída de um mercado financeiro: vários investidores conectados ao mesmo tempo enviam ordens de compra e venda, e todos acompanham as mudanças do mercado em tempo real. O foco do projeto são os problemas de sistemas distribuídos: concorrência, consistência, ordenação de eventos, sincronização de estado e tolerância a falhas.

## Equipe

| Integrante | Responsabilidade |
|---|---|
| Filipe de Carvalho Godoy | Eventos em tempo real e tolerância a falhas |
| Yasmim de Andrade Lima | Autenticação, persistência e setup base |
| Venisson Cardoso dos Santos | Regras de negócio, ordens e bot (NPC) |
| Augusto César Honorato dos Santos | Frontend (Home Broker) e apresentação |

## Tecnologias

- **Backend:** Python, FastAPI, Uvicorn
- **Banco de dados:** SQLAlchemy
- **Autenticação:** JWT
- **Tempo real:** WebSocket
- **Frontend:** React + Vite

## Estrutura

```text
projeto-sd-bolsa/
├── backend/        # API, WebSocket e bot
├── frontend/       # Home Broker
└── docs/           # Documentação técnica (API.md)
```

## Como executar

### Backend

```bash
cd backend
python -m venv venv

# Windows (PowerShell)
.\\venv\\Scripts\\Activate.ps1

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```
Documentação interativa da API (Swagger): http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```
Acesse o Home Broker em: http://localhost:5173

## Documentação

- [Especificação da API e dos eventos](docs/API.md)

## Status

- **Parte 1 (21/10/2026):** Protótipo Funcional
  - [x] Conexão de múltiplos clientes (Frontend)
  - [x] Interface do Home Broker (React + Vite)
  - [x] Simulação de mercado em tempo real (Oscilação de preços)
  - [x] Envio de ordens de compra e venda com validação de saldo e carteira
  - [x] Cálculo de patrimônio e mini-gráficos de variação
  - [x] Especificação da API e WebSocket (docs/API.md)

- **Parte 2 (30/11/2026):**
  - [ ] Matching Engine real (cruzamento de ordens)
  - [ ] Agentes automatizados (Bots)
  - [ ] Tolerância a falhas e reconexão
  - [ ] Testes de carga e concorrência
```