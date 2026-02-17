import base64
import hashlib
import hmac
import json
import math
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT_DIR / "data"
UPLOAD_DIR = ROOT_DIR / "uploads" / "itinerary-proofs"
DB_PATH = DATA_DIR / "triptales.db"
MAX_REVIEW_TEXT = 500
MAX_ITINERARY_ITEMS = 500
MAX_IMAGE_BYTES = int(os.getenv("MAX_ITINERARY_IMAGE_BYTES", str(5 * 1024 * 1024)))
AUTH_TOKEN_TTL_SECONDS = int(os.getenv("AUTH_TOKEN_TTL_SECONDS", str(14 * 24 * 60 * 60)))
AUTH_SECRET = os.getenv("AUTH_SECRET", "change-this-in-production")

REVIEW_STATUSES = {"pending", "approved", "rejected"}
PROOF_RADIUS_KM = 5.0
PLACE_COORDS = {
    "srinagar": (34.0837, 74.7973),
    "kashmir": (34.0837, 74.7973),
    "gulmarg": (34.0484, 74.3805),
    "pahalgam": (34.0159, 75.3162),
    "sonamarg": (34.3039, 75.2938),
    "jammu": (32.7266, 74.8570),
    "jammu city": (32.7266, 74.8570),
    "katra": (32.9916, 74.9319),
    "vaishno devi": (33.0302, 74.9499),
    "patnitop": (33.0843, 75.3260),
    "anantnag": (33.7307, 75.1542),
    "baramulla": (34.1980, 74.3636),
    "kupwara": (34.5261, 74.2570),
    "amarnath": (34.2145, 75.5025),
    "kishtwar": (33.3136, 75.7673),
    "bhaderwah": (32.9794, 75.7172),
    "doda": (33.1456, 75.5482),
    "udhampur": (32.9253, 75.1352),
    "reasi": (33.0812, 74.8324),
    "rajouri": (33.3783, 74.3155),
    "poonch": (33.7703, 74.0921),
    "bandipora": (34.4170, 74.6431),
    "ganderbal": (34.2257, 74.7718),
    "pulwama": (33.8741, 74.8996),
    "shopian": (33.7171, 74.8349),
    "kulgam": (33.6454, 75.0168),
    "budgam": (34.0209, 74.7238),
    "verinag": (33.5494, 75.2510),
    "yusmarg": (33.8230, 74.6623),
    "kokernag": (33.5846, 75.3344),
    "dachigam": (34.0887, 74.9368),
    "leh": (34.1526, 77.5770),
    "dal lake": (34.1183, 74.8920),
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        salt, saved_digest = hashed.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000).hex()
    return hmac.compare_digest(saved_digest, candidate)


def encode_token(user_id: int, email: str, full_name: str, role: str) -> str:
    payload = {
        "uid": user_id,
        "email": email,
        "full_name": full_name,
        "role": role,
        "exp": int(datetime.now(timezone.utc).timestamp()) + AUTH_TOKEN_TTL_SECONDS,
    }
    payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    body = base64.urlsafe_b64encode(payload_json).decode("utf-8").rstrip("=")
    signature = hmac.new(AUTH_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def decode_token(token: str) -> Dict[str, Any]:
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token.") from exc
    expected = hmac.new(AUTH_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid token signature.")
    padded = body + "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")))
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid token payload.") from exc
    if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Token expired.")
    return payload


