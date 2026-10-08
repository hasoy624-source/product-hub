"""Native model/month total maintenance over immutable imported base snapshots."""
import copy,hashlib,json,re,uuid
from datetime import datetime,timezone
from typing import Annotated,Literal
from fastapi import HTTPException
from pydantic import BaseModel,Field,StrictInt,field_validator
from sqlalchemy import select,update
from sqlalchemy.exc import IntegrityError
from .models import SalesDataState,SalesDataChange
from .sales_import import normalize_model,category

class SalesCellIn(BaseModel):
    year: Annotated[StrictInt,Field(ge=1900,le=9998)]
    model: str=Field(min_length=1,max_length=200)
    month: Annotated[StrictInt,Field(ge=1,le=12)]
    units: Annotated[StrictInt,Field(ge=0,le=1000000000)] | None
    @field_validator('model')
    @classmethod
    def model_value(cls,value):
        if not value.strip() or re.search(r'[\x00-\x1f\x7f]',value):raise ValueError('型号格式不正确')
        return re.sub(r'\s+',' ',value.strip())

class SalesBatchIn(BaseModel):
    revision: str=Field(min_length=1,max_length=500)
    mode: Literal['fill','replace']='fill'
    source: Literal['manual','excel','backup']='manual'
    rows: list[SalesCellIn]=Field(min_length=1,max_length=5000)

class SalesUndoIn(BaseModel):
    revision: str=Field(min_length=1,max_length=500)

def base_signature(history):
    return '|'.join(f"{data.get('year','')}:{data.get('revision','')}" for data in sorted(history,key=lambda data:data.get('year',0),reverse=True))

def revision(history,version):return base_signature(history)+'#'+version

def patch_key(row):return (row['year'],normalize_model(row['model']),row['month'])

def build_history(base,patches):
    result=copy.deepcopy(base);affected=set()
    for patch in patches:
        year,model,month,units=patch['year'],patch['model'],patch['month'],patch['units'];key=normalize_model(model)
        data=next((data for data in result if data.get('year')==year),None)
        if data is None:
            if units is None:continue
            data={'schema_version':1,'year':year,'through_month':month,'blank_policy':'missing','months':[],'products':[],'source_rows':0,'missing_model_records':0,'monthly_totals':[],'summary_difference':[],'revision':''};result.append(data)
        length=max(data['through_month'],month);data['through_month']=length;data['months']=[f'{year}-{m:02}' for m in range(1,length+1)]
        for product in data['products']:
            product['monthly_units']+=[None]*(length-len(product['monthly_units']))
            product['recorded_rows']+=[0]*(length-len(product['recorded_rows']))
        product=next((row for row in data['products'] if normalize_model(row['model'])==key),None)
        if product is None:
            if units is None:continue
            product={'id':'sales-'+hashlib.sha256(key.encode()).hexdigest()[:20],'model':model,'category':category(key),'monthly_units':[None]*length,'recorded_rows':[0]*length,'source_rows':1,'missing_model':key=='未标注型号'};data['products'].append(product)
        product['monthly_units'][month-1]=units;product['recorded_rows'][month-1]=int(units is not None)
        product['aggregate_months']=sorted(set(product.get('aggregate_months',[])+[month]));affected.add(year)
    for data in result:
        if data.get('year') not in affected:continue
        data['aggregation']='model-month' if all(row['source_rows']==1 for row in data['products']) else 'mixed'
        data['source_rows']=sum(row['source_rows'] for row in data['products']);data['monthly_totals']=[sum(row['monthly_units'][i] or 0 for row in data['products']) for i in range(data['through_month'])]
        data['missing_model_records']=sum(int(row.get('missing_model',False) and any(value is not None for value in row['monthly_units'])) for row in data['products'])
        data['summary_difference']=[None]*data['through_month'];data['revision']=hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
    return sorted(result,key=lambda data:data.get('year',0),reverse=True)

def plan(base,patches,rows,mode):
    effective=build_history(base,patches);seen=set();changes=[];skipped=0;identical=0
    for row in rows:
        key=patch_key(row)
        if key in seen:raise HTTPException(422,'同一型号年月重复，请保留一条月合计')
        seen.add(key)
        data=next((data for data in effective if data.get('year')==row['year']),None)
        product=next((p for p in data['products'] if normalize_model(p['model'])==key[1]),None) if data else None
        if key[1]=='未标注型号' and not product:raise HTTPException(422,'请填写真实产品型号')
        before=product['monthly_units'][row['month']-1] if product and row['month']<=len(product['monthly_units']) else None
        if before==row['units']:identical+=1;continue
        if mode=='fill' and before is not None:skipped+=1;continue
        changes.append({**row,'before':before})
    return {'changes':changes,'changed':len(changes),'skipped':skipped,'identical':identical}

