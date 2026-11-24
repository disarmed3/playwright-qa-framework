#!/usr/bin/env bash
# Week 3 Task 07: compare the shared database with the approved starting data.
# Expected values: only the seed-facts block of vault/sources/database/starting-data.md (mentor's
# list dated 2026-10-15 and answers of 2026-10-30). No value is repeated here and none is taken from
# a live observation.
#   class drift  -> stock and row counts: a difference is recorded as DRIFT with today's value, never reset
#   class fixed  -> every other fact: a difference is a DATA_MISMATCH (the check fails; keep the
#                   expected value, record it, tell the mentor, never reset)
#   status other than approved -> UNVERIFIED and not queried
# Every response is checked for shape (column count, whole numbers, t/f) before it is compared; a
# malformed response is a QUERY_ERROR, never a pass, drift or mismatch.
#
# Read-only: SELECT, aggregate counts and non-personal store values only; users only in count(*) and
# id joins. The session runs with default_transaction_read_only. No write, no DDL, no reset.
# Connection: STUDENT_DATABASE_URL from the environment, else only that key from .env (CR stripped).
# Never printed: the connection value, host, role name or raw psql error text.
#
# Usage, from the repository root:
#   bash scripts/seed-integrity.sh                                               (Git Bash)
#   & "C:\Program Files\Git\bin\bash.exe" scripts/seed-integrity.sh              (PowerShell)
# Plain `bash` in PowerShell starts WSL, which cannot run the Windows psql.
# PSQL=<path> overrides the psql binary (default: psql on PATH, else PostgreSQL 17's default path).
#
# Exit: 0 pass (DRIFT and INFO allowed), 1 data mismatch, 2 permission mismatch (a read refused),
# 3 query error or malformed response, 4 connection failure, 5 unverified.
# Several outcomes: 4 > 3 > 2 > 1 > 5. Case IDs: vault/sources/test-catalog/db.md.

set -u -o pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
facts_file="$repo_root/vault/sources/database/starting-data.md"
today="$(date -u +%Y-%m-%d)"

declare -A n=([PASS]=0 [INFO]=0 [DRIFT]=0 [DATA_MISMATCH]=0 [PERMISSION_MISMATCH]=0
  [QUERY_ERROR]=0 [CONNECTION_FAILURE]=0 [UNVERIFIED]=0)

emit() { # status ref check left-label left right-label right [note]
  n[$1]=$((${n[$1]} + 1))
  printf '%-19s %-10s %-50s %-8s %-28s %-8s %s%s\n' "$1" "$2" "$3" "$4" "$5" "$6" "$7" "${8:+  ($8)}"
}
report() { emit "$1" "$2" "$3" expected "$4" observed "$5" "${6:-}"; }

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

judge() { # class ref check expected observed
  if [[ "$5" == "$4" ]]; then report PASS "$2" "$3" "$4" "$5"
  elif [[ "$1" == drift && "$5" != missing ]]; then report DRIFT "$2" "$3" "$4" "$5" 'recorded, never reset'
  else report DATA_MISMATCH "$2" "$3" "$4" "$5" 'record it, keep the expected value, never reset'
  fi
}

judge_count() { # class ref check start today-value
  if [[ "$1" != drift ]]; then judge "$@"; return; fi
  if [[ "$5" == "$4" ]]; then emit PASS "$2" "$3" starting "$4" today "$5 ($today)"
  else emit DRIFT "$2" "$3" starting "$4" today "$5 ($today)" 'normal use; recorded, never reset'
  fi
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

malformed() { report QUERY_ERROR "$1" "$2" 'well-formed response' 'malformed response'; }

# --- seed facts --------------------------------------------------------------------------------
facts=""
if [[ -f "$facts_file" ]]; then
  facts="$(sed -n '/^```seed-facts$/,/^```$/p' "$facts_file" | sed '1d;$d' | tr -d '\r' | grep -v -e '^#' -e '^$')"
fi

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

sq_list() { # word... -> 'a', 'b'   (callers validate the words; none contains a quote)
  local w s=""
  for w in "$@"; do s+="${s:+, }'$w'"; done
  printf '%s' "$s"
}

count_sql() {
  case "$1" in
    users | categories | articles | comments | products | product_variants | coupons | carts | \
      cart_items | orders | order_items | payments) printf 'SELECT count(*) FROM %s' "$1" ;;
    articles.published) printf "SELECT count(*) FROM articles WHERE status = 'published'" ;;
    articles.draft) printf "SELECT count(*) FROM articles WHERE status = 'draft'" ;;
    *) return 1 ;;
  esac
}