def parse_data_url(data_url: str) -> Dict[str, Any]:
    if not data_url:
        raise HTTPException(status_code=400, detail="capturedPhotoDataUrl is required.")
    prefix = "data:image/"
    if not data_url.startswith(prefix) or ";base64," not in data_url:
        raise HTTPException(status_code=400, detail="capturedPhotoDataUrl must be a valid image data URL.")
    header, payload = data_url.split(";base64,", 1)
    subtype = header.replace(prefix, "").lower()
    ext = "jpg" if subtype in {"jpeg", "jpg"} else subtype
    if ext not in {"jpg", "png", "webp"}:
        raise HTTPException(status_code=400, detail="Image type must be jpeg, png, or webp.")
    try:
        binary = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image data.") from exc
    if not binary:
        raise HTTPException(status_code=400, detail="Uploaded image is empty.")
    if len(binary) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"Captured photo exceeds {MAX_IMAGE_BYTES} bytes.")
    return {"binary": binary, "mime_type": f"image/{ext}", "ext": ext}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def extract_route_points(route_text: str) -> List[Dict[str, Any]]:
    route_lower = str(route_text or "").lower().replace("/", " ").replace("-", " ").replace(",", " ")
    matches: List[Dict[str, Any]] = []
    for place, coords in PLACE_COORDS.items():
        if place in route_lower:
            matches.append({"name": place, "latitude": coords[0], "longitude": coords[1]})
    return matches


def compute_proof_verification(route_text: str, captured_lat: float, captured_lng: float) -> Dict[str, Any]:
    points = extract_route_points(route_text)
    if not points:
        return {
            "matchedRoutePoint": None,
            "distanceKm": None,
            "within5km": False,
            "available": False,
        }

    closest = None
    for point in points:
        distance = haversine_km(captured_lat, captured_lng, point["latitude"], point["longitude"])
        if closest is None or distance < closest["distance"]:
            closest = {"point": point, "distance": distance}

    assert closest is not None
    distance_value = round(float(closest["distance"]), 3)
    return {
        "matchedRoutePoint": closest["point"]["name"],
        "distanceKm": distance_value,
        "within5km": distance_value <= PROOF_RADIUS_KM,
        "available": True,
    }


