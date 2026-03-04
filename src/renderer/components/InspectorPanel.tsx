/**
 * DEX Inspector Panel
 * Property inspector for selected items
 */
import React, { useState, useCallback, memo } from 'react';

// ==================== TYPES ====================
export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  value: any;
  options?: { value: any; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  readOnly?: boolean;
}

export type PropertyType = 
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'select'
  | 'range'
  | 'vector2'
  | 'vector3'
  | 'file'
  | 'text';

export interface PropertyGroup {
  id: string;
  name: string;
  properties: Property[];
  collapsed?: boolean;
}

export interface InspectorState {
  title: string;
  icon?: React.ReactNode;
  groups: PropertyGroup[];
}

// ==================== HOOKS ====================
export const useInspector = () => {
  const [state, setState] = useState<InspectorState | null>(null);
  
  const setInspectorState = useCallback((newState: InspectorState | null) => {
    setState(newState);
  }, []);
  
  const updateProperty = useCallback((groupId: string, propertyId: string, value: any) => {
    setState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map(group => {
          if (group.id !== groupId) return group;
          return {
            ...group,
            properties: group.properties.map(prop => {
              if (prop.id !== propertyId) return prop;
              return { ...prop, value };
            }),
          };
        }),
      };
    });
  }, []);
  
  const toggleGroupCollapse = useCallback((groupId: string) => {
    setState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        groups: prev.groups.map(group => {
          if (group.id !== groupId) return group;
          return { ...group, collapsed: !group.collapsed };
        }),
      };
    });
  }, []);
  
  return {
    state,
    setInspectorState,
    updateProperty,
    toggleGroupCollapse,
  };
};

// ==================== COMPONENTS ====================

// String input
interface StringInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const StringInput: React.FC<StringInputProps> = memo(({ value, onChange, readOnly }) => (
  <input
    type="text"
    value={value}
    onChange={e => onChange(e.target.value)}
    readOnly={readOnly}
    style={inputStyles.text}
  />
));

StringInput.displayName = 'StringInput';

// Number input
interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  readOnly?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = memo(({ 
  value, onChange, min, max, step = 1, unit, readOnly 
}) => (
  <div style={inputStyles.numberContainer}>
    <input
      type="number"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      min={min}
      max={max}
      step={step}
      readOnly={readOnly}
      style={inputStyles.number}
    />
    {unit && <span style={inputStyles.unit}>{unit}</span>}
  </div>
));

NumberInput.displayName = 'NumberInput';

// Range input
interface RangeInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  readOnly?: boolean;
}

const RangeInput: React.FC<RangeInputProps> = memo(({
  value, onChange, min = 0, max = 100, step = 1, readOnly
}) => (
  <div style={inputStyles.rangeContainer}>
    <input
      type="range"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      min={min}
      max={max}
      step={step}
      disabled={readOnly}
      style={inputStyles.range}
    />
    <span style={inputStyles.rangeValue}>{value}</span>
  </div>
));

RangeInput.displayName = 'RangeInput';

// Boolean input
interface BooleanInputProps {
  value: boolean;
  onChange: (value: boolean) => void;
  readOnly?: boolean;
}

const BooleanInput: React.FC<BooleanInputProps> = memo(({ value, onChange, readOnly }) => (
  <button
    onClick={() => !readOnly && onChange(!value)}
    style={{
      ...inputStyles.toggle,
      background: value ? 'var(--color-accent, #007aff)' : 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    }}
    disabled={readOnly}
  >
    <span style={{ 
      ...inputStyles.toggleThumb,
      transform: value ? 'translateX(16px)' : 'translateX(0)',
    }} />
  </button>
));

BooleanInput.displayName = 'BooleanInput';

// Select input
interface SelectInputProps {
  value: any;
  options: { value: any; label: string }[];
  onChange: (value: any) => void;
  readOnly?: boolean;
}

const SelectInput: React.FC<SelectInputProps> = memo(({ value, options, onChange, readOnly }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    disabled={readOnly}
    style={inputStyles.select}
  >
    {options.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
));

SelectInput.displayName = 'SelectInput';

// Color input
interface ColorInputProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

const ColorInput: React.FC<ColorInputProps> = memo(({ value, onChange, readOnly }) => (
  <div style={inputStyles.colorContainer}>
    <input
      type="color"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={readOnly}
      style={inputStyles.colorPicker}
    />
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      readOnly={readOnly}
      style={inputStyles.colorText}
    />
  </div>
));

ColorInput.displayName = 'ColorInput';

// Vector2 input
interface Vector2InputProps {
  value: { x: number; y: number };
  onChange: (value: { x: number; y: number }) => void;
  readOnly?: boolean;
}

const Vector2Input: React.FC<Vector2InputProps> = memo(({ value, onChange, readOnly }) => (
  <div style={inputStyles.vectorContainer}>
    <div style={inputStyles.vectorField}>
      <span style={inputStyles.vectorLabel}>X</span>
      <input
        type="number"
        value={value.x}
        onChange={e => onChange({ ...value, x: parseFloat(e.target.value) || 0 })}
        readOnly={readOnly}
        style={inputStyles.vectorInput}
      />
    </div>
    <div style={inputStyles.vectorField}>
      <span style={inputStyles.vectorLabel}>Y</span>
      <input
        type="number"
        value={value.y}
        onChange={e => onChange({ ...value, y: parseFloat(e.target.value) || 0 })}
        readOnly={readOnly}
        style={inputStyles.vectorInput}
      />
    </div>
  </div>
));

Vector2Input.displayName = 'Vector2Input';

// Property row
interface PropertyRowProps {
  property: Property;
  onChange: (value: any) => void;
}

const PropertyRow: React.FC<PropertyRowProps> = memo(({ property, onChange }) => {
  const renderInput = () => {
    switch (property.type) {
      case 'string':
        return <StringInput value={property.value} onChange={onChange} readOnly={property.readOnly} />;
      case 'number':
        return (
          <NumberInput 
            value={property.value} 
            onChange={onChange}
            min={property.min}
            max={property.max}
            step={property.step}
            unit={property.unit}
            readOnly={property.readOnly}
          />
        );
      case 'range':
        return (
          <RangeInput
            value={property.value}
            onChange={onChange}
            min={property.min}
            max={property.max}
            step={property.step}
            readOnly={property.readOnly}
          />
        );
      case 'boolean':
        return <BooleanInput value={property.value} onChange={onChange} readOnly={property.readOnly} />;
      case 'select':
        return (
          <SelectInput
            value={property.value}
            options={property.options || []}
            onChange={onChange}
            readOnly={property.readOnly}
          />
        );
      case 'color':
        return <ColorInput value={property.value} onChange={onChange} readOnly={property.readOnly} />;
      case 'vector2':
        return <Vector2Input value={property.value} onChange={onChange} readOnly={property.readOnly} />;
      default:
        return <StringInput value={String(property.value)} onChange={onChange} readOnly={property.readOnly} />;
    }
  };
  
  return (
    <div style={rowStyles.container}>
      <label style={rowStyles.label}>{property.name}</label>
      <div style={rowStyles.input}>{renderInput()}</div>
    </div>
  );
});

PropertyRow.displayName = 'PropertyRow';

const rowStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
  },
  label: {
    width: 80,
    fontSize: 11,
    color: 'var(--color-text-secondary, #999)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
  },
};

