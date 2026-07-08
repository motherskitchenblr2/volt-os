"""Tests for src.plugins.service — PluginService lifecycle management."""
import pytest
import uuid
from unittest.mock import MagicMock
from src.plugins.service import PluginService
from src.plugins.models import PluginType, PluginStatus, Plugin


class TestPluginService:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def mock_event_bus(self):
        bus = MagicMock()
        bus.publish = MagicMock()
        return bus

    @pytest.fixture
    def svc(self, mock_db, mock_event_bus):
        return PluginService(mock_db, mock_event_bus)

    @pytest.fixture
    def valid_manifest(self):
        return {
            "name": "test-plugin",
            "display_name": "Test Plugin",
            "type": "agent",
            "version": "1.0.0",
            "api_version": "volt/v1",
            "capabilities": ["code_gen"],
            "permissions": ["sandbox.execute"],
        }

    def test_install_success(self, svc, mock_db, mock_event_bus, valid_manifest):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        plugin = svc.install(valid_manifest)
        assert plugin.name == "test-plugin"
        assert plugin.status == PluginStatus.INSTALLED
        mock_db.add.assert_called()
        mock_event_bus.publish.assert_called()

    def test_install_duplicate(self, svc, mock_db, valid_manifest):
        existing = MagicMock()
        existing.name = "test-plugin"
        existing.version = "1.0.0"
        mock_db.query.return_value.filter.return_value.first.return_value = existing
        with pytest.raises(ValueError, match="already installed"):
            svc.install(valid_manifest)

    def test_install_missing_name(self, svc):
        with pytest.raises(ValueError, match="missing required field"):
            svc.install({"type": "agent", "version": "1.0.0"})

    def test_install_missing_type(self, svc):
        with pytest.raises(ValueError, match="missing required field"):
            svc.install({"name": "x", "version": "1.0.0"})

    def test_install_invalid_type(self, svc):
        with pytest.raises(ValueError, match="Invalid plugin type"):
            svc.install({"name": "x", "type": "invalid_type", "version": "1.0.0"})

    def test_install_missing_dependency(self, svc, mock_db):
        manifest = {
            "name": "test-plugin",
            "type": "agent",
            "version": "1.0.0",
            "dependencies": [{"name": "dep-plugin", "version": "1.0.0"}],
        }
        mock_db.query.return_value.filter.return_value.first.return_value = None
        with pytest.raises(ValueError, match="Missing dependency"):
            svc.install(manifest)

    def test_activate_success(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.status = PluginStatus.INSTALLED
        plugin.dependencies = []
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        result = svc.activate("p1")
        assert result.status == PluginStatus.ACTIVE
        mock_event_bus.publish.assert_called()

    def test_activate_wrong_status(self, svc, mock_db):
        plugin = MagicMock()
        plugin.status = PluginStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        with pytest.raises(ValueError, match="Cannot activate"):
            svc.activate("p1")

    def test_activate_inactive_dependency(self, svc, mock_db):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.status = PluginStatus.INSTALLED
        plugin.dependencies = ["dep-plugin"]

        dep = MagicMock()
        dep.status = PluginStatus.INACTIVE
        call_count = [0]
        def query_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_q = MagicMock()
            if call_count[0] == 1:
                mock_q.filter.return_value.first.return_value = plugin
            else:
                mock_q.filter.return_value.first.return_value = dep
            return mock_q
        mock_db.query.side_effect = query_side_effect
        with pytest.raises(ValueError, match="Dependency"):
            svc.activate("p1")

    def test_deactivate_success(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.status = PluginStatus.ACTIVE
        plugin.name = "test-plugin"
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        mock_db.query.return_value.filter.return_value.all.return_value = []
        result = svc.deactivate("p1")
        assert result.status == PluginStatus.INACTIVE
        mock_event_bus.publish.assert_called()

    def test_deactivate_wrong_status(self, svc, mock_db):
        plugin = MagicMock()
        plugin.status = PluginStatus.INSTALLED
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        with pytest.raises(ValueError, match="Cannot deactivate"):
            svc.deactivate("p1")

    def test_deactivate_has_dependents(self, svc, mock_db):
        plugin = MagicMock()
        plugin.status = PluginStatus.ACTIVE
        plugin.name = "base-plugin"
        dep = MagicMock()
        dep.name = "child-plugin"

        call_count = [0]
        def query_side_effect(*args, **kwargs):
            call_count[0] += 1
            mock_q = MagicMock()
            if call_count[0] == 1:
                mock_q.filter.return_value.first.return_value = plugin
            else:
                mock_q.filter.return_value.all.return_value = [dep]
            return mock_q
        mock_db.query.side_effect = query_side_effect
        with pytest.raises(ValueError, match="depend on this plugin"):
            svc.deactivate("p1")

    def test_upgrade_success(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.api_version = "volt/v1"
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        new_manifest = {"name": "test-plugin", "type": "agent", "version": "2.0.0", "api_version": "volt/v1"}
        result = svc.upgrade("p1", new_manifest)
        assert result.version == "2.0.0"
        mock_event_bus.publish.assert_called()

    def test_upgrade_breaking_change(self, svc, mock_db):
        plugin = MagicMock()
        plugin.api_version = "volt/v1"
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        new_manifest = {"name": "test-plugin", "type": "agent", "version": "2.0.0", "api_version": "volt/v2"}
        with pytest.raises(ValueError, match="Breaking change"):
            svc.upgrade("p1", new_manifest)

    def test_remove_success(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.status = PluginStatus.INSTALLED
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        svc.remove("p1")
        mock_db.delete.assert_called_once_with(plugin)
        mock_event_bus.publish.assert_called()

    def test_remove_active_raises(self, svc, mock_db):
        plugin = MagicMock()
        plugin.status = PluginStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        with pytest.raises(ValueError, match="Deactivate"):
            svc.remove("p1")

    def test_get(self, svc, mock_db):
        plugin = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        assert svc.get("p1") == plugin

    def test_get_not_found(self, svc, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        with pytest.raises(ValueError, match="Plugin not found"):
            svc.get("nonexistent")

    def test_list_plugins(self, svc, mock_db):
        plugins = [MagicMock(name="a"), MagicMock(name="b")]
        mock_db.query.return_value.order_by.return_value.all.return_value = plugins
        result = svc.list_plugins()
        assert len(result) == 2

    def test_list_plugins_with_filter(self, svc, mock_db):
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.all.return_value = []
        result = svc.list_plugins(type_filter=PluginType.AGENT, status_filter=PluginStatus.ACTIVE)
        assert result == []

    def test_record_failure(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.consecutive_failures = 0
        plugin.status = PluginStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        result = svc.record_failure("p1", "timeout error")
        assert result.consecutive_failures == 1

    def test_record_failure_auto_error(self, svc, mock_db, mock_event_bus):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.consecutive_failures = 2
        plugin.status = PluginStatus.ACTIVE
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        result = svc.record_failure("p1", "crash")
        assert result.status == PluginStatus.ERROR
        mock_event_bus.publish.assert_called()

    def test_reset_health(self, svc, mock_db):
        plugin = MagicMock()
        plugin.id = "p1"
        plugin.consecutive_failures = 3
        plugin.last_error = "crash"
        plugin.status = PluginStatus.ERROR
        mock_db.query.return_value.filter.return_value.first.return_value = plugin
        result = svc.reset_health("p1")
        assert result.consecutive_failures == 0
        assert result.last_error is None
        assert result.status == PluginStatus.ACTIVE