def proof_verification_from_row(row: sqlite3.Row) -> Dict[str, Any]:
    stored_place = row["proof_match_place"]
    stored_distance = row["proof_distance_km"]
    if stored_place and stored_distance is not None:
        return {
            "available": True,
            "matchedRoutePoint": stored_place,
            "distanceKm": float(stored_distance),
            "within5km": bool(row["proof_within_5km"]),
            "radiusKm": PROOF_RADIUS_KM,
        }

    computed = compute_proof_verification(row["route"], float(row["proof_latitude"]), float(row["proof_longitude"]))
    return {
        "available": bool(computed["available"]),
        "matchedRoutePoint": computed["matchedRoutePoint"],
        "distanceKm": computed["distanceKm"],
        "within5km": bool(computed["within5km"]),
        "radiusKm": PROOF_RADIUS_KM,
    }


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              full_name TEXT NOT NULL,
              email TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'user',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS itineraries (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              route TEXT NOT NULL,
              duration TEXT NOT NULL,
              budget TEXT NOT NULL,
              highlights TEXT NOT NULL,
              review_status TEXT NOT NULL,
              created_by_user_id INTEGER,
              created_at TEXT NOT NULL,
              reviewed_at TEXT,
              review_note TEXT,
              proof_latitude REAL NOT NULL,
              proof_longitude REAL NOT NULL,
              proof_photo_url TEXT NOT NULL,
              proof_mime_type TEXT NOT NULL,
              proof_size_bytes INTEGER NOT NULL,
              FOREIGN KEY(created_by_user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS itinerary_reviews (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              itinerary_key TEXT NOT NULL,
              author_name TEXT NOT NULL,
              review_text TEXT NOT NULL,
              rating REAL NOT NULL,
              created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_itinerary_reviews_key ON itinerary_reviews(itinerary_key);
            """
        )
        itinerary_columns = {row["name"] for row in conn.execute("PRAGMA table_info(itineraries)").fetchall()}
        if "proof_distance_km" not in itinerary_columns:
            conn.execute("ALTER TABLE itineraries ADD COLUMN proof_distance_km REAL")
        if "proof_within_5km" not in itinerary_columns:
            conn.execute("ALTER TABLE itineraries ADD COLUMN proof_within_5km INTEGER NOT NULL DEFAULT 0")
        if "proof_match_place" not in itinerary_columns:
            conn.execute("ALTER TABLE itineraries ADD COLUMN proof_match_place TEXT")

        admin_email = os.getenv("ADMIN_EMAIL", "admin@triptales.local").strip().lower()
        admin_password = os.getenv("ADMIN_PASSWORD", "admin12345")
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (admin_email,)).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO users(full_name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                ("TripTales Admin", admin_email, hash_password(admin_password), "admin", now_iso()),
            )
        conn.commit()


def normalize_email(raw: str) -> str:
    email = str(raw or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email format.")
    local_part, domain_part = email.rsplit("@", 1)
    if not local_part or not domain_part or "." not in domain_part:
        raise HTTPException(status_code=400, detail="Invalid email format.")
    if len(email) > 254:
        raise HTTPException(status_code=400, detail="Email is too long.")
    return email


class SignupRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=80)
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=100)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=100)


class CreateItineraryRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    route: str = Field(min_length=1, max_length=220)
    duration: str = Field(min_length=1, max_length=60)
    budget: str = Field(min_length=1, max_length=80)
    highlights: str = Field(min_length=1, max_length=1800)
    locationLatitude: float
    locationLongitude: float
    capturedPhotoDataUrl: str


class UpdateStatusRequest(BaseModel):
    reviewStatus: str
    reviewNote: Optional[str] = Field(default="", max_length=500)


class ReviewCreateRequest(BaseModel):
    itineraryKey: str = Field(min_length=1, max_length=120)
    authorName: str = Field(default="Traveler", min_length=1, max_length=40)
    reviewText: str = Field(min_length=1, max_length=MAX_REVIEW_TEXT)
    rating: float = Field(default=5, ge=1, le=5)


app = FastAPI(title="TripTales FastAPI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event() -> None:
    init_db()


def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    auth = str(request.headers.get("Authorization", "")).strip()
    if not auth.startswith("Bearer "):
        return None
    token = auth.removeprefix("Bearer ").strip()
    if not token:
        return None
    return decode_token(token)


@app.post("/api/auth/signup")
def signup(payload: SignupRequest) -> Dict[str, Any]:
    full_name = payload.full_name.strip()
    email = normalize_email(payload.email)
    with db_conn() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email is already registered.")
        cursor = conn.execute(
            "INSERT INTO users(full_name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
            (full_name, email, hash_password(payload.password), "user", now_iso()),
        )
        user_id = cursor.lastrowid
        conn.commit()
        token = encode_token(user_id, email, full_name, "user")
        return {
            "message": "Account created successfully.",
            "token": token,
            "user": {"id": user_id, "fullName": full_name, "email": email, "role": "user"},
        }


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> Dict[str, Any]:
    email = normalize_email(payload.email)
    with db_conn() as conn:
        row = conn.execute("SELECT id, full_name, email, password_hash, role FROM users WHERE email = ?", (email,)).fetchone()
        if not row or not verify_password(payload.password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid email or password.")
        token = encode_token(row["id"], row["email"], row["full_name"], row["role"])
        return {
            "message": "Login successful.",
            "token": token,
            "user": {
                "id": row["id"],
                "fullName": row["full_name"],
                "email": row["email"],
                "role": row["role"],
            },
        }


@app.get("/api/auth/me")
def me(request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return {"user": {"id": user["uid"], "fullName": user["full_name"], "email": user["email"], "role": user["role"]}}


@app.get("/api/public-config")
def public_config() -> Dict[str, str]:
    return {"googleMapsApiKey": os.getenv("GOOGLE_MAPS_API_KEY", "")}


@app.get("/api/itineraries")
def list_itineraries(status: Optional[str] = None, limit: int = 50) -> Dict[str, Any]:
    normalized_status = (status or "").strip().lower()
    safe_limit = min(max(int(limit or 50), 1), 200)
    with db_conn() as conn:
        if normalized_status in REVIEW_STATUSES:
            rows = conn.execute(
                "SELECT * FROM itineraries WHERE review_status = ? ORDER BY created_at DESC LIMIT ?",
                (normalized_status, safe_limit),
            ).fetchall()
            total_row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM itineraries WHERE review_status = ?",
                (normalized_status,),
            ).fetchone()
        else:
            rows = conn.execute("SELECT * FROM itineraries ORDER BY created_at DESC LIMIT ?", (safe_limit,)).fetchall()
            total_row = conn.execute("SELECT COUNT(*) AS cnt FROM itineraries").fetchone()
    items = []
    for row in rows:
        verification = proof_verification_from_row(row)
        items.append(
            {
                "id": row["id"],
                "title": row["title"],
                "route": row["route"],
                "duration": row["duration"],
                "budget": row["budget"],
                "highlights": row["highlights"],
                "reviewStatus": row["review_status"],
                "createdAt": row["created_at"],
                "reviewedAt": row["reviewed_at"],
                "reviewNote": row["review_note"],
                "proof": {
                    "location": {"latitude": row["proof_latitude"], "longitude": row["proof_longitude"]},
                    "photo": {
                        "mimeType": row["proof_mime_type"],
                        "sizeBytes": row["proof_size_bytes"],
                        "url": row["proof_photo_url"],
                    },
                    "verification": verification,
                },
            }
        )
    return {"total": int(total_row["cnt"]), "items": items}


@app.get("/api/itineraries/{itinerary_id}")
def get_itinerary(itinerary_id: str) -> Dict[str, Any]:
    with db_conn() as conn:
        row = conn.execute("SELECT * FROM itineraries WHERE id = ?", (itinerary_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Itinerary not found.")
    verification = proof_verification_from_row(row)
    return {
        "itinerary": {
            "id": row["id"],
            "title": row["title"],
            "route": row["route"],
            "duration": row["duration"],
            "budget": row["budget"],
            "highlights": row["highlights"],
            "reviewStatus": row["review_status"],
            "createdAt": row["created_at"],
            "reviewedAt": row["reviewed_at"],
            "reviewNote": row["review_note"],
            "proof": {
                "location": {"latitude": row["proof_latitude"], "longitude": row["proof_longitude"]},
                "photo": {"mimeType": row["proof_mime_type"], "sizeBytes": row["proof_size_bytes"], "url": row["proof_photo_url"]},
                "verification": verification,
            },
        }
    }


@app.post("/api/itineraries", status_code=201)
def create_itinerary(payload: CreateItineraryRequest, request: Request) -> Dict[str, Any]:
    if payload.locationLatitude < -90 or payload.locationLatitude > 90:
        raise HTTPException(status_code=400, detail="locationLatitude must be between -90 and 90.")
    if payload.locationLongitude < -180 or payload.locationLongitude > 180:
        raise HTTPException(status_code=400, detail="locationLongitude must be between -180 and 180.")
    parsed_photo = parse_data_url(payload.capturedPhotoDataUrl)
    proof_verification = compute_proof_verification(payload.route, payload.locationLatitude, payload.locationLongitude)
    itinerary_id = secrets.token_hex(16)
    photo_name = f"{itinerary_id}.{parsed_photo['ext']}"
    photo_path = UPLOAD_DIR / photo_name
    photo_path.write_bytes(parsed_photo["binary"])
    public_photo_path = "/" + str(photo_path.relative_to(ROOT_DIR)).replace("\\", "/")
    user = get_current_user(request)
    with db_conn() as conn:
        count_row = conn.execute("SELECT COUNT(*) AS cnt FROM itineraries").fetchone()
        if int(count_row["cnt"]) >= MAX_ITINERARY_ITEMS:
            conn.execute(
                """
                DELETE FROM itineraries
                WHERE id IN (
                  SELECT id FROM itineraries ORDER BY created_at ASC LIMIT 1
                )
                """
            )
        conn.execute(
            """
            INSERT INTO itineraries(
              id, title, route, duration, budget, highlights, review_status, created_by_user_id,
              created_at, proof_latitude, proof_longitude, proof_photo_url, proof_mime_type, proof_size_bytes,
              proof_distance_km, proof_within_5km, proof_match_place
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                itinerary_id,
                payload.title.strip(),
                payload.route.strip(),
                payload.duration.strip(),
                payload.budget.strip(),
                payload.highlights.strip(),
                int(user["uid"]) if user else None,
                now_iso(),
                round(payload.locationLatitude, 6),
                round(payload.locationLongitude, 6),
                public_photo_path,
                parsed_photo["mime_type"],
                len(parsed_photo["binary"]),
                proof_verification["distanceKm"],
                1 if proof_verification["within5km"] else 0,
                proof_verification["matchedRoutePoint"],
            ),
        )
        conn.commit()
    return get_itinerary(itinerary_id)


@app.patch("/api/itineraries/{itinerary_id}/status")
def update_itinerary_status(itinerary_id: str, payload: UpdateStatusRequest, request: Request) -> Dict[str, Any]:
    user = get_current_user(request)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    status_value = payload.reviewStatus.strip().lower()
    if status_value not in REVIEW_STATUSES:
        raise HTTPException(status_code=400, detail="reviewStatus must be one of: pending, approved, rejected.")
    note = (payload.reviewNote or "").strip()
    with db_conn() as conn:
        row = conn.execute("SELECT id FROM itineraries WHERE id = ?", (itinerary_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Itinerary not found.")
        conn.execute(
            "UPDATE itineraries SET review_status = ?, reviewed_at = ?, review_note = ? WHERE id = ?",
            (status_value, now_iso(), note if note else None, itinerary_id),
        )
        conn.commit()
    return {"message": "Itinerary review status updated.", **get_itinerary(itinerary_id)}


@app.get("/api/reviews")
def list_reviews(itineraryKey: str) -> Dict[str, Any]:
    key = itineraryKey.strip()
    if not key:
        raise HTTPException(status_code=400, detail="itineraryKey is required.")
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT id, itinerary_key, author_name, review_text, rating, created_at
            FROM itinerary_reviews
            WHERE itinerary_key = ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (key,),
        ).fetchall()
    reviews = [
        {
            "id": row["id"],
            "itineraryKey": row["itinerary_key"],
            "authorName": row["author_name"],
            "reviewText": row["review_text"],
            "rating": float(row["rating"]),
            "createdAt": row["created_at"],
        }
        for row in rows
    ]
    return {"total": len(reviews), "reviews": reviews}


@app.post("/api/reviews", status_code=201)
def create_review(payload: ReviewCreateRequest) -> Dict[str, Any]:
    key = payload.itineraryKey.strip()
    author = payload.authorName.strip() or "Traveler"
    text = payload.reviewText.strip()
    if not key:
        raise HTTPException(status_code=400, detail="itineraryKey is required.")
    if not text:
        raise HTTPException(status_code=400, detail="reviewText is required.")
    with db_conn() as conn:
        cursor = conn.execute(
            """
            INSERT INTO itinerary_reviews(itinerary_key, author_name, review_text, rating, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (key, author[:40], text[:MAX_REVIEW_TEXT], float(payload.rating), now_iso()),
        )
        conn.commit()
        row_id = cursor.lastrowid
    return {
        "message": "Review submitted successfully.",
        "review": {
            "id": row_id,
            "itineraryKey": key,
            "authorName": author[:40],
            "reviewText": text[:MAX_REVIEW_TEXT],
            "rating": float(payload.rating),
            "createdAt": now_iso(),
        },
    }


@app.post("/api/chat")
def chat() -> Dict[str, str]:
    return {
        "reply": "TripTales assistant is running in offline mode on FastAPI. Configure GROQ/XAI integration to enable live AI replies."
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


app.mount("/images", StaticFiles(directory=ROOT_DIR / "images"), name="images")
app.mount("/uploads", StaticFiles(directory=ROOT_DIR / "uploads"), name="uploads")


@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(ROOT_DIR / "index.html")


@app.get("/{file_path:path}")
def serve_static(file_path: str) -> FileResponse:
    candidate = ROOT_DIR / file_path
    if candidate.is_file() and candidate.suffix.lower() in {
        ".html",
        ".css",
        ".js",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".mp4",
        ".svg",
        ".json",
    }:
        return FileResponse(candidate)
    if file_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found.")
    raise HTTPException(status_code=404, detail="Not found.")
