"""VOLT OS — Memory Service. Multi-level memory with RAG retrieval."""
from sqlalchemy.orm import Session
from sqlalchemy import Text
from src.memory.models import MemoryEntry, DecisionRecord, MemoryLevel
from src.core.events import EventBus
import redis
import json
import uuid
from datetime import datetime, timezone


class MemoryService:
    """5-layer memory system: Agent → Project → User → Org → Knowledge Base."""

    def __init__(self, db: Session, redis_client: redis.Redis, event_bus: EventBus):
        self.db = db
        self.redis = redis_client
        self.event_bus = event_bus

    def store(self, level: MemoryLevel, scope_id: str, key: str, content: dict, tags: list[str] = None) -> str:
        """Store a memory entry. Ephemeral for agent level, persistent for others."""
        entry_id = str(uuid.uuid4())

        if level == MemoryLevel.AGENT:
            # Agent memory is ephemeral (Redis only)
            redis_key = f"memory:agent:{scope_id}:{key}"
            self.redis.setex(redis_key, 3600, json.dumps(content))  # 1 hour TTL
            return entry_id

        # Persistent memory (PostgreSQL)
        entry = MemoryEntry(
            id=entry_id,
            level=level.value,
            scope_id=scope_id,
            key=key,
            content=content,
            token_count=self._estimate_tokens(content),
            tags=tags or [],
            version=1,
        )
        self.db.add(entry)
        self.db.commit()

        self.event_bus.publish("memory.stored", {"level": level.value, "scope_id": scope_id, "key": key})
        return entry_id

    def retrieve(self, level: MemoryLevel, scope_id: str, key: str) -> dict | None:
        """Retrieve a memory entry by key."""
        if level == MemoryLevel.AGENT:
            redis_key = f"memory:agent:{scope_id}:{key}"
            data = self.redis.get(redis_key)
            return json.loads(data) if data else None

        entry = self.db.query(MemoryEntry).filter(
            MemoryEntry.level == level.value,
            MemoryEntry.scope_id == scope_id,
            MemoryEntry.key == key,
            MemoryEntry.is_active == True,
        ).order_by(MemoryEntry.version.desc()).first()

        if entry:
            entry.access_count += 1
            entry.last_accessed_at = datetime.now(timezone.utc)
            self.db.commit()
            return entry.content
        return None

    def search(self, query: str, level: MemoryLevel, scope_id: str = None, top_k: int = 5) -> list[dict]:
        """Search memory entries. For now, text search; vector search via pgvector in production."""
        q = self.db.query(MemoryEntry).filter(
            MemoryEntry.level == level.value,
            MemoryEntry.is_active == True,
        )
        if scope_id:
            q = q.filter(MemoryEntry.scope_id == scope_id)

        # Simple text search (production: pgvector similarity search)
        entries = q.filter(
            MemoryEntry.content.cast(Text).ilike(f"%{query}%")
        ).order_by(MemoryEntry.access_count.desc()).limit(top_k).all()

        return [{"id": e.id, "key": e.key, "content": e.content, "score": e.access_count} for e in entries]

    def summarize(self, content: str, max_tokens: int = 1000) -> str:
        """Summarize content. In production, calls LLM via Model Router."""
        # Placeholder: return truncated content
        words = content.split()
        if len(words) <= max_tokens // 2:
            return content
        return " ".join(words[:max_tokens // 2]) + "..."

    def forget(self, level: MemoryLevel, scope_id: str, key: str, reason: str = "") -> bool:
        """Soft-delete a memory entry."""
        if level == MemoryLevel.AGENT:
            redis_key = f"memory:agent:{scope_id}:{key}"
            return self.redis.delete(redis_key) > 0

        entry = self.db.query(MemoryEntry).filter(
            MemoryEntry.level == level.value,
            MemoryEntry.scope_id == scope_id,
            MemoryEntry.key == key,
            MemoryEntry.is_active == True,
        ).first()

        if entry:
            entry.is_active = False
            self.db.commit()
            self.event_bus.publish("memory.forgotten", {"level": level.value, "key": key, "reason": reason})
            return True
        return False

    def record_decision(self, project_id: str, agent: str, decision: str, rationale: str = "",
                        alternatives: list[str] = None, reversible: bool = True, reversal_cost: str = "low") -> str:
        """Record an architectural decision (append-only)."""
        record = DecisionRecord(
            id=str(uuid.uuid4()),
            project_id=project_id,
            agent=agent,
            decision=decision,
            rationale=rationale,
            alternatives_considered=alternatives or [],
            reversible=reversible,
            reversal_cost=reversal_cost,
        )
        self.db.add(record)
        self.db.commit()
        return record.id

    def get_decision_history(self, project_id: str) -> list[dict]:
        """Get all decisions for a project."""
        records = self.db.query(DecisionRecord).filter(
            DecisionRecord.project_id == project_id
        ).order_by(DecisionRecord.timestamp).all()

        return [
            {
                "id": r.id,
                "agent": r.agent,
                "decision": r.decision,
                "rationale": r.rationale,
                "alternatives_considered": r.alternatives_considered,
                "reversible": r.reversible,
                "reversal_cost": r.reversal_cost,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
            }
            for r in records
        ]

    def _estimate_tokens(self, content: dict) -> int:
        """Rough token estimate."""
        text = json.dumps(content)
        return len(text) // 4
