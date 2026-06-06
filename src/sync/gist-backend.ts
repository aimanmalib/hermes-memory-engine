import type { SyncBackend, SyncPayload } from "../core/memory-sync.js";

/** GitHub Gist sync backend configuration */
export interface GistBackendConfig {
  /** GitHub personal access token */
  token: string;
  /** Gist ID to sync to (created automatically if not provided) */
  gistId?: string;
  /** Filename within the gist (default: memories.json) */
  filename?: string;
  /** Gist description (used when creating) */
  description?: string;
}

/**
 * GitHubGistBackend — sync memories to a GitHub Gist.
 *
 * Pros: free, no extra infra, version history via Gist revisions.
 * Cons: 1MB limit per Gist, public gists visible to all.
 */
export class GitHubGistBackend implements SyncBackend {
  readonly name = "github-gist";
  private config: Required<GistBackendConfig>;

  constructor(config: GistBackendConfig) {
    this.config = {
      token: config.token,
      gistId: config.gistId ?? "",
      filename: config.filename ?? "memories.json",
      description: config.description ?? "Hermes Memory Engine sync",
    };
  }

  async upload(payload: SyncPayload): Promise<void> {
    const body = {
      description: this.config.description,
      files: {
        [this.config.filename]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    };

    const url = this.config.gistId
      ? `https://api.github.com/gists/${this.config.gistId}`
      : "https://api.github.com/gists";

    const method = this.config.gistId ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.config.token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`GitHub Gist ${method} failed: ${res.status} ${res.statusText}`);
    }

    // Store the gist ID if we just created it
    if (!this.config.gistId) {
      const data = (await res.json()) as { id: string };
      this.config.gistId = data.id;
    }
  }

  async download(): Promise<SyncPayload | null> {
    if (!this.config.gistId) return null;

    const res = await fetch(
      `https://api.github.com/gists/${this.config.gistId}`,
      {
        headers: {
          Authorization: `token ${this.config.token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`GitHub Gist GET failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      files: Record<string, { content: string }>;
    };
    const file = data.files[this.config.filename];
    if (!file) return null;

    return JSON.parse(file.content) as SyncPayload;
  }

  async exists(): Promise<boolean> {
    if (!this.config.gistId) return false;

    const res = await fetch(
      `https://api.github.com/gists/${this.config.gistId}`,
      {
        method: "HEAD",
        headers: {
          Authorization: `token ${this.config.token}`,
        },
      }
    );

    return res.ok;
  }

  async delete(): Promise<boolean> {
    if (!this.config.gistId) return false;

    const res = await fetch(
      `https://api.github.com/gists/${this.config.gistId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `token ${this.config.token}`,
        },
      }
    );

    if (res.ok) {
      this.config.gistId = "";
    }

    return res.ok;
  }

  /** Get the current Gist ID (useful after auto-creation) */
  getGistId(): string {
    return this.config.gistId;
  }
}
