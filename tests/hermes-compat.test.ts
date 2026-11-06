/**
 * Offline compatibility check against Hermes Agent memory files.
 *
 * Every folder under tests/fixtures/hermes/<tag>/ holds MEMORY.md and USER.md
 * written by NousResearch/hermes-agent's own code at that tag (see
 * tests/fixtures/hermes/README.md), plus expected.json with the entries it was
 * given. Adding a tested release = adding a folder; this suite picks it up.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HermesMemoryAdapter, type HermesTarget } from "../src/integrations/hermes.js";

const root = fileURLToPath(new URL("./fixtures/hermes/", import.meta.url));
const versions = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const files: Record<HermesTarget, string> = { memory: "MEMORY.md", user: "USER.md" };

describe("Hermes Agent fixtures", () => {
  it("has at least one tested release", () => {
    expect(versions.length).toBeGreaterThan(0);
  });

  describe.each(versions)("%s", (version) => {
    const dir = join(root, version);
    const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf-8")) as Record<HermesTarget, string[]>;
    const adapter = new HermesMemoryAdapter({ hermesHome: dir });

    describe.each(["memory", "user"] as HermesTarget[])("%s", (target) => {
      const raw = readFileSync(join(dir, files[target]), "utf-8");

      it("parses to the entries Hermes was given", () => {
        expect(adapter.parseHermesMemory(raw, target).map((e) => e.content)).toEqual(expected[target]);
      });

      it("serializes back byte-for-byte", () => {
        const entries = adapter.parseHermesMemory(raw, target).map((e, i) => ({
          ...e,
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        }));
        expect(adapter.serializeToHermesFormat(entries, target)).toBe(raw);
      });
    });
  });
});
