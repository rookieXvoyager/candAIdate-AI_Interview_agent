from app.core.db import db

# Your exact session ID from the screenshot
SESSION_ID = "sess_1e6da335" 

doc = db.collection("sessions").document(SESSION_ID).get()

if doc.exists:
    transcript = doc.to_dict().get("transcript", [])
    print("\n--- COMPLETE TRANSCRIPT ---\n")
    for message in transcript:
        print(f"{message['speaker']}: {message['text']}\n")
else:
    print("Session not found!")