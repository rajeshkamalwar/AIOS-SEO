"""Offline specification conformance checks; not runtime/SEO correctness tests."""
from pathlib import Path
import hashlib
import json
import re
from urllib.parse import unquote
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent

def read(path):
    return json.loads(path.read_text(), parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))

schemas = {read(p)['$id']: read(p) for p in ROOT.glob('*.schema.json')}
registry = Registry().with_resources((key, Resource.from_contents(value)) for key, value in schemas.items())
counts = {'schemas': 0, 'references': 0, 'examples': 0, 'negative_examples': 0, 'artifact_hashes': 0, 'source_excerpt_hashes': 0, 'catalog_records': 0, 'skill_manifests': 0, 'document_links': 0}

def refs(value):
    if isinstance(value, dict):
        if '$ref' in value:
            yield value['$ref']
        for child in value.values():
            yield from refs(child)
    elif isinstance(value, list):
        for child in value:
            yield from refs(child)

for sid, schema in schemas.items():
    Draft202012Validator.check_schema(schema)
    counts['schemas'] += 1
    for target in refs(schema):
        registry.resolver(sid).lookup(target)
        counts['references'] += 1

for case in read(ROOT/'examples/index.json')['examples']:
    validator = Draft202012Validator({'$ref': case['schema']}, registry=registry, format_checker=FormatChecker())
    errors = list(validator.iter_errors(read(ROOT/case['path'])))
    assert bool(errors) != case['valid'], (case['path'], [e.message for e in errors])
    counts['examples' if case['valid'] else 'negative_examples'] += 1

catalog = read(ROOT/'storage.catalog.json')['records']
domain = read(ROOT/'domain.schema.json')['$defs']
assert set(catalog) == set(domain)
for name, item in catalog.items():
    definition = domain[name]
    assert item['required_fields'] == definition['required'], name
    assert set(item['optional_fields']) == set(definition['properties']) - set(definition['required']), name
    for index in item['unique'] + item['indexes'] + [item['primary_key']]:
        assert set(index) <= set(definition['properties']), (name, index)
    assert ('tenant_id' in definition['properties']) == (item['scope'] != 'global'), name
    counts['catalog_records'] += 1
for name in ['Evidence', 'Observation', 'EvidenceBundle', 'SkillRelease', 'Evaluation', 'AuditEvent']:
    assert not catalog[name]['mutable'], name

for item in read(ROOT/'fixtures/artifacts.json')['artifacts']:
    data = (ROOT/'fixtures'/item['path']).read_bytes()
    assert len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256'], item['path']
    counts['artifact_hashes'] += 1
for item in read(ROOT/'sources/manifest.json')['pins']:
    assert hashlib.sha256((ROOT/'sources'/f"{item['source_id']}.txt").read_bytes()).hexdigest() == item['excerpt_sha256']
    counts['source_excerpt_hashes'] += 1

cases = {x['id'] for x in read(ROOT/'fixtures/scenarios.json')['scenarios']}
capabilities = set(re.findall(r'\| (CAP-[A-Z]+-\d\d) ', (REPO/'docs/14-CAPABILITY-TAXONOMY.md').read_text()))
for path in (ROOT/'examples').glob('skill-*.json'):
    skill = read(path)
    assert set(skill['fixtures'] + skill['negative_fixtures']) <= cases, path
    assert set(skill['capability_dependencies']) <= capabilities, path
    assert skill['status'] == 'draft' and skill['external_authority'] == 'read_only'
    assert skill['output_schema'] in schemas
    allowed = {x['tool_id'] for x in skill['tool_permissions']}
    assert all(s['tool_id'] is None or s['tool_id'] in allowed for s in skill['procedure'])
    counts['skill_manifests'] += 1

for path in [REPO/'README.md', *sorted((REPO/'docs').rglob('*.md')), ROOT/'README.md']:
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if re.match(r'^[a-zA-Z]+:', target) or target.startswith('#'):
            continue
        file_part = unquote(target.split('#')[0])
        assert (path.parent/file_part).exists(), (path, target)
        counts['document_links'] += 1
report = {'status': 'passed', 'scope': 'specification_conformance_only', 'counts': counts,
          'not_tested': ['runtime_security', 'database_constraints', 'network_sandbox', 'model_quality', 'SEO_truth', 'production_recovery']}
(ROOT/'validation-report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
