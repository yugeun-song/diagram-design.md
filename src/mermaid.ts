const CLASSES = new Set(['accent', 'muted', 'danger']);

export function lintMermaid(source: string): string[] {
  const problems: string[] = [];
  source.split('\n').forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (/^\s*(%%\{|classDef\b|style\b|linkStyle\b)/.test(line)) problems.push(`${at}: the page supplies the look; drop this line`);
    for (const m of line.matchAll(/:::([\w-]+)/g)) if (!CLASSES.has(m[1])) problems.push(`${at}: unknown class ${m[1]}`);
    if (/:::[\w-]+:::/.test(line)) problems.push(`${at}: one class per node`);
  });
  return problems;
}
