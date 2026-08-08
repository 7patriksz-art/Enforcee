import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LICENCE_PUBLIC_KEY } from '../src/lib/licence-key';

/**
 * guard/guard.mjs is a standalone, dependency-free runner — it cannot import from src/,
 * so it carries its own copy of the licence public key. Two copies of a key is a drift
 * waiting to happen, and this one already happened once: the key was rotated in
 * licence-key.ts and guard.mjs kept the dead one.
 *
 * That failure mode is the worst shape a bug can have here. The guard is the *paid*
 * artefact, so a stale key means every paying customer's guard rejects every licence the
 * server issues, while the CLI accepts them — silent, asymmetric, and discovered by a
 * customer rather than by us. Hence a test rather than a code comment.
 */
describe('licence public key', () => {
  it('is identical in guard.mjs and licence-key.ts', () => {
    const guard = readFileSync(new URL('../guard/guard.mjs', import.meta.url), 'utf8');
    const match = guard.match(/-----BEGIN PUBLIC KEY-----\n[\s\S]*?-----END PUBLIC KEY-----/);
    expect(match, 'guard.mjs has no public key block at all').not.toBeNull();
    expect(match![0].trim()).toBe(LICENCE_PUBLIC_KEY.trim());
  });
});
