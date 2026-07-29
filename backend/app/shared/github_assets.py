from urllib.parse import urlparse


def is_github_asset_url(value: str) -> bool:
    try:
        url = urlparse(value)
        if url.scheme != "https":
            return False
        host = (url.hostname or "").lower()
        return host == "github.com" or host.endswith(".githubusercontent.com")
    except Exception:
        return False
