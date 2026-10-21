from fastapi import FastAPI
from app.database import engine, Base
from app.routers import auth

# Cria as tabelas no SQLite se não existirem
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Simulador Bolsa SD - UFS")

# Inclui as rotas de Autenticação
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"status": "Servidor da Bolsa rodando!"}