#!/usr/bin/env bash
# Week 3 Task 07: read-only inspection of the issued database rights.
# Expected rights: the mentor-issued list for group qa_student, 2026-10-26
# (.claude/rules/40-db-postgres.md, "Expected permissions"), and the mentor's case definitions of
# 2026-10-30 (TC-DB-020..028, TC-SDB-020, TC-SDB-021; vault/sources/test-catalog/db.md).
# Observed rights never define expected ones. Table names: the seed-facts block of
# vault/sources/database/starting-data.md.
#
# Grants-only evidence, not attempted: every result comes from inspecting privileges
# (has_*_privilege, pg_has_role, pg_roles, pg_class, pg_auth_members). No write, no denial probe, no
# DDL, no role change, no reset. The session runs with default_transaction_read_only.
# Every response is checked for shape (column count, t/f, whole numbers) before it is compared; a
# malformed response is a QUERY_ERROR, never a pass or mismatch.
# Connection: STUDENT_DATABASE_URL from the environment, else only that key from .env (CR stripped).
# Never printed: the connection value, host, role name or raw psql error text.
#
# Usage, from the repository root:
#   bash scripts/verify-student-fence.sh                                         (Git Bash)
#   & "C:\Program Files\Git\bin\bash.exe" scripts/verify-student-fence.sh        (PowerShell)
# Plain `bash` in PowerShell starts WSL, which cannot run the Windows psql.
# PSQL=<path> overrides the psql binary (default: psql on PATH, else PostgreSQL 17's default path).
#
# Exit: 0 pass (INFO lines allowed), 2 permission mismatch, 3 query error or malformed response,
# 4 connection failure, 5 unverified (a required check could not be decided).
# Several outcomes: 4 > 3 > 2 > 1 > 5.

set -u -o pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
facts_file="$repo_root/vault/sources/database/starting-data.md"

declare -A n=([PASS]=0 [INFO]=0 [DRIFT]=0 [DATA_MISMATCH]=0 [PERMISSION_MISMATCH]=0
  [QUERY_ERROR]=0 [CONNECTION_FAILURE]=0 [UNVERIFIED]=0)

report() { # status ref check expected observed [note]; case-ID lines carry the grants-only label
  local note="${6:-}"
  [[ "$2" == TC-* && -z "$note" ]] && note='grants-only, not attempted'
  n[$1]=$((${n[$1]} + 1))
  printf '%-19s %-10s %-48s expected %-20s observed %s%s\n' "$1" "$2" "$3" "$4" "$5" "${note:+  ($note)}"
}

finish() {
  local code=0
  if ((n[CONNECTION_FAILURE])); then code=4
  elif ((n[QUERY_ERROR])); then code=3
  elif ((n[PERMISSION_MISMATCH])); then code=2
  elif ((n[DATA_MISMATCH])); then code=1
  elif ((n[UNVERIFIED])); then code=5
  fi
  printf 'summary pass=%d info=%d drift=%d permission_mismatch=%d data_mismatch=%d unverified=%d query_error=%d connection_failure=%d exit=%d\n' \
    "${n[PASS]}" "${n[INFO]}" "${n[DRIFT]}" "${n[PERMISSION_MISMATCH]}" "${n[DATA_MISMATCH]}" \
    "${n[UNVERIFIED]}" "${n[QUERY_ERROR]}" "${n[CONNECTION_FAILURE]}" "$code"
  exit "$code"
}

check() { # ref check expected observed -> PASS or PERMISSION_MISMATCH
  if [[ "$3" == "$4" ]]; then report PASS "$1" "$2" "$3" "$4"; else report PERMISSION_MISMATCH "$1" "$2" "$3" "$4"; fi
}

