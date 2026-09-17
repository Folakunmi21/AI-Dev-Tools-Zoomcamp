"""Password hashing and bearer-token authentication."""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import StoredUser, User

bearer = HTTPBearer(auto_error=False)


def _store():
    # Imported lazily because the store seeds users using hash_password.
    from .store import store
    return store


def now() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return "scrypt$" + base64.urlsafe_b64encode(salt).decode() + "$" + base64.urlsafe_b64encode(digest).decode()


def verify_password(password: str, encoded: str) -> bool:
    try:
        _, salt_text, digest_text = encoded.split("$", 2)
        salt = base64.urlsafe_b64decode(salt_text.encode())
        expected = base64.urlsafe_b64decode(digest_text.encode())
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def public_user(user: StoredUser) -> User:
    return User.model_validate(user.model_dump(exclude={"passwordHash"}))


def issue_token(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    _store().data.tokens[token] = user_id
    return token


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> StoredUser | None:
    if credentials is None:
        return None
    data = _store().data
    user_id = data.tokens.get(credentials.credentials)
    return data.users.get(user_id) if user_id else None


def require_user(user: StoredUser | None = Depends(current_user)) -> StoredUser:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to continue.")
    return user


def validate_registration(name: str, email: str, password: str) -> None:
    if not name.strip():
        raise HTTPException(status_code=422, detail="Enter your name.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="Use a password of at least 8 characters.")
