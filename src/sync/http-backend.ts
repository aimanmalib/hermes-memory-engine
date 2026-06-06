import type { SyncBackend, SyncPayload } from "../core/memory-sync.js";

/** HTTP sync backend configuration */
export interface HttpBackendConfig {
  /** Base URL of the sync server */
  url: string;
  /** Optional auth token */
  token?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * HttpBackend — sync memories to a custom HTTP server.
 *
 * Expects a simple REST API:
 * - PUT /memories — upload payload
 * - GET /memories — download payload
 * - DELETE /memories — delete payload
 * - HEAD /memories — check existence
 */
export class HttpBackend implements SyncBackend {
  readonly name = "http";
  private config: Required<HttpBackendConfig>;

  constructor(config: HttpBackendConfig) {
    this.config = {
      url: config.url.replace(/\/$/, ""),
      token: config.token ?? "",
      headers: config.headers ?? {},
    };
  }

  private get headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.config.token
        ? { Authorization: `Bearer ${this.config.token}` }
        : {}),
      ...this.config.headers,
    };
  }

  async upload(payload: SyncPayload): Promise<void> {
    const res = await fetch(`${this.config.url}/memories`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP PUT failed: ${res.status} ${res.statusText}`);
    }
  }

  async download(): Promise<SyncPayload | null> {
    const res = await fetch(`${this.config.url}/memories`, {
      headers: this.headers,
    });

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`HTTP GET failed: ${res.status}`);
    }

    return (await res.json()) as SyncPayload;
  }

  async exists(): Promise<boolean> {
    const res = await fetch(`${this.config.url}/memories`, {
      method: "HEAD",
      headers: this.headers,
    });

    return res.ok;
  }

  async delete(): Promise<boolean> {
    const res = await fetch(`${this.config.url}/memories`, {
      method: "DELETE",
      headers: this.headers,
    });

    return res.ok;
  }
}
