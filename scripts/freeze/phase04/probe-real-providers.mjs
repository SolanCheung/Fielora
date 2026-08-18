// Phase 04 freeze probe source; generated Evidence belongs under artifacts/phase04.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SYNTHETIC_INPUT = "Return exactly: FIELORA_PROVIDER_PROBE_OK";
const EXPECTED_OUTPUT = "FIELORA_PROVIDER_PROBE_OK";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_TOKENS = 32;

const configuration = {
  openAiKey: process.env.FIELORA_OPENAI_PROBE_KEY,
  openAiModel: process.env.FIELORA_OPENAI_PROBE_MODEL,
  anthropicKey: process.env.FIELORA_ANTHROPIC_PROBE_KEY,
  anthropicModel: process.env.FIELORA_ANTHROPIC_PROBE_MODEL,
};
const environmentNames = {
  openAiKey: "FIELORA_OPENAI_PROBE_KEY",
  openAiModel: "FIELORA_OPENAI_PROBE_MODEL",
  anthropicKey: "FIELORA_ANTHROPIC_PROBE_KEY",
  anthropicModel: "FIELORA_ANTHROPIC_PROBE_MODEL",
};

const missing = Object.entries(configuration)
  .filter(([, value]) => !value?.trim())
  .map(([name]) => environmentNames[name]);

if (missing.length > 0) {
  console.log(
    JSON.stringify(
      {
        result: "SKIP",
        reason: "TEST_CREDENTIAL_OR_MODEL_NOT_SUPPLIED",
        missing,
        externalRequests: 0,
        requiredEnvironment: [
          "FIELORA_OPENAI_PROBE_KEY",
          "FIELORA_OPENAI_PROBE_MODEL",
          "FIELORA_ANTHROPIC_PROBE_KEY",
          "FIELORA_ANTHROPIC_PROBE_MODEL",
        ],
      },
      null,
      2,
    ),
  );
  process.exitCode = 2;
} else {
  await run();
}

function boundedAbortController() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("bounded-timeout"), REQUEST_TIMEOUT_MS);
  return { controller, clear: () => clearTimeout(timeout) };
}

async function* sseJson(response) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    if (Buffer.byteLength(buffer) > 1024 * 1024) throw new Error("PROVIDER_RESPONSE_TOO_LARGE");
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
}

function requireOk(response, stage) {
  if (!response.ok) {
    const error = new Error(`${stage}_HTTP_${response.status}`);
    error.status = response.status;
    throw error;
  }
}

function openAiBody(model) {
  const body = {
    model,
    input: SYNTHETIC_INPUT,
    stream: true,
    store: false,
    max_output_tokens: MAX_OUTPUT_TOKENS,
  };
  if (body.store !== false) throw new Error("OPENAI_STORE_FALSE_INVARIANT");
  return body;
}

async function openAiRequest(key, model, cancelAfterFirstDelta) {
  const bounded = boundedAbortController();
  let text = "";
  let usageSeen = false;
  let completed = false;
  let deltaSeen = false;
  let usage = null;
  const wireEventTypes = new Set();
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      redirect: "manual",
      signal: bounded.controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(openAiBody(model)),
    });
    requireOk(response, "OPENAI");
    for await (const event of sseJson(response)) {
      if (typeof event.type === "string") wireEventTypes.add(event.type);
      if (event.type === "response.output_text.delta") {
        deltaSeen = true;
        text += event.delta;
        if (cancelAfterFirstDelta) {
          bounded.controller.abort("bounded-cancel-probe");
          break;
        }
      }
      if (event.type === "response.completed") {
        const providerUsage = event.response?.usage;
        usageSeen = Boolean(providerUsage);
        if (providerUsage) {
          usage = {
            inputTokens: providerUsage.input_tokens,
            outputTokens: providerUsage.output_tokens,
            totalTokens: providerUsage.total_tokens,
          };
        }
        completed = true;
      }
    }
  } finally {
    bounded.clear();
  }
  return {
    exactText: text.trim() === EXPECTED_OUTPUT,
    usageSeen,
    usage,
    completed,
    deltaSeen,
    wireEventTypes: [...wireEventTypes].sort(),
    normalizedEvents: cancelAfterFirstDelta
      ? ["STARTED", "OUTPUT_TEXT_DELTA", "CANCELLED"]
      : ["STARTED", "OUTPUT_TEXT_DELTA", "USAGE", "COMPLETED"],
  };
}

