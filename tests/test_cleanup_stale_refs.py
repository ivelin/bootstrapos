#!/usr/bin/env python3
"""Planner checks for the 30-day branch and pull-request cleanup."""

from __future__ import annotations

import importlib.util
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


def load_cleanup():
    path = Path(__file__).resolve().parents[1] / "scripts" / "cleanup_stale_refs.py"
    spec = importlib.util.spec_from_file_location("cleanup_stale_refs", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


cleanup = load_cleanup()
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)


def iso(when: datetime) -> str:
    return when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ago(days: int) -> str:
    return iso(NOW - timedelta(days=days))


class PlanTests(unittest.TestCase):
    def plan(self, prs=None, branches=None, default="main"):
        return cleanup.build_plan(NOW, 30, "ivelin/bootstrapos", default, prs or [], branches or [])

    def test_keeps_default_branch_and_recent_work(self):
        plan = self.plan(
            branches=[
                {"name": "main", "committedDate": ago(400)},
                {"name": "feat/fresh", "committedDate": ago(2)},
                {"name": "cursor/old", "committedDate": ago(31)},
            ]
        )
        self.assertEqual(plan["close"], [])
        self.assertEqual(plan["delete"], ["cursor/old"])

    def test_exact_30_days_is_kept(self):
        plan = self.plan(branches=[{"name": "feat/edge", "committedDate": ago(30)}])
        self.assertEqual(plan["delete"], [])

    def test_open_pull_request_keeps_its_branch(self):
        plan = self.plan(
            prs=[
                {
                    "number": 4,
                    "updatedAt": ago(1),
                    "headRefName": "feat/active",
                    "sameRepo": True,
                }
            ],
            branches=[{"name": "feat/active", "committedDate": ago(90)}],
        )
        self.assertEqual(plan["close"], [])
        self.assertNotIn("feat/active", plan["delete"])

    def test_stale_same_repo_pull_request_closes_and_drops_branch(self):
        plan = self.plan(
            prs=[
                {
                    "number": 8,
                    "updatedAt": ago(45),
                    "headRefName": "feat/abandoned",
                    "sameRepo": True,
                }
            ],
            branches=[{"name": "feat/abandoned", "committedDate": ago(45)}],
        )
        self.assertEqual(plan["close"], [8])
        self.assertEqual(plan["delete"], ["feat/abandoned"])

    def test_stale_fork_pull_request_closes_without_deleting_that_name_when_fresh(self):
        plan = self.plan(
            prs=[
                {
                    "number": 9,
                    "updatedAt": ago(40),
                    "headRefName": "feat/fork",
                    "sameRepo": False,
                }
            ],
            branches=[{"name": "feat/fork", "committedDate": ago(1)}],
        )
        self.assertEqual(plan["close"], [9])
        self.assertEqual(plan["delete"], [])

    def test_fresh_pull_request_protects_a_branch_a_stale_one_also_names(self):
        plan = self.plan(
            prs=[
                {
                    "number": 1,
                    "updatedAt": ago(3),
                    "headRefName": "feat/shared",
                    "sameRepo": True,
                },
                {
                    "number": 2,
                    "updatedAt": ago(50),
                    "headRefName": "feat/shared",
                    "sameRepo": True,
                },
            ],
            branches=[{"name": "feat/shared", "committedDate": ago(50)}],
        )
        self.assertEqual(plan["close"], [2])
        self.assertNotIn("feat/shared", plan["delete"])

    def test_never_deletes_main_even_as_a_pull_request_head(self):
        plan = self.plan(
            default="main",
            prs=[
                {
                    "number": 3,
                    "updatedAt": ago(80),
                    "headRefName": "main",
                    "sameRepo": True,
                }
            ],
            branches=[{"name": "main", "committedDate": ago(80)}],
        )
        self.assertEqual(plan["close"], [3])
        self.assertNotIn("main", plan["delete"])


if __name__ == "__main__":
    unittest.main()
