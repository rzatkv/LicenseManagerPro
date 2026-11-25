"""Self-update from GitHub releases (v2.2).

- GET /api/system/update-check: live call to the GitHub releases API,
  compared with APP_VERSION. A GitHub failure is reported, never raised.
- POST /api/system/update: downloads the latest release tarball into
  ./updates/ (staged, never overwriting live code) and verifies it is a
  gzip tarball. The actual apply is done by scripts/update.sh, which the
  backend only executes when LMP_ALLOW_SELF_UPDATE=1; otherwise the admin
  runs it by hand (the UI shows the one command).

`create_github_client` is a module-level factory so tests can monkeypatch
it with a MockTransport client instead of hitting the real GitHub API.
"""
import logging
import re
import subprocess
import tarfile
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from config import (
    APP_VERSION,
    GITHUB_API_BASE_URL,
    GITHUB_RAW_BASE_URL,
    GITHUB_REPO,
    LMP_ALLOW_SELF_UPDATE,
)

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parents[2]
UPDATES_DIR = REPO_ROOT / "updates"
UPDATE_SCRIPT = REPO_ROOT / "scripts" / "update.sh"

GITHUB_TIMEOUT_SECONDS = 10.0
DOWNLOAD_TIMEOUT_SECONDS = 60.0


def create_github_client(timeout: float = GITHUB_TIMEOUT_SECONDS) -> httpx.Client:
    # trust_env=False: same proxy-env crash as the webhook fix (v2.0) —
    # a host no_proxy entry such as bare "[::1]" makes httpx raise
    # InvalidURL at client construction.
    return httpx.Client(timeout=timeout, trust_env=False)


def parse_version(value: str) -> tuple[int, ...]:
    """'v2.1.1' -> (2, 1, 1); unparsable parts become 0."""
    clean = (value or "").strip().lstrip("vV")
    clean = re.split(r"[-+]", clean, maxsplit=1)[0]
    parts = []
    for chunk in clean.split("."):
        try:
            parts.append(int(chunk))
        except ValueError:
            parts.append(0)
    return tuple(parts) if parts else (0,)


def fetch_latest_release(repo: str = GITHUB_REPO) -> dict:
    """Call the GitHub releases API; returns a dict with either the
    release fields or an 'error' key. Never raises."""
    try:
        with create_github_client() as client:
            response = client.get(f"{GITHUB_API_BASE_URL}/repos/{repo}/releases/latest")
        if response.status_code != 200:
            return {"error": f"GitHub API returned HTTP {response.status_code}"}
        data = response.json()
        return {
            "latest_version": (data.get("tag_name") or "").lstrip("vV") or None,
            "release_url": data.get("html_url"),
            "release_notes": data.get("body"),
            "published_at": data.get("published_at"),
            "tarball_url": data.get("tarball_url"),
        }
    except Exception as exc:
        logger.warning("GitHub update check failed: %s", exc)
        return {"error": str(exc)}


def check_update(db: Session | None = None, repo: str = GITHUB_REPO) -> dict:
    """Current vs latest release; update_available is False on any error."""
    current = APP_VERSION
    release = fetch_latest_release(repo)
    if release.get("error") or not release.get("latest_version"):
        return {
            "current_version": current,
            "latest_version": None,
            "update_available": False,
            "release_url": None,
            "release_notes": None,
            "published_at": None,
            "error": release.get("error") or "No release found",
        }
    latest = release["latest_version"]
    return {
        "current_version": current,
        "latest_version": latest,
        "update_available": parse_version(latest) > parse_version(current),
        "release_url": release.get("release_url"),
        "release_notes": release.get("release_notes"),
        "published_at": release.get("published_at"),
        "error": None,
    }


def fetch_modules_manifest(repo: str = GITHUB_REPO) -> dict:
    """The repo's modules.json (module versions) from GitHub raw content.
    Returns {} on any failure."""
    try:
        with create_github_client() as client:
            response = client.get(
                f"{GITHUB_RAW_BASE_URL}/{repo}/main/modules.json"
            )
        if response.status_code != 200:
            return {}
        data = response.json()
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning("Could not fetch modules.json: %s", exc)
        return {}


def stage_update(repo: str = GITHUB_REPO) -> dict:
    """Download the latest release tarball into ./updates/.

    Returns {staged, version, file, next_step, auto_applied}. Raises
    ValueError with a human message when no update is available or the
    download is not a valid tarball.
    """
    release = fetch_latest_release(repo)
    if release.get("error") or not release.get("latest_version"):
        raise ValueError(release.get("error") or "No release found on GitHub")
    latest = release["latest_version"]
    if parse_version(latest) <= parse_version(APP_VERSION):
        raise ValueError(f"Already up to date (running {APP_VERSION})")
    # The version string comes from GitHub (repo-owner controlled) but is
    # used in a filename: allow only safe characters so a crafted tag
    # can never escape the updates directory.
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", latest or ""):
        raise ValueError(f"Refusing to stage a release with an unsafe version: {latest!r}")
    tarball_url = release.get("tarball_url")
    if not tarball_url:
        raise ValueError("The latest GitHub release has no tarball to download")

    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    target = UPDATES_DIR / f"license-manager-pro-{latest}.tar.gz"
    try:
        with create_github_client(timeout=DOWNLOAD_TIMEOUT_SECONDS) as client:
            with client.stream("GET", tarball_url) as response:
                if response.status_code != 200:
                    raise ValueError(
                        f"Tarball download failed (HTTP {response.status_code})"
                    )
                with open(target, "wb") as fh:
                    for chunk in response.iter_bytes(chunk_size=65536):
                        fh.write(chunk)
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Tarball download failed: {exc}") from exc

    # Verify it is really a gzip tarball before calling it "staged".
    # (GitHub's auto-generated tarballs carry no published checksum, so
    # there is no hash to compare against — gzip + tar validity over
    # HTTPS from the releases API is the verification available here.)
    try:
        with open(target, "rb") as fh:
            if fh.read(2) != b"\x1f\x8b":
                raise ValueError("Downloaded file is not a gzip tarball")
        with tarfile.open(target, "r:gz") as tf:
            for member in tf.getmembers():
                # A crafted archive must not escape the extract directory
                # (absolute paths or ".." members) or contain device files.
                if member.name.startswith(("/", "\\")) or ".." in Path(member.name).parts:
                    raise ValueError(f"Tarball contains an unsafe member: {member.name!r}")
                if member.isdev() or member.issym() or member.islnk():
                    raise ValueError(f"Tarball contains a non-regular member: {member.name!r}")
    except ValueError:
        target.unlink(missing_ok=True)
        raise

    next_step = f"bash {UPDATE_SCRIPT} {target}"
    auto_applied = False
    if LMP_ALLOW_SELF_UPDATE and UPDATE_SCRIPT.exists():
        try:
            subprocess.Popen(
                ["bash", str(UPDATE_SCRIPT), str(target)],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            auto_applied = True
            next_step = "Update is being applied in the background; the service restarts itself."
        except Exception as exc:
            logger.warning("Could not auto-apply update: %s", exc)
    elif not UPDATE_SCRIPT.exists():
        next_step = (
            f"Apply it with the update script once it exists: bash scripts/update.sh {target}"
        )

    return {
        "staged": True,
        "version": latest,
        "file": str(target),
        "next_step": next_step,
        "auto_applied": auto_applied,
    }
