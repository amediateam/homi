/**
 * Catalogues of the Mini App (WP-20): the generated `legacy` layer (legacy key names and values of the pinned
 * release), the hand-written `homi` layer over it, the runtime rules that never throw, and the label tables for
 * server values. Formatters arrive with WP-22.
 */
export { type LabelTable, labelFor, labelTables } from "./labels";
export { htmlLang, numberLocale } from "./locale";
export {
  createIntlHandlers,
  getMessages,
  type MessageKey,
  type Messages,
  mergeMessages,
  type MessageTree,
} from "./messages";
export { type I18nIssue, type I18nReporter, reportOnce, resetI18nReports } from "./report";
