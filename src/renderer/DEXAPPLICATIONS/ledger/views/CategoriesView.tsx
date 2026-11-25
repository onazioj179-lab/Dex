// =============================================================================
// DEX Platform — DEX Ledger categories
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger, type Category, type CategoryGroup } from '../ledgerApi';
import { useLedger, Btn, IconBtn, Empty, errText } from '../ledgerUi';

export const CategoriesView: React.FC = () => {
  const { groups, toast, confirm, go } = useLedger();
  const [renaming, setRenaming] = useState<{ type: 'group' | 'category'; id: number; name: string } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<{ name: string; kind: 'expense' | 'income' } | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { toast(errText(e), 'error'); } };

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    const r = renaming;
    setRenaming(null);
    if (!name) return;
    act(() => r.type === 'group' ? ledger.updateGroup({ id: r.id, name }) : ledger.updateCategory({ id: r.id, name }));
  };

  const moveCat = (g: CategoryGroup, c: Category, dir: -1 | 1) => {
    const ids = g.categories.map(x => x.id);
    const i = ids.indexOf(c.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act(() => ledger.reorderCategories(ids));
  };
  const moveGroup = (g: CategoryGroup, dir: -1 | 1) => {
    const same = groups.filter(x => x.kind === g.kind);
    const ids = same.map(x => x.id);
    const i = ids.indexOf(g.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    act(() => ledger.reorderGroups(ids));
  };
  const removeCat = async (c: Category) => {
    if (c.useCount > 0) {
      if (await confirm({ title: `Archive ${c.name}?`, message: `It is used by ${c.useCount} transaction line${c.useCount === 1 ? '' : 's'}, so it can't be deleted. Archiving hides it from pickers and keeps its history.`, confirmLabel: 'Archive' })) act(() => ledger.updateCategory({ id: c.id, archived: true }));
      return;
    }
    if (await confirm({ title: `Delete ${c.name}?`, confirmLabel: 'Delete', tone: 'destructive' })) act(() => ledger.deleteCategory(c.id));
  };

  const name = (type: 'group' | 'category', id: number, current: string) =>
    renaming && renaming.type === type && renaming.id === id ? (
      <input className="lg-input" autoFocus aria-label="New name" value={renaming.name} style={{ maxWidth: 260 }}
        onChange={e => setRenaming({ ...renaming, name: e.target.value })} onBlur={commitRename}
        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }} />
    ) : <span onDoubleClick={() => setRenaming({ type, id, name: current })}>{current}</span>;

  return (
    <>
      <div className="lg-toolbar">
        <h1>Categories</h1>
        <span className="lg-spacer" />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived</label>
        <Btn small icon="plus" onClick={() => setNewGroup({ name: '', kind: 'expense' })}>Group</Btn>
      </div>
      <div className="lg-scroll">
        <div className="lg-pad">
          <div className="lg-muted" style={{ fontSize: 12, marginBottom: 10 }}>Expense groups appear in the budget. Income groups collect money you receive; it becomes available to assign. Double-click a name to rename it.</div>
          {newGroup && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <input className="lg-input" autoFocus placeholder="Group name" aria-label="Group name" value={newGroup.name} style={{ maxWidth: 240 }} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && newGroup.name.trim()) { act(() => ledger.createGroup(newGroup.name.trim(), newGroup.kind)); setNewGroup(null); } if (e.key === 'Escape') setNewGroup(null); }} />
              <select className="lg-input" style={{ width: 140 }} aria-label="Group kind" value={newGroup.kind} onChange={e => setNewGroup({ ...newGroup, kind: e.target.value as 'expense' | 'income' })}>
                <option value="expense">Expense group</option><option value="income">Income group</option>
              </select>
              <Btn small variant="primary" disabled={!newGroup.name.trim()} onClick={() => { act(() => ledger.createGroup(newGroup.name.trim(), newGroup.kind)); setNewGroup(null); }}>Create</Btn>
              <Btn small variant="ghost" onClick={() => setNewGroup(null)}>Cancel</Btn>
            </div>
          )}
          {groups.length === 0 && <Empty icon="tags" title="No categories" />}
          {groups.map(g => (
            <div key={g.id} className="lg-panel" style={{ marginBottom: 12 }}>
              <div className="lg-panel-head">
                <strong style={{ fontSize: 13 }}>{name('group', g.id, g.name)}</strong>
                <span className="lg-tag">{g.kind === 'income' ? 'Income' : 'Expense'}</span>
                <span className="lg-spacer" />
                <IconBtn icon="arrow-up" label={`Move ${g.name} up`} onClick={() => moveGroup(g, -1)} />
                <IconBtn icon="arrow-down" label={`Move ${g.name} down`} onClick={() => moveGroup(g, 1)} />
                <IconBtn icon="edit" label={`Rename ${g.name}`} onClick={() => setRenaming({ type: 'group', id: g.id, name: g.name })} />
                <IconBtn icon="plus" label={`Add category to ${g.name}`} onClick={() => { setAdding(g.id); setNewName(''); }} />
                {g.categories.length === 0 && <IconBtn icon="trash" label={`Delete ${g.name}`} onClick={() => act(() => ledger.deleteGroup(g.id))} />}
              </div>
              <table className="lg-table">
                <tbody>
                  {adding === g.id && (
                    <tr><td colSpan={3}>
                      <div style={{ display: 'flex', gap: 6, padding: '4px 0' }}>
                        <input className="lg-input" autoFocus placeholder="Category name" aria-label="Category name" value={newName} style={{ maxWidth: 260 }} onChange={e => setNewName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { act(() => ledger.createCategory(g.id, newName.trim())); setNewName(''); } if (e.key === 'Escape') setAdding(null); }} />
                        <Btn small variant="primary" disabled={!newName.trim()} onClick={() => { act(() => ledger.createCategory(g.id, newName.trim())); setNewName(''); }}>Add</Btn>
                        <Btn small variant="ghost" onClick={() => setAdding(null)}>Done</Btn>
                      </div>
                    </td></tr>
                  )}
                  {g.categories.filter(c => showArchived || !c.archived).map(c => (
                    <tr key={c.id} style={c.archived ? { opacity: 0.6 } : undefined}>
                      <td style={{ paddingLeft: 18 }}>{name('category', c.id, c.name)}{c.archived && <span className="lg-tag" style={{ marginLeft: 6 }}>archived</span>}</td>
                      <td className="lg-muted lg-hide-xs" style={{ width: 140 }}>
                        <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" onClick={() => go('transactions', { categoryId: c.id })}>{c.useCount} use{c.useCount === 1 ? '' : 's'}</button>
                      </td>
                      <td className="lg-r" style={{ width: 230 }}>
                        <select className="lg-input" style={{ width: 110, height: 24, fontSize: 12 }} aria-label={`Move ${c.name} to group`} value={g.id} onChange={e => act(() => ledger.updateCategory({ id: c.id, groupId: Number(e.target.value) }))}>
                          {groups.filter(x => x.kind === g.kind).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <IconBtn icon="arrow-up" label={`Move ${c.name} up`} onClick={() => moveCat(g, c, -1)} />
                        <IconBtn icon="arrow-down" label={`Move ${c.name} down`} onClick={() => moveCat(g, c, 1)} />
                        {c.archived
                          ? <IconBtn icon="undo" label={`Unarchive ${c.name}`} onClick={() => act(() => ledger.updateCategory({ id: c.id, archived: false }))} />
                          : <IconBtn icon={c.useCount > 0 ? 'archive' : 'trash'} label={c.useCount > 0 ? `Archive ${c.name}` : `Delete ${c.name}`} onClick={() => removeCat(c)} />}
                      </td>
                    </tr>
                  ))}
                  {g.categories.length === 0 && adding !== g.id && <tr><td className="lg-muted" style={{ paddingLeft: 18 }}>No categories in this group.</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
