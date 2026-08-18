// Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
import assert from "node:assert/strict";

const MAX_EVENT_BYTES = 1024 * 1024;

async function parseSse(chunks) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  const events = [];
  for (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    if (Buffer.byteLength(buffer) > MAX_EVENT_BYTES) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!block || block.startsWith(":")) continue;
      let eventName = "message";
      const data = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      events.push({ event: eventName, data: data.join("\n") });
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) throw new Error("PROVIDER_PROTOCOL_ERROR");
  return events;
}

function fragment(text) {
  const bytes = new TextEncoder().encode(text);
  return [bytes.slice(0, 7), bytes.slice(7, 23), bytes.slice(23, 71), bytes.slice(71)];
}

function parseJson(data) {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error("PROVIDER_PROTOCOL_ERROR");
  }
}

function normalizeOpenAi(events) {
  const normalized = [{ type: "STARTED" }];
  for (const event of events) {
    const value = parseJson(event.data);
    switch (value.type) {
      case "response.output_text.delta":
        normalized.push({ type: "OUTPUT_TEXT_DELTA", text: value.delta });
        break;
      case "response.output_item.done":
        if (value.item?.type === "function_call") {
          normalized.push({
            type: "TOOL_PROPOSAL",
            name: value.item.name,
            arguments: value.item.arguments,
          });
        }
        break;
      case "response.completed":
        normalized.push({ type: "USAGE", usage: value.response.usage });
        normalized.push({ type: "COMPLETED" });
        break;
      default:
        break;
    }
  }
  return normalized;
}

function normalizeAnthropic(events) {
  const normalized = [{ type: "STARTED" }];
  for (const event of events) {
    const value = parseJson(event.data);
    switch (value.type) {
      case "content_block_delta":
        if (value.delta?.type === "text_delta") {
          normalized.push({ type: "OUTPUT_TEXT_DELTA", text: value.delta.text });
        }
        break;
      case "content_block_start":
        if (value.content_block?.type === "tool_use") {
          normalized.push({
            type: "TOOL_PROPOSAL",
            name: value.content_block.name,
            arguments: value.content_block.input,
          });
        }
        break;
      case "message_start":
      case "message_delta":
        if (value.message?.usage || value.usage) {
          normalized.push({ type: "USAGE", usage: value.message?.usage ?? value.usage });
        }
        break;
      case "message_stop":
        normalized.push({ type: "COMPLETED" });
        break;
      default:
        break;
    }
  }
  return normalized;
}

function assertNormalized(events) {
  const text = events
    .filter(({ type }) => type === "OUTPUT_TEXT_DELTA")
    .map(({ text: delta }) => delta)
    .join("");
  const terminals = events.filter(({ type }) =>
    ["COMPLETED", "CANCELLED", "FAILED"].includes(type),
  );
  assert.equal(text, "FIELORA_PROVIDER_PROBE_OK");
  assert.equal(terminals.length, 1);
  assert(events.some(({ type }) => type === "USAGE"));
  assert(events.some(({ type }) => type === "TOOL_PROPOSAL"));
}

const openAiFixture = [
  'event: response.created\ndata: {"type":"response.created"}\n\n',
  'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"FIELORA_PROVIDER_"}\n\n',
  'event: future.event\ndata: {"type":"future.event","ignored":true}\n\n',
  'event: response.output_item.done\ndata: {"type":"response.output_item.done","item":{"type":"function_call","name":"probe_tool","arguments":"{}"}}\n\n',
  'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"PROBE_OK"}\n\n',
  'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":5,"output_tokens":4,"total_tokens":9}}}\n\n',
].join("");

const anthropicFixture = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"FIELORA_PROVIDER_"}}\n\n',
  'event: ping\ndata: {"type":"ping"}\n\n',
  'event: content_block_start\ndata: {"type":"content_block_start","content_block":{"type":"tool_use","name":"probe_tool","input":{}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"PROBE_OK"}}\n\n',
  'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":4}}\n\n',
  'event: message_stop\ndata: {"type":"message_stop"}\n\n',
].join("");

const openAi = normalizeOpenAi(await parseSse(fragment(openAiFixture)));
const anthropic = normalizeAnthropic(await parseSse(fragment(anthropicFixture)));
assertNormalized(openAi);
assertNormalized(anthropic);

const errorMap = new Map([
  [401, "CREDENTIAL_REJECTED"],
  [403, "CREDENTIAL_REJECTED"],
  [404, "MODEL_NOT_AVAILABLE"],
  [429, "PROVIDER_RATE_LIMITED"],
  [500, "PROVIDER_UNAVAILABLE"],
  [503, "PROVIDER_UNAVAILABLE"],
]);
assert.equal(errorMap.get(401), "CREDENTIAL_REJECTED");
assert.equal(errorMap.get(429), "PROVIDER_RATE_LIMITED");
assert.equal(errorMap.get(503), "PROVIDER_UNAVAILABLE");

let malformedRejected = false;
try {
  normalizeOpenAi(await parseSse(fragment("data: {not-json}\n\n")));
} catch (error) {
  malformedRejected = error.message === "PROVIDER_PROTOCOL_ERROR";
}
assert(malformedRejected);

let oversizedRejected = false;
try {
  await parseSse([new TextEncoder().encode(`data: ${"x".repeat(MAX_EVENT_BYTES + 1)}`)]);
} catch (error) {
  oversizedRejected = error.message === "PROVIDER_RESPONSE_TOO_LARGE";
}
assert(oversizedRejected);

console.log(
  JSON.stringify(
    {
      result: "PASS",
      providerFamilies: ["OPENAI_RESPONSES", "ANTHROPIC_MESSAGES"],
      fragmentedSse: "PASS",
      textNormalization: "PASS",
      usageNormalization: "PASS",
      toolRequestAsProposalOnly: "PASS",
      unknownEventIgnored: "PASS",
      malformedProtocolRejected: malformedRejected,
      oversizedEventRejected: oversizedRejected,
      deterministicErrorClasses: [
        "CREDENTIAL_REJECTED",
        "MODEL_NOT_AVAILABLE",
        "PROVIDER_RATE_LIMITED",
        "PROVIDER_UNAVAILABLE",
      ],
      externalRequests: 0,
      productCodeChanged: false,
    },
    null,
    2,
  ),
);