rows_ok() { # text regex-per-column... -> 0 when every non-empty line has exactly these columns
  local text="$1"; shift
  local IFS=$'\x1f'
  awk -F'|' -v specs="$*" 'BEGIN { n = split(specs, re, "\x1f") }
    NF == 0 { next }
    NF != n { bad = 1; next }
    { for (i = 1; i <= n; i++) if ($i !~ re[i]) bad = 1 }
    END { exit bad }' <<<"$text"
}

one_row_ok() { [[ -n "$1" && "$1" != *$'\n'* ]] && rows_ok "$@"; }

malformed() { report QUERY_ERROR "$1" "$2" 'well-formed response' 'malformed response' 'shape check failed'; }

# --- seed facts --------------------------------------------------------------------------------
facts=""
if [[ -f "$facts_file" ]]; then
  facts="$(sed -n '/^```seed-facts$/,/^```$/p' "$facts_file" | sed '1d;$d' | tr -d '\r' | grep -v -e '^#' -e '^$')"
fi
fact_field() { # check key field-number -> value of the first matching row
  awk -F'|' -v c="$1" -v k="$2" -v f="$3" '$1 == c && $2 == k { print $f; exit }' <<<"$facts"
}

# --- connection --------------------------------------------------------------------------------
url="${STUDENT_DATABASE_URL:-}"
if [[ -z "$url" && -f "$repo_root/.env" ]]; then
  url="$(sed -n 's/^STUDENT_DATABASE_URL=//p' "$repo_root/.env" | head -n 1 | tr -d '\r')"
  url="${url#\"}"; url="${url%\"}"; url="${url#\'}"; url="${url%\'}"
fi

psql_bin="${PSQL:-}"
[[ -n "$psql_bin" ]] || psql_bin="$(command -v psql || true)"
[[ -n "$psql_bin" ]] || psql_bin='/c/Program Files/PostgreSQL/17/bin/psql.exe'

err_file="$(mktemp)"
trap 'rm -f "$err_file"' EXIT

out=""; sql_status=""; sql_state=""
run_sql() { # sql -> sets out, sql_status (ok|conn|perm|query), sql_state
  local rc state
  out="$(PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000' \
    PGCONNECT_TIMEOUT=10 PGCLIENTENCODING=UTF8 PGAPPNAME=qa-framework-t07 \
    "$psql_bin" "$url" -X -q -A -t -F '|' -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -f - \
    <<<"$1" 2>"$err_file" | tr -d '\r')"
  rc=$?
  if ((rc == 0)); then sql_status=ok; return 0; fi
  state="$(grep -oE '(ERROR|FATAL): +[0-9A-Z]{5}' "$err_file" | head -n 1 | grep -oE '[0-9A-Z]{5}$')"
  sql_state="${state:-none}"
  if ((rc == 2)) || [[ "$state" == 08* ]]; then sql_status=conn
  elif [[ "$state" == 42501 ]]; then sql_status=perm
  else sql_status=query
  fi
  return 1
}

query() { # ref check sql -> 0 with $out set, else reports and returns 1 (stops on connection failure)
  run_sql "$3" && return 0
  case "$sql_status" in
    conn) report CONNECTION_FAILURE "$1" "$2" 'a connection' 'failed' 'details hidden'; finish ;;
    perm) report PERMISSION_MISMATCH "$1" "$2" 'read allowed' "SQLSTATE $sql_state" ;;
    *) report QUERY_ERROR "$1" "$2" 'query runs' "SQLSTATE $sql_state" ;;
  esac
  return 1
}

all_f() { # ref check list-of-"name|value" lines -> one PASS line, or one mismatch line per object
  local ref="$1" what="$2" total=0 bad=0 name value
  while IFS='|' read -r name value; do
    [[ -n "$name" ]] || continue
    total=$((total + 1))
    if [[ "$value" != f ]]; then bad=$((bad + 1)); report PERMISSION_MISMATCH "$ref" "$what: $name" f "$value"; fi
  done <<<"$3"
  if ((total == 0)); then report UNVERIFIED "$ref" "$what" 'f on each' 'no objects found'
  elif ((bad == 0)); then report PASS "$ref" "$what" 'f on each' "all $total"
  fi
}

