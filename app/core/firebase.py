import firebase_admin
from firebase_admin import credentials, firestore
from typing import Optional
import os

# Path to local service account key for development
def _get_credential() -> Optional[credentials.Base]:
	key_path = os.getenv("FIREBASE_SERVICE_ACCOUNT", "serviceAccountKey.json")
	if os.path.exists(key_path):
		try:
			return credentials.Certificate(key_path)
		except Exception as e:
			print(f"Failed to load Firebase credentials: {e}")
	return None

# Initialize Firebase app if not already initialized
if not firebase_admin._apps:
	cred = _get_credential()
	try:
		if cred:
			firebase_admin.initialize_app(cred)
		else:
			firebase_admin.initialize_app()
	except Exception as e:
		raise RuntimeError(f"Failed to initialize Firebase Admin SDK: {e}")

db = firestore.client()
