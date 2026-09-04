// สำมะโน string literal ของสถานะงานในตำแหน่งเทียบ — src/ + functions/src/ ของแอปไรเดอร์
// สะกดเก่าต้องเป็น 0 นอก exemption ที่ระบุจำนวนเป๊ะ, canonical ลดได้ขึ้นไม่ได้
//
// ฝาแฝดของ bkk-system/src/utils/statusLiteralCensus.test.ts (#714) — ตัวจำแนก
// เดียวกัน. ที่มา: bkk-system docs/reports/2026-09-04-status-literal-compare-survey-cross-repo.md
// แอปนี้เขียน "ทั้งสองสะกด" ด้วยมือทุกจุด (28 จุด) ถูกทุกจุดแต่ไม่มีอะไรบังคับจุดใหม่
// — ตอนนี้ทุกจุดถามผ่าน src/utils/statusCompare.ts และไฟล์นี้กันไม่ให้กลับมา
//
// INJECTION (วัดจริง):
//   - เติม `if (job.status === 'Accepted') return;` ใน ActiveJobCard.tsx → แดง 1 (LEGACY)
//   - เติม `['Pending QC'].includes(job.status)` ที่เดียวกัน               → แดง 1 (CANONICAL)
//   - เติม `'Accepted': 'x'` เป็นคีย์ object                                 → เขียว (ตารางป้าย ไม่ใช่การเทียบ)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { JOB_STATUS, JOB_STATUS_B2B } from '../types/job-statuses';

const ROOT = resolve(__dirname, '../..');
const SCAN_DIRS = [resolve(ROOT, 'src'), resolve(ROOT, 'functions/src')];

// ---- เพดาน (วัดจริง 4 ก.ย. 2569 หลัง sweep) ----
const CANONICAL_CEILING = 3; // วัดจริง 4 ก.ย. 2569 — 2 = query list ใน useRiderJobs, 1 = rider_fee_status === 'Paid' (HistoryJobSheet, ไม่ใช่สถานะงาน แต่ตัวจำแนกแยกไม่ออก)

/**
 * ไฟล์ที่ยังถือ literal สะกดเก่าโดยเจตนา — จำนวนเป๊ะ พร้อมเหตุผล
 * useRiderJobs: POOL_RAW_STATUSES เป็น **query list** (equalTo ตาม index status ทีละค่า)
 * ต้องระบุสะกดเก่าที่ DB ถืออยู่จริง — กางอัตโนมัติไม่ได้เพราะ LEGACY_ALIAS เป็น private
 * ใน job-statuses.ts (แก้ = เปลี่ยนไฟล์ที่ mirror 3 รีโป) ไม่ใช่การเทียบ
 */
const LEGACY_EXEMPTIONS: Record<string, { count: number; reason: string }> = {
  'src/hooks/useRiderJobs.ts': { count: 2, reason: 'query list ตาม index status (Active Leads / Assigned)' },
};

const SKIP_FILES = new Set([
  'src/types/job-statuses.ts',      // ต้นทางคำศัพท์
  'functions/src/statusMatch.ts',   // สำเนาย่อยของคำศัพท์ (มี parity test)
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function legacySpellings(): string[] {
  const text = readFileSync(resolve(ROOT, 'src/types/job-statuses.ts'), 'utf8');
  const block = text.slice(text.indexOf('const LEGACY_ALIAS'), text.indexOf('export function normalizeStatus'));
  const keys = [...block.matchAll(/^\s*'?([A-Za-z][A-Za-z() -]+?)'?\s*:\s*JOB_STATUS\./gm)].map((m) => m[1]);
  return [...new Set([...keys, 'In-Transit'])];
}

const CANONICAL = new Set<string>([...Object.values(JOB_STATUS), ...Object.values(JOB_STATUS_B2B)]);
const LEGACY = new Set<string>(legacySpellings());
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VOCAB = [...CANONICAL, ...LEGACY].sort((a, b) => b.length - a.length);
const LITERAL_RE = new RegExp(`(['"])(${VOCAB.map(esc).join('|')})\\1`, 'g');

type Site = 'compare' | 'write' | 'map' | 'other';
function classify(line: string, val: string): Site {
  const v = esc(val);
  if (new RegExp(`\\bstatus\\s*:\\s*['"]${v}['"]`).test(line) || new RegExp(`status\\s*=\\s*['"]${v}`).test(line)) return 'write';
  if (new RegExp(`^\\s*['"]?${v}['"]?\\s*:\\s*`).test(line) || new RegExp(`\\[['"]${v}['"]\\]\\s*:`).test(line)) return 'map';
  if (/(===|!==|==|!=)\s*['"]/.test(line) || /['"]\s*(===|!==|==|!=)/.test(line) || /\bcase\s+['"]/.test(line)
      || /\.includes\(|\.has\(|new Set\(|equalTo\(/.test(line) || new RegExp(`\\[\\s*['"]${v}|,\\s*['"]${v}['"]|['"]${v}['"]\\s*,`).test(line)) return 'compare';
  return 'other';
}

function stripComment(line: string): string | null {
  const t = line.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return null;
  return line.replace(/\s\/\/[^'"]*$/, '');
}

export function census() {
  const legacyHits: Array<{ file: string; line: number; val: string }> = [];
  const canonicalHits: Array<{ file: string; line: number; val: string }> = [];
  for (const dir of SCAN_DIRS) for (const abs of walk(dir)) {
    const file = relative(ROOT, abs).split('\\').join('/');
    if (SKIP_FILES.has(file)) continue;
    const lines = readFileSync(abs, 'utf8').split('\n');
    lines.forEach((raw, i) => {
      const line = stripComment(raw);
      if (!line) return;
      for (const m of line.matchAll(LITERAL_RE)) {
        const val = m[2];
        if (classify(line, val) !== 'compare') continue;
        (LEGACY.has(val) ? legacyHits : canonicalHits).push({ file, line: i + 1, val });
      }
    });
  }
  return { legacyHits, canonicalHits };
}

describe('status literal census (rider app + rider-notifications)', () => {
  const { legacyHits, canonicalHits } = census();
  const fmt = (h: { file: string; line: number; val: string }) => `${h.file}:${h.line} '${h.val}'`;

  it('legacy spellings in compare position: 0 outside the recorded exemptions', () => {
    const byFile = new Map<string, number>();
    for (const h of legacyHits) byFile.set(h.file, (byFile.get(h.file) || 0) + 1);
    const unexpected = legacyHits.filter((h) => !LEGACY_EXEMPTIONS[h.file]);
    expect(unexpected.map(fmt), 'legacy literal compares outside exemptions').toEqual([]);
    for (const [file, { count }] of Object.entries(LEGACY_EXEMPTIONS)) {
      expect(byFile.get(file) || 0, `exemption count for ${file}`).toBe(count);
    }
  });

  it('canonical literals in compare position never grow', () => {
    expect(canonicalHits.length, `canonical literal compares (ceiling ${CANONICAL_CEILING}):\n` + canonicalHits.map(fmt).join('\n'))
      .toBeLessThanOrEqual(CANONICAL_CEILING);
  });

  it('vocabulary was actually loaded (guards against a silent empty scan)', () => {
    console.log(`[statusLiteralCensus] legacy=${legacyHits.length} canonical=${canonicalHits.length} (ceiling ${CANONICAL_CEILING})`);
    expect(LEGACY.size).toBeGreaterThan(5);
    expect(CANONICAL.size).toBeGreaterThan(30);
  });
});
