"""Read-only Excel extraction of model/month quantities, excluding customer fields."""
import argparse,hashlib,json,re,unicodedata,zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def column(reference):
    value=0
    for char in re.match(r'[A-Z]+',reference)[0]:value=value*26+ord(char)-64
    return value
def normalize_model(value):
    return re.sub(r'\s+','',unicodedata.normalize('NFKC',value)).upper()
def category(model):return {'D':'电池类','P':'配件类','G':'干烧类'}.get(model[:1].upper(),'待分类')

def import_sales(source:Path,year:int,through:int):
    if not 1900<=year<=9998 or not 1<=through<=12:raise ValueError('年份或截止月份不正确')
    with zipfile.ZipFile(source) as archive:
        if sum(info.file_size for info in archive.infolist())>100*1024*1024:raise ValueError('Excel 展开内容过大')
        shared=[]
        if 'xl/sharedStrings.xml' in archive.namelist():shared=[''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si',NS)]
        workbook=ET.fromstring(archive.read('xl/workbook.xml'));rels={node.attrib['Id']:node.attrib['Target'] for node in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheet=next((node for node in workbook.findall('m:sheets/m:sheet',NS) if node.attrib['name']=='Monthly Sales by Product'),None)
        if sheet is None:raise ValueError('缺少 Monthly Sales by Product 销售工作表')
        target=rels[sheet.attrib['{'+NS['r']+'}id']]
        path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
        xml=ET.fromstring(archive.read(path))
    def value(cell):
        raw=cell.find('m:v',NS)
        if cell.attrib.get('t')=='s':return shared[int(raw.text)] if raw is not None else None
        if cell.attrib.get('t')=='inlineStr':return ''.join(cell.find('m:is',NS).itertext())
        if raw is None:return None
        if cell.attrib.get('t')=='e':return raw.text
        try:return float(raw.text)
        except ValueError:return raw.text
    products={};header=False;controls=None;source_rows=0;missing_models=0
    for row in xml.findall('m:sheetData/m:row',NS):
        number=int(row.attrib['r']);cells={column(c.attrib['r']):c for c in row.findall('m:c',NS)}
        if not header:
            if 2 in cells and value(cells[2])=='Model No.' and 3 in cells and value(cells[3])=='Jan':header=True
            continue
        model=str(value(cells[2]) or '').strip() if 2 in cells else ''
        if not model and any(c.find('m:f',NS) is not None and (c.find('m:f',NS).text or '').upper().startswith('SUM(') for k,c in cells.items() if 3<=k<=14):
            controls=[value(cells.get(3+i)) if 3+i in cells else None for i in range(through)];break
        quantities=[]
        for index in range(through):
            cell=cells.get(index+3);raw=value(cell) if cell is not None else None
            if raw is not None and (not isinstance(raw,(int,float)) or raw<0 or int(raw)!=raw):raise ValueError(f'销量单元格 {number}/{index+1} 不是非负整数')
            if cell is not None and cell.find('m:f',NS) is not None and raw is None:raise ValueError('销量公式缺少缓存结果')
            quantities.append(int(raw) if raw is not None else None)
        if not model and not any(q is not None and q!=0 for q in quantities):continue
        source_rows+=1
        if not model:missing_models+=1;model='未标注型号'
        key=normalize_model(model)
        if key not in products:products[key]={'id':'sales-'+hashlib.sha256(key.encode()).hexdigest()[:20],'model':re.sub(r'\s+',' ',model),'category':category(key),'monthly_units':[None]*through,'recorded_rows':[0]*through,'source_rows':0,'missing_model':key.startswith('未标注型号')}
        product=products[key];product['source_rows']+=1
        for index,quantity in enumerate(quantities):
            if quantity is not None:product['monthly_units'][index]=(product['monthly_units'][index] or 0)+quantity;product['recorded_rows'][index]+=1
    if not header:raise ValueError('销量表头格式不匹配')
    rows=sorted(products.values(),key=lambda p:p['model'])
    totals=[sum(product['monthly_units'][i] or 0 for product in rows) for i in range(through)]
    data={'schema_version':1,'year':year,'through_month':through,'blank_policy':'missing','months':[f'{year}-{month:02}' for month in range(1,through+1)],'products':rows,'source_rows':source_rows,'missing_model_records':missing_models,'monthly_totals':totals,'summary_difference':[totals[i]-int(controls[i]) if controls and isinstance(controls[i],(int,float)) else None for i in range(through)]}
    data['revision']=hashlib.sha256(json.dumps(data,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]
    return data

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('source',type=Path);parser.add_argument('--year',type=int,required=True);parser.add_argument('--through',type=int,required=True);parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'frontend/public/sales/lifecycle.json')
    args=parser.parse_args();data=import_sales(args.source,args.year,args.through);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(f'SALES_IMPORTED: models={len(data["products"])}; rows={data["source_rows"]}; units={sum(data["monthly_totals"])}; missing_models={data["missing_model_records"]}; blank=missing; exit=0')
if __name__=='__main__':main()
