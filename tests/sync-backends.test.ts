import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubGistBackend } from "../src/sync/gist-backend.js";
import { S3Backend } from "../src/sync/s3-backend.js";
import { HttpBackend } from "../src/sync/http-backend.js";
import type { SyncPayload } from "../src/core/memory-sync.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const testPayload: SyncPayload = {
  version: 1,
  timestamp: new Date().toISOString(),
  memories: [
    {
      id: "mem-1",
      content: "test memory",
      tags: ["test"],
      agent: "default",
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      relations: [],
    },
  ],
  checksum: "abc123",
};

function okJson(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => data,
  };
}

function okEmpty(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
  };
}

describe("GitHubGistBackend", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct name", () => {
    const backend = new GitHubGistBackend({ token: "ghp_test" });
    expect(backend.name).toBe("github-gist");
  });

  it("upload sends PATCH when gistId exists", async () => {
    mockFetch.mockResolvedValueOnce(okJson({}));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    await backend.upload(testPayload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/gists/gist-123",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("upload sends POST and stores gistId when no gistId", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ id: "new-gist-456" }));
    const backend = new GitHubGistBackend({ token: "ghp_test" });
    await backend.upload(testPayload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/gists",
      expect.objectContaining({ method: "POST" })
    );
    expect(backend.getGistId()).toBe("new-gist-456");
  });

  it("upload throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    await expect(backend.upload(testPayload)).rejects.toThrow("GitHub Gist PATCH failed");
  });

  it("download returns null when no gistId", async () => {
    const backend = new GitHubGistBackend({ token: "ghp_test" });
    const result = await backend.download();
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("download returns payload when gist exists", async () => {
    mockFetch.mockResolvedValueOnce(
      okJson({ files: { "memories.json": { content: JSON.stringify(testPayload) } } })
    );
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    const result = await backend.download();

    expect(result).not.toBeNull();
    expect(result!.memories).toHaveLength(1);
    expect(result!.memories[0].content).toBe("test memory");
  });

  it("download returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    const result = await backend.download();
    expect(result).toBeNull();
  });

  it("download throws on other errors", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(500));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    await expect(backend.download()).rejects.toThrow("GitHub Gist GET failed");
  });

  it("download returns null when file not in gist", async () => {
    mockFetch.mockResolvedValueOnce(okJson({ files: { "other.json": { content: "{}" } } }));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    const result = await backend.download();
    expect(result).toBeNull();
  });

  it("exists returns false when no gistId", async () => {
    const backend = new GitHubGistBackend({ token: "ghp_test" });
    expect(await backend.exists()).toBe(false);
  });

  it("exists returns true when HEAD ok", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(200));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    expect(await backend.exists()).toBe(true);
  });

  it("exists returns false when HEAD fails", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    expect(await backend.exists()).toBe(false);
  });

  it("delete returns false when no gistId", async () => {
    const backend = new GitHubGistBackend({ token: "ghp_test" });
    expect(await backend.delete()).toBe(false);
  });

  it("delete sends DELETE and clears gistId on success", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(204));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    expect(await backend.delete()).toBe(true);
    expect(backend.getGistId()).toBe("");
  });

  it("delete returns false on failure", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new GitHubGistBackend({ token: "ghp_test", gistId: "gist-123" });
    expect(await backend.delete()).toBe(false);
  });
});

describe("S3Backend", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct name", () => {
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(backend.name).toBe("s3");
  });

  it("constructs correct URL", () => {
    const backend = new S3Backend({ bucket: "my-bucket", region: "eu-west-1" });
    // URL is private, but we can test via upload call
    mockFetch.mockResolvedValueOnce(okEmpty());
    backend.upload(testPayload);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("my-bucket"),
      expect.anything()
    );
  });

  it("upload sends PUT with payload", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty());
    const backend = new S3Backend({ bucket: "test-bucket" });
    await backend.upload(testPayload);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("upload throws on error", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new S3Backend({ bucket: "test-bucket" });
    await expect(backend.upload(testPayload)).rejects.toThrow("S3 PUT failed");
  });

  it("download returns payload on success", async () => {
    mockFetch.mockResolvedValueOnce(okJson(testPayload));
    const backend = new S3Backend({ bucket: "test-bucket" });
    const result = await backend.download();
    expect(result).not.toBeNull();
    expect(result!.memories).toHaveLength(1);
  });

  it("download returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.download()).toBeNull();
  });

  it("download returns null on 403", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.download()).toBeNull();
  });

  it("download throws on 500", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(500));
    const backend = new S3Backend({ bucket: "test-bucket" });
    await expect(backend.download()).rejects.toThrow("S3 GET failed");
  });

  it("exists returns true when HEAD ok", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(200));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.exists()).toBe(true);
  });

  it("exists returns false when HEAD fails", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.exists()).toBe(false);
  });

  it("delete sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(204));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.delete()).toBe(true);
  });

  it("delete returns false on failure", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new S3Backend({ bucket: "test-bucket" });
    expect(await backend.delete()).toBe(false);
  });
});

describe("HttpBackend", () => {
  beforeEach(() => mockFetch.mockReset());

  it("has correct name", () => {
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(backend.name).toBe("http");
  });

  it("upload sends PUT to /memories", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty());
    const backend = new HttpBackend({ url: "https://example.com" });
    await backend.upload(testPayload);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/memories",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("upload includes auth header when token set", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty());
    const backend = new HttpBackend({ url: "https://example.com", token: "tok123" });
    await backend.upload(testPayload);

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers.Authorization).toBe("Bearer tok123");
  });

  it("upload includes custom headers", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty());
    const backend = new HttpBackend({
      url: "https://example.com",
      headers: { "X-Custom": "value" },
    });
    await backend.upload(testPayload);

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers["X-Custom"]).toBe("value");
  });

  it("upload throws on error", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(500));
    const backend = new HttpBackend({ url: "https://example.com" });
    await expect(backend.upload(testPayload)).rejects.toThrow("HTTP PUT failed");
  });

  it("download returns payload on success", async () => {
    mockFetch.mockResolvedValueOnce(okJson(testPayload));
    const backend = new HttpBackend({ url: "https://example.com" });
    const result = await backend.download();
    expect(result).not.toBeNull();
    expect(result!.checksum).toBe("abc123");
  });

  it("download returns null on 404", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(await backend.download()).toBeNull();
  });

  it("download throws on 500", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(500));
    const backend = new HttpBackend({ url: "https://example.com" });
    await expect(backend.download()).rejects.toThrow("HTTP GET failed");
  });

  it("exists returns true when HEAD ok", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(200));
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(await backend.exists()).toBe(true);
  });

  it("exists returns false when HEAD fails", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(404));
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(await backend.exists()).toBe(false);
  });

  it("delete sends DELETE", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(204));
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(await backend.delete()).toBe(true);
  });

  it("delete returns false on failure", async () => {
    mockFetch.mockResolvedValueOnce(okEmpty(403));
    const backend = new HttpBackend({ url: "https://example.com" });
    expect(await backend.delete()).toBe(false);
  });
});
