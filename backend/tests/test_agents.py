"""Tests for src.agents.registry — Agent registry, registration, and retrieval."""
import pytest
from unittest.mock import MagicMock
from src.agents.registry import AgentRegistry
from src.agents.interface import AgentInterface
from src.model_router.router import ModelRouter


class TestAgentRegistry:
    @pytest.fixture
    def model_router(self):
        return ModelRouter()

    @pytest.fixture
    def registry(self, model_router):
        return AgentRegistry(model_router)

    def test_default_agents_registered(self, registry):
        types = registry.list_types()
        assert "researcher" in types
        assert "architect" in types
        assert "frontend_dev" in types
        assert "backend_dev" in types
        assert "qa" in types
        assert "memory_manager" in types
        assert "sentinel" in types

    def test_default_count(self, registry):
        assert len(registry.list_types()) == 7

    def test_get_researcher(self, registry):
        agent = registry.get("researcher")
        assert isinstance(agent, AgentInterface)
        assert agent.health_check()["agent"] == "researcher"

    def test_get_architect(self, registry):
        agent = registry.get("architect")
        assert isinstance(agent, AgentInterface)
        assert agent.health_check()["agent"] == "architect"

    def test_get_frontend_dev(self, registry):
        agent = registry.get("frontend_dev")
        assert agent.health_check()["agent"] == "frontend_dev"

    def test_get_backend_dev(self, registry):
        agent = registry.get("backend_dev")
        assert agent.health_check()["agent"] == "backend_dev"

    def test_get_qa(self, registry):
        agent = registry.get("qa")
        assert agent.health_check()["agent"] == "qa"

    def test_get_memory_manager(self, registry):
        agent = registry.get("memory_manager")
        assert agent.health_check()["agent"] == "memory_manager"

    def test_get_sentinel(self, registry):
        agent = registry.get("sentinel")
        assert agent.health_check()["agent"] == "sentinel"

    def test_get_unknown_raises(self, registry):
        with pytest.raises(ValueError, match="Unknown agent type"):
            registry.get("nonexistent_agent")

    def test_register_custom_agent(self, registry, model_router):
        class CustomAgent(AgentInterface):
            def __init__(self, mr):
                self.model_router = mr
            def initialize(self, ctx): pass
            def execute(self, task):
                from src.agents.interface import AgentResult, AgentStatus
                return AgentResult(status=AgentStatus.COMPLETED)
            def health_check(self): return {"status": "healthy", "agent": "custom"}
            def cleanup(self): pass
            def output_types(self): return ["custom_output"]
            def input_types(self): return ["custom_input"]

        registry.register("custom", CustomAgent)
        assert "custom" in registry.list_types()
        agent = registry.get("custom")
        assert agent.health_check()["agent"] == "custom"

    def test_register_overwrites_existing(self, registry, model_router):
        class FakeAgent(AgentInterface):
            def __init__(self, mr): self.mr = mr
            def initialize(self, ctx): pass
            def execute(self, task):
                from src.agents.interface import AgentResult, AgentStatus
                return AgentResult(status=AgentStatus.COMPLETED)
            def health_check(self): return {"agent": "fake"}
            def cleanup(self): pass
            def output_types(self): return []
            def input_types(self): return []

        registry.register("researcher", FakeAgent)
        agent = registry.get("researcher")
        assert agent.health_check()["agent"] == "fake"

    def test_list_types_returns_list(self, registry):
        types = registry.list_types()
        assert isinstance(types, list)
        assert all(isinstance(t, str) for t in types)
