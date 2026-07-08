"""Tests for src.agents.qa — QA Agent."""
import pytest
from src.agents.qa import QAAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestQAAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return QAAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={"code": {}, "architecture_spec": {}, "requirements": {}},
            memory={}, permissions=["sandbox.execute"],
        )

    def test_initialize(self, agent, context):
        agent.initialize(context)
        assert agent.context == context

    def test_execute_success(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.status == AgentStatus.COMPLETED
        assert "test_report" in result.output_artifacts
        report = result.output_artifacts["test_report"]
        assert "summary" in report
        assert report["summary"]["total"] == 0
        assert report["summary"]["coverage"] == 0.0

    def test_health_check(self, agent):
        assert agent.health_check() == {"status": "healthy", "agent": "qa"}

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        assert agent.output_types() == ["test_report"]

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "code" in types
        assert "architecture_spec" in types
        assert "requirements" in types

    def test_report_structure(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        report = result.output_artifacts["test_report"]
        assert "categories" in report
        assert "failures" in report
        assert isinstance(report["failures"], list)
