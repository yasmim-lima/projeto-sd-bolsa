<div align="center">

# 📈 Simulador de Bolsa de Valores Multiplayer

**Projeto da disciplina de Sistemas Distribuídos (COMP0470) — Universidade Federal de Sergipe**

[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)

</div>

---

## 🎯 Sobre o Projeto

Uma simulação distribuída de um mercado financeiro onde múltiplos investidores conectados simultaneamente enviam ordens de compra e venda, acompanhando as mudanças do mercado em tempo real.

O foco principal do projeto é a exploração prática de problemas clássicos de **Sistemas Distribuídos**, como:
- Concorrência e condições de corrida.
- Consistência e integridade de dados.
- Ordenação de eventos e sincronização de estado.
- Tolerância a falhas e reconexão.

---

## 👥 Equipe e Responsabilidades

| Integrante | Responsabilidade Principal |
| :--- | :--- |
| **Augusto César Honorato dos Santos** | Frontend (Home Broker) e apresentação |
| **Filipe de Carvalho Godoy** | Eventos em tempo real e tolerância a falhas |
| **Venisson Cardoso dos Santos** | Regras de negócio, ordens e bot (NPC) |
| **Yasmim de Andrade Lima** | Autenticação, persistência e setup base |



---

## 🛠️ Tecnologias Utilizadas

O projeto foi construído utilizando uma arquitetura cliente-servidor com as seguintes tecnologias:

| Camada | Tecnologia | Descrição |
| :--- | :--- | :--- |
| **Backend** | Python + FastAPI + Uvicorn | API REST e servidor WebSocket de alta performance. |
| **Banco de Dados** | SQLAlchemy | ORM para persistência de usuários, saldos e ordens. |
| **Autenticação** | JWT (JSON Web Tokens) | Segurança e controle de sessão dos investidores. |
| **Frontend** | React + Vite | Interface SPA do Home Broker, rápida e moderna. |
| **Comunicação** | REST e WebSocket | REST para comandos e WebSocket para tempo real. |

---

## 📁 Estrutura do Repositório

```text
projeto-sd-bolsa/
├── backend/        # Código da API, WebSocket e bots
├── frontend/       # Código da interface (Home Broker)
└── docs/           # Documentação técnica (ex: API.md)
```

---

## 🚀 Como Executar o Projeto

São dois processos, cada um em um terminal: o **backend** (porta 8000) e o **frontend** (porta 5173). Suba o backend primeiro.

### 1. Backend (API + WebSocket)

A pasta `venv/` **não vem no repositório**: cada pessoa cria a sua na primeira vez.

**Linux / Mac**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Windows (PowerShell)**

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

Nas próximas vezes, basta ativar a venv (`source venv/bin/activate` ou `.\venv\Scripts\Activate.ps1`) e rodar o `uvicorn`.

📚 Documentação da API (Swagger): http://127.0.0.1:8000/docs

#### Problemas comuns

| Erro | Solução |
| :--- | :--- |
| `ensurepip is not available` ao criar a venv (Ubuntu/Debian) | `sudo apt install python3-venv` e crie a venv de novo |
| Sem permissão de `sudo` | Pule a venv: `pip install --user -r requirements.txt` e depois `python3 -m uvicorn main:app --reload` |
| `python: command not found` no Linux | Use `python3` |
| PowerShell bloqueia o `Activate.ps1` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| Outros computadores precisam acessar o backend | Rode com `uvicorn main:app --host 0.0.0.0 --port 8000` |

---

### 2. Frontend (Home Broker)

```bash
# Em outro terminal
cd frontend
npm ci # Ou npm install
npm run dev
```

O `npm ci` é para não alterar o `package-lock.json`.

💻 Acesse o Home Broker: http://localhost:5173

O frontend repassa as chamadas para `http://127.0.0.1:8000`. Se o backend estiver em outra máquina, informe o endereço:

```bash
# Linux / Mac
BOLSA_API_TARGET=http://IP_DO_BACKEND:8000 npm run dev
```

```powershell
# Windows (PowerShell)
$env:BOLSA_API_TARGET="http://IP_DO_BACKEND:8000"; npm run dev
```

---

## 📑 Documentação Adicional
📄 Documentação do protótipo e evolução planejada:

- [Regras do mercado](docs/REGRAS_MERCADO.md)
- [Contrato de eventos WebSocket](docs/API.md)
- [Ordens do protótipo: execução, contrato REST e roteiro de apresentação](docs/PROTOTIPO_ORDENS.md)
- [Revisão dos campos do contrato WebSocket](docs/REVISAO_API.md)

O protótipo de ordens usa contas de demonstração por nome, sem senha, e estado
em memória no backend. Execute um único processo do servidor. As compras e
vendas têm execução imediata simulada. As cotações são geradas a cada três
segundos e enviadas por WebSocket. Eventos de ordens e reconexões fazem a tela
consultar o estado via REST. Reiniciar o backend apaga os dados.
Autenticação JWT e persistência ainda precisam de integração.

---

## 📌 Status do Projeto

### ✅ Parte 1: Protótipo (Entrega em 21/10/2026)

- [x] Conexão de múltiplos clientes (Frontend)
- [x] Interface do Home Broker (React + Vite)
- [x] Simulação de mercado em tempo real (Oscilação de preços)
- [x] Envio de ordens de compra e venda com validação de saldo e carteira
- [x] Cálculo de patrimônio e mini-gráficos de variação
- [x] Especificação inicial da API e WebSocket

### ⏳ Parte 2: Implementação Avançada (Entrega em 30/11/2026)

- [ ] Matching Engine real (cruzamento de ordens)
- [ ] Agentes automatizados (Bots/NPCs)
- [ ] Persistência robusta de estado
- [ ] Tolerância a falhas e reconexão de clientes
- [ ] Testes de carga e concorrência

<div align="center"> <i></i> </div>
