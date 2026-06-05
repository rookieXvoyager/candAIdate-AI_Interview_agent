import os
import firebase_admin
from firebase_admin import credentials, firestore

def initialise_firebase():
    """
    Connects to the firebase using local serviceAccountKey.json file
    Ensures it only initializes once, even if the server reloads
    """
    if not firebase_admin._apps:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        cred_path = os.path.join(base_dir,  "serviceAccountKey.json")

        if not os.path.exists(cred_path):
            raise FileNotFoundError(f"Missing serviceAccountKey.json at {cred_path}")
        
        cred =credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)


    return firestore.client()

# Creating a global db instance
db=initialise_firebase()

# Defining the write functions

async def save_candidate_profile(uid:str, profile_data:dict)->str:
    """
    Save the parsed resume profile to the /users collection
    Uses 'merge =True' so we don't accidently delete authentication data
    """
    doc_ref =db.collection("users").document(uid)

    doc_ref.set({
        "profile":profile_data,
        "updatedAt":firestore.SERVER_TIMESTAMP
    }, merge=True)

    return uid

async def save_mcq_assessment(session_id:str, uid:str, target_role:str, assessment_data :dict)-> str:
    """
    Creates a new interview session in the /sessions collection and stores the generated quiz
    """

    doc_ref=db.collection("sessions").document(session_id)

    doc_ref.set({
        "uid":uid,
        "targetRole":target_role,
        "status":"pending_mcq",#Indicating user still needs taking the quiz
        "mcq_quiz":assessment_data,
        "createdAt":firestore.SERVER_TIMESTAMP

    })
    return session_id