import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  promoteAll,
  recoverInterruptedPromotions,
  type Promotion,
  type PromotionRoots,
} from "./ingest";

/**
 * Fault-injection coverage for the promote/recover pair (plan gate: prove the
 * old cache survives a death mid-promotion). Each test builds a throwaway data
 * dir, drives promotion into a specific failure, and asserts on the bytes left
 * on disk — never on what the code says it did.
 */

const scratchDirs: string[] = [];

async function makeRoots(): Promise<PromotionRoots> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "ingest-promotion-"));
  scratchDirs.push(dataDir);
  return { dataDir, backupRoot: path.join(dataDir, ".backups") };
}

after(async () => {
  for (const dir of scratchDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writeSeason(
  dir: string,
  marker: string,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "rosters.json"), JSON.stringify([marker]));
}

async function readMarker(dir: string): Promise<string> {
  const raw = await readFile(path.join(dir, "rosters.json"), "utf8");
  return (JSON.parse(raw) as string[])[0]!;
}

function plan(roots: PromotionRoots, runId: string, name: string): Promotion {
  return {
    label: name,
    staged: path.join(roots.dataDir, ".staging", runId, name),
    live: path.join(roots.dataDir, name),
    backup: path.join(roots.backupRoot, runId, name),
  };
}

describe("promoteAll", () => {
  it("a failure mid-promotion rolls the earlier swaps back and the live cache survives", async () => {
    const roots = await makeRoots();
    const good = plan(roots, "run1", "league-cache/2024");
    const bad = plan(roots, "run1", "league-cache/2025");
    await writeSeason(good.live, "2024-old");
    await writeSeason(good.staged, "2024-new");
    await writeSeason(bad.live, "2025-old");
    // bad.staged deliberately does not exist: its rename throws after the good
    // item has already swapped, which is the crash point that matters.

    await assert.rejects(promoteAll("run1", [good, bad], roots));

    assert.equal(await readMarker(good.live), "2024-old");
    assert.equal(await readMarker(bad.live), "2025-old");
  });

  it("promotes everything and clears the parked copies when nothing fails", async () => {
    const roots = await makeRoots();
    const p = plan(roots, "run2", "league-cache/2024");
    await writeSeason(p.live, "old");
    await writeSeason(p.staged, "new");

    await promoteAll("run2", [p], roots);

    assert.equal(await readMarker(p.live), "new");
    const leftover = await readdir(roots.backupRoot).catch(() => []);
    assert.deepEqual(leftover, []);
  });
});

describe("recoverInterruptedPromotions", () => {
  it("puts back a season parked by a run killed between park and move", async () => {
    const roots = await makeRoots();
    // Crash point: live was renamed into .backups, staging never moved in.
    const runDir = path.join(roots.backupRoot, "run3");
    const backup = path.join(runDir, "league-cache-2025");
    await writeSeason(backup, "only-copy");
    await mkdir(path.join(roots.dataDir, "league-cache"), { recursive: true });
    await writeFile(
      path.join(runDir, "journal.json"),
      JSON.stringify([
        {
          label: "league-cache/2025",
          liveRel: "league-cache/2025",
          backupRel: path.relative(roots.dataDir, backup),
        },
      ]),
    );

    await recoverInterruptedPromotions(roots);

    assert.equal(
      await readMarker(path.join(roots.dataDir, "league-cache", "2025")),
      "only-copy",
    );
    const leftover = await readdir(roots.backupRoot).catch(() => []);
    assert.deepEqual(leftover, []);
  });

  it("discards the parked copy when the item had already finished swapping", async () => {
    const roots = await makeRoots();
    const runDir = path.join(roots.backupRoot, "run4");
    const backup = path.join(runDir, "league-cache-2025");
    const live = path.join(roots.dataDir, "league-cache", "2025");
    await writeSeason(backup, "superseded");
    await writeSeason(live, "promoted");
    await writeFile(
      path.join(runDir, "journal.json"),
      JSON.stringify([
        {
          liveRel: "league-cache/2025",
          backupRel: path.relative(roots.dataDir, backup),
        },
      ]),
    );

    await recoverInterruptedPromotions(roots);

    assert.equal(await readMarker(live), "promoted");
    const leftover = await readdir(roots.backupRoot).catch(() => []);
    assert.deepEqual(leftover, []);
  });

  it("leaves a run dir alone when its journal is not an array of entries", async () => {
    const roots = await makeRoots();
    const runDir = path.join(roots.backupRoot, "run5");
    await writeSeason(path.join(runDir, "league-cache-2025"), "only-copy");
    await writeFile(path.join(runDir, "journal.json"), "null");

    await recoverInterruptedPromotions(roots);

    assert.equal(
      await readMarker(path.join(runDir, "league-cache-2025")),
      "only-copy",
    );
  });

  it("refuses journal entries that resolve outside the data dir", async () => {
    const roots = await makeRoots();
    const runDir = path.join(roots.backupRoot, "run6");
    const backup = path.join(runDir, "league-cache-2025");
    await writeSeason(backup, "parked");
    await writeFile(
      path.join(runDir, "journal.json"),
      JSON.stringify([
        {
          liveRel: "../../outside-the-repo",
          backupRel: path.relative(roots.dataDir, backup),
        },
      ]),
    );

    await recoverInterruptedPromotions(roots);

    // Nothing moved: the parked copy is still parked, and the escape target
    // was never created.
    assert.equal(await readMarker(backup), "parked");
    const escaped = path.resolve(roots.dataDir, "../../outside-the-repo");
    await assert.rejects(readFile(escaped, "utf8"));
  });
});
