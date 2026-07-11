/**
 * Flag handling for control-plane processes: defaults merged with user
 * overrides, where a null value deletes a default flag entirely. Values may
 * be arrays — the flag is then passed once per value, matching upstream's
 * map[string][]string argument model.
 */
export type ExtraArgs = Record<string, string | string[] | null>;

export type Args = Record<string, string | string[]>;

export function mergeArgs(defaults: Args, extra: ExtraArgs = {}): Args {
  const merged: Args = { ...defaults };
  for (const [key, value] of Object.entries(extra)) {
    const name = key.replace(/^--/, "");
    if (value === null) {
      delete merged[name];
    } else {
      merged[name] = value;
    }
  }
  return merged;
}

export function renderArgs(args: Args): string[] {
  return Object.entries(args).flatMap(([key, value]) =>
    (Array.isArray(value) ? value : [value]).map((v) => (v === "" ? `--${key}` : `--${key}=${v}`)),
  );
}
