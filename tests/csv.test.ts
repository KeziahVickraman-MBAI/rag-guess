import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EmptyCsvError, parseMiroCsv, stripHtml, unknownShare } from "../src/lib/csv";

const sample = (f: string): string => readFileSync(new URL(`../public/samples/${f}`, import.meta.url), "utf8");

describe("parseMiroCsv", () => {
  it("reads a Content,Tags header and maps tags to blocks", () => {
    const r = parseMiroCsv(sample("board_a_screening.csv"));
    expect(r.hasHeader).toBe(true);
    expect(r.textColumn).toBe("Content");
    expect(r.tagColumn).toBe("Tags");
    expect(r.notes).toHaveLength(34);
    expect(r.notes[0]).toEqual({
      id: "N01", text: "Sports data APIs (football-data.org and TheSportsDB) as data providers", block: "key_partners", included: true,
    });
    expect(r.notes.every((n) => n.block !== "unknown")).toBe(true);
    expect(r.notes.at(-1)?.id).toBe("N34");
  });

  it("handles a headerless single-column CSV and falls back to the keyword heuristic", () => {
    const r = parseMiroCsv(sample("board_headerless.csv"));
    expect(r.hasHeader).toBe(false);
    expect(r.tagColumn).toBeNull();
    expect(r.notes).toHaveLength(43);
    expect(r.notes[0].text).toBe("ISRIC SoilGrids & iSDAsoil providers");
    expect(r.notes[0].block).toBe("key_partners");
  });

  it("keeps quoted commas inside one cell", () => {
    const r = parseMiroCsv('Text,Tag\n"Fetch fixtures, standings, and badges",Key Activities\n');
    expect(r.notes).toEqual([{ id: "N01", text: "Fetch fixtures, standings, and badges", block: "key_activities", included: true }]);
  });

  it("strips HTML, trims whitespace and drops empty rows", () => {
    const r = parseMiroCsv('Content\n"<p>Hello <b>bars</b>&amp; pubs</p>"\n"   "\n\n"  spaced  "\n');
    expect(r.notes.map((n) => n.text)).toEqual(["Hello bars& pubs", "spaced"]);
  });

  it("detects a tag column by its values when the header names are unusual", () => {
    const r = parseMiroCsv("Sticky,Where\nSubscriptions at SGD 39,Revenue Streams\nSports bars,Customer Segments\n");
    expect(r.textColumn).toBe("Sticky");
    expect(r.tagColumn).toBe("Where");
    expect(r.notes.map((n) => n.block)).toEqual(["revenue_streams", "customer_segments"]);
  });

  it("prefers Content over Title and handles an extra ID column", () => {
    const r = parseMiroCsv("ID,Title,Content,Tags\n1,,Daily SMS advisories,Channels\n");
    expect(r.notes[0].text).toBe("Daily SMS advisories");
    expect(r.notes[0].block).toBe("channels");
  });

  it("throws EmptyCsvError for empty input", () => {
    expect(() => parseMiroCsv("")).toThrow(EmptyCsvError);
    expect(() => parseMiroCsv("Content,Tags\n,\n")).toThrow(EmptyCsvError);
  });

  it("computes the share of unknown included notes", () => {
    expect(unknownShare([
      { id: "N01", text: "a", block: "unknown", included: true },
      { id: "N02", text: "b", block: "channels", included: true },
      { id: "N03", text: "c", block: "unknown", included: false },
    ])).toBe(0.5);
  });
});

describe("stripHtml", () => {
  it("turns breaks into spaces and decodes entities", () => {
    expect(stripHtml("a<br/>b &lt;c&gt; &quot;d&quot;")).toBe('a b <c> "d"');
  });
});
