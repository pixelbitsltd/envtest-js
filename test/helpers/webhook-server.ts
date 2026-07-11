import https from "node:https";

import type { EnvtestConfig } from "../../src/index.js";

/**
 * The in-test webhook server both suites (vitest e2e, bun:test) run against:
 * one HTTPS server for all webhook paths, as controller-runtime serves it.
 * /validate-deny denies every AdmissionReview; /convert converts by swapping
 * apiVersion.
 */
export interface TestWebhookServer {
  /** Pathnames of webhook calls received, in order. */
  calls: string[];
  close(): Promise<void>;
}

export const DENY_MESSAGE = "denied by envtest-js test webhook";

export async function startTestWebhookServer(config: EnvtestConfig): Promise<TestWebhookServer> {
  const webhook = config.webhook;
  if (!webhook) throw new Error("environment has no webhook serving config");

  const calls: string[] = [];
  const server = https.createServer({ cert: webhook.certPem, key: webhook.keyPem }, (req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const pathname = new URL(req.url!, "https://webhook").pathname;
      calls.push(pathname);
      const review = JSON.parse(body);
      const respond = (response: object) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      };
      if (pathname === "/validate-deny") {
        respond({
          apiVersion: "admission.k8s.io/v1",
          kind: "AdmissionReview",
          response: {
            uid: review.request.uid,
            allowed: false,
            status: { code: 403, message: DENY_MESSAGE },
          },
        });
      } else if (pathname === "/convert") {
        respond({
          apiVersion: "apiextensions.k8s.io/v1",
          kind: "ConversionReview",
          response: {
            uid: review.request.uid,
            result: { status: "Success" },
            convertedObjects: review.request.objects.map((obj: Record<string, unknown>) => ({
              ...obj,
              apiVersion: review.request.desiredAPIVersion,
            })),
          },
        });
      } else {
        res.writeHead(404).end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(webhook.port, webhook.host, resolve);
  });

  return {
    calls,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
