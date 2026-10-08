"""Operator-editable product types; immutable sales base data is never rewritten."""
import copy,json,re,uuid
from pathlib import Path
from fastapi import HTTPException
from pydantic import BaseModel,Field
from sqlalchemy import select,update
from sqlalchemy.exc import IntegrityError
from .models import ProductTaxonomyState
from .sales_import import normalize_model

TONES=['cyan','blue','violet','amber','rose','red','neutral']
def default_config():
    path=Path(__file__).resolve().parents[2]/'config/sales-category-rules.json'
    if not path.is_file():path=Path(__file__).resolve().parents[1]/'config/sales-category-rules.json'
    seed=json.loads(path.read_text(encoding='utf-8'));ids=['battery','accessory','dry-burn','atomizer','disposable','unclassified'];tones=['violet','cyan','amber','blue','rose','neutral']
    categories=[{'id':ids[i],'name':name,'tone':tones[i],'active':True,'order':(i+1)*10,'aliases':[]} for i,name in enumerate(seed['categories'])]
    by_name={row['name']:row['id'] for row in categories}
    rules=[{'id':f'{kind}-{i}','kind':kind,'value':value,'category_id':by_name[name],'priority':100 if kind=='exact' else 200,'active':True} for kind in ['exact','prefix'] for i,(value,name) in enumerate(seed[kind].items())]
    return {'schema_version':1,'fallback_id':'unclassified','categories':categories,'rules':rules,'overrides':[]}

