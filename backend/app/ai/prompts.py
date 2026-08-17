def system_prompt(note_name: str, note_body: str, note_board: str) -> str:
    board = note_board.strip() or "(empty)"

    return (
        "You help with one note and its kanban board. Be concise.\n"
        "For small note edits: call edit_note with exact find + replace.\n"
        "For full note rewrite only: call write_note with the full new body.\n"
        "For small board edits: call edit_board with exact find + replace on the board JSON.\n"
        "For full board rewrite only: call write_board with full board JSON.\n"
        "find must match exactly once. Copy text from the note or board.\n"
        "Never put the new note body or board JSON in chat when a tool can do it.\n\n"
        f"Note title: {note_name}\n\n"
        f"Note body:\n{note_body}\n\n"
        f"Board JSON:\n{board}"
    )
