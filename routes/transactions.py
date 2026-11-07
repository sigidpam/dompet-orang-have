from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import TransactionModel, AccountModel
from schemas import TransactionCreate

router = APIRouter(prefix="/api/transactions", tags=["Transactions"])

@router.post("")
def create_transaction(tx: TransactionCreate, db: Session = Depends(get_db)):
    acc = db.query(AccountModel).filter(AccountModel.id == tx.account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Update saldo rekening otomatis berdasarkan jenis transaksi
    if tx.type == "income":
        acc.balance += tx.amount
    elif tx.type == "expense":
        acc.balance -= tx.amount
        
    db_tx = TransactionModel(**tx.dict())
    db.add(db_tx)
    db.commit()
    return {"status": "success"}


