import { Volt } from "@volt/sdk";

async function main() {
  const volt = new Volt();

  console.log("=== Restaurant App Generator ===\n");

  // 1. Create project
  const project = {
    id: `proj-${Date.now()}`,
    description: "Build a restaurant management web application",
  };
  console.log(`Project: ${project.id}`);

  // 2. Execute vertical slice workflow
  const pipeline = await volt.pipeline.create({
    name: "restaurant-app",
    stages: [
      { name: "research", agentId: "researcher" },
      { name: "architecture", agentId: "architect", dependsOn: ["research"] },
      { name: "frontend", agentId: "frontend-engineer", dependsOn: ["architecture"] },
      { name: "qa", agentId: "qa", dependsOn: ["frontend"] },
    ],
  });

  await volt.pipeline.start(pipeline.id);
  console.log("Workflow started...");

  // 3. Store artifacts
  // (In production, subscribe to events for completion)

  console.log("\n=== Generation Complete ===");
  console.log("Artifacts available in output/");
}

main().catch(console.error);
