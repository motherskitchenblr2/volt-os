"""Tests for src.core.observability — ObservabilityService, AuditLog, MetricSnapshot."""
import pytest
from unittest.mock import MagicMock
from src.core.observability import ObservabilityService, AuditLog, MetricSnapshot


class TestObservabilityService:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def svc(self, mock_db):
        return ObservabilityService(mock_db)

    def test_audit(self, svc, mock_db):
        svc.audit("user-1", "user", "login", resource_type="auth", details={"ip": "1.2.3.4"})
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, AuditLog)
        assert added.actor == "user-1"
        assert added.actor_type == "user"
        assert added.action == "login"
        assert added.status == "success"

    def test_audit_failure(self, svc, mock_db):
        svc.audit("agent-1", "agent", "execute", status="failure")
        added = mock_db.add.call_args[0][0]
        assert added.status == "failure"

    def test_record_metric(self, svc, mock_db):
        svc.record_metric("cost", "agent_cost", 0.05, "usd", {"model": "gpt-4o"})
        mock_db.add.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, MetricSnapshot)
        assert added.category == "cost"
        assert added.value == 0.05
        assert added.unit == "usd"

    def test_get_cost_breakdown(self, svc, mock_db):
        mock_snapshot = MagicMock()
        mock_snapshot.value = 0.10
        mock_snapshot.labels = {"model": "gpt-4o", "agent_type": "researcher"}
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = [mock_snapshot]
        mock_db.query.return_value = mock_q
        result = svc.get_cost_breakdown()  # No project_id to avoid .astext filter
        assert result["total_usd"] == pytest.approx(0.10)
        assert "gpt-4o" in result["by_model"]
        assert "researcher" in result["by_agent"]

    def test_get_cost_breakdown_empty(self, svc, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        result = svc.get_cost_breakdown()
        assert result["total_usd"] == 0
        assert result["by_model"] == {}

    def test_get_latency_stats(self, svc, mock_db):
        mock_snapshots = [MagicMock(value=v) for v in [100, 200, 300, 400, 500]]
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = mock_snapshots
        mock_db.query.return_value = mock_q
        result = svc.get_latency_stats()
        assert result["count"] == 5
        assert result["p50"] == 300

    def test_get_latency_stats_empty(self, svc, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        result = svc.get_latency_stats()
        assert result["p50"] == 0
        assert result["count"] == 0

    def test_get_success_rate(self, svc, mock_db):
        mock_logs = [MagicMock(status="success") for _ in range(8)]
        mock_logs += [MagicMock(status="failure") for _ in range(2)]
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = mock_logs
        mock_db.query.return_value = mock_q
        result = svc.get_success_rate()
        assert result["total"] == 10
        assert result["success"] == 8
        assert result["failure"] == 2
        assert result["rate"] == 80.0

    def test_get_success_rate_empty(self, svc, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        result = svc.get_success_rate()
        assert result["rate"] == 100.0
        assert result["total"] == 0

    def test_get_agent_health(self, svc, mock_db):
        mock_logs = [
            MagicMock(actor="researcher", status="success", action="execute", timestamp=MagicMock()),
            MagicMock(actor="researcher", status="failure", action="execute", timestamp=MagicMock()),
            MagicMock(actor="qa", status="success", action="test", timestamp=MagicMock()),
        ]
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = mock_logs
        mock_db.query.return_value = mock_q
        health = svc.get_agent_health()
        assert len(health) == 2
        researcher = next(h for h in health if h["name"] == "researcher")
        assert researcher["health"] == "degraded"  # 1 failure out of 2 = 50%
        qa = next(h for h in health if h["name"] == "qa")
        assert qa["health"] == "healthy"

    def test_get_agent_health_empty(self, svc, mock_db):
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.order_by.return_value = mock_q
        mock_q.limit.return_value = mock_q
        mock_q.all.return_value = []
        mock_db.query.return_value = mock_q
        health = svc.get_agent_health()
        assert health == []

    def test_get_mission_control_summary(self, svc, mock_db):
        # No project_id to avoid the .astext filter issue
        summary = svc.get_mission_control_summary()
        assert "cost" in summary
        assert "latency" in summary
        assert "success_rate" in summary
        assert "agents" in summary


class TestAuditLogModel:
    def test_tablename(self):
        assert AuditLog.__tablename__ == "audit_log"

    def test_has_required_columns(self):
        cols = {c.name for c in AuditLog.__table__.columns}
        assert "id" in cols
        assert "actor" in cols
        assert "action" in cols
        assert "status" in cols


class TestMetricSnapshotModel:
    def test_tablename(self):
        assert MetricSnapshot.__tablename__ == "metric_snapshots"

    def test_has_required_columns(self):
        cols = {c.name for c in MetricSnapshot.__table__.columns}
        assert "id" in cols
        assert "category" in cols
        assert "metric_name" in cols
        assert "value" in cols
