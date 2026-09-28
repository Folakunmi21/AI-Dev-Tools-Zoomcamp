import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from ..models import UploadedFile

router = APIRouter(prefix="/uploads", tags=["Uploads"])


def storage_dir() -> Path:
    configured = os.getenv("RECEIPT_STORAGE_DIR")
    if os.getenv("APP_ENV", "").lower() == "production" and not configured:
        raise HTTPException(503, "Receipt storage is not configured.")
    directory = Path(configured or ".evenly-receipts")
    directory.mkdir(parents=True, exist_ok=True)
    return directory

@router.post("/receipts", response_model=UploadedFile)
async def upload_receipt(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"): raise HTTPException(422, "Attach an image file.")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024: raise HTTPException(422, "Receipts must be under 5MB.")
    original_name = Path(file.filename or "receipt").name
    storage_name = f"{uuid4().hex}{Path(original_name).suffix.lower()}"
    (storage_dir() / storage_name).write_bytes(contents)
    return UploadedFile(fileName=original_name, fileUrl=f"/api/uploads/receipts/{storage_name}")


@router.get("/receipts/{storage_name}")
def get_receipt(storage_name: str):
    if Path(storage_name).name != storage_name:
        raise HTTPException(404, "Receipt not found.")
    path = storage_dir() / storage_name
    if not path.is_file():
        raise HTTPException(404, "Receipt not found.")
    return FileResponse(path)
