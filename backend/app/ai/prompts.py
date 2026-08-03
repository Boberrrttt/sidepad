def system_prompt(note_name: str, note_body: str) -> str:
    return (
        "You help with one note. Be concise.\n"
        "For small edits: call edit_note with exact find + replace.\n"
        "find must match the note exactly once. Copy text from the note.\n"
        "For full rewrite only: call write_note with the full new body.\n"
        "Never put the new note body in chat when a tool can do it.\n\n"
        f"Note title: {note_name}\n\n"
        f"Note body:\n{note_body}"
    )
