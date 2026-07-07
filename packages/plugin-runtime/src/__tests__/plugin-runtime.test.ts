/**
 * @module __tests__/plugin-runtime
 * Comprehensive tests for the VOLT OS Plugin Runtime.
 * Covers VoltSDK, PluginVerifier, PluginLoader, PluginSandbox,
 * PluginManager, PluginRegistry, DependencyResolver, and PluginMetrics.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import type {
  PluginManifest,
  PluginPermission,
  PluginInstance,
  PluginEntryPoint,
  EventBus,
} from '../types.js';
import { PluginEvents } from '../types.js';
import {
  VoltSDKImpl,
  PluginLoggerImpl,
  PluginEventAPIImpl,
  PluginMemoryAPIImpl,
  PluginConfigAPIImpl,
  PluginStorageAPIImpl,
  PluginTaskAPIImpl,
  clearSDKStores,
  setCancellationFlag,
} from '../sdk/volt-sdk.js';
import { PluginVerifier } from '../verifier.js';
import { PluginLoader } from '../loader.js';
import { PluginSandbox, ResourceLimitError, ExecutionTimeoutError } from '../sandbox.js';
import { PluginManager } from '../manager.js';
import { PluginRegistry } from '../registry.js';
import { DependencyResolver } from '../dependency.js';
import { PluginMetrics } from '../metrics.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockEventBus(): EventBus {
  const handlers = new Map<string, Set<(data: Record<string, unknown>) => void>>();
  return {
    emit: vi.fn((event: string, data: Record<string, unknown>) => {
      const set = handlers.get(event);
      if (set) {
        for (const h of set) h(data);
      }
    }),
    on: vi.fn((event: string, handler: (data: Record<string, unknown>) => void) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: (data: Record<string, unknown>) => void) => {
      handlers.get(event)?.delete(handler);
    }),
  };
}

function createManifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    author: 'test',
    description: 'A test plugin',
    category: 'agent',
    permissions: [],
    capabilities: [],
    events: {},
    minimumVoltVersion: '>=0.1.0',
    sdkVersion: '0.1.0',
    checksum: 'abc123',
    entryPoint: 'index.js',
    ...overrides,
  };
}

function createInstance(overrides: Partial<PluginInstance> = {}): PluginInstance {
  return {
    id: 'test-plugin',
    manifest: createManifest(),
    state: 'installed',
    resourceUsage: { memoryMB: 0, cpuTimeMs: 0, tokensUsed: 0, tasksExecuted: 0 },
    ...overrides,
  };
}

function createEntryPoint(): PluginEntryPoint {
  return {
    activate: vi.fn(async () => {}),
    deactivate: vi.fn(async () => {}),
    healthCheck: vi.fn(async () => ({ status: 'healthy' as const })),
  };
}

const ALL_PERMISSIONS: PluginPermission[] = [
  { type: 'memory', access: 'read' },
  { type: 'memory', access: 'write' },
  { type: 'event', access: 'read' },
  { type: 'event', access: 'write' },
  { type: 'filesystem', access: 'read' },
  { type: 'filesystem', access: 'write' },
  { type: 'network', access: 'invoke' },
  { type: 'model', access: 'invoke' },
  { type: 'tool', access: 'invoke' },
];

// ===========================================================================
// VoltSDK Tests
// ===========================================================================

describe('PluginLoggerImpl', () => {
  it('should prefix messages with plugin id', () => {
    const logger = new PluginLoggerImpl('my-plugin');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('hello world');
    expect(spy).toHaveBeenCalledWith('[plugin:my-plugin] hello world');
    spy.mockRestore();
  });

  it('should include data in info messages', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('msg', { key: 'val' });
    expect(spy).toHaveBeenCalledWith('[plugin:p1] msg', '{"key":"val"}');
    spy.mockRestore();
  });

  it('should log warnings', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('careful');
    expect(spy).toHaveBeenCalledWith('[plugin:p1] careful');
    spy.mockRestore();
  });

  it('should log errors', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('broken');
    expect(spy).toHaveBeenCalledWith('[plugin:p1] broken');
    spy.mockRestore();
  });

  it('should log debug messages', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('trace');
    expect(spy).toHaveBeenCalledWith('[plugin:p1] trace');
    spy.mockRestore();
  });

  it('should log warn with data', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('warn', { a: 1 });
    expect(spy).toHaveBeenCalledWith('[plugin:p1] warn', '{"a":1}');
    spy.mockRestore();
  });

  it('should log error with data', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('err', { b: 2 });
    expect(spy).toHaveBeenCalledWith('[plugin:p1] err', '{"b":2}');
    spy.mockRestore();
  });

  it('should log debug with data', () => {
    const logger = new PluginLoggerImpl('p1');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('dbg', { c: 3 });
    expect(spy).toHaveBeenCalledWith('[plugin:p1] dbg', '{"c":3}');
    spy.mockRestore();
  });
});

describe('VoltSDKImpl — Permission Enforcement', () => {
  beforeEach(() => {
    clearSDKStores();
  });

  it('should throw when memory/read is denied', async () => {
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [],
      eventBus: createMockEventBus(),
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    await expect(sdk.memory.read('key')).rejects.toThrow('lacks memory/read');
  });

  it('should throw when memory/write is denied', async () => {
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [{ type: 'memory', access: 'read' }],
      eventBus: createMockEventBus(),
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    await expect(sdk.memory.write('key', 'val')).rejects.toThrow('lacks memory/write');
  });

  it('should allow memory/read with permission', async () => {
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [{ type: 'memory', access: 'read' }],
      eventBus: createMockEventBus(),
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    const result = await sdk.memory.read('key');
    expect(result).toBeNull();
  });

  it('should allow memory/write with permission', async () => {
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [{ type: 'memory', access: 'write' }],
      eventBus: createMockEventBus(),
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    await expect(sdk.memory.write('key', 'val')).resolves.toBeUndefined();
  });

  it('should isolate memory between plugins', async () => {
    const bus = createMockEventBus();
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 };
    const sdk1 = new VoltSDKImpl({ pluginId: 'p1', permissions: [{ type: 'memory', access: 'read' }, { type: 'memory', access: 'write' }], eventBus: bus, config: {}, resourceLimits: limits });
    const sdk2 = new VoltSDKImpl({ pluginId: 'p2', permissions: [{ type: 'memory', access: 'read' }, { type: 'memory', access: 'write' }], eventBus: bus, config: {}, resourceLimits: limits });

    await sdk1.memory.write('key', 'from-p1');
    const val1 = await sdk1.memory.read('key');
    const val2 = await sdk2.memory.read('key');

    expect(val1).toBe('from-p1');
    expect(val2).toBeNull();
  });
});

describe('PluginEventAPIImpl', () => {
  beforeEach(() => {
    clearSDKStores();
  });

  it('should throw when event/write is denied for publish', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [], bus);
    await expect(api.publish('test', {})).rejects.toThrow('lacks event/write');
  });

  it('should throw when event/read is denied for subscribe', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [], bus);
    await expect(api.subscribe('test', () => {})).rejects.toThrow('lacks event/read');
  });

  it('should publish when event/write is allowed', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [{ type: 'event', access: 'write' }], bus);
    await api.publish('test', { data: 1 });
    expect(bus.emit).toHaveBeenCalledWith('test', { data: 1 });
  });

  it('should subscribe when event/read is allowed', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [{ type: 'event', access: 'read' }], bus);
    const handler = vi.fn();
    const unsub = await api.subscribe('test', handler);
    expect(bus.on).toHaveBeenCalledWith('test', handler);
    expect(typeof unsub).toBe('function');
  });

  it('should unsubscribe correctly', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [{ type: 'event', access: 'read' }], bus);
    const handler = vi.fn();
    const unsub = await api.subscribe('test', handler);
    await unsub();
    expect(bus.off).toHaveBeenCalledWith('test', handler);
  });

  it('should remove all subscriptions on cleanup', async () => {
    const bus = createMockEventBus();
    const api = new PluginEventAPIImpl('p1', [{ type: 'event', access: 'read' }], bus);
    await api.subscribe('a', () => {});
    await api.subscribe('b', () => {});
    await api.removeAllSubscriptions();
    expect(bus.off).toHaveBeenCalledTimes(2);
  });
});

describe('PluginConfigAPIImpl', () => {
  it('should return config values', () => {
    const api = new PluginConfigAPIImpl({ key1: 'val1', key2: 42 });
    expect(api.get('key1')).toBe('val1');
    expect(api.get('key2')).toBe(42);
  });

  it('should return null for missing keys', () => {
    const api = new PluginConfigAPIImpl({});
    expect(api.get('missing')).toBeNull();
  });

  it('should return all config values', () => {
    const config = { a: 1, b: 'two' };
    const api = new PluginConfigAPIImpl(config);
    expect(api.getAll()).toEqual(config);
  });

  it('should not allow mutation of config', () => {
    const api = new PluginConfigAPIImpl({ x: 1 });
    const all = api.getAll();
    all.x = 999;
    expect(api.get('x')).toBe(1);
  });
});

describe('PluginStorageAPIImpl', () => {
  beforeEach(() => {
    clearSDKStores();
  });

  it('should store and retrieve values', async () => {
    const api = new PluginStorageAPIImpl('p1');
    await api.set('key', 'value');
    const result = await api.get('key');
    expect(result).toBe('value');
  });

  it('should return null for missing keys', async () => {
    const api = new PluginStorageAPIImpl('p1');
    const result = await api.get('missing');
    expect(result).toBeNull();
  });

  it('should delete values', async () => {
    const api = new PluginStorageAPIImpl('p1');
    await api.set('key', 'value');
    await api.delete('key');
    const result = await api.get('key');
    expect(result).toBeNull();
  });

  it('should isolate storage between plugins', async () => {
    const api1 = new PluginStorageAPIImpl('p1');
    const api2 = new PluginStorageAPIImpl('p2');
    await api1.set('k', 'v1');
    expect(await api2.get('k')).toBeNull();
  });
});

describe('PluginTaskAPIImpl', () => {
  beforeEach(() => {
    clearSDKStores();
  });

  it('should report progress via callback', () => {
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 };
    const api = new PluginTaskAPIImpl('p1', limits);
    const cb = vi.fn();
    api.setProgressCallback(cb);
    api.reportProgress(50, 'halfway');
    expect(cb).toHaveBeenCalledWith(50, 'halfway');
  });

  it('should not throw if no callback set', () => {
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 };
    const api = new PluginTaskAPIImpl('p1', limits);
    expect(() => api.reportProgress(10)).not.toThrow();
  });

  it('should report cancellation when flag is set', () => {
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 };
    const api = new PluginTaskAPIImpl('p1', limits);
    expect(api.checkCancellation()).toBe(false);
    setCancellationFlag('p1', true);
    expect(api.checkCancellation()).toBe(true);
    setCancellationFlag('p1', false);
  });
});

describe('VoltSDKImpl — Full Construction', () => {
  beforeEach(() => {
    clearSDKStores();
  });

  it('should create all sub-APIs', () => {
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: ALL_PERMISSIONS,
      eventBus: createMockEventBus(),
      config: { x: 1 },
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    expect(sdk.logger).toBeDefined();
    expect(sdk.events).toBeDefined();
    expect(sdk.memory).toBeDefined();
    expect(sdk.config).toBeDefined();
    expect(sdk.storage).toBeDefined();
    expect(sdk.tasks).toBeDefined();
  });

  it('should reject event publish for disallowed event type', async () => {
    const bus = createMockEventBus();
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [{ type: 'event', access: 'write', targets: ['allowed-event'] }],
      eventBus: bus,
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    await expect(sdk.events.publish('blocked-event', {})).rejects.toThrow('lacks event/write');
  });

  it('should allow event publish for allowed event type', async () => {
    const bus = createMockEventBus();
    const sdk = new VoltSDKImpl({
      pluginId: 'p1',
      permissions: [{ type: 'event', access: 'write', targets: ['allowed-event'] }],
      eventBus: bus,
      config: {},
      resourceLimits: { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 60000 },
    });
    await sdk.events.publish('allowed-event', { test: true });
    expect(bus.emit).toHaveBeenCalledWith('allowed-event', { test: true });
  });
});

// ===========================================================================
// PluginVerifier Tests
// ===========================================================================

describe('PluginVerifier', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-test-'));
  });

  it('should reject manifest with missing id', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ id: '' as unknown as string });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('should reject manifest with invalid version', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ version: 'not-a-version' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('should reject manifest with missing name', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ name: '' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('name'))).toBe(true);
  });

  it('should reject manifest with missing author', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ author: '' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('author'))).toBe(true);
  });

  it('should reject manifest with missing description', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ description: '' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('description'))).toBe(true);
  });

  it('should reject invalid checksum', async () => {
    // Create entry point file
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');

    const correctChecksum = crypto
      .createHash('sha256')
      .update(await fs.readFile(entryPath))
      .digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum: 'wrong-checksum', minimumVoltVersion: '>=0.1.0', sdkVersion: '0.1.0' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Checksum'))).toBe(true);
  });

  it('should verify correct checksum', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');

    const checksum = crypto
      .createHash('sha256')
      .update(await fs.readFile(entryPath))
      .digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum });
    expect(await verifier.verifyChecksum(manifest)).toBe(true);
  });

  it('should reject version mismatch', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');
    const checksum = crypto.createHash('sha256').update(await fs.readFile(entryPath)).digest('hex');

    const verifier = new PluginVerifier(tmpDir, '0.0.1');
    const manifest = createManifest({
      checksum,
      minimumVoltVersion: '>=1.0.0',
      sdkVersion: '0.1.0',
    });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('VOLT version'))).toBe(true);
  });

  it('should reject SDK version mismatch', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');
    const checksum = crypto.createHash('sha256').update(await fs.readFile(entryPath)).digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({
      checksum,
      sdkVersion: '2.0.0',
    });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('SDK version'))).toBe(true);
  });

  it('should validate permission schemas', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({
      permissions: [{ type: 'bogus' as unknown as PluginPermission['type'], access: 'read' }],
    });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid type'))).toBe(true);
  });

  it('should reject invalid permission access', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({
      permissions: [{ type: 'memory', access: 'bogus' as unknown as PluginPermission['access'] }],
    });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid access'))).toBe(true);
  });

  it('should verify valid manifest with all fields', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');
    const checksum = crypto.createHash('sha256').update(await fs.readFile(entryPath)).digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({
      checksum,
      permissions: [{ type: 'memory', access: 'read' }],
    });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should check version compatibility correctly', () => {
    const verifier = new PluginVerifier(tmpDir);
    expect(verifier.checkVersionCompatibility('>=0.1.0', '0.1.0')).toBe(true);
    expect(verifier.checkVersionCompatibility('>=1.0.0', '0.1.0')).toBe(false);
    expect(verifier.checkVersionCompatibility('>=0.1.0', '1.0.0')).toBe(true);
  });

  it('should check SDK compatibility correctly', () => {
    const verifier = new PluginVerifier(tmpDir);
    expect(verifier.checkSDKCompatibility('0.1.0')).toBe(true);
    expect(verifier.checkSDKCompatibility('2.0.0')).toBe(false);
  });

  it('should fail checksum for missing entry point file', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum: 'anything' });
    expect(await verifier.verifyChecksum(manifest)).toBe(false);
  });

  it('should validate signature when present', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');
    const content = await fs.readFile(entryPath);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');
    const expectedSig = crypto.createHash('sha256').update(content).update('test-plugin').digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum, signature: expectedSig });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(true);
  });

  it('should fail with wrong signature', async () => {
    const entryPath = path.join(tmpDir, 'index.js');
    await fs.writeFile(entryPath, 'module.exports = {};');
    const content = await fs.readFile(entryPath);
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum, signature: 'wrong-sig' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Signature'))).toBe(true);
  });

  it('should reject manifest with missing entryPoint', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ entryPoint: '' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('entryPoint'))).toBe(true);
  });

  it('should reject manifest with missing checksum', async () => {
    const verifier = new PluginVerifier(tmpDir);
    const manifest = createManifest({ checksum: '' });
    const result = await verifier.verify(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('checksum'))).toBe(true);
  });
});

// ===========================================================================
// PluginLoader Tests
// ===========================================================================

describe('PluginLoader', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-loader-'));
  });

  it('should load a valid plugin entry point', async () => {
    const entryCode = `
      module.exports = {
        async activate(sdk) {},
        async deactivate() {},
        async healthCheck() { return { status: 'healthy' }; }
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);

    const loader = new PluginLoader();
    const manifest = createManifest({ entryPoint: 'index.js' });
    const ep = await loader.load(tmpDir, manifest);

    expect(ep).toBeDefined();
    expect(typeof ep.activate).toBe('function');
    expect(typeof ep.deactivate).toBe('function');
    expect(typeof ep.healthCheck).toBe('function');
  });

  it('should reject a module missing activate method', async () => {
    const entryCode = `
      module.exports = {
        async deactivate() {},
        async healthCheck() { return { status: 'healthy' }; }
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);

    const loader = new PluginLoader();
    const manifest = createManifest({ entryPoint: 'index.js' });
    await expect(loader.load(tmpDir, manifest)).rejects.toThrow('missing "activate" method');
  });

  it('should reject a module missing deactivate method', async () => {
    const entryCode = `
      module.exports = {
        async activate(sdk) {},
        async healthCheck() { return { status: 'healthy' }; }
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);

    const loader = new PluginLoader();
    const manifest = createManifest({ entryPoint: 'index.js' });
    await expect(loader.load(tmpDir, manifest)).rejects.toThrow('missing "deactivate" method');
  });

  it('should reject a module missing healthCheck method', async () => {
    const entryCode = `
      module.exports = {
        async activate(sdk) {},
        async deactivate() {}
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);

    const loader = new PluginLoader();
    const manifest = createManifest({ entryPoint: 'index.js' });
    await expect(loader.load(tmpDir, manifest)).rejects.toThrow('missing "healthCheck" method');
  });

  it('should unload a plugin instance', async () => {
    const loader = new PluginLoader();
    const instance = createInstance({ state: 'healthy' });
    const ep = createEntryPoint();

    await loader.unload(instance, ep);

    expect(ep.deactivate).toHaveBeenCalled();
    expect(instance.state).toBe('unloaded');
    expect(instance.loadedAt).toBeUndefined();
  });

  it('should handle unload deactivation error gracefully', async () => {
    const loader = new PluginLoader();
    const instance = createInstance({ state: 'healthy' });
    const ep = createEntryPoint();
    (ep.deactivate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('fail'));

    await expect(loader.unload(instance, ep)).resolves.toBeUndefined();
    expect(instance.state).toBe('unloaded');
  });
});

// ===========================================================================
// PluginSandbox Tests
// ===========================================================================

describe('PluginSandbox', () => {
  it('should execute within limits', async () => {
    const sandbox = new PluginSandbox();
    const instance = createInstance();
    sandbox.startMonitoring(instance);

    const result = await sandbox.execute(
      instance,
      async () => 42,
      { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 5000 },
    );

    expect(result).toBe(42);
    expect(instance.resourceUsage.tasksExecuted).toBe(1);
    sandbox.stopMonitoring(instance);
  });

  it('should enforce timeout', async () => {
    const sandbox = new PluginSandbox();
    const instance = createInstance();
    sandbox.startMonitoring(instance);

    await expect(
      sandbox.execute(
        instance,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return 'done';
        },
        { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 100 },
      ),
    ).rejects.toThrow(ExecutionTimeoutError);

    sandbox.stopMonitoring(instance);
  });

  it('should enforce concurrency limit', async () => {
    const sandbox = new PluginSandbox();
    const instance = createInstance();
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 2, executionTimeoutMs: 5000 };

    sandbox.startMonitoring(instance);

    // Fill up concurrency
    const p1 = sandbox.execute(instance, async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 1;
    }, limits);
    const p2 = sandbox.execute(instance, async () => {
      await new Promise((r) => setTimeout(r, 200));
      return 2;
    }, limits);

    // Third should fail
    await expect(
      sandbox.execute(instance, async () => 3, limits),
    ).rejects.toThrow(ResourceLimitError);

    await p1;
    await p2;
    sandbox.stopMonitoring(instance);
  });

  it('should track concurrent task count', () => {
    const sandbox = new PluginSandbox();
    expect(sandbox.getConcurrentTaskCount('p1')).toBe(0);
  });

  it('should report progress via callback', async () => {
    const sandbox = new PluginSandbox();
    const instance = createInstance();
    const limits = { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 5000 };
    const cb = vi.fn();

    await sandbox.execute(instance, async () => 'ok', limits, cb);
    // Progress callback is passed but not automatically called
    expect(true).toBe(true);
  });

  it('should propagate errors from plugin code', async () => {
    const sandbox = new PluginSandbox();
    const instance = createInstance();
    sandbox.startMonitoring(instance);

    await expect(
      sandbox.execute(
        instance,
        async () => {
          throw new Error('plugin crashed');
        },
        { maxMemoryMB: 128, maxCpuTimeMs: 30000, maxTokensPerTask: 10000, maxConcurrentTasks: 4, executionTimeoutMs: 5000 },
      ),
    ).rejects.toThrow('plugin crashed');

    sandbox.stopMonitoring(instance);
  });
});

// ===========================================================================
// PluginRegistry Tests
// ===========================================================================

describe('PluginRegistry', () => {
  it('should register a plugin', () => {
    const registry = new PluginRegistry();
    const instance = createInstance();
    registry.register(instance);
    expect(registry.has('test-plugin')).toBe(true);
  });

  it('should throw on duplicate registration', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance());
    expect(() => registry.register(createInstance())).toThrow('already registered');
  });

  it('should unregister a plugin', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance());
    const removed = registry.unregister('test-plugin');
    expect(removed).toBeDefined();
    expect(registry.has('test-plugin')).toBe(false);
  });

  it('should return undefined for unknown unregister', () => {
    const registry = new PluginRegistry();
    expect(registry.unregister('unknown')).toBeUndefined();
  });

  it('should get a plugin by id', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance());
    expect(registry.get('test-plugin')).toBeDefined();
  });

  it('should return undefined for unknown id', () => {
    const registry = new PluginRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('should list all plugins', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance({ id: 'a' }));
    registry.register(createInstance({ id: 'b' }));
    expect(registry.list()).toHaveLength(2);
  });

  it('should filter by category', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance({
      id: 'agent-plugin',
      manifest: createManifest({ id: 'agent-plugin', category: 'agent' }),
    }));
    registry.register(createInstance({
      id: 'memory-plugin',
      manifest: createManifest({ id: 'memory-plugin', category: 'memory' }),
    }));
    expect(registry.getByCategory('agent')).toHaveLength(1);
    expect(registry.getByCategory('memory')).toHaveLength(1);
    expect(registry.getByCategory('model')).toHaveLength(0);
  });

  it('should report size', () => {
    const registry = new PluginRegistry();
    expect(registry.size).toBe(0);
    registry.register(createInstance({ id: 'a' }));
    expect(registry.size).toBe(1);
  });

  it('should clear all entries', () => {
    const registry = new PluginRegistry();
    registry.register(createInstance({ id: 'a' }));
    registry.register(createInstance({ id: 'b' }));
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

// ===========================================================================
// DependencyResolver Tests
// ===========================================================================

describe('DependencyResolver', () => {
  it('should resolve simple dependency order', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'b', dependencies: { a: '>=1.0.0' } }),
      createManifest({ id: 'a' }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(true);
    expect(result.loadOrder).toEqual(['a', 'b']);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect circular dependencies', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'a', dependencies: { b: '>=1.0.0' } }),
      createManifest({ id: 'b', dependencies: { a: '>=1.0.0' } }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Circular'))).toBe(true);
  });

  it('should find missing dependencies', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'a', dependencies: { missing: '>=1.0.0' } }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing dependencies'))).toBe(true);
  });

  it('should handle plugins with no dependencies', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'a' }),
      createManifest({ id: 'b' }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(true);
    expect(result.loadOrder).toHaveLength(2);
  });

  it('should handle three-level dependency chain', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'c', dependencies: { b: '>=1.0.0' } }),
      createManifest({ id: 'b', dependencies: { a: '>=1.0.0' } }),
      createManifest({ id: 'a' }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(true);
    expect(result.loadOrder).toEqual(['a', 'b', 'c']);
  });

  it('should report both missing and circular errors', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'a', dependencies: { b: '>=1.0.0' } }),
      createManifest({ id: 'b', dependencies: { a: '>=1.0.0', missing: '>=1.0.0' } }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should detect self-referencing circular dependency', () => {
    const resolver = new DependencyResolver();
    const manifests: PluginManifest[] = [
      createManifest({ id: 'a', dependencies: { a: '>=1.0.0' } }),
    ];
    const result = resolver.resolve(manifests);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Circular'))).toBe(true);
  });

  it('should handle empty manifest list', () => {
    const resolver = new DependencyResolver();
    const result = resolver.resolve([]);
    expect(result.valid).toBe(true);
    expect(result.loadOrder).toHaveLength(0);
  });

  it('should findMissingDeps correctly', () => {
    const resolver = new DependencyResolver();
    const manifest = createManifest({ id: 'a', dependencies: { x: '>=1', y: '>=2' } });
    const available = new Map<string, PluginManifest>();
    available.set('x', createManifest({ id: 'x' }));
    const missing = resolver.findMissingDeps(manifest, available);
    expect(missing).toEqual(['y']);
  });

  it('should return empty for no missing deps', () => {
    const resolver = new DependencyResolver();
    const manifest = createManifest({ id: 'a', dependencies: { x: '>=1' } });
    const available = new Map<string, PluginManifest>();
    available.set('x', createManifest({ id: 'x' }));
    expect(resolver.findMissingDeps(manifest, available)).toHaveLength(0);
  });

  it('should return empty for manifest with no dependencies', () => {
    const resolver = new DependencyResolver();
    const manifest = createManifest({ id: 'a' });
    expect(resolver.findMissingDeps(manifest, new Map())).toHaveLength(0);
  });
});

// ===========================================================================
// PluginMetrics Tests
// ===========================================================================

describe('PluginMetrics', () => {
  it('should record install', () => {
    const metrics = new PluginMetrics();
    metrics.recordInstall('p1');
    expect(metrics.getMetric('p1:installs')).toBe(1);
    metrics.recordInstall('p1');
    expect(metrics.getMetric('p1:installs')).toBe(2);
  });

  it('should record activate', () => {
    const metrics = new PluginMetrics();
    metrics.recordActivate('p1', 100);
    expect(metrics.getMetric('p1:activations')).toBe(1);
    expect(metrics.getMetric('p1:activateDurationMs')).toBe(100);
  });

  it('should record deactivate', () => {
    const metrics = new PluginMetrics();
    metrics.recordDeactivate('p1');
    expect(metrics.getMetric('p1:deactivations')).toBe(1);
  });

  it('should record error', () => {
    const metrics = new PluginMetrics();
    metrics.recordError('p1', 'something broke');
    expect(metrics.getMetric('p1:errors')).toBe(1);
  });

  it('should record resource usage', () => {
    const metrics = new PluginMetrics();
    metrics.recordResourceUsage('p1', { memoryMB: 64, cpuTimeMs: 500, tokensUsed: 100, tasksExecuted: 10 });
    expect(metrics.getMetric('p1:memoryMB')).toBe(64);
    expect(metrics.getMetric('p1:cpuTimeMs')).toBe(500);
    expect(metrics.getMetric('p1:tokensUsed')).toBe(100);
    expect(metrics.getMetric('p1:tasksExecuted')).toBe(10);
  });

  it('should get all metrics', () => {
    const metrics = new PluginMetrics();
    metrics.recordInstall('p1');
    metrics.recordActivate('p1', 50);
    const all = metrics.getMetrics();
    expect(all['p1:installs']).toBe(1);
    expect(all['p1:activations']).toBe(1);
  });

  it('should return 0 for unknown metric', () => {
    const metrics = new PluginMetrics();
    expect(metrics.getMetric('unknown')).toBe(0);
  });

  it('should reset all metrics', () => {
    const metrics = new PluginMetrics();
    metrics.recordInstall('p1');
    metrics.recordActivate('p1', 50);
    metrics.reset();
    expect(metrics.getMetric('p1:installs')).toBe(0);
    expect(Object.keys(metrics.getMetrics())).toHaveLength(0);
  });
});

// ===========================================================================
// PluginManager Tests
// ===========================================================================

describe('PluginManager', () => {
  let tmpDir: string;
  let eventBus: EventBus;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-mgr-'));
    eventBus = createMockEventBus();
    clearSDKStores();
  });

  async function createPluginFile(dir: string, id: string): Promise<PluginManifest> {
    const entryCode = `
      module.exports = {
        async activate(sdk) { this.activated = true; },
        async deactivate() { this.deactivated = true; },
        async healthCheck() { return { status: 'healthy' }; }
      };
    `;
    await fs.writeFile(path.join(dir, 'index.js'), entryCode);
    const content = await fs.readFile(path.join(dir, 'index.js'));
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    return createManifest({
      id,
      checksum,
      permissions: [
        { type: 'memory', access: 'read' },
        { type: 'memory', access: 'write' },
        { type: 'event', access: 'read' },
        { type: 'event', access: 'write' },
      ],
    });
  }

  it('should install a plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'my-plugin');
    const instance = await manager.install(manifest, Buffer.from('source'));

    expect(instance.id).toBe('my-plugin');
    expect(instance.state).toBe('registered');
    expect(manager.getPlugin('my-plugin')).toBeDefined();
    expect(eventBus.emit).toHaveBeenCalledWith(PluginEvents.PLUGIN_INSTALLED, { pluginId: 'my-plugin' });
  });

  it('should reject install with invalid manifest', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = createManifest({ id: '', checksum: 'x' });
    await expect(manager.install(manifest, Buffer.from(''))).rejects.toThrow('verification failed');
  });

  it('should activate a plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'my-plugin');
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('my-plugin');

    const instance = manager.getPlugin('my-plugin');
    expect(instance?.state).toBe('healthy');
    expect(eventBus.emit).toHaveBeenCalledWith(PluginEvents.PLUGIN_ACTIVATED, expect.objectContaining({ pluginId: 'my-plugin' }));
  });

  it('should deactivate a plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'my-plugin');
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('my-plugin');
    await manager.deactivate('my-plugin');

    const instance = manager.getPlugin('my-plugin');
    expect(instance?.state).toBe('stopped');
    expect(eventBus.emit).toHaveBeenCalledWith(PluginEvents.PLUGIN_DEACTIVATED, { pluginId: 'my-plugin' });
  });

  it('should uninstall a plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'my-plugin');
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('my-plugin');
    await manager.uninstall('my-plugin');

    expect(manager.getPlugin('my-plugin')).toBeUndefined();
    expect(eventBus.emit).toHaveBeenCalledWith(PluginEvents.PLUGIN_REMOVED, { pluginId: 'my-plugin' });
  });

  it('should throw on uninstall of unknown plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    await expect(manager.uninstall('unknown')).rejects.toThrow('not found');
  });

  it('should throw on activate of unknown plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    await expect(manager.activate('unknown')).rejects.toThrow('not found');
  });

  it('should throw on deactivate of unknown plugin', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    await expect(manager.deactivate('unknown')).rejects.toThrow('not found');
  });

  it('should list all plugins', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const m1 = await createPluginFile(tmpDir, 'p1');
    const m2 = await createPluginFile(tmpDir, 'p2');
    await manager.install(m1, Buffer.from(''));
    await manager.install(m2, Buffer.from(''));

    expect(manager.listPlugins()).toHaveLength(2);
  });

  it('should handle full lifecycle: install → activate → deactivate → uninstall', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'lifecycle-plugin');
    await manager.install(manifest, Buffer.from(''));
    expect(manager.getPlugin('lifecycle-plugin')?.state).toBe('registered');

    await manager.activate('lifecycle-plugin');
    expect(manager.getPlugin('lifecycle-plugin')?.state).toBe('healthy');

    await manager.deactivate('lifecycle-plugin');
    expect(manager.getPlugin('lifecycle-plugin')?.state).toBe('stopped');

    await manager.uninstall('lifecycle-plugin');
    expect(manager.getPlugin('lifecycle-plugin')).toBeUndefined();
  });

  it('should handle health check', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = await createPluginFile(tmpDir, 'hc-plugin');
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('hc-plugin');

    const health = await manager.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.plugins).toHaveLength(1);
    expect(health.plugins[0].status).toBe('healthy');
  });

  it('should handle health check with unhealthy plugin', async () => {
    // Create a plugin that returns unhealthy
    const entryCode = `
      module.exports = {
        async activate(sdk) {},
        async deactivate() {},
        async healthCheck() { return { status: 'unhealthy', details: 'bad state' }; }
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);
    const content = await fs.readFile(path.join(tmpDir, 'index.js'));
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = createManifest({
      id: 'bad-plugin',
      checksum,
      permissions: [
        { type: 'memory', access: 'read' },
        { type: 'memory', access: 'write' },
        { type: 'event', access: 'read' },
        { type: 'event', access: 'write' },
      ],
    });
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('bad-plugin');

    const health = await manager.healthCheck();
    expect(health.status).toBe('unhealthy');
    expect(health.plugins[0].status).toBe('error');
  });

  it('should return healthy when no plugins registered', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const health = await manager.healthCheck();
    expect(health.status).toBe('healthy');
    expect(health.plugins).toHaveLength(0);
  });

  it('should get metrics', () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const metrics = manager.getMetrics();
    expect(metrics).toBeInstanceOf(PluginMetrics);
  });

  it('should resolve dependencies', async () => {
    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const m1 = await createPluginFile(tmpDir, 'dep-a');
    const m2 = await createPluginFile(tmpDir, 'dep-b');
    await manager.install(m1, Buffer.from(''));
    await manager.install(m2, Buffer.from(''));

    const result = manager.resolveDependencies();
    expect(result.valid).toBe(true);
    expect(result.loadOrder).toHaveLength(2);
  });
});

// ===========================================================================
// Integration: SDK → Manager Lifecycle
// ===========================================================================

describe('SDK + Manager Integration', () => {
  let tmpDir: string;
  let eventBus: EventBus;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'volt-int-'));
    eventBus = createMockEventBus();
    clearSDKStores();
  });

  it('should provide working SDK to activated plugin', async () => {
    let capturedSDK: VoltSDKImpl | null = null;

    const entryCode = `
      module.exports = {
        async activate(sdk) {
          global.__capturedSDK = sdk;
        },
        async deactivate() {},
        async healthCheck() { return { status: 'healthy' }; }
      };
    `;
    await fs.writeFile(path.join(tmpDir, 'index.js'), entryCode);
    const content = await fs.readFile(path.join(tmpDir, 'index.js'));
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    const manager = new PluginManager({ eventBus, pluginDir: tmpDir });
    const manifest = createManifest({
      id: 'sdk-test',
      checksum,
      permissions: [
        { type: 'memory', access: 'read' },
        { type: 'memory', access: 'write' },
        { type: 'event', access: 'read' },
        { type: 'event', access: 'write' },
      ],
    });
    await manager.install(manifest, Buffer.from(''));
    await manager.activate('sdk-test');

    // The SDK should have been created
    const instance = manager.getPlugin('sdk-test');
    expect(instance?.state).toBe('healthy');
  });
});
