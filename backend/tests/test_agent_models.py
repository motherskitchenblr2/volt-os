"""Tests for src.agents.models — Agent database models."""
import pytest
from src.agents.models import AgentExecution, AgentStatus, Artifact


class TestAgentStatus:
    def test_enum_values(self):
        assert AgentStatus.IDLE == "idle"
        assert AgentStatus.RUNNING == "running"
        assert AgentStatus.COMPLETED == "completed"
        assert AgentStatus.FAILED == "failed"
        assert AgentStatus.TIMEOUT == "timeout"

    def test_enum_count(self):
        assert len(list(AgentStatus)) == 5


class TestAgentExecution:
    def test_tablename(self):
        assert AgentExecution.__tablename__ == "agent_executions"

    def test_has_required_columns(self):
        cols = {c.name for c in AgentExecution.__table__.columns}
        assert "id" in cols
        assert "project_id" in cols
        assert "task_id" in cols
        assert "agent_type" in cols
        assert "status" in cols
        assert "cost_usd" in cols
        assert "tokens_input" in cols
        assert "tokens_output" in cols
        assert "duration_ms" in cols
        assert "started_at" in cols
        assert "completed_at" in cols
        assert "created_at" in cols

    def test_default_values(self):
        # Check column defaults
        status_col = AgentExecution.__table__.c.status
        assert status_col.default.arg == AgentStatus.IDLE


class TestArtifact:
    def test_tablename(self):
        assert Artifact.__tablename__ == "artifacts"

    def test_has_required_columns(self):
        cols = {c.name for c in Artifact.__table__.columns}
        assert "id" in cols
        assert "project_id" in cols
        assert "type" in cols
        assert "version" in cols
        assert "content" in cols
        assert "produced_by" in cols
        assert "status" in cols
        assert "created_at" in cols

    def test_default_version(self):
        version_col = Artifact.__table__.c.version
        assert version_col.default.arg == 1

    def test_default_status(self):
        status_col = Artifact.__table__.c.status
        assert status_col.default.arg == "active"
