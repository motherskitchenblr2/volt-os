"""VOLT OS — Shared test fixtures and configuration."""
import pytest
import asyncio
import json
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from typing import Generator

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool

from src.core.database import Base, get_db


# ---------------------------------------------------------------------------
# Database fixtures (in-memory SQLite for fast isolated tests)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop():
    """Override the default event loop to be session-scoped."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="function")
def db_engine():
    """Create an in-memory SQLite engine per test function."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="function")
def db_session(db_engine) -> Generator[Session, None, None]:
    """Yield a transactional database session, rolled back after each test."""
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def _app(db_engine):
    """Create a fresh FastAPI app wired to the in-memory database,
    with the startup event bypassed."""
    from src.main import app as _real_app
    from src.core.database import engine as _orig_engine

    TestSessionLocal = sessionmaker(bind=db_engine, expire_on_commit=False)

    def _override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    _real_app.dependency_overrides[get_db] = _override_get_db
    return _real_app


@pytest.fixture
def client(db_engine, _app):
    """FastAPI TestClient wired to the in-memory database."""
    # Patch out the startup DB create_all so it doesn't touch postgres
    with patch("src.main.Base") as mock_base, \
         patch("src.main.engine"):
        mock_base.metadata.create_all = MagicMock()
        with TestClient(_app, raise_server_exceptions=False) as c:
            yield c
    _app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Mock infrastructure
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_redis():
    """Mock Redis client that stores data in a plain dict."""
    store: dict[str, str] = {}
    redis_mock = MagicMock()

    def _setex(key, ttl, value):
        store[key] = value

    def _get(key):
        return store.get(key)

    def _delete(key):
        if key in store:
            del store[key]
            return 1
        return 0

    redis_mock.setex = MagicMock(side_effect=_setex)
    redis_mock.get = MagicMock(side_effect=_get)
    redis_mock.delete = MagicMock(side_effect=_delete)
    redis_mock.xadd = MagicMock(return_value="1-0")
    redis_mock.xgroup_create = MagicMock(side_effect=Exception("BUSYGROUP"))
    redis_mock.xreadgroup = MagicMock(return_value=[])
    redis_mock.xack = MagicMock(return_value=1)
    redis_mock.xrevrange = MagicMock(return_value=[])
    return redis_mock


@pytest.fixture
def mock_event_bus():
    """Mock EventBus that records published events."""
    events: list[dict] = []
    bus = MagicMock()
    bus.publish = MagicMock(side_effect=lambda event_type, payload, stream=None: (
        events.append({"event_type": event_type, "payload": payload}),
        str(uuid.uuid4()),
    )[1])
    bus.subscribe = MagicMock(return_value=[])
    bus.ack = MagicMock()
    bus.get_history = MagicMock(return_value=[])
    bus._events = events  # expose for assertions
    return bus


@pytest.fixture
def mock_model_router():
    """Mock ModelRouter returning predictable selections."""
    router = MagicMock()
    from src.model_router.router import ModelSelection
    router.select = MagicMock(return_value=ModelSelection(
        model="gpt-4o",
        provider="openai",
        estimated_cost_usd=0.04,
        reason="mock selection",
    ))
    router.providers = {}
    router.cost_tracker = MagicMock()
    router.cost_tracker.can_afford = MagicMock(return_value=True)
    router.cost_tracker.record = MagicMock()
    return router


@pytest.fixture
def mock_observability():
    """Mock ObservabilityService."""
    svc = MagicMock()
    svc.audit = MagicMock()
    svc.record_metric = MagicMock()
    svc.get_cost_breakdown = MagicMock(return_value={"total_usd": 0, "by_model": {}, "by_agent": {}})
    svc.get_latency_stats = MagicMock(return_value={"p50": 0, "p95": 0, "p99": 0, "count": 0})
    svc.get_success_rate = MagicMock(return_value={"total": 0, "success": 0, "failure": 0, "rate": 100.0})
    svc.get_agent_health = MagicMock(return_value=[])
    svc.get_mission_control_summary = MagicMock(return_value={
        "cost": {"total_usd": 0},
        "latency": {"p50": 0},
        "success_rate": {"rate": 100.0},
        "agents": [],
    })
    return svc


# ---------------------------------------------------------------------------
# Sample data factories
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_manifest():
    """A valid plugin manifest for testing."""
    return {
        "name": "test-plugin",
        "display_name": "Test Plugin",
        "description": "A test plugin",
        "type": "agent",
        "version": "1.0.0",
        "api_version": "volt/v1",
        "capabilities": ["code_generation"],
        "permissions": ["sandbox.execute"],
        "dependencies": [],
        "entrypoint": "plugin.py",
        "model_preference": [{"model": "gpt-4o"}],
    }


@pytest.fixture
def sample_project_brief():
    """A sample project brief for agent testing."""
    return {
        "goals": ["Build a todo app", "Add authentication", "Deploy to cloud"],
        "constraints": ["Must use Python", "Budget: $50"],
        "preferred_stack": {"frontend": "Next.js", "backend": "FastAPI"},
    }


@pytest.fixture
def sample_agent_context():
    """A sample AgentContext for agent testing."""
    from src.agents.interface import AgentContext
    return AgentContext(
        project_id="proj-001",
        task_id="task-001",
        agent_id="agent-001",
        input_artifacts={"project_brief": {"goals": ["Build app"], "constraints": [], "preferred_stack": {}}},
        memory={},
        permissions=["artifact.read", "artifact.write", "sandbox.execute"],
    )
