import { Volt } from "@volt/sdk";

async function main() {
  const volt = new Volt();

  // 1. Check health
  const health = await volt.health();
  console.log("Platform health:", health.status);

  // 2. Create a pipeline
  const pipeline = await volt.pipeline.create({
    name: "hello-world",
    stages: [
      { name: "research", agentId: "researcher" },
      { name: "architecture", agentId: "architect", dependsOn: ["research"] },
    ],
  });
  console.log("Pipeline created:", pipeline.id);

  // 3. Start the pipeline
  await volt.pipeline.start(pipeline.id);
  console.log("Pipeline started");

  // 4. Wait for completion
  // (In production, use WebSocket for real-time updates)
}

main().catch(console.error);
