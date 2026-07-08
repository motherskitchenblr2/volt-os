"""Tests for src.model_router.router — Model Router, CostTracker, and ModelSelection."""
import pytest
from src.model_router.router import ModelRouter, CostTracker, ModelSelection


# ===========================================================================
# CostTracker
# ===========================================================================

class TestCostTracker:
    def test_default_budgets(self):
        ct = CostTracker()
        assert ct.task_budget_usd == 2.0
        assert ct.project_budget_usd == 100.0
        assert ct.org_daily_budget_usd == 1000.0

    def test_can_afford_within_budget(self):
        ct = CostTracker(task_budget_usd=1.0, project_budget_usd=10.0, org_daily_budget_usd=100.0)
        assert ct.can_afford(0.5) is True

    def test_cannot_afford_over_task_budget(self):
        ct = CostTracker(task_budget_usd=1.0, project_budget_usd=10.0, org_daily_budget_usd=100.0)
        assert ct.can_afford(1.5) is False

    def test_cannot_afford_over_project_budget(self):
        ct = CostTracker(task_budget_usd=100.0, project_budget_usd=5.0, org_daily_budget_usd=100.0)
        assert ct.can_afford(6.0) is False

    def test_cannot_afford_over_org_budget(self):
        ct = CostTracker(task_budget_usd=100.0, project_budget_usd=100.0, org_daily_budget_usd=5.0)
        assert ct.can_afford(6.0) is False

    def test_record_accumulates(self):
        ct = CostTracker()
        ct.record(0.5)
        ct.record(0.3)
        assert ct.task_spent_usd == pytest.approx(0.8)
        assert ct.project_spent_usd == pytest.approx(0.8)
        assert ct.org_daily_spent_usd == pytest.approx(0.8)

    def test_can_afford_after_spending(self):
        ct = CostTracker(task_budget_usd=1.0)
        ct.record(0.7)
        assert ct.can_afford(0.2) is True
        assert ct.can_afford(0.4) is False

    def test_exact_budget_boundary(self):
        ct = CostTracker(task_budget_usd=1.0)
        assert ct.can_afford(1.0) is True
        ct.record(1.0)
        assert ct.can_afford(0.01) is False


# ===========================================================================
# ModelSelection
# ===========================================================================

class TestModelSelection:
    def test_create(self):
        ms = ModelSelection(model="gpt-4o", provider="openai", estimated_cost_usd=0.04, reason="test")
        assert ms.model == "gpt-4o"
        assert ms.provider == "openai"
        assert ms.estimated_cost_usd == 0.04
        assert ms.reason == "test"


# ===========================================================================
# ModelRouter
# ===========================================================================

class TestModelRouter:
    @pytest.fixture
    def router(self):
        return ModelRouter()

    def test_register_provider(self, router):
        class FakeProvider:
            name = "test-provider"
            models = ["test-model"]
        router.register_provider(FakeProvider())
        assert "test-provider" in router.providers

    def test_select_by_capability_high_complexity(self, router):
        sel = router.select("code_generation", "high")
        assert sel.model == "claude-sonnet-4"
        assert sel.provider == "anthropic"
        assert sel.estimated_cost_usd == 0.05

    def test_select_by_capability_code_generation(self, router):
        sel = router.select("code_generation", "low")
        assert sel.model == "deepseek-coder"
        assert sel.provider == "deepseek"
        assert sel.estimated_cost_usd == 0.01

    def test_select_general_fallback(self, router):
        sel = router.select("general", "low")
        assert sel.model == "gpt-4o"
        assert sel.provider == "openai"

    def test_select_with_agent_preferences(self, router):
        class FakeProvider:
            name = "anthropic"
            models = ["claude-sonnet-4"]
        router.register_provider(FakeProvider())
        prefs = [{"model": "claude-sonnet-4", "reason": "prefer claude"}]
        sel = router.select("research", "medium", agent_preferences=prefs)
        assert sel.model == "claude-sonnet-4"
        assert sel.provider == "anthropic"
        assert sel.reason == "prefer claude"

    def test_select_preference_fallback_to_default(self, router):
        """When pref model isn't registered, falls back to default."""
        prefs = [{"model": "unknown-model", "reason": "none"}]
        sel = router.select("general", "low", agent_preferences=prefs)
        assert sel.model == "gpt-4o"

    def test_select_preference_over_budget(self, router):
        """When can't afford pref, falls back to default."""
        class FakeProvider:
            name = "anthropic"
            models = ["claude-sonnet-4"]
        router.register_provider(FakeProvider())
        router.cost_tracker.can_afford = lambda x: False
        prefs = [{"model": "claude-sonnet-4"}]
        sel = router.select("research", "low", agent_preferences=prefs)
        assert sel.model == "gpt-4o"

    def test_estimate_cost_known_models(self, router):
        assert router._estimate_cost("claude-sonnet-4", "general") == 0.05
        assert router._estimate_cost("gpt-4o", "general") == 0.04
        assert router._estimate_cost("deepseek-chat", "general") == 0.01
        assert router._estimate_cost("deepseek-coder", "general") == 0.01
        assert router._estimate_cost("qwen", "general") == 0.005

    def test_estimate_cost_unknown_model(self, router):
        assert router._estimate_cost("unknown-model", "general") == 0.05

    def test_find_provider_found(self, router):
        class FakeProvider:
            name = "test"
            models = ["m1", "m2"]
        router.register_provider(FakeProvider())
        assert router._find_provider("m1") == "test"

    def test_find_provider_not_found(self, router):
        assert router._find_provider("nonexistent") is None

    def test_select_no_preferences_default(self, router):
        sel = router.select("summarization", "low")
        assert sel.model == "gpt-4o"
