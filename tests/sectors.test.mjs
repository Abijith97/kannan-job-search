import test from 'node:test';
import assert from 'node:assert/strict';
import { sectorOf, matchesSector } from '../web/sectors.mjs';

test('industry filter uses verified classification, preserves original education roles and leaves unknowns unclassified', () => {
  assert.equal(sectorOf({ sourceId: 'idp' }), 'education');
  assert.equal(sectorOf({ company: 'Athena Education' }), 'education');
  assert.equal(sectorOf({ title: 'Sales Consultant', company: 'Unresearched employer' }), 'unknown');
  for (const sector of ['technology', 'financial', 'media', 'industrial', 'consumer', 'healthcare', 'hospitality', 'other']) assert.ok(matchesSector({ sector }, 'other'));
  for (const sector of ['education', 'consulting', 'unknown']) assert.equal(matchesSector({ sector }, 'other'), false);
  assert.ok(matchesSector({ sector: 'education' }, 'education-consulting'));
  assert.ok(matchesSector({ sector: 'unknown' }, 'all'));
});
