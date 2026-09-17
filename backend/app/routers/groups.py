import secrets
from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import current_user, require_user, public_user
from ..models import *
from ..store import store, new_id, utcnow
from .common import access, add_activity, balances, group_or_404, members, summary, user_member

router = APIRouter(tags=["Groups", "Invites"])


def uid(user): return user.id if user else None


@router.get("/dashboard", response_model=DashboardData)
def dashboard(user=Depends(current_user)):
    groups = [g for g in store.data.groups.values() if g.kind == "group" and user_member(g.id, uid(user))]
    quick = [g for g in store.data.groups.values() if g.kind == "quick" and (g.ownerId is None or g.ownerId == uid(user))]
    summaries = [summary(g, uid(user)) for g in groups]; quick_summaries = [summary(g, uid(user)) for g in quick]
    totals = MemberDebtSummary(owes=sum(s.viewerDebts.owes for s in summaries if s.viewerDebts), owed=sum(s.viewerDebts.owed for s in summaries if s.viewerDebts), net=0)
    totals.net = totals.owed - totals.owes
    acts = sorted([a for a in store.data.activities.values() if a.groupId in {g.id for g in groups}], key=lambda a: a.createdAt, reverse=True)[:12]
    unread = sum(1 for n in store.data.notifications.values() if user and n.userId == user.id and n.readAt is None)
    return DashboardData(user=public_user(user) if user else None, groups=sorted(summaries, key=lambda s: s.lastActivityAt, reverse=True), quickSplits=quick_summaries, totals=totals, recentActivity=acts, unreadNotifications=unread)


@router.get("/groups", response_model=list[GroupSummary])
def list_groups(user=Depends(current_user)):
    return [summary(g, uid(user)) for g in store.data.groups.values() if g.kind == "group" and user_member(g.id, uid(user))]


@router.post("/groups", response_model=Group, status_code=201)
def create_group(value: CreateGroupInput, user=Depends(require_user)):
    if not value.name.strip(): raise HTTPException(422, "Give the group a name.")
    t = utcnow(); g = Group(id=new_id("grp"), kind="group", name=value.name.strip(), description=value.description.strip(), ownerId=user.id, currency=value.currency, inviteToken=None, createdAt=t, updatedAt=t)
    store.data.groups[g.id] = g
    admin = GroupMember(id=new_id("mbr"), groupId=g.id, userId=user.id, displayName=user.name.split()[0], role="admin", joinedAt=t); store.data.members[admin.id] = admin
    for name in value.memberNames:
        if name.strip():
            m = GroupMember(id=new_id("mbr"), groupId=g.id, userId=None, displayName=name.strip(), role="member", joinedAt=t); store.data.members[m.id] = m
    add_activity(g, admin, "group_created", "group", g.id, f"{admin.displayName} created the group")
    return g


@router.get("/groups/{group_id}", response_model=GroupDetail)
def get_group(group_id: str, user=Depends(current_user)):
    g = group_or_404(group_id); viewer = access(g, uid(user))
    expenses = sorted([e for e in store.data.expenses.values() if e.groupId == g.id and e.deletedAt is None], key=lambda e: (e.expenseDate, e.createdAt), reverse=True)
    return GroupDetail(group=g, members=members(g.id), expenses=expenses, balances=balances(g), settlements=sorted([s for s in store.data.settlements.values() if s.groupId == g.id], key=lambda s: s.paidAt, reverse=True), activities=sorted([a for a in store.data.activities.values() if a.groupId == g.id], key=lambda a: a.createdAt, reverse=True), viewer=viewer)


