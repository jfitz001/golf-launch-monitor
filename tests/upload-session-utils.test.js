const assert = require('assert');
const { mergeShotsForUpload } = require('../upload-session-utils');

function shot(id, club = '8 Iron') {
  return { id: String(id), 'Club Name': club, 'Carry Distance': String(150 + id) };
}

function run() {
  // append: keep existing + add new
  {
    const existing = [shot(1), shot(2)];
    const incoming = [shot(3)];
    const { mergedShots } = mergeShotsForUpload(existing, incoming, 'append');
    assert.strictEqual(mergedShots.length, 3, 'append should keep old and add new');
    assert.deepStrictEqual(mergedShots.map((s) => s.id), ['1', '2', '3']);
  }

  // replace: only new session records
  {
    const existing = [shot(1), shot(2)];
    const incoming = [shot(7), shot(8)];
    const { mergedShots } = mergeShotsForUpload(existing, incoming, 'replace');
    assert.strictEqual(mergedShots.length, 2, 'replace should discard old working data');
    assert.deepStrictEqual(mergedShots.map((s) => s.id), ['7', '8']);
  }

  // replace + duplicates inside new upload: dedupe still applied
  {
    const existing = [shot(1)];
    const incoming = [shot(9), shot(9), shot(10)];
    const { mergedShots, dedupedCount } = mergeShotsForUpload(existing, incoming, 'replace');
    assert.strictEqual(mergedShots.length, 2);
    assert.strictEqual(dedupedCount, 1);
    assert.deepStrictEqual(mergedShots.map((s) => s.id), ['9', '10']);
  }

  // append + duplicate against existing: dedupe should remove repeated shot
  {
    const existing = [shot(1), shot(2)];
    const incoming = [shot(2), shot(11)];
    const { mergedShots, dedupedCount } = mergeShotsForUpload(existing, incoming, 'append');
    assert.strictEqual(mergedShots.length, 3);
    assert.strictEqual(dedupedCount, 1);
    assert.deepStrictEqual(mergedShots.map((s) => s.id), ['1', '2', '11']);
  }

  console.log('upload-session-utils tests: PASS');
}

run();
