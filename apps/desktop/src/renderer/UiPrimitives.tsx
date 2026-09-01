import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from './ui';

type ProductButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  icon: ReactNode;
  active?: boolean;
  testId?: string;
};

type TooltipPlacement = 'top' | 'bottom' | 'right';
type TooltipVariant = 'default' | 'card';

function useManagedTooltip(label: ReactNode, placement: TooltipPlacement = 'top', variant: TooltipVariant = 'default') {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const delayRef = useRef<number | null>(null);
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const cancelDelay = () => {
    if (delayRef.current === null) return;
    window.clearTimeout(delayRef.current);
    delayRef.current = null;
  };

  const show = (delay = 420) => {
    cancelDelay();
    delayRef.current = window.setTimeout(() => {
      setPosition(null);
      setOpen(true);
      delayRef.current = null;
    }, delay);
  };

  const hide = () => {
    cancelDelay();
    setOpen(false);
    setPosition(null);
  };

  useEffect(() => () => cancelDelay(), []);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;
      const anchorBounds = anchor.getBoundingClientRect();
      const tooltipBounds = tooltip.getBoundingClientRect();
      const viewportInset = 8;
      const offset = 8;
      const chromeBottom = document.querySelector<HTMLElement>('[data-testid="desktop-chrome"]')?.getBoundingClientRect().bottom ?? 0;
      const safeTop = Math.max(viewportInset, chromeBottom + viewportInset);
      const maxTop = Math.max(safeTop, window.innerHeight - tooltipBounds.height - viewportInset);
      if (placement === 'right') {
        const preferredLeft = anchorBounds.right + offset;
        const alternateLeft = anchorBounds.left - tooltipBounds.width - offset;
        const candidateLeft = preferredLeft + tooltipBounds.width <= window.innerWidth - viewportInset
          ? preferredLeft
          : alternateLeft;
        const left = Math.min(
          window.innerWidth - tooltipBounds.width - viewportInset,
          Math.max(viewportInset, candidateLeft),
        );
        const centeredTop = anchorBounds.top + (anchorBounds.height - tooltipBounds.height) / 2;
        const top = Math.min(maxTop, Math.max(safeTop, centeredTop));
        setPosition({ left: Math.round(left), top: Math.round(top) });
        return;
      }
      const preferredTop = placement === 'top'
        ? anchorBounds.top - tooltipBounds.height - offset
        : anchorBounds.bottom + offset;
      const alternateTop = placement === 'top'
        ? anchorBounds.bottom + offset
        : anchorBounds.top - tooltipBounds.height - offset;
      const candidateTop = preferredTop >= safeTop
        && preferredTop + tooltipBounds.height <= window.innerHeight - viewportInset
        ? preferredTop
        : alternateTop;
      const top = Math.min(maxTop, Math.max(safeTop, candidateTop));
      const centeredLeft = anchorBounds.left + (anchorBounds.width - tooltipBounds.width) / 2;
      const left = Math.min(
        window.innerWidth - tooltipBounds.width - viewportInset,
        Math.max(viewportInset, centeredLeft),
      );
      setPosition({ left: Math.round(left), top: Math.round(top) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [label, open, placement]);

  const tooltip = open ? createPortal(
    <span
      ref={tooltipRef}
      id={tooltipId}
      className={`ui-tooltip${variant === 'card' ? ' ui-tooltip--card' : ''}`}
      role="tooltip"
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}
      data-testid="ui-tooltip"
    >{label}</span>,
    document.body,
  ) : null;

  return { anchorRef, tooltipId, open, show, hide, tooltip };
}

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

