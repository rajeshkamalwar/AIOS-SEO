# Executable contract package

Read schemas as JSON Schema2020-12 with an offline registry keyed by $id. Never fetch schemas over the network. Schema syntax/shape, cross-record semantics, authorization, source truth and runtime behavior are distinct validation levels.

Read all *.schema.json, storage.catalog.json, discovery-policy.json, quality-gates.json, sources/manifest.json and retained excerpts, examples/index.json and every listed example, then fixtures/artifacts.json and fixtures/scenarios.json with their actual artifacts. Draft skill manifests are deliberately stale and cannot execute; timestamps identify original source capture, not approval. Source excerpts are minimal citation anchors, not complete released rule bodies.

Fixtures use reserved example URLs and synthetic identities. Schema fixtures can be valid in shape yet unsuitable for a specific tool (such as an HTML artifact passed to a sitemap parser); semantic rejection belongs to the relevant tool tests. No application or model test result is claimed by an expected JSON record.

Validation: `python3 -m venv /tmp/aios-spec-check` then `/tmp/aios-spec-check/bin/pip install 'jsonschema>=4.23,<5'` and `/tmp/aios-spec-check/bin/python spec/validate.py`. The script validates local schemas, references, catalog shape, examples, artifact/source excerpt hashes, skill fixture references and documentation links. It is specification tooling, not a Brain runtime.
