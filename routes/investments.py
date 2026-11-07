from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import InvestmentModel
from schemas import InvestmentCreate

router = APIRouter(prefix="/api/investments", tags=["Investments"])

@router.post("")
def create_investment(inv: InvestmentCreate, db: Session = Depends(get_db)):
    db_inv = InvestmentModel(**inv.dict())
    db.add(db_inv)
    db.commit()
    return {"status": "success"}


