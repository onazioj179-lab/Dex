// =============================================================================
// DEX Platform — DEX Ledger budget workspace
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
// Envelope budget per month. Assigned is edited inline; Activity and Available
// come from the engine. Rules are shown on screen, not implied.

import React, { useMemo, useState } from 'react';
import DexIcon from '../../../components/DexIcon';
import { ledger, type BudgetMonth, type BudgetCategoryRow } from '../ledgerApi';
import { formatMonth, monthOf, shiftMonth } from '../money';
import { useLedger, useLedgerQuery, Money, MoneyInput, Btn, IconBtn, Modal, Field, Empty, errText } from '../ledgerUi';

const MONTH_KEY = 'dex-ledger-budget-month';

export const BudgetView: React.FC = () => {
  const { today, digits, toast, go, groups } = useLedger();
  const [month, setMonth] = useState<string>(() => {
    try { return sessionStorage.getItem(MONTH_KEY) || monthOf(today); } catch { return monthOf(today); }
  });
  const [compare, setCompare] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [moveFrom, setMoveFrom] = useState<{ id: number | null; name: string; available: number } | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState(false);
  const q = useLedgerQuery<BudgetMonth>(() => ledger.budget(month), [month]);
  const b = q.data;

  const setM = (m: string) => { setMonth(m); setEditing(null); try { sessionStorage.setItem(MONTH_KEY, m); } catch { /* ignore */ } };
  const year = Number(month.slice(0, 4));

  const assign = async (row: BudgetCategoryRow, minor: number | null) => {
    setEditing(null);
    const value = minor ?? 0;
    if (value === row.assigned) return;
    try { await ledger.assign(row.id, month, value); } catch (e) { toast(errText(e), 'error'); }
  };

  const toggleGroup = async (id: number, collapsed: boolean) => {
    try { await ledger.updateGroup({ id, collapsed: !collapsed }); } catch (e) { toast(errText(e), 'error'); }
  };

  const addCategory = async (groupId: number) => {
    const name = newName.trim();
    if (!name) { setAdding(null); return; }
    try { await ledger.createCategory(groupId, name); setNewName(''); setAdding(null); } catch (e) { toast(errText(e), 'error'); }
  };

  const copyPrev = async () => {
    try {
      const r = await ledger.copyPrevious(month);
      toast(r.copied ? `Copied ${r.copied} amount${r.copied === 1 ? '' : 's'} from ${formatMonth(shiftMonth(month, -1))}` : 'Nothing to copy: categories already have amounts or last month was empty', 'info');
    } catch (e) { toast(errText(e), 'error'); }
  };

  const expenseGroups = useMemo(() => groups.filter(g => g.kind === 'expense'), [groups]);

  return (
    <>
      <div className="lg-toolbar">
        <IconBtn icon="chevron-left" label="Previous month" onClick={() => setM(shiftMonth(month, -1))} />
        <h1 style={{ minWidth: 150, textAlign: 'center' }}>{formatMonth(month)}</h1>
        <IconBtn icon="chevron-right" label="Next month" onClick={() => setM(shiftMonth(month, 1))} />
        <select className="lg-input" aria-label="Year" value={year} style={{ width: 84 }} onChange={e => setM(`${e.target.value}-${month.slice(5)}`)}>
          {Array.from({ length: 11 }, (_, i) => year - 5 + i).map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {month !== monthOf(today) && <Btn small variant="ghost" onClick={() => setM(monthOf(today))}>This month</Btn>}
        <span className="lg-spacer" />
        <Btn small icon="columns" aria-pressed={compare} onClick={() => setCompare(c => !c)} className={compare ? 'lg-active' : ''}>{compare ? 'Hide last month' : 'Compare with last month'}</Btn>
        <Btn small icon="copy" onClick={copyPrev} className="lg-hide-xs">Copy last month</Btn>
        <Btn small icon="shuffle" onClick={() => setMoveFrom({ id: null, name: 'To assign', available: b?.toAssign ?? 0 })}>Move money</Btn>
        <Btn small icon="plus" onClick={() => setNewGroup(true)} className="lg-hide-xs">Group</Btn>
      </div>

      {b && (
        <div className="lg-pad" style={{ paddingBottom: 0 }}>
          <div className="lg-summary">
            <div>
              <div className="lg-summary-label">To assign</div>
              <div className="lg-summary-value" style={{ color: b.toAssign < 0 ? 'var(--color-error)' : undefined }}><Money minor={b.toAssign} /></div>
            </div>
            <div><div className="lg-summary-label">Income this month</div><div className="lg-summary-value"><Money minor={b.income} /></div></div>
            <div><div className="lg-summary-label">Assigned this month</div><div className="lg-summary-value"><Money minor={b.assigned} /></div></div>
            <div><div className="lg-summary-label">Activity this month</div><div className="lg-summary-value"><Money minor={b.activity} sign /></div></div>
          </div>
          <div className="lg-muted" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5 }}>
            Available = everything assigned to a category so far + its activity so far. Leftover money and overspending both carry into the next month.
            To assign = opening balances + income received − everything assigned, up to this month.
          </div>
          {b.toAssign < 0 && <div className="lg-banner lg-warn" style={{ marginTop: 8 }}>You've assigned <Money minor={-b.toAssign} /> more than you have. Reduce some categories.</div>}
          {b.overspentCount > 0 && <div className="lg-banner lg-warn" style={{ marginTop: 8 }}>{b.overspentCount} categor{b.overspentCount === 1 ? 'y is' : 'ies are'} overspent. Move money to cover {b.overspentCount === 1 ? 'it' : 'them'}.</div>}
          {b.uncategorizedCount > 0 && (
            <div className="lg-banner" style={{ marginTop: 8 }}>
              <span style={{ flex: 1 }}>{b.uncategorizedCount} transaction{b.uncategorizedCount === 1 ? '' : 's'} this month ({<Money minor={b.uncategorizedAmount} sign />}) have no category and aren't in the budget.</span>
              <Btn small onClick={() => go('transactions', { categoryId: -1 })}>Categorise</Btn>
            </div>
          )}
        </div>
      )}

      <div className="lg-scroll">
        <div className="lg-pad">
          {q.error && <div className="lg-banner lg-error" role="alert">{q.error}</div>}
          {b && b.groups.length === 0 && (
            <Empty icon="pie-chart" title="No budget categories">Create a group (for example Bills) and add categories to it, then assign money to each category.</Empty>
          )}
          {b && b.groups.length > 0 && (
            <div className="lg-panel lg-hscroll">
              <table className="lg-table" aria-label={`Budget for ${formatMonth(month)}`}>
                <thead>
                  <tr>
                    <th>Category</th>
                    {compare && <th className="lg-r lg-hide-sm">Assigned · {formatMonth(b.previousMonth, 'short')}</th>}
                    {compare && <th className="lg-r lg-hide-sm">Activity · {formatMonth(b.previousMonth, 'short')}</th>}
                    <th className="lg-r">Assigned</th>
                    <th className="lg-r">Activity</th>
                    <th className="lg-r">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {b.groups.map(g => (
                    <React.Fragment key={g.id}>
                      <tr className="lg-budget-group">
                        <td>
                          <button type="button" className="lg-side-group-btn" style={{ padding: 0, color: 'var(--color-text-primary)', fontWeight: 600, width: 'auto', display: 'inline-flex' }} aria-expanded={!g.collapsed} onClick={() => toggleGroup(g.id, g.collapsed)}>
                            <DexIcon name={g.collapsed ? 'chevron-right' : 'chevron-down'} size={11} color="currentColor" />
                            {g.name}
                          </button>
                          <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" style={{ marginLeft: 6 }} aria-label={`Add category to ${g.name}`} onClick={() => { setAdding(g.id); setNewName(''); }}>+</button>
                        </td>
                        {compare && <td className="lg-hide-sm" />}
                        {compare && <td className="lg-hide-sm" />}
                        <td className="lg-r"><Money minor={g.assigned} /></td>
                        <td className="lg-r"><Money minor={g.activity} /></td>
                        <td className="lg-r"><Money minor={g.available} /></td>
                      </tr>
                      {adding === g.id && (
                        <tr>
                          <td colSpan={compare ? 6 : 4}>
                            <div style={{ display: 'flex', gap: 6, padding: '4px 0 4px 18px' }}>
                              <input className="lg-input" autoFocus aria-label="New category name" placeholder="Category name" value={newName} style={{ maxWidth: 260 }}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') addCategory(g.id); if (e.key === 'Escape') setAdding(null); }} />
                              <Btn small variant="primary" onClick={() => addCategory(g.id)}>Add</Btn>
                              <Btn small variant="ghost" onClick={() => setAdding(null)}>Cancel</Btn>
                            </div>
                          </td>
                        </tr>
                      )}
                      {!g.collapsed && g.categories.map(c => (
                        <tr key={c.id}>
                          <td style={{ paddingLeft: 28 }}>
                            {c.name}{c.archived && <span className="lg-tag" style={{ marginLeft: 6 }}>archived</span>}
                          </td>
                          {compare && <td className="lg-r lg-muted lg-hide-sm"><Money minor={c.prevAssigned} /></td>}
                          {compare && <td className="lg-r lg-muted lg-hide-sm"><Money minor={c.prevActivity} /></td>}
                          <td className="lg-r" style={{ width: 150 }}>
                            {editing === c.id ? (
                              <MoneyInput value={c.assigned} digits={digits} autoFocus allowNegative ariaLabel={`Assigned to ${c.name}`}
                                onChange={(m) => assign(c, m)} onEscape={() => setEditing(null)} />
                            ) : (
                              <span className="lg-budget-cell" role="button" tabIndex={0} aria-label={`Assigned to ${c.name}: edit`}
                                onClick={() => setEditing(c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditing(c.id); } }}>
                                <Money minor={c.assigned} />
                              </span>
                            )}
                          </td>
                          <td className="lg-r">
                            <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" style={{ fontVariantNumeric: 'tabular-nums' }} title="Show transactions" onClick={() => go('transactions', { categoryId: c.id })}>
                              <Money minor={c.activity} />
                            </button>
                          </td>
                          <td className="lg-r">
                            <button type="button" className="lg-btn lg-btn-ghost lg-btn-sm" title="Move money" onClick={() => setMoveFrom({ id: c.id, name: c.name, available: c.available })}>
                              <Money minor={c.available} tone="available" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      {moveFrom && b && <MoveMoneyDialog month={month} budget={b} from={moveFrom} onClose={() => setMoveFrom(null)} />}
      {newGroup && <NewGroupDialog existing={expenseGroups.map(g => g.name)} onClose={() => setNewGroup(false)} />}
    </>
  );
};

const MoveMoneyDialog: React.FC<{ month: string; budget: BudgetMonth; from: { id: number | null; name: string; available: number }; onClose: () => void }> = ({ month, budget, from, onClose }) => {
  const { digits, toast, fmt } = useLedger();
  const cats = budget.groups.flatMap(g => g.categories.filter(c => !c.archived).map(c => ({ ...c, group: g.name })));
  const [src, setSrc] = useState<number | null>(from.id);
  const [dst, setDst] = useState<number | null>(() => {
    if (from.id === null) return cats.find(c => c.available < 0)?.id ?? cats[0]?.id ?? null;
    return null;
  });
  const avail = src === null ? budget.toAssign : cats.find(c => c.id === src)?.available ?? 0;
  const [amount, setAmount] = useState<number | null>(() => {
    const target = cats.find(c => c.id === dst);
    if (target && target.available < 0) return Math.min(-target.available, Math.max(avail, 0)) || null;
    return avail > 0 ? avail : null;
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!amount || amount <= 0 || src === dst) return;
    setBusy(true);
    try {
      await ledger.move({ month, fromCategoryId: src, toCategoryId: dst, amount });
      toast(`Moved ${fmt(amount)}`, 'success');
      onClose();
    } catch (e) { toast(errText(e), 'error'); } finally { setBusy(false); }
  };
  const opt = (c: typeof cats[number]) => <option key={c.id} value={c.id}>{c.group} › {c.name} ({fmt(c.available)})</option>;
  return (
    <Modal title="Move money" onClose={onClose} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={busy || !amount || src === dst || (amount ?? 0) > avail} onClick={submit}>Move</Btn></>}>
      <Field label="From" hint={`Available: ${fmt(avail)}`}>
        <select className="lg-input" value={src ?? ''} onChange={e => setSrc(e.target.value ? Number(e.target.value) : null)} aria-label="From">
          <option value="">To assign ({fmt(budget.toAssign)})</option>
          {cats.map(opt)}
        </select>
      </Field>
      <Field label="To">
        <select className="lg-input" value={dst ?? ''} onChange={e => setDst(e.target.value ? Number(e.target.value) : null)} aria-label="To">
          <option value="">To assign</option>
          {cats.map(opt)}
        </select>
      </Field>
      <Field label="Amount">
        <MoneyInput value={amount} digits={digits} ariaLabel="Amount to move" onChange={setAmount} />
      </Field>
      {(amount ?? 0) > avail && <div className="lg-banner lg-warn">Only {fmt(avail)} is available to move from there.</div>}
    </Modal>
  );
};

const NewGroupDialog: React.FC<{ existing: string[]; onClose: () => void }> = ({ existing, onClose }) => {
  const { toast } = useLedger();
  const [name, setName] = useState('');
  const dup = existing.some(e => e.toLowerCase() === name.trim().toLowerCase());
  const submit = async () => {
    if (!name.trim() || dup) return;
    try { await ledger.createGroup(name.trim()); onClose(); } catch (e) { toast(errText(e), 'error'); }
  };
  return (
    <Modal title="New category group" onClose={onClose} width={400} footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!name.trim() || dup} onClick={submit}>Create</Btn></>}>
      <Field label="Group name" hint={dup ? 'A group with this name already exists' : 'For example Bills, Everyday or Savings goals'}>
        <input className="lg-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      </Field>
    </Modal>
  );
};
