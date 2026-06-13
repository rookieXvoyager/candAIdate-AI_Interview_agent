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
async def get_current_user_uid(decoded_token:Dict[str,Any]=Depends(verify_firebase_token))->str:
	"""
	Helper dependency that extracts just the user ID string from the verified token.
	This keeps our endpoint parameters clean and strictly typed.
	"""
	uid=decoded_token.get("uid")
	if not uid:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Token doesn't contain a valid user ID"

		)
	return uid
	
	async def get_current_user_id(decoded_token:Dict[str:Any]=Depends(verify_firebase_token))->str:
		"""
		Helper dependency that extracts just the user ID str from the verified token
		Keeps endopint parameters clean and strictly tight

		"""
		uid=decoded_token.get("uid:")
		if not uid:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,detail="Token doesn't contain a valid userID")
		return uid
	
	