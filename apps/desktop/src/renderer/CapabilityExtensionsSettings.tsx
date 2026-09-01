import { McpSettings } from './McpSettings';
import { PluginSettings } from './PluginSettings';
import { AppIcon, type AppIconName } from './ui';
import { SkillsSettings } from './SkillsSettings';

export type CapabilityExtensionTab = 'SKILLS' | 'MCP' | 'PLUGINS';

const tabs: Array<{ id: CapabilityExtensionTab; label: string; icon: AppIconName }> = [
  { id: 'SKILLS', label: 'Skills', icon: 'files' },
  { id: 'MCP', label: 'MCP', icon: 'environment' },
  { id: 'PLUGINS', label: '插件', icon: 'extensions' },
];

export function CapabilityExtensionsSettings({ activeTab, fieldId, onTabChange }: {
  activeTab: CapabilityExtensionTab;
  fieldId: string | null;
  onTabChange: (tab: CapabilityExtensionTab) => void;
}) {
  return <div className="settings-section settings-capability-extensions" data-testid="settings-capability-extensions">
    <header><h1>能力与扩展</h1></header>
    <div className="settings-extension-tabs" role="tablist" aria-label="能力与扩展">
      {tabs.map((tab) => <button
        key={tab.id}
        id={`settings-extension-tab-${tab.id.toLowerCase()}`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls="settings-extension-panel"
        className={activeTab === tab.id ? 'active' : ''}
        onClick={() => onTabChange(tab.id)}
        data-testid={`settings-extension-tab-${tab.id.toLowerCase()}`}
      ><AppIcon name={tab.icon}/><span>{tab.label}</span></button>)}
    </div>
    <section id="settings-extension-panel" className="settings-extension-panel" role="tabpanel" aria-labelledby={`settings-extension-tab-${activeTab.toLowerCase()}`}>
      {activeTab === 'SKILLS' && <SkillsSettings fieldId={fieldId} embedded/>}
      {activeTab === 'MCP' && <McpSettings embedded/>}
      {activeTab === 'PLUGINS' && <PluginSettings embedded/>}
    </section>
  </div>;
}
