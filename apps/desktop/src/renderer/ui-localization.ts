import type { UiLocale } from './app-preferences';

export type UiTranslator = (simplifiedChinese: string, english: string) => string;

interface LocalizedSkillCopy {
  name: string;
  description: string;
}

const builtinSkillCopy: Record<string, Record<UiLocale, LocalizedSkillCopy>> = {
  understand_project: {
    'zh-CN': { name: '理解项目', description: '为不熟悉的代码仓库建立一份有边界、基于证据的结构地图。' },
    en: { name: 'Understand project', description: 'Build a bounded, evidence-based map of an unfamiliar repository.' },
  },
  implement_focused_change: {
    'zh-CN': { name: '实现聚焦修改', description: '使用哈希保护和验证完成一项范围明确的修改。' },
    en: { name: 'Implement focused change', description: 'Implement one scoped change with hash guards and verification.' },
  },
  diagnose_failing_tests: {
    'zh-CN': { name: '诊断失败测试', description: '复现并定位失败测试，修复后重新运行验证。' },
    en: { name: 'Diagnose failing tests', description: 'Reproduce, localize, fix, and replay a failing test.' },
  },
  review_diff: {
    'zh-CN': { name: '审查代码变更', description: '检查当前变更的正确性、范围、风险和缺失的测试。' },
    en: { name: 'Review changes', description: 'Review current changes for correctness, scope, risk, and missing tests.' },
  },
  web_research: {
    'zh-CN': { name: '网页研究', description: '在受控网页适配器可用时，进行带来源记录的研究。' },
    en: { name: 'Web research', description: 'Research with provenance when a controlled Web adapter is available.' },
  },
  safe_archive: {
    'zh-CN': { name: '安全处理压缩包', description: '只通过防止路径穿越的安全适配器检查和解压归档文件。' },
    en: { name: 'Safe archive handling', description: 'Inspect and extract archives only through a traversal-safe adapter.' },
  },
};

function canonicalSkillName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[\s-]+/g, '_');
}

export function localizeSkillMetadata(skill: { name: string; description: string; source_kind: string }, locale: UiLocale): LocalizedSkillCopy {
  if (skill.source_kind !== 'BUILTIN') return { name: skill.name, description: skill.description };
  return builtinSkillCopy[canonicalSkillName(skill.name)]?.[locale] ?? { name: skill.name, description: skill.description };
}
