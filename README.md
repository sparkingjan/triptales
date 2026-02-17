# TripTales

TripTales is a tourism planning website for Jammu and Kashmir.

## Run with AI Chatbot

1. Install dependencies:
   `npm install`
2. Create `.env` from `.env.example` and set your Grok key:
   `XAI_API_KEY=...`
3. Start the app:
   `npm start`
4. Open:
   `http://localhost:3000`

The chatbot is project-scoped. It is designed to answer only TripTales/Jammu & Kashmir trip planning questions and refuse unrelated topics.

## Run FastAPI + SQLite Backend

1. Install Python dependencies:
   `pip install -r requirements.txt`
2. Start the backend:
   `uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload`
3. Open:
   `https://triptales-wvb8.onrender.com`
