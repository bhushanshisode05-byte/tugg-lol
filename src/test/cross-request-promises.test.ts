import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// The hosting runtime drops a promise settled after the request that created it ends, so a
// pending promise kept at module level and awaited by a later request hangs that page.
function serverFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return serverFiles(path);
    return /\.(server|functions)\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("server code keeps no promise across requests", () => {
  it("no module-level variable or cache holds a promise", () => {
    const offenders = serverFiles("src/lib").flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => /^(export )?(let|const|var) \w+[^=]*(Promise<|=\s*new Map<[^>]*Promise)/.test(line))
        .map(({ at }) => at),
    );
    expect(offenders).toEqual([]);
  });
});
