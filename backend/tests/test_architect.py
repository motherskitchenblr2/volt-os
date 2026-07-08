"""Tests for src.agents.architect — Architect Agent."""
import pytest
from src.agents.architect import ArchitectAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestArchitectAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return ArchitectAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1",
            task_id="t1",
            agent_id="a1",
            input_artifacts={
                "requirements": {"functional": [{"id": "FR-1", "description": "Test"}], "non_functional": [], "constraints": []},
                "tech_research": {"technologies": [{"name": "FastAPI", "category": "framework"}], "recommendation": "Use FastAPI"},
                "feasibility_report": {"overall_feasibility": "feasible", "risks": [{"risk": "scope creep"}]},
            },
            memory={},
            permissions=["artifact.read"],
        )

    def test_initialize(self, agent, context):
        agent.initialize(context)
        assert agent.context == context

    def test_execute_success(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.status == AgentStatus.COMPLETED
        assert "architecture_spec" in result.output_artifacts
        assert "risk_assessment" in result.output_artifacts
        assert "tech_selection" in result.output_artifacts
        assert "task_breakdown" in result.output_artifacts

    def test_health_check(self, agent):
        assert agent.health_check() == {"status": "healthy", "agent": "architect"}

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        types = agent.output_types()
        assert "architecture_spec" in types
        assert "risk_assessment" in types
        assert "tech_selection" in types
        assert "task_breakdown" in types

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "requirements" in types
        assert "tech_research" in types
        assert "feasibility_report" in types

    def test_generate_architecture(self, agent):
        arch = agent._generate_architecture({}, {})
        assert "overview" in arch
        assert len(arch["components"]) == 3
        assert arch["components"][0]["name"] == "frontend"
        assert arch["components"][1]["name"] == "backend"
        assert arch["components"][2]["name"] == "database"

    def test_generate_risks(self, agent):
        feasibility = {"risks": [{"risk": "test", "likelihood": "high", "impact": "high"}]}
        risks = agent._generate_risks({}, feasibility)
        assert len(risks["risks"]) == 1
        assert risks["risks"][0]["id"] == "RISK-001"
        assert risks["risks"][0]["status"] == "open"

    def test_generate_risks_empty(self, agent):
        risks = agent._generate_risks({}, {"risks": []})
        assert len(risks["risks"]) == 0
        assert risks["overall_risk_level"] == "medium"

    def test_generate_tech_selection(self, agent):
        research = {"technologies": [{"name": "FastAPI", "category": "framework", "pros": ["Fast"]}]}
        sel = agent._generate_tech_selection(research)
        assert len(sel["selections"]) == 1
        assert sel["selections"][0]["selected"] == "FastAPI"

    def test_generate_task_breakdown(self, agent):
        arch = {"components": [{"name": "frontend", "type": "frontend", "responsibility": "UI"}, {"name": "backend", "type": "service", "responsibility": "API"}]}
        reqs = {"functional": []}
        tb = agent._generate_task_breakdown(arch, reqs)
        assert len(tb["tasks"]) == 2
        assert tb["tasks"][0]["agent"] == "frontend_dev"
        assert tb["tasks"][1]["agent"] == "backend_dev"
        assert tb["total_estimate_hours"] == 16

    def test_execute_includes_cost(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.cost_usd >= 0

    def test_execute_returns_metadata(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert "model" in result.metadata
