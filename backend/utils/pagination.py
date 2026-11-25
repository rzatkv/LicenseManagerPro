"""Shared pagination helper.

Every list endpoint takes optional ``skip`` (default 0) and ``limit``
(default 100, clamped to a maximum of 100) query params and always sets
the ``X-Total-Count`` response header to the total number of matching rows
before slicing. Response bodies are unchanged (plain JSON arrays, except
/api/api-keys which keeps its {"total", "api_keys"} object).
"""
from typing import NamedTuple

from fastapi import Query, Response

MAX_LIMIT = 100
DEFAULT_LIMIT = 100


class Pagination(NamedTuple):
    skip: int
    limit: int


def pagination_params(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=DEFAULT_LIMIT, ge=1),
) -> Pagination:
    """FastAPI dependency: parsed + clamped skip/limit pair."""
    return Pagination(skip=skip, limit=min(limit, MAX_LIMIT))


def _set_total(response: Response, total: int) -> None:
    response.headers["X-Total-Count"] = str(total)


def paginate_query(query, response: Response, page: Pagination):
    """Paginate a SQLAlchemy query; returns the sliced rows."""
    total = query.count()
    items = query.offset(page.skip).limit(page.limit).all()
    _set_total(response, total)
    return items


def paginate_list(items: list, response: Response, page: Pagination) -> list:
    """Paginate an already-materialised list; returns the slice."""
    total = len(items)
    sliced = items[page.skip : page.skip + page.limit]
    _set_total(response, total)
    return sliced
