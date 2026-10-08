import json,os
from pathlib import Path
from fastapi import HTTPException

def register_sales_routes(app):
    @app.get('/api/sales-lifecycle')
    def dataset():
        root=Path(__file__).resolve().parents[2]
        default=root/'frontend/public/sales/lifecycle.json'
        if not default.is_file():default=root/'frontend/dist/sales/lifecycle.json'
        path=Path(os.getenv('SALES_LIFECYCLE_DATA',str(default)))
        if not path.is_file():return None
        try:return json.loads(path.read_text(encoding='utf-8'))
        except (ValueError,OSError):raise HTTPException(500,'销量数据读取失败')
