def system_prompt(note_name: str, note_body: str, _note_board: str) -> str:
    return (
        "You help with one note. Be concise.\n"
        "For small note edits: call edit_note with exact find + replace.\n"
        "For full note rewrite only: call write_note with the full new body.\n"
        "find must match exactly once. Copy text from the note.\n"
        "Never put the new note body in chat when a tool can do it.\n"
        "If asked to create, update, move, or delete kanban board cards or columns, "
        "reply that Ask cannot edit boards yet and they can edit the board in Board view.\n\n"
        f"Note title: {note_name}\n\n"
        f"Note body:\n{note_body}"
    )