count_ref() {
  case "$1" in
    users | categories | articles | articles.* | comments) printf 'TC-DB-001' ;;
    products | product_variants | coupons) printf 'TC-SDB-001' ;;
    *) printf -- '-' ;;
  esac
}

known_table() {
  case "$1" in
    users | categories | articles | comments | products | product_variants | coupons | carts | \
      cart_items | orders | order_items | payments) return 0 ;;
    *) return 1 ;;
  esac
}

slug_re='^[a-z0-9-]+$'
code_re='^[A-Z0-9]+$'
label_re='^[A-Za-z0-9 ._-]+$'
orphan_re='^([a-z_]+)[.]([a-z_]+)[>]([a-z_]+)[.]([a-z_]+)$'

printf 'seed-integrity  target=dev (mentor-confirmed 2026-10-29)  run=%s  baseline=starting-data 2026-10-15, answers 2026-10-30\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ -z "$facts" ]]; then
  report UNVERIFIED '-' 'seed facts (starting-data.md)' 'a seed-facts block' 'missing'; finish
fi
if [[ -z "$url" ]]; then
  report CONNECTION_FAILURE '-' 'connection setting' 'STUDENT_DATABASE_URL set' 'missing'; finish
fi
if [[ ! -x "$psql_bin" ]] && ! command -v "$psql_bin" >/dev/null 2>&1; then
  report CONNECTION_FAILURE '-' 'psql binary' 'found' 'missing'; finish
fi

# --- sort approved facts by check type ---------------------------------------------------------
tables_exp=""; tables_cls=""
count_keys=(); declare -A count_exp=() count_cls=()
vcount_slugs=(); declare -A vcount_exp=() vcount_cls=()
price_slugs=(); declare -A price_exp=() price_cls=()
active_slugs=(); declare -A active_exp=() active_cls=()
zero_keys=(); declare -A zero_exp=() zero_cls=()
avail_exp=""; avail_cls=""
coupon_codes=(); declare -A coupon_exp=() coupon_cls=()
expired_codes=(); declare -A expired_exp=() expired_cls=()
orphan_keys=(); declare -A orphan_exp=() orphan_cls=()

while IFS='|' read -r chk key expected class status extra; do
  [[ -n "$chk" ]] || continue
  if [[ -n "$extra" || -z "$key" || -z "$expected" || ! "$class" =~ ^(drift|fixed)$ ]]; then
    report UNVERIFIED '-' "seed-facts row: $chk" 'check|key|expected|class|status' 'malformed row'
    continue
  fi
  if [[ "$status" != approved ]]; then
    report UNVERIFIED '-' "$chk $key" "$expected" 'not queried' "baseline $status"
    continue
  fi
  valid=1
  case "$chk" in
    tables) tables_exp="$expected"; tables_cls="$class" ;;
    count)
      if count_sql "$key" >/dev/null; then count_keys+=("$key"); count_exp[$key]="$expected"; count_cls[$key]="$class"
      else valid=0; fi ;;
    variant_count)
      if [[ "$key" =~ $slug_re ]]; then vcount_slugs+=("$key"); vcount_exp[$key]="$expected"; vcount_cls[$key]="$class"
      else valid=0; fi ;;
    price)
      if [[ "$key" =~ $slug_re ]]; then price_slugs+=("$key"); price_exp[$key]="$expected"; price_cls[$key]="$class"
      else valid=0; fi ;;
    active)
      if [[ "$key" =~ $slug_re ]]; then active_slugs+=("$key"); active_exp[$key]="$expected"; active_cls[$key]="$class"
      else valid=0; fi ;;
    stock_zero)
      if [[ "${key%%:*}" =~ $slug_re && "${key#*:}" =~ $label_re && "$key" == *:* ]]; then
        zero_keys+=("$key"); zero_exp[$key]="$expected"; zero_cls[$key]="$class"
      else valid=0; fi ;;
    stock_available) avail_exp="$expected"; avail_cls="$class" ;;
    coupon)
      if [[ "$key" =~ $code_re ]]; then coupon_codes+=("$key"); coupon_exp[$key]="$expected"; coupon_cls[$key]="$class"
      else valid=0; fi ;;
    coupon_expired)
      if [[ "$key" =~ $code_re ]]; then expired_codes+=("$key"); expired_exp[$key]="$expected"; expired_cls[$key]="$class"
      else valid=0; fi ;;
    orphans)
      if [[ "$key" =~ $orphan_re ]] && known_table "${BASH_REMATCH[1]}" &&
        known_table "${BASH_REMATCH[3]}"; then
        orphan_keys+=("$key"); orphan_exp[$key]="$expected"; orphan_cls[$key]="$class"
      else valid=0; fi ;;
    *) report UNVERIFIED '-' "$chk $key" "$expected" 'not queried' 'no check implemented for this type'; continue ;;
  esac
  ((valid)) || report UNVERIFIED '-' "$chk $key" "$expected" 'not queried' 'key not accepted by the script'
