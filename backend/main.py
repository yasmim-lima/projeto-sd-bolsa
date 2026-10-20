from fastapi import FastAPI

app = FastAPI(title="Simulador Bolsa SD - UFS")

@app.get("/")
def read_root():
    return {"status": "Servidor do Simulador de Bolsa rodando com sucesso!"}