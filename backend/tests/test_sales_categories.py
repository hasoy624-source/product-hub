import json
from pathlib import Path
from app.sales_import import category
from app.sales_maintenance import build_history

def test_shared_sales_category_rules_cover_named_models_and_prefixes():
    for model in ['Mini 2','MINI2','O2 mini']:assert category(model)=='电池类'
    for model in ['单发Tip头','双发TIP 头']:assert category(model)=='配件类'
    for model in ['y-039','Y-055']:assert category(model)=='一次性'
    for model in ["'026",'‘027','’025','0074雾化器']:assert category(model)=='雾化器'
    for model in ['122N','H2O MINI','mini','0074 atomizer']:assert category(model)=='待分类'

def test_published_categories_and_native_new_models_use_same_rules_with_preserved_totals():
    root=Path(__file__).resolve().parents[2]
    for name,total in [('lifecycle.json',2280143),('lifecycle-2025.json',3039874)]:
        data=json.loads((root/'frontend/public/sales'/name).read_text(encoding='utf-8'))
        assert sum(data['monthly_totals'])==total
        assert all(row['category']==category(row['model']) for row in data['products'])
    result=build_history([], [{'year':2027,'month':1,'model':'Y-NEW','units':5},{'year':2027,'month':1,'model':"'NEW",'units':2}])
    assert [row['category'] for row in result[0]['products']]==['一次性','雾化器']
