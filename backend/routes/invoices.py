from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Invoice
from schemas import InvoiceResponse

router = APIRouter(prefix="/invoices", tags=["Invoices"])

@router.get("/", response_model=list[InvoiceResponse])
def get_invoices(db: Session = Depends(get_db)):
    return db.query(Invoice).order_by(Invoice.id.desc()).all()
