import json,os
from pathlib import Path
from fastapi import HTTPException
from typing import Annotated,Literal
from pydantic import BaseModel,Field,StrictInt
from sqlalchemy import select
from .models import SalesReferencePrice,serialize

class SalesPriceIn(BaseModel):
    currency: Literal['USD','CNY']
    amount_cents: Annotated[StrictInt,Field(ge=0,le=1000000000)] | None

def sales_dataset():
    root=Path(__file__).resolve().parents[2]
    default=root/'frontend/public/sales/lifecycle.json'
    if not default.is_file():default=root/'frontend/dist/sales/lifecycle.json'
    path=Path(os.getenv('SALES_LIFECYCLE_DATA',str(default)))
    if not path.is_file():return None
    try:return json.loads(path.read_text(encoding='utf-8'))
    except (ValueError,OSError):raise HTTPException(500,'销量数据读取失败')

def register_sales_routes(app,factory):
    app.get('/api/sales-lifecycle')(sales_dataset)

    @app.get('/api/sales-prices')
    def prices():
        with factory() as session:
            return [serialize(row) for row in session.scalars(select(SalesReferencePrice).order_by(SalesReferencePrice.product_id))]

    @app.put('/api/sales-prices/{product_id}')
    def save_price(product_id:str,payload:SalesPriceIn):
        data=sales_dataset()
        if not data or not any(row['id']==product_id and not row.get('missing_model') for row in data.get('products',[])):
            raise HTTPException(404,'销售型号不存在')
        with factory() as session,session.begin():
            row=session.get(SalesReferencePrice,product_id)
            if payload.amount_cents is None:
                if row:session.delete(row)
                return None
            if not row:
                row=SalesReferencePrice(product_id=product_id,currency=payload.currency,amount_cents=payload.amount_cents)
                session.add(row)
            else:row.currency,row.amount_cents=payload.currency,payload.amount_cents
            session.flush()
            return serialize(row)
