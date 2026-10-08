import seed from '../../config/sales-category-rules.json' with {type:'json'}
import type {Dashboard} from './types'
export type TypeTone='cyan'|'blue'|'violet'|'amber'|'rose'|'red'|'neutral'
export type ProductType={id:string;name:string;tone:TypeTone;active:boolean;order:number;aliases:string[]}
export type ProductTypeRule={id:string;kind:'exact'|'prefix';value:string;category_id:string;priority:number;active:boolean}
export type ModelTypeOverride={model:string;category_id:string}
export type ProductTaxonomy={schema_version:1;fallback_id:string;categories:ProductType[];rules:ProductTypeRule[];overrides:ModelTypeOverride[]}
export type ProductTaxonomyView={config:ProductTaxonomy;revision:string;storage:'browser'|'server';can_undo:boolean}
export const typeTones:TypeTone[]=['violet','cyan','amber','blue','rose','red','neutral']
const ids=['battery','accessory','dry-burn','atomizer','disposable','unclassified'],tones:TypeTone[]=['violet','cyan','amber','blue','rose','neutral']
export const normalizedTypeModel=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toUpperCase()
export function defaultProductTaxonomy():ProductTaxonomy{
  const categories=seed.categories.map((name,i)=>({id:ids[i],name,tone:tones[i],active:true,order:(i+1)*10,aliases:[]})),categoryId=(name:string)=>categories.find(row=>row.name===name)!.id
  const rules:ProductTypeRule[]=[...Object.entries(seed.exact).map(([value,name],i)=>({id:'exact-'+i,kind:'exact' as const,value,category_id:categoryId(name),priority:100,active:true})),...Object.entries(seed.prefix).map(([value,name],i)=>({id:'prefix-'+i,kind:'prefix' as const,value,category_id:categoryId(name),priority:200,active:true}))]
  return {schema_version:1,fallback_id:'unclassified',categories,rules,overrides:[]}
}
export function validateProductTaxonomy(input:ProductTaxonomy):ProductTaxonomy{
  if(!input||input.schema_version!==1||!Array.isArray(input.categories)||!input.categories.length||input.categories.length>50||!Array.isArray(input.rules)||input.rules.length>1000||!Array.isArray(input.overrides)||input.overrides.length>5000)throw new Error('配置结构或数量不正确')
  const config=structuredClone(input),ids=new Set<string>(),names=new Map<string,string>(),cleanName=(name:string)=>{if(typeof name!=='string'||!name.trim()||name.length>50||/[\x00-\x1f\x7f]/.test(name)||['全部','全部产品','全部项目','全部报告'].includes(name.trim()))throw new Error('产品类型名称不正确');return name.trim()}
  for(const row of config.categories){
    if(typeof row.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(row.id)||ids.has(row.id)||!typeTones.includes(row.tone)||typeof row.active!=='boolean'||!Number.isInteger(row.order)||row.order<0||row.order>10000||!Array.isArray(row.aliases)||row.aliases.length>100)throw new Error('类型 ID、颜色、启用状态或排序不正确')
    ids.add(row.id);row.name=cleanName(row.name);row.aliases=[...new Set(row.aliases.map(cleanName))]
    for(const name of [row.name,...row.aliases]){const owner=names.get(name);if(owner&&owner!==row.id)throw new Error('类型名称或历史名称与其他类型重复');names.set(name,row.id)}
  }
  if(!ids.has(config.fallback_id)||!config.categories.find(row=>row.id===config.fallback_id)?.active)throw new Error('兜底类型必须保留且启用')
  const ruleIds=new Set<string>(),ruleKeys=new Set<string>()
  for(const rule of config.rules){
    if(typeof rule.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(rule.id)||ruleIds.has(rule.id)||!['exact','prefix'].includes(rule.kind)||typeof rule.value!=='string'||!rule.value.trim()||rule.value.length>200||/[\x00-\x1f\x7f]/.test(rule.value)||!ids.has(rule.category_id)||!Number.isInteger(rule.priority)||rule.priority<0||rule.priority>10000||typeof rule.active!=='boolean')throw new Error('归类规则格式不正确')
    const key=rule.kind+':'+normalizedTypeModel(rule.value);if(ruleKeys.has(key))throw new Error('同一种匹配方式的规则重复');ruleIds.add(rule.id);ruleKeys.add(key);rule.value=rule.value.trim()
  }
  const models=new Set<string>()
  for(const row of config.overrides){if(typeof row.model!=='string'||!row.model.trim()||row.model.length>200||/[\x00-\x1f\x7f]/.test(row.model)||!ids.has(row.category_id))throw new Error('型号单独归类格式不正确');const key=normalizedTypeModel(row.model);if(models.has(key))throw new Error('型号单独归类重复');models.add(key);row.model=row.model.trim()}
  config.categories.sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));return config
}
export function classifiedProductType(model:string,config:ProductTaxonomy):ProductType{
  const key=normalizedTypeModel(model),override=config.overrides.find(row=>normalizedTypeModel(row.model)===key)
  const rules=config.rules.filter(row=>row.active).slice().sort((a,b)=>Number(a.kind==='prefix')-Number(b.kind==='prefix')||a.priority-b.priority||b.value.length-a.value.length||a.id.localeCompare(b.id))
  const rule=rules.find(row=>row.kind==='exact'?key===normalizedTypeModel(row.value):key.startsWith(normalizedTypeModel(row.value)))
  return config.categories.find(row=>row.id===(override?.category_id||rule?.category_id||config.fallback_id))!
}
export let currentProductTaxonomy=defaultProductTaxonomy()
export let currentTaxonomyRevision='seed'
export let runtimeCategoryNames=currentProductTaxonomy.categories.map(row=>row.name)
export function activateProductTaxonomy(view:ProductTaxonomyView){currentProductTaxonomy=validateProductTaxonomy(view.config);currentTaxonomyRevision=view.revision;runtimeCategoryNames=currentProductTaxonomy.categories.map(row=>row.name)}
export function configuredTypeTone(name:string):TypeTone|undefined{return currentProductTaxonomy.categories.find(row=>row.name===name)?.tone}
export function visibleProductTypeNames(products:{category:string}[]):string[]{return currentProductTaxonomy.categories.filter(row=>row.active||products.some(product=>product.category===row.name)).map(row=>row.name)}
export function canonicalProductTypeName(name:string,config=currentProductTaxonomy){return config.categories.find(row=>row.name===name||row.aliases.includes(name))?.name||name}
export function canonicalProductDashboard(data:Dashboard):Dashboard{const grouped=new Map<string,number>();for(const row of data.category_sales){const name=canonicalProductTypeName(row.category);grouped.set(name,(grouped.get(name)||0)+row.revenue_cents)}return {...data,product_sales:data.product_sales.map(row=>({...row,category:canonicalProductTypeName(row.category)})),category_sales:[...grouped].map(([category,revenue_cents])=>({category,revenue_cents,share:data.revenue_cents?Math.round(revenue_cents/data.revenue_cents*10000)/100:0})).sort((a,b)=>b.revenue_cents-a.revenue_cents||a.category.localeCompare(b.category))}}
export function taxonomyPreview(products:{model:string;category:string;year:number}[],config:ProductTaxonomy){const next=validateProductTaxonomy(config);return products.map(row=>({...row,before:row.category,after:classifiedProductType(row.model,next).name})).filter(row=>row.after!==row.before)}
