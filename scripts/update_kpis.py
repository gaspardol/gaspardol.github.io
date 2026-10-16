#!/usr/bin/env python3
"""Refreshes data/kpis.json for the KPI page.

  citations  Google Scholar profile (total "Cited by")
  stars      GitHub stars summed over my public repositories and the public repositories
             I have contributed to (commits or merged pull requests)
  views      cumulative views of every Reel on Instagram @have_you_seen_my_quant,
             read from the local views ledger kept by the video pipeline

Each metric keeps its last known value when a source is unavailable (e.g. Scholar
blocking cloud IPs, or no views ledger on GitHub Actions). Standard library only.

  python3 scripts/update_kpis.py [--views-ledger PATH] [--backfill] [--push]
"""
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "kpis.json"
SCHOLAR_USER = "_jjDIqEAAAAJ"
GITHUB_USER = "gaspardol"
INSTAGRAM = "have_you_seen_my_quant"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
MAX_POINTS = 500


def fetch(url, headers=None):
    request = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", "ignore")


def today():
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


# --- sources -------------------------------------------------------------------------

def scholar():
    html = fetch(f"https://scholar.google.com/citations?user={SCHOLAR_USER}&hl=en")
    cells = re.findall(r'class="gsc_rsb_std">(\d+)<', html)
    if not cells:
        raise RuntimeError("Scholar returned no data (probably blocked)")
    years = [int(y) for y in re.findall(r'class="gsc_g_t"[^>]*>(\d{4})<', html)]
    counts = [int(c) for c in re.findall(r'class="gsc_g_al">(\d+)<', html)]
    return {"total": int(cells[0]), "hIndex": int(cells[2]) if len(cells) > 2 else None,
            "perYear": dict(zip(years, counts)) if len(years) == len(counts) else {}}


def github_token():
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        try:  # local runs: reuse the GitHub CLI login
            token = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            token = None
    return token or None


def github(path, accept="application/vnd.github+json"):
    headers = {"Accept": accept}
    token = github_token()
    if token:
        try:
            return json.loads(fetch(f"https://api.github.com{path}", {**headers, "Authorization": f"Bearer {token}"}))
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise
    return json.loads(fetch(f"https://api.github.com{path}", headers))  # public data needs no token


def public_repos():
    repos, page = [], 1
    while True:
        batch = github(f"/users/{GITHUB_USER}/repos?type=owner&per_page=100&page={page}")
        repos += [r for r in batch if not r.get("private")]
        if len(batch) < 100:
            return repos
        page += 1


