"""Export the approved native project records to a GitHub Pages snapshot.

Reads SQLite in read-only mode. Never publishes the workbook, database,
import provenance, sessions or application configuration.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sqlite3

FIELDS = {
    'projects': 'id name product_id stage status owner due_date progress description',
    'tasks': 'id project_id title owner due_date status',
    'project_profiles': 'project_id priority phase structural_owner target key_plan risk_note actual_completed_on progress_known',
    'task_content': 'task_id description',
    'project_milestones': 'id project_id name owner planned_start planned_end actual_start actual_end status recorded_text note sort_order',
    'project_updates': 'id project_id content occurred_on author kind created_at',
    'project_images': 'id project_id filename caption sort_order',
    'categories': 'id scope name active sort_order',
    'custom_fields': 'id scope key label kind options required active sort_order',
    'entity_meta': 'scope entity_id category_id values updated_at',
    'knowledge_documents': 'id project_id template_id stage title owner status content updated_at',
    'products': 'id name sku category status owner description',
}


def read_snapshot(database: Path):
    connection = sqlite3.connect(database.resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute('BEGIN')
        tables = {table: [dict(row) for row in connection.execute('SELECT ' + ', '.join('"' + col + '"' for col in columns.split()) + ' FROM "' + table + '" ORDER BY rowid')] for table, columns in FIELDS.items()}
    finally:
        connection.close()
    projects = tables['projects']
    ids = {row['id'] for row in projects}
    profiles = {row['project_id']: {k: bool(v) if k == 'progress_known' else v for k, v in row.items() if k != 'project_id'} for row in tables['project_profiles']}
    if set(profiles) != ids:
        raise ValueError('Native project profiles are incomplete; finish native migration first')
    for project in projects:
        project['profile'] = profiles[project['id']]
    contents = {row['task_id']: row['description'] for row in tables['task_content']}
    tasks = [dict(row, description=contents.get(row['id'], '')) for row in tables['tasks'] if row['project_id'] in ids]
    details = {project['id']: {'profile': profiles[project['id']], 'milestones': [], 'updates': [], 'images': []} for project in projects}
    for resource in ['milestones', 'updates', 'images']:
        for row in tables['project_' + resource]:
            if row['project_id'] in ids:
                details[row['project_id']][resource].append(row)
    for detail in details.values():
        for resource in ['milestones', 'images']:
            detail[resource].sort(key=lambda row: (row['sort_order'], row['id']))
        detail['updates'].sort(key=lambda row: (row['created_at'], row['id']), reverse=True)
    categories = tables['categories']
    for row in categories:
        row['active'] = bool(row['active'])
    categories.sort(key=lambda row: (row['scope'], row['sort_order'], row['name']))
    custom_fields = [row for row in tables['custom_fields'] if row['scope'] == 'project']
    for row in custom_fields:
        row['options'] = json.loads(row['options'])
        row['active'], row['required'] = bool(row['active']), bool(row['required'])
    meta = [row for row in tables['entity_meta'] if row['scope'] == 'project' and row['entity_id'] in ids]
    for row in meta:
        row['values'] = json.loads(row['values'])
    linked = {row['product_id'] for row in projects if row['product_id']}
    workspace = {
        'projects': projects, 'tasks': tasks, 'project_details': details,
        'products': [row for row in tables['products'] if row['id'] in linked],
        'sales': [], 'signals': [], 'seats': [], 'jobs': [], 'reports': [], 'activity': [],
        'categories': categories, 'custom_fields': custom_fields, 'entity_meta': meta,
        'knowledge_documents': [row for row in tables['knowledge_documents'] if not row['project_id'] or row['project_id'] in ids],
    }
    counts = {'projects': len(projects), 'tasks': len(tasks), **{resource: sum(len(d[resource]) for d in details.values()) for resource in ['milestones', 'updates', 'images']}}
    filenames = sorted({row['filename'] for detail in details.values() for row in detail['images']})
    counts['image_files'] = len(filenames)
    return {'schema_version': 1, 'workspace': workspace, 'counts': counts}, filenames


def export_snapshot(database: Path, assets: Path, output: Path, public_assets: Path):
    snapshot, filenames = read_snapshot(database)
    assets, public_assets, output = assets.resolve(), public_assets.resolve(), output.resolve()
    if public_assets == assets or assets.is_relative_to(public_assets) or public_assets.is_relative_to(assets):
        raise ValueError('Export image directory must be separate from original assets')
    images = {}
    for filename in filenames:
        if not re.fullmatch(r'[0-9a-f]{64}\.(png|jpg|jpeg|webp)', filename):
            raise ValueError('Invalid image filename')
        source = (assets / filename).resolve()
        if not source.is_relative_to(assets):
            raise ValueError('Invalid image path')
        content = source.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        if digest != filename.split('.')[0]:
            raise ValueError('Original image hash mismatch')
        images[filename] = content
    snapshot['image_hashes'] = {name: hashlib.sha256(content).hexdigest() for name, content in images.items()}
    canonical = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    snapshot['revision'] = hashlib.sha256(canonical.encode('utf-8')).hexdigest()[:20]
    # Only remove previously exported files, never arbitrary directory contents.
    previous = json.loads(output.read_text(encoding='utf-8')) if output.is_file() else {}
    public_assets.mkdir(parents=True, exist_ok=True)
    for filename, content in images.items():
        target = (public_assets / filename).resolve()
        if not target.is_relative_to(public_assets):
            raise ValueError('Invalid export image path')
        target.write_bytes(content)
    for filename in set(previous.get('image_hashes', {})) - set(images):
        target = (public_assets / filename).resolve()
        if re.fullmatch(r'[0-9a-f]{64}\.(png|jpg|jpeg|webp)', filename) and target.is_relative_to(public_assets) and target.is_file():
            target.unlink()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    return snapshot


def main():
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=root / 'backend/project-workspace.db')
    parser.add_argument('--assets', type=Path, default=root / 'backend/import-assets')
    parser.add_argument('--output', type=Path, default=root / 'frontend/src/data/published-projects.json')
    parser.add_argument('--public-assets', type=Path, default=root / 'frontend/public/project-assets')
    args = parser.parse_args()
    snapshot = export_snapshot(args.database, args.assets, args.output, args.public_assets)
    print('EXPORT: ' + '; '.join(f'{key}={value}' for key, value in snapshot['counts'].items()) + '; revision=' + snapshot['revision'] + '; database=read-only; exit=0')


if __name__ == '__main__':
    main()
