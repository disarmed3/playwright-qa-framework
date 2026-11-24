# Database access (Postgres MCP)

No `paths:` restriction: database access is not tied to a folder, so this applies in every session.
Every write also follows `.claude/rules/01-guardrails.md` (approval) and `20-data-management.md`
(clean up your own records, never delete what you did not create).

The database is the dev database behind dev.ai-orchestration-courses.com (confirmed in writing by the
database account's issuer, and by a read-only stock comparison: equal to dev on 8 of 8 products, prod different on 3).
Prod has a separate database with no student login.

## Approved route

- Do: reach the database only through the `postgres` server in `.mcp.json`
  (`uvx … postgres-mcp --access-mode=restricted`), the two inspection scripts and the opt-in test layer
  below. `uvx --env-file` loads `.env` into the connector's process and the connector reads `DATABASE_URI`
  from it (`postgres_mcp/server.py:558` in 0.3.0).
- Do: keep `.mcp.json` free of credentials: no `env` block, no address, no username. Never read `.env`,
  never print a connection string, host, password or the issued role name.
- Do: keep `--access-mode=restricted`. Removing it, or changing any argument, needs approval.
- When: any database read, by Claude or a tool started from this project.
- Verify: review `.mcp.json`; `git check-ignore .env` prints `.env`; `git ls-files .env` prints nothing.
- ⚠️ The connector's default mode is unrestricted (`server.py:520`). Without the flag it starts
  normally and accepts writes; nothing fails.
- ⚠️ The connector connects when it starts, not at the first query. Loading it is the first contact with
  the shared database and needs approval like any outside action.
- ⚠️ `--env-file` loads every `.env` value, the Jira token included, into the connector's process.
  Nothing prints it, but the process holds more than it needs.

## Approved tools and reads

- Do: use `list_schemas`, `list_objects`, `get_object_details` and `execute_sql` with `SELECT` or `SHOW`.
  `explain_query` only without ANALYZE.
- Do: read catalog metadata (`pg_catalog`, `information_schema`, `has_*_privilege`, `pg_has_role`) and
  aggregate counts. Record each count with its date; never compare it with a historical target, except the
  starting data below.
- Do: for the inspection scripts, also non-personal store values by slug or code (`products.price_cents`,
  `products.active`, `product_variants.label` and `stock`, coupon terms) and id-only joins for orphan
  counts, including `users.id`.
- Do not: read personal row values (no rows from `users`, `orders`, `payments`, `carts`, `comments`;
  no `select *`). Do not run `analyze_db_health`, `get_top_queries`, `analyze_workload_indexes` or
  `analyze_query_indexes` without approval: they read other sessions' query statistics and may try
  `CREATE EXTENSION`.
- Do not: run mutation probes. A right is shown by inspection (`has_table_privilege(…, 'UPDATE')`), never
  by attempting the write. Permission results are "grants-only evidence, not attempted".
- When: every connector call.
- Verify: review each call; no `insert`, `update`, `delete`, `truncate`, `alter`, `drop`, `create` or
  `grant` statement in database code. A privilege name inside an inspection call is not a statement.

## Expected permissions

- Source: the issued permission list for group `qa_student`. It wins over a Jira ticket; a ticket that
  differs is still raised with the database account's issuer.
- Blog tables (`articles`, `categories`, `comments`) and store tables (`products`, `product_variants`,
  `coupons`, `carts`, `cart_items`, `orders`, `order_items`, `payments`): read, add, change, delete.
- `users`: read and add only. No change, no delete.
- ID counters (sequences): usable = `USAGE` + `SELECT`, from the issued group (the `qa_student` grant).
  `USAGE` lets an insert take the next ID; `SELECT` only reads a counter's current value. `UPDATE`
  (resetting a counter) is neither granted nor expected.
- `TEMP` on the database: expected, from PostgreSQL's default grant to every role (`PUBLIC`). A temporary
  table lives only in its own session and cannot touch the shared tables. The project does not use
  temporary tables and Claude does not create them (no `create`, above).
- `REFERENCES`, `TRIGGER` and `TRUNCATE`: expected false on all 12 tables.
- Table structure (of the shared tables), logins and roles, superuser: nothing.
- Do: compare observed rights with this list. Observed rights never define expected ones. A missing
  list, a conflict with a ticket, or a right the list does not mention is a question for the database account's issuer,
  not a match.

## Last full inspection (2026-10-26, read-only metadata through the connector)

Values are booleans, counts and catalog names; the issued role name and the connection details are not
recorded. No unexpected elevated right was found.

| Check                      | Expected                      | Observed                                                                                          | Match |
| -------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ----- |
| Connector mode             | restricted, read-only         | process runs with `--access-mode=restricted`; `transaction_read_only` is `on` inside a query      | yes   |
| Identity                   | the issued role               | `current_user` = `session_user`; PostgreSQL 16.14                                                 | yes   |
| Role attributes            | no elevated attribute         | superuser, create role, create database, replication, bypass RLS: all false; login, inherit: true | yes   |
| Memberships                | `qa_student`                  | `qa_student` only (no admin option); no predefined `pg_*` role                                    | yes   |
| Ownership                  | nothing                       | 0 relations, 0 schemas, not the database owner                                                    | yes   |
| Schemas and tables         | the 12 listed tables          | `public` holds exactly the 12 tables, no other relation; row-level security off, 0 policies       | yes   |
| Blog and store tables (11) | read, add, change, delete     | `SELECT`, `INSERT`, `UPDATE`, `DELETE` true; `TRUNCATE`, `REFERENCES`, `TRIGGER` false            | yes   |
| `users`                    | read and add only             | `SELECT`, `INSERT` true; `UPDATE` (table and every column), `DELETE`, `TRUNCATE` false            | yes   |
| Sequences (12)             | `USAGE` + `SELECT`            | 12/12 `USAGE` and `SELECT`, granted to `qa_student`; 0 `UPDATE`; none owned                       | yes   |
| Structure                  | nothing on the shared tables  | `CREATE` on schema `public` false; `CREATE` on the database false                                 | yes   |
| `TEMP`                     | expected (PostgreSQL default) | true, granted to `PUBLIC`, not to `qa_student` or the issued role                                 | yes   |

- Expected denied operation, inspected, nothing attempted: `UPDATE` on `users` —
  `has_table_privilege(current_user, 'public.users', 'UPDATE')` and `has_any_column_privilege(…, 'UPDATE')`
  are both false, so the database would refuse such a change. No update was sent: this shows a missing
  grant, not a refused write.
- Metadata reads prove the rights on the day they ran. A grant change by the database account's issuer needs a new
  inspection (the scripts below), not an assumption.

## Two fences, and what stays unverified

| Layer                       | What it does                                                                                                                                                        | State                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Connector (restricted mode) | Parses SQL with pglast against statement and function allow-lists; runs each query in `BEGIN TRANSACTION READ ONLY`; 30 s timeout (`sql/safe_sql.py`, 0.3.0 source) | flag seen on the running process; read-only transaction `on` in a live query. Refusal of a write not exercised |
| PostgreSQL grants           | Decide what a statement may do once it reaches the database. The account can write 11 tables and add rows to `users`.                                               | inspected; matches the expected list. No mutation attempted                                                    |
| Outside the connector       | `psql` or any other client uses the same account with its full grants. Only approval and rules 01/20 apply there.                                                   | no fence beyond review                                                                                         |

- Unverified: that a write would be refused by either fence; no write, DDL or role change was attempted.
- `${CLAUDE_PROJECT_DIR:-.}` in `.mcp.json` expands to `./` when the variable is not set; it works because
  the server starts in the project root.

## Connector version override

- `uv-overrides.txt` (`pglast==7.21`) is passed with `--overrides`; without it the published command does
  not resolve. Keep Python 3.12 and `mcp~=1.0`; never fall back to `postgres-mcp` 0.1.0.
- Remove both the file and the `--overrides` argument once a `postgres-mcp` release without the
  `pglast==7.2.0` pin is published.

## Repeatable inspection scripts

- Do: repeat the inspection with `scripts/verify-student-fence.sh` (rights) and
  `scripts/seed-integrity.sh` (starting data). Run them with Git Bash: `bash scripts/<name>.sh`, or
  from PowerShell `& "C:\Program Files\Git\bin\bash.exe" scripts/<name>.sh` (plain `bash` there is WSL).
- Route: the scripts use `psql` outside the connector, with the issued account. Fences: SELECT-only
  SQL and a session started with `default_transaction_read_only=on` (checked by both scripts before
  any other read), 30 s statement timeout. Every run contacts the shared database and needs approval
  like any outside action.
- Credentials: the scripts read `STUDENT_DATABASE_URL` from the environment, else only that key from
  `.env` (Windows CR stripped); its value equals `DATABASE_URI`. Claude never opens `.env`; no script prints
  the value, host, role name or raw `psql` error text (connection errors are reported as "details hidden",
  query errors by SQLSTATE only).
- Starting data: expected values come only from `vault/sources/database/starting-data.md`. Drift = stock
  and row counts: report the starting value, today's value and the date; never reset. Every other
  difference is a data mismatch: the check fails, the expected value stays, the database account's issuer is told,
  nothing is reset.
- Case IDs: TC-DB-001, 002, 020–028 and TC-SDB-001–003, 020, 021 are defined in
  `vault/sources/test-catalog/db.md`. The backlog's "12/12" counted an old server script and is not used.
- Exit codes (both scripts): 0 pass (DRIFT and INFO allowed), 1 data mismatch, 2 permission
  mismatch, 3 query error or malformed response, 4 connection failure or missing configuration,
  5 unverified. A malformed response is never compared as data.
- Verify: `bash -n` on both scripts, then a fixture run with a fake `psql` (no database).

## Optional test layer

- Route: `tests/support/db.ts` (`pg` 8.23.1), used by `tests/db/*.spec.ts`, outside the connector,
  with the issued account. Opt-in: only with `QA_DB=1`. Without it, or on any target but dev, every test
  is skipped with a named reason. Every run with `QA_DB=1` contacts the shared database and needs approval
  like any outside action.
- Credentials: `STUDENT_DATABASE_URL` from the environment; only when it is unset, that one line of
  `.env`, parsed with `node:util` `parseEnv`. An explicit empty value means unavailable, not a
  fallback. Claude never opens `.env`; nothing prints the value.
- ⚠️ PowerShell's `$env:STUDENT_DATABASE_URL=''` removes the variable, so the helper falls back to
  `.env`. An empty value is set from Git Bash (`STUDENT_DATABASE_URL= …`); Git Bash passes `""` to Node.
- Fences: each read runs on one checked-out client: `BEGIN TRANSACTION READ ONLY`, `SET LOCAL
statement_timeout`, a `SHOW transaction_read_only` check, the statement (extended protocol, values
  as parameters), `ROLLBACK`; the client is destroyed after any failure. The session default
  `default_transaction_read_only=on` is a second fence only: parameters in the connection string
  override `pg`'s `options`. Errors carry the step and code only.
- Reads: catalog metadata, aggregate counts and id-only joins, as above. No personal row values.
- Unverified: that a write sent through these helpers is refused. No isolated disposable database is
  available, so read-only enforcement is checked with a fake pool only. No read-only role is issued
  (rule 20 would prefer one); an open question for the database account's issuer.
- Verify: `safety/db-helpers.safety.spec.ts` (`npm run test:safety`).
