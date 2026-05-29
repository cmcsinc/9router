import { describe, it, expect } from "vitest";

import { injectReasoningContent } from "../../open-sse/utils/reasoningContentInjector.js";

describe("injectReasoningContent", () => {
  it("injects placeholder reasoning_content for Xiaomi MiMo assistant history", () => {
    const body = {
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "assistant", content: "Earlier answer" },
        { role: "user", content: "Continue" },
      ],
    };

    const out = injectReasoningContent({
      provider: "xiaomi-mimo",
      model: "mimo-v2.5",
      body,
    });

    expect(out.messages[1].reasoning_content).toBe(" ");
    expect(out.messages[0].reasoning_content).toBeUndefined();
    expect(out.messages[2].reasoning_content).toBeUndefined();
  });

  it("preserves existing Xiaomi reasoning_content", () => {
    const body = {
      messages: [{ role: "assistant", content: "A", reasoning_content: "kept" }],
    };

    const out = injectReasoningContent({
      provider: "xiaomi-tokenplan",
      model: "mimo-v2.5-pro",
      body,
    });

    expect(out.messages[0].reasoning_content).toBe("kept");
  });

  it("does not inject Xiaomi placeholder for other providers", () => {
    const body = {
      messages: [{ role: "assistant", content: "A" }],
    };

    const out = injectReasoningContent({
      provider: "openai",
      model: "gpt-4.1",
      body,
    });

    expect(out.messages[0].reasoning_content).toBeUndefined();
  });
});
