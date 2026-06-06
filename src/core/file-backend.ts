import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { join, extname } from "node:path";
import matter from "gray-matter";
import type {
  StorageBackend,
  MemoryEntry,
  MemoryId,
  SearchOptions,
  AgentId,
} from "./types.js";

/**
 * File-based storage backend.
 * Each memory is stored as a .md file with YAML frontmatter.
 * Directory structure: <baseDir>/<agent>/<id>.md
 */
export class FileBackend implements StorageBackend {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async init(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });
  }

  private filePath(entry: MemoryEntry): string {
    return join(this.baseDir, entry.agent, `${entry.id}.md`);
  }

  private idFromPath(filePath: string): MemoryId {
    const name = filePath.split("/").pop() ?? "";
    return name.replace(/\.md$/, "");
  }

  async set(entry: MemoryEntry): Promise<void> {
    const dir = join(this.baseDir, entry.agent);
    await mkdir(dir, { recursive: true });

    const frontmatter = {
      id: entry.id,
      agent: entry.agent,
      tags: entry.tags,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      metadata: entry.metadata,
      relations: entry.relations,
    };

    const content = matter.stringify(entry.content, frontmatter);
    const path = this.filePath(entry);
    await writeFile(path, content, "utf-8");
  }

  async get(id: MemoryId): Promise<MemoryEntry | null> {
    // Search all agent directories for this ID
    const agents = await this.listAgentDirs();
    for (const agent of agents) {
      const path = join(this.baseDir, agent, `${id}.md`);
      try {
        const raw = await readFile(path, "utf-8");
        return this.parseFile(raw, path);
      } catch {
        continue;
      }
    }
    return null;
  }

  async delete(id: MemoryId): Promise<boolean> {
    const agents = await this.listAgentDirs();
    for (const agent of agents) {
      const path = join(this.baseDir, agent, `${id}.md`);
      try {
        await unlink(path);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async search(options: SearchOptions): Promise<MemoryEntry[]> {
    let results = await this.listAll();

    if (options.agent) {
      results = results.filter((e) => e.agent === options.agent);
    }
    if (options.tags?.length) {
      results = results.filter((e) =>
        options.tags!.some((t) => e.tags.includes(t))
      );
    }
    if (options.query) {
      const q = options.query.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(q));
    }
    if (options.from) {
      results = results.filter((e) => e.createdAt >= options.from!);
    }
    if (options.to) {
      results = results.filter((e) => e.createdAt <= options.to!);
    }

    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    return results.slice(offset, offset + limit);
  }

  async listByAgent(agent: AgentId): Promise<MemoryEntry[]> {
    const dir = join(this.baseDir, agent);
    return this.readDir(dir);
  }

  async listAll(): Promise<MemoryEntry[]> {
    const agents = await this.listAgentDirs();
    const all: MemoryEntry[] = [];
    for (const agent of agents) {
      const entries = await this.readDir(join(this.baseDir, agent));
      all.push(...entries);
    }
    return all;
  }

  async close(): Promise<void> {
    // No resources to release for file backend
  }

  private async listAgentDirs(): Promise<string[]> {
    try {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async readDir(dir: string): Promise<MemoryEntry[]> {
    try {
      const files = await readdir(dir);
      const mdFiles = files.filter((f) => extname(f) === ".md");
      const entries: MemoryEntry[] = [];
      for (const file of mdFiles) {
        try {
          const raw = await readFile(join(dir, file), "utf-8");
          entries.push(this.parseFile(raw, join(dir, file)));
        } catch {
          continue;
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  private parseFile(raw: string, _path: string): MemoryEntry {
    const { data, content } = matter(raw);
    return {
      id: data.id ?? this.idFromPath(_path),
      content: content.trim(),
      tags: data.tags ?? [],
      agent: data.agent ?? "default",
      createdAt: new Date(data.createdAt ?? Date.now()),
      updatedAt: new Date(data.updatedAt ?? Date.now()),
      metadata: data.metadata ?? {},
      relations: data.relations ?? [],
    };
  }
}
