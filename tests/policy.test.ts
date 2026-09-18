import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluate, rules } from '../packages/policy/index.js';
const a=randomUUID(), b=randomUUID(), c=randomUUID();
const graph={complete:true,outputs:[{id:a,depends_on:[]},{id:b,depends_on:[a]},{id:c,depends_on:[]}]};
const fixtures=JSON.parse(readFileSync('spec/fixtures/audit-transitions.json','utf8'));
for(const f of fixtures.cases) test(`${f.check_id} ${f.result} complete=${f.scope_complete}`,()=>{
 const rule=rules.find(r=>r.id===f.check_id)!;
 const signal=f.result==='unknown'?null:f.result==='pass'?0:rule.threshold+1;
 const actual=evaluate(f.check_id,signal,[a],{...graph,complete:f.scope_complete});
 const expected=f.expected_effect;
 assert.equal(actual.effect,expected);
 if(!rule.required && f.result!=='fail' && f.scope_complete) assert.equal(actual.result,'not_applicable');
});
test('rejection propagates to dependents but not independent outputs',()=>{
 const r=evaluate('A08',1,[a],graph);
 assert.equal(r.effect,'reject_outputs'); assert.deepEqual(r.affected_output_ids,[a,b].sort());
 assert.ok(!r.affected_output_ids.includes(c));
});
test('missing edges, cycles, duplicate nodes and unlocated impact quarantine even a passing signal',()=>{
 for(const outputs of [[{id:a,depends_on:[b]}],[{id:a,depends_on:[b]},{id:b,depends_on:[a]}],[{id:a,depends_on:[]},{id:a,depends_on:[]}]])
   assert.equal(evaluate('A02',0,[a],{complete:true,outputs}).effect,'quarantine_run');
 assert.equal(evaluate('A02',1,[],graph).effect,'quarantine_run');
});