def github_graphql(query):
    token = github_token()
    if not token:
        raise RuntimeError("GraphQL needs a token")
    request = urllib.request.Request("https://api.github.com/graphql", data=json.dumps({"query": query}).encode(),
                                     headers={"User-Agent": UA, "Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def contributed_repos():
    """Public repositories owned by others that I committed to or got pull requests merged into."""
    names = set()
    try:
        data = github_graphql('query { user(login: "%s") { repositoriesContributedTo(first: 100, includeUserRepositories: false, '
                              'contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY]) { nodes { nameWithOwner isPrivate } } } }' % GITHUB_USER)
        names |= {n["nameWithOwner"] for n in data["data"]["user"]["repositoriesContributedTo"]["nodes"] if not n["isPrivate"]}
    except Exception as error:
        print(f"stars: GraphQL contributions unavailable ({error})", file=sys.stderr)
    searches = [
        ("/search/commits?q=author:%s&per_page=100&page={page}" % GITHUB_USER, lambda item: item["repository"]["full_name"]),
        ("/search/issues?q=author:%s+type:pr+is:merged&per_page=100&page={page}" % GITHUB_USER,
         lambda item: item["repository_url"].split("/repos/", 1)[1]),
    ]
    for path, repo_of in searches:
        try:
            for page in range(1, 6):
                items = github(path.format(page=page)).get("items", [])
                names |= {repo_of(item) for item in items}
                if len(items) < 100:
                    break
        except Exception as error:
            print(f"stars: search unavailable ({error})", file=sys.stderr)
    return {n for n in names if not n.lower().startswith(GITHUB_USER.lower() + "/")}


def stars(with_history):
    repos = [[r["full_name"], r["stargazers_count"]] for r in public_repos()]
    for name in sorted(contributed_repos()):
        try:
            repo = github(f"/repos/{name}")
        except urllib.error.HTTPError:
            continue  # private or gone
        if not repo.get("private"):
            repos.append([repo["full_name"], repo["stargazers_count"]])
    total = sum(count for _, count in repos)
    top = sorted(([name, count] for name, count in repos if count), key=lambda x: -x[1])
    dates = []
    if with_history:  # star dates need an authenticated request
        try:
            dates = star_dates([name for name, _ in top])
        except urllib.error.HTTPError as error:
            print(f"stars: no history ({error})", file=sys.stderr)
    return {"total": total, "top": top[:6], "starDates": sorted(dates)}


def star_dates(names):
    dates = []
    for name in names:
        page = 1
        while True:
            batch = github(f"/repos/{name}/stargazers?per_page=100&page={page}", "application/vnd.github.star+json")
            dates += [s["starred_at"][:10] for s in batch if s.get("starred_at")]
            if len(batch) < 100:
                break
            page += 1
    return dates


def views(ledger, with_history):
    """Latest view count per Instagram post, summed. Optionally the running total per day.

    The ledger mixes rows that carry the post's media_id with rows that only name the
    video (slug). Both report the same numbers, so slug-only rows are folded into the
    post when that slug has exactly one media_id; reposts (several ids) count separately.
    """
    rows = []
    with open(ledger) as f:
        for line in f:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if isinstance(row.get("views"), (int, float)) and row.get("slug") and row.get("ts"):
                rows.append(row)
    rows.sort(key=lambda r: r["ts"])
    media_of = {}
    for row in rows:
        if row.get("media_id"):
            media_of.setdefault(row["slug"], set()).add(row["media_id"])
    latest, daily = {}, []
    day, running = None, 0
    for row in rows:
        media = row.get("media_id")
        if not media and len(media_of.get(row["slug"], ())) == 1:
            media = next(iter(media_of[row["slug"]]))
        key = media or "slug:" + row["slug"]
        if with_history and day is not None and row["ts"][:10] != day:
            daily.append([day, running])
        day = row["ts"][:10]
        running += int(row["views"]) - latest.get(key, 0)
        latest[key] = int(row["views"])
    if day is not None:
        daily.append([day, running])
    return {"total": running, "videos": len(latest), "lastSample": rows[-1]["ts"] if rows else None, "daily": daily}


# --- storage -------------------------------------------------------------------------

def load():
    if DATA.exists():
        return json.loads(DATA.read_text())
    return {"metrics": {
        "citations": {"label": "Google Scholar citations", "unit": "citations",
                      "url": f"https://scholar.google.com/citations?user={SCHOLAR_USER}", "history": []},
        "stars": {"label": "GitHub stars on my repos and contributions", "unit": "stars",
                  "url": f"https://github.com/{GITHUB_USER}?tab=repositories&sort=stargazers", "history": []},
        "views": {"label": "Views on Have you seen my quant", "unit": "views",
                  "url": f"https://www.instagram.com/{INSTAGRAM}/", "history": []},
    }}


def record(metric, value, date=None):
    date = date or today()
    history = [p for p in metric["history"] if p[0] != date]
    history.append([date, value])
    history.sort()
    if len(history) > MAX_POINTS:  # thin out old points, keep the recent ones dense
        old, recent = history[:-200], history[-200:]
        step = max(1, len(old) // (MAX_POINTS - 200))
        history = old[::step] + recent
    metric["history"] = history
    metric["value"] = value
    metric["updated"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--views-ledger", help="path to the video pipeline's analytics/views.jsonl")
    parser.add_argument("--backfill", action="store_true", help="rebuild history from each source")
    parser.add_argument("--push", action="store_true", help="commit and push data/kpis.json if it changed")
    args = parser.parse_args()
    data = load()
    m = data["metrics"]

    try:
        s = scholar()
        if args.backfill and s["perYear"]:
            running = 0
            m["citations"]["history"] = []
            for year in sorted(s["perYear"]):
                running += s["perYear"][year]
                if year < dt.date.today().year:
                    m["citations"]["history"].append([f"{year}-12-31", running])
        record(m["citations"], s["total"])
        m["citations"]["extra"] = {"hIndex": s["hIndex"]}
        print(f"citations: {s['total']}")
    except Exception as error:  # keep last value
        print(f"citations: unchanged ({error})", file=sys.stderr)

    try:
        g = stars(args.backfill)
        if args.backfill:
            m["stars"]["history"] = []
            for i, date in enumerate(g["starDates"], 1):
                m["stars"]["history"] = [p for p in m["stars"]["history"] if p[0] != date] + [[date, i]]
        record(m["stars"], g["total"])
        m["stars"]["extra"] = {"top": g["top"]}
        print(f"stars: {g['total']}")
    except Exception as error:
        print(f"stars: unchanged ({error})", file=sys.stderr)

    if args.views_ledger and Path(args.views_ledger).expanduser().exists():
        v = views(Path(args.views_ledger).expanduser(), args.backfill)
        if args.backfill:
            m["views"]["history"] = []
            for date, value in v["daily"][:-1]:
                m["views"]["history"].append([date, value])
        last_day = v["lastSample"][:10] if v["lastSample"] else None
        record(m["views"], v["total"], date=last_day if args.backfill else None)
        m["views"]["extra"] = {"videos": v["videos"], "lastSample": v["lastSample"]}
        print(f"views: {v['total']} over {v['videos']} reels (last sample {v['lastSample']})")

    data["updated"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(data, indent=1) + "\n")

    if args.push:
        git = ["git", "-C", str(ROOT)]
        subprocess.run(git + ["pull", "--rebase", "--quiet"], check=False)
        subprocess.run(git + ["add", "data/kpis.json"], check=True)
        if subprocess.run(git + ["diff", "--cached", "--quiet"]).returncode != 0:
            subprocess.run(git + ["commit", "--quiet", "-m", "Update KPIs"], check=True)
            subprocess.run(git + ["push", "--quiet"], check=True)
            print("pushed")


if __name__ == "__main__":
    main()
