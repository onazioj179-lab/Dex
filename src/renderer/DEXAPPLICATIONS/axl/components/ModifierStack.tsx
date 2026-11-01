// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ═══════════════════════════════════════════════════════════════════════════
// AXL Modifier Stack Panel -- Blender-style modifier UI
// ═══════════════════════════════════════════════════════════════════════════

import React, { useCallback, useState, memo } from 'react';
import type { Modifier, ModifierType, MirrorModifier, ArrayModifier, BevelModifier, SubdivisionModifier, SimpleDeformModifier, SmoothModifier, SolidifyModifier, DecimateModifier, BooleanModifier, Vec3 } from '../types';
import { getModifierName, getModifierIcon, createModifier, MODIFIER_CATEGORIES } from '../engine/Modifiers';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface ModifierStackProps {
  modifiers: Modifier[];
  onAdd: (type: ModifierType) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
  onUpdate: (id: string, updates: Partial<Modifier>) => void;
  onToggle: (id: string) => void;
  onCollapse: (id: string) => void;
  onDuplicate: (id: string) => void;
  onApply?: (id: string) => void;
  parts?: { id: string; name: string }[]; // For boolean modifier targets
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    display: 'flex', flexDirection: 'column' as const, gap: 'var(--space-2)',
    padding: 'var(--space-3)', background: 'var(--color-bg-elevated)', borderRadius: 6,
    border: '1px solid var(--color-border-subtle)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 'var(--space-2)',
  },
  title: {
    fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)',
  },
  addBtn: {
    padding: '4px var(--space-3)', background: 'var(--color-accent)',
    border: 'none', borderRadius: 9999, color: 'var(--color-text-inverse, #fff)', fontSize: 12,
    cursor: 'pointer', fontWeight: 500, boxShadow: 'none',
  },
  modItem: {
    background: 'var(--color-bg-base)', borderRadius: 6,
    border: '1px solid var(--color-border-subtle)',
    overflow: 'hidden',
  },
  modHeader: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)',
    borderBottom: '1px solid var(--color-border-subtle)',
    cursor: 'pointer', userSelect: 'none' as const,
  },
  modIcon: {
    fontSize: 14, width: 20, textAlign: 'center' as const,
  },
  modName: {
    flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
  },
  modActions: {
    display: 'flex', gap: 4,
  },
  iconBtn: {
    width: 22, height: 22, border: 'none', borderRadius: 4,
    background: 'transparent', color: 'var(--color-text-secondary)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, transition: 'all 0.15s',
  },
  modBody: {
    padding: 'var(--space-3)', display: 'flex', flexDirection: 'column' as const, gap: 10,
  },
  row: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
  },
  label: {
    fontSize: 11, color: 'var(--color-text-secondary)', minWidth: 70,
  },
  input: {
    flex: 1, padding: '4px var(--space-2)', background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-subtle)', borderRadius: 4,
    color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
  },
  select: {
    flex: 1, padding: '4px var(--space-2)', background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-subtle)', borderRadius: 4,
    color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
  },
  checkbox: {
    width: 14, height: 14, accentColor: 'var(--color-accent)',
  },
  vec3Row: {
    display: 'flex', gap: 4, flex: 1,
  },
  vec3Input: {
    width: 50, padding: '4px 6px', background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border-subtle)', borderRadius: 4,
    color: 'var(--color-text-primary)', fontSize: 11, outline: 'none',
    textAlign: 'center' as const,
  },
  dropdown: {
    position: 'absolute' as const, top: '100%', left: 0, right: 0,
    background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
    borderRadius: 6, boxShadow: 'var(--pg-shadow-panel)',
    zIndex: 100, maxHeight: 280, overflowY: 'auto' as const,
  },
  dropdownCategory: {
    padding: '6px var(--space-3)', fontSize: 10, fontWeight: 600,
    color: 'var(--color-text-tertiary)', textTransform: 'uppercase' as const,
    letterSpacing: 0.5, background: 'var(--color-bg-base)',
  },
  dropdownItem: {
    padding: 'var(--space-2) var(--space-3)', fontSize: 12, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    color: 'var(--color-text-primary)',
    transition: 'background 0.12s',
  },
  empty: {
    padding: 'var(--space-5)', textAlign: 'center' as const, color: 'var(--color-text-tertiary)',
    fontSize: 12,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Modifier Property Editors
// ═══════════════════════════════════════════════════════════════════════════

const NumberInput = memo(({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
}) => (
  <div style={styles.row}>
    <span style={styles.label}>{label}</span>
    <input
      type="number"
      style={styles.input}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
    />
  </div>
));

const Vec3Input = memo(({ label, value, onChange }: {
  label: string; value: Vec3; onChange: (v: Vec3) => void;
}) => (
  <div style={styles.row}>
    <span style={styles.label}>{label}</span>
    <div style={styles.vec3Row}>
      <input type="number" style={styles.vec3Input} value={value.x} step={0.1}
        onChange={e => onChange({ ...value, x: parseFloat(e.target.value) || 0 })} placeholder="X" />
      <input type="number" style={styles.vec3Input} value={value.y} step={0.1}
        onChange={e => onChange({ ...value, y: parseFloat(e.target.value) || 0 })} placeholder="Y" />
      <input type="number" style={styles.vec3Input} value={value.z} step={0.1}
        onChange={e => onChange({ ...value, z: parseFloat(e.target.value) || 0 })} placeholder="Z" />
    </div>
  </div>
));

const AxisCheckbox = memo(({ label, value, onChange }: {
  label: string; value: { x: boolean; y: boolean; z: boolean };
  onChange: (v: { x: boolean; y: boolean; z: boolean }) => void;
}) => (
  <div style={styles.row}>
    <span style={styles.label}>{label}</span>
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <input type="checkbox" style={styles.checkbox} checked={value.x}
        onChange={e => onChange({ ...value, x: e.target.checked })} /> X
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <input type="checkbox" style={styles.checkbox} checked={value.y}
        onChange={e => onChange({ ...value, y: e.target.checked })} /> Y
    </label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
      <input type="checkbox" style={styles.checkbox} checked={value.z}
        onChange={e => onChange({ ...value, z: e.target.checked })} /> Z
    </label>
  </div>
));

const CheckboxInput = memo(({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) => (
  <div style={styles.row}>
    <span style={styles.label}>{label}</span>
    <input type="checkbox" style={styles.checkbox} checked={value}
      onChange={e => onChange(e.target.checked)} />
  </div>
));

const SelectInput = memo(({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) => (
  <div style={styles.row}>
    <span style={styles.label}>{label}</span>
    <select style={styles.select} value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
));

// ═══════════════════════════════════════════════════════════════════════════
// Modifier-Specific Editors
// ═══════════════════════════════════════════════════════════════════════════

const MirrorEditor = memo(({ mod, onUpdate }: { mod: MirrorModifier; onUpdate: (u: Partial<MirrorModifier>) => void }) => (
  <>
    <AxisCheckbox label="Axis" value={mod.axis} onChange={axis => onUpdate({ axis })} />
    <CheckboxInput label="Bisect" value={mod.useBisect} onChange={useBisect => onUpdate({ useBisect })} />
    <NumberInput label="Merge" value={mod.mergeThreshold} onChange={mergeThreshold => onUpdate({ mergeThreshold })} min={0} step={0.001} />
  </>
));

const ArrayEditor = memo(({ mod, onUpdate }: { mod: ArrayModifier; onUpdate: (u: Partial<ArrayModifier>) => void }) => (
  <>
    <NumberInput label="Count" value={mod.count} onChange={count => onUpdate({ count })} min={1} max={100} />
    <CheckboxInput label="Relative" value={mod.useRelativeOffset} onChange={useRelativeOffset => onUpdate({ useRelativeOffset })} />
    {mod.useRelativeOffset && <Vec3Input label="Offset" value={mod.offset} onChange={offset => onUpdate({ offset })} />}
    <CheckboxInput label="Constant" value={mod.useConstantOffset} onChange={useConstantOffset => onUpdate({ useConstantOffset })} />
    {mod.useConstantOffset && <Vec3Input label="Offset" value={mod.constantOffset} onChange={constantOffset => onUpdate({ constantOffset })} />}
    <CheckboxInput label="Merge" value={mod.mergeVertices} onChange={mergeVertices => onUpdate({ mergeVertices })} />
  </>
));

const BevelEditor = memo(({ mod, onUpdate }: { mod: BevelModifier; onUpdate: (u: Partial<BevelModifier>) => void }) => (
  <>
    <NumberInput label="Amount" value={mod.amount} onChange={amount => onUpdate({ amount })} min={0} step={0.01} />
    <NumberInput label="Segments" value={mod.segments} onChange={segments => onUpdate({ segments })} min={1} max={16} />
    <NumberInput label="Profile" value={mod.profile} onChange={profile => onUpdate({ profile })} min={0} max={1} step={0.1} />
    <SelectInput label="Limit" value={mod.limitMethod}
      options={[{ value: 'none', label: 'None' }, { value: 'angle', label: 'Angle' }, { value: 'weight', label: 'Weight' }]}
      onChange={v => onUpdate({ limitMethod: v as BevelModifier['limitMethod'] })} />
    {mod.limitMethod === 'angle' && <NumberInput label="Angle" value={mod.angleLimit} onChange={angleLimit => onUpdate({ angleLimit })} min={0} max={180} />}
    <CheckboxInput label="Clamp" value={mod.clamp} onChange={clamp => onUpdate({ clamp })} />
  </>
));

const SubdivisionEditor = memo(({ mod, onUpdate }: { mod: SubdivisionModifier; onUpdate: (u: Partial<SubdivisionModifier>) => void }) => (
  <>
    <NumberInput label="Levels" value={mod.levels} onChange={levels => onUpdate({ levels })} min={0} max={6} />
    <NumberInput label="Render" value={mod.renderLevels} onChange={renderLevels => onUpdate({ renderLevels })} min={0} max={6} />
    <SelectInput label="Quality" value={mod.qualityMode}
      options={[{ value: 'catmull', label: 'Catmull-Clark' }, { value: 'simple', label: 'Simple' }]}
      onChange={v => onUpdate({ qualityMode: v as SubdivisionModifier['qualityMode'] })} />
    <CheckboxInput label="Creases" value={mod.useCreases} onChange={useCreases => onUpdate({ useCreases })} />
  </>
));

const SmoothEditor = memo(({ mod, onUpdate }: { mod: SmoothModifier; onUpdate: (u: Partial<SmoothModifier>) => void }) => (
  <>
    <NumberInput label="Factor" value={mod.factor} onChange={factor => onUpdate({ factor })} min={0} max={1} step={0.1} />
    <NumberInput label="Repeat" value={mod.iterations} onChange={iterations => onUpdate({ iterations })} min={1} max={30} />
    <AxisCheckbox label="Axis" value={mod.axis} onChange={axis => onUpdate({ axis })} />
  </>
));

const SimpleDeformEditor = memo(({ mod, onUpdate }: { mod: SimpleDeformModifier; onUpdate: (u: Partial<SimpleDeformModifier>) => void }) => (
  <>
    <SelectInput label="Mode" value={mod.mode}
      options={[{ value: 'twist', label: 'Twist' }, { value: 'bend', label: 'Bend' }, { value: 'taper', label: 'Taper' }, { value: 'stretch', label: 'Stretch' }]}
      onChange={v => onUpdate({ mode: v as SimpleDeformModifier['mode'] })} />
    <SelectInput label="Axis" value={mod.axis}
      options={[{ value: 'X', label: 'X' }, { value: 'Y', label: 'Y' }, { value: 'Z', label: 'Z' }]}
      onChange={v => onUpdate({ axis: v as SimpleDeformModifier['axis'] })} />
    <NumberInput label={mod.mode === 'twist' || mod.mode === 'bend' ? 'Angle' : 'Factor'}
      value={mod.mode === 'twist' || mod.mode === 'bend' ? mod.angle : mod.factor}
      onChange={v => onUpdate(mod.mode === 'twist' || mod.mode === 'bend' ? { angle: v } : { factor: v })}
      step={mod.mode === 'twist' || mod.mode === 'bend' ? 5 : 0.1} />
  </>
));

const SolidifyEditor = memo(({ mod, onUpdate }: { mod: SolidifyModifier; onUpdate: (u: Partial<SolidifyModifier>) => void }) => (
  <>
    <NumberInput label="Thickness" value={mod.thickness} onChange={thickness => onUpdate({ thickness })} min={0} step={0.01} />
    <NumberInput label="Offset" value={mod.offset} onChange={offset => onUpdate({ offset })} min={-1} max={1} step={0.1} />
    <CheckboxInput label="Even" value={mod.evenThickness} onChange={evenThickness => onUpdate({ evenThickness })} />
    <CheckboxInput label="Fill Rim" value={mod.fillRim} onChange={fillRim => onUpdate({ fillRim })} />
  </>
));

const DecimateEditor = memo(({ mod, onUpdate }: { mod: DecimateModifier; onUpdate: (u: Partial<DecimateModifier>) => void }) => (
  <>
    <SelectInput label="Mode" value={mod.mode}
      options={[{ value: 'collapse', label: 'Collapse' }, { value: 'unsubdiv', label: 'Un-Subdivide' }, { value: 'dissolve', label: 'Dissolve' }]}
      onChange={v => onUpdate({ mode: v as DecimateModifier['mode'] })} />
    {mod.mode === 'collapse' && <NumberInput label="Ratio" value={mod.ratio} onChange={ratio => onUpdate({ ratio })} min={0} max={1} step={0.05} />}
    {mod.mode === 'unsubdiv' && <NumberInput label="Iterations" value={mod.iterations} onChange={iterations => onUpdate({ iterations })} min={1} max={10} />}
    {mod.mode === 'dissolve' && <NumberInput label="Angle" value={mod.angleLimit} onChange={angleLimit => onUpdate({ angleLimit })} min={0} max={180} />}
    <CheckboxInput label="Symmetry" value={mod.symmetry} onChange={symmetry => onUpdate({ symmetry })} />
  </>
));

const BooleanEditor = memo(({ mod, onUpdate, parts = [] }: { mod: BooleanModifier; onUpdate: (u: Partial<BooleanModifier>) => void; parts?: { id: string; name: string }[] }) => (
  <>
    <SelectInput label="Operation" value={mod.operation}
      options={[{ value: 'union', label: 'Union' }, { value: 'subtract', label: 'Difference' }, { value: 'intersect', label: 'Intersect' }]}
      onChange={v => onUpdate({ operation: v as BooleanModifier['operation'] })} />
    <SelectInput label="Object" value={mod.targetPart}
      options={[{ value: '', label: '— Select —' }, ...parts.map(p => ({ value: p.id, label: p.name }))]}
      onChange={targetPart => onUpdate({ targetPart })} />
    <SelectInput label="Solver" value={mod.solver}
      options={[{ value: 'fast', label: 'Fast' }, { value: 'exact', label: 'Exact' }]}
      onChange={v => onUpdate({ solver: v as BooleanModifier['solver'] })} />
  </>
));

// ═══════════════════════════════════════════════════════════════════════════
// Modifier Item Component
// ═══════════════════════════════════════════════════════════════════════════

const ModifierItem = memo(({ mod, onRemove, onMove, onUpdate, onToggle, onCollapse, onDuplicate, onApply, parts }: {
  mod: Modifier;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onUpdate: (updates: Partial<Modifier>) => void;
  onToggle: () => void;
  onCollapse: () => void;
  onDuplicate: () => void;
  onApply?: () => void;
  parts?: { id: string; name: string }[];
}) => {
  const icon = getModifierIcon(mod.type);
  const [hovered, setHovered] = useState(false);

  const renderEditor = () => {
    switch (mod.type) {
      case 'mirror': return <MirrorEditor mod={mod as MirrorModifier} onUpdate={onUpdate} />;
      case 'array': return <ArrayEditor mod={mod as ArrayModifier} onUpdate={onUpdate} />;
      case 'bevel': return <BevelEditor mod={mod as BevelModifier} onUpdate={onUpdate} />;
      case 'subdivision': return <SubdivisionEditor mod={mod as SubdivisionModifier} onUpdate={onUpdate} />;
      case 'smooth': return <SmoothEditor mod={mod as SmoothModifier} onUpdate={onUpdate} />;
      case 'simpleDeform': return <SimpleDeformEditor mod={mod as SimpleDeformModifier} onUpdate={onUpdate} />;
      case 'solidify': return <SolidifyEditor mod={mod as SolidifyModifier} onUpdate={onUpdate} />;
      case 'decimate': return <DecimateEditor mod={mod as DecimateModifier} onUpdate={onUpdate} />;
      case 'boolean': return <BooleanEditor mod={mod as BooleanModifier} onUpdate={onUpdate} parts={parts} />;
      default: return <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>No parameters</div>;
    }
  };

  return (
    <div style={{ ...styles.modItem, opacity: mod.enabled ? 1 : 0.5 }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div style={styles.modHeader} onClick={onCollapse}>
        <span style={styles.modIcon}>{icon}</span>
        <input
          style={{ ...styles.modName, background: 'transparent', border: 'none', outline: 'none' }}
          value={mod.name}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ name: e.target.value })}
        />
        <div style={styles.modActions}>
          <button style={{ ...styles.iconBtn, color: mod.showInViewport ? 'var(--color-accent)' : undefined }} aria-label="Toggle show in viewport" onClick={e => { e.stopPropagation(); onUpdate({ showInViewport: !mod.showInViewport }); }}>
            View
          </button>
          <button style={{ ...styles.iconBtn, color: mod.enabled ? 'var(--color-accent)' : undefined }} aria-label="Toggle modifier enabled" onClick={e => { e.stopPropagation(); onToggle(); }}>
            On
          </button>
          <button style={styles.iconBtn} aria-label="Move modifier up" onClick={e => { e.stopPropagation(); onMove('up'); }}>▲</button>
          <button style={styles.iconBtn} aria-label="Move modifier down" onClick={e => { e.stopPropagation(); onMove('down'); }}>▼</button>
          <button style={styles.iconBtn} aria-label="Duplicate modifier" onClick={e => { e.stopPropagation(); onDuplicate(); }}>⧉</button>
          {onApply && <button style={styles.iconBtn} aria-label="Apply modifier" onClick={e => { e.stopPropagation(); onApply(); }}>Apply</button>}
          <button style={{ ...styles.iconBtn, color: hovered ? 'var(--color-error, #ff453a)' : undefined }} aria-label="Remove modifier"
            onClick={e => { e.stopPropagation(); onRemove(); }}>x</button>
        </div>
        <span style={{ fontSize: 12, marginLeft: 4 }}>{mod.expanded ? '▼' : '▶'}</span>
      </div>
      {mod.expanded && <div style={styles.modBody}>{renderEditor()}</div>}
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Main Modifier Stack Component
// ═══════════════════════════════════════════════════════════════════════════

export const ModifierStack: React.FC<ModifierStackProps> = ({
  modifiers, onAdd, onRemove, onMove, onUpdate, onToggle, onCollapse, onDuplicate, onApply, parts,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleAddClick = useCallback(() => setDropdownOpen(o => !o), []);
  const handleSelectType = useCallback((type: ModifierType) => {
    onAdd(type);
    setDropdownOpen(false);
  }, [onAdd]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Modifiers</span>
        <div style={{ position: 'relative' }}>
          <button style={styles.addBtn} aria-label="Add modifier" aria-haspopup="true" aria-expanded={dropdownOpen} onClick={handleAddClick}>
            + Add Modifier
          </button>
          {dropdownOpen && (
            <div style={styles.dropdown}>
              {MODIFIER_CATEGORIES.map(cat => (
                <React.Fragment key={cat.name}>
                  <div style={styles.dropdownCategory}>{cat.name}</div>
                  {cat.types.map(type => (
                    <div
                      key={type}
                      style={styles.dropdownItem}
                      onClick={() => handleSelectType(type)}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-subtle)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span style={{ width: 20 }}>{getModifierIcon(type)}</span>
                      {getModifierName(type)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      </div>

      {modifiers.length === 0 ? (
        <button
          type="button"
          style={{ ...styles.empty, background: 'none', border: 'none', cursor: 'pointer', width: '100%', font: 'inherit' }}
          onClick={() => setDropdownOpen(true)}
        >
          No modifiers yet -- add one to reshape this part
        </button>
      ) : (
        modifiers.map(mod => (
          <ModifierItem
            key={mod.id}
            mod={mod}
            onRemove={() => onRemove(mod.id)}
            onMove={dir => onMove(mod.id, dir)}
            onUpdate={u => onUpdate(mod.id, u)}
            onToggle={() => onToggle(mod.id)}
            onCollapse={() => onCollapse(mod.id)}
            onDuplicate={() => onDuplicate(mod.id)}
            onApply={onApply ? () => onApply(mod.id) : undefined}
            parts={parts}
          />
        ))
      )}
    </div>
  );
};

export default ModifierStack;
