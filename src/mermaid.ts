const CLASSES = new Set(['accent', 'info', 'warn', 'danger', 'muted', 'code']);

export function lintMermaid(source: string): string[] {
  const problems: string[] = [];
  source.split('\n').forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (/^\s*(%%\{|classDef\b|style\b|linkStyle\b)/.test(line)) problems.push(`${at}: the page supplies the look; drop this line`);
    if (/-\.+-?>|-\.\s/.test(line)) problems.push(`${at}: dotted edges render solid; use --> or -- label -->`);
    if (/&[a-z#][\w]*;|<[a-z/!?]/i.test(line)) problems.push(`${at}: the page does not escape the source, so tags and entities break`);
    for (const m of line.matchAll(/:::([\w-]+)/g)) if (!CLASSES.has(m[1])) problems.push(`${at}: unknown class ${m[1]}`);
    if (/:::[\w-]+:::/.test(line)) problems.push(`${at}: one class per node`);
  });
  return problems;
}
