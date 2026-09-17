from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials

from ..auth import bearer, current_user, hash_password, issue_token, public_user, validate_registration, verify_password
from ..models import LoginInput, RegisterInput, Session, StoredUser
from ..store import store, new_id, utcnow

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/session", response_model=Session)
def session(user=Depends(current_user)):
    return Session(user=public_user(user) if user else None)


@router.post("/register", response_model=Session)
def register(value: RegisterInput):
    validate_registration(value.name, value.email, value.password)
    email = value.email.strip().lower()
    if any(u.email.lower() == email for u in store.data.users.values()): raise HTTPException(409, "An account already uses that email address.")
    t = utcnow(); user = StoredUser(id=new_id("usr"), name=value.name.strip(), email=email, passwordHash=hash_password(value.password), createdAt=t, updatedAt=t)
    store.data.users[user.id] = user
    return Session(user=public_user(user), **_token_response(user.id))


def _token_response(user_id: str):
    # The response model intentionally stays the frontend-compatible Session;
    # clients obtain the bearer token from this extra response field.
    return {"access_token": issue_token(user_id), "token_type": "bearer"}


@router.post("/login")
def login(value: LoginInput):
    user = next((u for u in store.data.users.values() if u.email.lower() == value.email.strip().lower()), None)
    if not user or not verify_password(value.password, user.passwordHash): raise HTTPException(401, "That email and password do not match.")
    return Session(user=public_user(user), **_token_response(user.id))


@router.post("/logout", status_code=204)
def logout(response: Response, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), user=Depends(current_user)):
    # Bearer tokens are stateless from the client’s perspective; remove the
    # presented token when possible.
    if credentials:
        from ..store import store
        store.data.tokens.pop(credentials.credentials, None)
    return None
