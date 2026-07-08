"""Tests for src.orchestration.engine — PipelineEngine, pipeline DAG, gates."""
import pytest
from src.orchestration.engine import (
    PipelineEngine, Pipeline, PipelineStage, ApprovalGate,
    PipelineStageStatus, GateStatus, SOFTWARE_ENGINEERING_PIPELINE,
)


class TestPipelineStageStatus:
    def test_enum_values(self):
        assert PipelineStageStatus.PENDING == "pending"
        assert PipelineStageStatus.RUNNING == "running"
        assert PipelineStageStatus.COMPLETED == "completed"
        assert PipelineStageStatus.FAILED == "failed"
        assert PipelineStageStatus.WAITING_APPROVAL == "waiting_approval"
        assert PipelineStageStatus.SKIPPED == "skipped"


class TestGateStatus:
    def test_enum_values(self):
        assert GateStatus.OPEN == "open"
        assert GateStatus.PASSED == "passed"
        assert GateStatus.FAILED == "failed"
        assert GateStatus.WAITING == "waiting"


class TestPipelineEngine:
    @pytest.fixture
    def engine(self):
        """Create a fresh PipelineEngine for each test, resetting stage statuses."""
        eng = PipelineEngine()
        # Reset all stage statuses to PENDING
        p = eng.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            s.status = PipelineStageStatus.PENDING
            s.result = {}
        for g in p.gates:
            from src.orchestration.engine import GateStatus
            g.status = GateStatus.OPEN
        return eng

    def test_default_pipeline_registered(self, engine):
        assert "se-pipeline-v1" in engine.pipelines

    def test_get_pipeline(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        assert p.name == "Software Engineering Pipeline"
        assert p.domain == "software_engineering"

    def test_get_pipeline_not_found(self, engine):
        with pytest.raises(ValueError, match="Pipeline not found"):
            engine.get_pipeline("nonexistent")

    def test_pipeline_has_stages(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        assert len(p.stages) == 11

    def test_pipeline_has_gates(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        assert len(p.gates) == 2

    def test_get_ready_stages_initial(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        ready = engine.get_ready_stages(p)
        assert len(ready) == 1
        assert ready[0].id == "discovery"

    def test_get_ready_stages_after_completion(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        # Complete discovery stage
        for s in p.stages:
            if s.id == "discovery":
                s.status = PipelineStageStatus.COMPLETED
        ready = engine.get_ready_stages(p)
        ready_ids = [s.id for s in ready]
        assert "research" in ready_ids

    def test_get_ready_stages_all_completed(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            s.status = PipelineStageStatus.COMPLETED
        ready = engine.get_ready_stages(p)
        assert len(ready) == 0

    def test_get_ready_stages_parallel_after_gate(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        # Complete all stages up to and including pre_dev_gate
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning", "pre_dev_gate"]:
                s.status = PipelineStageStatus.COMPLETED
        ready = engine.get_ready_stages(p)
        ready_ids = [s.id for s in ready]
        assert "frontend_dev" in ready_ids
        assert "backend_dev" in ready_ids

    def test_check_gate_passes_with_all_artifacts(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        gate = p.gates[0]  # gate-1
        # Complete all stages before the gate
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning", "pre_dev_gate"]:
                s.status = PipelineStageStatus.COMPLETED
                if s.output_artifacts:
                    s.result = {a: {"test": True} for a in s.output_artifacts}
        gate.status = GateStatus.PASSED
        status = engine.check_gate(gate, p)
        assert status == GateStatus.PASSED

    def test_check_gate_fails_missing_artifacts(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        gate = p.gates[0]  # gate-1 requires artifacts
        # No stages completed
        status = engine.check_gate(gate, p)
        assert status == GateStatus.FAILED

    def test_check_gate_waiting_approval(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        gate = p.gates[0]
        # Complete all required stages
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning"]:
                s.status = PipelineStageStatus.COMPLETED
                s.result = {a: {} for a in s.output_artifacts}
        gate.status = GateStatus.OPEN  # not approved
        status = engine.check_gate(gate, p)
        assert status == GateStatus.WAITING

    def test_check_gate_test_coverage(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        gate = p.gates[1]  # gate-2 requires min_test_coverage
        # Complete stages including testing
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning", "pre_dev_gate",
                         "frontend_dev", "backend_dev", "testing", "security_review", "pre_deploy_gate"]:
                s.status = PipelineStageStatus.COMPLETED
                s.result = {}
        # Set test report with low coverage
        for s in p.stages:
            if s.id == "testing":
                s.result = {"test_report": {"summary": {"coverage": 50.0}, "failures": []}}
        status = engine.check_gate(gate, p)
        assert status == GateStatus.FAILED

    def test_check_gate_security_risk(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        gate = p.gates[1]
        for s in p.stages:
            if s.id in ["discovery", "research", "architecture", "planning", "pre_dev_gate",
                         "frontend_dev", "backend_dev", "testing", "security_review", "pre_deploy_gate"]:
                s.status = PipelineStageStatus.COMPLETED
                s.result = {}
        # Set test report with good coverage
        for s in p.stages:
            if s.id == "testing":
                s.result = {"test_report": {"summary": {"coverage": 90.0}, "failures": []}}
            elif s.id == "security_review":
                s.result = {"security_report": {"overall_risk": "critical"}}
        status = engine.check_gate(gate, p)
        assert status == GateStatus.FAILED

    def test_get_artifact_finds_latest(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        for s in p.stages:
            if s.id == "testing":
                s.status = PipelineStageStatus.COMPLETED
                s.result = {"test_report": {"summary": {"coverage": 90.0}}}
        artifact = engine._get_artifact(p, "test_report")
        assert artifact is not None
        assert artifact["summary"]["coverage"] == 90.0

    def test_get_artifact_not_found(self, engine):
        p = engine.get_pipeline("se-pipeline-v1")
        assert engine._get_artifact(p, "nonexistent") is None


class TestSoftwareEngineeringPipeline:
    def test_pipeline_structure(self):
        p = SOFTWARE_ENGINEERING_PIPELINE
        assert p.id == "se-pipeline-v1"
        assert p.domain == "software_engineering"
        stage_ids = [s.id for s in p.stages]
        assert "discovery" in stage_ids
        assert "deployment" in stage_ids
        assert "testing" in stage_ids

    def test_gates_have_criteria(self):
        p = SOFTWARE_ENGINEERING_PIPELINE
        for gate in p.gates:
            assert "criteria" in gate.__dict__
            assert gate.criteria  # non-empty

    def test_stage_dependencies(self):
        p = SOFTWARE_ENGINEERING_PIPELINE
        discovery = next(s for s in p.stages if s.id == "discovery")
        assert discovery.depends_on == []
        research = next(s for s in p.stages if s.id == "research")
        assert "discovery" in research.depends_on

    def test_gate_stages_marked(self):
        p = SOFTWARE_ENGINEERING_PIPELINE
        gate_stages = [s for s in p.stages if s.is_gate]
        assert len(gate_stages) == 2
        assert gate_stages[0].id == "pre_dev_gate"
        assert gate_stages[1].id == "pre_deploy_gate"
