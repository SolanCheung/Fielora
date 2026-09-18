import type { ProviderConfigView } from '@fielora/contracts';

export interface CapabilitySet {
  textInput: boolean;
  imageInput: boolean;
  videoInput: boolean;
  fileInput: boolean;
  toolCalling: boolean;
}

export interface ResolvedModelCapabilities extends CapabilitySet {
  model: CapabilitySet;
  provider: CapabilitySet;
  transport: CapabilitySet;
  imageInputReason: string | null;
}

export type ModelCapabilities = ResolvedModelCapabilities;

const textModel: CapabilitySet = { textInput: true, imageInput: false, videoInput: false, fileInput: true, toolCalling: true };
const multimodalQwen: CapabilitySet = { textInput: true, imageInput: true, videoInput: true, fileInput: true, toolCalling: true };

/** Exact registry entries follow provider model IDs; Composer never branches on a model string. */
export const modelCapabilityRegistry: Readonly<Record<string, CapabilitySet>> = {
  // Deterministic desktop regression model; Core substitutes it only under FIELORA_E2E.
  '__fielora_agent_fixture_images__': { ...multimodalQwen, videoInput: false },
  'qwen3.7-plus': multimodalQwen,
  'qwen3.7-plus-2026-05-26': multimodalQwen,
  'qwen3.6-plus': multimodalQwen,
  'qwen3.5-plus': multimodalQwen,
  'kimi-k2.5': { ...multimodalQwen, videoInput: false },
};

function endpointHost(provider: ProviderConfigView | null | undefined): string {
  try { return provider?.base_url ? new URL(provider.base_url).hostname.toLowerCase() : ''; }
  catch { return ''; }
}

function intersect(left: CapabilitySet, middle: CapabilitySet, right: CapabilitySet): CapabilitySet {
  return {
    textInput: left.textInput && middle.textInput && right.textInput,
    imageInput: left.imageInput && middle.imageInput && right.imageInput,
    videoInput: left.videoInput && middle.videoInput && right.videoInput,
    fileInput: left.fileInput && middle.fileInput && right.fileInput,
    toolCalling: left.toolCalling && middle.toolCalling && right.toolCalling,
  };
}

function providerCapabilities(provider: ProviderConfigView | null | undefined): CapabilitySet {
  const host = endpointHost(provider);
  const codingPlan = host === 'coding.dashscope.aliyuncs.com' || host === 'coding-intl.dashscope.aliyuncs.com';
  if (codingPlan) return { textInput: true, imageInput: true, videoInput: true, fileInput: true, toolCalling: true };
  return { textInput: true, imageInput: true, videoInput: true, fileInput: true, toolCalling: true };
}

function transportCapabilities(provider: ProviderConfigView | null | undefined): CapabilitySet {
  if (!provider) return { textInput: true, imageInput: false, videoInput: false, fileInput: true, toolCalling: true };
  // All three implemented Provider adapters serialize native image content parts.
  return { textInput: true, imageInput: true, videoInput: false, fileInput: true, toolCalling: true };
}

export function modelCapabilities(provider: ProviderConfigView | null | undefined): ResolvedModelCapabilities {
  const model = provider ? (modelCapabilityRegistry[provider.default_model] ?? textModel) : textModel;
  const providerProfile = providerCapabilities(provider);
  const transport = transportCapabilities(provider);
  const resolved = intersect(model, providerProfile, transport);
  const imageInputReason = resolved.imageInput ? null
    : !model.imageInput ? '当前模型不支持图片输入'
      : !providerProfile.imageInput ? '当前模型服务方案未启用图片输入'
        : '当前连接方式尚未启用图片输入';
  return { ...resolved, model, provider: providerProfile, transport, imageInputReason };
}

export function attachmentAllowed(capabilities: ResolvedModelCapabilities, kind: 'TEXT' | 'IMAGE'): boolean {
  return kind === 'IMAGE' ? capabilities.imageInput : capabilities.fileInput;
}
