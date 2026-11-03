import * as canvas from './canvas.ts';
import * as memoryLayout from './memory-layout.ts';
import * as memoryTable from './memory-table.ts';
import { isRecord, type ProfileName, type Scene } from './scene.ts';
import * as structChain from './struct-chain.ts';
import * as textTable from './text-table.ts';

export const FORMS = [
  'memory-layout',
  'memory-table',
  'struct-chain',
  'canvas',
  'text-table',
] as const;

export type Form = (typeof FORMS)[number];

export const isForm = (name: string): name is Form =>
  (FORMS as readonly string[]).includes(name);

export const isProfile = (name: string): name is ProfileName =>
  name === 'blog' || name === 'slide';

const has = (spec: unknown, key: string) =>
  isRecord(spec) && Object.hasOwn(spec, key);

/** The form of a spec that names none, told by the field only that form has. */
export function formOf(spec: unknown): Form {
  if (has(spec, 'items')) return 'canvas';
  if (has(spec, 'columns')) return 'text-table';
  if (has(spec, 'regions')) return 'memory-layout';
  if (has(spec, 'nodes')) return 'struct-chain';
  return 'memory-table';
}

/** Lays out a parsed spec. Each form checks every field before it trusts the type cast here. */
export function layoutOf(
  form: Form,
  spec: unknown,
  profile: ProfileName = 'blog',
): Scene {
  switch (form) {
    case 'memory-layout':
      return memoryLayout.layout(
        spec as memoryLayout.MemoryLayout,
        memoryLayout.PROFILES[profile],
      );
    case 'memory-table':
      return memoryTable.layout(
        memoryTable.grid(spec as memoryTable.MemoryTable),
        memoryTable.PROFILES[profile],
      );
    case 'struct-chain':
      return structChain.layout(
        spec as structChain.StructChain,
        structChain.PROFILES[profile],
      );
    case 'canvas':
      return canvas.layout(spec as canvas.Canvas, canvas.PROFILES[profile]);
    case 'text-table':
      return textTable.layout(
        spec as textTable.TextTable,
        textTable.PROFILES[profile],
      );
  }
}
