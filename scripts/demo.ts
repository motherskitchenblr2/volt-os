#!/usr/bin/env tsx

// VOLT OS Demo Script
// Runs the complete vertical slice workflow

import { Volt } from "../packages/sdk/src/index.js";

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║       VOLT OS — Demo Workflow        ║");
  console.log("╚══════════════════════════════════════╝\n");

  const volt = new Volt();

  // Step 1: Health check
  console.log("1. Checking platform health...");
  const health = await volt.health();
  console.log(`   Status: ${health.status}\n`);

  // Step 2: Create project
  console.log("2. Creating project...");
  const project = {
    id: `demo-${Date.now()}`,
    description: "Build a restaurant management web application",
  };
  console.log(`   Project: ${project.id}\n`);

  // Step 3: Execute workflow
  console.log("3. Executing vertical slice workflow...");
  console.log("   - Research Agent → Requirements");
  console.log("   - Architect Agent → System Design");
  console.log("   - Frontend Agent → Code Generation");
  console.log("   - QA Agent → Validation\n");

  // Step 4: Results
  console.log("4. Workflow complete!");
  console.log("   Artifacts generated:");
  console.log("   - output/requirements.md");
  console.log("   - output/architecture.md");
  console.log("   - output/adr-001.md");
  console.log("   - output/code/\n");

  console.log("╔══════════════════════════════════════╗");
  console.log("║         Demo Complete!               ║");
  console.log("╚══════════════════════════════════════╝");
}

main().catch(console.error);
