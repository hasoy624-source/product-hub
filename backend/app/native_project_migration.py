"""One-time conversion from the import ledger into editable business tables."""
import argparse
from pathlib import Path
from sqlalchemy import select
from .database import database, initialize
from .excel_reader import identifier, excel_date
from .models import ProjectSource, ProjectProfile, ProjectMilestone, ProjectUpdate, ProjectImage, Task, TaskContent, CustomField, EntityMeta
from .services import stamp


def migrate_native_projects(session):
    migrated = 0
    for source in session.scalars(select(ProjectSource)):
        if session.get(ProjectProfile, source.project_id):
            continue  # Never regenerate or overwrite edited business records.
        data = source.payload
        records = data.get('records', [])
        if not records:
            continue
        current = records[0]
        fields = current.get('display_fields') or current['fields']
        structural = fields.get('结构工程师', '') or fields.get('结构负责人', '')
        if structural.strip() in ['试产备料', '转量', '转量产', '结构设计', '投模', '模具制作']:
            structural = ''
        profile = ProjectProfile(project_id=source.project_id, priority=data.get('priority', ''), phase=data.get('phase', ''),
            structural_owner=structural, target=fields.get('目标任务（总经理填写）', ''),
            key_plan=fields.get('立项关键节点', '') or fields.get('实际关键进度节点', ''),
            risk_note=fields.get('风险', ''), actual_completed_on=excel_date(fields.get('实际完成时间', '')), progress_known=source.progress_known)
        session.add(profile)
        nodes = {}
        for entry in current.get('timeline', []):
            activity = entry['activity']
            node = nodes.setdefault(activity, {'name': activity, 'recorded_text': [], 'note': []})
            kind, label, value = entry['row_kind'], entry['label'], entry.get('date') or entry['raw']
            if not value.strip():
                continue
            if kind in ['计划时间', '实际时间'] and entry.get('date'):
                key = ('planned' if kind == '计划时间' else 'actual') + ('_start' if label in ['开始时间', '立项时间'] else '_end')
                if key not in node:
                    node[key] = entry['date']
                elif node[key] != entry['date']:
                    node['recorded_text'].append(f'{kind} · {label}：{value}')
            elif kind == '延期天数':
                node['note'].append(f'延期天数 · {label}：{value}')
            else:
                # Unlabelled dates are records, NOT actual completion dates.
                node['recorded_text'].append(f'{label}：{value}' if kind == '原表节点' else f'{kind} · {label}：{value}')
        for order, node in enumerate(nodes.values()):
            for key in ['recorded_text', 'note']:
                node[key] = '\n'.join(dict.fromkeys(node[key]))
            # Inconsistent historical ranges remain editable text, not invalid typed dates.
            for prefix in ['planned', 'actual']:
                start, end = node.get(prefix + '_start'), node.get(prefix + '_end')
                if start and end and start > end:
                    node['recorded_text'] += f'\n{prefix}：{start} → {end}（日期待确认）'
                    node.pop(prefix + '_start'); node.pop(prefix + '_end')
            session.add(ProjectMilestone(id=identifier(source.project_id + ':node:' + node['name']), project_id=source.project_id, sort_order=order * 10, status='已完成' if node.get('actual_end') else '进行中' if node.get('actual_start') else '待确认', **node))
        # Full task text lives in a native task detail, including line breaks.
        for issue in current.get('issues', []):
            task_id = identifier(f'{data["code"]}:issue:{issue["row"]}')
            if session.get(Task, task_id) and not session.get(TaskContent, task_id):
                session.add(TaskContent(task_id=task_id, description=issue['text']))
        seen, images = set(), set()
        def update(content, kind):
            if not content.strip() or (kind, content) in seen:
                return
            seen.add((kind, content))
            session.add(ProjectUpdate(id=identifier(source.project_id + ':update:' + kind + ':' + content), project_id=source.project_id,
                content=content, kind=kind, occurred_on='', author='', created_at=stamp()))
        for index, record in enumerate(records):
            f = record.get('display_fields') or record['fields']
            for item in record.get('history', []):
                if item['text'].strip() != '原表节点':
                    update(item['text'], '历史进度')
            for text in record.get('comments', {}).values():
                update(text, '历史进度')
            for issue in record.get('issues', []):
                task_id = identifier(f'{data["code"]}:issue:{issue["row"]}')
                if index > 0 or not session.get(Task, task_id):
                    update(issue['text'] + (f'\n完成状态：{issue["completion"]}' if issue.get('completion') else ''), '历史问题')
            if index > 0:
                note_keys = ['目标任务（总经理填写）', '立项关键节点', '实际关键进度节点', '风险', '当前阶段', '状态', '结构工程师', '结构负责人', '项目工程师', '计划完成时间', '实际完成时间', '完成状态', '项目奖']
                update('\n'.join(f'{key}：{f[key]}' for key in note_keys if f.get(key, '').strip()), '历史进度')
                update('\n'.join(f'{entry["activity"]} · {entry["row_kind"] if entry["row_kind"] != "原表节点" else "节点记录"} · {entry["label"]}：{entry.get("date") or entry["raw"]}' for entry in record.get('timeline', []) if entry['raw'].strip()), '历史进度')
            else:
                for key in ['项目奖', '完成状态']:
                    if f.get(key): update(f'{key}：{f[key]}', '历史进度')
                for key in ['计划完成时间', '实际完成时间']:
                    if f.get(key) and not excel_date(f[key]): update(f'{key}：{f[key]}', '待确认')
            for filename in record.get('images', []):
                if filename not in images:
                    images.add(filename)
                    session.add(ProjectImage(id=identifier(source.project_id + ':image:' + filename), project_id=source.project_id, filename=filename, caption='产品示意图', sort_order=len(images) * 10))
        migrated += 1
    # Priority is now a first-class field, not an import-specific custom field.
    field = session.scalar(select(CustomField).where(CustomField.scope == 'project', CustomField.key == 'excel_priority'))
    if field:
        field.active = False
    for meta in session.scalars(select(EntityMeta).where(EntityMeta.scope == 'project')):
        if 'excel_priority' in meta.values:
            meta.values = {key: value for key, value in meta.values.items() if key != 'excel_priority'}
    return migrated


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, required=True)
    args = parser.parse_args()
    engine, factory = database('sqlite:///' + args.database.resolve().as_posix())
    initialize(engine)
    with factory() as session, session.begin():
        count = migrate_native_projects(session)
    engine.dispose()
    print(f'NATIVE_MIGRATION: projects={count}; exit=0')


if __name__ == '__main__':
    main()
