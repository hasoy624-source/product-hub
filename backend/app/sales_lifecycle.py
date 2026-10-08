import json,os,re
from pathlib import Path
from fastapi import HTTPException
from typing import Annotated,Literal
from pydantic import BaseModel,Field,StrictInt
from sqlalchemy import select
from .models import SalesReferencePrice,serialize
from .sales_maintenance import effective_history,register_maintenance_routes
from .sales_import import category

class SalesPriceIn(BaseModel):
    currency: Literal['USD','CNY']
    amount_cents: Annotated[StrictInt,Field(ge=0,le=1000000000)] | None

def sales_dataset():
    root=Path(__file__).resolve().parents[2]
    default=root/'frontend/public/sales/lifecycle.json'
    if not default.is_file():default=root/'frontend/dist/sales/lifecycle.json'
    path=Path(os.getenv('SALES_LIFECYCLE_DATA',str(default)))
    if not path.is_file():return None
    try:
        data=json.loads(path.read_text(encoding='utf-8'))
        for row in data.get('products',[]):
            if 'model' in row:row['category']=category(row['model'])
        return data
    except (ValueError,OSError):raise HTTPException(500,'销量数据读取失败')

def sales_history():
    root=Path(__file__).resolve().parents[2]
    primary=Path(os.environ['SALES_LIFECYCLE_DATA']) if os.getenv('SALES_LIFECYCLE_DATA') else root/'frontend/public/sales/lifecycle.json'
    if not primary.is_file() and not os.getenv('SALES_LIFECYCLE_DATA'):primary=root/'frontend/dist/sales/lifecycle.json'
    index_path=Path(os.getenv('SALES_HISTORY_INDEX',str(primary.parent/'history.json')))
    latest=sales_dataset()
    if not index_path.is_file():return [latest] if latest else []
    try:
        index=json.loads(index_path.read_text(encoding='utf-8'))
        if index.get('schema_version')!=1 or not isinstance(index.get('years'),list) or not index['years']:raise ValueError()
        result=[];seen=set()
        for entry in index['years']:
            year=entry['year'];name=entry['file']
            if not isinstance(year,int) or not 1900<=year<=9998 or year in seen or not re.fullmatch(r'lifecycle(?:-\d{4})?\.json',name):raise ValueError()
            seen.add(year)
            data=latest if latest and latest.get('year')==year else json.loads((index_path.parent/name).read_text(encoding='utf-8'))
            if data.get('year')!=year:raise ValueError()
            for row in data.get('products',[]):
                if 'model' in row:row['category']=category(row['model'])
            result.append(data)
        return sorted(result,key=lambda data:data['year'],reverse=True)
    except (ValueError,OSError,KeyError,TypeError):raise HTTPException(500,'销售年度数据读取失败')

def register_sales_routes(app,factory):
    app.get('/api/sales-lifecycle')(sales_dataset)
    app.get('/api/sales-history')(lambda:effective_history(sales_history(),factory))
    register_maintenance_routes(app,factory,sales_history)

    @app.get('/api/sales-prices')
    def prices():
        with factory() as session:
            return [serialize(row) for row in session.scalars(select(SalesReferencePrice).order_by(SalesReferencePrice.product_id))]

    @app.put('/api/sales-prices/{product_id}')
    def save_price(product_id:str,payload:SalesPriceIn):
        history=effective_history(sales_history(),factory)
        if not any(row['id']==product_id and not row.get('missing_model') for data in history for row in data.get('products',[])):
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
