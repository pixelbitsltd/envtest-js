// Minimal ambient declaration of the bun:test surface the runner shim uses,
// so plain tsc (types: ["node"]) can typecheck without adopting bun-types'
// globals project-wide. `expect` is `any` at this boundary on purpose — the
// runner shim (test/helpers/runner.ts) immediately narrows it to the typed
// Expectation interface, which is what the test files see. Not shipped
// (package files: dist only).
declare module "bun:test" {
  type TestFn = () => void | Promise<unknown>;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn, timeoutMs?: number): void;
  export function test(name: string, fn: TestFn, timeoutMs?: number): void;
  export function beforeAll(fn: TestFn): void;
  export function afterAll(fn: TestFn): void;
  export function expect(actual: unknown): any;
}
