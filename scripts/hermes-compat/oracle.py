#!/usr/bin/env python3
"""Upstream oracle for the Hermes Agent compatibility check.

Runs NousResearch/hermes-agent's own memory code, so the check compares this
package against the real implementation at a tagged release instead of a
hand-written copy of the format. The upstream checkout is passed with
--upstream and is never vendored into this repository.

  oracle.py --upstream DIR write HOME TARGET ENTRIES_JSON
      Add each entry through upstream MemoryStore.add() (the code path the
      agent's memory tool uses) with HERMES_HOME=HOME.
  oracle.py --upstream DIR read HOME TARGET
      Print upstream's parsed entry list for TARGET as JSON.
  oracle.py --upstream DIR memdir [HOME]
      Print upstream get_memory_dir(). HOME sets HERMES_HOME; without it the
      caller's environment is used unchanged.
"""

import argparse
import json
import os
import sys

# Upstream tool limits are sized for a live prompt; the fixtures only need room.
LIMIT = 1_000_000


def load_upstream(path):
    sys.path.insert(0, os.path.abspath(path))
    from tools import memory_tool  # noqa: E402  (needs sys.path first)
    from tools.memory_tool_store import MemoryStore  # noqa: E402

    return memory_tool, MemoryStore


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--upstream", required=True)
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write")
    w.add_argument("home")
    w.add_argument("target", choices=["memory", "user"])
    w.add_argument("entries")
    r = sub.add_parser("read")
    r.add_argument("home")
    r.add_argument("target", choices=["memory", "user"])
    m = sub.add_parser("memdir")
    m.add_argument("home", nargs="?")
    args = ap.parse_args()

    if getattr(args, "home", None) is not None:
        os.environ["HERMES_HOME"] = args.home
    memory_tool, MemoryStore = load_upstream(args.upstream)

    if args.cmd == "memdir":
        print(memory_tool.get_memory_dir())
        return 0

    path = MemoryStore._path_for(args.target)
    if args.cmd == "read":
        print(json.dumps(MemoryStore._read_file(path), ensure_ascii=False))
        return 0

    with open(args.entries, encoding="utf-8") as fh:
        entries = json.load(fh)
    path.parent.mkdir(parents=True, exist_ok=True)
    store = MemoryStore(memory_char_limit=LIMIT, user_char_limit=LIMIT)
    store.load_from_disk()
    for entry in entries:
        res = store.add(args.target, entry)
        if not res.get("success"):
            print(f"upstream add() refused {entry!r}: {res}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
