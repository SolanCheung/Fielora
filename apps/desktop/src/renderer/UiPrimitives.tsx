import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';

type ProductButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  icon: ReactNode;
  active?: boolean;
  testId?: string;
};

export function Button({ variant = 'secondary', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}) {
  return <button {...props} type={props.type ?? 'button'} className={`ui-button ui-button--${variant} ${className}`.trim()}>{children}</button>;
}

export function SettingsToggle({ value, onChange, label, testId, disabled = false }: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  testId?: string;
  disabled?: boolean;
}) {
  return <button type="button" className="setting-switch" role="switch" aria-label={label} aria-checked={value} disabled={disabled} onClick={() => onChange(!value)} data-testid={testId}><span /></button>;
}

export function IconButton({ label, icon, active = false, testId, className = '', title, size = 'md', ...props }: ProductButtonProps & {
  size?: 'sm' | 'md';
}) {
  return <button
    {...props}
    type={props.type ?? 'button'}
    className={`ui-icon-button ui-icon-button--${size} ${active ? 'is-active active' : ''} ${className}`.trim()}
    aria-label={label}
    title={title ?? label}
    data-testid={testId}
  >{icon}</button>;
}

export function ToolbarAction({ label, icon, text, active = false, testId, className = '', title, ...props }: ProductButtonProps & {
  text?: string;
}) {
  return <button
    {...props}
    type={props.type ?? 'button'}
    className={`ui-toolbar-action ${text ? 'ui-toolbar-action--labeled' : ''} ${active ? 'is-active active' : ''} ${className}`.trim()}
    aria-label={label}
    title={title ?? label}
    data-testid={testId}
  >{icon}{text && <span>{text}</span>}</button>;
}

export interface SelectMenuOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  tone?: 'warning';
}

export function ChevronIcon({ open = false }: { open?: boolean }) {
  return <svg className={`ui-chevron chevron-icon ${open ? 'open' : ''}`} viewBox="0 0 16 16" aria-hidden="true"><path d="m4.25 6.25 3.75 3.5 3.75-3.5" /></svg>;
}

export function SelectMenu<T extends string>({ value, options, onChange, ariaLabel, testId, className = '', placement = 'bottom', leading, hideChevron = false }: {
  value: T;
  options: SelectMenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  testId?: string;
  className?: string;
  placement?: 'top' | 'bottom';
  leading?: ReactNode;
  hideChevron?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const enabled = options.filter((option) => !option.disabled);
      const index = Math.max(0, enabled.findIndex((option) => option.value === value));
      const next = event.key === 'ArrowDown' ? Math.min(enabled.length - 1, index + 1) : Math.max(0, index - 1);
      if (enabled[next]) onChange(enabled[next]!.value);
    };
    window.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', key);
    };
  }, [onChange, open, options, value]);

  return <div ref={rootRef} className={`ui-select select-menu ${placement === 'top' ? 'place-top' : ''} ${open ? 'open' : ''} ${className}`.trim()} data-value={value}>
    <button type="button" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} data-testid={testId}>
      {leading}<span className="ui-select-value select-menu-value">{selected?.label ?? ariaLabel}</span>{!hideChevron && <ChevronIcon open={open} />}
    </button>
    {open && <div className="ui-select-popover select-menu-popover" role="listbox" aria-label={ariaLabel} data-testid={testId ? `${testId}-menu` : undefined}>
      {options.map((option) => <button key={option.value || 'empty'} className={option.tone ? `is-${option.tone}` : undefined} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); }} data-testid={testId ? `${testId}-option-${option.value || 'empty'}` : undefined}>
        <span className="ui-select-option-content">{option.icon && <span className="ui-select-option-icon">{option.icon}</span>}<span className="ui-select-option-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></span>{option.value === value && <svg className="ui-select-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.25 3 3 6-6" /></svg>}
      </button>)}
    </div>}
  </div>;
}

export function TextActionDialog({ title, description, value, confirmLabel, danger = false, multiline = false, onChange, onCancel, onConfirm, testId }: {
  title: string;
  description?: string;
  value?: string;
  confirmLabel: string;
  danger?: boolean;
  multiline?: boolean;
  onChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const cancelRef = useRef(onCancel);
  const confirmRef = useRef(onConfirm);
  cancelRef.current = onCancel;
  confirmRef.current = onConfirm;
  useEffect(() => {
    inputRef.current?.focus();
    if (inputRef.current instanceof HTMLInputElement) inputRef.current.select();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
      if (event.key === 'Enter' && !multiline) { event.preventDefault(); confirmRef.current(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [multiline]);

  return <div className="ui-dialog-backdrop dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="ui-dialog action-dialog" role="dialog" aria-modal="true" aria-labelledby={`${testId ?? 'action-dialog'}-title`} data-testid={testId}>
      <header><h2 id={`${testId ?? 'action-dialog'}-title`}>{title}</h2><IconButton size="sm" label="关闭" icon={<span aria-hidden="true">×</span>} onClick={onCancel} /></header>
      {description && <p>{description}</p>}
      {value !== undefined && (multiline
        ? <textarea ref={inputRef as RefObject<HTMLTextAreaElement>} value={value} onChange={(event) => onChange?.(event.target.value)} />
        : <input ref={inputRef as RefObject<HTMLInputElement>} value={value} onChange={(event) => onChange?.(event.target.value)} />)}
      <footer><Button variant="secondary" className="dialog-cancel" onClick={onCancel}>取消</Button><Button variant={danger ? 'danger' : 'primary'} className={danger ? 'dialog-danger' : 'dialog-confirm'} disabled={value !== undefined && !value.trim()} onClick={onConfirm}>{confirmLabel}</Button></footer>
    </section>
  </div>;
}
