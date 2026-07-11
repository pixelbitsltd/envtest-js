// Print the newest stable envtest versions from the upstream release index
// as a JSON array (oldest first), e.g. ["v1.35.0","v1.36.0","v1.36.2"].
//
//   node scripts/envtest-versions.mjs [count]   (default 1)
//
// Dependency-free on purpose: CI uses it for cache keys and to build the
// version-drift matrix before npm ci has run. The full selection logic
// (semver ranges, prereleases) lives in src/setup/releases.ts.
const INDEX_URL =
  "https://raw.githubusercontent.com/kubernetes-sigs/controller-tools/HEAD/envtest-releases.yaml";

const count = Number(process.argv[2] ?? "1");
const res = await fetch(INDEX_URL);
if (!res.ok) {
  console.error(`failed to fetch release index: HTTP ${res.status}`);
  process.exit(1);
}
const text = await res.text();
// Stable versions only — prerelease keys ("v1.37.0-alpha.1:") don't match.
const versions = [...text.matchAll(/^ {2}(v(\d+)\.(\d+)\.(\d+)):/gm)]
  .map((m) => ({ raw: m[1], nums: [Number(m[2]), Number(m[3]), Number(m[4])] }))
  .sort((a, b) => a.nums[0] - b.nums[0] || a.nums[1] - b.nums[1] || a.nums[2] - b.nums[2])
  .map((v) => v.raw);

console.log(JSON.stringify(versions.slice(-count)));
