import https from "node:https";

/**
 * Minimal Kubernetes REST client over mutual TLS. Deliberately tiny: enough
 * for readiness checks and CRD installation without depending on
 * @kubernetes/client-node. Uses node:https (also implemented by Bun) because
 * global fetch has no portable client-certificate support.
 */
export interface RestConfig {
  /** e.g. https://127.0.0.1:56789 */
  server: string;
  /** PEM CA bundle the apiserver's serving cert chains to. */
  caPem: string;
  /** PEM client certificate (envtest admin). */
  certPem: string;
  /** PEM client private key. */
  keyPem: string;
}

export interface RestResponse {
  status: number;
  text: string;
  /** Parsed JSON body, when the response was JSON. */
  json?: any;
}

export function restRequest(
  config: RestConfig,
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<RestResponse> {
  const url = new URL(apiPath, config.server);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        ca: config.caPem,
        cert: config.certPem,
        key: config.keyPem,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString();
          let json: any;
          try {
            json = text ? JSON.parse(text) : undefined;
          } catch {
            json = undefined;
          }
          resolve({ status: res.statusCode ?? 0, text, json });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** Like restRequest, but throws on non-2xx responses. */
export async function restRequestOk(
  config: RestConfig,
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<RestResponse> {
  const res = await restRequest(config, method, apiPath, body);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `${method} ${apiPath} failed: HTTP ${res.status}: ${res.json?.message ?? res.text.slice(0, 500)}`,
    );
  }
  return res;
}

/**
 * Create a cluster-scoped resource, or replace it if it already exists
 * (carrying over the live resourceVersion) — the apply semantics shared by
 * CRD and webhook-configuration install.
 */
export async function createOrReplace(
  config: RestConfig,
  collectionPath: string,
  manifest: { metadata: { name: string } },
): Promise<void> {
  const res = await restRequest(config, "POST", collectionPath, manifest);
  if (res.status === 409) {
    const itemPath = `${collectionPath}/${manifest.metadata.name}`;
    const existing = await restRequestOk(config, "GET", itemPath);
    const update = {
      ...manifest,
      metadata: { ...manifest.metadata, resourceVersion: existing.json.metadata.resourceVersion },
    };
    await restRequestOk(config, "PUT", itemPath, update);
    return;
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `failed to create ${collectionPath}/${manifest.metadata.name}: HTTP ${res.status}: ${res.json?.message ?? res.text.slice(0, 500)}`,
    );
  }
}
