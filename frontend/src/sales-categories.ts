import rules from '../../config/sales-category-rules.json' with {type:'json'}
export const salesCategories:string[]=rules.categories
export function salesModelCategory(model:string):string{
  const key=model.normalize('NFKC').replace(/\s+/g,'').toUpperCase(),exact=rules.exact as Record<string,string>,prefix=rules.prefix as Record<string,string>
  return Object.hasOwn(exact,key)?exact[key]:Object.hasOwn(prefix,key[0])?prefix[key[0]]:'待分类'
}
