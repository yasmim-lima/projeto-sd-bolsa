# Simulador de Bolsa de Valores Multiplayer

Projeto da disciplina **Sistemas Distribuídos (COMP0470)** — Universidade Federal de Sergipe.
Professor: Rafael Oliveira Vasconcelos.

Simulação distribuída de um mercado financeiro: vários investidores conectados ao mesmo tempo enviam ordens de compra e venda, e todos acompanham as mudanças do mercado em tempo real. O foco do projeto são os problemas de sistemas distribuídos: concorrência, consistência, ordenação de eventos, sincronização de estado e tolerância a falhas.

## Equipe

| Integrante | Responsabilidade |
|---|---|
| _nome_ | Autenticação, persistência e setup base |
| _nome_ | Regras de negócio, ordens e bot (NPC) |
| _nome_ | Eventos em tempo real e tolerância a falhas |
| _nome_ | Frontend (Home Broker) e apresentação |

## Tecnologias

- **Backend:** Python, FastAPI, Uvicorn
- **Banco de dados:** SQLAlchemy
- **Autenticação:** JWT
- **Tempo real:** WebSocket
- **Frontend:** React + Vite

## Estrutura

```
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
.\venv\Scripts\Activate.ps1
# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload
```

Documentação interativa da API (Swagger): http://127.0.0.1:8000/docs

### Frontend

_Em construção._

## Documentação

- [Especificação da API e dos eventos](docs/API.md)

## Status

- **Parte 1 (21/10/2026):**
- **Parte 2 (30/11/2026):**
