from pydantic import BaseModel

class AccountCreate(BaseModel):
    name: str
    type: str
    currency: str = "IDR"
    balance: float = 0.0

class ExchangeRateCreate(BaseModel):
    currency: str
    rate_to_idr: float

class TransactionCreate(BaseModel):
    account_id: int
    type: str
    category: str
    amount: float
    currency: str = "IDR"

class InvestmentCreate(BaseModel):
    name: str
    category: str
    principal: float
    cashback: float = 0.0
    annual_interest_rate: float = 0.0
    tenor_months: int = 12
    lots: int = 0
    currency: str = "IDR"

