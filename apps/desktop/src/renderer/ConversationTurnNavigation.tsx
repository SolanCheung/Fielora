import { useEffect, useRef, useState, type RefObject } from 'react';
import { TooltipButton } from './UiPrimitives';

interface ConversationTurnNavigationProps {
  turns: readonly { id: string; content: string }[];
  scrollContainer: RefObject<HTMLDivElement | null>;
  onNavigate: () => void;
}

export function ConversationTurnNavigation({ turns, scrollContainer, onNavigate }: ConversationTurnNavigationProps) {
  const markersRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const list = scrollContainer.current;
    if (!list || turns.length < 4) { setVisible(false); return undefined; }
    let frame = 0;
    const update = () => {
      frame = 0;
      setVisible(list.scrollHeight > list.clientHeight + 32);
      const readingTop = list.getBoundingClientRect().top + 60;
      const anchors = new Map([...list.querySelectorAll<HTMLElement>('[data-message-id]')].map((element) => [element.dataset.messageId, element]));
      let active = turns[0]!.id;
      for (const turn of turns) {
        const anchor = anchors.get(turn.id);
        if (anchor && anchor.getBoundingClientRect().top <= readingTop) active = turn.id;
      }
      if (list.scrollHeight - list.scrollTop - list.clientHeight < 2) active = turns[turns.length - 1]!.id;
      setActiveId(active);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    const observe = () => {
      resize.disconnect();
      resize.observe(list);
      for (const child of list.children) resize.observe(child);
      schedule();
    };
    // Also track newly inserted Agent turns; streaming and expanded details resize their parent.
    const mutations = new MutationObserver(observe);
    mutations.observe(list, { childList: true });
    observe();
    list.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      list.removeEventListener('scroll', schedule);
      mutations.disconnect();
      resize.disconnect();
    };
  }, [scrollContainer, turns]);

  useEffect(() => {
    const markers = markersRef.current;
    const active = markers?.querySelector<HTMLElement>('[aria-current]');
    if (!markers || !active) return;
    const top = active.offsetTop;
    if (top < markers.scrollTop) markers.scrollTop = top;
    else if (top + active.offsetHeight > markers.scrollTop + markers.clientHeight) markers.scrollTop = top + active.offsetHeight - markers.clientHeight;
  }, [activeId, visible]);

  if (!visible) return null;
  return <nav className="conversation-turn-navigation" aria-label="对话轮次导航" data-testid="conversation-turn-navigation">
    <div className="conversation-turn-markers" ref={markersRef}>
      {turns.map((turn, index) => {
        const label = `第 ${index + 1} 轮：${turn.content.replace(/\s+/g, ' ').trim().slice(0, 72) || '附件消息'}`;
        return <TooltipButton key={turn.id} className="conversation-turn-marker" tooltip={label} variant="default" placement="right" aria-label={label} aria-current={activeId === turn.id ? 'location' : undefined} data-turn-id={turn.id}
          onKeyDown={(event) => {
            const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
            if (!direction && event.key !== 'Home' && event.key !== 'End') return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? turns.length - 1 : Math.max(0, Math.min(turns.length - 1, index + direction));
            markersRef.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus({ preventScroll: true });
            const target = markersRef.current?.querySelectorAll<HTMLButtonElement>('button')[next];
            if (target && markersRef.current) markersRef.current.scrollTop = target.offsetTop - markersRef.current.clientHeight / 2;
          }}
          onClick={() => {
            const list = scrollContainer.current;
            const anchor = [...list?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []].find((element) => element.dataset.messageId === turn.id);
            if (!list || !anchor) return;
            onNavigate();
            list.scrollTo({ top: list.scrollTop + anchor.getBoundingClientRect().top - list.getBoundingClientRect().top - 16, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
          }}><span aria-hidden="true"/></TooltipButton>;
      })}
    </div>
  </nav>;
}
