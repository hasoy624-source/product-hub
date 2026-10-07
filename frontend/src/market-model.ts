import type { Signal } from './types'

export type Review = { id:string; source_id:string; product_title:string; product_url:string; title:string; content:string; rating:number; sentiment:string; published_on:string; published_raw:string; verified_purchase:boolean; tags:string[]; source_url:string; first_seen_at:string; last_seen_at:string }
export type MarketSource = { id:string; name:string; collection_url:string; enabled:boolean; interval_hours:number; last_run_at?:string; next_run_at?:string; last_status?:string; message?:string; product_count?:number; review_count?:number; retry_after?:number; max_products?:number; max_collection_pages?:number; max_review_pages?:number }
export type CrawlRun = { id:string; source_id:string; started_at:string; finished_at:string; status:string; products_found:number; products_scanned:number; reviews_found:number; new_reviews:number; message:string; retry_after:number }
export type MarketSnapshot = { schema_version:number; updated_at:string; available:boolean; sources:MarketSource[]; reviews:Review[]; products:Array<{source_id:string;url:string;title:string;status?:string;review_count?:number}>; runs:CrawlRun[]; schedule:{timezone:string;daily_time:string}; error?:string }
export const crawlStatus:Record<string,string> = {pending:'待首次采集',running:'采集中',success:'采集完成',partial:'部分完成',failed:'采集失败',rate_limited:'等待重试',needs_adapter:'待适配',robots_blocked:'路径未开放',not_found:'页面不存在'}
export function filterReviews(rows:Review[], source='all', rating='all', query='') {
  const needle=query.trim().toLowerCase()
  return rows.filter(row=>(source==='all'||row.source_id===source)&&(rating==='all'||rating==='low'&&row.rating<=2||Number(rating)===row.rating)&&(!needle||[row.product_title,row.title,row.content,...row.tags].join(' ').toLowerCase().includes(needle)))
}
export function reviewSignals(snapshot:MarketSnapshot):Signal[] {
  return snapshot.reviews.map(row=>({id:row.id,kind:'独立站评价',brand:row.product_title,title:`${row.rating} 星 · ${row.title||row.product_title}`,content:row.content,sentiment:row.sentiment,source_url:row.source_url,occurred_on:row.published_on}))
}
export function mergeReviewSignals(manual:Signal[],snapshot:MarketSnapshot) {
  const rows=new Map(manual.map(row=>[row.id,row]))
  for(const row of reviewSignals(snapshot)) if(!rows.has(row.id)) rows.set(row.id,row)
  return [...rows.values()]
}
let cached:MarketSnapshot|null=null
let cachedAt=0
let pending:Promise<MarketSnapshot>|null=null
export async function publicMarketSnapshot(base:string,fetcher:typeof fetch=fetch):Promise<MarketSnapshot> {
  if(cached&&Date.now()-cachedAt<30_000)return structuredClone(cached)
  if(pending)return pending
  pending=(async()=>{
    try {
      const response=await fetcher(`${base.endsWith('/')?base:base+'/'}market/latest.json`,{cache:'no-store',signal:AbortSignal.timeout(10000)})
      if(!response.ok)throw new Error(`采集快照读取失败（${response.status}）`)
      const value=await response.json() as MarketSnapshot
      if(value.schema_version!==1||!Array.isArray(value.reviews)||!Array.isArray(value.sources)||!Array.isArray(value.runs))throw new Error('采集快照格式不匹配')
      cached=value;cachedAt=Date.now();return structuredClone(value)
    }catch(error) {
      return {...(cached||{schema_version:1,updated_at:'',sources:[],reviews:[],products:[],runs:[],schedule:{timezone:'Asia/Shanghai',daily_time:'09:00'}}),available:false,error:error instanceof Error?error.message:'采集快照读取失败'}
    }finally{pending=null}
  })()
  return pending
}
export function clearMarketCache(){cachedAt=0;cached=null;pending=null}
