"""Tests for src.agents.execution_logger — Agent execution tracking."""
import pytest
import uuid
from unittest.mock import MagicMock
from src.agents.execution_logger import ExecutionLogger
from src.agents.models import AgentStatus


class TestExecutionLogger:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def mock_obs(self):
        obs = MagicMock()
        obs.audit = MagicMock()
        obs.record_metric = MagicMock()
        return obs

    @pytest.fixture
    def logger(self, mock_db, mock_obs):
        return ExecutionLogger(mock_db, mock_obs)

    def test_start(self, logger, mock_db, mock_obs):
        exec_id = logger.start("proj-1", "task-1", "researcher", {"brief": {}})
        assert exec_id is not None
        mock_db.add.assert_called()
        mock_db.commit.assert_called()
        mock_obs.audit.assert_called()

    def test_complete(self, logger, mock_db, mock_obs):
        mock_exec = MagicMock()
        mock_exec.agent_type = "researcher"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_exec
        logger.complete("exec-1", {"code": {}}, "gpt-4o", 100, 50, 0.05, 2000)
        assert mock_exec.status == AgentStatus.COMPLETED
        assert mock_exec.model_used == "gpt-4o"
        assert mock_exec.cost_usd == 0.05
        assert mock_exec.duration_ms == 2000
        assert mock_obs.record_metric.call_count == 3  # cost, latency, tokens

    def test_complete_not_found(self, logger, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        logger.complete("nonexistent")
        # Should not raise

    def test_fail(self, logger, mock_db, mock_obs):
        mock_exec = MagicMock()
        mock_exec.agent_type = "qa"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_exec
        logger.fail("exec-1", "timeout", 5000)
        assert mock_exec.status == AgentStatus.FAILED
        assert mock_exec.error == "timeout"
        mock_obs.record_metric.assert_called()
        mock_obs.audit.assert_called()

    def test_fail_not_found(self, logger, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        logger.fail("nonexistent", "error")
        # Should not raise

    def test_get_executions(self, logger, mock_db):
        mock_exec = MagicMock()
        mock_exec.id = "e1"
        mock_exec.agent_type = "researcher"
        mock_exec.status = AgentStatus.COMPLETED
        mock_exec.model_used = "gpt-4o"
        mock_exec.cost_usd = 0.05
        mock_exec.duration_ms = 1000
        mock_exec.tokens_input = 100
        mock_exec.tokens_output = 50
        mock_exec.started_at = MagicMock()
        mock_exec.started_at.isoformat.return_value = "2024-01-01T00:00:00"
        mock_exec.completed_at = MagicMock()
        mock_exec.completed_at.isoformat.return_value = "2024-01-01T00:00:01"
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [mock_exec]
        execs = logger.get_executions("proj-1")
        assert len(execs) == 1
        assert execs[0]["agent_type"] == "researcher"
        assert execs[0]["tokens"] == 150

    def test_get_executions_empty(self, logger, mock_db):
        mock_db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        assert logger.get_executions("proj-1") == []

    def test_get_project_stats(self, logger, mock_db):
        exec1 = MagicMock()
        exec1.status = AgentStatus.COMPLETED
        exec1.cost_usd = 0.05
        exec1.duration_ms = 1000
        exec1.tokens_input = 100
        exec1.tokens_output = 50
        exec2 = MagicMock()
        exec2.status = AgentStatus.FAILED
        exec2.cost_usd = 0.02
        exec2.duration_ms = 500
        exec2.tokens_input = 0
        exec2.tokens_output = 0
        mock_db.query.return_value.filter.return_value.all.return_value = [exec1, exec2]
        stats = logger.get_project_stats("proj-1")
        assert stats["total_executions"] == 2
        assert stats["completed"] == 1
        assert stats["failed"] == 1
        assert stats["success_rate"] == 50.0
        assert stats["total_cost_usd"] == 0.07

    def test_get_project_stats_empty(self, logger, mock_db):
        mock_db.query.return_value.filter.return_value.all.return_value = []
        stats = logger.get_project_stats("proj-1")
        assert stats["total_executions"] == 0
        assert stats["success_rate"] == 0
