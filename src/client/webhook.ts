import fsp from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { setTimeout as sleep } from "node:timers/promises";
import yaml from "js-yaml";

import { hostPort } from "../controlplane/ports.js";
import { createOrReplace, type RestConfig } from "./rest.js";

/**
 * Admission-webhook install — a port of envtest's WebhookInstallOptions
 * (pkg/envtest/webhook.go). The webhook *server* runs in the test process;
 * envtest-js mints its serving certificate, rewrites the webhook
 * configurations to call back at https://<localServingHost>:<port>, injects
 * the CA bundle so the apiserver trusts that callback, and applies the
 * configurations to the cluster.
 */

const API_BASE = "/apis/admissionregistration.k8s.io/v1";

const KIND_TO_PLURAL: Record<string, string> = {
  ValidatingWebhookConfiguration: "validatingwebhookconfigurations",
  MutatingWebhookConfiguration: "mutatingwebhookconfigurations",
};

export interface WebhookInstallOptions {
  /**
   * Manifests (files or directories) containing
   * (Validating|Mutating)WebhookConfiguration documents.
   */
  paths: string[];
  /** Host the in-test webhook server will listen on (default 127.0.0.1). */
  localServingHost?: string;
  /** Port for the in-test webhook server (default: a free port). */
  localServingPort?: number;
}

export interface WebhookClientConfig {
  url?: string;
  caBundle?: string;
  service?: { name: string; namespace: string; path?: string; port?: number };
}

export interface WebhookConfigurationManifest {
  apiVersion: string;
  kind: string;
  metadata: { name: string; resourceVersion?: string };
  webhooks?: Array<{ name: string; clientConfig?: WebhookClientConfig; [key: string]: unknown }>;
  [key: string]: unknown;
}

export async function readWebhookManifests(
  paths: string[],
): Promise<WebhookConfigurationManifest[]> {
  const files: string[] = [];
  for (const p of paths) {
    const stat = await fsp.stat(p);
    if (stat.isDirectory()) {
      for (const entry of await fsp.readdir(p)) {
        if (/\.(ya?ml|json)$/i.test(entry)) files.push(path.join(p, entry));
      }
    } else {
      files.push(p);
    }
  }

  const manifests: WebhookConfigurationManifest[] = [];
  for (const file of files) {
    const text = await fsp.readFile(file, "utf8");
    for (const doc of yaml.loadAll(text)) {
      if (!doc || typeof doc !== "object") continue;
      const obj = doc as WebhookConfigurationManifest;
      if (obj.kind in KIND_TO_PLURAL) {
        if (!obj.metadata?.name) {
          throw new Error(`${obj.kind} in ${file} has no metadata.name`);
        }
        manifests.push(obj);
      }
    }
  }
  return manifests;
}

/**
 * Point every webhook at the in-test server: replace `clientConfig.service`
 * with a direct URL (keeping the service's path), and inject the CA bundle
 * the apiserver must trust. Mirrors upstream's modifyWebhookDefinitions.
 * Returns rewritten copies; the inputs are not mutated.
 */
export function rewriteWebhookManifests(
  manifests: WebhookConfigurationManifest[],
  host: string,
  port: number,
  caPem: string,
): WebhookConfigurationManifest[] {
  const caBundle = Buffer.from(caPem).toString("base64");
  return manifests.map((manifest) => {
    const clone = structuredClone(manifest);
    for (const hook of clone.webhooks ?? []) {
      const clientConfig = (hook.clientConfig ??= {});
      const servingPath =
        clientConfig.service?.path ??
        (clientConfig.url ? new URL(clientConfig.url).pathname : "/");
      delete clientConfig.service;
      clientConfig.url = `https://${hostPort(host, port)}${servingPath}`;
      clientConfig.caBundle = caBundle;
    }
    return clone;
  });
}

/** The subset of a CRD manifest that conversion-webhook patching touches. */
export interface CRDConversionTarget {
  kind: string;
  metadata: { name: string };
  spec?: {
    conversion?: {
      strategy?: string;
      webhook?: {
        conversionReviewVersions?: string[];
        clientConfig?: WebhookClientConfig;
      };
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Point CRD conversion webhooks at the in-test server — upstream's
 * modifyConversionWebhooks. Go decides which CRDs are convertible by
 * consulting the runtime scheme; with no scheme in JS, we patch exactly the
 * CRDs whose manifest declares `spec.conversion.strategy: Webhook` (what
 * kubebuilder generates for conversion types). The authored service path is
 * kept, defaulting to controller-runtime's fixed /convert endpoint.
 * Returns rewritten copies; the inputs are not mutated.
 */
export function rewriteConversionWebhooks<T extends CRDConversionTarget>(
  crds: T[],
  host: string,
  port: number,
  caPem: string,
): T[] {
  const caBundle = Buffer.from(caPem).toString("base64");
  return crds.map((crd) => {
    if (crd.spec?.conversion?.strategy !== "Webhook") return crd;
    const clone = structuredClone(crd);
    const conversion = clone.spec!.conversion!;
    const clientConfig = conversion.webhook?.clientConfig ?? {};
    const servingPath =
      clientConfig.service?.path ??
      (clientConfig.url ? new URL(clientConfig.url).pathname : "/convert");
    conversion.webhook = {
      conversionReviewVersions: conversion.webhook?.conversionReviewVersions ?? ["v1", "v1beta1"],
      clientConfig: {
        url: `https://${hostPort(host, port)}${servingPath}`,
        caBundle,
      },
    };
    return clone;
  });
}

/** Apply (create-or-replace) webhook configurations; returns their names. */
export async function installWebhooks(
  config: RestConfig,
  manifests: WebhookConfigurationManifest[],
): Promise<string[]> {
  for (const manifest of manifests) {
    await createOrReplace(config, `${API_BASE}/${KIND_TO_PLURAL[manifest.kind]}`, manifest);
  }
  return manifests.map((m) => m.metadata.name);
}

/**
 * Poll until a TLS server accepts connections at host:port — the dial-check
 * from the kubebuilder book's webhook test pattern. Call this after starting
 * your webhook server, before exercising requests that trigger it.
 */
export async function waitForWebhookServer(
  host: string,
  port: number,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await canConnectTLS(host, port)) return;
    await sleep(100);
  }
  throw new Error(
    `webhook server at ${hostPort(host, port)} did not accept TLS connections within ${timeoutMs}ms`,
  );
}

function canConnectTLS(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.setTimeout(1_000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
