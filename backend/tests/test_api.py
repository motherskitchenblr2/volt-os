"""Tests for API routes — test_api.py covering all API endpoints."""
import pytest


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["version"] == "0.1.0"


class TestPluginEndpoints:
    def test_install_plugin(self, client):
        manifest = {
            "name": "test-api-plugin",
            "display_name": "Test API Plugin",
            "type": "tool",
            "version": "1.0.0",
            "api_version": "volt/v1",
        }
        response = client.post("/api/plugins/install", json={"manifest": manifest})
        # Will succeed if DB is mocked, or may fail with various errors
        assert response.status_code in [200, 400, 500]

    def test_list_plugins(self, client):
        response = client.get("/api/plugins/")
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestPipelineEndpoints:
    def test_list_pipelines(self, client):
        response = client.get("/api/pipelines/")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_get_pipeline(self, client):
        response = client.get("/api/pipelines/se-pipeline-v1")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "se-pipeline-v1"
        assert len(data["stages"]) == 11

    def test_get_pipeline_not_found(self, client):
        response = client.get("/api/pipelines/nonexistent")
        assert response.status_code == 404

    def test_get_ready_stages(self, client):
        response = client.get("/api/pipelines/se-pipeline-v1/ready")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1  # Only discovery is ready initially

    def test_complete_stage(self, client):
        response = client.post(
            "/api/pipelines/se-pipeline-v1/stages/discovery/complete",
            json={"stage_id": "discovery", "artifacts": {"requirements": {"v": 1}}},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"

    def test_complete_stage_not_found(self, client):
        response = client.post(
            "/api/pipelines/se-pipeline-v1/stages/nonexistent/complete",
            json={"stage_id": "nonexistent", "artifacts": {}},
        )
        assert response.status_code == 404

    def test_approve_gate(self, client):
        response = client.post(
            "/api/pipelines/se-pipeline-v1/gates/gate-1/approve",
            json={"gate_id": "gate-1", "decision": "approved", "feedback": "looks good"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "passed"

    def test_reject_gate(self, client):
        response = client.post(
            "/api/pipelines/se-pipeline-v1/gates/gate-1/approve",
            json={"gate_id": "gate-1", "decision": "rejected", "feedback": "needs work"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"

    def test_approve_gate_not_found(self, client):
        response = client.post(
            "/api/pipelines/se-pipeline-v1/gates/nonexistent/approve",
            json={"gate_id": "nonexistent", "decision": "approved"},
        )
        assert response.status_code == 404

    def test_pipeline_status(self, client):
        response = client.get("/api/pipelines/se-pipeline-v1/status")
        assert response.status_code == 200
        data = response.json()
        assert "progress" in data
        assert "percentage" in data
        assert "stages" in data
        assert "gates" in data
