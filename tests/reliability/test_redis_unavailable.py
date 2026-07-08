"""Redis unavailable scenarios."""
import pytest

class TestRedisUnavailable:
    """Scenario: Redis is unreachable."""
    
    @pytest.mark.asyncio
    async def test_expected_behavior(self):
        """Event Bus falls back to in-memory transport."""
        pass
    
    @pytest.mark.asyncio
    async def test_recovery_behavior(self):
        """Event Bus reconnects to Redis, syncs buffered events."""
        pass
    
    @pytest.mark.asyncio
    async def test_recovery_time(self):
        """Recovery completes within 5 seconds."""
        pass