@router.patch("/groups/{group_id}", response_model=Group)
def update_group(group_id: str, value: UpdateGroupInput, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canEditGroup: raise HTTPException(403, "Only a group admin can edit group details.")
    if value.name is not None:
        if not value.name.strip(): raise HTTPException(422, "Give the group a name.")
        g.name = value.name.strip()
    if value.description is not None: g.description = value.description.strip()
    g.updatedAt = utcnow(); return g


@router.post("/quick-splits", response_model=Group, status_code=201)
def quick_split(value: CreateQuickSplitInput, user=Depends(current_user)):
    names = [n.strip() for n in value.memberNames if n.strip()]
    if len(names) < 2 or len({n.lower() for n in names}) != len(names): raise HTTPException(422, "Add at least two different people.")
    t = utcnow(); g = Group(id=new_id("qsp"), kind="quick", name=value.name or f"Quick Split - {t:%d %b}", description="", ownerId=uid(user), currency="NGN", inviteToken=None, createdAt=t, updatedAt=t); store.data.groups[g.id] = g
    for i, name in enumerate(names):
        m = GroupMember(id=new_id("mbr"), groupId=g.id, userId=uid(user) if i == 0 else None, displayName=name, role="admin" if i == 0 else "member", joinedAt=t); store.data.members[m.id] = m
    return g


@router.post("/groups/{group_id}/save", response_model=Group)
def save_quick(group_id: str, user=Depends(require_user)):
    g = group_or_404(group_id)
    if g.kind != "quick" or (g.ownerId not in (None, user.id)): raise HTTPException(403, "That quick split belongs to someone else.")
    g.kind = "group"; g.ownerId = user.id; g.updatedAt = utcnow(); first = members(g.id)[0]; first.userId = user.id; return g


@router.post("/groups/{group_id}/members", response_model=GroupMember, status_code=201)
def add_member(group_id: str, value: AddMemberInput, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canManageMembers: raise HTTPException(403, "Only a group admin can add members.")
    name = value.displayName.strip()
    if not name: raise HTTPException(422, "Enter a name.")
    if any(m.displayName.lower() == name.lower() for m in members(g.id)): raise HTTPException(409, "That person is already in this group.")
    m = GroupMember(id=new_id("mbr"), groupId=g.id, userId=None, displayName=name, role="member", joinedAt=utcnow()); store.data.members[m.id] = m; return m


@router.delete("/groups/{group_id}/members/{member_id}", status_code=204)
def remove_member(group_id: str, member_id: str, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canManageMembers: raise HTTPException(403, "Only a group admin can remove members.")
    m = store.data.members.get(member_id)
    if not m or m.groupId != g.id: raise HTTPException(404, "That member could not be found.")
    if m.role == "admin": raise HTTPException(409, "The group admin cannot be removed.")
    del store.data.members[member_id]


@router.post("/groups/{group_id}/invite", response_model=InviteToken)
def create_invite(group_id: str, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canManageInvite: raise HTTPException(403, "Only a group admin can manage the invite link.")
    g.inviteToken = secrets.token_urlsafe(16); return InviteToken(token=g.inviteToken)


@router.delete("/groups/{group_id}/invite", status_code=204)
def revoke_invite(group_id: str, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canManageInvite: raise HTTPException(403, "Only a group admin can manage the invite link.")
    g.inviteToken = None


@router.get("/invites/{token}", response_model=InvitePreview)
def preview_invite(token: str):
    g = next((g for g in store.data.groups.values() if g.inviteToken == token), None)
    return InvitePreview(groupId=g.id if g else "", groupName=g.name if g else "", memberCount=len(members(g.id)) if g else 0, valid=g is not None)


@router.post("/invites/{token}/accept", response_model=GroupMember)
def accept_invite(token: str, value: AcceptInviteInput | None = None, user=Depends(require_user)):
    g = next((g for g in store.data.groups.values() if g.inviteToken == token), None)
    if not g: raise HTTPException(404, "That invite link could not be found.")
    existing = user_member(g.id, user.id)
    if existing: return existing
    m = GroupMember(id=new_id("mbr"), groupId=g.id, userId=user.id, displayName=(value.displayName.strip() if value and value.displayName else user.name.split()[0]), role="member", joinedAt=utcnow()); store.data.members[m.id] = m; return m


@router.post("/groups/{group_id}/invitations", status_code=204)
def invite_user(group_id: str, value: InviteUserInput, user=Depends(require_user)):
    g = group_or_404(group_id); viewer = access(g, user.id)
    if not viewer.canManageInvite: raise HTTPException(403, "Only a group admin can invite people.")
    invitee = next((u for u in store.data.users.values() if u.email.lower() == value.email.lower()), None)
    if not invitee: raise HTTPException(404, "An Evenly account with that email address could not be found.")
    n = AppNotification(id=new_id("ntf"), userId=invitee.id, groupId=g.id, type="group_invitation", title=f"Invitation to join {g.name}", message=f"{user.name} invited you to join {g.name}.", readAt=None, createdAt=utcnow()); store.data.notifications[n.id] = n
