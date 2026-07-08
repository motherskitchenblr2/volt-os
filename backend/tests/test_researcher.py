"""Tests for src.agents.researcher — Researcher Agent."""
import pytest
from src.agents.researcher import ResearcherAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestResearcherAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return ResearcherAgent(model_router)

    @pytest.fixture
    def context_with_brief(self):
        return AgentContext(
            project_id="p1",
            task_id="t1",
            agent_id="a1",
            input_artifacts={"project_brief": {"goals": ["Build a REST API"], "constraints": [], "preferred_stack": {"frontend": "React"}}},
            memory={},
            permissions=["artifact.read"],
        )

    @pytest.fixture
    def context_empty_brief(self):
        return AgentContext(
            project_id="p1",
            task_id="t1",
            agent_id="a1",
            input_artifacts={},
            memory={},
            permissions=[],
        )

    def test_initialize(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        assert agent.context == context_with_brief

    def test_execute_success(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        result = agent.execute({})
        assert isinstance(result, AgentResult)
        assert result.status == AgentStatus.COMPLETED
        assert "requirements" in result.output_artifacts
        assert "tech_research" in result.output_artifacts
        assert "feasibility_report" in result.output_artifacts
        assert result.duration_ms >= 0

    def test_execute_missing_brief(self, agent, context_empty_brief):
        agent.initialize(context_empty_brief)
        result = agent.execute({})
        assert result.status == AgentStatus.FAILED
        assert "Missing required input" in result.error

    def test_health_check(self, agent):
        health = agent.health_check()
        assert health["status"] == "healthy"
        assert health["agent"] == "researcher"

    def test_cleanup(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        assert agent.context is not None
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        types = agent.output_types()
        assert "requirements" in types
        assert "tech_research" in types
        assert "feasibility_report" in types

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "project_brief" in types
        assert "context" in types

    def test_can_handle(self, agent):
        assert agent.can_handle("requirements") is True
        assert agent.can_handle("unknown") is False

    def test_execute_generates_requirements(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        result = agent.execute({})
        reqs = result.output_artifacts["requirements"]
        assert "functional" in reqs
        assert "non_functional" in reqs
        assert len(reqs["functional"]) > 0

    def test_execute_generates_feasibility(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        result = agent.execute({})
        feasibility = result.output_artifacts["feasibility_report"]
        assert "overall_feasibility" in feasibility
        assert feasibility["overall_feasibility"] == "feasible"

    def test_execute_includes_cost(self, agent, context_with_brief):
        agent.initialize(context_with_brief)
        result = agent.execute({})
        assert result.cost_usd > 0
        assert result.metadata.get("model") is not None

    def test_generate_requirements_many_goals(self, agent):
        brief = {"goals": ["A", "B", "C", "D", "E", "F", "G"], "constraints": [], "preferred_stack": {}}
        reqs = agent._generate_requirements(brief)
        assert len(reqs["functional"]) == 7
        # First 3 are must_have
        for i in range(3):
            assert reqs["functional"][i]["priority"] == "must_have"
        # Rest are should_have
        for i in range(3, 7):
            assert reqs["functional"][i]["priority"] == "should_have"

    def test_generate_tech_research_with_stack(self, agent):
        brief = {"preferred_stack": {"frontend": "Vue.js"}}
        research = agent._generate_tech_research(brief)
        assert len(research["technologies"]) == 1
        assert research["technologies"][0]["name"] == "Vue.js"

    def test_generate_tech_research_empty(self, agent):
        brief = {"preferred_stack": {}}
        research = agent._generate_tech_research(brief)
        assert len(research["technologies"]) == 0

    def test_generate_feasibility_low_complexity(self, agent):
        reqs = {"functional": [{"id": "FR-1"}, {"id": "FR-2"}]}
        brief = {"constraints": []}
        fea = agent._generate_feasibility(brief, reqs)
        assert fea["complexity"] == "low"

    def test_generate_feasibility_medium_complexity(self, agent):
        reqs = {"functional": [{"id": f"FR-{i}"} for i in range(5)]}
        fea = agent._generate_feasibility({}, reqs)
        assert fea["complexity"] == "medium"

    def test_generate_feasibility_high_complexity(self, agent):
        reqs = {"functional": [{"id": f"FR-{i}"} for i in range(10)]}
        fea = agent._generate_feasibility({}, reqs)
        assert fea["complexity"] == "high"