def current_state(session):return session.get(SalesDataState,'sales')
def view(base,session):
    state=current_state(session);patches=state.patches if state else [];version=state.version if state else 'empty'
    changes=session.scalars(select(SalesDataChange).order_by(SalesDataChange.created_at.desc(),SalesDataChange.id.desc()).limit(20))
    last=session.scalar(select(SalesDataChange).where(SalesDataChange.undone==False).order_by(SalesDataChange.created_at.desc(),SalesDataChange.id.desc()).limit(1))
    def public(row):return {'id':row.id,'label':row.label,'created_at':row.created_at,'count':row.count,'undone':row.undone}
    return {'history':build_history(base,patches),'revision':revision(base,version),'changes':[public(row) for row in changes],'latest_undoable':public(last) if last else None,'storage':'server'}

def effective_history(base,factory):
    with factory() as session:
        state=current_state(session);return build_history(base,state.patches if state else [])

def register_maintenance_routes(app,factory,read_base):
    @app.get('/api/sales-data')
    def get_data():
        with factory() as session:return view(read_base(),session)

    @app.post('/api/sales-data/preview')
    def preview(payload:SalesBatchIn):
        base=read_base()
        with factory() as session:
            state=current_state(session)
            if payload.revision!=revision(base,state.version if state else 'empty'):raise HTTPException(409,'数据已更新，请刷新后重新预览')
            return plan(base,state.patches if state else [],[row.model_dump() for row in payload.rows],payload.mode)

    @app.post('/api/sales-data/commit')
    def commit(payload:SalesBatchIn):
        base=read_base()
        try:
            with factory() as session,session.begin():
                state=session.scalar(select(SalesDataState).where(SalesDataState.id=='sales').with_for_update())
                version=state.version if state else 'empty';before=copy.deepcopy(state.patches if state else [])
                if payload.revision!=revision(base,version):raise HTTPException(409,'数据已更新，请刷新后重新预览')
                result=plan(base,before,[row.model_dump() for row in payload.rows],payload.mode)
                if not result['changed']:return {**view(base,session),'result':result}
                patches={patch_key(row):row for row in before}
                for row in result['changes']:patches[patch_key(row)]={key:row[key] for key in ['year','model','month','units']}
                new=list(patches.values());new_version=uuid.uuid4().hex
                if state:
                    count=session.execute(update(SalesDataState).where(SalesDataState.id=='sales',SalesDataState.version==version).values(patches=new,version=new_version)).rowcount
                    if count!=1:raise HTTPException(409,'数据已更新，请重新预览')
                    session.expire(state)
                else:session.add(SalesDataState(id='sales',version=new_version,patches=new))
                session.add(SalesDataChange(label={'manual':'手动维护','excel':'Excel 导入','backup':'备份导入'}[payload.source],created_at=datetime.now(timezone.utc).isoformat(timespec='microseconds'),count=result['changed'],before_patches=before))
                session.flush();return {**view(base,session),'result':result}
        except IntegrityError:raise HTTPException(409,'数据已更新，请重新预览')

    @app.post('/api/sales-data/changes/{change_id}/undo')
    def undo(change_id:str,payload:SalesUndoIn):
        base=read_base()
        with factory() as session,session.begin():
            state=session.scalar(select(SalesDataState).where(SalesDataState.id=='sales').with_for_update())
            if not state or payload.revision!=revision(base,state.version):raise HTTPException(409,'数据已更新，请刷新后重试')
            last=session.scalar(select(SalesDataChange).where(SalesDataChange.undone==False).order_by(SalesDataChange.created_at.desc(),SalesDataChange.id.desc()).limit(1))
            if not last or last.id!=change_id:raise HTTPException(409,'只能撤销最近一次未撤销的维护')
            changed=session.execute(update(SalesDataState).where(SalesDataState.id=='sales',SalesDataState.version==state.version).values(patches=last.before_patches,version=uuid.uuid4().hex)).rowcount
            if changed!=1:raise HTTPException(409,'数据已更新，请重试')
            last.undone=True;session.expire(state);session.flush();return view(base,session)