tf='^[tf]$'

printf 'verify-student-fence  target=dev (mentor-confirmed 2026-10-29)  run=%s  expected=mentor list 2026-10-26, cases 2026-10-30  evidence=grants-only, not attempted\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -z "$url" ]]; then
  report CONNECTION_FAILURE '-' 'connection setting' 'STUDENT_DATABASE_URL set' 'missing'; finish
fi
if [[ ! -x "$psql_bin" ]] && ! command -v "$psql_bin" >/dev/null 2>&1; then
  report CONNECTION_FAILURE '-' 'psql binary' 'found' 'missing'; finish
fi
expected_tables="$(fact_field tables public 3)"
if [[ -z "$expected_tables" || "$(fact_field tables public 5)" != approved ]]; then
  report UNVERIFIED '-' 'table list (starting-data seed facts)' 'approved row' 'missing'; finish
fi
blog_tables='articles categories comments'   # TC-DB-020 (mentor, 2026-10-30)
store_tables=""                              # TC-SDB-020/021: every listed table except users and blog
for rel in ${expected_tables//,/ }; do
  [[ "$rel" == users || " $blog_tables " == *" $rel "* ]] || store_tables+="${store_tables:+ }$rel"
done

# Identity and session
if query '-' 'identity and session' \
  "SELECT (current_user = session_user)::text, (current_setting('server_version_num')::int / 10000)::text, current_setting('transaction_read_only');"; then
  if one_row_ok "$out" '^(true|false)$' '^[0-9]+$' '^(on|off)$'; then
    IFS='|' read -r same major read_only <<<"$out"
    check '-' 'current_user = session_user (issued role)' true "$same"
    if [[ "$read_only" != on ]]; then report UNVERIFIED '-' 'session is read-only (script safety)' on "$read_only"; finish; fi
    report PASS '-' 'session is read-only (script safety)' on "$read_only"
    report INFO '-' 'server major version' 'not in issued list' "$major"
  else malformed '-' 'identity and session'; fi
fi

# Role attributes: TC-DB-028 (CREATE ROLE denied: no CREATEROLE, SUPERUSER, CREATEDB)
if query 'TC-DB-028' 'role attributes' \
  "SELECT rolcreaterole, rolsuper, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolinherit FROM pg_roles WHERE rolname = current_user;"; then
  if one_row_ok "$out" "$tf" "$tf" "$tf" "$tf" "$tf" "$tf" "$tf"; then
    IFS='|' read -r createrole super createdb replication bypassrls login inherit <<<"$out"
    check 'TC-DB-028' 'CREATE ROLE: rolcreaterole' f "$createrole"
    check 'TC-DB-028' 'CREATE ROLE: rolsuper' f "$super"
    check 'TC-DB-028' 'CREATE ROLE: rolcreatedb' f "$createdb"
    check '-' 'rolreplication' f "$replication"
    check '-' 'rolbypassrls' f "$bypassrls"
    report INFO '-' 'rolcanlogin' 'not in issued list' "$login"
    report INFO '-' 'rolinherit' 'not in issued list' "$inherit"
  else malformed 'TC-DB-028' 'role attributes'; fi
fi

# Memberships: qa_student only, no predefined pg_* role
if query '-' 'direct memberships' \
  "SELECT r.rolname, m.admin_option FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user) ORDER BY 1;"; then
  if rows_ok "$out" '^[a-z0-9_]+$' "$tf"; then
    check '-' 'direct memberships (role|admin option)' 'qa_student|f' "${out//$'\n'/,}"
  else malformed '-' 'direct memberships'; fi
fi
if query '-' 'predefined pg_* roles' \
  "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'pg\\_%' AND pg_has_role(current_user, oid, 'MEMBER');"; then
  if one_row_ok "$out" '^[0-9]+$'; then check '-' 'predefined pg_* roles reached' 0 "$out"
  else malformed '-' 'predefined pg_* roles'; fi
fi

# Ownership: owns no relation, schema or the database (acting as table owner: TC-DB-024/026 below)
if query '-' 'ownership' \
  "SELECT (SELECT count(*) FROM pg_class WHERE relowner = u.oid), (SELECT count(*) FROM pg_namespace WHERE nspowner = u.oid), (SELECT d.datdba = u.oid FROM pg_database d WHERE d.datname = current_database()) FROM pg_roles u WHERE u.rolname = current_user;"; then
  if one_row_ok "$out" '^[0-9]+$' '^[0-9]+$' "$tf"; then
    IFS='|' read -r own_rel own_ns own_db <<<"$out"
    check '-' 'owned relations (any kind)' 0 "$own_rel"
    check '-' 'owned schemas' 0 "$own_ns"
    check '-' 'database owner' f "$own_db"
  else malformed '-' 'ownership'; fi
fi

# Table privileges: TC-DB-020, 021, 022, 023, 025, TC-SDB-020, 021; REFERENCES and TRIGGER false
if query '-' 'table privileges' \
  "SELECT c.relname, has_table_privilege(c.oid, 'SELECT'), has_table_privilege(c.oid, 'INSERT'), has_table_privilege(c.oid, 'UPDATE'), has_table_privilege(c.oid, 'DELETE'), has_table_privilege(c.oid, 'TRUNCATE'), has_any_column_privilege(c.oid, 'UPDATE'), has_table_privilege(c.oid, 'REFERENCES'), has_table_privilege(c.oid, 'TRIGGER') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') ORDER BY 1;"; then
  if rows_ok "$out" '^[a-z0-9_]+$' "$tf" "$tf" "$tf" "$tf" "$tf" "$tf" "$tf" "$tf"; then
    declare -A priv=()
    while IFS='|' read -r rel s i u d t cu ref trg; do
      [[ -n "$rel" ]] && priv[$rel]="$s $i $u $d $t $cu $ref $trg"
    done <<<"$out"
    field() { local -a p=(${priv[$1]}); printf '%s' "${p[$2]}"; } # table index(0=S..7=TRIGGER)
    truncate_all=""; truncate_store=""; reftrg=""
    for rel in ${expected_tables//,/ }; do
      if [[ -z "${priv[$rel]:-}" ]]; then
        report UNVERIFIED '-' "privileges on $rel" 'table present' 'table not found'
        continue
      fi
      sidu="$(field "$rel" 0) $(field "$rel" 1) $(field "$rel" 2) $(field "$rel" 3)"
      if [[ " $blog_tables " == *" $rel "* ]]; then
        check 'TC-DB-020' "SELECT INSERT UPDATE DELETE on $rel" 't t t t' "$sidu"
      elif [[ "$rel" == users ]]; then
        check 'TC-DB-021' 'SELECT INSERT on users' 't t' "$(field users 0) $(field users 1)"
        check 'TC-DB-022' 'UPDATE on users (table, any column)' 'f f' "$(field users 2) $(field users 5)"
        check 'TC-DB-023' 'DELETE on users' f "$(field users 3)"
      else
        check 'TC-SDB-020' "SELECT INSERT UPDATE DELETE on $rel" 't t t t' "$sidu"
        truncate_store+="$rel|$(field "$rel" 4)"$'\n'
      fi
      truncate_all+="$rel|$(field "$rel" 4)"$'\n'
      reftrg+="$rel REFERENCES|$(field "$rel" 6)"$'\n'"$rel TRIGGER|$(field "$rel" 7)"$'\n'
    done
    all_f 'TC-DB-025' 'TRUNCATE on the listed tables' "$truncate_all"
    all_f 'TC-SDB-021' 'TRUNCATE on the store tables' "$truncate_store"
    all_f '-' 'REFERENCES and TRIGGER on the listed tables' "$reftrg"
    for rel in "${!priv[@]}"; do
      [[ ",$expected_tables," == *",$rel,"* ]] || report INFO '-' "table not in issued list: $rel" '-' 'present'
    done
  else malformed '-' 'table privileges'; fi
fi

# Sequences: USAGE and SELECT, no UPDATE
if query '-' 'sequence privileges' \
  "SELECT c.relname, has_sequence_privilege(c.oid, 'USAGE'), has_sequence_privilege(c.oid, 'SELECT'), has_sequence_privilege(c.oid, 'UPDATE') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'S' ORDER BY 1;"; then
  if rows_ok "$out" '^[a-z0-9_]+$' "$tf" "$tf" "$tf"; then
    if [[ -z "$out" ]]; then
      report UNVERIFIED '-' 'sequence USAGE SELECT UPDATE' 't t f on each' 'no sequences found'
    else
      seq_total=0; seq_bad=0
      while IFS='|' read -r rel us se up; do
        [[ -n "$rel" ]] || continue
        seq_total=$((seq_total + 1))
        if [[ "$us $se $up" != 't t f' ]]; then
          seq_bad=$((seq_bad + 1)); report PERMISSION_MISMATCH '-' "sequence $rel USAGE SELECT UPDATE" 't t f' "$us $se $up"
        fi
      done <<<"$out"
      ((seq_bad)) || report PASS '-' 'sequence USAGE SELECT UPDATE' 't t f on each' "all $seq_total"
    fi
  else malformed '-' 'sequence privileges'; fi
fi

# Schema and database: TC-DB-027 (CREATE TABLE denied)
if query 'TC-DB-027' 'schema and database rights' \
  "SELECT has_schema_privilege('public', 'USAGE'), has_schema_privilege('public', 'CREATE'), has_database_privilege(current_database(), 'CREATE'), has_database_privilege(current_database(), 'TEMP');"; then
  if one_row_ok "$out" "$tf" "$tf" "$tf" "$tf"; then
    IFS='|' read -r sch_use sch_create db_create db_temp <<<"$out"
    report INFO '-' 'USAGE on schema public' 'not in issued list' "$sch_use"
    check 'TC-DB-027' 'CREATE TABLE: CREATE on schema public' f "$sch_create"
    check '-' 'CREATE on the database' f "$db_create"
    check '-' 'TEMP on the database' t "$db_temp"
  else malformed 'TC-DB-027' 'schema and database rights'; fi
fi

# Guided extra check, ownership: DROP TABLE (TC-DB-024) and ALTER TABLE (TC-DB-026) need the owner's
# rights. acts_as_owner false on every table means neither is possible; TC-SDB-021 for store tables.
if query 'TC-DB-024' 'ownership of tables and sequences' \
  "SELECT c.relname, c.relkind, pg_has_role(current_user, c.relowner, 'USAGE') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S') ORDER BY 1;"; then
  if rows_ok "$out" '^[a-z0-9_]+$' '^[rpS]$' "$tf"; then
    owner_tables=""; owner_store=""; owner_seqs=""
    while IFS='|' read -r rel kind owner; do
      [[ -n "$rel" ]] || continue
      if [[ "$kind" == S ]]; then owner_seqs+="$rel|$owner"$'\n'; continue; fi
      owner_tables+="$rel|$owner"$'\n'
      [[ " $store_tables " == *" $rel "* ]] && owner_store+="$rel|$owner"$'\n'
    done <<<"$out"
    all_f 'TC-DB-024' 'DROP TABLE possible (acts as owner)' "$owner_tables"
    all_f 'TC-DB-026' 'ALTER TABLE possible (acts as owner)' "$owner_tables"
    all_f 'TC-SDB-021' 'DROP/ALTER on store tables (acts as owner)' "$owner_store"
    all_f '-' 'acts as owner of a sequence' "$owner_seqs"
  else malformed 'TC-DB-024' 'ownership of tables and sequences'; fi
fi

finish
