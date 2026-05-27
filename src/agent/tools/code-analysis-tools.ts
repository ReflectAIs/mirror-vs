import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToolCall } from '../types';

// ── Helpers ──
function isSourceFile(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.py', '.go', '.rs', '.java', '.rb', '.php'].includes(ext);
}
function isBinary(name: string): boolean {
  const ext = path.extname(name).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.o', '.obj'].includes(ext);
}
function shouldSkip(name: string): boolean {
  return ['node_modules', 'dist', 'out', '.git', '.mirror-vs', 'build', '.next', '.nuxt', 'coverage', '.nyc_output', '__pycache__', '.venv', 'venv', 'env', 'target', 'bin', 'obj', '.husky', '.vscode'].includes(name);
}
function getRoot(): string {
  const f = vscode.workspace.workspaceFolders;
  if (!f?.length) throw new Error('No workspace open.');
  return f[0].uri.fsPath;
}
function isTest(path_: string): boolean {
  const n = path.basename(path_).toLowerCase();
  return n.includes('.test.') || n.includes('.spec.') || n.includes('_test.') || n.endsWith('.test.ts') || n.endsWith('.spec.ts');
}
function collectSrc(root: string): string[] {
  const r: string[] = [];
  const w = (d: string) => {
    for (const e of fs.readdirSync(d)) {
      if (shouldSkip(e)) continue;
      const fp = path.join(d, e);
      const s = fs.statSync(fp);
      if (s.isDirectory()) w(fp);
      else if (s.isFile() && isSourceFile(e)) r.push(fp);
    }
  };
  w(root);
  return r;
}

// ── Analyzer 1: Project Overview ──
function analyzeOverview(root: string): string {
  const files: { path: string; lines: number; size: number }[] = [];
  const lines: string[] = [];
  let totalFiles = 0, totalDirs = 0, srcFiles = 0, testFiles = 0, totalLOC = 0, totalBytes = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 6) return;
    for (const e of fs.readdirSync(dir)) {
      const fp = path.join(dir, e);
      const s = fs.statSync(fp);
      if (s.isDirectory()) {
        if (shouldSkip(e)) continue;
        totalDirs++;
        walk(fp, depth + 1);
      } else if (s.isFile()) {
        if (isBinary(e)) continue;
        totalFiles++;
        totalBytes += s.size;
        if (isSourceFile(e)) {
          srcFiles++;
          if (isTest(fp)) testFiles++;
          try {
            const c = fs.readFileSync(fp, 'utf8');
            const lc = c.split('\n').length;
            totalLOC += lc;
            files.push({ path: fp, lines: lc, size: s.size });
          } catch { /* skip */ }
        }
      }
    }
  };
  walk(root, 0);
  files.sort((a, b) => b.lines - a.lines);
  const top = files.slice(0, 30);
  let pm = 'unknown';
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) pm = 'pnpm';
  else if (fs.existsSync(path.join(root, 'yarn.lock'))) pm = 'yarn';
  else if (fs.existsSync(path.join(root, 'package-lock.json'))) pm = 'npm';
  else if (fs.existsSync(path.join(root, 'Cargo.toml'))) pm = 'cargo';
  else if (fs.existsSync(path.join(root, 'go.mod'))) pm = 'go modules';
  let fw = 'unknown';
  try {
    const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const deps = { ...p.dependencies, ...p.devDependencies };
    if (deps['next']) fw = 'Next.js';
    else if (deps['react']) fw = 'React';
    else if (deps['vue']) fw = 'Vue.js';
    else if (deps['@angular/core']) fw = 'Angular';
    else if (deps['svelte']) fw = 'Svelte';
    else if (deps['express']) fw = 'Express.js';
  } catch { /* ignore */ }
  lines.push(`📦 **Project: ${path.basename(root)}**`);
  lines.push('');
  lines.push('**Stats:**');
  lines.push(`- Total files: ${totalFiles}`);
  lines.push(`- Directories: ${totalDirs}`);
  lines.push(`- Source files: ${srcFiles}`);
  lines.push(`- Test files: ${testFiles}`);
  lines.push(`- Lines of code: ${totalLOC.toLocaleString()}`);
  lines.push(`- Size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  lines.push(`- Package manager: ${pm}`);
  lines.push(`- Framework: ${fw}`);
  lines.push('');
  lines.push(`**Top ${Math.min(30, top.length)} largest files:**`);
  for (const f of top) {
    const rel = path.relative(root, f.path);
    lines.push(`- \`${rel}\` — ${f.lines} lines, ${(f.size / 1024).toFixed(1)} KB${isTest(f.path) ? ' 🧪' : ''}`);
  }
  return lines.join('\n');
}

