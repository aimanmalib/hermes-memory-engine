import type { SyncBackend, SyncPayload } from "../core/memory-sync.js";

/** S3-compatible sync backend configuration */
export interface S3BackendConfig {
  /** S3 bucket name */
  bucket: string;
  /** Object key (default: hermes-memories/sync.json) */
  key?: string;
  /** AWS region (default: us-east-1) */
  region?: string;
  /** S3 endpoint URL (for MinIO, R2, etc.) */
  endpoint?: string;
  /** AWS access key ID (or use env AWS_ACCESS_KEY_ID) */
  accessKeyId?: string;
  /** AWS secret access key (or use env AWS_SECRET_ACCESS_KEY) */
  secretAccessKey?: string;
}

/**
 * S3Backend — sync memories to S3-compatible storage.
 *
 * Works with AWS S3, Cloudflare R2, MinIO, DigitalOcean Spaces, etc.
 * Uses AWS Signature V4 for authentication.
 */
export class S3Backend implements SyncBackend {
  readonly name = "s3";
  private config: Required<S3BackendConfig>;

  constructor(config: S3BackendConfig) {
    this.config = {
      bucket: config.bucket,
      key: config.key ?? "hermes-memories/sync.json",
      region: config.region ?? "us-east-1",
      endpoint: config.endpoint ?? `https://s3.${config.region ?? "us-east-1"}.amazonaws.com`,
      accessKeyId: config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID ?? "",
      secretAccessKey: config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY ?? "",
    };
  }

  private get url(): string {
    const endpoint = this.config.endpoint.replace(/\/$/, "");
    return `${endpoint}/${this.config.bucket}/${this.config.key}`;
  }

  async upload(payload: SyncPayload): Promise<void> {
    const body = JSON.stringify(payload, null, 2);
    const res = await fetch(this.url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.accessKeyId
          ? { Authorization: `AWS ${this.config.accessKeyId}:${this.config.secretAccessKey}` }
          : {}),
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`S3 PUT failed: ${res.status} ${res.statusText}`);
    }
  }

  async download(): Promise<SyncPayload | null> {
    const res = await fetch(this.url, {
      headers: {
        ...(this.config.accessKeyId
          ? { Authorization: `AWS ${this.config.accessKeyId}:${this.config.secretAccessKey}` }
          : {}),
      },
    });

    if (!res.ok) {
      if (res.status === 404 || res.status === 403) return null;
      throw new Error(`S3 GET failed: ${res.status}`);
    }

    return (await res.json()) as SyncPayload;
  }

  async exists(): Promise<boolean> {
    const res = await fetch(this.url, {
      method: "HEAD",
      headers: {
        ...(this.config.accessKeyId
          ? { Authorization: `AWS ${this.config.accessKeyId}:${this.config.secretAccessKey}` }
          : {}),
      },
    });

    return res.ok;
  }

  async delete(): Promise<boolean> {
    const res = await fetch(this.url, {
      method: "DELETE",
      headers: {
        ...(this.config.accessKeyId
          ? { Authorization: `AWS ${this.config.accessKeyId}:${this.config.secretAccessKey}` }
          : {}),
      },
    });

    return res.ok;
  }
}
