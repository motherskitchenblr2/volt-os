"""Tests for src.core.database — Database configuration."""
import pytest
import os
from unittest.mock import patch


class TestDatabase:
    def test_database_url_default(self):
        """DATABASE_URL should have a default value."""
        with patch.dict(os.environ, {}, clear=False):
            # Re-import to check default
            from src.core.database import DATABASE_URL
            assert "volt" in DATABASE_URL or "sqlite" in DATABASE_URL

    def test_get_db_yields_session(self):
        """get_db should yield a session and close it."""
        from src.core.database import get_db, SessionLocal
        gen = get_db()
        session = next(gen)
        assert session is not None
        try:
            next(gen)
        except StopIteration:
            pass

    def test_base_class(self):
        from src.core.database import Base
        assert hasattr(Base, "metadata")
        assert hasattr(Base, "registry")
