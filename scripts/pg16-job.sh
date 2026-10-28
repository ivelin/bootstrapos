#!/bin/sh
# Throwaway PostgreSQL 16 for one Actions job. No sudo, no docker.
# Binaries live at /usr/lib/postgresql/16/bin. The cluster is local-trust
# on a free localhost port and a socket directory under RUNNER_TEMP.
set -eu

BIN=/usr/lib/postgresql/16/bin
BASE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"
ROOT="$BASE/bos-pg-job"

stop_dir() {
  dir=$1
  if [ -d "$dir" ]; then
    "$BIN/pg_ctl" -D "$dir" -m immediate -w -t 30 stop || true
    rm -rf "$dir"
  fi
}

case "${1:-}" in
  start)
    test -x "$BIN/initdb"
    stop_dir "$ROOT"
    "$BIN/initdb" -D "$ROOT" --auth=trust --username "${USER:-postgres}" --no-instructions
    port=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
    "$BIN/pg_ctl" -D "$ROOT" -w -t 30 -l "$ROOT/server.log" \
      -o "-p $port -k $ROOT -c listen_addresses=" start
    if [ -n "${GITHUB_ENV:-}" ]; then
      printf 'BOS_PG_DIR=%s\nBOS_PG_PORT=%s\n' "$ROOT" "$port" >> "$GITHUB_ENV"
    fi
    echo "PostgreSQL 16 listening on 127.0.0.1:$port socket $ROOT"
    ;;
  stop)
    stop_dir "$ROOT"
    for dir in "$BASE"/bos-pg16-* "$BASE"/bos-self-serve-*; do
      [ -d "$dir" ] || continue
      stop_dir "$dir"
    done
    ;;
  *)
    echo "usage: pg16-job.sh start|stop" >&2
    exit 2
    ;;
esac