done <<<"$facts"

if query '-' 'session is read-only' "SELECT current_setting('transaction_read_only');"; then
  if ! rows_ok "$out" '^(on|off)$' || [[ "$out" != on ]]; then
    report UNVERIFIED '-' 'session is read-only (script safety)' on "${out:-none}"; finish
  fi
fi

# --- table set ---------------------------------------------------------------------------------
if [[ -n "$tables_exp" ]] && query 'TC-DB-001' 'table set (schema public)' \
  "SELECT coalesce(string_agg(c.relname, ',' ORDER BY c.relname), '') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');"; then
  if rows_ok "$out" '^[a-z0-9_,]+$' && [[ -n "$out" && "$out" != *$'\n'* ]]; then
    judge "$tables_cls" 'TC-DB-001' 'table set (schema public)' "$tables_exp" "$out"
  else malformed 'TC-DB-001' 'table set (schema public)'; fi
fi

# --- row counts (starting count vs today's count) ----------------------------------------------
union=""
for key in "${count_keys[@]}"; do union+="${union:+ UNION ALL }SELECT '$key', ($(count_sql "$key"))"; done
for slug in "${vcount_slugs[@]}"; do
  union+="${union:+ UNION ALL }SELECT 'variants:$slug', (SELECT count(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug = '$slug')"
done
if [[ -n "$union" ]] && query '-' 'row counts' "$union;"; then
  if rows_ok "$out" '^[a-z0-9_.:-]+$' '^[0-9]+$'; then
    declare -A counted=()
    while IFS='|' read -r key value; do [[ -n "$key" ]] && counted[$key]="$value"; done <<<"$out"
    for key in "${count_keys[@]}"; do
      judge_count "${count_cls[$key]}" "$(count_ref "$key")" "count $key" "${count_exp[$key]}" "${counted[$key]:-missing}"
    done
    for slug in "${vcount_slugs[@]}"; do
      judge_count "${vcount_cls[$slug]}" 'TC-SDB-002' "variants of $slug" "${vcount_exp[$slug]}" "${counted[variants:$slug]:-missing}"
    done
  else malformed '-' 'row counts'; fi
fi

# --- prices and active flags -------------------------------------------------------------------
declare -A seen=(); product_slugs=()
for slug in "${price_slugs[@]}" "${active_slugs[@]}"; do
  [[ -n "${seen[$slug]:-}" ]] || { seen[$slug]=1; product_slugs+=("$slug"); }
