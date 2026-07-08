"""Tests for src.agents.memory_manager — Memory Manager Agent."""
import pytest
from src.agents.memory_manager import MemoryManagerAgent
from src.agents.interface import AgentContext, AgentResult, AgentStatus
from src.model_router.router import ModelRouter


class TestMemoryManagerAgent:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def agent(self, model_router):
        return MemoryManagerAgent(model_router)

    @pytest.fixture
    def context(self):
        return AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={"context": {}, "memory_query": "find similar"},
            memory={}, permissions=["memory.read"],
        )

    def test_initialize(self, agent, context):
        agent.initialize(context)
        assert agent.context == context

    def test_execute_success(self, agent, context):
        agent.initialize(context)
        result = agent.execute({})
        assert result.status == AgentStatus.COMPLETED
        assert "memory_context" in result.output_artifacts
        assert "knowledge_summary" in result.output_artifacts

    def test_health_check(self, agent):
        assert agent.health_check() == {"status": "healthy", "agent": "memory_manager"}

    def test_cleanup(self, agent, context):
        agent.initialize(context)
        agent.cleanup()
        assert agent.context is None

    def test_output_types(self, agent):
        types = agent.output_types()
        assert "memory_context" in types
        assert "knowledge_summary" in types

    def test_input_types(self, agent):
        types = agent.input_types()
        assert "context" in types
        assert "memory_query" in types
