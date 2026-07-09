# Plugin Development

Example: create and register a custom plugin.

## Plugin Structure

```typescript
import { VoltSDK } from "@volt/sdk";

export class MyPlugin {
  manifest = {
    id: "my-plugin",
    name: "My Plugin",
    version: "1.0.0",
    capabilities: ["custom-task"],
  };

  async execute(task: any) {
    return { result: "done" };
  }
}
```

## Register Plugin

```typescript
const volt = new Volt();
await volt.plugin.install(new MyPlugin().manifest);
```
