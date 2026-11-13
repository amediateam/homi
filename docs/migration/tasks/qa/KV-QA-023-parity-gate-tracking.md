# KV-QA-023 — Parity-gate tracking

| Field | Value |
| ----- | ----- |
| Status | TODO |
| Owner | QA (track: development) |
| Complexity | S |
| Feature IDs | Technical migration task — the gate of `15` §4 for all 144 features of `09` (F-ACCESS-001 … F-SUPPORT-001) |
| Dependencies | `09-feature-parity-matrix.md` and `data/features.csv` (exist) |

## Goal

The ten gate conditions of every feature are recorded in one machine-checked file, `09` shows the gate state per
feature, and a checker prevents a feature from being marked done while any condition is open.

## Legacy reference

- Gate definition: `15` §4.1–§4.5.
- Features and their decisions: `09` §2–§3, `data/features.csv` (144 rows; P0 94); DEV rows and defect fixes `09`
  §4.2–§4.3.
- Existing tooling pattern: `scripts/migration/collect_ids.py` (standard library, `--check` exit status).

## Implementation

1. Create `docs/migration/data/parity-gate.csv` with the header of `15` §4.3 and one row per feature from
   `data/features.csv`: every cell `open`, except `n/a:<decision>` in G3–G10 for features whose decision is
   `DROP_CANDIDATE` or `DEFER` (`09` §2.3).
2. Write `scripts/migration/parity_gate.py` (Python standard library):
   - validates the cell grammar (`open`, `done:<evidence>`, `n/a:<reason>`, `waived:<DEV-… or link>`);
   - checks that every evidence path exists in the repository (a `path:line` or a path), that PR numbers and CI links
     are well formed, and that every `waived:` names a DEV row of `09` §4.2 that is `APPROVED`;
   - checks that every `F-` id of `data/features.csv` has exactly one row and no row has an unknown id;
   - with `--update-09`, rewrites only the `Gate` cell of each feature row in `09` §3 (format `n/10`, plus the open
     conditions, for example `6/10 (G5 G8 G9 G10)`); with `--check`, exits 1 if `09` is out of date or any rule fails;
   - prints a summary by module and priority.
3. Add the `Gate` column to the tables of `09` §3 in coordination with the owner of `09` (a separate small PR, since
   `09` is maintained by the audit; `data/features.csv` gets the same column).
4. Add `python3 scripts/migration/parity_gate.py --check` to the `tooling.yml` workflow (or the nightly job) so that a
   gate cell edited by hand without evidence fails CI.
5. Add the checker's command lines (`--check`, `--update-09`) to `15` §4.3, next to the sign-off rules of §4.4.

## Files

- `docs/migration/data/parity-gate.csv` (new)
- `scripts/migration/parity_gate.py` (new)
- `docs/migration/09-feature-parity-matrix.md` and `docs/migration/data/features.csv` (`Gate` column)
- `.github/workflows/tooling.yml` (check step)
- `docs/migration/15-testing-strategy.md` §4.3 (commands)

## API contract

n/a.

## Business rules

The gate never approves a DEV; `waived:` requires an `APPROVED` DEV row (`15` §4.4).

## Acceptance criteria

- `parity-gate.csv` has 144 rows, one per feature; the checker passes on it.
- A hand-made row with `done:` pointing to a missing file, or `waived:` naming a `PROPOSED` DEV, makes `--check` fail.
- `09` shows `0/10` (or `n/a`) for every feature after `--update-09`; `--check` passes afterwards.
- `python3 scripts/migration/collect_ids.py --check` still exits 0.

## Tests

`scripts/migration/test_parity_gate.py` (`unittest`, standard library): grammar, evidence existence, DEV state, row
completeness, idempotent `--update-09`.

## Edge cases

- A feature added to `09` later: the checker reports the missing row; the row is added as `open`.
- A feature renamed or deprecated (`DEPRECATED_CANDIDATE`): the row stays, G3–G10 become `n/a:deprecated`.
- Evidence that is a CI run URL cannot be checked offline: accepted by format only, flagged in the summary.

## Security

No personal data in the gate file; evidence links point to repository paths, PRs and CI runs only.

## Definition of done

Tests green (`make ai-hooks-test` unaffected; the checker's unit tests green), parity gate items ticked (15 §4 — this
task creates the record), docs and `09` updated, PR reviewed by the other developer.
