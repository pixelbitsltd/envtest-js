import path from "node:path";

import { downloadArchive, hasAllBinaries } from "./download.js";
import { binaryName, defaultDataDir, goArch, goOS } from "./platform.js";
import { archiveFor, fetchReleaseIndex, selectVersion } from "./releases.js";

export interface BinaryPaths {
  etcd: string;
  kubeApiserver: string;
  kubectl: string;
  /** Directory the binaries live in. */
  dir: string;
  /** Resolved envtest version, when binaries were resolved via the release index. */
  version?: string;
}

export interface ResolveBinariesOptions {
  /**
   * Requested envtest version: exact ("v1.36.2"), a semver range
   * ("1.36" for the latest 1.36.x, ">=1.35 <1.37"), or undefined for the
   * latest stable release.
   */
  version?: string;
  /** Directory already containing etcd/kube-apiserver/kubectl (skips download). */
  binaryAssetsDirectory?: string;
  /** Override the release index URL. */
  indexURL?: string;
  /** Cache directory root (defaults to the platform data dir). */
  dataDir?: string;
  onProgress?: (message: string) => void;
}

function binaries(dir: string, version?: string): BinaryPaths {
  return {
    etcd: process.env.TEST_ASSET_ETCD || path.join(dir, binaryName("etcd")),
    kubeApiserver:
      process.env.TEST_ASSET_KUBE_APISERVER || path.join(dir, binaryName("kube-apiserver")),
    kubectl: process.env.TEST_ASSET_KUBECTL || path.join(dir, binaryName("kubectl")),
    dir,
    version,
  };
}

/**
 * Resolve control-plane binaries with the same precedence as Go envtest:
 *
 * 1. TEST_ASSET_ETCD / TEST_ASSET_KUBE_APISERVER / TEST_ASSET_KUBECTL (per binary)
 * 2. KUBEBUILDER_ASSETS (directory)
 * 3. options.binaryAssetsDirectory
 * 4. download from the upstream release index into the local cache
 */
export async function resolveBinaries(
  opts: ResolveBinariesOptions = {},
): Promise<BinaryPaths> {
  if (process.env.KUBEBUILDER_ASSETS) {
    return binaries(process.env.KUBEBUILDER_ASSETS);
  }
  if (opts.binaryAssetsDirectory) {
    return binaries(opts.binaryAssetsDirectory);
  }

  const osName = goOS();
  const arch = goArch();
  const dataDir = opts.dataDir ?? defaultDataDir();

  // Fast path: an exact requested version that is already cached needs no
  // network access at all.
  if (opts.version && /^v?\d+\.\d+\.\d+/.test(opts.version)) {
    const v = opts.version.startsWith("v") ? opts.version : `v${opts.version}`;
    const dir = path.join(dataDir, "k8s", `${v}-${osName}-${arch}`);
    if (await hasAllBinaries(dir)) return binaries(dir, v);
  }

  const index = await fetchReleaseIndex(opts.indexURL);
  const version = selectVersion(index, opts.version);
  const dir = path.join(dataDir, "k8s", `${version}-${osName}-${arch}`);
  const archive = archiveFor(index, version, osName, arch);
  await downloadArchive(archive, dir, { onProgress: opts.onProgress });
  return binaries(dir, version);
}
