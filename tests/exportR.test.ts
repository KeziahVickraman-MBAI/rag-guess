import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { exportQuestionsR, rString } from "../src/lib/exportR";
import { emptyCard } from "../src/lib/schema";
import { emptyPerson } from "../src/lib/store";
import type { PersonState } from "../src/lib/types";

const person = (personId: 1 | 2 | 3 | 4, qs: string[] | null): PersonState => ({
  ...emptyPerson(personId),
  questions: (qs ?? []).map((question) => ({ question, answer: "" })),
  card: qs ? { ...emptyCard(), guess: "g" } : null,
});

const persons = [
  person(1, ['Which "primary" segment?', "Path C:\\data\\x?", "Two\nlines?"]),
  person(2, ["Tamil: தமிழ், Swahili: Habari, arrow ↔", "  ", ""]),
  person(3, []),
  person(4, null),
];

function hasRscript(): boolean {
  try { execFileSync("Rscript", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

describe("R export", () => {
  it("escapes quotes, backslashes and newlines", () => {
    expect(rString('a "b" \\ c\nd')).toBe('"a \\"b\\" \\\\ c d"');
  });

  it("matches the snapshot", () => {
    expect(exportQuestionsR(persons, "board_a.csv", new Date("2026-10-06T10:00:00Z"))).toMatchSnapshot();
  });

  it.runIf(hasRscript())("sources cleanly in R and round-trips the strings", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmc-r-"));
    const file = join(dir, "questions.R");
    writeFileSync(file, exportQuestionsR(persons, "board_a.csv"), "utf8");
    const out = execFileSync("Rscript", ["-e", `
      source(${JSON.stringify(file)}, encoding = "UTF-8")
      cat(length(all_questions), "\\n")
      cat(length(rag_questions$person_3), length(rag_questions$person_4), "\\n")
      writeLines(enc2utf8(all_questions))
    `], { encoding: "utf8" });
    const lines = out.trim().split("\n");
    expect(lines[0].trim()).toBe("4");
    expect(lines[1].trim()).toBe("0 0");
    expect(lines.slice(2)).toEqual([
      'Which "primary" segment?', "Path C:\\data\\x?", "Two lines?", "Tamil: தமிழ், Swahili: Habari, arrow ↔",
    ]);
  });
});
