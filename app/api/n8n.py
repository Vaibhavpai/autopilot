from fastapi import APIRouter, HTTPException
from app.services.n8n_client import test_n8n_connection

router = APIRouter()

@router.post("/test")
async def ping_n8n():
    """Trigger a test ping to the n8n webhook."""
    success = test_n8n_connection()
    if not success:
        raise HTTPException(status_code=502, detail="n8n webhook failed. Check if n8n is running.")
    return {"success": True, "message": "Test webhook sent to n8n successfully!"}
