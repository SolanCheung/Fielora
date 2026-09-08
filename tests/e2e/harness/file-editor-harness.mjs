// Exercise the editor's real text input path, including its selection and undo
// history, instead of invoking a textarea setter on a presentation element.
// Keep a renderer performance test visible to Chromium when the test runner's
// own window overlaps it. This is a test-only launch flag, never a product flag.
export const renderingTestArgs = ['--disable-features=CalculateNativeWinOcclusion'];

export async function replaceFileContent(cdp, selector, value) {
  await cdp.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await cdp.send('Input.insertText', { text: value });
}