// Property group
interface PropertyGroupComponentProps {
  group: PropertyGroup;
  onToggle: () => void;
  onPropertyChange: (propertyId: string, value: any) => void;
}

const PropertyGroupComponent: React.FC<PropertyGroupComponentProps> = memo(({
  group,
  onToggle,
  onPropertyChange,
}) => {
  return (
    <div style={groupStyles.container}>
      <button onClick={onToggle} style={groupStyles.header}>
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          style={{ transform: group.collapsed ? 'rotate(-90deg)' : 'none' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span>{group.name}</span>
      </button>
      {!group.collapsed && (
        <div style={groupStyles.content}>
          {group.properties.map(property => (
            <PropertyRow
              key={property.id}
              property={property}
              onChange={(value) => onPropertyChange(property.id, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

PropertyGroupComponent.displayName = 'PropertyGroupComponent';

const groupStyles: Record<string, React.CSSProperties> = {
  container: {
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '10px 12px',
    background: 'var(--color-bg-secondary, #1a1a1a)',
    border: 'none',
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
  },
  content: {
    padding: '4px 12px 12px',
  },
};

// Main inspector panel
interface InspectorPanelProps {
  state: InspectorState | null;
  onPropertyChange: (groupId: string, propertyId: string, value: any) => void;
  onGroupToggle: (groupId: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = memo(({
  state,
  onPropertyChange,
  onGroupToggle,
}) => {
  if (!state) {
    return (
      <div style={panelStyles.empty}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.3">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>No selection</span>
      </div>
    );
  }
  
  return (
    <div style={panelStyles.container}>
      <div style={panelStyles.header}>
        {state.icon}
        <span style={panelStyles.title}>{state.title}</span>
      </div>
      <div style={panelStyles.groups}>
        {state.groups.map(group => (
          <PropertyGroupComponent
            key={group.id}
            group={group}
            onToggle={() => onGroupToggle(group.id)}
            onPropertyChange={(propId, value) => onPropertyChange(group.id, propId, value)}
          />
        ))}
      </div>
    </div>
  );
});

InspectorPanel.displayName = 'InspectorPanel';

const panelStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--color-bg-primary, #111)',
    height: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
  },
  groups: {
    flex: 1,
    overflow: 'auto',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: '100%',
    color: 'var(--color-text-secondary, #666)',
    fontSize: 13,
  },
};

const inputStyles: Record<string, React.CSSProperties> = {
  text: {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    outline: 'none',
  },
  numberContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  number: {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    outline: 'none',
  },
  unit: {
    fontSize: 10,
    opacity: 0.6,
  },
  rangeContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  range: {
    flex: 1,
    cursor: 'pointer',
  },
  rangeValue: {
    width: 40,
    fontSize: 11,
    textAlign: 'right',
    opacity: 0.8,
  },
  toggle: {
    position: 'relative',
    width: 36,
    height: 20,
    padding: 2,
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  toggleThumb: {
    display: 'block',
    width: 16,
    height: 16,
    background: '#fff',
    borderRadius: '50%',
    transition: 'transform 0.2s',
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 12,
    cursor: 'pointer',
  },
  colorContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  colorPicker: {
    width: 24,
    height: 24,
    padding: 0,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
  },
  colorText: {
    flex: 1,
    padding: '4px 8px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    fontFamily: 'monospace',
    outline: 'none',
  },
  vectorContainer: {
    display: 'flex',
    gap: 8,
  },
  vectorField: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  vectorLabel: {
    fontSize: 10,
    fontWeight: 600,
    opacity: 0.6,
  },
  vectorInput: {
    flex: 1,
    minWidth: 0,
    padding: '4px 6px',
    background: 'var(--color-bg-tertiary, rgba(255,255,255,0.1))',
    border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    color: 'var(--color-text-primary, #fff)',
    fontSize: 11,
    outline: 'none',
  },
};

export default InspectorPanel;
