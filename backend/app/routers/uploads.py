from fastapi import APIRouter, File, UploadFile, HTTPException
from ..models import UploadedFile

router = APIRouter(prefix="/uploads", tags=["Uploads"])

@router.post("/receipts", response_model=UploadedFile)
async def upload_receipt(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"): raise HTTPException(422, "Attach an image file.")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024: raise HTTPException(422, "Receipts must be under 5MB.")
    # Keep the in-memory backend simple; a real implementation would use object storage.
    return UploadedFile(fileName=file.filename or "receipt", fileUrl=f"memory://receipts/{file.filename or 'receipt'}")
