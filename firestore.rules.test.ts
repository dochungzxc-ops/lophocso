import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rulesSource = fs.readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');

test('firestore.rules enforces global default-deny and verified identity checks', () => {
  assert.match(rulesSource, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  assert.match(rulesSource, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesSource, /function isValidId\(id\)/);
  assert.match(rulesSource, /isValidStudentPublic/);
  assert.match(rulesSource, /isValidStudentPrivate/);
  assert.match(rulesSource, /isValidAttendance/);
  assert.match(rulesSource, /isValidConductLog/);
  assert.match(rulesSource, /isValidPointRule/);
  assert.match(rulesSource, /isValidDutySchedule/);
  assert.match(rulesSource, /isValidClassPost/);
  assert.match(rulesSource, /isValidAppNotification/);
});

test('firestore.rules forbids get() or exists() inside allow list rules', () => {
  const listLines = rulesSource
    .split('\n')
    .filter((line) => line.includes('allow list:'));
  assert.ok(listLines.length >= 6);
  for (const line of listLines) {
    assert.equal(line.includes('isAdmin()'), false, `Unexpected isAdmin() call in list rule: ${line}`);
    assert.equal(line.includes('hasRole('), false, `Unexpected hasRole() call in list rule: ${line}`);
  }
});
