// Types for scripts/doc-claims.mjs. Declarations only — the rules live in the .mjs, in one
// copy, because E-1 (duplicated source) is at twelve instances on this project.

export type Mechanisms = {
  scripts: Record<string, string>;
  commands: Set<string>;
  exists: (relativePath: string) => boolean;
};

export type RuleResult = { examined: number; missing: string[] };
export type RuleName = 'npm-script' | 'cli-command' | 'plan-tick-off' | 'script-path';
export type Results = Record<RuleName, RuleResult>;

export declare const SHIPPED: RegExp;
export declare function isPlanDoc(file: string): boolean;
export declare function markdownFiles(root: string, dir?: string, out?: string[]): string[];
export declare function repoMechanisms(repoRoot: string): Mechanisms;
export declare function rules(docs: Map<string, string>, mech: Mechanisms): Results;
export declare function scan(
  docsRoot: string,
  repoRoot: string,
): { files: string[]; docs: Map<string, string>; results: Results };
