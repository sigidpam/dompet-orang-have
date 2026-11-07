from fastapi import FastAPI
from fastapi.responses import FileResponse
from database import engine, Base
from routers import accounts, transactions, investments, dashboard
import os

# Inisialisasi Tabel Database
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Wealth & Investment Tracker Modular Kernel", version="1.1.2")

# Daftarkan Router Modular
app.include_router(accounts.router)
app.include_router(transactions.router)
app.include_router(investments.router)
app.include_router(dashboard.router)

# Serve Frontend Static UI
@app.get("/")
def serve_ui():
    return FileResponse("static/index.html")

if not os.path.exists("static"):
    os.makedirs("static")

