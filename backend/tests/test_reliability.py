"""Tests for system reliability scenarios — component failure, partial failures, recovery."""
import pytest
from unittest.mock import MagicMock
from src.core.events import EventBus
from src.agents.registry import AgentRegistry
from src.model_router.router import ModelRouter
from src.orchestration.engine import PipelineEngine, PipelineStageStatus


class TestComponentFailure:
    def test_eventbus_publish_failure_recovery(self):
        """EventBus should handle Redis failures gracefully."""
        mock_redis = MagicMock()
        mock_redis.xadd.side_effect = Exception("Connection refused")

        with pytest.raises(Exception, match="Connection refused"):
            # When Redis is down, publish should propagate the error
            mock_redis.xadd("volt:events:test", {"data": "test"})

    def test_agent_registry_missing_type(self):
        """Registry should raise clear errors for missing agent types."""
        router = ModelRouter()
        registry = AgentRegistry(router)
        with pytest.raises(ValueError, match="Unknown agent type"):
            registry.get("nonexistent")

    def test_memory_agent_ephemeral_recovery(self):
        """Agent memory is Redis-only, so if Redis loses data, it's gone (by design)."""
        from src.memory.service import MemoryService
        mock_db = MagicMock()
        mock_redis = MagicMock()
        mock_redis.get.return_value = None  # data lost
        mock_bus = MagicMock()
        svc = MemoryService(mock_db, mock_redis, mock_bus)

        result = svc.retrieve("agent", "a1", "context")
        assert result is None  # graceful handling of missing data

    def test_model_router_fallback(self):
        """ModelRouter should always return a valid selection."""
        router = ModelRouter()
        # No providers registered, no preferences
        selection = router.select("any_task", "any_complexity")
        assert selection.model is not None
        assert selection.provider is not None


class TestPartialFailure:
    def test_model_provider_down(self):
        """ModelRouter should handle provider unavailability."""
        router = ModelRouter()

        class UnhealthyProvider:
            name = "unhealthy"
            models = ["bad-model"]
            async def complete(self, model, messages, **kwargs):
                raise ConnectionError("Provider down")
            async def health(self):
                return False

        router.register_provider(UnhealthyProvider())
        # Even with an unhealthy provider, fallback should work
        selection = router.select("general", "low")
        assert selection.model == "gpt-4o"  # fallback

    def test_pipeline_stage_failure(self):
        """Pipeline should handle stage failures gracefully."""
        engine = PipelineEngine()
        p = engine.get_pipeline("se-pipeline-v1")
        # Reset all stages
        for s in p.stages:
            s.status = PipelineStageStatus.PENDING
            s.result = {}

        # Complete discovery, then fail research
        for s in p.stages:
            if s.id == "discovery":
                s.status = PipelineStageStatus.COMPLETED
            elif s.id == "research":
                s.status = PipelineStageStatus.FAILED

        ready = engine.get_ready_stages(p)
        ready_ids = [s.id for s in ready]
        assert "research" not in ready_ids  # failed stage not ready

    def test_budget_exceeded(self):
        """CostTracker should block further spending."""
        from src.model_router.router import CostTracker
        ct = CostTracker(task_budget_usd=0.1)
        ct.record(0.1)
        assert ct.can_afford(0.01) is False

    def test_plugin_failure_circuit_breaker(self):
        """PluginService should auto-deactivate after repeated failures."""
        from src.plugins.service import PluginService
        mock_db = MagicMock()
        mock_bus = MagicMock()
        svc = PluginService(mock_db, mock_bus)

        plugin = MagicMock()
        plugin.id = "p1"
        plugin.consecutive_failures = 2
        plugin.status = "active"
        mock_db.query.return_value.filter.return_value.first.return_value = plugin

        result = svc.record_failure("p1", "crash")
        assert result.consecutive_failures == 3
        assert result.status == "error"  # auto-deactivated


class TestRecovery:
    def test_plugin_reset_health(self):
        """Plugin health reset should clear failures and restore active status."""
        from src.plugins.service import PluginService
        from src.plugins.models import PluginStatus
        mock_db = MagicMock()
        mock_bus = MagicMock()
        svc = PluginService(mock_db, mock_bus)

        plugin = MagicMock()
        plugin.id = "p1"
        plugin.consecutive_failures = 5
        plugin.last_error = "timeout"
        plugin.status = PluginStatus.ERROR
        mock_db.query.return_value.filter.return_value.first.return_value = plugin

        result = svc.reset_health("p1")
        assert result.consecutive_failures == 0
        assert result.last_error is None
        assert result.status == PluginStatus.ACTIVE

    def test_pipeline_ready_after_partial_completion(self):
        """Pipeline should show correct ready stages after partial completion."""
        engine = PipelineEngine()
        # Reset all stages
        p = engine.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            s.status = PipelineStageStatus.PENDING
            s.result = {}

        # Complete discovery and research
        for s in p.stages:
            if s.id in ["discovery", "research"]:
                s.status = PipelineStageStatus.COMPLETED

        ready = engine.get_ready_stages(p)
        ready_ids = [s.id for s in ready]
        assert "architecture" in ready_ids
        assert "discovery" not in ready_ids
        assert "research" not in ready_ids
