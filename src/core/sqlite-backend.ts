import type {
  StorageBackend,
  MemoryEntry,
  MemoryId,
  SearchOptions,
  AgentId,
} from "./types.js";

/**
 * SQLite storage backend using better-sqlite3.
 * Provides fast indexed queries for large memory collections.
 */
export class SQLiteBackend implements StorageBackend {
  private db: any; // better-sqlite3 Database
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async init(): Promise<void> {
    // Dynamic import to avoid hard dependency
    const Database = (await import("better-sqlite3")).default;
    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        agent TEXT NOT NULL DEFAULT 'default',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memory_tags (
        memory_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        PRIMARY KEY (memory_id, tag),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_metadata (
        memory_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (memory_id, key),
        FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS memory_relations (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        type TEXT NOT NULL,
        PRIMARY KEY (source_id, target_id),
        FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent);
      CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
      CREATE INDEX IF NOT EXISTS idx_tags_tag ON memory_tags(tag);
    `);
  }

  async set(entry: MemoryEntry): Promise<void> {
    const upsert = this.db.prepare(`
      INSERT INTO memories (id, content, agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        agent = excluded.agent,
        updated_at = excluded.updated_at
    `);

    const deleteTags = this.db.prepare(
      "DELETE FROM memory_tags WHERE memory_id = ?"
    );
    const insertTag = this.db.prepare(
      "INSERT INTO memory_tags (memory_id, tag) VALUES (?, ?)"
    );

    const deleteMeta = this.db.prepare(
      "DELETE FROM memory_metadata WHERE memory_id = ?"
    );
    const insertMeta = this.db.prepare(
      "INSERT INTO memory_metadata (memory_id, key, value) VALUES (?, ?, ?)"
    );

    const deleteRels = this.db.prepare(
      "DELETE FROM memory_relations WHERE source_id = ?"
    );
    const insertRel = this.db.prepare(
      "INSERT INTO memory_relations (source_id, target_id, type) VALUES (?, ?, ?)"
    );

    const txn = this.db.transaction(() => {
      upsert.run(
        entry.id,
        entry.content,
        entry.agent,
        entry.createdAt.toISOString(),
        entry.updatedAt.toISOString()
      );

      // Tags
      deleteTags.run(entry.id);
      for (const tag of entry.tags) {
        insertTag.run(entry.id, tag);
      }

      // Metadata
      deleteMeta.run(entry.id);
      for (const [key, value] of Object.entries(entry.metadata)) {
        insertMeta.run(entry.id, key, JSON.stringify(value));
      }

      // Relations
      deleteRels.run(entry.id);
      for (const rel of entry.relations) {
        insertRel.run(entry.id, rel.targetId, rel.type);
      }
    });

    txn();
  }

  async get(id: MemoryId): Promise<MemoryEntry | null> {
    const row = this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get(id);
    if (!row) return null;
    return this.rowToEntry(row);
  }

  async delete(id: MemoryId): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM memories WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  async search(options: SearchOptions): Promise<MemoryEntry[]> {
    let sql = "SELECT DISTINCT m.* FROM memories m";
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.agent) {
      conditions.push("m.agent = ?");
      params.push(options.agent);
    }

    if (options.tags?.length) {
      sql += " JOIN memory_tags t ON m.id = t.memory_id";
      conditions.push(`t.tag IN (${options.tags.map(() => "?").join(",")})`);
      params.push(...options.tags);
    }

    if (options.query) {
      conditions.push("m.content LIKE ?");
      params.push(`%${options.query}%`);
    }

    if (options.from) {
      conditions.push("m.created_at >= ?");
      params.push(options.from.toISOString());
    }

    if (options.to) {
      conditions.push("m.created_at <= ?");
      params.push(options.to.toISOString());
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY m.created_at DESC";

    if (options.limit !== undefined) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }
    if (options.offset !== undefined) {
      sql += " OFFSET ?";
      params.push(options.offset);
    }

    const rows = this.db.prepare(sql).all(...params);
    return Promise.all(rows.map((row: any) => this.rowToEntry(row)));
  }

  async listByAgent(agent: AgentId): Promise<MemoryEntry[]> {
    const rows = this.db
      .prepare("SELECT * FROM memories WHERE agent = ? ORDER BY created_at DESC")
      .all(agent);
    return Promise.all(rows.map((row: any) => this.rowToEntry(row)));
  }

  async listAll(): Promise<MemoryEntry[]> {
    const rows = this.db
      .prepare("SELECT * FROM memories ORDER BY created_at DESC")
      .all();
    return Promise.all(rows.map((row: any) => this.rowToEntry(row)));
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
    }
  }

  private async rowToEntry(row: any): Promise<MemoryEntry> {
    const tags = this.db
      .prepare("SELECT tag FROM memory_tags WHERE memory_id = ?")
      .all(row.id)
      .map((r: any) => r.tag);

    const metaRows = this.db
      .prepare("SELECT key, value FROM memory_metadata WHERE memory_id = ?")
      .all(row.id);
    const metadata: Record<string, unknown> = {};
    for (const m of metaRows) {
      try {
        metadata[m.key] = JSON.parse(m.value);
      } catch {
        metadata[m.key] = m.value;
      }
    }

    const relRows = this.db
      .prepare(
        "SELECT target_id, type FROM memory_relations WHERE source_id = ?"
      )
      .all(row.id);
    const relations = relRows.map((r: any) => ({
      targetId: r.target_id,
      type: r.type as MemoryEntry["relations"][number]["type"],
    }));

    return {
      id: row.id,
      content: row.content,
      tags,
      agent: row.agent,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      metadata,
      relations,
    };
  }
}
