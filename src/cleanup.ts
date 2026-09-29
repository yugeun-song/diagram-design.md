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
