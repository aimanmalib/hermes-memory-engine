/**
 * Model Context Protocol (MCP) server over stdio.
 *
 * Exposes the same memory tools as the OpenAI and Claude adapters
 * (`memory_add`, `memory_search`, `memory_list`) to any MCP client.
 * Messages are newline-delimited JSON-RPC 2.0. Only stdout carries protocol
 * messages; anything human-readable belongs on stderr.
 */

import { createInterface } from "node:readline";
import type { MemoryStore } from "../core/memory-store.js";
import { memoryToolSchemas, runMemoryTool, type MemoryToolArgs } from "./memory-tools.js";

/**
 * Protocol versions this server negotiates, newest first. An `initialize`
 * request for one of these gets it echoed back; any other version gets the
 * first entry.
 */
export const MCP_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface McpServerInfo {
  name: string;
  version: string;
}

export interface McpServerOptions {
  /** Name and version reported in the `initialize` result */
  serverInfo?: Partial<McpServerInfo>;
}

type JsonRpcId = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string };
}

/** Standard JSON-RPC 2.0 error codes used by the server. */
export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
} as const;

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Transport-independent MCP request handler for a memory store. */
export class MemoryMcpServer {
  private readonly serverInfo: McpServerInfo;

  constructor(private readonly store: MemoryStore, options: McpServerOptions = {}) {
    this.serverInfo = {
      name: options.serverInfo?.name ?? "hermes-memory-engine",
      version: options.serverInfo?.version ?? "unknown",
    };
  }

  /** Handles one parsed JSON-RPC message. Returns `undefined` for notifications. */
  async handleMessage(message: unknown): Promise<JsonRpcResponse | undefined> {
    const rawId = isObject(message) ? message.id : undefined;
    const validId = rawId === undefined || typeof rawId === "string" || typeof rawId === "number";
    if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" || !validId) {
      return this.error(validId && rawId !== undefined ? rawId : null, JSON_RPC_ERRORS.invalidRequest, "Invalid Request");
    }
    const id = message.id as string | number | undefined;
    if (id === undefined) return undefined; // notifications need no reply
    try {
      const result = await this.dispatch(message.method, message.params);
      return { jsonrpc: "2.0", id, result };
    } catch (err) {
      if (err instanceof RpcError) return this.error(id, err.code, err.message);
      throw err;
    }
  }

  /** Parses one line of input and handles it. Returns the reply line, if any. */
  async handleLine(line: string): Promise<string | undefined> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return JSON.stringify(this.error(null, JSON_RPC_ERRORS.parseError, "Parse error"));
    }
    const response = await this.handleMessage(message);
    return response && JSON.stringify(response);
  }

  private error(id: JsonRpcId, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: memoryToolSchemas().map(({ name, description, input_schema }) => ({
            name,
            description,
            inputSchema: input_schema,
          })),
        };
      case "tools/call":
        return this.callTool(params);
      default:
        throw new RpcError(JSON_RPC_ERRORS.methodNotFound, `Method not found: ${method}`);
    }
  }

  private initialize(params: unknown) {
    const requested = isObject(params) ? params.protocolVersion : undefined;
    const supported: readonly string[] = MCP_PROTOCOL_VERSIONS;
    return {
      protocolVersion:
        typeof requested === "string" && supported.includes(requested) ? requested : supported[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: this.serverInfo,
    };
  }

  private async callTool(params: unknown) {
    if (!isObject(params) || typeof params.name !== "string") {
      throw new RpcError(JSON_RPC_ERRORS.invalidParams, "tools/call requires a tool 'name'");
    }
    const { name, arguments: args = {} } = params;
    if (!memoryToolSchemas().some((tool) => tool.name === name)) {
      throw new RpcError(JSON_RPC_ERRORS.invalidParams, `Unknown tool: ${name}`);
    }
    if (!isObject(args)) {
      throw new RpcError(JSON_RPC_ERRORS.invalidParams, "tools/call 'arguments' must be an object");
    }
    try {
      const result = await runMemoryTool(name, args as MemoryToolArgs, this.store);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      // Tool failures are reported to the model as a result, not a protocol error.
      const text = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text }], isError: true };
    }
  }
}

export interface McpStdioOptions extends McpServerOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Serves a memory store over stdio until the input stream ends. Requests are
 * handled one at a time, in arrival order.
 */
export async function serveMcpStdio(store: MemoryStore, options: McpStdioOptions = {}): Promise<void> {
  const server = new MemoryMcpServer(store, options);
  const output = options.output ?? process.stdout;
  const lines = createInterface({ input: options.input ?? process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    const reply = await server.handleLine(line);
    if (reply !== undefined) output.write(`${reply}\n`);
  }
}
