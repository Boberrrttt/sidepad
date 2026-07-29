import os
from base64 import b64decode, b64encode

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

_cached_key: bytes | None = None


def _get_key() -> bytes:
    global _cached_key

    if _cached_key is not None:
        return _cached_key

    secret = str(
        os.environ.get("GITHUB_TOKEN_SECRET")
        or os.environ.get("SESSION_SECRET")
        or ""
    ).strip()

    if not secret:
        raise RuntimeError("Set SESSION_SECRET")

    kdf = Scrypt(
        salt=b"sidepad-github-token",
        length=32,
        n=16384,
        r=8,
        p=1,
    )
    _cached_key = kdf.derive(secret.encode("utf-8"))
    return _cached_key


def encrypt_token(plain: str) -> str:
    iv = os.urandom(12)
    aesgcm = AESGCM(_get_key())
    ciphertext_and_tag = aesgcm.encrypt(iv, plain.encode("utf-8"), None)
    encrypted = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]
    return b64encode(iv + tag + encrypted).decode("ascii")


def decrypt_token(payload: str) -> str:
    raw = b64decode(payload)
    iv = raw[:12]
    tag = raw[12:28]
    data = raw[28:]
    aesgcm = AESGCM(_get_key())
    return aesgcm.decrypt(iv, data + tag, None).decode("utf-8")
