import { createConnection } from 'node:net';

/** Probe a local listening socket, never an HTTP route, redirect or credential. */
export function browserServerAddress(value: unknown): URL {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('BROWSER_SERVER_URL_REJECTED');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('BROWSER_SERVER_URL_REJECTED'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || !(host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host))) throw new Error('BROWSER_SERVER_URL_REJECTED');
  return url;
}

export async function probeBrowserServer(value: unknown, signal: AbortSignal): Promise<Record<string, unknown>> {
  const url = browserServerAddress(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (signal.aborted) throw new Error('BROWSER_CANCELLED');
  const connect = (address: string) => new Promise<boolean>((resolve, reject) => {
    const socket = createConnection({ host: address, port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)) });
    const finish = (ready: boolean) => { socket.destroy(); signal.removeEventListener('abort', abort); resolve(ready); };
    const abort = () => { socket.destroy(); signal.removeEventListener('abort', abort); reject(new Error('BROWSER_CANCELLED')); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(2000, () => finish(false));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
  // Do not let DNS/hosts-file resolution turn a local readiness check into an external connection.
  let listening = false;
  for (const address of host === 'localhost' ? ['127.0.0.1', '::1'] : [host]) {
    listening = await connect(address);
    if (listening) break;
  }
  return { readiness: listening ? 'LISTENING' : 'NOT_LISTENING', checked_origin: url.origin,
    page_verified: false, guidance: listening
      ? 'A socket accepts connections at this address. Open and inspect the actual page; this does not prove HTTP readiness, login state or UI correctness.'
      : 'No connection at this address. Check the dev-server host, port and protocol in its configuration and process output. Do not infer a port from an arbitrary flag or infer login from a blank/failed page.' };
}
