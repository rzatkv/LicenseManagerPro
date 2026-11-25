"""Global search (v2.3): one query across licenses, products and users.

The header search calls GET /api/search?q=... and gets up to 5 matches
per group, each with a link the frontend navigates to. Any authenticated
role may search; results are limited to what that role can see (users
are only returned to admins/managers).
"""

from sqlalchemy.orm import Session

from database import escape_like
from models import License, Product, User
from utils.permissions import user_has_permission

LIMIT = 5


def search_all(db: Session, q: str, current_user: User) -> dict:
    q = (q or "").strip()
    if not q:
        return {"licenses": [], "products": [], "users": []}
    # Escape LIKE wildcards: a search term is a literal string, never a
    # pattern (a query of "%" must not match every row).
    like = f"%{escape_like(q)}%"
    licenses = (
        db.query(License)
        .filter(
            (License.key.like(like, escape="\\"))
            | (License.product.like(like, escape="\\"))
            | (License.owner_email.like(like, escape="\\"))
        )
        .order_by(License.created_at.desc())
        .limit(LIMIT)
        .all()
    )
    products = (
        db.query(Product)
        .filter((Product.name.like(like, escape="\\")) | (Product.slug.like(like, escape="\\")))
        .order_by(Product.name)
        .limit(LIMIT)
        .all()
    )
    users = []
    if user_has_permission(current_user, "users:write") or current_user.role in (
        "admin",
        "manager",
    ):
        users = (
            db.query(User)
            .filter(User.email.like(like, escape="\\"))
            .order_by(User.email)
            .limit(LIMIT)
            .all()
        )
    return {
        "licenses": [
            {
                "type": "license",
                "id": lic.id,
                "title": lic.key,
                "subtitle": lic.product,
                "link": "/licenses",
            }
            for lic in licenses
        ],
        "products": [
            {
                "type": "product",
                "id": p.id,
                "title": p.name,
                "subtitle": p.slug,
                "link": "/products",
            }
            for p in products
        ],
        "users": [
            {
                "type": "user",
                "id": u.id,
                "title": u.email,
                "subtitle": u.role,
                "link": "/users",
            }
            for u in users
        ],
    }