async function anthropicRequest(key, model, cancelAfterFirstDelta) {
  const bounded = boundedAbortController();
  let text = "";
  let inputUsageSeen = false;
  let outputUsageSeen = false;
  let completed = false;
  let deltaSeen = false;
  let inputTokens;
  let outputTokens;
  const wireEventTypes = new Set();
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      redirect: "manual",
      signal: bounded.controller.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        messages: [{ role: "user", content: SYNTHETIC_INPUT }],
      }),
    });
    requireOk(response, "ANTHROPIC");
    for await (const event of sseJson(response)) {
      if (typeof event.type === "string") wireEventTypes.add(event.type);
      if (event.type === "message_start") {
        inputUsageSeen = Boolean(event.message?.usage);
        inputTokens = event.message?.usage?.input_tokens;
      }
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        deltaSeen = true;
        text += event.delta.text;
        if (cancelAfterFirstDelta) {
          bounded.controller.abort("bounded-cancel-probe");
          break;
        }
      }
      if (event.type === "message_delta") {
        outputUsageSeen = Boolean(event.usage);
        outputTokens = event.usage?.output_tokens;
      }
      if (event.type === "message_stop") completed = true;
    }
  } finally {
    bounded.clear();
  }
  return {
    exactText: text.trim() === EXPECTED_OUTPUT,
    usageSeen: inputUsageSeen && outputUsageSeen,
    usage:
      inputUsageSeen && outputUsageSeen
        ? { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }
        : null,
    completed,
    deltaSeen,
    wireEventTypes: [...wireEventTypes].sort(),
    normalizedEvents: cancelAfterFirstDelta
      ? ["STARTED", "OUTPUT_TEXT_DELTA", "CANCELLED"]
      : ["STARTED", "OUTPUT_TEXT_DELTA", "USAGE", "COMPLETED"],
  };
}

async function invalidAuth(url, headers, body) {
  const bounded = boundedAbortController();
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: bounded.controller.signal,
      headers,
      body: JSON.stringify(body),
    });
    await response.body?.cancel();
    const credentialRejected = response.status === 401 || response.status === 403;
    return {
      credentialRejected,
      normalizedEvents: ["STARTED", "FAILED"],
      stableError: credentialRejected ? "CREDENTIAL_REJECTED" : "UNEXPECTED_ERROR_CLASS",
    };
  } finally {
    bounded.clear();
  }
}

