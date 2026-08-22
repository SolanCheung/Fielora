export interface ChinaProviderPreset {
  value: string;
  label: string;
  description: string;
  displayName: string;
  model: string;
  baseUrl: string;
}

export const chinaProviderPresets: ChinaProviderPreset[] = [
  { value: 'MANUAL', label: '手动填写', description: '任意未来 OpenAI-compatible 服务', displayName: '', model: '', baseUrl: '' },
  { value: 'QWEN', label: 'Qwen 通用 API', description: '阿里云百炼按量 / Token Plan', displayName: 'Qwen', model: 'qwen3.7-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { value: 'QWEN_CODING_PLAN', label: 'Qwen Coding Plan', description: 'OpenAI Chat Completions · 编程套餐专用 Key（sk-sp-）', displayName: 'Qwen Coding Plan', model: 'qwen3.7-plus', baseUrl: 'https://coding.dashscope.aliyuncs.com/v1' },
  { value: 'DEEPSEEK', label: 'DeepSeek', description: 'DeepSeek 开放平台', displayName: 'DeepSeek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1' },
  { value: 'KIMI', label: 'Kimi', description: 'Moonshot AI 开放平台', displayName: 'Kimi', model: 'kimi-k2.5', baseUrl: 'https://api.moonshot.cn/v1' },
  { value: 'GLM', label: 'GLM', description: '智谱开放平台', displayName: 'GLM', model: 'glm-4.7', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { value: 'MINIMAX', label: 'MiniMax', description: '中国区 OpenAI-compatible', displayName: 'MiniMax', model: 'MiniMax-M2.7', baseUrl: 'https://api.minimaxi.com/v1' },
  { value: 'DOUBAO', label: 'Doubao', description: '火山方舟按量 API', displayName: 'Doubao', model: 'doubao-seed-2-0-code', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3' },
];
