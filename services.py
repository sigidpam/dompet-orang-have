from sqlalchemy.orm import Session
from models import ExchangeRateModel

def get_conversion_rate(db: Session, currency: str) -> float:
    """Mengambil kurs konversi ke IDR dari database lokal"""
    if currency.upper() == "IDR":
        return 1.0
    rate = db.query(ExchangeRateModel).filter(ExchangeRateModel.currency == currency.upper()).first()
    return rate.rate_to_idr if rate else 1.0