def validate_config(value):
    try:
        c=copy.deepcopy(value)
        if type(c['schema_version']) is not int or c['schema_version']!=1 or not isinstance(c['categories'],list) or not 1<=len(c['categories'])<=50 or not isinstance(c['rules'],list) or len(c['rules'])>1000 or not isinstance(c['overrides'],list) or len(c['overrides'])>5000:raise ValueError('配置结构或数量不正确')
        identifiers=set();names={}
        def name(text):
            if not isinstance(text,str) or not text.strip() or len(text)>50 or re.search(r'[\x00-\x1f\x7f]',text) or text.strip() in ['全部','全部产品','全部项目','全部报告']:raise ValueError('类型名称不正确')
            return text.strip()
        for row in c['categories']:
            if not isinstance(row['id'],str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',row['id']) or row['id'] in identifiers or row['tone'] not in TONES or type(row['active']) is not bool or type(row['order']) is not int or not 0<=row['order']<=10000 or not isinstance(row['aliases'],list) or len(row['aliases'])>100:raise ValueError('类型 ID、颜色、启用状态或排序不正确')
            identifiers.add(row['id']);row['name']=name(row['name']);row['aliases']=list(dict.fromkeys(name(n) for n in row['aliases']))
            for n in [row['name'],*row['aliases']]:
                if n in names and names[n]!=row['id']:raise ValueError('类型名称或历史名称重复')
                names[n]=row['id']
        if c['fallback_id'] not in identifiers or not next(row for row in c['categories'] if row['id']==c['fallback_id'])['active']:raise ValueError('兜底类型必须保留且启用')
        rule_ids=set();keys=set()
        def model(text):
            if not isinstance(text,str) or not text.strip() or len(text)>200 or re.search(r'[\x00-\x1f\x7f]',text):raise ValueError('型号或匹配内容不正确')
            return text.strip()
        for row in c['rules']:
            if not isinstance(row['id'],str) or not re.fullmatch(r'[a-zA-Z0-9-]{1,80}',row['id']) or row['id'] in rule_ids or row['kind'] not in ['exact','prefix'] or row['category_id'] not in identifiers or type(row['priority']) is not int or not 0<=row['priority']<=10000 or type(row['active']) is not bool:raise ValueError('归类规则不正确')
            row['value']=model(row['value']);key=(row['kind'],normalize_model(row['value']))
            if key in keys:raise ValueError('同一种匹配方式的规则重复')
            keys.add(key);rule_ids.add(row['id'])
        models=set()
        for row in c['overrides']:
            row['model']=model(row['model']);key=normalize_model(row['model'])
            if row['category_id'] not in identifiers or key in models:raise ValueError('型号单独归类重复或类型不存在')
            models.add(key)
        c['categories'].sort(key=lambda row:(row['order'],row['id']));return c
    except (KeyError,TypeError,StopIteration):raise HTTPException(422,'配置结构不正确')
    except ValueError as error:raise HTTPException(422,str(error))

def classified_type(model,config):
    key=normalize_model(model);override=next((row for row in config['overrides'] if normalize_model(row['model'])==key),None)
    rules=sorted([row for row in config['rules'] if row['active']],key=lambda row:(row['kind']=='prefix',row['priority'],-len(row['value']),row['id']))
    match=next((row for row in rules if key==normalize_model(row['value']) if row['kind']=='exact'),None)
    if match is None:match=next((row for row in rules if row['kind']=='prefix' and key.startswith(normalize_model(row['value']))),None)
    identifier=override['category_id'] if override else match['category_id'] if match else config['fallback_id']
    return next(row for row in config['categories'] if row['id']==identifier)

def config_view(session):
    state=session.get(ProductTaxonomyState,'product-types')
    return {'config':copy.deepcopy(state.config) if state else default_config(),'revision':state.version if state else 'seed','storage':'server','can_undo':bool(state and state.previous is not None)}

def canonical_name(name,config):return next((row['name'] for row in config['categories'] if row['name']==name or name in row['aliases']),name)

def classify_history(history,config):
    result=copy.deepcopy(history)
    for data in result:
        for row in data.get('products',[]):
            if 'model' in row:row['category']=classified_type(row['model'],config)['name']
    return result

class TaxonomyIn(BaseModel):
    revision:str=Field(min_length=1,max_length=100)
    config:dict
class VersionIn(BaseModel):revision:str=Field(min_length=1,max_length=100)

def register_taxonomy_routes(app,factory,read_history):
    @app.get('/api/product-taxonomy')
    def get():
        with factory() as session:return config_view(session)

    @app.post('/api/product-taxonomy/preview')
    def preview(payload:TaxonomyIn):
        candidate=validate_config(payload.config)
        with factory() as session:
            current=config_view(session)
            if current['revision']!=payload.revision:raise HTTPException(409,'配置已更新，请重新读取并预览')
            changes=[]
            for data in read_history():
                for row in data.get('products',[]):
                    if 'model' not in row:continue
                    before=classified_type(row['model'],current['config'])['name'];after=classified_type(row['model'],candidate)['name']
                    if before!=after:changes.append({'year':data.get('year'),'model':row['model'],'before':before,'after':after})
            return {'changes':changes,'count':len(changes)}

    @app.put('/api/product-taxonomy')
    def save(payload:TaxonomyIn):
        candidate=validate_config(payload.config)
        try:
            with factory() as session,session.begin():
                state=session.scalar(select(ProductTaxonomyState).where(ProductTaxonomyState.id=='product-types').with_for_update());current=config_view(session)
                if current['revision']!=payload.revision:raise HTTPException(409,'配置已更新，请重新读取并预览')
                if candidate==current['config']:return current
                version=uuid.uuid4().hex
                if state:
                    count=session.execute(update(ProductTaxonomyState).where(ProductTaxonomyState.id=='product-types',ProductTaxonomyState.version==payload.revision).values(config=candidate,previous=current['config'],version=version)).rowcount
                    if count!=1:raise HTTPException(409,'配置已更新，请重试')
                    session.expire(state)
                else:session.add(ProductTaxonomyState(id='product-types',version=version,config=candidate,previous=current['config']))
                session.flush();return config_view(session)
        except IntegrityError:raise HTTPException(409,'配置已更新，请重试')

    @app.post('/api/product-taxonomy/undo')
    def undo(payload:VersionIn):
        with factory() as session,session.begin():
            state=session.scalar(select(ProductTaxonomyState).where(ProductTaxonomyState.id=='product-types').with_for_update())
            if not state or state.version!=payload.revision:raise HTTPException(409,'配置已更新，请重新读取')
            if state.previous is None:raise HTTPException(409,'没有可撤销的配置')
            count=session.execute(update(ProductTaxonomyState).where(ProductTaxonomyState.id=='product-types',ProductTaxonomyState.version==payload.revision).values(config=state.previous,previous=None,version=uuid.uuid4().hex)).rowcount
            if count!=1:raise HTTPException(409,'配置已更新，请重试')
            session.expire(state);session.flush();return config_view(session)
