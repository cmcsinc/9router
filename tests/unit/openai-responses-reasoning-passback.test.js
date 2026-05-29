import { describe, it, expect } from "vitest";

import { openaiResponsesToOpenAIRequest } from "../../open-sse/translator/request/openai-responses.js";
import { convertResponsesApiFormat } from "../../open-sse/translator/helpers/responsesApiHelper.js";

describe("Responses reasoning_content passback", () => {
  it("attaches reasoning item text to assistant tool-call history message", () => {
    const body = {
      model: "mimo-v2.5",
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Check weather and time" }],
        },
        {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "Need weather and current time." }],
        },
        {
          type: "function_call",
          call_id: "call_1",
          name: "get_weather",
          arguments: "{\"location\":\"Beijing\"}",
        },
        {
          type: "function_call_output",
          call_id: "call_1",
          output: "{\"weather\":\"Sunny 25C\"}",
        },
      ],
    };

    const out = openaiResponsesToOpenAIRequest("mimo-v2.5", structuredClone(body), true);
    const assistantWithToolCall = out.messages.find(
      (msg) => msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0,
    );

    expect(assistantWithToolCall).toBeTruthy();
    expect(assistantWithToolCall.reasoning_content).toContain("Need weather and current time.");
  });

  it("merges multiple reasoning items before function_call", () => {
    const body = {
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Compare weather" }],
        },
        { type: "reasoning", text: "Already know Beijing weather. " },
        { type: "reasoning", summary: [{ text: "Only need Shanghai now." }] },
        {
          type: "function_call",
          call_id: "call_2",
          name: "get_weather",
          arguments: "{\"location\":\"Shanghai\"}",
        },
      ],
    };

    const out = openaiResponsesToOpenAIRequest("mimo-v2.5", structuredClone(body), true);
    const assistantWithToolCall = out.messages.find(
      (msg) => msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0,
    );

    expect(assistantWithToolCall.reasoning_content).toBe("Already know Beijing weather. Only need Shanghai now.");
  });

  it("keeps reasoning_content in helper conversion path too", () => {
    const body = {
      input: [
        {
          type: "reasoning",
          content: [{ type: "summary_text", text: "Reason before tool call." }],
        },
        {
          type: "function_call",
          call_id: "call_3",
          name: "lookup",
          arguments: "{}",
        },
      ],
    };

    const out = convertResponsesApiFormat(structuredClone(body));
    const assistantWithToolCall = out.messages.find(
      (msg) => msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0,
    );

    expect(assistantWithToolCall.reasoning_content).toBe("Reason before tool call.");
  });
});
