/**
 * A negative result is only believable when a positive control passed in the same run.
 *
 * The failure this exists to stop, from this project's own history: a domain-availability
 * check ran `dig`, which was not installed. It returned empty for every domain. Empty was
 * read as "no records — probably available", and five domains were reported as free on the
 * strength of a command that never executed.
 *
 * **An absent instrument and a genuine negative are indistinguishable.** The only way to
 * tell them apart is to ask the instrument a question you already know the answer to. If it
 * cannot find google.com, it did not fail to find enforcee.com — it failed.
 *
 * There is no established software term for this. The nearest relatives are mutation testing
 * (seed a defect, confirm the suite catches it), pytest's exit code 5 for "no tests were
 * collected", and GitLab's merge-request policy that forces approval when a scanner produced
 * no report — all the same instinct: work that did not happen must not read as work that
 * found nothing.
 */

export type ControlledVerdict = 'CONFIRMED' | 'REFUTED' | 'UNVERIFIABLE';

export interface ControlledResult<T> {
  verdict: ControlledVerdict;
  /** Present only when the control passed. Never trust this on UNVERIFIABLE. */
  value?: T;
  /** Plain-language account of what happened, written for the person reading the receipt. */
  reason: string;
  control: { ran: boolean; passed: boolean; detail: string };
}

export interface ControlledProbe<T> {
  /** What we actually want to know. */
  probe: () => Promise<T> | T;
  /**
   * A question with a known answer, asked of the same instrument, in the same run.
   * Must return true when the instrument is working.
   */
  control: () => Promise<boolean> | boolean;
  /** How to read the probe's result. Only consulted once the control has passed. */
  interpret: (value: T) => { verdict: 'CONFIRMED' | 'REFUTED'; reason: string };
  /** Names the instrument, for the failure message. e.g. "dig", "npm registry", "filesystem". */
  instrument: string;
}

/**
 * Run a probe behind its control.
 *
 * Deliberately returns UNVERIFIABLE rather than throwing when the control fails. This is the
 * same respected answer the audit engine gives: we could not tell, and we will not pretend.
 * A caller that treats UNVERIFIABLE as "fine" has reintroduced the bug, which is why the
 * value is left undefined rather than being handed over with a warning attached.
 */
export async function runControlled<T>(p: ControlledProbe<T>): Promise<ControlledResult<T>> {
  let controlPassed = false;
  let controlDetail = '';
  try {
    controlPassed = await p.control();
    controlDetail = controlPassed
      ? `${p.instrument} answered a known-good question correctly`
      : `${p.instrument} failed a question with a known answer`;
  } catch (err) {
    controlDetail = `${p.instrument} threw while running its control: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!controlPassed) {
    return {
      verdict: 'UNVERIFIABLE',
      reason:
        `Not checked. ${controlDetail}, so nothing it reported can be trusted — a tool that is ` +
        `missing or broken produces the same empty answer as a genuine negative.`,
      control: { ran: true, passed: false, detail: controlDetail },
    };
  }

  try {
    const value = await p.probe();
    const { verdict, reason } = p.interpret(value);
    return { verdict, value, reason, control: { ran: true, passed: true, detail: controlDetail } };
  } catch (err) {
    return {
      verdict: 'UNVERIFIABLE',
      reason: `The control passed but the check itself failed: ${err instanceof Error ? err.message : String(err)}`,
      control: { ran: true, passed: true, detail: controlDetail },
    };
  }
}
