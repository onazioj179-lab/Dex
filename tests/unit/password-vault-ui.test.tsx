// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// The Vault's screens against a fake native Vault that answers the way
// core/dex-vault does: add returns the saved entry (no `success` field) and
// generateTOTP returns { code, remaining }.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useVaultStore } from '../../src/renderer/store/useVaultStore';
import { VaultGate, VaultList, AuthenticatorList, splitOtpLabel, cleanSecret } from '../../src/renderer/DEXAPPLICATIONS/standalone/PasswordVault';

function fakeVault() {
  const creds: Record<string, unknown>[] = [];
  const auths: Record<string, unknown>[] = [];
  let unlocked = false;
  let n = 0;
  return {
    creds, auths,
    getState: vi.fn(async () => ({ exists: true, unlocked })),
    exists: vi.fn(async () => true),
    unlock: vi.fn(async (pw: string) => { unlocked = pw === 'correct horse'; return unlocked ? { success: true } : { success: false, error: 'decryption failed' }; }),
    create: vi.fn(async () => ({ success: true })),
    lock: vi.fn(async () => { unlocked = false; }),
    getCredentials: vi.fn(async () => [...creds]),
    getCredential: vi.fn(async () => null),
    addCredential: vi.fn(async (c: Record<string, unknown>) => { const e = { ...c, id: `c${++n}` }; creds.push(e); return e; }),
    updateCredential: vi.fn(async (id: string, u: Record<string, unknown>) => { const c = creds.find(x => x.id === id); if (c) Object.assign(c, u); return !!c; }),
    deleteCredential: vi.fn(async (id: string) => { const i = creds.findIndex(x => x.id === id); if (i >= 0) creds.splice(i, 1); return i >= 0; }),
    searchCredentials: vi.fn(async () => []),
    getAuthenticators: vi.fn(async () => [...auths]),
    addAuthenticator: vi.fn(async (a: Record<string, unknown>) => { const e = { ...a, id: `a${++n}` }; auths.push(e); return e; }),
    updateAuthenticator: vi.fn(async () => true),
    deleteAuthenticator: vi.fn(async (id: string) => { const i = auths.findIndex(x => x.id === id); if (i >= 0) auths.splice(i, 1); return i >= 0; }),
    generateTOTP: vi.fn(async () => ({ code: '123456', remaining: 17 })),
    parseOTPUri: vi.fn(async () => ({ label: 'GitHub:octo', secret: 'JBSWY3DPEHPK3PXP', issuer: 'GitHub', digits: 6, period: 30 })),
    getSettings: vi.fn(async () => null),
    getCategories: vi.fn(async () => []),
    copyToClipboard: vi.fn(async () => ({ success: true })),
  };
}

let vault: ReturnType<typeof fakeVault>;
beforeEach(() => {
  vault = fakeVault();
  (window as unknown as { dex: unknown }).dex = { vault };
  useVaultStore.setState({ isUnlocked: false, vaultExists: true, credentials: [], authenticators: [], error: null });
});

describe('Vault helpers', () => {
  it('splits otpauth labels', () => {
    expect(splitOtpLabel('GitHub:octo@example.com')).toEqual({ service: 'GitHub', account: 'octo@example.com' });
    expect(splitOtpLabel('octo', 'GitHub')).toEqual({ service: 'GitHub', account: 'octo' });
    expect(splitOtpLabel('Example%3Aalice')).toEqual({ service: 'Example', account: 'alice' });
  });
  it('accepts base32 setup keys as typed, refuses others', () => {
    expect(cleanSecret('jbsw y3dp ehpk 3pxp')).toBe('JBSWY3DPEHPK3PXP');
    expect(cleanSecret('not-a-key-018')).toBeNull();
  });
});

describe('Vault store against native answers', () => {
  it('Save to Vault reports success (native returns the entry, not { success })', async () => {
    useVaultStore.setState({ isUnlocked: true });
    const id = await useVaultStore.getState().addCredential({ title: 't', password: 'p' } as never);
    expect(id).toBe('c1');
    expect(useVaultStore.getState().error).toBeNull();
  });
  it('maps native TOTP { remaining } to remainingSeconds', async () => {
    expect(await useVaultStore.getState().generateTOTP('a1')).toEqual({ code: '123456', remainingSeconds: 17 });
  });
});

describe('VaultGate', () => {
  it('unlocks with the master password and shows the list; a wrong one is refused', async () => {
    render(<VaultGate><div>inside</div></VaultGate>);
    fireEvent.change(screen.getByLabelText('Master password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect master password.');
    fireEvent.change(screen.getByLabelText('Master password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText('inside')).toBeInTheDocument();
  });
});

describe('VaultList', () => {
  it('lists saved passwords; copy goes through the Vault with a 30 s wipe; delete asks first', async () => {
    vault.creds.push({ id: 'c9', title: 'GitHub', username: 'octo', password: 's3cret-pass', updatedAt: 1 });
    useVaultStore.setState({ isUnlocked: true });
    await act(async () => { await useVaultStore.getState().loadCredentials(); });
    const flash = vi.fn();
    render(<VaultList flash={flash} />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('s3cret-pass')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByText('s3cret-pass')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy password for GitHub' }));
    await waitFor(() => expect(vault.copyToClipboard).toHaveBeenCalledWith('s3cret-pass', 30));
    expect(flash).toHaveBeenCalledWith('Password copied. The clipboard clears in 30 seconds.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete GitHub' }));
    expect(vault.deleteCredential).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(vault.deleteCredential).toHaveBeenCalledWith('c9'));
    expect(await screen.findByText('No saved passwords. Use Save to Vault in Generate.')).toBeInTheDocument();
  });

  it('renames an entry saved by the generator', async () => {
    vault.creds.push({ id: 'c1', title: 'Generated 14/11/2026', password: 'x', updatedAt: 1 });
    useVaultStore.setState({ isUnlocked: true });
    await act(async () => { await useVaultStore.getState().loadCredentials(); });
    render(<VaultList flash={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Bank')).toBeInTheDocument();
    expect(vault.updateCredential).toHaveBeenCalledWith('c1', expect.objectContaining({ title: 'Bank' }));
  });
});

describe('AuthenticatorList', () => {
  it('adds from a setup link and shows the live code', async () => {
    useVaultStore.setState({ isUnlocked: true });
    render(<AuthenticatorList flash={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Setup link'), { target: { value: 'otpauth://totp/GitHub:octo?secret=JBSWY3DPEHPK3PXP&issuer=GitHub' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    await waitFor(() => expect(vault.addAuthenticator).toHaveBeenCalledWith(expect.objectContaining({ service: 'GitHub', account: 'octo', secret: 'JBSWY3DPEHPK3PXP' })));
    expect(await screen.findByRole('button', { name: 'Copy code for GitHub' })).toHaveTextContent('123 456');
    expect(screen.getByRole('timer')).toHaveAttribute('aria-label', '17 seconds left');
  });

  it('refuses a setup key that is not base32', async () => {
    useVaultStore.setState({ isUnlocked: true });
    render(<AuthenticatorList flash={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'Bank' } });
    fireEvent.change(screen.getByLabelText('Setup key'), { target: { value: '0189-xyz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('letters A-Z and digits 2-7');
    expect(vault.addAuthenticator).not.toHaveBeenCalled();
  });
});
