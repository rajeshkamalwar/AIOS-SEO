import { readFileSync } from 'node:fs';
import { manifestHash, uuid } from '../contracts/index.js';
export type Effect = 'allow' | 'degrade' | 'reject_outputs' | 'quarantine_run';
export type Result = 'pass' | 'fail' | 'unknown' | 'not_applicable';
export interface Snapshot { complete: boolean; outputs: { id: string; depends_on: string[] }[] }
interface Rule { id: string; signal: string; threshold: number; required: boolean; scope: 'outputs'|'run'; failure_effect: Effect; unknown_effect: Effect }
const artifact = JSON.parse(readFileSync(new URL('../../spec/quality-gates.json', import.meta.url), 'utf8'));
export const ruleVersion: string = artifact.version;
export const rules: readonly Rule[] = Object.freeze(artifact.rules.map((r: Rule) => Object.freeze(r)));
/** Snapshot must be reconstructed from authorized persisted lineage by the independent evaluator. */
export function evaluate(checkId: string, signal: number | null, direct: string[], snapshot: Snapshot) {
  const rule = rules.find(r => r.id === checkId);
  if (!rule) throw new Error('unknown_check');
  let complete = snapshot.complete;
  const nodes = new Map(snapshot.outputs.map(x => [x.id, x.depends_on]));
  if (nodes.size !== snapshot.outputs.length || nodes.size > 5000) complete = false;
  const visited = new Set<string>(), active = new Set<string>();
  function visit(id: string): void {
    uuid(id);
    if (active.has(id) || !nodes.has(id)) { complete = false; return; }
    if (visited.has(id)) return;
    active.add(id);
    for (const dep of nodes.get(id)!) visit(dep);
    active.delete(id); visited.add(id);
  }
  for (const id of nodes.keys()) visit(id);
  const affected = new Set(direct);
  for (const id of direct) { uuid(id); if (!nodes.has(id)) complete = false; }
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, deps] of nodes) if (!affected.has(id) && deps.some(d => affected.has(d))) { affected.add(id); changed = true; }
  }
  let result: Result = signal === null ? 'unknown' : Number.isSafeInteger(signal) && signal >= 0 && signal <= rule.threshold ? 'pass' : 'fail';
  if (!rule.required && (signal === null || signal === 0)) result = 'not_applicable';
  // Disabled future checks cannot become "healthy" or conceal fabricated activity.
  let effect: Effect = result === 'pass' || result === 'not_applicable' ? 'allow' : result === 'unknown' ? rule.unknown_effect : rule.failure_effect;
  if (rule.scope === 'outputs' && effect !== 'allow' && direct.length === 0) complete = false;
  if (!complete) effect = 'quarantine_run';
  return { check_id: checkId, check_version: ruleVersion, result, effect,
    scope: effect === 'quarantine_run' ? 'run' as const : rule.scope,
    scope_complete: complete, dependency_snapshot_hash: manifestHash(snapshot),
    direct_output_ids: [...new Set(direct)].sort(), affected_output_ids: [...affected].sort() };
}
