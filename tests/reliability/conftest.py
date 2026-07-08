import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch

@pytest.fixture
def mock_event_bus():
    return Mock()

@pytest.fixture
def mock_agent_manager():
    return Mock()

@pytest.fixture
def mock_memory_engine():
    return Mock()

@pytest.fixture
def mock_model_router():
    return Mock()

@pytest.fixture
def mock_security_engine():
    return Mock()

@pytest.fixture
def mock_pipeline_engine():
    return Mock()
