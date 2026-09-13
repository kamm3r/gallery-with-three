import assert from 'node:assert/strict';
import test from 'node:test';
import { canEnterPortal, getGravityScale } from '../gameplay/playerRules.ts';

test('walking into a portal does not enter it', () => {
  assert.equal(
    canEnterPortal({ distance: 0.8, grounded: true, feetHeight: 0 }),
    false
  );
});

test('jumping into a portal enters it', () => {
  assert.equal(
    canEnterPortal({ distance: 0.8, grounded: false, feetHeight: 0.3 }),
    true
  );
});

test('portal entry still requires touching the artwork', () => {
  assert.equal(
    canEnterPortal({ distance: 1.4, grounded: false, feetHeight: 0.3 }),
    false
  );
});

test('releasing jump increases gravity while rising', () => {
  assert.ok(getGravityScale(4, false) > getGravityScale(4, true));
  assert.equal(getGravityScale(-1, true), 1);
});
