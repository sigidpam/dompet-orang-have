from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class AccountModel(Base):
    __tablename__ = "accounts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False) # bank, cash, e_wallet, investment
    currency = Column(String, default="IDR")
    balance = Column(Float, default=0.0)

class ExchangeRateModel(Base):
    __tablename__ = "exchange_rates"
    id = Column(Integer, primary_key=True, index=True)
    currency = Column(String, unique=True, nullable=False)
    rate_to_idr = Column(Float, nullable=False)

class TransactionModel(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    type = Column(String, nullable=False) # income, expense
    category = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="IDR")
    date = Column(DateTime, default=datetime.utcnow)
    
    account = relationship("AccountModel")

class InvestmentModel(Base):
    __tablename__ = "investments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)
    principal = Column(Float, nullable=False)
    cashback = Column(Float, default=0.0)
    annual_interest_rate = Column(Float, default=0.0)
    tenor_months = Column(Integer, default=12)
    lots = Column(Integer, default=0)
    currency = Column(String, default="IDR")


