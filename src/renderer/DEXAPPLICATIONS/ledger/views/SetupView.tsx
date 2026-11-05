// =============================================================================
// DEX Platform — DEX Ledger first-run setup
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================

import React, { useState } from 'react';
import { ledger } from '../ledgerApi';
import { CURRENCIES, currencyDigits, guessCurrency } from '../money';
import { Btn, Field, errText } from '../ledgerUi';

export const SetupView: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [currency, setCurrency] = useState(guessCurrency);
  const [custom, setCustom] = useState('');
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = (custom.trim() || currency).toUpperCase();
  const valid = /^[A-Z]{3}$/.test(code);

  const start = async () => {
    setBusy(true);
    setError(null);
    try { await ledger.setup(code, seed); onDone(); } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div className="lg-scroll">
      <div className="lg-pad" style={{ maxWidth: 520, margin: '24px auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 18, margin: '0 0 6px', fontWeight: 600 }}>Set up DEX Ledger</h1>
          <p className="lg-muted" style={{ margin: 0, lineHeight: 1.5 }}>
            Your ledger is stored only on this computer, in its own database. DEX doesn't connect to banks or upload anything; you add accounts and transactions yourself or import CSV files your bank provides.
          </p>
        </div>
        <Field label="Currency" hint={valid ? `${code} uses ${currencyDigits(code)} decimal place${currencyDigits(code) === 1 ? '' : 's'}. Amounts are stored exactly, in the smallest unit.` : 'Enter a three-letter ISO 4217 code'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="lg-input" aria-label="Currency" value={custom ? '' : currency} onChange={e => { setCurrency(e.target.value); setCustom(''); }} style={{ flex: 1 }}>
              {!CURRENCIES.includes(currency) && <option value={currency}>{currency}</option>}
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="lg-input" aria-label="Other currency code" placeholder="Other (e.g. LKR)" maxLength={3} value={custom} onChange={e => setCustom(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} style={{ width: 150 }} />
          </div>
        </Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={seed} onChange={e => setSeed(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            Start with a basic set of empty categories
            <span className="lg-muted" style={{ display: 'block', fontSize: 12 }}>Everyday, Bills, Savings, Personal and Income. No amounts are filled in. You can rename or remove them later.</span>
          </span>
        </label>
        {error && <div className="lg-banner lg-error" role="alert">{error}</div>}
        <div><Btn variant="primary" disabled={!valid || busy} onClick={start}>{busy ? 'Creating…' : 'Create ledger'}</Btn></div>
      </div>
    </div>
  );
};
