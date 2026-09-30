#!/usr/bin/env python3
"""Close pull requests and delete branches with no updates for 30 days.

The default branch is never deleted. A branch that is the head of a pull
request we are keeping is never deleted. Fork pull requests are closed
without deleting a branch in the other repository.

Dry-run is the default. Pass --apply to close and delete.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone


ALWAYS_KEEP = frozenset({"main", "master"})


def parse_time(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def build_plan(
    now: datetime,
    days: int,
    repo: str,
    default_branch: str,
    prs: list[dict],
    branches: list[dict],
) -> dict:
    """Return pull request numbers to close and branch names to delete."""
    if days < 1:
        raise ValueError("days must be at least 1")
    cutoff = now - timedelta(days=days)
    keep = set(ALWAYS_KEEP)
    if default_branch:
        keep.add(default_branch)
    close: list[int] = []
    close_branches: list[str] = []
    for pr in prs:
        updated = parse_time(pr["updatedAt"])
        head = pr.get("headRefName") or ""
        same_repo = bool(pr.get("sameRepo"))
        if updated < cutoff:
            close.append(int(pr["number"]))
            if same_repo and head and head not in keep:
                close_branches.append(head)
        elif same_repo and head:
            keep.add(head)
    delete: list[str] = []
    seen: set[str] = set()
    for branch in branches:
        name = branch.get("name") or ""
        if not name or name in keep or name in seen:
            continue
        committed = branch.get("committedDate")
        if not committed:
            continue
        if parse_time(committed) < cutoff:
            delete.append(name)
            seen.add(name)
    for name in close_branches:
        if name not in keep and name not in seen:
            delete.append(name)
            seen.add(name)
    return {"close": close, "delete": delete, "keep": sorted(keep)}


def _gh(args: list[str]) -> str:
    return subprocess.check_output(["gh", *args], text=True)


def fetch_default_branch(repo: str) -> str:
    raw = _gh(["repo", "view", repo, "--json", "defaultBranchRef"])
    data = json.loads(raw)
    ref = data.get("defaultBranchRef") or {}
    name = ref.get("name") or ""
    if not name:
        raise SystemExit(f"no default branch for {repo}")
    return name


def fetch_prs(repo: str) -> list[dict]:
    raw = _gh(
        [
            "pr",
            "list",
            "--repo",
            repo,
            "--state",
            "open",
            "--limit",
            "500",
            "--json",
            "number,updatedAt,headRefName,headRepository",
        ]
    )
    rows = []
    for pr in json.loads(raw):
        head = pr.get("headRepository") or {}
        rows.append(
            {
                "number": pr["number"],
                "updatedAt": pr["updatedAt"],
                "headRefName": pr.get("headRefName") or "",
                "sameRepo": head.get("nameWithOwner") == repo,
            }
        )
    return rows


def fetch_branches(repo: str) -> list[dict]:
    owner, name = repo.split("/", 1)
    query = """
    query($owner: String!, $name: String!, $cursor: String) {
      repository(owner: $owner, name: $name) {
        refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            name
            target {
              ... on Commit { committedDate }
            }
          }
        }
      }
    }
    """
    cursor = ""
    found: list[dict] = []
    while True:
        raw = _gh(
            [
                "api",
                "graphql",
                "-f",
                f"query={query}",
                "-f",
                f"owner={owner}",
                "-f",
                f"name={name}",
                "-f",
                f"cursor={cursor}",
            ]
        )
        refs = json.loads(raw)["data"]["repository"]["refs"]
        for node in refs["nodes"]:
            target = node.get("target") or {}
            found.append({"name": node["name"], "committedDate": target.get("committedDate")})
        if not refs["pageInfo"]["hasNextPage"]:
            break
        cursor = refs["pageInfo"]["endCursor"] or ""
        if not cursor:
            break
    return found


def apply_plan(repo: str, plan: dict, days: int) -> None:
    comment = (
        f"Closed automatically. This pull request had no updates for {days} days. "
        "Open a new pull request from current main if the work is still wanted."
    )
    failures = 0
    for number in plan["close"]:
        print(f"close #{number}")
        proc = subprocess.run(
            ["gh", "pr", "close", str(number), "--repo", repo, "--comment", comment],
            text=True,
        )
        if proc.returncode != 0:
            failures += 1
    for name in plan["delete"]:
        if name in ALWAYS_KEEP or name == "":
            print(f"skip delete {name}")
            continue
        encoded = urllib.parse.quote(name, safe="/")
        print(f"delete {name}")
        proc = subprocess.run(
            [
                "gh",
                "api",
                "--method",
                "DELETE",
                f"repos/{repo}/git/refs/heads/{encoded}",
            ],
            text=True,
            capture_output=True,
        )
        if proc.returncode != 0:
            body = (proc.stderr or "") + (proc.stdout or "")
            if "Reference does not exist" in body:
                print(f"already gone {name}")
                continue
            print(body, file=sys.stderr)
            failures += 1
    if failures:
        raise SystemExit(f"{failures} cleanup calls failed")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="")
    parser.add_argument("--days", type=int, default=30)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    repo = args.repo or _gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).strip()
    now = datetime.now(timezone.utc)
    default_branch = fetch_default_branch(repo)
    plan = build_plan(now, args.days, repo, default_branch, fetch_prs(repo), fetch_branches(repo))
    mode = "apply" if args.apply else "dry-run"
    print(f"{mode} repo={repo} default={default_branch} days={args.days}")
    print(f"close {len(plan['close'])}: {', '.join('#' + str(n) for n in plan['close']) or '(none)'}")
    print(f"delete {len(plan['delete'])}:")
    for name in plan["delete"]:
        print(f"  {name}")
    if not args.apply:
        print("dry-run only; pass --apply to close pull requests and delete branches")
        return 0
    apply_plan(repo, plan, args.days)
    print("cleanup done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
