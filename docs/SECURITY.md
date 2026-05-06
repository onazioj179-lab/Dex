# Security Policy - DEX

> **DEX - Personal Control Hub for Desktop Automation**  
> Created by Onazi Treasure OJ | Version 3.6.0  
> Contact: onazi75@gmail.com

## Security Philosophy

DEX is built around a hardened desktop model: renderer isolation, narrow IPC, local-first storage, explicit permission boundaries, plugin controls, and diagnostic signals that help protect reliability and users.

## Core Security Principles

### 1. Context Isolation

- Renderer windows are isolated from Node.js.
- System access goes through validated preload bridges.
- IPC channels are allowlisted, rate-limited where appropriate, and validated before handling.

### 2. Content Security Policy

- CSP headers restrict script execution and resource loading.
- Untrusted content must not receive broad system access.
- Browser, plugin, and renderer surfaces are treated as separate trust zones.

### 3. Input and Path Safety

- IPC payloads are sanitized and validated.
- Path traversal and unsafe file operations are blocked.
- Sensitive operations should require explicit permissions and audit logging.

### 4. Minimal Permissions

- DEX requests only the permissions needed for enabled features.
- Users can review and revoke permissions where supported.
- Plugin permissions are scoped and should be visible before risky actions.

### 5. Required Security Diagnostics

DEX may process minimum security and reliability diagnostics to protect users, detect abuse, investigate incidents, recover from failures, and improve safety systems. These diagnostics are not intended to collect passwords, vault secrets, private file contents, clipboard contents, or screenshots by default.

### 6. Local Data and Sensitive Stores

- Sensitive stores should use OS-protected secrets or strong encryption.
- Vault/key material must not be exposed to renderer code.
- Audit logs are local unless a user chooses to submit diagnostics.

## Security Layers

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | IPC Validator / SecureIpcRouter | Channel allowlisting, safe envelopes, rate limiting, path validation |
| 2 | Input Sanitizer | Injection and malformed-input defense |
| 3 | Permission Manager | Granular feature/plugin permission control |
| 4 | Security Audit | Local event logging and incident review |
| 5 | Encryption Service | Data-at-rest protection |
| 6 | Network Hygiene | Connection visibility, domain controls, and network risk reduction |
| 7 | Plugin Controls | Review, quarantine, disable, and removal pathways |

## Plugins and Marketplace Risk

Plugins can increase risk. DEX may review, reject, delist, quarantine, disable, remove, rate-limit, or block plugins or developers that create security, privacy, legal, infrastructure, or user-harm risk.

## Reporting Vulnerabilities

If you discover a security vulnerability in DEX, report it responsibly:

1. **Email:** onazi75@gmail.com
2. **Subject:** `[SECURITY] DEX Vulnerability Report`
3. **Include:** steps to reproduce, impact, affected version, proof-of-concept details where safe, and suggested fix if available.

Do not open public issues for exploitable vulnerabilities.

## Response Timeline

- **Acknowledgment:** target within 48 hours.
- **Assessment:** target within 7 days.
- **Fix:** severity-dependent, typically 14-30 days.
- **Disclosure:** coordinated after mitigation or release.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 3.6.x   | Yes       |
| 3.5.x   | Security fixes when practical |
| < 3.5   | No        |

## User Diagnostic Sharing

Logs, screenshots, crash dumps, and support bundles may contain sensitive information. Users should review diagnostic material before sending it. DEX should warn before sharing diagnostics that may include sensitive content.

---

**DEX** - Made by Onazi Treasure OJ
