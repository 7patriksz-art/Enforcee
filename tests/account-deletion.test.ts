import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderNotify } from '../src/lib/email/notify-templates';

/**
 * Deleting an account must never leave a card being charged.
 *
 * The first version of this endpoint deleted the account and left the Stripe subscription
 * running, disclosing it in the UI and in the email. Patrik's response was that it "sounds
 * like a scam", and he is right: a product that destroys your login while continuing to
 * take money is indistinguishable from one, however clearly it is disclosed. Disclosure is
 * not a defence when the outcome is "you cannot log in and you are still paying".
 *
 * It is also the most chargeback-prone shape available. The cardholder cannot log in to
 * cancel, cannot reach an invoice, and has a perfect story for their bank — a dispute lost
 * on the merits, plus a fee.
 *
 * THE PROPERTY THIS FILE DEFENDS IS ORDERING. Read the Stripe ids, cancel, and only then
 * delete. Every step of that sequence is load-bearing and none of it is visible from
 * reading the function top to bottom in a hurry, which is exactly when it will be
 * "simplified" by a later session.
 */

const ROOT = resolve(__dirname, '..');
const route = readFileSync(join(ROOT, 'src/app/api/account/delete/route.ts'), 'utf8');
const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

describe('deleting an account cancels the subscription', () => {
  it('cancels in Stripe at all', () => {
    expect(code, 'deletion no longer touches Stripe').toContain('subscriptions.cancel');
  });

  it('reads the Stripe ids BEFORE deleting the rows that hold them', () => {
    // After the rows are gone there is no record of which customer this was, and the
    // subscription becomes unreachable forever — a live subscription nobody can find.
    const read = code.indexOf("select('stripe_subscription_id");
    const cancel = code.indexOf('subscriptions.cancel');
    const del = code.indexOf('.delete()');
    expect(read, 'the ids are never read').toBeGreaterThan(-1);
    expect(read, 'ids must be read before the delete').toBeLessThan(del);
    expect(cancel, 'cancellation must happen before the delete').toBeLessThan(del);
  });

  it('aborts the whole deletion when cancellation fails', () => {
    // Refusing to delete is a bad outcome. Deleting while the card is still live is a much
    // worse one, so the failure has to fall on the side that cannot take someone's money.
    const cancelBlock = code.slice(code.indexOf('subscriptions.cancel'), code.indexOf('.delete()'));
    expect(cancelBlock, 'a failed cancel must return, not continue').toMatch(/return NextResponse\.json/);
    expect(cancelBlock).toMatch(/nothing was deleted/i);
  });

  it('treats an already-cancelled subscription as success', () => {
    // The goal is "no further charge". A subscription Stripe no longer knows about
    // satisfies it, and failing there would block deletion forever on a stale row.
    expect(code).toContain('resource_missing');
  });

  it('cancels outright rather than at period end', () => {
    // `cancel_at_period_end` keeps billing rights alive against an account that no longer
    // exists — the user cannot use a paid feature because there is nothing to use it with,
    // so charging for the remainder is precisely the part that gets disputed.
    expect(code, 'period-end cancellation leaves a live billing right').not.toContain(
      'cancel_at_period_end'
    );
  });

  it('never tells the user their subscription survives', () => {
    // The exact copy that shipped, and the reason this file exists.
    // Comments stripped. DataActions documents the old copy by quoting it, and a check
    // that forbids describing a fixed bug forbids recording why it was fixed — the third
    // time on this project a control has flagged its own documentation.
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
    const ui = strip(readFileSync(join(ROOT, 'src/app/account/DataActions.tsx'), 'utf8'));
    // Rendered from the module rather than read from disk — the file no longer exists,
    // because a runtime file read is never bundled into a Vercel function and the mail
    // silently stopped sending.
    const email = renderNotify('account-deleted');
    for (const [name, text] of [['UI', ui], ['deletion email', email]] as const) {
      expect(text, `${name} still says deletion leaves billing running`).not.toMatch(
        /does not (cancel|stop)[^.]*(plan|subscription|charg)/i
      );
    }
  });

  it('promises the cancellation before the button is pressed', () => {
    const ui = readFileSync(join(ROOT, 'src/app/account/DataActions.tsx'), 'utf8');
    expect(ui).toMatch(/cancelled first|Cancels any subscription/i);
  });

  it('tells the user where the payment record still lives', () => {
    // Stripe retains the customer, invoices and payments independently — that is what a
    // chargeback is defended with, and what tax law requires be kept through a deletion
    // request. Saying so is what stops "you deleted my records" becoming the dispute.
    const email = renderNotify('account-deleted');
    expect(email).toMatch(/Stripe keeps your invoices/i);
    expect(email, 'no route to a refund of the unused period').toMatch(/refund/i);
  });
});

describe('the money-touching endpoints are not guessable', () => {
  it('never takes a customer or subscription id from the request', () => {
    // A `customerId` accepted from the client opens anyone's billing portal, and a
    // `subscriptionId` cancels anyone's plan. Both are read from the signed-in user's row.
    for (const f of ['src/app/api/portal/route.ts', 'src/app/api/account/delete/route.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/[^\n]*$/gm, '');
      expect(src, `${f} must resolve ids from the session`).toContain("eq('user_id', user.id)");
      expect(src, `${f} reads an id from the request body`).not.toMatch(
        /body[^\n]*(customer|subscription)Id|\bcustomerId\s*=|\bsubscriptionId\s*=/i
      );
    }
  });

  it('every account endpoint requires a signed-in user', () => {
    for (const f of [
      'src/app/api/portal/route.ts',
      'src/app/api/account/delete/route.ts',
      'src/app/api/account/export/route.ts',
    ]) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect(src, `${f} does not check auth`).toMatch(/await getUser\(\)/);
      expect(src, `${f} does not reject anonymous callers`).toMatch(/status: 401/);
    }
  });
});
