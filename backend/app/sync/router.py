from fastapi import APIRouter, Depends

from app.deps import require_user
from app.sync import service

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("")
def pull(user_id: str = Depends(require_user)):
    return service.pull_sync(user_id)
