"""Tests for src.agents.backend_dev — Backend Dev Agent."""
import pytest
from src.agents.backend_dev import BackendDevAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestBackendDevAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return BackendDevAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={
                "architecture_spec": {"components": []},
                "task_breakdown": {"tasks": []},
            },
            memory={}, permissions=["sandbox.execute"],
        )

    def test_initialize(self, agent, context):
        agent.initialize(context)
        assert agent.context == context

    def test_execute_success(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.status == AgentStatus.COMPLETED
        assert "code" in result.output_artifacts
        assert "api_spec" in result.output_artifacts
        assert "build_report" in result.output_artifacts

    def test_health_check(self, agent):
        assert agent.health_check() == {"status": "healthy", "agent": "backend_dev"}

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        types = agent.output_types()
        assert "code" in types
        assert "api_spec" in types

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "architecture_spec" in types
        assert "task_breakdown" in types

    def test_api_spec_format(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        api_spec = result.output_artifacts["api_spec"]
        assert api_spec["openapi"] == "3.1.0"
        assert "paths" in api_spec

    def test_code_files(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        code = result.output_artifacts["code"]
        assert len(code["files"]) == 1
        assert code["files"][0]["language"] == "python"
