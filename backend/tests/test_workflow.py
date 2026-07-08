"""Tests for src.orchestration.workflow — PipelineWorkflow."""
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from src.orchestration.workflow import PipelineWorkflow, StageInput, StageOutput
from src.orchestration.engine import PipelineEngine, PipelineStageStatus, GateStatus


class TestStageInput:
    def test_create(self):
        si = StageInput(
            stage_id="discovery",
            project_id="p1",
            task_id="t1",
            input_artifacts={"brief": {}},
            agent_type="researcher",
        )
        assert si.stage_id == "discovery"
        assert si.agent_type == "researcher"


class TestStageOutput:
    def test_create_defaults(self):
        so = StageOutput(stage_id="discovery", status="completed", output_artifacts={})
        assert so.error is None
        assert so.tokens_used == 0
        assert so.cost_usd == 0.0

    def test_create_full(self):
        so = StageOutput(
            stage_id="s1",
            status="completed",
            output_artifacts={"code": {}},
            error=None,
            tokens_used=100,
            cost_usd=0.05,
            duration_ms=1000,
        )
        assert so.tokens_used == 100


class TestPipelineWorkflow:
    @pytest.fixture
    def engine(self):
        """Create a fresh PipelineEngine for each test, resetting stage statuses."""
        eng = PipelineEngine()
        p = eng.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            s.status = PipelineStageStatus.PENDING
            s.result = {}
        from src.orchestration.engine import GateStatus
        for g in p.gates:
            g.status = GateStatus.OPEN
        return eng

    @pytest.fixture
    def workflow(self, engine):
        return PipelineWorkflow(engine)

    def test_init(self, workflow):
        assert workflow.engine is not None

    def test_handle_gate_no_gate_found(self, workflow):
        from src.orchestration.engine import PipelineStage
        engine = workflow.engine
        p = engine.get_pipeline("se-pipeline-v1")
        stage = PipelineStage(
            id="unknown_gate",
            name="Unknown",
            agent_type="system",
            input_artifacts=[],
            output_artifacts=[],
            is_gate=True,
        )
        result = workflow._handle_gate(p, stage)
        assert result["status"] == "passed"
        assert "no gate found" in result.get("note", "")

    def test_handle_gate_passed(self, workflow):
        engine = workflow.engine
        p = engine.get_pipeline("se-pipeline-v1")
        # Complete all required stages for gate-1
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning"]:
                s.status = PipelineStageStatus.COMPLETED
                s.result = {a: {} for a in s.output_artifacts}
        gate = p.gates[0]
        gate.status = GateStatus.PASSED
        result = workflow._handle_gate(p, p.stages[4])  # pre_dev_gate
        assert result["status"] == "passed"

    def test_handle_gate_waiting(self, workflow):
        engine = workflow.engine
        p = engine.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning"]:
                s.status = PipelineStageStatus.COMPLETED
                s.result = {a: {} for a in s.output_artifacts}
        gate = p.gates[0]
        gate.status = GateStatus.OPEN
        result = workflow._handle_gate(p, p.stages[4])  # pre_dev_gate
        assert result["status"] == "waiting_approval"
