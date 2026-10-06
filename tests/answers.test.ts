import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { answerIds, importAnswersCsv, parsePersonId } from "../src/lib/answers";
import { exportQuestionsR } from "../src/lib/exportR";
import { emptyPerson } from "../src/lib/store";
import type { PersonState } from "../src/lib/types";

const withQs = (id: 1 | 2 | 3 | 4, qs: string[]): PersonState =>
  ({ ...emptyPerson(id), questions: qs.map((question) => ({ question, answer: "" })) });
const persons = (): PersonState[] => [
  withQs(1, ["Which segment is primary?", 'What does "Pro" include?']),
  withQs(2, ["What is the main value?"]),
  withQs(3, ["How much is the Starter plan?"]),
  withQs(4, []),
];

describe("parsePersonId", () => {
  it.each([["person_2", 2], ["3", 3], ["Person 4", 4], ["Value Hunter", 2], ["value hunter", 2], ["nobody", null], ["", null]])(
    "%s → %s", (raw, id) => expect(parsePersonId(raw)).toBe(id));
});

describe("importAnswersCsv", () => {
  it("matches person,question,answer rows, tolerating case and punctuation in the question", () => {
    const r = importAnswersCsv(
      'person,question,answer\nperson_1,"which segment is primary",Sports bars\nperson_2,What is the main value?,"Fill seats, save time"\n',
      persons(),
    );
    expect(r).toMatchObject({ matched: 2, added: 0, unmatched: 0 });
    expect(r.persons[0].questions[0].answer).toBe("Sports bars");
    expect(r.persons[1].questions[0].answer).toBe("Fill seats, save time");
    expect(r.persons[0].questions[1].answer).toBe("");
  });

  it("finds the right person by question text when there is no person column", () => {
    const r = importAnswersCsv("question,answer\nHow much is the Starter plan?,SGD 39\n", persons());
    expect(r.persons[2].questions[0].answer).toBe("SGD 39");
  });

  it("appends a new question for a known person, counts rows it can't place, and treats NA as no answer", () => {
    const r = importAnswersCsv(
      "person,question,answer\n4,Who are the partners?,Data APIs\n,Unknown question?,x\n1,Which segment is primary?,NA\n",
      persons(),
    );
    expect(r).toMatchObject({ matched: 1, added: 1, unmatched: 1 });
    expect(r.persons[3].questions).toEqual([{ question: "Who are the partners?", answer: "Data APIs" }]);
    expect(r.persons[0].questions[0].answer).toBe("");
  });

  it("does not mutate the persons it was given", () => {
    const before = persons();
    importAnswersCsv("person,question,answer\n1,Which segment is primary?,Bars\n", before);
    expect(before[0].questions[0].answer).toBe("");
  });

  it("rejects a file where nothing matches", () => {
    expect(() => importAnswersCsv("question,answer\nNothing?,No\n", persons())).toThrow(/None of the rows/);
    expect(() => importAnswersCsv("", persons())).toThrow(/empty/);
  });

  it("numbers answer IDs over answered questions only", () => {
    const p = { ...withQs(1, ["a", "b", "c"]) };
    p.questions[0].answer = "x";
    p.questions[2].answer = "y";
    expect(answerIds(p)).toEqual(["A1", "A2"]);
  });
});

function hasRscript(): boolean {
  try { execFileSync("Rscript", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

describe.runIf(hasRscript())("R round trip", () => {
  it("questions.R → R writes answers.csv with the documented snippet → app imports every answer", () => {
    const dir = mkdtempSync(join(tmpdir(), "bmc-answers-"));
    const qfile = join(dir, "questions.R");
    const afile = join(dir, "answers.csv");
    const start = persons();
    start[1].questions.push({ question: "Tamil: தமிழ் ↔ Swahili?", answer: "" });
    writeFileSync(qfile, exportQuestionsR(start, "board.csv"), "utf8");
    // The commented snippet at the end of questions.R, with a stand-in RAG.
    execFileSync("Rscript", ["-e", `
      setwd(${JSON.stringify(dir)})
      source("questions.R", encoding = "UTF-8")
      my_rag <- function(q) paste0("RAG says: ", q, ", with \\"quotes\\"")
      answers <- vapply(all_questions, my_rag, character(1))
      write.csv(data.frame(person = rep(names(rag_questions), lengths(rag_questions)),
                           question = all_questions, answer = answers),
                "answers.csv", row.names = FALSE, fileEncoding = "UTF-8")
    `]);
    const r = importAnswersCsv(readFileSync(afile, "utf8"), start);
    expect(r).toMatchObject({ matched: 5, added: 0, unmatched: 0 });
    expect(r.persons[0].questions[1].answer).toBe('RAG says: What does "Pro" include?, with "quotes"');
    expect(r.persons[1].questions[1].answer).toBe('RAG says: Tamil: தமிழ் ↔ Swahili?, with "quotes"');
  });
});
