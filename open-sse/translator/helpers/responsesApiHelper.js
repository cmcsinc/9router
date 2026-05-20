/**
 * Normalize Responses API input to array format.
 * Accepts string or array, returns array of message items.
 * An empty array is treated like an empty string — providers require at least one user
 * message, so we inject a placeholder rather than forwarding an empty messages[].
 * @param {string|Array} input - raw input from Responses API body
 * @returns {Array|null} normalized array or null if invalid
 */
export function normalizeResponsesInput(input) {
  if (typeof input === "string") {
    const text = input.trim() === "" ? "..." : input;
    return [{ type: "message", role: "user", content: [{ type: "input_text", text }] }];
  }
  if (Array.isArray(input)) {
    // Empty input[] would produce messages:[] which all providers reject (#389)
    if (input.length === 0) {
      return [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }
    return input;
  }
  return null;
}

/**
 * Extract plain reasoning text from a Responses API `reasoning` item.
 * Supports common shapes observed across clients/providers:
 * - { type: "reasoning", text: "..." }
 * - { type: "reasoning", summary: "..." }
 * - { type: "reasoning", summary: [{ text: "..." }, ...] }
 * - { type: "reasoning", content: [{ type: "summary_text", text: "..." }, ...] }
 */
export function extractReasoningTextFromResponsesItem(item) {
  if (!item || item.type !== "reasoning") return "";

  const parts = [];
  const pushText = (value) => {
    if (typeof value === "string" && value.length > 0) parts.push(value);
  };

  pushText(item.reasoning_content);
  pushText(item.text);
  pushText(item.summary);

  if (Array.isArray(item.summary)) {
    for (const entry of item.summary) {
      if (typeof entry === "string") {
        pushText(entry);
      } else {
        pushText(entry?.text);
        pushText(entry?.content);
      }
    }
  }

  if (Array.isArray(item.content)) {
    for (const entry of item.content) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.type === "summary_text" || entry.type === "reasoning_text" || entry.type === "text" || entry.type === "output_text") {
        pushText(entry.text);
      } else {
        pushText(entry.text);
      }
    }
  }

  return parts.join("");
}

/**
 * Convert OpenAI Responses API format to standard chat completions format
 * Responses API uses: { input: [...], instructions: "..." }
 * Chat API uses: { messages: [...] }
 */
export function convertResponsesApiFormat(body) {
  if (!body.input) return body;

  const result = { ...body };
  result.messages = [];

  // Convert instructions to system message
  if (body.instructions) {
    result.messages.push({ role: "system", content: body.instructions });
  }

  // Group items by conversation turn
  let currentAssistantMsg = null;
  let pendingToolCalls = [];
  let pendingToolResults = [];
  let pendingReasoningContent = "";

  function attachPendingReasoning(targetMessage) {
    if (!targetMessage || pendingReasoningContent.length === 0) return;
    if (typeof targetMessage.reasoning_content === "string" && targetMessage.reasoning_content.length > 0) {
      targetMessage.reasoning_content += pendingReasoningContent;
    } else {
      targetMessage.reasoning_content = pendingReasoningContent;
    }
    pendingReasoningContent = "";
  }

  const inputItems = normalizeResponsesInput(body.input);
  if (!inputItems) return body;

  for (const item of inputItems) {
    // Determine item type - Droid CLI sends role-based items without 'type' field
    // Fallback: if no type but has role property, treat as message
    const itemType = item.type || (item.role ? "message" : null);

    if (itemType === "message") {
      // Flush any pending assistant message with tool calls
      if (currentAssistantMsg) {
        attachPendingReasoning(currentAssistantMsg);
        result.messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      // Flush pending tool results
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }

      // Convert content: input_text → text, output_text → text, input_image → image_url
      const content = Array.isArray(item.content)
        ? item.content.map(c => {
          if (c.type === "input_text") return { type: "text", text: c.text };
          if (c.type === "output_text") return { type: "text", text: c.text };
          if (c.type === "input_image") {
            const url = c.image_url || c.file_id || "";
            return { type: "image_url", image_url: { url, detail: c.detail || "auto" } };
          }
          return c;
        })
        : item.content;
      const nextMessage = { role: item.role, content };
      if (item.role === "assistant") {
        attachPendingReasoning(nextMessage);
      }
      result.messages.push(nextMessage);
    }
    else if (itemType === "function_call") {
      // Start or append to assistant message with tool_calls
      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          role: "assistant",
          content: null,
          tool_calls: []
        };
      }
      attachPendingReasoning(currentAssistantMsg);
      // Skip items with empty/missing name — upstream APIs reject nameless tool calls (#444)
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") continue;
      currentAssistantMsg.tool_calls.push({
        id: item.call_id,
        type: "function",
        function: {
          name: item.name,
          arguments: item.arguments
        }
      });
    }
    else if (itemType === "function_call_output") {
      // Flush assistant message first if exists
      if (currentAssistantMsg) {
        attachPendingReasoning(currentAssistantMsg);
        result.messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      // Add tool result
      pendingToolResults.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output)
      });
    }
    else if (itemType === "reasoning") {
      const reasoningText = extractReasoningTextFromResponsesItem(item);
      if (!reasoningText) continue;
      if (currentAssistantMsg) {
        if (typeof currentAssistantMsg.reasoning_content === "string") {
          currentAssistantMsg.reasoning_content += reasoningText;
        } else {
          currentAssistantMsg.reasoning_content = reasoningText;
        }
      } else {
        pendingReasoningContent += reasoningText;
      }
      continue;
    }
  }

  // Flush remaining
  if (currentAssistantMsg) {
    attachPendingReasoning(currentAssistantMsg);
    result.messages.push(currentAssistantMsg);
  }
  if (pendingToolResults.length > 0) {
    for (const tr of pendingToolResults) {
      result.messages.push(tr);
    }
  }

  // Cleanup Responses API specific fields
  delete result.input;
  delete result.instructions;
  delete result.include;
  delete result.prompt_cache_key;
  delete result.store;
  delete result.reasoning;

  return result;
}
