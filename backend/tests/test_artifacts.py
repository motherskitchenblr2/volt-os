"""Tests for src.orchestration.artifacts — ArtifactRegistry."""
import pytest
import uuid
from unittest.mock import MagicMock
from src.orchestration.artifacts import ArtifactRegistry


class TestArtifactRegistry:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def registry(self, mock_db):
        return ArtifactRegistry(mock_db)

    def test_store_new_artifact(self, registry, mock_db):
        # No existing artifact
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None
        artifact_id = registry.store("proj-1", "code", {"files": []}, "frontend_dev", "exec-1")
        assert artifact_id is not None
        mock_db.add.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert added.version == 1
        assert added.status == "active"

    def test_store_supersedes_previous(self, registry, mock_db):
        # Existing artifact v1
        mock_latest = MagicMock()
        mock_latest.version = 1
        mock_db.query.return_value.filter.return_value.order_by.return_value.first.return_value = mock_latest
        artifact_id = registry.store("proj-1", "code", {"files": []})
        assert mock_latest.status == "superseded"
        added = mock_db.add.call_args[0][0]
        assert added.version == 2

    def test_get_active_artifact(self, registry, mock_db):
        mock_artifact = MagicMock()
        mock_artifact.id = "a1"
        mock_artifact.type = "code"
        mock_artifact.version = 2
        mock_artifact.content = {"files": []}
        mock_artifact.status = "active"
        mock_artifact.produced_by = "frontend_dev"
        mock_artifact.created_at = MagicMock()
        mock_artifact.created_at.isoformat.return_value = "2024-01-01T00:00:00"
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.first.return_value = mock_artifact
        result = registry.get("proj-1", "code")
        assert result is not None
        assert result["id"] == "a1"
        assert result["version"] == 2

    def test_get_specific_version(self, registry, mock_db):
        mock_artifact = MagicMock()
        mock_artifact.id = "a1"
        mock_artifact.type = "code"
        mock_artifact.version = 1
        mock_artifact.content = {}
        mock_artifact.status = "active"
        mock_artifact.produced_by = None
        mock_artifact.created_at = MagicMock()
        mock_artifact.created_at.isoformat.return_value = "2024-01-01"
        mock_db.query.return_value.filter.return_value.filter.return_value.filter.return_value.order_by.return_value.first.return_value = mock_artifact
        result = registry.get("proj-1", "code", version=1)
        assert result is not None

    def test_get_not_found(self, registry, mock_db):
        mock_db.query.return_value.filter.return_value.filter.return_value.order_by.return_value.first.return_value = None
        result = registry.get("proj-1", "nonexistent")
        assert result is None

    def test_list_artifacts(self, registry, mock_db):
        mock_a1 = MagicMock()
        mock_a1.id = "a1"
        mock_a1.type = "code"
        mock_a1.version = 2
        mock_a1.produced_by = "frontend_dev"
        mock_a2 = MagicMock()
        mock_a2.id = "a2"
        mock_a2.type = "spec"
        mock_a2.version = 1
        mock_a2.produced_by = "architect"
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_a1, mock_a2]
        result = registry.list_artifacts("proj-1")
        assert len(result) == 2
        assert result[0]["type"] == "code"

    def test_list_artifacts_empty(self, registry, mock_db):
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        result = registry.list_artifacts("proj-1")
        assert result == []

    def test_get_version_history(self, registry, mock_db):
        mock_v1 = MagicMock()
        mock_v1.id = "a1"
        mock_v1.version = 1
        mock_v1.status = "superseded"
        mock_v1.produced_by = "frontend_dev"
        mock_v2 = MagicMock()
        mock_v2.id = "a2"
        mock_v2.version = 2
        mock_v2.status = "active"
        mock_v2.produced_by = "frontend_dev"
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [mock_v1, mock_v2]
        history = registry.get_version_history("proj-1", "code")
        assert len(history) == 2
        assert history[0]["version"] == 1
        assert history[1]["version"] == 2

    def test_reject(self, registry, mock_db):
        mock_artifact = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_artifact
        result = registry.reject("a1")
        assert result is True
        assert mock_artifact.status == "rejected"

    def test_reject_not_found(self, registry, mock_db):
        mock_db.query.return_value.filter.return_value.first.return_value = None
        result = registry.reject("nonexistent")
        assert result is False
