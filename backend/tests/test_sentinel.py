"""Tests for src.agents.sentinel — Sentinel Agent."""
import pytest
from src.agents.sentinel import SentinelAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestSentinelAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return SentinelAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={"code": {}, "architecture_spec": {}, "test_report": {}},
            memory={}, permissions=["sandbox.execute"],
        )

    def test_initialize(self, agent, context):
        agent.initialize(context)
        assert agent.context == context

    def test_execute_success(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.status == AgentStatus.COMPLETED
        assert "security_report" in result.output_artifacts
        report = result.output_artifacts["security_report"]
        assert "overall_risk" in report
        assert report["overall_risk"] == "low"

    def test_health_check(self, agent):
        assert agent.health_check() == {"status": "healthy", "agent": "sentinel"}

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        assert agent.output_types() == ["security_report"]

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "code" in types
        assert "architecture_spec" in types
        assert "test_report" in types

    def test_security_report_structure(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        report = result.output_artifacts["security_report"]
        assert "findings" in report
        assert "dependency_summary" in report
        assert "compliance" in report
        dep = report["dependency_summary"]
        assert dep["total"] == 0
        assert dep["vulnerable"] == 0
