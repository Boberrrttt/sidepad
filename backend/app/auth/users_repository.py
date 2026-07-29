from app.shared import database


def insert_user(
    user_id: str, username: str, password_hash: str, created_at: int
) -> None:
    database.ensure_schema()
    database.get_client().execute(
        "INSERT INTO accounts (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
        [user_id, username, password_hash, created_at],
    )


def find_user_by_username(username: str) -> dict[str, str] | None:
    database.ensure_schema()
    result = database.get_client().execute(
        "SELECT id, password_hash FROM accounts WHERE username = ?",
        [username],
    )
    row = result.rows[0] if result.rows else None

    if not row:
        return None

    return {
        "id": str(row["id"]),
        "password_hash": str(row["password_hash"]),
    }
