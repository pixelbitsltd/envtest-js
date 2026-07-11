import getPort from "get-port";

/**
 * Free-port allocation via get-port, which keeps an in-process registry of
 * recently returned ports so concurrent allocations (parallel environments,
 * etcd + apiserver starting together) can't collide — the same defence as
 * upstream envtest's addr.Suggest cache. The listen/close/reuse race against
 * *other* processes remains, as it does upstream.
 */
export function getFreePort(host = "127.0.0.1"): Promise<number> {
  return getPort({ host });
}

/** host:port for use in URLs, bracketing IPv6 literals. */
export function hostPort(host: string, port: number): string {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * The host clients should dial to reach a server bound to listenAddress:
 * wildcard binds serve loopback (among everything else), anything specific
 * is dialed directly.
 */
export function connectHostFor(listenAddress: string): string {
  if (listenAddress === "0.0.0.0") return "127.0.0.1";
  if (listenAddress === "::") return "::1";
  return listenAddress;
}
