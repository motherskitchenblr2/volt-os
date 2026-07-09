# SDK Guide — VOLT OS

## Installation

```bash
npm install @volt/sdk
```

## Basic Usage

```typescript
import { Volt } from "@volt/sdk";

const volt = new Volt();

// Health check
const health = await volt.health();

// Pipeline operations
const pipeline = await volt.pipeline.create({ ... });
await volt.pipeline.start(pipeline.id);

// Agent operations
const agents = volt.agent.list();
const result = await volt.agent.run("researcher", { ... });

// Memory operations
await volt.memory.write("project", "proj-1", "key", "value");
const entry = await volt.memory.read("project", "proj-1", "key");

// Event operations
await volt.events.publish("custom.event", "project", "proj-1", { ... });
```

## Configuration

```typescript
const volt = new Volt({
  apiUrl: "http://localhost:3000",
  apiKey: "your-api-key",
});
```

## Error Handling

```typescript
try {
  await volt.pipeline.start(pipelineId);
} catch (error) {
  console.error("Pipeline failed:", error.message);
}
```
