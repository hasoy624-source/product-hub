"""Local, transactional project-register import. Does not overwrite existing projects."""
import argparse
from collections import Counter
import json
from pathlib import Path
from sqlalchemy import select
from .database import database, initialize
from .excel_reader import identifier, read_register
from .models import Category, CustomField, EntityMeta, Project, ProjectSchedule, ProjectSource, Task
from .schemas import ProjectIn, TaskIn
from .services import log, stamp
from .native_project_migration import migrate_native_projects


def import_register(factory, package):
    prepared = []
    for item in package['projects']:
        values = ProjectIn.model_validate({key: item[key] for key in ProjectIn.model_fields if key in item}).model_dump()
        values.pop('profile', None)
        tasks = [(task['id'], TaskIn.model_validate({key: task.get(key, item['id'] if key == 'project_id' else '') for key in TaskIn.model_fields}).model_dump()) for task in item['tasks']]
        prepared.append((item, values, tasks))
    added = skipped = task_count = 0
    with factory() as session, session.begin():
        categories = {row.name: row.id for row in session.scalars(select(Category).where(Category.scope == 'project'))}
        field = session.scalar(select(CustomField).where(CustomField.scope == 'project', CustomField.key == 'excel_priority'))
        if not field:
            session.add(CustomField(id=identifier('field:excel_priority'), scope='project', key='excel_priority', label='优先级', kind='text', options=[], required=False, active=True, sort_order=10))
        for item, values, tasks in prepared:
            existing = session.get(Project, item['id'])
            if existing:
                source = session.get(ProjectSource, item['id'])
                if source and source.file_sha256 == package['sha256']:
                    # Refresh read-only provenance, never user-edited project/task values.
                    source.payload = item['source']
                    skipped += 1
                    continue
                raise ValueError(f"项目 {item['name']} 已存在且来源不同；本次导入未覆盖任何记录。")
            start_date=values.pop('start_date','')
            session.add(Project(id=item['id'], **values))
            session.flush()
            if start_date:
                session.add(ProjectSchedule(project_id=item['id'],start_date=start_date))
            session.add(ProjectSource(project_id=item['id'], file_sha256=package['sha256'], progress_known=False, payload=item['source']))
            category = item['category']
            if category and category not in categories:
                category_id = identifier('category:' + category)
                session.add(Category(id=category_id, scope='project', name=category, active=True, sort_order=10 + len(categories) * 10))
                categories[category] = category_id
            session.add(EntityMeta(scope='project', entity_id=item['id'], category_id=categories.get(category, ''), values={'excel_priority': item['priority']} if item['priority'] else {}, updated_at=stamp()))
            for task_id, task in tasks:
                task.pop('description', None)
                session.add(Task(id=task_id, **task))
                task_count += 1
            added += 1
        if added:
            log(session, f"导入 Excel 项目总表：{added} 个项目、{task_count} 条问题任务；{package['record_count']} 条来源记录。")
        session.flush()
        migrate_native_projects(session)
    return {'projects_added': added, 'projects_skipped': skipped, 'tasks_added': task_count,
            'source_records': package['record_count'], 'images': len(package['assets']), 'sha256': package['sha256'],
            'sheets': package['sheet_counts'], 'statuses': dict(Counter(p['status'] for p in package['projects'])),
            'stages': dict(Counter(p['stage'] for p in package['projects'])),
            'duplicate_projects': sum(len(p['source']['records']) > 1 for p in package['projects']),
            'missing_owner': sum(not p['owner'] for p in package['projects']),
            'missing_due_date': sum(not p['due_date'] for p in package['projects']), 'progress_not_recorded': len(package['projects'])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--database', type=Path, default=Path(__file__).resolve().parents[1] / 'project-workspace.db')
    parser.add_argument('--assets', type=Path, default=Path(__file__).resolve().parents[1] / 'import-assets')
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    package = read_register(args.source, args.assets)
    engine, factory = database('sqlite:///' + args.database.resolve().as_posix())
    try:
        initialize(engine)
        result = import_register(factory, package)
    finally:
        engine.dispose()
    result['file'] = args.source.name
    result['database'] = str(args.database.resolve())
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.receipt:
        args.receipt.write_text(output, encoding='utf-8')
    print(output)


if __name__ == '__main__':
    main()
