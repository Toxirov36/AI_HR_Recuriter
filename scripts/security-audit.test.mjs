import { test } from 'node:test';
import assert from 'node:assert/strict';
import { temporaryBuildException } from './security-audit.mjs';
const now = Date.parse('2026-10-12T00:00:00Z');
const report = { vulnerabilities: {
  braces: {severity:'high',nodes:['node_modules/braces'],via:[{name:'braces',severity:'high',url:'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm'}]},
  tailwind: {severity:'high',nodes:['node_modules/tailwind'],via:['braces']},
}};
const lock = {packages:{'node_modules/braces':{dev:true},'node_modules/tailwind':{dev:true}}};
test('only the known development advisory and its development dependants qualify',()=>{
  assert.equal(temporaryBuildException('tailwind',report,lock,now),true);
  assert.equal(temporaryBuildException('tailwind',report,{packages:{...lock.packages,'node_modules/braces':{dev:false}}},now),false);
  const changed = structuredClone(report);changed.vulnerabilities.braces.via[0].url='https://example.com/another-advisory';
  assert.equal(temporaryBuildException('tailwind',changed,lock,now),false);
  changed.vulnerabilities.braces.via[0].url=report.vulnerabilities.braces.via[0].url;
  changed.vulnerabilities.braces.via[0].severity='critical';
  assert.equal(temporaryBuildException('tailwind',changed,lock,now),false);
  const critical=structuredClone(report);critical.vulnerabilities.tailwind.severity='critical';
  assert.equal(temporaryBuildException('tailwind',critical,lock,now),false);
});
test('expired exceptions and unresolved chains fail closed',()=>{
  assert.equal(temporaryBuildException('tailwind',report,lock,Date.parse('2026-11-11T00:00:00Z')),false);
  const changed=structuredClone(report);changed.vulnerabilities.braces.via=['tailwind'];
  assert.equal(temporaryBuildException('tailwind',changed,lock,now),false);
});
