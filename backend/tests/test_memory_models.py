"""Tests for src.memory.models — Memory system models."""
import pytest
from src.memory.models import MemoryLevel, MemoryEntry, DecisionRecord


class TestMemoryLevel:
    def test_enum_values(self):
        assert MemoryLevel.AGENT == "agent"
        assert MemoryLevel.PROJECT == "project"
        assert MemoryLevel.USER == "user"
        assert MemoryLevel.ORG == "org"
        assert MemoryLevel.KNOWLEDGE_BASE == "knowledge_base"

    def test_enum_count(self):
        assert len(list(MemoryLevel)) == 5


class TestMemoryEntry:
    def test_tablename(self):
        assert MemoryEntry.__tablename__ == "memory_entries"

    def test_has_required_columns(self):
        cols = {c.name for c in MemoryEntry.__table__.columns}
        assert "id" in cols
        assert "level" in cols
        assert "scope_id" in cols
        assert "key" in cols
        assert "content" in cols
        assert "token_count" in cols
        assert "access_count" in cols
        assert "tags" in cols
        assert "version" in cols
        assert "is_active" in cols
        assert "created_at" in cols
        assert "updated_at" in cols
        assert "last_accessed_at" in cols
        assert "embedding_id" in cols
        assert "expires_at" in cols

    def test_default_values(self):
        assert MemoryEntry.__table__.c.version.default.arg == 1
        assert MemoryEntry.__table__.c.is_active.default.arg == True
        assert MemoryEntry.__table__.c.access_count.default.arg == 0


class TestDecisionRecord:
    def test_tablename(self):
        assert DecisionRecord.__tablename__ == "decision_history"

    def test_has_required_columns(self):
        cols = {c.name for c in DecisionRecord.__table__.columns}
        assert "id" in cols
        assert "project_id" in cols
        assert "agent" in cols
        assert "decision" in cols
        assert "rationale" in cols
        assert "alternatives_considered" in cols
        assert "reversible" in cols
        assert "reversal_cost" in cols
        assert "timestamp" in cols

    def test_default_reversible(self):
        assert DecisionRecord.__table__.c.reversible.default.arg == True
