"""
compare.py — Compare two eval run result files.

Run from backend/:
    python eval/compare.py eval/results/runA.json eval/results/runB.json [--output eval/results/compare_A_vs_B.json]
"""
import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


def load_run(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        # Try relative to backend dir
        backend_dir = Path(__file__).parent.parent
        p = backend_dir / path
    if not p.exists():
        print(f"ERROR: file not found: {path}", file=sys.stderr)
        sys.exit(1)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def compare_runs(run_a: dict, run_b: dict) -> dict:
    """Compute comparison between two eval runs."""
    lookup_a = {r["release_id"]: r for r in run_a.get("records", [])}
    lookup_b = {r["release_id"]: r for r in run_b.get("records", [])}

    common_ids = set(lookup_a.keys()) & set(lookup_b.keys())

    fixed = []      # A failed, B passed
    broken = []     # A passed, B failed
    both_pass = []  # both passed
    both_fail = []  # both failed

    for rid in sorted(common_ids):
        rec_a = lookup_a[rid]
        rec_b = lookup_b[rid]

        # Skip records that were skipped in either run
        if rec_a.get("skipped") or rec_b.get("skipped"):
            continue

        a_top1 = rec_a["real"]["top1"]
        b_top1 = rec_b["real"]["top1"]

        entry = {
            "release_id": rid,
            "difficulty": rec_a.get("difficulty"),
            "genres": rec_a.get("genres", []),
            "a_rank": rec_a["real"]["rank"],
            "b_rank": rec_b["real"]["rank"],
            "a_extracted": rec_a["real"].get("extracted", {}),
            "b_extracted": rec_b["real"].get("extracted", {}),
        }

        if not a_top1 and b_top1:
            fixed.append(entry)
        elif a_top1 and not b_top1:
            broken.append(entry)
        elif a_top1 and b_top1:
            both_pass.append(entry)
        else:
            both_fail.append(entry)

    total_common = len(fixed) + len(broken) + len(both_pass) + len(both_fail)

    # By difficulty breakdown
    difficulties = ["easy", "medium", "hard"]
    by_difficulty: dict[str, dict] = {}
    for d in difficulties:
        d_fixed = [r for r in fixed if r["difficulty"] == d]
        d_broken = [r for r in broken if r["difficulty"] == d]
        d_both_pass = [r for r in both_pass if r["difficulty"] == d]
        d_both_fail = [r for r in both_fail if r["difficulty"] == d]
        d_total = len(d_fixed) + len(d_broken) + len(d_both_pass) + len(d_both_fail)
        if d_total == 0:
            continue
        by_difficulty[d] = {
            "total": d_total,
            "fixed": len(d_fixed),
            "broken": len(d_broken),
            "both_pass": len(d_both_pass),
            "both_fail": len(d_both_fail),
        }

    return {
        "run_a": {
            "run_id": run_a.get("run_id"),
            "prompt_id": run_a.get("prompt_id"),
            "timestamp": run_a.get("timestamp"),
            "summary": run_a.get("summary"),
        },
        "run_b": {
            "run_id": run_b.get("run_id"),
            "prompt_id": run_b.get("prompt_id"),
            "timestamp": run_b.get("timestamp"),
            "summary": run_b.get("summary"),
        },
        "comparison": {
            "total_common": total_common,
            "fixed_count": len(fixed),
            "broken_count": len(broken),
            "both_pass_count": len(both_pass),
            "both_fail_count": len(both_fail),
            "net_change": len(fixed) - len(broken),
        },
        "by_difficulty": by_difficulty,
        "fixed": fixed,
        "broken": broken,
        "both_pass": both_pass,
        "both_fail": both_fail,
    }


def print_summary(result: dict) -> None:
    ra = result["run_a"]
    rb = result["run_b"]
    cmp = result["comparison"]

    print(f"\n=== COMPARISON: {ra['run_id']}  vs  {rb['run_id']} ===")
    print(f"  A real_top1: {ra['summary'].get('real_top1_pct')}%")
    print(f"  B real_top1: {rb['summary'].get('real_top1_pct')}%")
    print(f"  Common records evaluated: {cmp['total_common']}")
    print(f"  Fixed (A->B improved): {cmp['fixed_count']}")
    print(f"  Broken (A->B regressed): {cmp['broken_count']}")
    print(f"  Both pass: {cmp['both_pass_count']}")
    print(f"  Both fail: {cmp['both_fail_count']}")
    print(f"  Net change: {cmp['net_change']:+d}")

    if result.get("by_difficulty"):
        print("\n  By difficulty:")
        for d, stats in result["by_difficulty"].items():
            print(f"    {d}: total={stats['total']}, fixed={stats['fixed']}, broken={stats['broken']}, both_pass={stats['both_pass']}, both_fail={stats['both_fail']}")

    if result["fixed"]:
        print(f"\n  FIXED ({len(result['fixed'])} records):")
        for r in result["fixed"][:20]:
            print(f"    release_id={r['release_id']} ({r['difficulty']}) genres={r['genres']}")
            print(f"      A rank={r['a_rank']}  B rank={r['b_rank']}")

    if result["broken"]:
        print(f"\n  BROKEN ({len(result['broken'])} records):")
        for r in result["broken"][:20]:
            print(f"    release_id={r['release_id']} ({r['difficulty']}) genres={r['genres']}")
            print(f"      A rank={r['a_rank']}  B rank={r['b_rank']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare two VinylScan eval runs")
    parser.add_argument("run_a", help="Path to run A result JSON")
    parser.add_argument("run_b", help="Path to run B result JSON")
    parser.add_argument("--output", default=None, help="Optional output path for comparison JSON")
    args = parser.parse_args()

    data_a = load_run(args.run_a)
    data_b = load_run(args.run_b)

    result = compare_runs(data_a, data_b)
    print_summary(result)

    if args.output:
        out_path = Path(args.output) if os.path.isabs(args.output) else Path(__file__).parent.parent / args.output
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\nComparison saved: {out_path}", flush=True)
