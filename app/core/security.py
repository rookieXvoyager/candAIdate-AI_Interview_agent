from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from firebase_admin import auth
from typing import Dict, Any

async def verify_firebase_token(
	credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())
) -> Dict[str, Any]:
	"""
	Dependency to verify Firebase JWT token from Authorization header.
	Raises HTTP 401 if token is invalid or expired.
	"""
	token = credentials.credentials
	try:
		decoded_token = auth.verify_id_token(token)
		return decoded_token
	except Exception as e:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Invalid or expired Firebase token",
		) from e
