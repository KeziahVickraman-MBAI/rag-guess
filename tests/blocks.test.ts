import { describe, expect, it } from "vitest";
import { guessBlock, matchBlockTag } from "../src/lib/blocks";

describe("matchBlockTag", () => {
  it.each([
    ["key_partners", "key_partners"],
    ["Key Partners", "key_partners"],
    ["VALUE PROPOSITIONS", "value_propositions"],
    ["VP", "value_propositions"],
    ["Customer-Segments", "customer_segments"],
    ["Board A, Revenue Streams", "revenue_streams"],
    ["costs", "cost_structure"],
  ])("%s → %s", (tag, block) => {
    expect(matchBlockTag(tag)).toBe(block);
  });

  it("returns null for unrelated tags", () => {
    expect(matchBlockTag("Board A")).toBeNull();
    expect(matchBlockTag("")).toBeNull();
  });
});

describe("guessBlock", () => {
  it.each([
    ["Monthly subscriptions: Starter SGD 39", "revenue_streams"],
    ["Hosting on Vercel: SGD 0–30 monthly", "cost_structure"],
    ["Primary: independent sports bars", "customer_segments"],
    ["Self-service onboarding for the Starter plan", "customer_relationships"],
    ["Beverage distributor for venue introductions", "key_partners"],
  ])("%s → %s", (text, block) => {
    expect(guessBlock(text)).toBe(block);
  });

  it("returns unknown when nothing matches", () => {
    expect(guessBlock("Lorem ipsum")).toBe("unknown");
  });
});
