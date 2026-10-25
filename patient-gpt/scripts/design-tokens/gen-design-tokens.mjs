#!/usr/bin/env node
// Generate the web and Flutter token files from the single token source.
//
//   node scripts/design-tokens/gen-design-tokens.mjs [repo-root]
//
// Reads  assets/templates/design-tokens/tokens.toml
// Writes web/src/styles/tokens.css
//        mobile/lib/core/theme/tokens.dart
//
// Both outputs are overwritten wholesale and carry a DO-NOT-EDIT banner. To add
// or change a token, edit tokens.toml and re-run; an edit to an output is
// reverted by the next run.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const src = join(root, 'assets/templates/design-tokens/tokens.toml');
const BANNER = 'GENERATED from assets/templates/design-tokens/tokens.toml by scripts/design-tokens/gen-design-tokens.mjs. DO NOT EDIT.';

// The source is shape-stable (sections of `key = "string"`), so a small reader
// keeps the generator dependency-free. A '#' inside quotes is a hex colour, not
// a comment, so only an unquoted '#' starts a comment.
function parse(text) {
  const data = {};
  let section = null;
  for (const raw of text.split('\n')) {
    let line = '';
    let quoted = false;
    for (const ch of raw) {
      if (ch === '"') quoted = !quoted;
      if (ch === '#' && !quoted) break;
      line += ch;
    }
    line = line.trim();
    if (!line) continue;
    const head = line.match(/^\[([\w.-]+)\]$/);
    if (head) {
      section = head[1];
      data[section] ??= {};
      continue;
    }
    const kv = line.match(/^([\w-]+)\s*=\s*"(.*)"$/);
    if (!kv || !section) throw new Error(`tokens.toml: cannot parse line: ${raw}`);
    data[section][kv[1]] = kv[2];
  }
  return data;
}

const t = parse(readFileSync(src, 'utf8'));
const required = ['color.light', 'color.dark', 'font', 'size', 'radius', 'layout', 'motion', 'breakpoint'];
for (const s of required) if (!t[s]) throw new Error(`tokens.toml: missing [${s}]`);
for (const k of Object.keys(t['color.dark'])) {
  if (!(k in t['color.light'])) throw new Error(`tokens.toml: dark colour ${k} has no light value`);
}

// ── CSS ────────────────────────────────────────────────────────────────
function cssBlock(entries, prefix = '') {
  return Object.entries(entries).map(([k, v]) => `  --${prefix}${k}: ${v};`).join('\n');
}
const css = `/* ${BANNER} */

:root {
  color-scheme: light;
${cssBlock(t['color.light'])}
${cssBlock(t.font, 'font-')}
${cssBlock(t.size, 'fs-')}
${cssBlock(t.radius)}
${cssBlock(t.layout)}
${cssBlock(t.motion)}
${cssBlock(t.breakpoint, 'bp-')}
}

html.dark {
  color-scheme: dark;
${cssBlock(t['color.dark'])}
}
`;

// ── Dart ───────────────────────────────────────────────────────────────
// Dart reserved words cannot be field names; the clinical `void` state becomes
// `voidState` (parent repo convention), leaving `voidSurface` as is.
const DART_RENAMES = { void: 'voidState' };
const camel = (k) => {
  const c = k.replace(/-(\w)/g, (_, ch) => ch.toUpperCase()).replace(/^(\d)/, 's$1');
  return DART_RENAMES[c] ?? c;
};
function dartColor(v) {
  const hex = v.match(/^#([0-9a-fA-F]{6})$/);
  if (hex) return `Color(0xFF${hex[1].toUpperCase()})`;
  const rgba = v.match(/^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/);
  if (rgba) return `Color.fromRGBO(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${rgba[4]})`;
  throw new Error(`tokens.toml: unsupported colour ${v}`);
}
const REM = 16;
function px(v) {
  const m = v.match(/^([\d.]+)(px|rem)$/);
  if (!m) throw new Error(`tokens.toml: unsupported length ${v}`);
  return Number(m[1]) * (m[2] === 'rem' ? REM : 1);
}
// clamp(min, preferred, max) has no viewport unit in Flutter; native shells
// take the bounds and choose by available width.
function sizeFields(k, v) {
  const c = v.match(/^clamp\(([\d.]+rem),.*,\s*([\d.]+rem)\)$/);
  if (c) return [`  static const double ${camel(k)}Min = ${px(c[1])};`, `  static const double ${camel(k)}Max = ${px(c[2])};`];
  return [`  static const double ${camel(k)} = ${px(v)};`];
}
const family = (v) => v.split(',')[0].trim().replace(/'/g, '');
function cubic(v) {
  const m = v.match(/^cubic-bezier\(([^)]+)\)$/);
  if (!m) throw new Error(`tokens.toml: unsupported easing ${v}`);
  return `Cubic(${m[1].split(',').map((n) => n.trim()).join(', ')})`;
}
const ms = (v) => Number(v.replace(/ms$/, ''));

function colorClass(name, entries, base) {
  const all = { ...base, ...entries };
  const fields = Object.entries(all).map(([k, v]) => `    ${camel(k)}: ${dartColor(v)},`).join('\n');
  return `  static const ${name} = PgColors(\n${fields}\n  );`;
}
const colorKeys = Object.keys(t['color.light']);
const dart = `// ${BANNER}
// ignore_for_file: constant_identifier_names

import 'package:flutter/animation.dart';

/// Colour roles, one instance per theme. Names match the prototype's CSS
/// custom properties (--fg-2 → fg2).
class PgColors {
  const PgColors({
${colorKeys.map((k) => `    required this.${camel(k)},`).join('\n')}
  });

${colorKeys.map((k) => `  final Color ${camel(k)};`).join('\n')}

${colorClass('light', {}, t['color.light'])}

${colorClass('dark', t['color.dark'], t['color.light'])}
}

class PgFonts {
${Object.entries(t.font).map(([k, v]) => `  static const String ${camel(k)} = '${family(v)}';`).join('\n')}
}

/// Logical pixels; 1rem = ${REM}.
class PgSizes {
${Object.entries(t.size).flatMap(([k, v]) => sizeFields(k, v)).join('\n')}
}

class PgRadius {
${Object.entries(t.radius).map(([k, v]) => `  static const double ${camel(k)} = ${px(v)};`).join('\n')}
}

class PgLayout {
${Object.entries(t.layout).map(([k, v]) => `  static const double ${camel(k)} = ${px(v)};`).join('\n')}
}

class PgBreakpoint {
${Object.entries(t.breakpoint).map(([k, v]) => `  static const double ${camel(k)} = ${px(v)};`).join('\n')}
}

class PgMotion {
  static const Curve ease = ${cubic(t.motion.ease)};
  static const Duration enter = Duration(milliseconds: ${ms(t.motion['dur-enter'])});
  static const Duration exit = Duration(milliseconds: ${ms(t.motion['dur-exit'])});
}
`;

function write(rel, text) {
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote ${rel}`);
}
write('web/src/styles/tokens.css', css);
write('mobile/lib/core/theme/tokens.dart', dart);
