# DEPENDENCY_UPGRADE_PLAN.md — VOLT OS

Version: 1.0
Date: 2026-07-09

---

## Upgrade Summary

| Package | From | To | Type | Risk |
|---------|------|----|------|------|
| vitest | 2.1.9 | 3.2.6 | devDependency | Low |
| vite | 5.4.21 | 6.4.3 | transitive | Low |
| esbuild | 0.21.5 | 0.25.0 | transitive | Low |

---

## Upgrade Steps

### Step 1: Update vitest

```bash
pnpm update vitest@^3.2.6 -w
```

**Expected changes:**
- vitest: 2.1.9 → 3.2.6
- vite: 5.4.21 → 6.4.3 (transitive)
- esbuild: 0.21.5 → 0.25.0 (transitive)

### Step 2: Verify

```bash
pnpm install
pnpm audit
pnpm test
pnpm build
```

### Step 3: Update lockfile

```bash
pnpm install --lockfile-only
```

---

## Breaking Change Analysis

### vitest 2.x → 3.x
- **API changes**: Minimal — test runner API stable
- **Config changes**: `vitest.config.ts` may need minor updates
- **Migration guide**: https://vitest.dev/guide/migration.html

### vite 5.x → 6.x
- **API changes**: Minimal for our usage
- **Config changes**: None expected
- **Migration guide**: https://vite.dev/guide/migration.html

### esbuild 0.21 → 0.25
- **API changes**: Not used directly
- **Impact**: Transitive only

---

## Rollback Plan

If tests fail after upgrade:

```bash
git checkout pnpm-lock.yaml
pnpm install
```

---

## Timeline

| Step | Duration | Status |
|------|----------|--------|
| Update vitest | 5 min | Pending |
| Run tests | 5 min | Pending |
| Run build | 5 min | Pending |
| Update lockfile | 2 min | Pending |
| Commit | 1 min | Pending |

**Total: ~18 minutes**
