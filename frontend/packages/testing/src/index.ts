/**
 * Test helpers of the frontend workspace (WP-03). Dev only: the apps may import this package from test files alone
 * (ESLint `no-restricted-imports` in each app). Playwright specs import `@homi/testing/playwright` instead, which
 * does not load Vitest.
 */
export { freezeClock } from "./clock";
export {
  fakeTelegram,
  installFakeTelegram,
  resolveFakeTelegramConfig,
  type FakeLocation,
  type FakeTelegram,
  type FakeTelegramAnswers,
  type FakeTelegramCall,
  type FakeTelegramConfig,
  type FakeTelegramOptions,
  type FakeTelegramWindow,
  type FakeWebApp,
} from "./fakeTelegram";
export { fixture } from "./fixtures";
export { SYNTHETIC_HASH, syntheticInitData, type SyntheticTelegramUser } from "./initData";
