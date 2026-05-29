import { describe, it, expect } from "vitest";

import { normalizeThinkingConfig } from "../../open-sse/services/provider.js";

describe("normalizeThinkingConfig", () => {
  it("keeps thinking config when last role is user", () => {
    const body = {
      reasoning_effort: "high",
      thinking: { type: "enabled", budget_tokens: 2048 },
      messages: [{ role: "user", content: "Solve this" }],
    };

    const out = normalizeThinkingConfig(structuredClone(body));
    expect(out.reasoning_effort).toBe("high");
    expect(out.thinking).toEqual({ type: "enabled", budget_tokens: 2048 });
  });

  it("keeps thinking config when last role is tool", () => {
    const body = {
      reasoning_effort: "medium",
      thinking: { type: "enabled", budget_tokens: 1024 },
      messages: [
        { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "lookup", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "call_1", content: "{\"ok\":true}" },
      ],
    };

    const out = normalizeThinkingConfig(structuredClone(body));
    expect(out.reasoning_effort).toBe("medium");
    expect(out.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
  });

  it("keeps thinking config when last role is function", () => {
    const body = {
      reasoning_effort: "low",
      thinking: { type: "enabled" },
      messages: [{ role: "function", name: "search", content: "{\"result\":1}" }],
    };

    const out = normalizeThinkingConfig(structuredClone(body));
    expect(out.reasoning_effort).toBe("low");
    expect(out.thinking).toEqual({ type: "enabled" });
  });

  it("strips thinking config when last role is assistant", () => {
    const body = {
      reasoning_effort: "high",
      thinking: { type: "enabled", budget_tokens: 4096 },
      messages: [{ role: "assistant", content: "Done" }],
    };

    const out = normalizeThinkingConfig(structuredClone(body));
    expect(out.reasoning_effort).toBeUndefined();
    expect(out.thinking).toBeUndefined();
  });
});
