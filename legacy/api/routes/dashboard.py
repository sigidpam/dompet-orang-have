from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import TransactionModel, AccountModel, InvestmentModel
from services import get_conversion_rate
import csv
import io
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api", tags=["Dashboard & Reports"])

@router.get("/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    # 1. Hitung Pengeluaran & Pendapatan Rutin (dikonversi ke IDR)
    txs = db.query(TransactionModel).all()
    total_income_idr = 0.0
    total_expense_idr = 0.0
    for t in txs:
        rate = get_conversion_rate(db, t.currency)
        converted = t.amount * rate
        if t.type == "income":
            total_income_idr += converted
        elif t.type == "expense":
            total_expense_idr += converted

    # 2. Hitung Dana Liquid / Cash
    accounts = db.query(AccountModel).all()
    liquid_cash_idr = 0.0
    for acc in accounts:
        rate = get_conversion_rate(db, acc.currency)
        if acc.type in ["bank", "cash", "e_wallet"]:
            liquid_cash_idr += acc.balance * rate

    # 3. Hitung Portofolio Investasi, Cashback, & Est. Return Bulanan
    investments = db.query(InvestmentModel).all()
    total_investment_principal_idr = 0.0
    total_estimated_monthly_return_idr = 0.0
    total_cashback_idr = 0.0

    serialized_investments = []
    for inv in investments:
        rate = get_conversion_rate(db, inv.currency)
        net_principal = inv.principal - inv.cashback
        monthly_return = net_principal * (inv.annual_interest_rate / 100.0 / 12.0)
        
        p_idr = inv.principal * rate
        cb_idr = inv.cashback * rate
        mr_idr = monthly_return * rate

        total_investment_principal_idr += p_idr
        total_cashback_idr += cb_idr
        total_estimated_monthly_return_idr += mr_idr

        serialized_investments.append({
            "id": inv.id,
            "name": inv.name,
            "category": inv.category,
            "principal": inv.principal,
            "cashback": inv.cashback,
            "net_principal": net_principal,
            "annual_interest_rate": inv.annual_interest_rate,
            "estimated_monthly_return": monthly_return,
            "tenor_months": inv.tenor_months,
            "lots": inv.lots,
            "currency": inv.currency
        })

    return {
        "grand_total_pendapatan": total_income_idr,
        "grand_total_pengeluaran": total_expense_idr,
        "dana_liquid_cash": liquid_cash_idr,
        "pendapatan_investasi": {
            "total_principal": total_investment_principal_idr,
            "total_cashback": total_cashback_idr,
            "est_monthly_return": total_estimated_monthly_return_idr
        },
        "investments": serialized_investments,
        "accounts": [{"id": a.id, "name": a.name, "type": a.type, "balance": a.balance, "currency": a.currency} for a in accounts]
    }

@router.get("/export/csv")
def export_csv(db: Session = Depends(get_db)):
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow(["=== INVESTASI ==="])
    writer.writerow(["ID", "Nama Aset", "Kategori", "Modal", "Cashback", "Bunga (% p.a)", "Tenor (Bulan)", "Lot", "Mata Uang"])
    investments = db.query(InvestmentModel).all()
    for inv in investments:
        writer.writerow([inv.id, inv.name, inv.category, inv.principal, inv.cashback, inv.annual_interest_rate, inv.tenor_months, inv.lots, inv.currency])
    
    writer.writerow([])
    writer.writerow(["=== REKENING & CASH ==="])
    writer.writerow(["ID", "Nama Rekening", "Tipe", "Saldo", "Mata Uang"])
    accounts = db.query(AccountModel).all()
    for acc in accounts:
        writer.writerow([acc.id, acc.name, acc.type, acc.balance, acc.currency])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=wealth_report.csv"}
    )