export function TooltipButton({ tooltip, placement = 'right', variant = 'card', children, onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: ReactNode;
  placement?: TooltipPlacement;
  variant?: TooltipVariant;
}) {
  const managedTooltip = useManagedTooltip(tooltip, placement, variant);
  return <>
    <button
      {...props}
      ref={managedTooltip.anchorRef}
      type={props.type ?? 'button'}
      aria-describedby={managedTooltip.open ? managedTooltip.tooltipId : undefined}
      onPointerEnter={(event) => { onPointerEnter?.(event); managedTooltip.show(); }}
      onPointerLeave={(event) => { onPointerLeave?.(event); managedTooltip.hide(); }}
      onFocus={(event) => { onFocus?.(event); managedTooltip.show(0); }}
      onBlur={(event) => { onBlur?.(event); managedTooltip.hide(); }}
      onKeyDown={(event) => { onKeyDown?.(event); if (event.key === 'Escape') managedTooltip.hide(); }}
    >{children}</button>
    {managedTooltip.tooltip}
  </>;
}

export function IconButton({ label, icon, active = false, testId, className = '', title, size = 'md', onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown, ...props }: ProductButtonProps & {
  size?: 'sm' | 'md';
}) {
  const managedTooltip = useManagedTooltip(title ?? label);
  return <>
    <button
      {...props}
      ref={managedTooltip.anchorRef}
      type={props.type ?? 'button'}
      className={`ui-icon-button ui-icon-button--${size} ${active ? 'is-active active' : ''} ${className}`.trim()}
      aria-label={label}
      aria-describedby={managedTooltip.open ? managedTooltip.tooltipId : undefined}
      onPointerEnter={(event) => { onPointerEnter?.(event); managedTooltip.show(); }}
      onPointerLeave={(event) => { onPointerLeave?.(event); managedTooltip.hide(); }}
      onFocus={(event) => { onFocus?.(event); managedTooltip.show(0); }}
      onBlur={(event) => { onBlur?.(event); managedTooltip.hide(); }}
      onKeyDown={(event) => { onKeyDown?.(event); if (event.key === 'Escape') managedTooltip.hide(); }}
      data-testid={testId}
    >{icon}</button>
    {managedTooltip.tooltip}
  </>;
}

export function ToolbarAction({ label, icon, text, active = false, testId, className = '', title, onPointerEnter, onPointerLeave, onFocus, onBlur, onKeyDown, ...props }: ProductButtonProps & {
  text?: string;
}) {
  const managedTooltip = useManagedTooltip(title ?? label);
  return <>
    <button
      {...props}
      ref={managedTooltip.anchorRef}
      type={props.type ?? 'button'}
      className={`ui-toolbar-action ${text ? 'ui-toolbar-action--labeled' : ''} ${active ? 'is-active active' : ''} ${className}`.trim()}
      aria-label={label}
      aria-describedby={managedTooltip.open ? managedTooltip.tooltipId : undefined}
      onPointerEnter={(event) => { onPointerEnter?.(event); managedTooltip.show(); }}
      onPointerLeave={(event) => { onPointerLeave?.(event); managedTooltip.hide(); }}
      onFocus={(event) => { onFocus?.(event); managedTooltip.show(0); }}
      onBlur={(event) => { onBlur?.(event); managedTooltip.hide(); }}
      onKeyDown={(event) => { onKeyDown?.(event); if (event.key === 'Escape') managedTooltip.hide(); }}
      data-testid={testId}
    >{icon}{text && <span>{text}</span>}</button>
    {managedTooltip.tooltip}
  </>;
}

