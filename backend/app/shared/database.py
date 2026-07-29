import os
from typing import Any

from libsql_client import ClientSync, create_client_sync

_client: ClientSync | None = None
_schema_ready: bool = False


def get_client() -> ClientSync:
    global _client

    if _client is not None:
        return _client

    url = str(os.environ.get("TURSO_DATABASE_URL") or "").strip()
    auth_token = str(os.environ.get("TURSO_AUTH_TOKEN") or "").strip()

    if not url:
        raise RuntimeError("Set TURSO_DATABASE_URL")

    _client = create_client_sync(url=url, auth_token=auth_token or None)
    return _client


def close_client() -> None:
    global _client, _schema_ready

    if _client is not None:
        _client.close()
        _client = None
        _schema_ready = False


def ensure_schema() -> None:
    global _schema_ready

    if _schema_ready:
        return

    db = get_client()

    accounts_info = db.execute("PRAGMA table_info(accounts)")
    account_cols = [str(row["name"]) for row in accounts_info.rows]

    if not account_cols:
        users_info = db.execute("PRAGMA table_info(users)")

        if users_info.rows:
            db.execute("ALTER TABLE users RENAME TO accounts")
            account_cols = [str(row["name"]) for row in users_info.rows]

    if account_cols and "username" not in account_cols:
        db.execute("DROP TABLE IF EXISTS accounts")

    db.execute(
        """CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )"""
    )

    notes_info = db.execute("PRAGMA table_info(notes)")
    note_cols = [str(row["name"]) for row in notes_info.rows]
    dropped_legacy = len(note_cols) > 0 and "user_id" not in note_cols

    if dropped_legacy:
        db.execute("DROP TABLE IF EXISTS notes")
        db.execute("DROP TABLE IF EXISTS chats")

    db.execute(
        """CREATE TABLE IF NOT EXISTS notes (
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      board TEXT NOT NULL DEFAULT '',
      mtime INTEGER NOT NULL,
      PRIMARY KEY (user_id, name)
    )"""
    )

    if note_cols and not dropped_legacy and "board" not in note_cols:
        db.execute(
            "ALTER TABLE notes ADD COLUMN board TEXT NOT NULL DEFAULT ''"
        )

    db.execute(
        """CREATE TABLE IF NOT EXISTS chats (
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      messages TEXT NOT NULL DEFAULT '[]',
      mtime INTEGER NOT NULL,
      PRIMARY KEY (user_id, name)
    )"""
    )

    db.execute(
        """CREATE TABLE IF NOT EXISTS github_tokens (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      token_enc TEXT NOT NULL,
      PRIMARY KEY (user_id, project_id)
    )"""
    )

    _schema_ready = True


def row_get(row: Any, key: str) -> Any:
    return row[key]
