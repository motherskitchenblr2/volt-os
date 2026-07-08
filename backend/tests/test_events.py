"""Tests for src.core.events — EventBus (Redis Streams)."""
import pytest
import json
from unittest.mock import MagicMock, patch
from src.core.events import EventBus


class TestEventBus:
    @pytest.fixture
    def mock_redis(self):
        return MagicMock()

    @pytest.fixture
    def bus(self, mock_redis):
        with patch("src.core.events.redis") as mock_redis_module:
            mock_redis_module.from_url.return_value = mock_redis
            bus = EventBus("redis://localhost:6379")
        return bus

    def test_init(self, bus, mock_redis):
        assert bus.redis == mock_redis
        assert bus.stream_prefix == "volt:events:"

    def test_publish(self, bus, mock_redis):
        event_id = bus.publish("agent.completed", {"agent": "researcher"})
        assert event_id is not None
        mock_redis.xadd.assert_called_once()
        call_args = mock_redis.xadd.call_args
        stream_key = call_args[0][0]
        assert "volt:events:agent" in stream_key

    def test_publish_custom_stream(self, bus, mock_redis):
        event_id = bus.publish("test.event", {"data": 1}, stream="custom")
        call_args = mock_redis.xadd.call_args
        assert "custom" in call_args[0][0]

    def test_publish_includes_metadata(self, bus, mock_redis):
        bus.publish("test.event", {"key": "val"})
        call_args = mock_redis.xadd.call_args
        event = call_args[0][1]
        assert "event_id" in event
        assert event["event_type"] == "test.event"
        assert "timestamp" in event
        payload = json.loads(event["payload"])
        assert payload["key"] == "val"

    def test_stream_for(self, bus):
        assert bus._stream_for("agent.completed") == "agent"
        assert bus._stream_for("memory.stored") == "memory"
        assert bus._stream_for("plugin.installed") == "plugin"

    def test_subscribe(self, bus, mock_redis):
        mock_redis.xreadgroup.return_value = []
        result = bus.subscribe("agent", "group1", "consumer1")
        assert result == []
        mock_redis.xgroup_create.assert_called()

    def test_subscribe_group_exists(self, bus, mock_redis):
        import redis as redis_lib
        mock_redis.xgroup_create.side_effect = redis_lib.exceptions.ResponseError("BUSYGROUP")
        mock_redis.xreadgroup.return_value = []
        result = bus.subscribe("agent", "group1", "consumer1")
        assert result == []

    def test_ack(self, bus, mock_redis):
        bus.ack("agent", "group1", "123-0")
        mock_redis.xack.assert_called_once()
        call_args = mock_redis.xack.call_args
        assert "volt:events:agent" in call_args[0][0]

    def test_get_history(self, bus, mock_redis):
        mock_redis.xrevrange.return_value = [
            ("1-0", {"event_type": "test", "payload": '{"a": 1}', "timestamp": "2024-01-01T00:00:00"}),
        ]
        history = bus.get_history("agent", count=10)
        assert len(history) == 1
        assert history[0]["event_type"] == "test"
        assert history[0]["payload"] == {"a": 1}

    def test_get_history_empty(self, bus, mock_redis):
        mock_redis.xrevrange.return_value = []
        history = bus.get_history("agent")
        assert history == []

    def test_parse_entry(self, bus):
        entry = ("1-0", {"event_type": "test", "payload": '{"key": "val"}', "timestamp": "2024-01-01"})
        parsed = bus._parse_entry(entry)
        assert parsed["id"] == "1-0"
        assert parsed["event_type"] == "test"
        assert parsed["payload"] == {"key": "val"}
        assert parsed["timestamp"] == "2024-01-01"

    def test_parse_entry_empty_payload(self, bus):
        entry = ("1-0", {"event_type": "test"})
        parsed = bus._parse_entry(entry)
        assert parsed["payload"] == {}
