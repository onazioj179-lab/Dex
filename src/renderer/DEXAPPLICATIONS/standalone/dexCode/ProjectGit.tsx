import { useEffect, useMemo, useState } from 'react';
import { openGitClient } from '../../../services/gitProjectHandoff';
import type { DexProject } from './project';
import './projectGit.css';

interface Change {
  path: string;
  previousPath: string | null;
  index: string;
  work: string;
}

interface Status {
  branch: string | null;
  repositoryRoot: string;
  files: Change[];
  limited: boolean;
}

interface Patch {
  patch: string;
  limited: boolean;
}

type Result<T> = { value: T } | { error: string };

async function projectGit<T>(action: 'gitStatus' | 'gitDiff', data: Record<string, unknown>): Promise<Result<T>> {
  try {
    const result = await window.dex?.invoke(`codeProject:${action}`, data);
    if (!result?.success) return { error: result?.error || 'Native Git is unavailable.' };
    return { value: result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Git could not read the project.' };
  }
}

function describeChange(code: string) {
  return ({ M: 'modified', A: 'added', D: 'deleted', R: 'renamed', C: 'copied', U: 'unmerged', T: 'type changed' } as Record<string, string>)[code] ?? 'changed';
}

export function ProjectGit({ project, revision, onClose, onOpenFile }: {
  project: DexProject | null;
  revision: number;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}) {
  const root = project?.root;
  const writable = !!project?.writable;
  const [status, setStatus] = useState<Result<Status> | null>(null);
  const [patch, setPatch] = useState<Result<Patch> | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<{ path: string; staged: boolean } | null>(null);
  const [count, setCount] = useState(100);

  useEffect(() => {
    if (!writable || !root) return;
    let current = true;
    setStatus(null);
    void projectGit<Status>('gitStatus', { root }).then(result => { if (current) setStatus(result); });
    return () => { current = false; };
  }, [refresh, revision, root, writable]);

  const selected = status && 'value' in status
    ? status.value.files.find(file => file.path === selection?.path)
    : undefined;
  const untracked = selected?.index === '?' && selected.work === '?';
  const staged = !!selected && !untracked && selected.index !== ' ';
  const unstaged = !!selected && !untracked && selected.work !== ' ';
  const showStaged = staged && (selection?.staged || !unstaged);
  const selectedPath = selected?.path;
  const previousPath = selected?.previousPath;

  useEffect(() => {
    setPatch(null);
    if (!root || !selectedPath || untracked) return;
    let current = true;
    void projectGit<Patch>('gitDiff', { root, path: selectedPath, previousPath, staged: !!showStaged })
      .then(result => { if (current) setPatch(result); });
    return () => { current = false; };
  }, [previousPath, root, selectedPath, showStaged, untracked]);

  const editorPath = useMemo(() => {
    if (!selectedPath || !project) return null;
    return project.files.find(file => file.name.replaceAll('\\', '/') === selectedPath)?.path ?? null;
  }, [project, selectedPath]);

  const value = status && 'value' in status ? status.value : null;
  return <section className="dex-project-git" aria-label="Project Git">
    <header className="dex-project-git-header">
      <strong>Git</strong>
      {value?.branch && <span className="dex-project-git-branch" title={value.branch}>{value.branch}</span>}
      <div className="dex-project-git-actions">
        {value?.repositoryRoot && <button type="button" onClick={() => openGitClient(value.repositoryRoot)}>Open Git app</button>}
        {writable && <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh Git</button>}
        <button type="button" onClick={onClose}>Close Git</button>
      </div>
    </header>
    {!project && <p role="status">Open a project folder to view Git changes.</p>}
    {project && !writable && <p role="status">Select the project folder again to view Git changes.</p>}
    {writable && !status && <p role="status">Reading Git status…</p>}
    {status && 'error' in status && <p role="status">{status.error}</p>}
    {value?.files.length === 0 && <p role="status">No changes in this project.</p>}
    {!!value?.files.length && <div className="dex-project-git-content">
      <div className="dex-project-git-files" aria-label="Git changes">
        {value.files.slice(0, count).map(file => {
          const isUntracked = file.index === '?' && file.work === '?';
          const state = isUntracked ? 'Untracked' : [
            file.index !== ' ' && `Staged ${describeChange(file.index)}`,
            file.work !== ' ' && `Working tree ${describeChange(file.work)}`,
          ].filter(Boolean).join(', ');
          return <button
            key={file.path}
            type="button"
            title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
            aria-label={`${file.path}, ${state}`}
            aria-pressed={selectedPath === file.path}
            onClick={() => setSelection({ path: file.path, staged: file.index !== ' ' && file.work === ' ' })}
          >
            <code aria-hidden="true">{file.index}{file.work}</code>
            <span>{file.path}</span>
          </button>;
        })}
        {value.files.length > count && <button type="button" onClick={() => setCount(count + 100)}>Show more changes</button>}
        {value.limited && <p role="status">The change list reached its display limit.</p>}
      </div>
      {selected && <section className="dex-project-git-diff" aria-label="File diff">
        <div className="dex-project-git-diff-actions">
          {staged && <button type="button" aria-pressed={!!showStaged} onClick={() => setSelection({ path: selected.path, staged: true })}>Staged</button>}
          {unstaged && <button type="button" aria-pressed={!showStaged} onClick={() => setSelection({ path: selected.path, staged: false })}>Working tree</button>}
          {editorPath && selected.work !== 'D' && <button type="button" onClick={() => onOpenFile(editorPath)}>Open file</button>}
        </div>
        {untracked && <p role="status">Untracked file. Open it to see its contents.</p>}
        {!untracked && !patch && <p role="status">Reading diff…</p>}
        {patch && 'error' in patch && <p role="status">{patch.error}</p>}
        {patch && 'value' in patch && <>
          {patch.value.patch ? <pre>{patch.value.patch}</pre> : <p role="status">No text diff available.</p>}
          {patch.value.limited && <p role="status">The diff reached its display limit.</p>}
        </>}
      </section>}
    </div>}
  </section>;
}
