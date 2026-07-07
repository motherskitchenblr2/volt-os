/**
 * Pipeline Plugin — Example of event monitoring through VoltSDK
 *
 * Demonstrates:
 * - Event subscription (pipeline events)
 * - Event publishing (audit events)
 * - Event permissions
 */

import type { VoltSDK, PluginEntryPoint } from '@volt-os/plugin-runtime';

let sdk: VoltSDK | null = null;

const entry: PluginEntryPoint = {
  async activate(sdkInstance: VoltSDK): Promise<void> {
    sdk = sdkInstance;
    sdk.logger.info('Pipeline Plugin activated');

    // Subscribe to pipeline stage events
    await sdk.events.subscribe('pipeline.stage.started', async (payload) => {
      sdk?.logger.info('Stage started', payload);
      await sdk?.events.publish('pipeline.audit.logged', {
        event: 'stage.started',
        payload,
        timestamp: new Date().toISOString(),
      });
    });

    await sdk.events.subscribe('pipeline.stage.completed', async (payload) => {
      sdk?.logger.info('Stage completed', payload);
    });

    await sdk.events.subscribe('pipeline.stage.failed', async (payload) => {
      sdk?.logger.error('Stage failed', payload);
    });
  },

  async deactivate(): Promise<void> {
    sdk?.logger.info('Pipeline Plugin deactivated');
    sdk = null;
  },

  async healthCheck() {
    return { status: sdk ? 'healthy' : 'unhealthy' };
  },
};

export default entry;
