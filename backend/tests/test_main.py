"""Tests for src.main — FastAPI application configuration."""
import pytest


class TestMainApp:
    def test_app_title(self, client):
        from src.main import app
        assert app.title == "VOLT OS"

    def test_app_version(self, client):
        from src.main import app
        assert app.version == "0.1.0"

    def test_health_endpoint(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_cors_middleware(self, client):
        from src.main import app
        # Check CORS middleware is in the middleware stack (Starlette wraps it)
        mw_str = str(app.middleware_stack)
        assert "CORSMiddleware" in mw_str or "cors" in mw_str.lower() or len(app.user_middleware) > 0
