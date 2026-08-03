from app.notes.helpers.safe_name import safe_name
from app.shared.exceptions import DomainError


def _assert_bad(name: str) -> None:
    try:
        safe_name(name)
    except DomainError:
        return
    raise AssertionError(f"expected bad note name: {name!r}")


assert safe_name("Ideas") == "Ideas"
assert safe_name("Work/Q1/Ideas") == "Work/Q1/Ideas"
assert safe_name("  Work / Q1 / Ideas.md  ") == "Work/Q1/Ideas"
assert safe_name("Work\\Q1\\Ideas") == "Work/Q1/Ideas"

_assert_bad("")
_assert_bad("/")
_assert_bad("/Work")
_assert_bad("Work/")
_assert_bad("Work//Ideas")
_assert_bad("Work/../Ideas")
_assert_bad("Work/./Ideas")
_assert_bad("..")

print("safe_name ok")
