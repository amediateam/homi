/**
 * One report per problem per launch (WP-20, fix of LB-APP-002). The reporter is an argument: this package knows
 * nothing about the app's error facade, which is a no-op until WP-32.
 */

export type I18nIssue = {
  kind: "i18n";
  /** Full key path, or `null` for an error that is not about one key. */
  key: string | null;
  /** next-intl's error code, or `UNKNOWN_VALUE` for a server value without a label. */
  code: string;
};

export type I18nReporter = (error: Error, issue: I18nIssue) => void;

const reported = new Set<string>();

/** Calls `report` the first time `id` is seen in this process (a browser launch, or a server process). */
export function reportOnce(report: I18nReporter | undefined, id: string, error: Error, issue: I18nIssue): void {
  if (!report || reported.has(id)) {
    return;
  }
  reported.add(id);
  report(error, issue);
}

/** Forgets what was reported; tests only. */
export function resetI18nReports(): void {
  reported.clear();
}
