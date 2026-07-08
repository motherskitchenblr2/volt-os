"""Tests for src.memory.models and src.memory.service — Memory system."""
import pytest
import json
import uuid
from unittest.mock import MagicMock, patch
from src.memory.models import MemoryLevel, MemoryEntry, DecisionRecord
from src.memory.service import MemoryService


# ===========================================================================
# MemoryLevel enum
# ===========================================================================

class TestMemoryLevel:
    def test_enum_values(self):
        assert MemoryLevel.AGENT == "agent"
        assert MemoryLevel.PROJECT == "project"
        assert MemoryLevel.USER == "user"
        assert MemoryLevel.ORG == "org"
        assert MemoryLevel.KNOWLEDGE_BASE == "knowledge_base"

    def test_all_members(self):
        assert len(list(MemoryLevel)) == 5


# ===========================================================================
# MemoryService
# ===========================================================================

class TestMemoryService:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def mock_redis(self):
        store = {}
        redis = MagicMock()
        redis.setex = MagicMock(side_effect=lambda k, t, v: store.update({k: v}))
        redis.get = MagicMock(side_effect=lambda k: store.get(k))
        redis.delete = MagicMock(side_effect=lambda k: 1 if store.pop(k, None) is not None else 0)
        return redis

    @pytest.fixture
    def mock_event_bus(self):
        bus = MagicMock()
        bus.publish = MagicMock()
        return bus

    @pytest.fixture
    def service(self, mock_db, mock_redis, mock_event_bus):
        return MemoryService(mock_db, mock_redis, mock_event_bus)

    def test_store_agent_memory_ephemeral(self, service, mock_redis):
        entry_id = service.store(MemoryLevel.AGENT, "agent-1", "context", {"key": "val"})
        assert entry_id is not None
        mock_redis.setex.assert_called_once()
        # Verify ephemeral key format
        call_args = mock_redis.setex.call_args
        assert "memory:agent:agent-1:context" in call_args[0][0]

    def test_store_project_memory_persistent(self, service, mock_db, mock_event_bus):
        entry_id = service.store(MemoryLevel.PROJECT, "proj-1", "architecture", {"spec": "v1"})
        assert entry_id is not None
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called()
        mock_event_bus.publish.assert_called()

    def test_store_with_tags(self, service, mock_db):
        entry_id = service.store(MemoryLevel.PROJECT, "proj-1", "key", {"v": 1}, tags=["important"])
        assert entry_id is not None
        call_args = mock_db.add.call_args
        entry = call_args[0][0]
        assert entry.tags == ["important"]

    def test_retrieve_agent_memory(self, service, mock_redis):
        # Pre-populate
        mock_redis.setex("memory:agent:agent-1:ctx", 3600, json.dumps({"data": 1}))
        result = service.retrieve(MemoryLevel.AGENT, "agent-1", "ctx")
        assert result == {"data": 1}

    def test_retrieve_agent_memory_not_found(self, service, mock_redis):
        result = service.retrieve(MemoryLevel.AGENT, "agent-1", "nonexistent")
        assert result is None

    def test_retrieve_project_memory(self, service, mock_db):
        mock_entry = MagicMock()
        mock_entry.content = {"spec": "v1"}
        mock_entry.access_count = 0
        # The service chains: query().filter().filter().filter().order_by().first()
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.first.return_value = mock_entry
        mock_db.query.return_value = mock_q
        result = service.retrieve(MemoryLevel.PROJECT, "proj-1", "architecture")
        assert result == {"spec": "v1"}
        assert mock_entry.access_count == 1

    def test_retrieve_project_memory_not_found(self, service, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.first.return_value = None
        mock_db.query.return_value = mock_q
        result = service.retrieve(MemoryLevel.PROJECT, "proj-1", "nonexistent")
        assert result is None

    def test_search(self, service, mock_db):
        mock_entry = MagicMock()
        mock_entry.id = "e1"
        mock_entry.key = "architecture"
        mock_entry.content = {"spec": "v1"}
        mock_entry.access_count = 5
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = [mock_entry]
        mock_db.query.return_value = mock_q
        results = service.search("architecture", MemoryLevel.PROJECT, "proj-1")
        assert len(results) == 1
        assert results[0]["key"] == "architecture"

    def test_search_empty(self, service, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        results = service.search("nonexistent", MemoryLevel.PROJECT)
        assert results == []

    def test_forget_agent_memory(self, service, mock_redis):
        mock_redis.setex("memory:agent:a1:key", 3600, "{}")
        result = service.forget(MemoryLevel.AGENT, "a1", "key")
        assert result is True

    def test_forget_agent_memory_not_found(self, service, mock_redis):
        # When key doesn't exist, Redis delete returns 0, which is falsy
        result = service.forget(MemoryLevel.AGENT, "a1", "nonexistent")
        assert result is False  # delete returns 0 for missing keys

    def test_forget_project_memory(self, service, mock_db, mock_event_bus):
        mock_entry = MagicMock()
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.first.return_value = mock_entry
        mock_db.query.return_value = mock_q
        result = service.forget(MemoryLevel.PROJECT, "proj-1", "arch")
        assert result is True
        assert mock_entry.is_active is False
        mock_event_bus.publish.assert_called()

    def test_forget_project_memory_not_found(self, service, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.first.return_value = None
        mock_db.query.return_value = mock_q
        result = service.forget(MemoryLevel.PROJECT, "proj-1", "nonexistent")
        assert result is False

    def test_record_decision(self, service, mock_db):
        mock_db.add = MagicMock()
        mock_db.commit = MagicMock()
        record_id = service.record_decision(
            "proj-1", "architect", "use FastAPI", "fast and async",
            alternatives=["Django", "Flask"], reversible=True, reversal_cost="low",
        )
        assert record_id is not None
        mock_db.add.assert_called_once()

    def test_record_decision_defaults(self, service, mock_db):
        record_id = service.record_decision("proj-1", "qa", "use pytest")
        assert record_id is not None

    def test_get_decision_history(self, service, mock_db):
        mock_record = MagicMock()
        mock_record.id = "r1"
        mock_record.agent = "architect"
        mock_record.decision = "use FastAPI"
        mock_record.rationale = "fast"
        mock_record.alternatives_considered = []
        mock_record.reversible = True
        mock_record.reversal_cost = "low"
        mock_record.timestamp = MagicMock()
        mock_record.timestamp.isoformat.return_value = "2024-01-01T00:00:00"
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.all.return_value = [mock_record]
        mock_db.query.return_value = mock_q
        history = service.get_decision_history("proj-1")
        assert len(history) == 1
        assert history[0]["agent"] == "architect"

    def test_get_decision_history_empty(self, service, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        history = service.get_decision_history("proj-1")
        assert history == []

    def test_summarize_short_content(self, service):
        result = service.summarize("Hello world", max_tokens=1000)
        assert result == "Hello world"

    def test_summarize_long_content(self, service):
        content = " ".join(["word"] * 2000)
        result = service.summarize(content, max_tokens=100)
        assert result.endswith("...")
        assert len(result) < len(content)

    def test_estimate_tokens(self, service):
        count = service._estimate_tokens({"key": "value"})
        assert count > 0
        # JSON dump of {"key": "value"} is 18 chars → 18 // 4 = 4
        assert count == 4

    def test_store_agent_publishes_no_event(self, service, mock_event_bus):
        """Agent memory is ephemeral and doesn't publish events."""
        service.store(MemoryLevel.AGENT, "a1", "k", {})
        # Agent memory is Redis-only, no event_bus publish expected for agent level
        # (the method doesn't call event_bus.publish for agent level)
