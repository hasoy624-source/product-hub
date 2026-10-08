import {unzipSync,strFromU8} from 'fflate'
import {validateSalesCells,salesCellKey} from './sales-maintenance-model.ts'
import type {SalesCell} from './sales-maintenance-model'
import {modelKey} from './sales-lifecycle-model.ts'
type Cell={value:string|null;formula?:string}
export type SheetRow={row:number;cells:Record<number,Cell>}
const monthHeaders=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
function parseQuantity(value:string,row:number,month:number):number{if(!/^\d+$/.test(value.trim())||!Number.isSafeInteger(Number(value))||Number(value)>1000000000)throw new Error(`第 ${row} 行 ${month} 月销量须为非负整数`);return Number(value)}
export function parseSalesSheet(rows:SheetRow[],fallbackYear:number,through:number,longOnly=false):{rows:SalesCell[];year:number;format:string}{
  if(rows.length>20000)throw new Error('销售工作表最多 20,000 行')
  if(!Number.isInteger(fallbackYear)||fallbackYear<1900||fallbackYear>9998||!Number.isInteger(through)||through<1||through>12)throw new Error('请填写有效年份与截止月份')
  const norm=(text:string|null|undefined)=>(text||'').trim().toLowerCase().replace(/[\s._]/g,'')
  const aliases={year:['年份','年度','year'],month:['月份','month','年月'],model:['产品型号','型号','model','modelno'],units:['销量','数量','units','quantity','qty']}
  for(const row of rows.slice(0,20)){
    const columns=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,Number(Object.keys(row.cells).find(key=>names.includes(norm(row.cells[Number(key)].value))))]))
    if(columns.model&&columns.units&&columns.month){
      const result:SalesCell[]=[]
      for(const record of rows.filter(item=>item.row>row.row)){
        const model=record.cells[columns.model]?.value?.trim().replace(/\s+/g,' '),raw=record.cells[columns.units]?.value
        for(const column of [columns.units,columns.year,columns.month]){const cell=record.cells[column];if(cell?.formula&&(cell.value===null||cell.value===undefined||!cell.value.trim()))throw new Error(`第 ${record.row} 行公式缺少结果，请用 Excel 保存后重试`)}
        if(!model&&!raw)continue
        if(!model)throw new Error(`第 ${record.row} 行缺少产品型号`)
        if(raw===null||raw===undefined||!raw.trim())continue
        const monthText=record.cells[columns.month]?.value?.trim()||'',match=monthText.match(/^(\d{4})-(\d{1,2})$/),year=match?Number(match[1]):Number(record.cells[columns.year]?.value||fallbackYear),month=match?Number(match[2]):Number(monthText.replace(/月$/,''))
        result.push({year,month,model,units:parseQuantity(raw,record.row,month)})
      }
      return {rows:validateSalesCells(result),year:result[0]?.year||fallbackYear,format:'型号月份合计'}
    }
  }
  if(longOnly)throw new Error('CSV 请使用年份、月份、产品型号、销量长表；年度宽表请上传 .xlsx')
  const header=rows.find(row=>Object.values(row.cells).some(cell=>norm(cell.value)==='jan'))
  if(!header)throw new Error('未找到型号/月份/销量表头，或 Jan–Dec 销量表头')
  const jan=Number(Object.keys(header.cells).find(key=>norm(header.cells[Number(key)].value)==='jan')),modelColumn=jan-1
  if(jan<2||!['','modelno','model','型号'].includes(norm(header.cells[modelColumn]?.value)))throw new Error('Jan 前一列应为产品型号')
  for(let i=0;i<12;i++){const label=norm(header.cells[jan+i]?.value);if(label&&label.slice(0,3)!==monthHeaders[i])throw new Error('月份列顺序应为 Jan–Dec')}
  const title=rows.filter(row=>row.row<header.row).flatMap(row=>Object.values(row.cells).map(cell=>cell.value||'')).join(' '),yearMatch=title.match(/(?:19|20|21)\d{2}/),year=yearMatch?Number(yearMatch[0]):fallbackYear
  const result=new Map<string,SalesCell>(),labels=new Map<string,string>()
  for(const record of rows.filter(row=>row.row>header.row)){
    let model=record.cells[modelColumn]?.value?.trim().replace(/\s+/g,' ')||''
    if(Object.entries(record.cells).some(([column,cell])=>Number(column)<jan&&/^(total(?:\s*\([^)]*\))?|total\s+(?:units|quantity)|合计|总计|总数量|总销量)$/i.test((cell.value||'').trim())))break
    if(!model&&Array.from({length:12},(_,i)=>record.cells[jan+i]?.formula?.trim().toUpperCase().startsWith('SUM(')).some(Boolean))break
    if(model){const key=modelKey(model);model=labels.get(key)||model;labels.set(key,model)}
    for(let i=0;i<through;i++){
      const cell=record.cells[jan+i],raw=cell?.value
      if(cell?.formula&&(raw===null||raw===undefined))throw new Error(`第 ${record.row} 行公式缺少结果，请用 Excel 保存后重试`)
      if(raw===null||raw===undefined||!raw.trim())continue
      const value=parseQuantity(raw,record.row,i+1),entry={year,model:model||'未标注型号',month:i+1,units:value},key=salesCellKey(entry)
      const previous=result.get(key);entry.units=value+(previous?.units??0);if(previous)entry.model=previous.model;result.set(key,entry)
    }
  }
  return {rows:validateSalesCells([...result.values()]),year,format:'年度销量宽表（型号合计）'}
}
function xml(text:string){const parsed=new DOMParser().parseFromString(text,'application/xml');if(parsed.getElementsByTagName('parsererror').length||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Excel XML 格式不正确');return parsed}
function nodes(parent:Document|Element,name:string){return Array.from(parent.getElementsByTagNameNS('*',name))}
function extract(bytes:Uint8Array,names:Set<string>){let size=0,count=0;return unzipSync(bytes,{filter:file=>{if(++count>2000)throw new Error('Excel 文件项过多');if(!names.has(file.name))return false;size+=file.originalSize;if(size>32*1024*1024)throw new Error('Excel 展开数据过大');return true}})}
export async function readSalesFile(file:File,year:number,through:number){
  if(file.size>10*1024*1024)throw new Error('文件应不超过 10 MB')
  if(file.name.toLowerCase().endsWith('.csv')){
    let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/,'')}catch{throw new Error('CSV 请用 UTF-8 编码保存')}
    const matrix=parseCSV(text)
    return parseSalesSheet(matrix.map((row,index)=>({row:index+1,cells:Object.fromEntries(row.map((value,i)=>[i+1,{value}]))})),year,through,true)
  }
  if(!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('请选择 .xlsx 或 UTF-8 CSV 文件')
  const bytes=new Uint8Array(await file.arrayBuffer()),meta=extract(bytes,new Set(['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml']))
  if(!meta['xl/workbook.xml']||!meta['xl/_rels/workbook.xml.rels'])throw new Error('请选择标准 Excel .xlsx 文件')
  const workbook=xml(strFromU8(meta['xl/workbook.xml'])),rels=xml(strFromU8(meta['xl/_rels/workbook.xml.rels'])),sheets=nodes(workbook,'sheet')
  const sheet=sheets.find(sheet=>sheet.getAttribute('name')==='Monthly Sales by Product')||sheets.find(sheet=>!['hidden','veryHidden'].includes(sheet.getAttribute('state')||''))
  if(!sheet)throw new Error('没有可导入的销售工作表')
  const id=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),rel=nodes(rels,'Relationship').find(rel=>rel.getAttribute('Id')===id),target=rel?.getAttribute('Target')||''
  if(rel?.getAttribute('TargetMode')==='External'||target.includes('..')||!/^\/?(?:xl\/)?worksheets\/[^/]+\.xml$/.test(target))throw new Error('销售工作表路径不正确')
  const path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target,files=extract(bytes,new Set([path]));if(!files[path])throw new Error('销售工作表缺失')
  const shared=meta['xl/sharedStrings.xml']?nodes(xml(strFromU8(meta['xl/sharedStrings.xml'])),'si').map(node=>nodes(node,'t').map(item=>item.textContent||'').join('')):[]
  const document=xml(strFromU8(files[path])),records:SheetRow[]=nodes(document,'row').map(row=>({row:Number(row.getAttribute('r')),cells:Object.fromEntries(nodes(row,'c').map(cell=>{
    const ref=cell.getAttribute('r')||'',letters=ref.match(/^[A-Z]+/)?.[0]||'';let column=0;for(const char of letters)column=column*26+char.charCodeAt(0)-64
    const raw=nodes(cell,'v')[0]?.textContent??null,type=cell.getAttribute('t'),value=type==='s'?(raw===null?null:shared[Number(raw)]):type==='inlineStr'?nodes(cell,'t').map(item=>item.textContent||'').join(''):raw
    return [column,{value,formula:nodes(cell,'f')[0]?.textContent||undefined}]
  }))}))
  if(records.length>20000)throw new Error('销售工作表最多 20,000 行')
  return parseSalesSheet(records,year,through)
}
export function parseCSV(text:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false
  for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(char===','&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=char}
  if(quoted)throw new Error('CSV 引号未闭合');if(cell||row.length){row.push(cell);rows.push(row)}return rows
}
