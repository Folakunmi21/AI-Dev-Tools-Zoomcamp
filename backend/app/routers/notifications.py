from fastapi import APIRouter, Depends, HTTPException
from ..auth import current_user, require_user
from ..models import AppNotification, UnreadCount
from ..store import store, utcnow

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=list[AppNotification])
def list_notifications(user=Depends(require_user)):
    return sorted([n for n in store.data.notifications.values() if n.userId == user.id], key=lambda n: n.createdAt, reverse=True)

@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user=Depends(current_user)):
    # This endpoint deliberately remains guest-safe, like the frontend mock.
    return UnreadCount(count=sum(1 for n in store.data.notifications.values() if user and n.userId == user.id and n.readAt is None))

@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: str, user=Depends(require_user)):
    n = store.data.notifications.get(notification_id)
    if not n or n.userId != user.id: raise HTTPException(404, "That notification could not be found.")
    n.readAt = n.readAt or utcnow()

@router.post("/read-all", status_code=204)
def mark_all_read(user=Depends(require_user)):
    for n in store.data.notifications.values():
        if n.userId == user.id and n.readAt is None: n.readAt = utcnow()