// ── Analyzer 2: File Classification ──
const categories: { name: string; pattern: RegExp; emoji: string }[] = [
  { name: 'Components/UI', pattern: /\/components\//i, emoji: '🎨' },
  { name: 'Pages/Routes', pattern: /\/(pages|routes|views|screens)\//i, emoji: '📄' },
  { name: 'Services/API', pattern: /\/(services|api|clients)\//i, emoji: '🔌' },
  { name: 'Hooks/Utils', pattern: /\/(hooks|utils|helpers|lib)\//i, emoji: '🪝' },
  { name: 'Types/Models', pattern: /\/(types|interfaces|models|dto)\//i, emoji: '📋' },
  { name: 'Config/Constants', pattern: /\/(config|settings|constants)\//i, emoji: '⚙️' },
  { name: 'Store/State', pattern: /\/(store|state|reducers|atoms)\//i, emoji: '🗄️' },
  { name: 'Styles', pattern: /\.(css|scss|less|styl)$/i, emoji: '💅' },
  { name: 'Tests', pattern: /\.(test|spec)\./i, emoji: '🧪' },
  { name: 'Database', pattern: /\/(db|database|migrations|models)\//i, emoji: '🗃️' },
  { name: 'Middleware', pattern: /\/(middleware|plugins)\//i, emoji: '🔗' },
];
function classifyFile(fp: string): string {
  for (const c of categories) { if (c.pattern.test(fp)) return `${c.emoji} ${c.name}`; }
  const e = path.extname(fp).toLowerCase();
  if (['.ts','.tsx'].includes(e)) return '📝 TypeScript';
  if (['.js','.jsx'].includes(e)) return '📝 JavaScript';
  if (e === '.json') return '📋 JSON';
  if (e === '.md') return '📖 Docs';
  return '📁 Other';
}
function classify(root: string): string {
  const all = collectSrc(root);
  const map = new Map<string, { count: number; loc: number; files: string[] }>();
  for (const f of all) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const cat = classifyFile(rel);
    if (!map.has(cat)) map.set(cat, { count: 0, loc: 0, files: [] });
    const e = map.get(cat)!;
    e.count++;
    try { e.loc += fs.readFileSync(f, 'utf8').split('\n').length; } catch { /* */ }
    if (e.files.length < 6) e.files.push(rel);
  }
  const lines: string[] = ['**📂 Project Structure by Category**', ''];
  for (const [cat, d] of Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`**${cat}** — ${d.count} files, ${d.loc.toLocaleString()} lines`);
    for (const f of d.files) lines.push(`  - \`${f}\``);
    if (d.files.length < d.count) lines.push(`  - ... and ${d.count - d.files.length} more`);
    lines.push('');
  }
  return lines.join('\n');
}

// ── Analyzer 3: Dependency & Circular Deps ──
interface Edge { from: string; to: string; line: number; }
function parseImports(fp: string): Edge[] {
  const r: Edge[] = [];
  try {
    const c = fs.readFileSync(fp, 'utf8');
    const re = /(?:import\s+(?:\{[^}]*\}\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(c)) !== null) {
      const imp = m[1] || m[2];
      if (imp.startsWith('.') || imp.startsWith('/')) r.push({ from: fp, to: imp, line: c.substring(0, m.index).split('\n').length });
    }
  } catch { /* */ }
  return r;
}
function resolve(importer: string, imp: string, root: string): string | null {
  const dir = path.dirname(importer);
  const res = imp.startsWith('/') ? path.join(root, imp) : path.resolve(dir, imp);
  if (fs.existsSync(res)) {
    if (fs.statSync(res).isDirectory()) {
      for (const ext of ['.ts','.tsx','.js','.jsx','.mjs','.mts','.cts','.json']) {
        const idx = path.join(res, `index${ext}`);
        if (fs.existsSync(idx)) return idx;
      }
      return null;
    }
    return res;
  }
  for (const ext of ['.ts','.tsx','.js','.jsx','.mjs','.mts','.cts','.vue','.json']) {
    const we = `${res}${ext}`;
    if (fs.existsSync(we)) return we;
  }
  return null;
}
function findCycles(root: string): string[][] {
  const all = collectSrc(root);
  const adj = new Map<string, string[]>();
  for (const f of all) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const deps: string[] = [];
    for (const e of parseImports(f)) {
      const r = resolve(f, e.to, root);
      if (r) { const tr = path.relative(root, r).replace(/\\/g, '/'); if (tr !== rel) deps.push(tr); }
    }
    adj.set(rel, deps);
  }
  const cycles: string[][] = [];
  const visited = new Set<string>(), rec = new Set<string>(), stk: string[] = [];
  const dfs = (n: string) => {
    visited.add(n); rec.add(n); stk.push(n);
    for (const nb of adj.get(n) || []) {
      if (!adj.has(nb)) continue;
      if (!visited.has(nb)) dfs(nb);
      else if (rec.has(nb)) { const s = stk.indexOf(nb); cycles.push([...stk.slice(s), nb]); }
    }
    stk.pop(); rec.delete(n);
  };
  for (const n of adj.keys()) if (!visited.has(n)) dfs(n);
  return cycles;
}
function depsAnalysis(root: string): string {
  const all = collectSrc(root);
  const lines: string[] = ['**🔗 Dependency Graph**', ''];
  const impMap = new Map<string, string[]>();
  for (const f of all) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const deps: string[] = [];
    for (const e of parseImports(f)) { const r = resolve(f, e.to, root); if (r) deps.push(path.relative(root, r).replace(/\\/g, '/')); }
    impMap.set(rel, deps);
  }
  const count = new Map<string, number>();
  for (const [, deps] of impMap) for (const d of deps) count.set(d, (count.get(d) || 0) + 1);
  lines.push('**Most Imported:**');
  for (const [f, c] of Array.from(count.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)) lines.push(`- \`${f}\` — ${c}x`);
  lines.push('');
  const rev = new Map<string, string[]>();
  for (const [f, deps] of impMap) for (const d of deps) { if (!rev.has(d)) rev.set(d, []); rev.get(d)!.push(f); }
  lines.push('**Core Modules (most dependents):**');
  for (const [f, deps] of Array.from(rev.entries()).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
    lines.push(`- \`${f}\` — ${deps.length} dependent${deps.length > 1 ? 's' : ''}`);
  }
  lines.push('');
  const cycles = findCycles(root);
  if (cycles.length) {
    lines.push(`**⚠️ ${cycles.length} Circular Dependenc${cycles.length > 1 ? 'ies' : 'y'}**`);
    for (let i = 0; i < Math.min(10, cycles.length); i++) {
      lines.push(`  Cycle ${i+1}: ${cycles[i].join(' → ')}`);
    }
    if (cycles.length > 10) lines.push(`  ... and ${cycles.length - 10} more`);
  } else lines.push('✅ No circular dependencies.');
  lines.push('');
  lines.push('**Entry Points (no local imports):**');
  let ec = 0;
  for (const [f, deps] of impMap) { if (!deps.length) { lines.push(`- \`${f}\``); ec++; if (ec >= 10) break; } }
  return lines.join('\n');
}

// ── Analyzer 4: Complexity Analysis ──
interface FuncMetric { name: string; line: number; lines: number; complexity: number; depth: number; }
function calcComplexity(code: string): number {
  let c = 1;
  for (const pat of [/\bif\b/g, /\belse if\b/g, /\bfor\b/g, /\bwhile\b/g, /\bcase\b/g, /\bcatch\b/g, /\b&&\b/g, /\b\|\|\b/g]) {
    const m = code.match(pat);
    if (m) c += m.length;
  }
  return c;
}
function getDepth(code: string): number {
  let max = 0, cur = 0;
  for (const ch of code) { if (ch === '{' || ch === '(') { cur++; max = Math.max(max, cur); } else if (ch === '}' || ch === ')') { cur = Math.max(0, cur - 1); } }
  return max;
}
function extractFuncs(fp: string): FuncMetric[] {
  const r: FuncMetric[] = [];
  try {
    const c = fs.readFileSync(fp, 'utf8');
    const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+\*?\s*(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\(|=>)|let\s+(\w+)\s*=\s*(?:async\s*)?(?:function|\(|=>)|(\w+)\s*\([^)]*\)\s*\{)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(c)) !== null) {
      const name = m[1] || m[2] || m[3] || m[4] || 'anon';
      const startLine = c.substring(0, m.index).split('\n').length;
      let braces = 0, pos = m.index + m[0].length;
      while (pos < c.length && c[pos] !== '{') { if (c[pos] === '(') braces++; if (c[pos] === ')') braces--; pos++; }
      if (pos < c.length && c[pos] === '{') {
        pos++; braces = 1; const bodyStart = pos;
        while (pos < c.length && braces > 0) { if (c[pos] === '{') braces++; if (c[pos] === '}') braces--; pos++; }
        const body = c.substring(bodyStart, pos - 1);
        const endLine = c.substring(0, pos).split('\n').length;
        r.push({ name, line: startLine, lines: endLine - startLine + 1, complexity: calcComplexity(body), depth: getDepth(body) });
      }
    }
  } catch { /* */ }
  return r;
}
function complexity(root: string): string {
  const lines: string[] = ['**📊 Complexity Analysis**', ''];
  const all: { file: string; funcs: FuncMetric[] }[] = [];
  let totalC = 0, totalF = 0;
  for (const f of collectSrc(root)) {
    const funcs = extractFuncs(f);
    if (funcs.length) {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      all.push({ file: rel, funcs });
      totalF += funcs.length;
      totalC += funcs.reduce((s, fn) => s + fn.complexity, 0);
    }
  }
  lines.push(`- Functions analyzed: ${totalF}`);
  lines.push(`- Average complexity: ${totalF ? (totalC / totalF).toFixed(2) : 'N/A'}`);
  lines.push('');
  const hotspots: { file: string; fn: FuncMetric }[] = [];
  for (const { file, funcs } of all) for (const fn of funcs) if (fn.complexity > 10 || fn.lines > 50) hotspots.push({ file, fn });
  hotspots.sort((a, b) => b.fn.complexity - a.fn.complexity);
  if (hotspots.length) {
    lines.push('**⚠️ Complexity Hotspots (complexity > 10 or lines > 50):**');
    for (const { file, fn } of hotspots.slice(0, 30)) {
      const w: string[] = [];
      if (fn.complexity > 20) w.push('🔴 HIGH'); else if (fn.complexity > 10) w.push('🟡 MED');
      if (fn.lines > 100) w.push('XL'); else if (fn.lines > 50) w.push('LONG');
      lines.push(`- \`${file}:${fn.line}\` **${fn.name}** — cc:${fn.complexity}, ${fn.lines}ln, depth:${fn.depth} ${w.join(',')}`);
    }
    lines.push('');
  } else lines.push('✅ No complexity hotspots.');
  lines.push('**Most Complex Files:**');
  const fileComplexity = all.map(({ file, funcs }) => ({
    file,
    avg: funcs.reduce((s, f) => s + f.complexity, 0) / funcs.length,
    max: Math.max(...funcs.map(f => f.complexity)),
    cnt: funcs.length,
  })).sort((a, b) => b.avg - a.avg).slice(0, 15);
  for (const fc of fileComplexity) {
    lines.push(`- \`${fc.file}\` — avg: ${fc.avg.toFixed(1)}, max: ${fc.max}, ${fc.cnt} funcs`);
  }
  return lines.join('\n');
}

// ── Analyzer 5: Test Coverage ──
function coverage(root: string): string {
  const all = collectSrc(root);
  const src = all.filter(f => !isTest(f));
  const tst = all.filter(f => isTest(f));
  const lines: string[] = ['**🧪 Test Coverage**', '', `- Source: ${src.length}`, `- Tests: ${tst.length}`, `- Ratio: ${src.length ? ((tst.length / src.length) * 100).toFixed(1) : 'N/A'}%`, ''];
  const tested = new Set<string>();
  for (const s of src) {
    const base = path.basename(s, path.extname(s));
    if (tst.some(t => { const tb = path.basename(t, path.extname(t)); return tb.includes(base) || base.includes(tb.replace(/\.(test|spec|_test)$/, '')); })) tested.add(s);
  }
  const untested = src.filter(f => !tested.has(f));
  lines.push(`- Tested: ${tested.size} (${src.length ? ((tested.size / src.length) * 100).toFixed(1) : 'N/A'}%)`);
  lines.push(`- Untested: ${untested.length} (${src.length ? ((untested.length / src.length) * 100).toFixed(1) : 'N/A'}%)`);
  lines.push('');
  if (untested.length) {
    lines.push('**Missing Tests:**');
    for (const f of untested.map(f => ({ path: path.relative(root, f), size: fs.statSync(f).size })).sort((a, b) => b.size - a.size).slice(0, 30)) {
      lines.push(`- \`${f.path}\` (${(f.size / 1024).toFixed(1)} KB)`);
    }
  }
  return lines.join('\n');
}

// ── Analyzer 6: Dead Code Detection ──
function deadCode(root: string): string {
  const src = collectSrc(root).filter(f => !isTest(f));
  const exports: { file: string; name: string; line: number; type: string }[] = [];
  for (const f of src) {
    try {
      const c = fs.readFileSync(f, 'utf8');
      if (!['.ts','.tsx','.js','.jsx','.mjs','.mts'].includes(path.extname(f))) continue;
      const re = /export\s+(?:default\s+)?(?:function\s+(\w+)|const\s+(\w+)|let\s+(\w+)|var\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(c)) !== null) {
        const name = m[1]||m[2]||m[3]||m[4]||m[5]||m[6]||m[7];
        if (!name) continue;
        let type = 'var';
        if (m[0].includes('function')) type = 'fn';
        else if (m[0].includes('class')) type = 'class';
        else if (m[0].includes('interface')) type = 'iface';
        else if (m[0].includes('type')) type = 'type';
        exports.push({ file: f, name, line: c.substring(0, m.index).split('\n').length, type });
      }
    } catch { /* */ }
  }
  const unused: typeof exports = [];
  for (const exp of exports) {
    let used = false;
    for (const f of src) {
      if (f === exp.file) continue;
      try {
        const c = fs.readFileSync(f, 'utf8');
        const pat = new RegExp(`\\b${exp.name}\\b`);
        for (const line of c.split('\n')) {
          const lo = line.toLowerCase();
          if ((lo.includes('import') || lo.includes('require') || lo.includes('from')) && pat.test(line)) { used = true; break; }
        }
      } catch { /* */ }
      if (used) break;
    }
    if (!used) unused.push(exp);
  }
  const lines: string[] = ['**🔍 Dead Code Analysis**', '', `- Exports: ${exports.length}`, `- Unused: ${unused.length}`, ''];
  if (unused.length) {
    lines.push('**Unused Exports:**');
    for (const u of unused.slice(0, 40)) lines.push(`- \`${path.relative(root, u.file).replace(/\\/g, '/')}:${u.line}\` **${u.name}** (${u.type})`);
    if (unused.length > 40) lines.push(`  ... and ${unused.length - 40} more`);
    lines.push('');
    lines.push('⚠️ Best-effort — dynamic imports may not be detected.');
  } else lines.push('✅ No unused exports found.');
  return lines.join('\n');
}

// ── Analyzer 7: Impact Analysis ──
function impact(root: string, target: string): string {
  const abs = path.isAbsolute(target) ? target : path.resolve(root, target);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${target}`);
  const rel = path.relative(root, abs).replace(/\\/g, '/');
  const lines: string[] = [`**🔗 Impact: \`${rel}\`**`, ''];
  const imports = parseImports(abs);
  lines.push(`**Imports (${imports.length}):**`);
  for (const imp of imports) {
    const r = resolve(abs, imp.to, root);
    lines.push(`- ❯ \`${r ? path.relative(root, r).replace(/\\/g, '/') : imp.to}\` (line ${imp.line})`);
  }
  lines.push('');
  const deps: { file: string; line: number }[] = [];
  for (const f of collectSrc(root)) {
    if (f === abs) continue;
    for (const imp of parseImports(f)) { const r = resolve(f, imp.to, root); if (r === abs) deps.push({ file: f, line: imp.line }); }
  }
  lines.push(`**Dependents (${deps.length}):**`);
  if (deps.length) {
    const byDir = new Map<string, number>();
    for (const d of deps) { const dir = path.dirname(path.relative(root, d.file)); byDir.set(dir, (byDir.get(dir) || 0) + 1); }
    for (const [dir, c] of Array.from(byDir.entries()).sort((a, b) => b[1] - a[1])) lines.push(`  - \`${dir}/\` — ${c} file${c > 1 ? 's' : ''}`);
    lines.push('');
    for (const d of deps.slice(0, 25)) lines.push(`  - \`${path.relative(root, d.file).replace(/\\/g, '/')}\` (line ${d.line})`);
    if (deps.length > 25) lines.push(`  ... and ${deps.length - 25} more`);
  } else lines.push('  No dependents.');
  lines.push('');
  lines.push('**Risk:**');
  if (!deps.length) lines.push('  ✅ Low — no dependents');
  else if (deps.length < 5) lines.push('  🟡 Medium — few dependents');
  else if (deps.length < 20) lines.push('  🟠 High — moderate dependents');
  else lines.push('  🔴 Very high — core module');
  return lines.join('\n');
}

function graphify(root: string): string {
  const all = collectSrc(root);
  
  // 1. Build directory tree
  const treeNodes = new Map<string, string[]>();
  const addPathToTree = (relPath: string) => {
    const parts = relPath.split('/');
    for (let i = 0; i < parts.length - 1; i++) {
      const parent = parts.slice(0, i + 1).join('/');
      const child = parts.slice(0, i + 2).join('/');
      if (!treeNodes.has(parent)) treeNodes.set(parent, []);
      const children = treeNodes.get(parent)!;
      if (!children.includes(child)) children.push(child);
    }
  };

  const relFiles = all.map(f => path.relative(root, f).replace(/\\/g, '/'));
  
  const roots = new Set<string>();
  for (const f of relFiles) {
    addPathToTree(f);
    const firstPart = f.split('/')[0];
    roots.add(firstPart);
  }

  const printTree = (node: string, prefix: string = '', isLast: boolean = true): string => {
    const name = path.basename(node);
    let output = prefix + (isLast ? '└── ' : '├── ') + name + '\n';
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    const children = treeNodes.get(node) || [];
    const subDirs = children;
    const leafFiles = relFiles.filter(f => {
      const dir = path.dirname(f);
      return (dir === node && !subDirs.some(sd => sd === f)) || (node === f && !treeNodes.has(f));
    });

    const allChildren = [
      ...subDirs.map(sd => ({ path: sd, isDir: true })),
      ...leafFiles.map(lf => ({ path: lf, isDir: false }))
    ].sort((a, b) => a.path.localeCompare(b.path));

    allChildren.forEach((child, idx) => {
      const last = idx === allChildren.length - 1;
      if (child.isDir) {
        output += printTree(child.path, newPrefix, last);
      } else {
        output += newPrefix + (last ? '└── ' : '├── ') + path.basename(child.path) + '\n';
      }
    });
    return output;
  };

  let treeOutput = '📂 **Project Structure Tree:**\n```\n';
  const rootList = Array.from(roots).sort();
  rootList.forEach((r, idx) => {
    const last = idx === rootList.length - 1;
    if (treeNodes.has(r) || relFiles.includes(r)) {
      if (treeNodes.has(r)) {
        treeOutput += printTree(r, '', last);
      } else {
        treeOutput += (last ? '└── ' : '├── ') + r + '\n';
      }
    }
  });
  treeOutput += '```\n\n';

  // 2. Build Dependency graph
  const impMap = new Map<string, string[]>();
  for (const f of all) {
    const rel = path.relative(root, f).replace(/\\/g, '/');
    const deps: string[] = [];
    for (const e of parseImports(f)) {
      const r = resolve(f, e.to, root);
      if (r) deps.push(path.relative(root, r).replace(/\\/g, '/'));
    }
    if (deps.length > 0) impMap.set(rel, deps);
  }

  let depOutput = '🔗 **Module Dependency Graph (Mermaid):**\n```mermaid\ngraph TD\n';
  const connections: string[] = [];
  const nodeIds = new Map<string, string>();
  let idCounter = 0;
  const getNodeId = (filePath: string) => {
    if (!nodeIds.has(filePath)) {
      idCounter++;
      nodeIds.set(filePath, `N${idCounter}`);
    }
    return nodeIds.get(filePath)!;
  };

  for (const [file, deps] of impMap.entries()) {
    const fromId = getNodeId(file);
    depOutput += `  ${fromId}["${file}"]\n`;
    for (const d of deps) {
      const toId = getNodeId(d);
      depOutput += `  ${toId}["${d}"]\n`;
      connections.push(`  ${fromId} --> ${toId}`);
    }
  }
  depOutput += connections.join('\n') + '\n```\n';

  return treeOutput + depOutput;
}

// ── Main Export ──
export async function executeCodeAnalysisTool(tool: ToolCall): Promise<string> {
  const start = Date.now();
  const root = getRoot();
  let result: string;
  switch (tool.name) {
    case 'analyze_project':
      result = analyzeOverview(root) + '\n\n' + classify(root);
      break;
    case 'analyze_dependencies':
      result = depsAnalysis(root);
      break;
    case 'analyze_complexity':
      result = complexity(root);
      break;
    case 'analyze_coverage':
      result = coverage(root);
      break;
    case 'analyze_dead_code':
      result = deadCode(root);
      break;
    case 'analyze_impact':
      if (!tool.path) throw new Error('Missing "path" for analyze_impact.');
      result = impact(root, tool.path);
      break;
    case 'graphify':
      result = graphify(root);
      break;
    default:
      throw new Error(`Unknown code analysis tool: ${tool.name}`);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  return `${result}\n\n_Analysis completed in ${elapsed}s_`;
}