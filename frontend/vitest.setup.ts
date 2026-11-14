/**
 * Loaded before every test file of every project (`vitest.config.mts`). No unit test may reach the network
 * (DEC-33): an unmocked `fetch` rejects. A test that needs a response stubs it with `vi.stubGlobal("fetch", …)`;
 * `unstubGlobals` puts this guard back after the test.
 */
function describeRequest(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
  throw new Error(`Unmocked fetch in a unit test: ${describeRequest(input)}`);
};
