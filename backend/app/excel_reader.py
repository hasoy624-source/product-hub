"""Read project registers without executing formulas or altering the workbook."""
from collections import defaultdict
from datetime import date, datetime, timedelta
import hashlib
from pathlib import Path
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'd': 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
EMPTY = {'', '/', '／', '-', '待启动', '待确认', '时间未确认', '？', '?'}

def identifier(value):
    return 'excel-' + hashlib.sha256(value.strip().casefold().encode()).hexdigest()[:24]

def clean(value):
    return '' if value.strip() in EMPTY else value.strip()

def excel_date(value, epoch_1904=False):
    value = str(value).strip()
    if value in EMPTY: return ''
    if re.fullmatch(r'\d+(?:\.\d+)?', value):
        number = float(value)
        if not epoch_1904 and number == 60: return ''  # Excel's fictional leap day.
        base = date(1904, 1, 1) if epoch_1904 else date(1899, 12, 31 if number < 60 else 30)
        try: result = base + timedelta(days=int(number))
        except (OverflowError, ValueError): return ''
        return result.isoformat() if 1900 <= result.year <= 2100 else ''
    match = re.fullmatch(r'(\d{4})[./-](\d{1,2})[./-](\d{1,2})', value)
    if match:
        try: return date(*map(int, match.groups())).isoformat()
        except ValueError: return ''
    return ''

def phase_for(raw, status):
    if raw in ['预研', '立项', '重新立项', '待重新立项']: return '概念与启动'
    if raw in ['结构设计', '结构优化', '手板样', '手板打样']: return '设计与开发'
    if raw in ['模具制作', '投模', '开模中', '模具T0样', '模具T1样']: return 'EVT'
    if raw in ['试产', '试产备料']: return 'DVT'
    if raw in ['转量产', '量产优化'] or status in ['已转产', '已结案']: return 'MP'
    return '待确认'

def status_for(raw, risk, closed=False):
    if raw in ['已终止', '终止']: return '已终止'
    if raw in ['暂停', '暂停中', '已暂停']: return '暂停'
    if raw in ['已转产', '已结案', '已完成'] or closed: return '已完成'
    if raw in ['未立项', '待立项']: return '待立项'
    if raw == '进行中': return '风险' if clean(risk) else '正常'
    return '待确认'

def category_for(raw):
    return {'CBD电池类': '电池类', '干烧WAX类': '干烧类', '烧膏类': '干烧类'}.get(raw, raw)

def _relations(z, part):
    path = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part) + '.rels')
    if path not in z.namelist(): return {}
    return {r.get('Id'): (posixpath.normpath(posixpath.join(posixpath.dirname(part), r.get('Target', ''))), r.get('Type', ''))
            for r in ET.fromstring(z.read(path)) if r.get('TargetMode') != 'External'}

