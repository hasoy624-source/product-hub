import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultProductTaxonomy,validateProductTaxonomy,classifiedProductType,activateProductTaxonomy,canonicalProductTypeName,canonicalProductDashboard,visibleProductTypeNames,taxonomyPreview} from '../src/product-taxonomy-model.ts'
import {salesModelCategory,salesCategories} from '../src/sales-categories.ts'
import {categoryTone} from '../src/semantics.ts'
import {buildSalesHistory} from '../src/sales-maintenance-model.ts'
import {generateSalesConclusion,defaultConclusionFilters} from '../src/sales-conclusions-model.ts'
import {readFileSync} from 'node:fs'
const base=JSON.parse(readFileSync(new URL('../public/sales/lifecycle.json',import.meta.url),'utf8'))
function custom(){const config=defaultProductTaxonomy();config.categories.push({id:'ceramic',name:'陶瓷类',tone:'rose',active:true,order:5,aliases:[]});config.rules.push({id:'ceramic-prefix',kind:'prefix',value:'Z-',category_id:'ceramic',priority:100,active:true});return config}
test('operators can add type color order and rules without changing model or quantity data',async()=>{
  const config=validateProductTaxonomy(custom()),original=JSON.stringify(base)
  try{activateProductTaxonomy({config,revision:'custom',storage:'browser',can_undo:true});assert.equal(salesCategories[0],'陶瓷类');assert.equal(categoryTone('陶瓷类'),'rose');assert.equal(salesModelCategory('z-1'),'陶瓷类');const history=await buildSalesHistory([base],[{year:2027,month:1,model:'Z-1',units:7}]);assert.equal(history[0].products[0].category,'陶瓷类');const report=generateSalesConclusion(history[0],defaultConclusionFilters(history[0]),[]);assert.equal(report.shares[0].category,'陶瓷类');assert.equal(report.total,7);assert.equal(JSON.stringify(base),original)}finally{activateProductTaxonomy({config:defaultProductTaxonomy(),revision:'seed',storage:'browser',can_undo:false})}
})
test('stable category IDs propagate renames and model overrides outrank exact and prefix rules',()=>{
  const config=custom(),battery=config.categories.find(row=>row.id==='battery');battery.aliases.push(battery.name);battery.name='电池产品';config.overrides.push({model:'122N',category_id:'battery'});const valid=validateProductTaxonomy(config)
  assert.equal(classifiedProductType('mini2',valid).name,'电池产品');assert.equal(classifiedProductType('122n',valid).name,'电池产品');assert.equal(canonicalProductTypeName('电池类',valid),'电池产品')
  const changes=taxonomyPreview([{year:2026,model:'122N',category:'待分类'}],valid);assert.equal(changes[0].before,'待分类');assert.equal(changes[0].after,'电池产品')
})
test('disabled empty types disappear from choices but historical categories and existing rules remain',()=>{
  const config=custom();config.categories.find(row=>row.id==='ceramic').active=false
  try{activateProductTaxonomy({config,revision:'disabled',storage:'browser',can_undo:true});assert.equal(visibleProductTypeNames([]).includes('陶瓷类'),false);assert.equal(visibleProductTypeNames([{category:'陶瓷类'}]).includes('陶瓷类'),true);assert.equal(salesModelCategory('Z-1'),'陶瓷类')}finally{activateProductTaxonomy({config:defaultProductTaxonomy(),revision:'seed',storage:'browser',can_undo:false})}
})
test('renamed types regroup dashboard labels without changing revenue or saved product categories',()=>{
  const config=defaultProductTaxonomy(),battery=config.categories.find(row=>row.id==='battery');battery.name='电池产品';battery.aliases=['电池类']
  const dashboard={revenue_cents:100,product_sales:[{category:'电池类',revenue_cents:60}],category_sales:[{category:'电池类',revenue_cents:60,share:60},{category:'电池产品',revenue_cents:40,share:40}]},original=JSON.stringify(dashboard)
  try{activateProductTaxonomy({config,revision:'renamed',storage:'browser',can_undo:true});const next=canonicalProductDashboard(dashboard);assert.equal(next.product_sales[0].category,'电池产品');assert.deepEqual(next.category_sales,[{category:'电池产品',revenue_cents:100,share:100}]);assert.equal(JSON.stringify(dashboard),original)}finally{activateProductTaxonomy({config:defaultProductTaxonomy(),revision:'seed',storage:'browser',can_undo:false})}
})
test('configuration rejects duplicate names conflicting rules orphan assignments and disabled fallback',()=>{
  let c=custom();c.categories[1].name=c.categories[0].name;assert.throws(()=>validateProductTaxonomy(c))
  c=custom();c.rules.push({...c.rules[0],id:'duplicate'});assert.throws(()=>validateProductTaxonomy(c))
  c=custom();c.overrides.push({model:'D-1',category_id:'missing'});assert.throws(()=>validateProductTaxonomy(c))
  c=custom();c.categories.find(row=>row.id===c.fallback_id).active=false;assert.throws(()=>validateProductTaxonomy(c))
  c=custom();c.rules[0].id=12;assert.throws(()=>validateProductTaxonomy(c))
  const page=readFileSync(new URL('../src/ClassificationSettings.tsx',import.meta.url),'utf8');assert.ok(page.includes('<ProductTypeSettings'));assert.ok(page.includes('操作入口'));assert.ok(page.includes('研发项目'));assert.ok(page.includes('报告档案'))
})
