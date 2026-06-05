# AI Interview Partner - Detailed System Architecture

========================================================================================
[ 1. CLIENT LAYER ] - React, TypeScript, Vite
========================================================================================
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  UI Components & State Management:                                      │
  │  - Auth Context (Firebase Client SDK) - Audio Interface (WebRTC/Mic)    │
  │  - File Uploader (PDF Resume)         - Live Chat & Transcript Window   │
  │  - Pre-Screen Quiz Viewer             - Analytics & Feedback Dashboard  │
  └────────────────────────┬─────────────────────────────┬──────────────────┘
                           │ HTTP REST (JSON/PDF)        │ WebSockets (Real-time)
===========================▼=============================▼==========================
[ 2. API & SECURITY LAYER ] - FastAPI (Python)
========================================================================================
  ┌────────────────────────┴─────────────────────────────┴──────────────────┐
  │  CORS Middleware | Firebase JWT Token Verification (Security Guard)     │
  ├─────────────────────────────────────────────────────────────────────────┤
  │  Exposed Endpoints:                                                     │
  │  - POST `/api/v1/setup/parse`        -> Uploads PDF, returns Profile    │
  │  - POST `/api/v1/setup/generate-mcq` -> Uploads Profile, returns Quiz   │
  │  - WS   `/api/v1/interview/stream`   -> Bidirectional Live Interview    │
  └────────────────────────┬─────────────────────────────┬──────────────────┘
                           │                             │
===========================▼=============================▼==========================
[ 3. AI AGENT LAYER ] - Core Business Logic (`app/agents/`)
========================================================================================
  ┌────────────────────────┴─────────┐       ┌───────────┴──────────────────────────┐
  │ PHASE 2: PRE-SCREENING PIPELINE  │       │ PHASE 3: LIVE INTERVIEW PIPELINE     │
  ├──────────────────────────────────┤       ├──────────────────────────────────────┤
  │ 1. [Parser Agent]                │       │ 3. [Interviewer Agent]               │
  │    - Extracts PDF via PyPDF      │       │    - Manages live conversation state │
  │    - Prompts Gemini 2.5 Flash    │       │    - Processes Audio/Text inputs     │
  │    - Outputs Strict JSON Profile │       │    - Generates dynamic follow-ups    │
  │                                  │       │                                      │
  │ 2. [Assessor Agent]              │       │ 4. [Coaching Agent]                  │
  │    - Ingests JSON Profile        │       │    - Prompts Gemini 2.5 Pro          │
  │    - Prompts Gemini 2.5 Flash    │       │    - Analyzes full transcript        │
  │    - Outputs 5-Question MCQ Quiz │       │    - Generates Markdown study plan   │
  └────────────────────────┬─────────┘       └───────────┬──────────────────────────┘
                           │                             │
===========================▼=============================▼==========================
[ 4. DATA PERSISTENCE LAYER ] - Firebase Cloud Firestore (`app/core/db.py`)
========================================================================================
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  The Central Bridge (`serviceAccountKey.json`):                         │
  │  - 📁 `/users`       -> Stores Parsed Profiles & Account Metadata       │
  │  - 📁 `/sessions`    -> Stores Quiz Scores & Live Interview Transcripts │
  │  - 📁 `/evaluations` -> Stores Post-Interview Coach Feedback            │
  └──────────────────────────────────┬──────────────────────────────────────┘
                                     │
=====================================▼==============================================
[ 5. EXTERNAL AI & CLOUD SERVICES ] - Infrastructure (.env)
========================================================================================
  ┌─────────────────────────┐ ┌────────────────────────┐ ┌─────────────────────────┐
  │ Google AI Studio        │ │ Azure AI Services      │ │ Google Firebase Auth    │
  │ - Gemini 2.5 Flash      │ │ - Speech-to-Text (STT) │ │ - Client-side Login     │
  │ - Gemini 2.5 Pro        │ │ - Text-to-Speech (TTS) │ │ - Issues Auth Tokens    │
  └─────────────────────────┘ └────────────────────────┘ └─────────────────────────┘