export function Menu({ label, className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & {
  label: string;
}) {
  return <div {...props} className={`ui-menu ${className}`.trim()} role={props.role ?? 'menu'} aria-label={label}>{children}</div>;
}

export function MenuItem({ icon, label, description, trailing, className = '', ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon?: ReactNode;
  label: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return <button {...props} type={props.type ?? 'button'} role={props.role ?? 'menuitem'} className={`ui-menu-item ${className}`.trim()}>
    {icon && <span className="ui-menu-item-icon">{icon}</span>}
    <span className="ui-menu-item-copy"><strong>{label}</strong>{description && <small>{description}</small>}</span>
    {trailing && <span className="ui-menu-item-trailing">{trailing}</span>}
  </button>;
}

export function TabStrip({ label, className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & {
  label: string;
}) {
  return <div {...props} className={`ui-tab-strip ${className}`.trim()} role="tablist" aria-label={label}>{children}</div>;
}

export function Tab({ label, leading, active = false, className = '', mainClassName = '', closeClassName = '', labelClassName = '', testId, closeTestId, closeLabel, onActivate, onClose, ...props }: HTMLAttributes<HTMLDivElement> & {
  label: string;
  leading?: ReactNode;
  active?: boolean;
  mainClassName?: string;
  closeClassName?: string;
  labelClassName?: string;
  testId?: string;
  closeTestId?: string;
  closeLabel?: string;
  onActivate: () => void;
  onClose: () => void;
}) {
  return <div {...props} className={`ui-tab ${active ? 'is-active active' : ''} ${className}`.trim()}>
    <button type="button" className={`ui-tab-main ${mainClassName}`.trim()} role="tab" aria-selected={active} title={label} onClick={onActivate} data-testid={testId}>
      {leading}<span className={`ui-tab-label ${labelClassName}`.trim()}>{label}</span>
    </button>
    <button type="button" className={`ui-tab-close ${closeClassName}`.trim()} aria-label={closeLabel ?? `关闭 ${label}`} onClick={onClose} data-testid={closeTestId ?? (testId ? `${testId}-close` : undefined)}><AppIcon name="close" size="sm"/></button>
  </div>;
}

export interface SelectMenuOption<T extends string = string> {
  value: T;
  label: string;
  triggerLabel?: string;
  description?: string;
  disabled?: boolean;
  icon?: ReactNode;
  tone?: 'warning';
}

export function ChevronIcon({ open = false }: { open?: boolean }) {
  return <span className={`ui-chevron chevron-icon ${open ? 'open' : ''}`} aria-hidden="true"><AppIcon name="chevronDown" size="sm"/></span>;
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
      {leading}<span className="ui-select-value select-menu-value">{selected?.triggerLabel ?? selected?.label ?? ariaLabel}</span>{!hideChevron && <ChevronIcon open={open} />}
    </button>
    {open && <div className="ui-select-popover select-menu-popover" role="listbox" aria-label={ariaLabel} data-surface="overlay" data-testid={testId ? `${testId}-menu` : undefined}>
      {options.map((option) => <button key={option.value || 'empty'} className={option.tone ? `is-${option.tone}` : undefined} type="button" role="option" aria-selected={option.value === value} disabled={option.disabled} onClick={() => { onChange(option.value); setOpen(false); }} data-testid={testId ? `${testId}-option-${option.value || 'empty'}` : undefined}>
        <span className="ui-select-option-content">{option.icon && <span className="ui-select-option-icon">{option.icon}</span>}<span className="ui-select-option-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span></span>{option.value === value && <span className="ui-select-check" aria-hidden="true"><AppIcon name="check" size="sm"/></span>}
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

  return <div className="ui-dialog-backdrop dialog-backdrop" role="presentation" data-effect="backdrop-dim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="ui-dialog action-dialog" role="dialog" aria-modal="true" aria-labelledby={`${testId ?? 'action-dialog'}-title`} data-surface="overlay" data-testid={testId}>
      <header><h2 id={`${testId ?? 'action-dialog'}-title`}>{title}</h2><IconButton size="sm" label="关闭" icon={<AppIcon name="close" size="sm"/>} onClick={onCancel} /></header>
      {description && <p>{description}</p>}
      {value !== undefined && (multiline
        ? <textarea ref={inputRef as RefObject<HTMLTextAreaElement>} value={value} onChange={(event) => onChange?.(event.target.value)} />
        : <input ref={inputRef as RefObject<HTMLInputElement>} value={value} onChange={(event) => onChange?.(event.target.value)} />)}
      <footer><Button variant="secondary" className="dialog-cancel" onClick={onCancel}>取消</Button><Button variant={danger ? 'danger' : 'primary'} className={danger ? 'dialog-danger' : 'dialog-confirm'} disabled={value !== undefined && !value.trim()} onClick={onConfirm}>{confirmLabel}</Button></footer>
    </section>
  </div>;
}
