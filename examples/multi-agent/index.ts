import { Volt } from "@volt/sdk";

async function main() {
  const volt = new Volt();

  // Register agents
  const agents = [
    { id: "researcher", capabilities: ["research"] },
    { id: "architect", capabilities: ["architecture"] },
    { id: "frontend", capabilities: ["frontend", "react"] },
    { id: "backend", capabilities: ["backend", "api"] },
    { id: "qa", capabilities: ["testing", "validation"] },
  ];

  for (const agent of agents) {
    console.log(`Agent: ${agent.id} (${agent.capabilities.join(", ")})`);
  }

  // Create pipeline with parallel stages
  const pipeline = await volt.pipeline.create({
    name: "multi-agent",
    stages: [
      { name: "research", agentId: "researcher" },
      { name: "design", agentId: "architect", dependsOn: ["research"] },
      { name: "frontend", agentId: "frontend", dependsOn: ["design"] },
      { name: "backend", agentId: "backend", dependsOn: ["design"] },
      { name: "validate", agentId: "qa", dependsOn: ["frontend", "backend"] },
    ],
  });

  await volt.pipeline.start(pipeline.id);
  console.log("Multi-agent workflow started");
}

main().catch(console.error);
