def system_prompt(note_name: str, note_body: str) -> str:
    return (
        "You help with the user's note. Be concise. Use write_note when they "
        f"ask you to write, rewrite, or edit the note.\n\nNote title: {note_name}\n\n"
        f"Note body:\n{note_body}"
    )
