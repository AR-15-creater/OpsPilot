from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
from models import Base
from routes import auth_routes, invoices, tasks, tickets


app = FastAPI(
    title="OpsPilot",
    description="Agentic Business Operations Automation Platform",
    version="1.0.0",
)

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://opspilot.atharvarasal6.workers.dev",
        "https://opspilot.pages.dev",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "null",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(auth_routes.router)
app.include_router(tasks.router)
app.include_router(tickets.router)
app.include_router(invoices.router)


@app.get("/")
def root():
    return {
        "message": "Welcome to OpsPilot"
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok"
    }


@app.get("/db-check")
def db_check():
    try:
        with engine.connect():
            return {
                "database": "connected"
            }
    except Exception as e:
        return {
            "database": "not connected",
            "error": str(e),
        }
