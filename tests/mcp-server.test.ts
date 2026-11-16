/**
 * Tests for the MCP stdio server (src/integrations/mcp.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MemoryMcpServer,
  serveMcpStdio,
  MCP_PROTOCOL_VERSIONS,
  JSON_RPC_ERRORS,
  type JsonRpcResponse,
} from "../src/index.js";
import { MemoryStore } from "../src/core/memory-store.js";
import { FileBackend } from "../src/core/file-backend.js";
import { ClaudeAdapter } from "../src/integrations/claude.js";

describe("MemoryMcpServer", () => {
  let tempDir: string;
  let store: MemoryStore;
  let server: MemoryMcpServer;
  let nextId = 1;

  const request = (method: string, params?: unknown) =>
    server.handleMessage({ jsonrpc: "2.0", id: nextId++, method, params }) as Promise<JsonRpcResponse>;
  const callTool = async (name: string, args?: unknown) =>
    (await request("tools/call", { name, arguments: args })).result as {
      content: Array<{ type: string; text: string }>;
      isError?: boolean;
    };

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "mcp-server-test-"));
    store = new MemoryStore(new FileBackend(tempDir));
    await store.init();
    server = new MemoryMcpServer(store, { serverInfo: { name: "test-server", version: "9.9.9" } });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("initialize", () => {
    it("echoes a supported protocol version and reports tools + server info", async () => {
      const requested = MCP_PROTOCOL_VERSIONS[MCP_PROTOCOL_VERSIONS.length - 1];
      const res = await request("initialize", { protocolVersion: requested, capabilities: {} });
      expect(res.result).toEqual({
        protocolVersion: requested,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "test-server", version: "9.9.9" },
      });
    });

    it("answers an unsupported version with the newest supported one", async () => {
      const res = await request("initialize", { protocolVersion: "1999-01-01" });
      expect((res.result as { protocolVersion: string }).protocolVersion).toBe(MCP_PROTOCOL_VERSIONS[0]);
    });

    it("uses default server info when none is given", async () => {
      const res = await new MemoryMcpServer(store).handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize" });
      expect((res?.result as { serverInfo: { name: string } }).serverInfo.name).toBe("hermes-memory-engine");
    });
  });

  it("answers ping with an empty result", async () => {
    expect((await request("ping")).result).toEqual({});
  });

  it("does not reply to notifications", async () => {
    await expect(
      server.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })
    ).resolves.toBeUndefined();
  });

  it("lists the same tools and schemas as the Claude adapter", async () => {
    const res = await request("tools/list");
    const tools = (res.result as { tools: Array<{ name: string; inputSchema: unknown }> }).tools;
    const claude = new ClaudeAdapter({ apiKey: "unused" }).getToolSchemas();
    expect(tools.map((t) => t.name)).toEqual(["memory_add", "memory_search", "memory_list"]);
    expect(tools.map((t) => t.inputSchema)).toEqual(claude.map((t) => t.input_schema));
  });

  it("adds a memory with memory_add and finds it with memory_search and memory_list", async () => {
    const added = await callTool("memory_add", { content: "User prefers dark mode", tags: ["ui"] });
    expect(added.isError).toBeUndefined();
    const { id } = JSON.parse(added.content[0].text) as { id: string };
    expect(id).toBeTruthy();

    const found = JSON.parse((await callTool("memory_search", { query: "dark mode" })).content[0].text);
    expect(found.results.map((m: { id: string }) => m.id)).toContain(id);

    const listed = JSON.parse((await callTool("memory_list")).content[0].text);
    expect(listed.memories).toHaveLength(1);
    expect(readdirSync(tempDir, { recursive: true }).some((f) => String(f).endsWith(".md"))).toBe(true);
  });

  it("reports memory_add without content as a tool error, not a protocol error", async () => {
    const res = await request("tools/call", { name: "memory_add", arguments: {} });
    expect(res.error).toBeUndefined();
    const result = res.result as { content: Array<{ text: string }>; isError: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/content/);
    expect(await store.search({})).toHaveLength(0);
  });

  describe("errors", () => {
    it("rejects an unknown method with -32601", async () => {
      const res = await request("resources/list");
      expect(res.error?.code).toBe(JSON_RPC_ERRORS.methodNotFound);
    });

    it("rejects an unknown tool with -32602", async () => {
      const res = await request("tools/call", { name: "memory_delete_all", arguments: {} });
      expect(res.error?.code).toBe(JSON_RPC_ERRORS.invalidParams);
    });

    it("rejects tools/call without a tool name with -32602", async () => {
      expect((await request("tools/call", {})).error?.code).toBe(JSON_RPC_ERRORS.invalidParams);
    });

    it("rejects non-object tool arguments with -32602", async () => {
      const res = await request("tools/call", { name: "memory_add", arguments: "just a string" });
      expect(res.error?.code).toBe(JSON_RPC_ERRORS.invalidParams);
    });

    it("rejects messages that are not JSON-RPC 2.0 requests with -32600", async () => {
      for (const bad of [[], "text", { id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1 }, { jsonrpc: "2.0", id: {}, method: "ping" }]) {
        const res = await server.handleMessage(bad);
        expect(res?.error?.code).toBe(JSON_RPC_ERRORS.invalidRequest);
      }
      const keepsId = await server.handleMessage({ jsonrpc: "1.0", id: 7, method: "ping" });
      expect(keepsId?.id).toBe(7);
    });

    it("answers a line that is not JSON with -32700", async () => {
      const reply = JSON.parse((await server.handleLine("{not json")) as string);
      expect(reply).toMatchObject({ id: null, error: { code: JSON_RPC_ERRORS.parseError } });
    });

    it("reports a failing store as a tool error result", async () => {
      const broken = { search: async () => Promise.reject(new Error("disk gone")) } as unknown as MemoryStore;
      const res = await new MemoryMcpServer(broken).handleMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "memory_list" },
      });
      expect(res?.result).toEqual({ content: [{ type: "text", text: "disk gone" }], isError: true });
    });
  });

  it("serves newline-delimited JSON-RPC over streams, in order", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on("data", (c) => chunks.push(String(c)));
    const done = serveMcpStdio(store, { input, output });
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"memory_add","arguments":{"content":"from stdio"}}}\n');
    input.end('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"memory_search","arguments":{"query":"stdio"}}}\n');
    await done;
    const replies = chunks.join("").trim().split("\n").map((l) => JSON.parse(l));
    expect(replies.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(replies[0].result.protocolVersion).toBe("2025-06-18");
    expect(replies[2].result.content[0].text).toContain("from stdio");
  });
});
