import {emptySalesStore,buildSalesHistory,salesDataView,applySalesBatch,undoSalesBatch,planSalesCells,salesDataRevision} from './sales-maintenance-model'
import type {SalesStore,SalesBatch,SalesDataView} from './sales-maintenance-model'
import type {SalesDataset} from './sales-lifecycle-model'
const databaseName='impetus-sales-data-v1'
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(databaseName,1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('销售数据存储打开失败'))})}
export async function loadSalesStore():Promise<SalesStore>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly'),request=tx.objectStore('workspace').get('state');let value:SalesStore;request.onsuccess=()=>{value=request.result||emptySalesStore()};tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=()=>{db.close();reject(new Error('销售维护数据读取失败'))}})}
async function saveSalesStore(expected:string,store:SalesStore):Promise<void>{const db=await database();return new Promise((resolve,reject)=>{let conflict=false;const tx=db.transaction('workspace','readwrite'),table=tx.objectStore('workspace'),request=table.get('state');request.onsuccess=()=>{if((request.result?.version||'empty')!==expected){conflict=true;tx.abort();return}table.put(store,'state')};tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>{db.close();reject(new Error(conflict?'数据已更新，请刷新后重新预览':'销售维护数据保存失败'))};tx.onerror=()=>{db.close();reject(new Error('销售维护数据保存失败'))}})}
export async function maintainedSalesHistory(base:SalesDataset[]){return buildSalesHistory(base,(await loadSalesStore()).patches)}
export async function previewSalesDataApi(path:string,method:string,body:unknown,base:SalesDataset[]):Promise<unknown>{
  const store=await loadSalesStore()
  if(path==='/sales-data'&&method==='GET')return salesDataView(base,store)
  if(path==='/sales-data/preview'&&method==='POST'){
    const batch=body as SalesBatch;if(batch.revision!==salesDataRevision(base,store.version))throw new Error('数据已更新，请刷新后重新预览')
    return planSalesCells(await buildSalesHistory(base,store.patches),batch.rows,batch.mode)
  }
  if(path==='/sales-data/commit'&&method==='POST'){
    const result=await applySalesBatch(base,store,body as SalesBatch)
    if(result.result.changed)await saveSalesStore(store.version,result.store)
    return {...await salesDataView(base,result.store),result:result.result} as SalesDataView
  }
  const match=path.match(/^\/sales-data\/changes\/([^/]+)\/undo$/)
  if(match&&method==='POST'){const next=undoSalesBatch(base,store,match[1],(body as {revision:string}).revision);await saveSalesStore(store.version,next);return salesDataView(base,next)}
  throw new Error('销售维护接口不存在')
}
