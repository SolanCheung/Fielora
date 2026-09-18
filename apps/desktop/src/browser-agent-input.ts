export type BrowserInputExecution = { inputState: string };

// Delivery and the following observation are different operations. Never retry
// native input because a page transition invalidated an observation.
export async function dispatchBrowserClick(
  execution: BrowserInputExecution,
  send: (type: 'mouseMove' | 'mouseDown' | 'mouseUp') => void | Promise<void>,
  observe: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  execution.inputState = 'DISPATCHING';
  await send('mouseMove');
  await send('mouseDown');
  await send('mouseUp');
  execution.inputState = 'DISPATCHED';
  const observation = await observe();
  return { ...observation, input_state: 'DISPATCHED', outcome_unknown: false,
    ...(observation.success === false ? { observation_required: true,
      guidance: 'Native input was dispatched once. The following observation failed; inspect again without repeating the click. Delivery is not verification.' } : {}) };
}
