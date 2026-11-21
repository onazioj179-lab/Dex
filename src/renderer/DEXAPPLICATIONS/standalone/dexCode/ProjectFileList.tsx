// DEX Platform — Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
import { memo } from 'react';
import DexIcon from '../../../components/DexIcon';
import { useVirtualList } from '../../../improvements500/virtualList';
import { sameProjectPath, type ProjectFile } from './project';

const ROW_HEIGHT = 26;

export const ProjectFileList = memo(function ProjectFileList({ files, active, onOpen }: {
  files: ProjectFile[];
  active: string | null;
  onOpen: (path: string) => void;
}) {
  const { ref, slice, onScroll } = useVirtualList({ itemCount: files.length, rowHeight: ROW_HEIGHT, bufferRows: 8 });
  if (!files.length) return <div style={{ padding: '4px 8px', fontSize: 11 }}>No source files</div>;
  return <div ref={ref} onScroll={onScroll} className="dex-scroll" tabIndex={0} aria-label="Project files"
    style={{ maxHeight: 220, overflow: 'auto' }}>
    <div aria-hidden="true" style={{ height: slice.padTop }} />
    {files.slice(slice.start, slice.end).map(file => {
      const selected = active !== null && sameProjectPath(active, file.path);
      return <button key={file.path} type="button" onClick={() => onOpen(file.path)}
        title={file.path} aria-current={selected || undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: ROW_HEIGHT,
          boxSizing: 'border-box', border: 0, borderRadius: 4, padding: '0 8px', cursor: 'pointer',
          textAlign: 'start', fontSize: 11, color: 'var(--color-text-primary)',
          background: selected ? 'var(--color-bg-hover)' : 'transparent' }}>
        <DexIcon name="code" size={11} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      </button>;
    })}
    <div aria-hidden="true" style={{ height: slice.padBottom }} />
  </div>;
});