def read_register(source, assets_dir):
    source, assets_dir = Path(source), Path(assets_dir)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    assets_dir.mkdir(parents=True, exist_ok=True)
    records = []
    all_assets = set()
    with zipfile.ZipFile(source) as z:
        strings = [''.join(t.text or '' for t in item.findall('.//m:t', NS)) for item in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
        book = ET.fromstring(z.read('xl/workbook.xml'))
        props = book.find('m:workbookPr', NS)
        epoch_1904 = props is not None and props.get('date1904') in ['1', 'true']
        book_rels = _relations(z, 'xl/workbook.xml')
        for sheet in book.findall('m:sheets/m:sheet', NS):
            part = book_rels[sheet.get(REL + 'id')][0]
            xml = ET.fromstring(z.read(part))
            rows = {}
            for row in xml.findall('m:sheetData/m:row', NS):
                cells = {}
                for cell in row.findall('m:c', NS):
                    value = cell.findtext('m:v', default='', namespaces=NS)
                    if cell.get('t') == 's': value = strings[int(value)] if value else ''
                    elif cell.get('t') == 'inlineStr': value = ''.join(t.text or '' for t in cell.findall('.//m:t', NS))
                    if value.strip(): cells[re.sub(r'\d', '', cell.get('r'))] = {'value': value, 'cell': cell.get('r'), 'formula': cell.findtext('m:f', default='', namespaces=NS)}
                if cells: rows[int(row.get('r'))] = cells
            header_row = next((r for r, cells in rows.items() if any(c['value'] == '项目号' for c in cells.values())), None)
            if header_row is None: continue
            columns = {c['value'].replace('\n', '').strip(): col for col, c in rows[header_row].items()}
            anchors = []
            identity_notes = {}
            for r, cells in rows.items():
                if r <= header_row or columns['项目号'] not in cells: continue
                code = cells[columns['项目号']]['value'].strip()
                if code.endswith('类'):
                    candidates = [(col, cell) for col, cell in cells.items() if re.fullmatch(r'[A-Za-z]+-\d+[A-Za-z]*', cell['value'].strip())]
                    if len(candidates) == 1:
                        col, cell = candidates[0]
                        identity_notes[r] = f'原表项目号栏 {columns["项目号"]}{r} 填有「{code}」；采用 {cell["cell"]} 的明确项目号 {cell["value"]}，原始单元格已保留。'
                        code = cell['value'].strip()
                anchors.append((r, code))
            updates = [c['value'] for r, cells in rows.items() if r <= header_row for c in cells.values() if '更新时间' in c['value']]
            updated = updates[0] if updates else ''
            # Preserve drawing bytes and anchor locations; never associate the sheet logo with a product.
            pictures = []
            sheet_rels = _relations(z, part)
            for drawing_part, kind in sheet_rels.values():
                if not kind.endswith('/drawing'): continue
                drawing_rels = _relations(z, drawing_part)
                for anchor in ET.fromstring(z.read(drawing_part)):
                    origin = anchor.find('d:from', NS)
                    if origin is None: continue
                    picture_row = int(origin.findtext('d:row', namespaces=NS)) + 1
                    picture_col = int(origin.findtext('d:col', namespaces=NS))
                    expected_col = sum((ord(c) - 64) * 26 ** i for i, c in enumerate(reversed(columns.get('产品示意图', 'ZZ')))) - 1
                    if picture_col != expected_col: continue
                    for blip in anchor.findall('.//a:blip', NS):
                        image_rel = blip.get(REL + 'embed')
                        if image_rel not in drawing_rels: continue
                        image_part = drawing_rels[image_rel][0]
                        suffix = Path(image_part).suffix.lower()
                        if suffix not in ['.png', '.jpg', '.jpeg', '.gif', '.webp']: continue
                        data = z.read(image_part)
                        filename = hashlib.sha256(data).hexdigest() + suffix
                        target = assets_dir / filename
                        if not target.exists(): target.write_bytes(data)
                        pictures.append({'row': picture_row, 'file': filename})
                        all_assets.add(filename)
            comments = {}
            for comment_part, kind in sheet_rels.values():
                if kind.endswith('/comments'):
                    for comment in ET.fromstring(z.read(comment_part)).findall('m:commentList/m:comment', NS):
                        comments[comment.get('ref')] = ''.join(t.text or '' for t in comment.findall('.//m:t', NS))
                elif kind.endswith('/threadedComment'):
                    for comment in ET.fromstring(z.read(comment_part)):
                        cell = comment.get('ref')
                        text = ''.join(node.text or '' for node in comment if node.tag.endswith('}text'))
                        if cell and text and text not in comments.get(cell, ''):
                            comments[cell] = '\n'.join(filter(None, [comments.get(cell, ''), text]))
            group_headers = rows.get(header_row - 1, {})
            timeline_columns = {}
            current_group = ''
            for col, cell in rows[header_row].items():
                if col in group_headers and col not in ['A', 'B']: current_group = group_headers[col]['value']
                if cell['value'] in ['开始时间', '结束时间', '交样时间', '确认时间', '立项时间']:
                    timeline_columns[col] = (current_group or '立项', cell['value'])
            for index, (start, code) in enumerate(anchors):
                end = anchors[index + 1][0] - 1 if index + 1 < len(anchors) else max(rows)
                block = {r: cells for r, cells in rows.items() if start <= r <= end}
                def first(label):
                    col = columns.get(label)
                    return block[start].get(col, {}).get('value', '') if col else ''
                issues = []
                history = []
                issue_col = columns.get('当前问题点及措施')
                for r, cells in block.items():
                    if issue_col and clean(cells.get(issue_col, {}).get('value', '')):
                        issues.append({'row': r, 'text': cells[issue_col]['value'], 'completion': cells.get(columns.get('完成状态'), {}).get('value', '')})
                    for label in ['履历', '分项']:
                        value = cells.get(columns.get(label), {}).get('value', '').strip()
                        if value and (label == '履历' or value not in ['计划时间', '实际时间', '延期天数']):
                            history.append({'row': r, 'label': label, 'text': value})
                timeline = []
                for r, cells in block.items():
                    item = cells.get(columns.get('分项'), {}).get('value', '')
                    for col, (group, label) in timeline_columns.items():
                        if col in cells:
                            value = cells[col]['value']
                            timeline.append({'cell': cells[col]['cell'], 'activity': group, 'label': label, 'row_kind': item or '原表节点', 'raw': value, 'date': '' if '延期' in item else excel_date(value, epoch_1904)})
                raw = {label: first(label) for label in columns if label not in ['开始时间', '结束时间']}
                display = {label: (excel_date(value, epoch_1904) or value) if label in ['计划完成时间', '实际完成时间'] else value for label, value in raw.items()}
                records.append({'code': code, 'sheet': sheet.get('name'), 'hidden': sheet.get('state') == 'hidden', 'row_start': start, 'row_end': end,
                                'updated': updated, 'fields': raw, 'display_fields': display, 'issues': issues, 'timeline': timeline, 'history': history,
                                'mapping_notes': [identity_notes[start]] if start in identity_notes else [],
                                'images': sorted({pic['file'] for pic in pictures if start <= pic['row'] <= end}),
                                'raw_rows': [{'row': r, 'cells': list(cells.values())} for r, cells in block.items()],
                                'comments': {cell: text for cell, text in comments.items() if start <= int(re.sub(r'\D', '', cell)) <= end}})
    grouped = defaultdict(list)
    for record in records: grouped[record['code'].casefold()].append(record)
    projects = []
    for group in grouped.values():
        # Main register is authoritative; retain every older/duplicate record as context.
        ordered = sorted(group, key=lambda r: (r['sheet'] == '项目进度总表', excel_date(r['updated'].split('：')[-1]), -r['row_start']), reverse=True)
        latest = ordered[0]
        f = latest['fields']
        code = latest['code']
        phase = f.get('当前阶段', '').strip()
        raw_status = f.get('状态', '').strip()
        closed = phase == '转量产' and f.get('完成状态') == 'Closed'
        status = status_for(raw_status, f.get('风险', ''), closed)
        if phase == '量产优化' and any(issue['completion'].casefold() == 'ongoing' for issue in latest['issues']):
            status = '正常'  # Product transfer is complete, but its explicit optimization work is ongoing.
        owner = clean(f.get('项目工程师', '')) or clean(f.get('结构工程师', '')) or clean(f.get('结构负责人', ''))
        due = excel_date(f.get('计划完成时间', ''), epoch_1904)
        category = category_for(f.get('类别', '').strip())
        priority = f.get('优先级', '')
        warnings = list(latest.get('mapping_notes', []))
        if category in ['一般', '紧急']:
            warnings.append(f'原表类别栏填有「{category}」，暂记为优先级，品类留空待核对。')
            priority = priority or category
            category = ''
        if f.get('项目号', '').strip().endswith('类') and latest.get('mapping_notes'):
            category = category_for(f['项目号'].strip())
        if owner in ['试产备料', '转量', '转量产', '结构设计', '投模', '模具制作']:
            warnings.append(f'原表负责人栏填有阶段词「{owner}」，负责人留空待核对。')
            owner = ''
        if len(group) > 1: warnings.append(f'同项目号有 {len(group)} 条来源记录，当前字段采用 {latest["sheet"]} 第 {latest["row_start"]} 行；其他来源已保留。')
        if not owner: warnings.append('原表未填写负责人。')
        if not due and status not in ['已完成', '已终止']: warnings.append('原表计划完成日期未确定。')
        if not phase and status not in ['已完成']: warnings.append('原表当前阶段未填写。')
        if raw_status == '进行中' and any('暂停' in f.get(key, '') for key in ['计划完成时间', '实际完成时间']): warnings.append('原表状态为进行中，但日期栏记有暂停；请确认当前状态。')
        tasks = []
        # Only the current record's issue rows become actionable tasks. Historical schedules remain evidence,
        # not fabricated overdue tasks; project completion dates are not copied to task deadlines.
        if status not in ['已完成', '已终止']:
            for issue in latest['issues']:
                task_id = identifier(f'{code}:issue:{issue["row"]}')
                tasks.append({'id': task_id, 'title': re.sub(r'\s+', ' ', issue['text']).strip()[:180], 'owner': owner, 'due_date': '',
                              'status': '已完成' if issue['completion'] == 'Closed' else '待办', 'source_row': issue['row']})
        projects.append({'id': identifier(code), 'name': code, 'product_id': '', 'stage': phase_for(phase, raw_status), 'status': status,
                         'owner': owner, 'due_date': due, 'progress': 0, 'description': '', 'category': category,
                         'priority': priority, 'tasks': tasks,
                         'source': {'file': source.name, 'sha256': sha, 'code': code, 'priority': priority, 'phase': phase, 'status': raw_status,
                                    'category': f.get('类别', ''), 'progress_known': False, 'records': ordered, 'warnings': warnings}})
    return {'file': source.name, 'sha256': sha, 'record_count': len(records), 'projects': projects,
            'assets': sorted(all_assets), 'sheet_counts': {name: sum(r['sheet'] == name for r in records) for name in dict.fromkeys(r['sheet'] for r in records)}}
