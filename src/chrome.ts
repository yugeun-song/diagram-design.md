import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { onCleanup, removeDir } from './cleanup.ts';

type Message = { id?: number; method?: string; params?: any; result?: any; error?: { message: string }; sessionId?: string };

export interface Page {
  eval<T>(expression: string): Promise<T>;
  capture(selector: string, index: number, scale: number): Promise<Buffer>;
  close(): Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

export function exited(proc: ChildProcess, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) return resolve();
    const timer = setTimeout(resolve, ms);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

export function killGroup(proc: ChildProcess | null): void {
  if (!proc?.pid || proc.exitCode !== null || proc.signalCode !== null) return;
  try { process.kill(-proc.pid, 'SIGKILL'); } catch {}
}

export class Chrome {
  private proc: ChildProcess;
  private profile: string;
  private writer: Writable;
  private next = 0;
  private pending = new Map<number, { resolve: (m: Message) => void; reject: (e: Error) => void }>();
  private listeners = new Set<(m: Message) => void>();
  private failure: Error | null = null;
  private release: () => void;

  constructor() {
    this.profile = mkdtempSync(join(tmpdir(), 'dg-chrome-'));
    this.proc = spawn(process.env.CHROME ?? 'google-chrome-stable', [
      '--headless=new', '--remote-debugging-pipe', `--user-data-dir=${this.profile}`, '--no-first-run',
      '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--hide-scrollbars',
      '--font-render-hinting=none', 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], detached: true });
    this.release = onCleanup(() => this.reap());
    const fail = (error: Error) => {
      this.failure ??= error;
      for (const waiter of this.pending.values()) waiter.reject(this.failure);
      this.pending.clear();
    };
    this.proc.on('error', (error) => fail(new Error(`cannot start chrome: ${error.message}`)));
    this.proc.on('exit', () => fail(new Error('chrome exited')));
    const writer = this.proc.stdio[3] as Writable | null;
    const reader = this.proc.stdio[4] as Readable | null;
    if (!writer || !reader) {
      this.release();
      this.reap();
      throw new Error('cannot open the chrome pipe');
    }
    this.writer = writer;
    writer.on('error', fail);
    reader.on('error', fail);
    let buffer = '';
    reader.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let end: number;
      while ((end = buffer.indexOf('\0')) >= 0) {
        const message: Message = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        const waiter = message.id !== undefined ? this.pending.get(message.id) : undefined;
        if (waiter) {
          this.pending.delete(message.id!);
          if (message.error) waiter.reject(new Error(message.error.message));
          else waiter.resolve(message);
        } else {
          for (const listener of this.listeners) listener(message);
        }
      }
    });
  }

  send(method: string, params: object = {}, sessionId?: string, timeout = 60000): Promise<any> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`chrome did not answer ${method} within ${timeout / 1000}s`));
      }, timeout);
      this.pending.set(id, {
        resolve: (m) => { clearTimeout(timer); resolve(m.result); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.writer.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }

  private event(method: string, sessionId: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.listeners.delete(listener); reject(new Error(`timed out waiting for ${method}`)); }, timeout);
      const listener = (m: Message) => {
        if (m.method !== method || m.sessionId !== sessionId) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve();
      };
      this.listeners.add(listener);
    });
  }

  async open(url: string, width: number, init = ''): Promise<Page> {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    await this.send('Page.enable', {}, sessionId);
    await this.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await this.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
    if (init) await this.send('Page.addScriptToEvaluateOnNewDocument', { source: init }, sessionId);
    const loaded = this.event('Page.loadEventFired', sessionId, 30000);
    await this.send('Page.navigate', { url }, sessionId);
    await loaded;
    const evaluate = async <T>(expression: string): Promise<T> => {
      const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return result.value as T;
    };
    return {
      eval: evaluate,
      capture: async (selector, index, scale) => {
        const box = await evaluate<{ x: number; y: number; width: number; height: number }>(
          `const r = document.querySelectorAll(${JSON.stringify(selector)})[${index}].getBoundingClientRect(); const x = Math.floor(r.left + scrollX), y = Math.floor(r.top + scrollY); return { x, y, width: Math.ceil(r.right + scrollX) - x, height: Math.ceil(r.bottom + scrollY) - y };`);
        const { data } = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { ...box, scale } }, sessionId);
        return Buffer.from(data, 'base64');
      },
      close: async () => { await this.send('Target.closeTarget', { targetId }); },
    };
  }

  private reap(): void {
    killGroup(this.proc);
    removeDir(this.profile);
  }

  async close(): Promise<void> {
    if (!this.failure) {
      await Promise.race([this.send('Browser.close', {}, undefined, 3000).catch(() => {}), wait(3000)]);
      await exited(this.proc, 3000);
    }
    this.release();
    this.reap();
  }
}
