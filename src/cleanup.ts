import { rmSync } from 'node:fs';

const tasks = new Set<() => void>();
let installed = false;

function runAll(): void {
  for (const task of [...tasks]) {
    tasks.delete(task);
    try { task(); } catch {}
  }
}

export function onCleanup(task: () => void): () => void {
  if (!installed) {
    installed = true;
    process.once('exit', runAll);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.once(signal, () => {
        runAll();
        process.kill(process.pid, signal);
      });
    }
  }
  tasks.add(task);
  return () => { tasks.delete(task); };
}

// A Chrome helper can still be writing into its profile for a moment after the browser exits.
export function removeDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    console.error(`dg: could not remove ${dir}: ${(error as Error).message}`);
  }
}