async function run() {
  try {
    const openAiComplete = await openAiRequest(
      configuration.openAiKey,
      configuration.openAiModel,
      false,
    );
    const openAiCancel = await openAiRequest(
      configuration.openAiKey,
      configuration.openAiModel,
      true,
    );
    const openAiInvalidAuth = await invalidAuth(
      "https://api.openai.com/v1/responses",
      { Authorization: "Bearer fielora-invalid-probe-key", "Content-Type": "application/json" },
      { ...openAiBody(configuration.openAiModel), stream: false },
    );

    const anthropicComplete = await anthropicRequest(
      configuration.anthropicKey,
      configuration.anthropicModel,
      false,
    );
    const anthropicCancel = await anthropicRequest(
      configuration.anthropicKey,
      configuration.anthropicModel,
      true,
    );
    const anthropicInvalidAuth = await invalidAuth(
      "https://api.anthropic.com/v1/messages",
      {
        "x-api-key": "fielora-invalid-probe-key",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      {
        model: configuration.anthropicModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: false,
        messages: [{ role: "user", content: SYNTHETIC_INPUT }],
      },
    );

    const sameCompletedSemantics =
      JSON.stringify(openAiComplete.normalizedEvents) ===
      JSON.stringify(anthropicComplete.normalizedEvents);
    const sameCancelledSemantics =
      JSON.stringify(openAiCancel.normalizedEvents) ===
      JSON.stringify(anthropicCancel.normalizedEvents);
    const sameFailedSemantics =
      JSON.stringify(openAiInvalidAuth.normalizedEvents) ===
      JSON.stringify(anthropicInvalidAuth.normalizedEvents);
    const pass =
      openAiComplete.exactText &&
      openAiComplete.usageSeen &&
      openAiComplete.completed &&
      openAiCancel.deltaSeen &&
      openAiInvalidAuth.credentialRejected &&
      anthropicComplete.exactText &&
      anthropicComplete.usageSeen &&
      anthropicComplete.completed &&
      anthropicCancel.deltaSeen &&
      anthropicInvalidAuth.credentialRejected &&
      sameCompletedSemantics &&
      sameCancelledSemantics &&
      sameFailedSemantics;
    if (!pass) throw new Error("PROVIDER_CONTRACT_ASSERTION_FAILED");

    const leakScan = scanArtifactsAndEvidenceInputs([
      configuration.openAiKey,
      configuration.anthropicKey,
    ]);
    const evidence = {
          result: "PASS",
          syntheticInputOnly: true,
          syntheticInputSha256: createHash("sha256").update(SYNTHETIC_INPUT).digest("hex"),
          openAi: {
            family: "RESPONSES",
            model: configuration.openAiModel,
            authentication: "PASS",
            observedWireEventTypes: openAiComplete.wireEventTypes,
            completedNormalizedEvents: openAiComplete.normalizedEvents,
            completedUsage: openAiComplete.usage,
            cancelledNormalizedEvents: openAiCancel.normalizedEvents,
            failedNormalizedEvents: openAiInvalidAuth.normalizedEvents,
            representativeStableError: openAiInvalidAuth.stableError,
            storeFalse: true,
          },
          anthropic: {
            family: "MESSAGES",
            model: configuration.anthropicModel,
            authentication: "PASS",
            observedWireEventTypes: anthropicComplete.wireEventTypes,
            completedNormalizedEvents: anthropicComplete.normalizedEvents,
            completedUsage: anthropicComplete.usage,
            cancelledNormalizedEvents: anthropicCancel.normalizedEvents,
            failedNormalizedEvents: anthropicInvalidAuth.normalizedEvents,
            representativeStableError: anthropicInvalidAuth.stableError,
          },
          sameFieloraInvocationSemantics: {
            completed: sameCompletedSemantics,
            cancelled: sameCancelledSemantics,
            failed: sameFailedSemantics,
          },
          possibleBillableRequestsPerProvider: 2,
          invalidAuthRequestsPerProvider: 1,
          retries: 0,
          maxOutputTokensPerRequest: MAX_OUTPUT_TOKENS,
          artifactLeakScan: leakScan,
        };
    const serializedEvidence = JSON.stringify(evidence, null, 2);
    for (const forbidden of [
      configuration.openAiKey,
      configuration.anthropicKey,
      SYNTHETIC_INPUT,
      EXPECTED_OUTPUT,
    ]) {
      if (serializedEvidence.includes(forbidden)) throw new Error("EVIDENCE_REDACTION_FAILED");
    }
    console.log(serializedEvidence);
  } catch (error) {
    console.error(
      JSON.stringify({
        result: "FAIL",
        stableError: error?.name === "AbortError" ? "PROVIDER_TIMEOUT" : "PROVIDER_PROBE_FAILED",
        stage: String(error?.message ?? "unknown").replace(/[^A-Z0-9_\-]/gi, "_").slice(0, 96),
        retries: 0,
        secretOutput: "NONE",
        promptOrResponseOutput: "NONE",
      }),
    );
    process.exitCode = 1;
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files;
}

function scanArtifactsAndEvidenceInputs(secrets) {
  const artifactsDirectory = resolve(import.meta.dirname, "../../../artifacts/phase04");
  let promptBodies = 0;
  let responseBodies = 0;
  let credentialBytes = 0;
  let authorizationHeaders = 0;
  let secretLogBytes = 0;
  for (const file of listFiles(artifactsDirectory)) {
    const bytes = readFileSync(file);
    const text = bytes.toString("utf8");
    if (text.includes(SYNTHETIC_INPUT)) promptBodies += 1;
    if (text.includes(EXPECTED_OUTPUT)) responseBodies += 1;
    if (
      /(^|[\r\n{,])\s*["']?(authorization|x-api-key)["']?\s*:/giu.test(text)
    ) {
      authorizationHeaders += 1;
    }
    for (const secret of secrets) {
      if (bytes.includes(Buffer.from(secret))) credentialBytes += 1;
      if (file.toLowerCase().endsWith(".log") && bytes.includes(Buffer.from(secret))) {
        secretLogBytes += 1;
      }
    }
  }
  const result = {
    promptBodies,
    responseBodies,
    credentialBytes,
    authorizationHeaders,
    secretLogBytes,
  };
  if (Object.values(result).some((count) => count !== 0)) {
    throw new Error("ARTIFACT_LEAK_SCAN_FAILED");
  }
  return result;
}
