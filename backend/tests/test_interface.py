"""Tests for src.agents.interface — Agent contracts, dataclasses, and enums."""
import pytest
from src.agents.interface import AgentInterface, AgentContext, AgentResult, AgentStatus


# ===========================================================================
# AgentStatus enum
# ===========================================================================

class TestAgentStatus:
    def test_enum_values(self):
        assert AgentStatus.IDLE == "idle"
        assert AgentStatus.RUNNING == "running"
        assert AgentStatus.COMPLETED == "completed"
        assert AgentStatus.FAILED == "failed"
        assert AgentStatus.TIMEOUT == "timeout"

    def test_enum_is_string(self):
        assert isinstance(AgentStatus.IDLE, str)
        assert AgentStatus.IDLE.value == "idle"

    def test_all_members_present(self):
        members = list(AgentStatus)
        assert len(members) == 5


# ===========================================================================
# AgentContext dataclass
# ===========================================================================

class TestAgentContext:
    def test_create_minimal(self):
        ctx = AgentContext(
            project_id="p1",
            task_id="t1",
            agent_id="a1",
            input_artifacts={},
            memory={},
            permissions=[],
        )
        assert ctx.project_id == "p1"
        assert ctx.task_id == "t1"
        assert ctx.model_override is None
        assert ctx.cost_budget_usd == 2.0

    def test_create_with_optional_fields(self):
        ctx = AgentContext(
            project_id="p1",
            task_id="t1",
            agent_id="a1",
            input_artifacts={"brief": {"goals": []}},
            memory={"key": "val"},
            permissions=["read"],
            model_override="claude-sonnet-4",
            cost_budget_usd=5.0,
        )
        assert ctx.model_override == "claude-sonnet-4"
        assert ctx.cost_budget_usd == 5.0

    def test_input_artifacts_mutable(self):
        ctx = AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={}, memory={}, permissions=[],
        )
        ctx.input_artifacts["new"] = True
        assert ctx.input_artifacts["new"] is True


# ===========================================================================
# AgentResult dataclass
# ===========================================================================

class TestAgentResult:
    def test_create_defaults(self):
        result = AgentResult(status=AgentStatus.COMPLETED)
        assert result.status == AgentStatus.COMPLETED
        assert result.output_artifacts == {}
        assert result.error is None
        assert result.tokens_used == 0
        assert result.cost_usd == 0.0
        assert result.duration_ms == 0
        assert result.metadata == {}

    def test_create_full(self):
        result = AgentResult(
            status=AgentStatus.FAILED,
            output_artifacts={"code": {}},
            error="timeout",
            tokens_used=1000,
            cost_usd=0.05,
            duration_ms=5000,
            metadata={"model": "gpt-4o"},
        )
        assert result.status == AgentStatus.FAILED
        assert result.output_artifacts == {"code": {}}
        assert result.error == "timeout"
        assert result.tokens_used == 1000
        assert result.cost_usd == 0.05
        assert result.duration_ms == 5000
        assert result.metadata["model"] == "gpt-4o"


# ===========================================================================
# AgentInterface abstract class
# ===========================================================================

class ConcreteAgent(AgentInterface):
    """Minimal concrete implementation for testing the ABC."""

    def __init__(self):
        self._output_types = ["code"]
        self._input_types = ["requirements"]

    def initialize(self, context):
        pass

    def execute(self, task):
        return AgentResult(status=AgentStatus.COMPLETED)

    def health_check(self):
        return {"status": "healthy"}

    def cleanup(self):
        pass

    def output_types(self):
        return self._output_types

    def input_types(self):
        return self._input_types


class TestAgentInterface:
    def test_can_handle_matching_type(self):
        agent = ConcreteAgent()
        assert agent.can_handle("code") is True

    def test_can_handle_non_matching_type(self):
        agent = ConcreteAgent()
        assert agent.can_handle("unknown") is False

    def test_health_check(self):
        agent = ConcreteAgent()
        assert agent.health_check() == {"status": "healthy"}

    def test_output_types(self):
        agent = ConcreteAgent()
        assert agent.output_types() == ["code"]

    def test_input_types(self):
        agent = ConcreteAgent()
        assert agent.input_types() == ["requirements"]

    def test_cannot_instantiate_abc_directly(self):
        with pytest.raises(TypeError):
            AgentInterface()

    def test_initialize_and_cleanup(self):
        agent = ConcreteAgent()
        ctx = AgentContext(
            project_id="p1", task_id="t1", agent_id="a1",
            input_artifacts={}, memory={}, permissions=[],
        )
        agent.initialize(ctx)
        agent.cleanup()  # should not raise
