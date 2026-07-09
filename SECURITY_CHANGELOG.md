# SECURITY_CHANGELOG.md — VOLT OS

Version: 1.0
Date: 2026-07-09

---

## v0.3.1-alpha — Security Remediation

### Vulnerabilities Fixed

| Package | From | To | Severity | CVE |
|---------|------|----|----------|-----|
| vitest | 2.1.9 | 3.2.7 | CRITICAL | CVE-2026-47429 |
| vite | 5.4.21 | 7.3.6 | HIGH | CVE-2026-53571 |
| esbuild | 0.21.5 | 0.28.1 | MODERATE | GHSA-67mh-4wv8-2f99 |
| next | 14.2.35 | 15.5.20 | HIGH | Multiple |
| postcss | 8.4.31 | 8.5.16 | MODERATE | GHSA-qx2v-qp2m-jg93 |
| glob | 10.3.10 | 10.5.0 | HIGH | GHSA-5j98-mcp5-4vw2 |

### Remediation Actions

1. Upgraded vitest to 3.2.7 (patched critical arbitrary file read/execute)
2. Upgraded vite to 7.3.6 (patched server.fs.deny bypass)
3. Upgraded esbuild to 0.28.1 (patched CORS bypass)
4. Upgraded next to 15.5.20 (patched multiple DoS vulnerabilities)
5. Added pnpm override for postcss to 8.5.16 (patched XSS)
6. Upgraded eslint-config-next to 16.2.10 (patched glob injection)

### Result

- Critical vulnerabilities: 0
- High vulnerabilities: 0
- Moderate vulnerabilities: 0
- Low vulnerabilities: 0

**All known vulnerabilities remediated.**

---

## Verification

```bash
pnpm audit
# No known vulnerabilities found
```
