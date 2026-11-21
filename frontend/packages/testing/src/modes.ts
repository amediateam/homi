import { appendFileSync } from "node:fs";

import type { Page, Request, TestInfo } from "@playwright/test";

import type { TelegramColorScheme, TelegramPlatform } from "./fakeTelegram";

/**
 * The session modes of the suite (WP-33, DEC-44, `25` §3.4, RK-30) and the checks that run after every test which
 * launched the app (`launchApp`), so a spec author never writes them:
 *
 * | Mode | Checked after the test |
 * | ---- | ---------------------- |
 * | cookie | the context holds `homi_session` `HttpOnly`, `Secure`, `SameSite=None`, partitioned, once a sign-in answered `200`; no request to `/bff/` carries `Authorization` |
 * | header | no `homi_session` cookie; once a request of a document carried `Authorization: Bearer`, every later request of it to `/bff/` does too (the exchange `/bff/session` and the boot guard's `/bff/boot-error` aside: a document's reads before its session is in memory carry no token); the token is in neither storage, nor in a DeviceStorage call of the fake, nor in an address the page visited |
 * | both | no `securitypolicyviolation`, no console error, no missing catalogue message (`app_error` with `MissingMessage`) |
 *
 * The guard of `./playwright` already fails a request to an external host. The checks run only after a test that
 * passed; a test that provokes a console error or a policy violation on purpose declares it (`allowConsoleErrors`,
 * `allowCspViolations`). Chromium's own lines about an answer's status ("Failed to load resource") are not console
 * errors of the app: specs ask for refusals on purpose. With `E2E_MODE_REPORT=<file>` the findings are appended to
 * that file as JSON lines instead of failing the test (used once to survey the suite).
 */

export type SessionMode = "cookie" | "header";

/** The Telegram profile and session mode a project gives every launch that does not choose its own (`metadata`). */
export interface ProjectProfile {
  sessionMode?: SessionMode;
  platform?: TelegramPlatform;
  version?: string;
  colorScheme?: TelegramColorScheme;
}

/** The project's profile, from `metadata.profile` of `frontend/playwright.config.ts`. */
export function projectProfile(info: TestInfo): ProjectProfile {
  const profile = (info.project.metadata as { profile?: ProjectProfile } | undefined)?.profile;
  return profile ?? {};
}

/** The mode `launchApp` uses when the spec names none: the project's, else cookie. */
export function projectSessionMode(info: TestInfo): SessionMode {
  return projectProfile(info).sessionMode ?? "cookie";
}

interface BffRequest {
  path: string;
  method: string;
  authorization: string | null;
  at: number;
  /** The page's document the request was sent from: a load or reload starts the next one. */
  document: number;
}

interface ModeRecord {
  page: Page;
  mode: SessionMode;
  requests: Promise<BffRequest | null>[];
  /** The status of the last sign-in. */
  lastSignIn: number | null;
  document: number;
  tokens: Set<string>;
  consoleErrors: string[];
  csp: string[];
  missing: string[];
  visited: string[];
  calls: (() => Promise<unknown>) | null;
  pending: Promise<unknown>[];
  seq: number;
}

/** The records of the running test; a worker runs one test at a time. */
let records: ModeRecord[] = [];

/** The exchange and the boot guard: sent before (or without) a session, never with its bearer. */
const NO_BEARER = /^\/bff\/(session|boot-error)$/;
/** The page's own line for a CSP violation (`watchMode`), and Chromium's. */
const CSP_LINE = /^\[homi-csp\] |^Refused to /;
/** Chromium's line for an answer with an error status: the spec asked for it. */
const STATUS_LINE = /^Failed to load resource: /;
/** A missing catalogue message reaches the journal as `app_error` named `MissingMessage` (WP-32). */
const MISSING = /"name":"MissingMessage","message":"([^"]*)"/;

function bffAddress(origin: string, request: Request): URL | null {
  const url = new URL(request.url());
  return url.origin === origin && url.pathname.startsWith("/bff/") ? url : null;
}

