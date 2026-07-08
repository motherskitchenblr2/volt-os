"""Tests for src.memory.semantic — Semantic search and embedding storage."""
import pytest
import numpy as np
from unittest.mock import MagicMock
from src.memory.semantic import SemanticSearch, MemoryEmbedding


class TestMemoryEmbedding:
    def test_tablename(self):
        assert MemoryEmbedding.__tablename__ == "memory_embeddings"

    def test_has_required_columns(self):
        cols = {c.name for c in MemoryEmbedding.__table__.columns}
        assert "id" in cols
        assert "memory_entry_id" in cols
        assert "content_hash" in cols
        assert "embedding" in cols
        assert "model" in cols
        assert "chunk_index" in cols
        assert "chunk_text" in cols


class TestSemanticSearch:
    @pytest.fixture
    def mock_db(self):
        return MagicMock()

    @pytest.fixture
    def search(self, mock_db):
        return SemanticSearch(mock_db)

    def test_embed_and_store_default(self, search, mock_db):
        search.embed_and_store("mem-1", "test content")
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        added = mock_db.add.call_args[0][0]
        assert isinstance(added, MemoryEmbedding)
        assert added.memory_entry_id == "mem-1"
        # model default is Python-side and won't auto-apply on manual construction
        assert len(added.embedding) == 1536
        assert added.chunk_text == "test content"

    def test_embed_and_store_custom_fn(self, search, mock_db):
        custom_fn = lambda text: [0.1, 0.2, 0.3]
        search.embed_and_store("mem-2", "hello world", embedding_fn=custom_fn)
        added = mock_db.add.call_args[0][0]
        assert added.embedding == [0.1, 0.2, 0.3]

    def test_embed_and_store_long_text_truncates(self, search, mock_db):
        long_text = "x" * 1000
        search.embed_and_store("mem-3", long_text)
        added = mock_db.add.call_args[0][0]
        assert len(added.chunk_text) == 500

    def test_embed_and_store_dedup_hash(self, search, mock_db):
        search.embed_and_store("mem-4", "unique text here")
        added = mock_db.add.call_args[0][0]
        assert added.content_hash == str(hash("unique text here"))

    def test_search(self, search, mock_db):
        mock_db.execute.return_value.fetchall.return_value = [
            ("mem-1", "chunk text", 0.95),
            ("mem-2", "other text", 0.85),
        ]
        results = search.search([0.1] * 1536, top_k=5)
        assert len(results) == 2
        assert results[0]["memory_entry_id"] == "mem-1"
        assert results[0]["similarity"] == 0.95
        assert results[1]["similarity"] == 0.85

    def test_search_empty(self, search, mock_db):
        mock_db.execute.return_value.fetchall.return_value = []
        results = search.search([0.1] * 1536)
        assert results == []
