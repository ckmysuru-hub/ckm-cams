import os
import asyncio
import importlib.util
from types import SimpleNamespace
from bson import ObjectId


def _load_module_from_path(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_student_welcome_render(monkeypatch, tmp_path):
    """Smoke test: ensure _student_email_context resolves names and the student_welcome
    template is rendered with those values filled in.

    This test loads backend/server.py and backend/email_templates.py directly from disk
    so it does not depend on package import machinery in the test runner.
    """
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    server_path = os.path.join(repo_root, "server.py")
    email_t_path = os.path.join(repo_root, "email_templates.py")

    server = _load_module_from_path("server_for_test", server_path)
    email_templates = _load_module_from_path("email_templates_for_test", email_t_path)

    # Prepare fake DB find_one coroutines
    async def fake_level_find_one(q):
        return {"_id": ObjectId(), "name": "Beginner"}

    async def fake_batch_find_one(q):
        return {
            "_id": ObjectId(),
            "name": "Batch A",
            "session_time": "Sat 10:00 - 11:00",
            "coach_id": str(ObjectId()),
        }

    async def fake_user_find_one(q):
        return {"_id": ObjectId(), "name": "Coach Ravi"}

    # Monkeypatch the db collections used by the helper
    # server.db exists as a Motor DB object; replace the collections with SimpleNamespace that expose find_one
    server.db = SimpleNamespace(
        levels=SimpleNamespace(find_one=fake_level_find_one),
        batches=SimpleNamespace(find_one=fake_batch_find_one),
        users=SimpleNamespace(find_one=fake_user_find_one),
    )

    async def run():
        # Provide valid-looking ObjectId strings so server.oid(...) succeeds
        student = {"level_id": str(ObjectId()), "batch_id": str(ObjectId())}
        ctx = await server._student_email_context(student)
        assert ctx["student_level"] == "Beginner"
        assert ctx["batch"] == "Batch A"
        assert ctx["batch_timing"] == "Sat 10:00 - 11:00"
        assert ctx["coach_name"] == "Coach Ravi"

        # Render the student_welcome template with the returned context
        subject, html = email_templates.render_email_template("student_welcome", {
            "parent_name": "Parent",
            "student_name": "Test Student",
            **ctx,
        })
        # Ensure values are interpolated into the HTML
        assert "Beginner" in html
        assert "Batch A" in html
        assert "Sat 10:00 - 11:00" in html
        assert "Coach Ravi" in html

    asyncio.run(run())
