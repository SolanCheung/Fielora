export const AGENTIC_UX_PROTOTYPE_VIEWS = [
  { id: 'RUNNING', label: 'Running' },
  { id: 'SUCCESS', label: 'Success' },
  { id: 'PARTIAL', label: 'Partial' },
  { id: 'FAILED', label: 'Failed' },
  { id: 'NO_CHANGE', label: 'No Change' },
  { id: 'APPROVAL', label: 'Approval' },
  { id: 'REVIEW', label: 'Review' },
] as const;

export type AgenticUXPrototypeView = typeof AGENTIC_UX_PROTOTYPE_VIEWS[number]['id'];

const prototypeViewIds = new Set<string>(AGENTIC_UX_PROTOTYPE_VIEWS.map((view) => view.id));

export function prototypeViewFromHash(hash: string): AgenticUXPrototypeView | null {
  const match = /^#agentic-ux-prototype(?:\/([A-Z_]+))?$/.exec(hash);
  if (!match) return null;
  const candidate = match[1] ?? 'RUNNING';
  return prototypeViewIds.has(candidate) ? candidate as AgenticUXPrototypeView : 'RUNNING';
}

export const AGENTIC_UX_REVIEW_FILES = [
  {
    path: 'finance-add.controller.js',
    additions: 1,
    deletions: 1,
    subject: '用户字段',
    beforeLabel: '必填',
    beforeValue: 'iContacter = 1',
    afterLabel: '非必填',
    afterValue: 'iContacter = 0',
    explanation: 'iContacter 控制“用户”字段是否必填，本次只调整这一规则。',
    rawDiff: '@@ -184,7 +184,7 @@\n-  $scope.form.iContacter = 1;\n+  $scope.form.iContacter = 0;',
  },
  {
    path: 'finance-add.html',
    additions: 1,
    deletions: 1,
    subject: '用户字段',
    beforeLabel: 'required',
    beforeValue: '<input name="iContacter" required>',
    afterLabel: 'removed',
    afterValue: '<input name="iContacter">',
    explanation: '模板不再声明 required，其他表单字段保持原有约束。',
    rawDiff: '@@ -92,7 +92,7 @@\n-  <input name="iContacter" required>\n+  <input name="iContacter">',
  },
] as const;

export type AgenticUXReviewFile = typeof AGENTIC_UX_REVIEW_FILES[number];
