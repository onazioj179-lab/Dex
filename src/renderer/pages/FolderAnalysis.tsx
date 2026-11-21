// DEX Platform - Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { useState } from 'react';
import { Button } from '../ui/Button';
import { formatBytes } from '../../shared/format/units';

interface DuplicateGroup { hash: string; size: number; paths: string[] }
interface SizeGroup { category: string; count: number; total_size: number }
type Result = { kind: 'duplicates'; groups: DuplicateGroup[] } | { kind: 'usage'; groups: SizeGroup[] };

export function FolderAnalysis({ path }: { path: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState<'duplicates' | 'usage' | null>(null);
  const [error, setError] = useState('');
  if (!window.dex?.invoke) return null;

  const scan = async (kind: 'duplicates' | 'usage') => {
    setResult(null);
    setError('');
    setPending(kind);
    try {
      const result = await window.dex.invoke(kind === 'duplicates' ? 'fileIntel:findDuplicates' : 'fileIntel:groupByType', path);
      if (!result?.success || !Array.isArray(result.groups)) throw new Error('Folder scan did not return any results.');
      if (kind === 'usage') {
        const groups = result.groups as SizeGroup[];
        setResult({ kind, groups: [...groups].sort((a, b) => b.total_size - a.total_size) });
      } else setResult({ kind, groups: result.groups as DuplicateGroup[] });
    } catch {
      setError('Could not scan this folder.');
    } finally {
      setPending(null);
    }
  };

  return <section aria-label="Folder analysis" style={{ padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 12 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Button size="sm" variant="ghost" loading={pending === 'duplicates'} disabled={pending !== null} onClick={() => void scan('duplicates')}>Find duplicates</Button>
      <Button size="sm" variant="ghost" loading={pending === 'usage'} disabled={pending !== null} onClick={() => void scan('usage')}>Storage by type</Button>
      {(result || error) && <Button size="sm" variant="ghost" onClick={() => { setResult(null); setError(''); }}>Clear scan</Button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" style={{ maxHeight: 160, overflow: 'auto', color: 'var(--color-text-secondary)' }}>
      {result.kind === 'usage'
        ? (result.groups.length ? <ul>{result.groups.map(group => <li key={group.category}>{group.category} · {formatBytes(group.total_size)} · {group.count} files</li>)}</ul> : <p>No files found.</p>)
        : (result.groups.length ? result.groups.map(group => <details key={group.hash}>
          <summary>{group.paths.length} matching files · {formatBytes(group.size)} each</summary>
          <ul>{group.paths.map(file => <li key={file} style={{ overflowWrap: 'anywhere' }}>{file}</li>)}</ul>
        </details>) : <p>No duplicates found.</p>)}
      <div>Scans up to 20,000 files in this folder and its subfolders.</div>
    </div>}
  </section>;
}
