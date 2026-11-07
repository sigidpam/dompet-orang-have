from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import AccountModel
from schemas import AccountCreate

router = APIRouter(prefix="/api/accounts", tags=["Accounts"])

@router.post("", response_model=dict)
def create_account(acc: AccountCreate, db: Session = Depends(get_db)):
    db_acc = AccountModel(**acc.dict())
    db.add(db_acc)
    db.commit()
    db.refresh(db_acc)
    return {"status": "success", "id": db_acc.id}

@router.get("")
def list_accounts(db: Session = Depends(get_db)):
    accounts = db.query(AccountModel).all()
    return [{"id": a.id, "name": a.name, "type": a.type, "balance": a.balance, "currency": a.currency} for a in accounts]

