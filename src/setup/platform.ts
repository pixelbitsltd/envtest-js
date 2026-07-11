import os from "node:os";
import path from "node:path";

/** Map process.platform to the GOOS names used in envtest release archives. */
export function goOS(platform: NodeJS.Platform = process.platform): string {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "darwin";
    case "linux":
      return "linux";
    default:
      throw new Error(`envtest binaries are not published for platform "${platform}"`);
  }
}

/** Map process.arch to the GOARCH names used in envtest release archives. */
export function goArch(arch: NodeJS.Architecture = process.arch): string {
  switch (arch) {
    case "x64":
      return "amd64";
    case "arm64":
      return "arm64";
    case "ppc64":
      return "ppc64le";
    case "s390x":
      return "s390x";
    default:
      throw new Error(`envtest binaries are not published for architecture "${arch}"`);
  }
}

/** Append .exe on Windows. */
export function binaryName(base: string, platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `${base}.exe` : base;
}

/**
 * Platform-appropriate data directory used to cache downloaded binaries,
 * mirroring setup-envtest's use of the XDG data dir.
 */
export function defaultDataDir(): string {
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, "envtest-js");
  }
  switch (process.platform) {
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
        "envtest-js",
      );
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "envtest-js");
    default:
      return path.join(os.homedir(), ".local", "share", "envtest-js");
  }
}