done
if ((${#product_slugs[@]})) && query 'TC-SDB-002' 'prices and active flags' \
  "SELECT slug, price_cents, active FROM products WHERE slug IN ($(sq_list "${product_slugs[@]}")) ORDER BY slug;"; then
  if rows_ok "$out" "$slug_re" '^[0-9]+$' '^[tf]$'; then
    declare -A price_obs=() active_obs=()
    while IFS='|' read -r slug price active; do
      [[ -n "$slug" ]] && { price_obs[$slug]="$price"; active_obs[$slug]="$active"; }
    done <<<"$out"
    for slug in "${price_slugs[@]}"; do
      judge "${price_cls[$slug]}" 'TC-SDB-002' "price_cents $slug" "${price_exp[$slug]}" "${price_obs[$slug]:-missing}"
    done
    for slug in "${active_slugs[@]}"; do
      judge "${active_cls[$slug]}" 'TC-SDB-002' "active $slug" "${active_exp[$slug]}" "${active_obs[$slug]:-missing}"
    done
  else malformed 'TC-SDB-002' 'prices and active flags'; fi
fi

# --- stock: sold-out variants, then every other variant of the priced products ----------------
zero_slugs=(); excl=""
for key in "${zero_keys[@]}"; do
  zero_slugs+=("${key%%:*}")
  excl+="${excl:+ OR }(p.slug = '${key%%:*}' AND v.label = '${key#*:}')"
done
if ((${#zero_keys[@]})) && query 'TC-SDB-002' 'sold-out variants' \
  "SELECT p.slug, v.label, v.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug IN ($(sq_list "${zero_slugs[@]}")) ORDER BY 1, 2;"; then
  if rows_ok "$out" "$slug_re" '^.+$' '^[0-9]+$'; then
    declare -A stock_obs=()
    while IFS='|' read -r slug label stock; do [[ -n "$slug" ]] && stock_obs[$slug:$label]="$stock"; done <<<"$out"
    for key in "${zero_keys[@]}"; do
      judge "${zero_cls[$key]}" 'TC-SDB-002' "stock $key" "${zero_exp[$key]}" "${stock_obs[$key]:-missing}"
    done
  else malformed 'TC-SDB-002' 'sold-out variants'; fi
fi
if [[ -n "$avail_exp" ]]; then
  if ((${#price_slugs[@]} == 0)); then
    report UNVERIFIED '-' 'stock > 0 on available variants' "$avail_exp" 'not queried' 'no priced products'
  elif query '-' 'stock > 0 on available variants' \
    "SELECT count(*) FILTER (WHERE v.stock > 0), count(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.slug IN ($(sq_list "${price_slugs[@]}"))${excl:+ AND NOT ($excl)};"; then
    if rows_ok "$out" '^[0-9]+$' '^[0-9]+$' && [[ -n "$out" ]]; then
      IFS='|' read -r positive total <<<"$out"
      if ((total == 0)); then
        report UNVERIFIED '-' 'stock > 0 on available variants' "$avail_exp on each" 'no variants found'
      elif ((positive == total)); then
        report PASS '-' 'stock > 0 on available variants' "$avail_exp on each" "all $total"
      elif [[ "$avail_cls" == drift ]]; then
        report DRIFT '-' 'stock > 0 on available variants' "$avail_exp on each" "$((total - positive)) of $total at 0" 'recorded, never reset'
      else
        report DATA_MISMATCH '-' 'stock > 0 on available variants' "$avail_exp on each" "$((total - positive)) of $total at 0"
      fi
    else malformed '-' 'stock > 0 on available variants'; fi
  fi
fi

# --- coupons -----------------------------------------------------------------------------------
declare -A seen_code=(); all_codes=()
for code in "${coupon_codes[@]}" "${expired_codes[@]}"; do
  [[ -n "${seen_code[$code]:-}" ]] || { seen_code[$code]=1; all_codes+=("$code"); }
done
coupon_sql="$(cat <<'SQL'
SELECT code, kind, value, min_subtotal_cents, active,
       coalesce(to_char(expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'NULL'),
       coalesce((expires_at < now())::text, 'NULL')
FROM coupons WHERE code IN (__CODES__) ORDER BY code;
SQL
)"
if ((${#all_codes[@]})) && query 'TC-SDB-002' 'coupon terms' "${coupon_sql/__CODES__/$(sq_list "${all_codes[@]}")}"; then
  if rows_ok "$out" "$code_re" '^[a-z]+$' '^[0-9]+$' '^[0-9]+$' '^[tf]$' \
    '^(NULL|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)$' '^(true|false|NULL)$'; then
    declare -A terms_obs=() expired_obs=()
    while IFS='|' read -r code kind value minimum active expires expired; do
      [[ -n "$code" ]] && { terms_obs[$code]="$kind,$value,$minimum,$active,$expires"; expired_obs[$code]="$expired"; }
    done <<<"$out"
    for code in "${coupon_codes[@]}"; do
      judge "${coupon_cls[$code]}" 'TC-SDB-002' "coupon $code (kind,value,min,active,expires)" "${coupon_exp[$code]}" "${terms_obs[$code]:-missing}"
    done
    for code in "${expired_codes[@]}"; do
      judge "${expired_cls[$code]}" 'TC-SDB-002' "coupon $code expires_at in the past" "${expired_exp[$code]}" "${expired_obs[$code]:-missing}"
    done
  else malformed 'TC-SDB-002' 'coupon terms'; fi
fi

# --- relationships: orphan rows (non-NULL child values only) -----------------------------------
union=""
for key in "${orphan_keys[@]}"; do
  [[ "$key" =~ $orphan_re ]]
  union+="${union:+ UNION ALL }SELECT '$key', (SELECT count(*) FROM ${BASH_REMATCH[1]} c WHERE c.${BASH_REMATCH[2]} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${BASH_REMATCH[3]} p WHERE p.${BASH_REMATCH[4]} = c.${BASH_REMATCH[2]}))"
done
if [[ -n "$union" ]] && query '-' 'orphan rows' "$union;"; then
  if rows_ok "$out" '^[a-z_.>]+$' '^[0-9]+$'; then
    declare -A orphan_obs=()
    while IFS='|' read -r key value; do [[ -n "$key" ]] && orphan_obs[$key]="$value"; done <<<"$out"
    for key in "${orphan_keys[@]}"; do
      case "${key%%.*}" in articles | comments) ref='TC-DB-002' ;; *) ref='TC-SDB-003' ;; esac
      judge "${orphan_cls[$key]}" "$ref" "orphans $key" "${orphan_exp[$key]}" "${orphan_obs[$key]:-missing}"
    done
  else malformed '-' 'orphan rows'; fi
fi

finish
