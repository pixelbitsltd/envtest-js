/**
 * Unified runner API so ONE set of test files runs under both runtimes:
 * `vitest` on Node, `bun:test` under Bun (both expose the jest-compatible
 * describe/it/expect surface). This keeps a bun-only contributor's
 * `bun test` running the full suite, not just a compat subset.
 */
import type { EnvtestConfig } from "../../src/index.js";
import type {} from "../../src/glue/vitest.js"; // types the "envtest" inject key

/** The matcher subset these suites use — both runners implement it. */
export interface Expectation {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(item: unknown): void;
  toMatch(pattern: RegExp | string): void;
  toHaveLength(length: number): void;
  toBeGreaterThan(n: number): void;
  toBeGreaterThanOrEqual(n: number): void;
  toBeLessThan(n: number): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeInstanceOf(constructor: abstract new (...args: never[]) => unknown): void;
  toThrow(expected?: RegExp | string): void;
  not: Expectation;
}

type TestFn = () => void | Promise<unknown>;

export interface RunnerApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: TestFn, timeoutMs?: number): void;
  beforeAll(fn: TestFn, timeoutMs?: number): void;
  afterAll(fn: TestFn, timeoutMs?: number): void;
  expect(actual: unknown): Expectation;
}

const runner: RunnerApi = process.versions.bun
  ? await import(/* @vite-ignore */ "bun:test")
  : await import("vitest");

export const describe = runner.describe.bind(runner);
export const it = runner.it.bind(runner);
export const beforeAll = runner.beforeAll.bind(runner);
export const afterAll = runner.afterAll.bind(runner);
export const expect = runner.expect.bind(runner);

/**
 * The shared control plane's config, whichever runner booted it:
 * vitest provides it from the globalSetup process via inject; under Bun the
 * preload script registered the environment in-process.
 */
export async function getEnvtestConfig(): Promise<EnvtestConfig> {
  if (process.versions.bun) {
    const { envtestConfig } = await import("../../src/glue/bun.js");
    return envtestConfig();
  }
  const { inject } = await import("vitest");
  return inject("envtest");
}
