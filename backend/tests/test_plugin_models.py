"""Tests for src.plugins.models — Plugin database models."""
import pytest
from src.plugins.models import Plugin, PluginAuditLog, PluginType, PluginStatus


class TestPluginType:
    def test_enum_values(self):
        assert PluginType.AGENT == "agent"
        assert PluginType.TOOL == "tool"
        assert PluginType.MODEL_PROVIDER == "model_provider"
        assert PluginType.DEPLOY_TARGET == "deploy_target"
        assert PluginType.AUTH_PROVIDER == "auth_provider"
        assert PluginType.INTEGRATION == "integration"
        assert PluginType.SKILL == "skill"

    def test_enum_count(self):
        assert len(list(PluginType)) == 7


class TestPluginStatus:
    def test_enum_values(self):
        assert PluginStatus.INSTALLED == "installed"
        assert PluginStatus.ACTIVE == "active"
        assert PluginStatus.INACTIVE == "inactive"
        assert PluginStatus.ERROR == "error"
        assert PluginStatus.UPGRADING == "upgrading"

    def test_enum_count(self):
        assert len(list(PluginStatus)) == 5


class TestPluginModel:
    def test_tablename(self):
        assert Plugin.__tablename__ == "plugins"

    def test_has_required_columns(self):
        cols = {c.name for c in Plugin.__table__.columns}
        assert "id" in cols
        assert "name" in cols
        assert "display_name" in cols
        assert "description" in cols
        assert "type" in cols
        assert "version" in cols
        assert "api_version" in cols
        assert "status" in cols
        assert "manifest" in cols
        assert "capabilities" in cols
        assert "permissions" in cols
        assert "dependencies" in cols
        assert "entrypoint" in cols
        assert "config_schema" in cols
        assert "model_preference" in cols
        assert "cost_profile" in cols
        assert "health_status" in cols
        assert "last_error" in cols
        assert "consecutive_failures" in cols
        assert "installed_at" in cols
        assert "activated_at" in cols
        assert "deactivated_at" in cols

    def test_default_api_version(self):
        assert Plugin.__table__.c.api_version.default.arg == "volt/v1"


class TestPluginAuditLog:
    def test_tablename(self):
        assert PluginAuditLog.__tablename__ == "plugin_audit_log"

    def test_has_required_columns(self):
        cols = {c.name for c in PluginAuditLog.__table__.columns}
        assert "id" in cols
        assert "plugin_id" in cols
        assert "action" in cols
        assert "details" in cols
        assert "performed_by" in cols
        assert "timestamp" in cols
