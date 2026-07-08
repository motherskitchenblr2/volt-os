"""Tests for src.agents.frontend_dev — Frontend Dev Agent."""
import pytest
from src.agents.frontend_dev import FrontendDevAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestFrontendDevAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return FrontendDevAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={
                "architecture_spec": {"components": [{"name": "frontend", "type": "frontend", "responsibility": "UI"}]},
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
        assert "build_report" in result.output_artifacts

    def test_health_check(self, agent):
        assert agent.health_check()["status"] == "healthy"
        assert agent.health_check()["agent"] == "frontend_dev"

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        assert agent.output_types() == ["code"]

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "architecture_spec" in types
        assert "task_breakdown" in types

    def test_generate_code(self, agent):
        arch = {"components": [{"name": "frontend", "type": "frontend"}]}
        code = agent._generate_code(arch)
        assert "files" in code
        assert len(code["files"]) == 1
        assert code["files"][0]["path"] == "src/app/page.tsx"
        assert "manifest" in code
        assert "build_status" in code
        assert code["build_status"] == "success"

    def test_generate_code_build_report(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        build = result.output_artifacts["build_report"]
        assert build["build_status"] == "success"
        assert "total_files" in build
