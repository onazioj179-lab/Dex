# Security Policy - DEX

> **DEX - Personal Control Hub for Desktop Automation**
> Created by Onazi Treasure OJ | Version 3.6.0

## Security Philosophy

DEX is built with a **security-first, local-first** architecture. Network features are disabled by default and must be explicitly enabled.

## Core Security Principles

### 1. Context Isolation
- The renderer process is fully sandboxed from Node.js
- All communication between processes uses validated IPC channels
- No direct access to system APIs from the UI layer

### 2. No Node Integration
- `nodeIntegration` is disabled in all browser windows
- `contextIsolation` is enabled for all windows
- All system access goes through the secure preload bridge

### 3. Content Security Policy
- Strict CSP headers prevent XSS attacks
- No inline script execution from untrusted sources
- Resource loading restricted to local files and approved origins

### 4. Input Sanitization
- All IPC messages are validated before processing
- Input strings are sanitized to prevent injection attacks
- Path traversal attempts are blocked
- Rate limiting on sensitive operations

### 5. Minimal Permissions
- DEX requests only the permissions it needs
- Users can review and revoke permissions at any time
- Permission changes are logged in the audit trail

### 6. Local-First Data
- All data is stored locally on your device
- No telemetry by default; API/sync/network capabilities require explicit opt-in
- Full data export available in JSON and Markdown formats

### 7. Manual Updates
- Updates are user-controlled, never forced
- Changelog displayed before installation
- Rollback capability maintained
- Data preserved during updates

## Security Layers

| Layer | Component | Purpose |
|-------|-----------|---------|
| 1 | IPC Validator | Channel allowlisting and message validation |
| 2 | Input Sanitizer | String sanitization and injection prevention |
| 3 | Permission Manager | Granular permission control |
| 4 | Security Audit | Activity logging and compliance |
| 5 | Encryption Service | Data-at-rest encryption |
| 6 | Network Hygiene | Domain blocking and connection monitoring |
| 7 | Secure Transfer | Encrypted file transfers with quarantine |

## Encryption

- AES-256-GCM encryption for vault data
- PBKDF2 key derivation with high iteration count
- Unique IV per encryption operation
- Optional system-key or password-based encryption

## Reporting Vulnerabilities

If you discover a security vulnerability in DEX, please report it responsibly:

1. **Email**: onazi.treasure@outlook.com
2. **Subject**: `[SECURITY] DEX Vulnerability Report`
3. **Include**: Steps to reproduce, impact assessment, and suggested fix if possible

Please do **not** open public issues for security vulnerabilities.

## Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Depending on severity, typically within 14-30 days
- **Disclosure**: Coordinated disclosure after fix is released

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.2.x   | Yes       |
| 1.1.x   | Security fixes only |
| < 1.1   | No        |

## Audit Log

DEX maintains a local audit log of all security-relevant events:
- Permission changes
- Authentication attempts
- Vault access
- File operations on sensitive data
- IPC validation failures

Access the audit log via **Settings > Security > Audit Log**.

---

**DEX** - Made by Onazi Treasure OJ