/** Starts the checks of `mode` on `page`; `launchApp` calls it before the first navigation. */
export async function watchMode(page: Page, mode: SessionMode, baseURL: string, calls: (() => Promise<unknown>) | null): Promise<void> {
  const origin = new URL(baseURL).origin;
  const record: ModeRecord = {
    page,
    mode,
    requests: [],
    lastSignIn: null,
    document: 0,
    tokens: new Set(),
    consoleErrors: [],
    csp: [],
    missing: [],
    visited: [],
    calls,
    pending: [],
    seq: 0,
  };
  records.push(record);
  page.on("request", (request) => {
    // A new document starts without the session in memory: its reads before its own sign-in carry no token.
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      record.document += 1;
    }
    const url = bffAddress(origin, request);
    if (url === null) {
      return;
    }
    record.seq += 1;
    const at = record.seq;
    const document = record.document;
    record.requests.push(
      request
        .allHeaders()
        .then((headers) => ({ path: url.pathname, method: request.method(), authorization: headers.authorization ?? null, at, document }))
        .catch(() => null),
    );
    if (url.pathname === "/bff/events") {
      const found = MISSING.exec(request.postData() ?? "");
      if (found) {
        record.missing.push(found[1] ?? "");
      }
    }
  });
  page.on("response", (response) => {
    const request = response.request();
    const url = bffAddress(origin, request);
    if (url?.pathname === "/bff/session" && request.method() === "POST") {
      record.lastSignIn = response.status();
      if (response.status() === 200) {
        record.pending.push(
          response
          .json()
          .then((body: { token?: unknown }) => {
            if (typeof body.token === "string" && body.token !== "") {
              record.tokens.add(body.token);
            }
          })
          .catch(() => undefined),
        );
      }
    }
  });
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    if (CSP_LINE.test(text)) {
      record.csp.push(text.replace("[homi-csp] ", ""));
    } else if (!STATUS_LINE.test(text)) {
      record.consoleErrors.push(text);
    }
  });
  page.on("pageerror", (error) => record.consoleErrors.push(`uncaught: ${error.message}`));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      record.visited.push(frame.url());
    }
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.error(`[homi-csp] ${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

const ALLOW_CONSOLE = "allow-console-errors";
const ALLOW_CSP = "allow-csp-violations";

/** This test provokes console errors matching `pattern` on purpose (a crash screen, a failing chunk). */
export function allowConsoleErrors(info: TestInfo, pattern: RegExp): void {
  info.annotations.push({ type: ALLOW_CONSOLE, description: pattern.source });
}

/** This test provokes a policy violation on purpose (`csp.spec.ts`). */
export function allowCspViolations(info: TestInfo): void {
  info.annotations.push({ type: ALLOW_CSP });
}

/** Forgets the previous test's records; the fixture calls it before each test. */
export function resetModeRecords(): void {
  records = [];
}

async function findingsOf(record: ModeRecord, info: TestInfo): Promise<string[]> {
  const findings: string[] = [];
  await Promise.all(record.pending);
  const requests = (await Promise.all(record.requests)).filter((request): request is BffRequest => request !== null);
  const cookies = await record.page
    .context()
    .cookies()
    .catch(() => []);
  const sessions = cookies.filter((cookie) => cookie.name === "homi_session");

  if (record.mode === "cookie") {
    for (const request of requests) {
      if (request.authorization !== null) {
        findings.push(`cookie mode: ${request.method} ${request.path} carried Authorization`);
      }
    }
    if (record.lastSignIn === 200 && sessions.length === 0) {
      findings.push("cookie mode: signed in, but the context holds no homi_session cookie");
    }
    for (const cookie of sessions) {
      if (!cookie.httpOnly || !cookie.secure || cookie.sameSite !== "None" || !cookie.partitionKey) {
        findings.push(
          `cookie mode: homi_session is ${JSON.stringify({ httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite, partitionKey: cookie.partitionKey ?? null })}`,
        );
      }
    }
  } else {
    if (sessions.length > 0) {
      findings.push("header mode: the context holds a homi_session cookie");
    }
    // The document's session is in memory once a request of it carried the bearer; every later one must too.
    const bearer = (request: BffRequest) => /^Bearer \S+$/.test(request.authorization ?? "");
    for (const request of requests) {
      const first = requests.find((other) => other.document === request.document && bearer(other));
      if (first !== undefined && request.at > first.at && !NO_BEARER.test(request.path) && !bearer(request)) {
        findings.push(`header mode: ${request.method} ${request.path} carried no bearer`);
      }
    }
    if (record.tokens.size > 0) {
      const stored = record.page.isClosed()
        ? ""
        : await record.page
            .evaluate(() => {
              const dump = (storage: Storage) => Object.fromEntries(Array.from({ length: storage.length }, (_, i) => [storage.key(i), storage.getItem(storage.key(i) ?? "")]));
              return JSON.stringify([dump(localStorage), dump(sessionStorage)]);
            })
            .catch(() => "");
      const deviceStorage = record.calls && !record.page.isClosed() ? JSON.stringify(await record.calls().catch(() => [])) : "";
      const visited = [...record.visited, record.page.isClosed() ? "" : record.page.url()].join("\n");
      for (const token of record.tokens) {
        if (stored.includes(token)) {
          findings.push("header mode: the token is in localStorage or sessionStorage");
        }
        if (deviceStorage.includes(token)) {
          findings.push("header mode: the token went into a Telegram storage call");
        }
        if (visited.includes(token)) {
          findings.push("header mode: the token is in an address the page visited");
        }
      }
    }
  }

  const allowed = info.annotations.filter((annotation) => annotation.type === ALLOW_CONSOLE).map((annotation) => new RegExp(annotation.description ?? ""));
  for (const line of record.consoleErrors) {
    if (!allowed.some((pattern) => pattern.test(line))) {
      findings.push(`console error: ${line}`);
    }
  }
  if (!info.annotations.some((annotation) => annotation.type === ALLOW_CSP)) {
    for (const line of record.csp) {
      findings.push(`CSP violation: ${line}`);
    }
  }
  for (const key of record.missing) {
    findings.push(`missing message: ${key}`);
  }
  return findings;
}

/** The checks after a test (the auto fixture of `./playwright`): the findings of every page the test launched. */
export async function modeFindings(info: TestInfo): Promise<string[]> {
  const findings: string[] = [];
  for (const record of records) {
    findings.push(...(await findingsOf(record, info)).map((finding) => (records.length > 1 ? `${record.mode} page: ${finding}` : finding)));
  }
  const report = process.env.E2E_MODE_REPORT;
  if (report && findings.length > 0) {
    appendFileSync(report, `${JSON.stringify({ project: info.project.name, file: info.file.split("/e2e/")[1] ?? info.file, title: info.titlePath.slice(1).join(" › "), findings: [...new Set(findings)] })}\n`);
    return [];
  }
  // A failure message stays readable: a stack or a policy line is cut.
  return [...new Set(findings.map((finding) => (finding.length > 400 ? `${finding.slice(0, 400)}…` : finding)))];
}
