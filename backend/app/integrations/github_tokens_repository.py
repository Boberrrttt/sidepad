from app.shared import database
from app.integrations.helpers.token_crypto import decrypt_token, encrypt_token


def upsert_github_token(user_id: str, project_id: str, token: str) -> None:
    database.ensure_schema()
    database.get_client().execute(
        """INSERT INTO github_tokens (user_id, project_id, token_enc)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, project_id) DO UPDATE SET
              token_enc = excluded.token_enc""",
        [user_id, project_id, encrypt_token(token)],
    )


def read_github_token(user_id: str, project_id: str) -> str | None:
    database.ensure_schema()
    result = database.get_client().execute(
        """SELECT token_enc FROM github_tokens
            WHERE user_id = ? AND project_id = ?""",
        [user_id, project_id],
    )
    row = result.rows[0] if result.rows else None
    encrypted = str((row["token_enc"] if row else "") or "").strip()

    if not encrypted:
        return None

    return decrypt_token(encrypted)


def delete_github_token(user_id: str, project_id: str) -> None:
    database.ensure_schema()
    database.get_client().execute(
        "DELETE FROM github_tokens WHERE user_id = ? AND project_id = ?",
        [user_id, project_id],
    )


def require_stored_github_token(user_id: str, project_id: str) -> str:
    token = read_github_token(user_id, project_id)

    if not token:
        raise RuntimeError("GitHub not connected. Reconnect with a PAT.")

    return token
