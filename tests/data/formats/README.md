# Desktop sample patterns

Test data for `tests/test_format_golden.py`: the sample files of the
desktop applications, copied unchanged.

- `*.dbw` from DB-WEAVE (`dbweave/samples`, GPL-3.0)
- `*.jbb` from JBead (`jbead/samples`, GPL-3.0)

`.gitattributes` and the pre-commit configuration keep these files byte
for byte. `golden/` holds the snapshots the tests compare against (a
JSON digest per sample, reference PNGs for a subset); regenerate them
after an intentional change to import or export with

    UPDATE_GOLDEN=1 pytest tests/test_format_golden.py

and review the diff.
