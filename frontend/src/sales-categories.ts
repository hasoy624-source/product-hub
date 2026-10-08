import {currentProductTaxonomy,classifiedProductType} from './product-taxonomy-model.ts'
export {runtimeCategoryNames as salesCategories} from './product-taxonomy-model.ts'
export function salesModelCategory(model:string):string{
  return classifiedProductType(model,currentProductTaxonomy).name
}
