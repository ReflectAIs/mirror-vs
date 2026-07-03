import { describe, it, expect, beforeEach } from 'vitest';
import { ScoredPageCache } from '../ContextManager';

describe('ScoredPageCache', () => {
  let cache: ScoredPageCache;

  beforeEach(() => {
    cache = new ScoredPageCache(1000); // 1000 token ceiling for tests
  });

  it('stores and retrieves pages', () => {
    cache.push('src/app.ts', 'const x = 1;', 80);
    const page = cache.get('src/app.ts');
    expect(page).toBeDefined();
    expect(page!.payload).toBe('const x = 1;');
    expect(page!.priorityScore).toBe(80);
  });

  it('pins active file at score 100 and decays others', () => {
    cache.push('src/a.ts', 'a content', 50);
    cache.push('src/b.ts', 'b content', 50);
    cache.decayAndPin('src/a.ts');
    expect(cache.get('src/a.ts')!.priorityScore).toBe(100);
    expect(cache.get('src/b.ts')!.priorityScore).toBe(25); // 50 - 25 = 25
  });

  it('floors anchor files at 60 during decay', () => {
    cache.push('package.json', '{}', 40); // initial score 40 < 60
    cache.push('tsconfig.json', '{}', 40);
    cache.decayAndPin('src/other.ts');
    // Anchor files should not drop below 60
    expect(cache.get('package.json')!.priorityScore).toBe(60);
    expect(cache.get('tsconfig.json')!.priorityScore).toBe(60);
  });

  it('evicts lowest-score pages when ceiling is breached', () => {
    // Each page: ~250 chars / 4 = ~62 tokens. 4 pages = ~250 tokens > ceiling of 200
    const smallCache = new ScoredPageCache(200);
    const content = 'x'.repeat(250);
    smallCache.push('a.ts', content, 90);
    smallCache.push('b.ts', content, 10); // lowest — evicted first
    smallCache.push('c.ts', content, 50);
    smallCache.push('d.ts', content, 100); // pinned
    // b.ts should be evicted first, then c.ts if needed
    expect(smallCache.has('d.ts')).toBe(true); // pinned — never evicted
    expect(smallCache.has('b.ts')).toBe(false); // lowest score — evicted
  });

  it('demote() sets page score to 0', () => {
    cache.push('src/a.ts', 'content', 80);
    cache.demote('src/a.ts');
    expect(cache.get('src/a.ts')!.priorityScore).toBe(0);
  });

  it('compileTranscript returns pages sorted by descending priority', () => {
    cache.push('low.ts', 'low', 10);
    cache.push('high.ts', 'high', 90);
    cache.push('mid.ts', 'mid', 50);
    const transcript = cache.compileTranscript();
    const highIdx = transcript.indexOf('high.ts');
    const midIdx = transcript.indexOf('mid.ts');
    const lowIdx = transcript.indexOf('low.ts');
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  it('totalTokens tracks estimated token count', () => {
    cache.push('a.ts', 'x'.repeat(400), 50); // ~100 tokens
    expect(cache.totalTokens).toBeGreaterThan(0);
    expect(cache.totalTokens).toBeLessThanOrEqual(110); // within estimation range
  });

  it('clear() removes all pages', () => {
    cache.push('a.ts', 'content', 50);
    cache.push('b.ts', 'content', 50);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalTokens).toBe(0);
  });
});
