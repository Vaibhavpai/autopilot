"""
Model 4: Buried Plans Detection
================================
Detects plans, commitments, and scheduled events buried deep in conversation
history that were never confirmed, followed up on, or actually happened.

A "buried plan" is any message where:
  - Someone proposed a future event / meeting / activity
  - The extracted date has passed (or is approaching) with no confirmation
  - Neither party explicitly cancelled or rescheduled it

Architecture:
  ┌─────────────────────────────────────────────────────────────┐
  │ 1. Rule-based NLP    → plan detection, date/time extraction │
  │ 2. Sentence-BERT GPU → 384-d semantic embedding             │
  │ 3. Gradient Boosting → buried_plan_probability score        │
  │ 4. Status classifier → pending / confirmed / cancelled /    │
  │                         expired / buried                    │
  │ 5. MongoDB           → persist plans, reminders, status     │
  └─────────────────────────────────────────────────────────────┘

Plan status lifecycle:
  detected → pending → confirmed | cancelled
                    → buried     (if date passed, no confirmation)
                    → reminder   (if date approaching, not confirmed)

Key signals per message:
  plan_detected          : pre-flagged in synthetic data
  extracted_date         : parsed future date from message
  has_time_expression    : "tomorrow", "next week", "at 3pm", etc.
  has_plan_verb          : "let's", "we should", "i'll", "we're going"
  confirmation_received  : reply containing "yes", "confirmed", "sounds good"
  cancellation_signal    : "can't make it", "reschedule", "sorry"
  days_until_plan        : urgency — how soon is the plan?
  days_since_plan_msg    : how long ago was it proposed?
  thread_silence_after   : did conversation go quiet after the plan?
  embedding_sim_confirm  : semantic similarity of replies to confirmation phrases

Install deps:
    pip install pandas numpy scikit-learn lightgbm sentence-transformers
                torch python-dateutil tqdm matplotlib seaborn joblib
                python-dotenv pymongo
"""

import json
import os
import re
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
import pandas as pd
import seaborn as sns
import torch
from dateutil import parser as dateutil_parser
from dotenv import load_dotenv
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

warnings.filterwarnings("ignore")
load_dotenv()

# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────
DATA_DIR   = Path(".")
MODEL_DIR  = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

MODEL_PATH  = MODEL_DIR / "buried_plans_lgbm.joblib"
SCALER_PATH = MODEL_DIR / "buried_plans_scaler.joblib"

MONGO_URI     = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or os.getenv("MONGODB_URL")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "autopilot")

ENCODER_NAME  = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384
BATCH_SIZE    = 256

# Plan thresholds
REMINDER_DAYS_BEFORE = 3     # remind if plan is within 3 days
BURIED_DAYS_AFTER    = 1     # plan is "buried" if date passed with no confirm
CONFIRMATION_WINDOW  = 72    # hours after plan msg to look for confirmation

RANDOM_STATE = 42


# ─────────────────────────────────────────────────────────────
# NLP Patterns  (compiled once at module load)
# ─────────────────────────────────────────────────────────────

PLAN_VERB_RE = re.compile(
    r"\b(let'?s|we should|we could|how about|what about|wanna|want to"
    r"|i'?ll|we'?re going|we'?re meeting|i can|can we|could we|shall we"
    r"|i was thinking|i thought we|meet(ing)?|catch up|hang out|come over"
    r"|dinner|lunch|coffee|drinks|call|zoom|facetime|visit|trip|plan)\b",
    re.IGNORECASE,
)

TIME_EXPR_RE = re.compile(
    r"\b(tomorrow|tonight|today|this (weekend|week|monday|tuesday|wednesday"
    r"|thursday|friday|saturday|sunday)|next (week|weekend|month|monday"
    r"|tuesday|wednesday|thursday|friday|saturday|sunday)|on (monday|tuesday"
    r"|wednesday|thursday|friday|saturday|sunday)|in (\d+) (days?|weeks?|hours?)"
    r"|\d{1,2}[:/]\d{2}|\d{1,2}(am|pm)|at \d|jan(uary)?|feb(ruary)?|mar(ch)?"
    r"|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(tember)?|oct(ober)?"
    r"|nov(ember)?|dec(ember)?)\b",
    re.IGNORECASE,
)

CONFIRM_RE = re.compile(
    r"\b(yes|yeah|yep|sure|confirmed|confirm|ok|okay|sounds good|perfect"
    r"|great|absolutely|definitely|for sure|works for me|i'?ll be there"
    r"|see you|can'?t wait|booked|set|done deal|locked in|agreed)\b",
    re.IGNORECASE,
)

CANCEL_RE = re.compile(
    r"\b(can'?t make it|can'?t come|won'?t make|have to cancel|cancel"
    r"|reschedule|postpone|rain check|something came up|not anymore"
    r"|never mind|forget it|called off|bail|bailing|skip it|sorry)\b",
    re.IGNORECASE,
)

SOFT_CONFIRM_RE = re.compile(
    r"\b(maybe|possibly|hopefully|if i can|should be able|try to make it"
    r"|let me check|i think so|probably|might)\b",
    re.IGNORECASE,
)

RELATIVE_DATE_MAP = {
    "tomorrow":      1,
    "tonight":       0,
    "today":         0,
    "this weekend":  max(0, 5 - datetime.now().weekday()),
    "next week":     7,
    "next weekend":  7 + max(0, 5 - datetime.now().weekday()),
    "next month":    30,
}

WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2,
    "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6,
}


# ─────────────────────────────────────────────────────────────
# 1. MongoDB helpers
# ─────────────────────────────────────────────────────────────

def get_db():
    from pymongo import MongoClient
    if not MONGO_URI:
        raise ValueError(
            "MONGODB_URI not found in .env\n"
            "Add: MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/"
        )
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    return client[MONGO_DB_NAME]


# ─────────────────────────────────────────────────────────────
# 2. Data loading
# ─────────────────────────────────────────────────────────────

def load_data(data_dir: Path = DATA_DIR):
    """
    Load contacts and messages from MongoDB.
    Falls back to reading local JSON files if MONGO_URI is not set.
    """
    if MONGO_URI:
        print("Loading data from MongoDB ...")
        db = get_db()
        
        # ── Contacts ──────────────────────────────────────────────
        raw_contacts = list(db["contacts"].find({}))
        for doc in raw_contacts:
            doc.pop("_id", None)
        contacts = pd.DataFrame(raw_contacts)
        
        if "healthScore" in contacts.columns and "health_score" not in contacts.columns:
            contacts.rename(columns={"healthScore": "health_score"}, inplace=True)

        # ── Messages ──────────────────────────────────────────────
        raw_messages = list(db["messages"].find({}))
        for doc in raw_messages:
            doc.pop("_id", None)
            if "id" not in doc:
                doc["id"] = str(doc.get("message_id", id(doc)))
        messages = pd.DataFrame(raw_messages)
        
        print(f"  Source: MongoDB ({MONGO_URI[:40]}...)")
    else:
        print("Loading data from local JSON files ...")
        with open(data_dir / "contacts.json", encoding="utf-8") as f:
            contacts = pd.DataFrame(json.load(f))
        with open(data_dir / "messages.json", encoding="utf-8") as f:
            messages = pd.DataFrame(json.load(f))

    if messages.empty:
        raise ValueError("No messages found in the database! (messages dataframe is empty)")

    messages["timestamp"] = pd.to_datetime(
        messages["timestamp"], utc=True, errors="coerce"
    )
    if "extracted_date" in messages.columns:
        messages["extracted_date"] = pd.to_datetime(
            messages["extracted_date"], utc=True, errors="coerce"
        )

    messages.sort_values(["contact_id", "timestamp"], inplace=True)
    messages.reset_index(drop=True, inplace=True)

    print(f"  {len(contacts)} contacts | {len(messages):,} messages")
    n_plans = messages["plan_detected"].fillna(False).sum()
    print(f"  Pre-flagged plan messages: {n_plans:,}")
    return contacts, messages


# ─────────────────────────────────────────────────────────────
# 3. GPU Encoding
# ─────────────────────────────────────────────────────────────

def get_device() -> torch.device:
    if torch.cuda.is_available():
        props = torch.cuda.get_device_properties(0)
        dev   = torch.device("cuda")
        print(f"  GPU : {props.name}  ({props.total_memory // 1024**2} MB VRAM)")
    elif torch.backends.mps.is_available():
        dev = torch.device("mps")
        print("  Device : Apple MPS")
    else:
        dev = torch.device("cpu")
        print("  Device : CPU")
    return dev


def encode_messages(messages: pd.DataFrame, device: torch.device) -> np.ndarray:
    try:
        from sentence_transformers import SentenceTransformer
        print(f"\nEncoding {len(messages):,} messages on {device} ...")
        enc = SentenceTransformer(ENCODER_NAME, device=str(device))
        embs = enc.encode(
            messages["content"].fillna("").tolist(),
            batch_size=BATCH_SIZE,
            show_progress_bar=True,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return embs.astype(np.float32)
    except ImportError:
        print("  sentence-transformers not available — using pre-computed embeddings")
        return _parse_precomputed(messages)


def _parse_precomputed(messages: pd.DataFrame) -> np.ndarray:
    embs = []
    for emb in tqdm(messages["embedding"], desc="Parsing embeddings"):
        if isinstance(emb, str):
            embs.append(json.loads(emb))
        elif isinstance(emb, list):
            embs.append(emb)
        else:
            embs.append([0.0] * EMBEDDING_DIM)
    arr   = np.array(embs, dtype=np.float32)
    norms = np.linalg.norm(arr, axis=1, keepdims=True) + 1e-9
    return arr / norms


# ─────────────────────────────────────────────────────────────
# 4. NLP signal extraction
# ─────────────────────────────────────────────────────────────

def extract_plan_signals(text: str, msg_ts: pd.Timestamp) -> dict:
    """
    Extract plan-related NLP signals from raw message text.
    Returns a feature dict for the ML model.
    """
    if not isinstance(text, str):
        text = ""

    text_lower = text.lower()

    has_plan_verb    = int(bool(PLAN_VERB_RE.search(text)))
    has_time_expr    = int(bool(TIME_EXPR_RE.search(text)))
    has_confirmation = int(bool(CONFIRM_RE.search(text)))
    has_cancellation = int(bool(CANCEL_RE.search(text)))
    has_soft_confirm = int(bool(SOFT_CONFIRM_RE.search(text)))
    question_count   = text.count("?")
    exclamation      = text.count("!")
    word_count       = len(text.split())

    # Attempt to parse a specific date from the text
    extracted_ts  = None
    days_until    = None
    is_future     = 0
    is_past       = 0

    # Try relative dates first (faster + more reliable)
    for phrase, delta_days in RELATIVE_DATE_MAP.items():
        if phrase in text_lower:
            extracted_ts = msg_ts + timedelta(days=delta_days)
            break

    # Try "next <weekday>"
    if extracted_ts is None:
        for day_name, day_num in WEEKDAYS.items():
            if f"next {day_name}" in text_lower or f"this {day_name}" in text_lower:
                days_ahead = (day_num - msg_ts.weekday() + 7) % 7
                if days_ahead == 0:
                    days_ahead = 7
                extracted_ts = msg_ts + timedelta(days=days_ahead)
                break

    # Try dateutil as fallback (handles "March 5", "3pm Friday", etc.)
    if extracted_ts is None:
        try:
            dt = dateutil_parser.parse(text, default=msg_ts.to_pydatetime(),
                                        fuzzy=True)
            # Only accept if it's meaningfully different from the message ts
            if abs((dt - msg_ts.to_pydatetime()).days) <= 365:
                extracted_ts = pd.Timestamp(dt, tz="UTC")
        except Exception:
            pass

    now = pd.Timestamp.now(tz="UTC")
    if extracted_ts is not None:
        days_until = (extracted_ts - now).total_seconds() / 86400
        is_future  = int(days_until > 0)
        is_past    = int(days_until <= 0)

    return {
        "has_plan_verb":      has_plan_verb,
        "has_time_expr":      has_time_expr,
        "has_confirmation":   has_confirmation,
        "has_cancellation":   has_cancellation,
        "has_soft_confirm":   has_soft_confirm,
        "question_count":     question_count,
        "exclamation_count":  exclamation,
        "word_count":         word_count,
        "days_until_plan":    days_until if days_until is not None else 999.0,
        "is_future_plan":     is_future,
        "is_past_plan":       is_past,
        "_extracted_ts":      extracted_ts,   # internal — not a model feature
    }


def classify_plan_status(
    plan_msg_ts:    pd.Timestamp,
    extracted_ts,
    has_confirm:    bool,
    has_cancel:     bool,
    thread_silent:  bool,
    now:            pd.Timestamp = None,
) -> str:
    """
    Determine the lifecycle status of a detected plan.
    Returns: pending | confirmed | cancelled | buried | reminder | expired
    """
    if now is None:
        now = pd.Timestamp.now(tz="UTC")

    if has_cancel:
        return "cancelled"
    if has_confirm:
        return "confirmed"

    if extracted_ts is not None and not pd.isna(extracted_ts):
        days_until = (extracted_ts - now).total_seconds() / 86400
        if days_until < -BURIED_DAYS_AFTER:
            return "buried"                   # date passed, no confirmation
        if 0 <= days_until <= REMINDER_DAYS_BEFORE:
            return "reminder"                 # approaching — send reminder!
        return "pending"
    else:
        # No date extracted — use thread silence as proxy
        days_since_msg = (now - plan_msg_ts).total_seconds() / 86400
        if days_since_msg > 14 and thread_silent:
            return "buried"
        if days_since_msg > 7:
            return "pending"
        return "pending"


# ─────────────────────────────────────────────────────────────
# 5. Feature engineering
# ─────────────────────────────────────────────────────────────

def build_plan_features(
    messages:   pd.DataFrame,
    contacts:   pd.DataFrame,
    embeddings: np.ndarray,
) -> pd.DataFrame:
    """
    For every message with plan_detected=True (or strong plan NLP signals),
    compute the full feature set and assign a buried-plan label.

    Label:
      positive (buried plan) = plan_detected AND status in ('buried', 'pending')
      AND no explicit confirmation found within CONFIRMATION_WINDOW hours
    """
    print("\nEngineering plan features ...")

    # Build archetype embeddings for confirmation / cancellation phrases
    confirm_phrases = [
        "yes confirmed sounds good see you there",
        "absolutely locked in i'll be there",
        "perfect set see you soon",
        "ok great confirmed works for me",
    ]
    cancel_phrases = [
        "sorry can't make it have to cancel",
        "need to reschedule something came up",
        "won't be able to make it bail",
    ]

    try:
        from sentence_transformers import SentenceTransformer
        enc           = SentenceTransformer(ENCODER_NAME, device="cpu")
        confirm_arch  = enc.encode(confirm_phrases,  normalize_embeddings=True).mean(axis=0)
        cancel_arch   = enc.encode(cancel_phrases,   normalize_embeddings=True).mean(axis=0)
    except ImportError:
        confirm_arch  = np.zeros(EMBEDDING_DIM, dtype=np.float32)
        cancel_arch   = np.zeros(EMBEDDING_DIM, dtype=np.float32)

    # Map msg_id → embedding index
    id_to_pos = {row["id"]: i for i, row in messages.iterrows()}

    contact_lookup = contacts.set_index("contact_id")
    now_ts         = messages["timestamp"].max()   # simulate "now"
    records        = []

    for cid, grp in tqdm(messages.groupby("contact_id"), desc="Contacts"):
        grp = grp.sort_values("timestamp").reset_index(drop=True)

        c = contact_lookup.loc[cid] if cid in contact_lookup.index else {}
        c_health  = float(c.get("health_score",          0.5))
        c_resp    = float(c.get("response_ratio",         0.5))
        c_ghosted = int(bool(c.get("is_ghosted",          False)))
        c_churn   = float(c.get("churn_probability",      0.3))
        c_days    = int(c.get("days_since",               10))
        c_freq    = float(c.get("frequency_score",        0.5))
        c_sent    = float(c.get("sentiment_avg",          0.5))

        for i, row in grp.iterrows():
            # ── Only consider messages with plan signals ───────────
            plan_flag = bool(row.get("plan_detected", False))
            signals   = extract_plan_signals(
                row.get("content", ""), row["timestamp"]
            )

            # Skip if no plan verb AND no pre-flag AND no time expression
            if not plan_flag and not signals["has_plan_verb"] and not signals["has_time_expr"]:
                continue

            emb_pos = id_to_pos.get(row["id"], 0)
            msg_emb = embeddings[emb_pos]

            # ── Embedding similarity to confirm / cancel archetypes ─
            sim_confirm = float(np.dot(msg_emb, confirm_arch))
            sim_cancel  = float(np.dot(msg_emb, cancel_arch))

            # ── Look ahead: did anyone confirm / cancel? ────────────
            cutoff_ts     = row["timestamp"] + timedelta(hours=CONFIRMATION_WINDOW)
            future        = grp.iloc[i + 1:] if i + 1 < len(grp) else pd.DataFrame()
            within_window = (
                future[future["timestamp"] <= cutoff_ts] if not future.empty
                else pd.DataFrame()
            )

            reply_confirmed = False
            reply_cancelled = False
            reply_soft      = False
            reply_gap_hrs   = 999.0
            thread_silent   = True
            reply_sim_conf  = 0.0

            if not future.empty:
                thread_silent = len(future[future["timestamp"] <=
                                    row["timestamp"] + timedelta(days=3)]) == 0

            if not within_window.empty:
                for _, rep in within_window.iterrows():
                    rep_text = rep.get("content", "")
                    if CONFIRM_RE.search(rep_text):
                        reply_confirmed = True
                        reply_gap_hrs   = (rep["timestamp"] - row["timestamp"]).total_seconds() / 3600
                        rep_pos         = id_to_pos.get(rep["id"], 0)
                        reply_sim_conf  = float(np.dot(embeddings[rep_pos], confirm_arch))
                        break
                    if CANCEL_RE.search(rep_text):
                        reply_cancelled = True
                        break
                    if SOFT_CONFIRM_RE.search(rep_text):
                        reply_soft = True

            # ── Days since plan message was sent ────────────────────
            days_since_plan = (now_ts - row["timestamp"]).total_seconds() / 86400

            # ── Use pre-computed extracted_date if available ─────────
            precomp_date = row.get("extracted_date", None)
            if pd.notna(precomp_date) if precomp_date is not None else False:
                extracted_ts = pd.Timestamp(precomp_date, tz="UTC") \
                    if not hasattr(precomp_date, "tzinfo") else precomp_date
            else:
                extracted_ts = signals["_extracted_ts"]

            # ── Compute days_until using the better of the two ───────
            if extracted_ts is not None and not pd.isna(extracted_ts):
                days_until = (extracted_ts - now_ts).total_seconds() / 86400
                is_future  = int(days_until > 0)
                is_past    = int(days_until <= 0)
            else:
                days_until = signals["days_until_plan"]
                is_future  = signals["is_future_plan"]
                is_past    = signals["is_past_plan"]

            # ── Plan status ──────────────────────────────────────────
            status = classify_plan_status(
                plan_msg_ts   = row["timestamp"],
                extracted_ts  = extracted_ts,
                has_confirm   = reply_confirmed,
                has_cancel    = reply_cancelled,
                thread_silent = thread_silent,
                now           = now_ts,
            )

            # ── LABEL ────────────────────────────────────────────────
            # A buried plan = flagged as plan + not confirmed + status is buried/pending
            label = int(
                (plan_flag or signals["has_plan_verb"])
                and not reply_confirmed
                and not reply_cancelled
                and status in ("buried", "pending")
            )

            records.append({
                # Identifiers
                "msg_id":               row["id"],
                "contact_id":           cid,
                "timestamp":            row["timestamp"],
                "content":              row.get("content", "")[:200],
                "sender":               row.get("sender", ""),
                "extracted_date":       str(extracted_ts) if extracted_ts is not None else None,
                "plan_status":          status,
                # Plan NLP signals
                "plan_detected_flag":   int(plan_flag),
                "has_plan_verb":        signals["has_plan_verb"],
                "has_time_expr":        signals["has_time_expr"],
                "has_confirmation":     signals["has_confirmation"],
                "has_cancellation":     signals["has_cancellation"],
                "has_soft_confirm":     signals["has_soft_confirm"],
                "question_count":       signals["question_count"],
                "exclamation_count":    signals["exclamation_count"],
                "word_count":           signals["word_count"],
                # Time features
                "days_until_plan":      days_until,
                "days_since_plan_msg":  days_since_plan,
                "is_future_plan":       is_future,
                "is_past_plan":         is_past,
                # Reply / confirmation signals
                "reply_confirmed":      int(reply_confirmed),
                "reply_cancelled":      int(reply_cancelled),
                "reply_soft_confirm":   int(reply_soft),
                "reply_gap_hrs":        reply_gap_hrs,
                "thread_silent_after":  int(thread_silent),
                # Embedding similarity
                "sim_to_confirm_arch":  sim_confirm,
                "sim_to_cancel_arch":   sim_cancel,
                "reply_sim_confirm":    reply_sim_conf,
                # Contact features
                "contact_health":       c_health,
                "contact_resp_ratio":   c_resp,
                "contact_ghosted":      c_ghosted,
                "contact_churn":        c_churn,
                "contact_days_since":   c_days,
                "contact_frequency":    c_freq,
                "contact_sentiment":    c_sent,
                # Meta
                "importance_score":     float(row.get("importance_score", 0.3)),
                "sentiment_score":      float(row.get("sentiment_score", 0.5)),
                # Label
                "label":                label,
            })

    df = pd.DataFrame(records)
    pos = df["label"].sum()
    print(f"  Plan messages detected : {len(df):,}")
    print(f"  Buried / unconfirmed   : {pos:,}  ({100 * pos / max(len(df), 1):.1f}%)")
    print("\n  Plan status breakdown:")
    for s, n in df["plan_status"].value_counts().items():
        print(f"    {s:<15} {n:>5}  ({100*n/len(df):.0f}%)")
    return df


# ─────────────────────────────────────────────────────────────
# Feature columns
# ─────────────────────────────────────────────────────────────

FEATURE_COLS = [
    "plan_detected_flag",
    "has_plan_verb", "has_time_expr", "has_confirmation",
    "has_cancellation", "has_soft_confirm",
    "question_count", "exclamation_count", "word_count",
    "days_until_plan", "days_since_plan_msg",
    "is_future_plan", "is_past_plan",
    "reply_confirmed", "reply_cancelled", "reply_soft_confirm",
    "reply_gap_hrs", "thread_silent_after",
    "sim_to_confirm_arch", "sim_to_cancel_arch", "reply_sim_confirm",
    "contact_health", "contact_resp_ratio", "contact_ghosted",
    "contact_churn", "contact_days_since", "contact_frequency",
    "contact_sentiment",
    "importance_score", "sentiment_score",
]


# ─────────────────────────────────────────────────────────────
# 6. Training — LightGBM on GPU
# ─────────────────────────────────────────────────────────────

def train(df: pd.DataFrame, device: torch.device):
    import lightgbm as lgb

    print("\nTraining LightGBM (Buried Plans Classifier) ...")

    X = df[FEATURE_COLS].fillna(0).values.astype(np.float32)
    y = df["label"].values.astype(np.int32)

    pos = y.sum()
    print(f"  Positive (buried): {pos}/{len(y)}  ({100*pos/len(y):.1f}%)")

    lgb_device   = "gpu" if device.type == "cuda" else "cpu"
    pos_weight   = (y == 0).sum() / max(pos, 1)
    print(f"  LightGBM device  : {lgb_device}")
    print(f"  scale_pos_weight : {pos_weight:.2f}")

    params = dict(
        objective         = "binary",
        metric            = "average_precision",
        learning_rate     = 0.04,
        num_leaves        = 63,
        min_child_samples = 10,
        feature_fraction  = 0.8,
        bagging_fraction  = 0.8,
        bagging_freq      = 5,
        scale_pos_weight  = pos_weight,
        device            = lgb_device,
        seed              = RANDOM_STATE,
        verbose           = -1,
    )
    if lgb_device == "gpu":
        params["gpu_platform_id"] = 0
        params["gpu_device_id"]   = 0

    skf       = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    oof_probs = np.zeros(len(y), dtype=np.float32)
    fold_aucs = []
    best_iters = []

    for fold, (tr_idx, val_idx) in enumerate(skf.split(X, y)):
        dtrain = lgb.Dataset(X[tr_idx], label=y[tr_idx])
        dval   = lgb.Dataset(X[val_idx], label=y[val_idx], reference=dtrain)
        model  = lgb.train(
            params, dtrain,
            num_boost_round=600,
            valid_sets=[dval],
            callbacks=[lgb.early_stopping(60, verbose=False),
                       lgb.log_evaluation(0)],
        )
        preds           = model.predict(X[val_idx])
        oof_probs[val_idx] = preds
        auc             = roc_auc_score(y[val_idx], preds) if y[val_idx].sum() > 0 else 0.5
        fold_aucs.append(auc)
        best_iters.append(model.best_iteration)
        print(f"  Fold {fold+1}/5  AUC={auc:.4f}  iter={model.best_iteration}")

    print(f"\n  Mean CV AUC : {np.mean(fold_aucs):.4f} ± {np.std(fold_aucs):.4f}")

    print("  Retraining on full data ...")
    dtrain_full  = lgb.Dataset(X, label=y)
    final_n_iter = max(1, int(np.mean(best_iters)))
    final_model  = lgb.train(
        params, dtrain_full,
        num_boost_round=final_n_iter,
        callbacks=[lgb.log_evaluation(0)],
    )
    joblib.dump(final_model, MODEL_PATH)
    print(f"  Model saved -> {MODEL_PATH}")

    df = df.copy()
    df["buried_plan_prob"]      = oof_probs
    df["is_buried_plan"]        = (oof_probs >= 0.5).astype(int)
    return final_model, df


# ─────────────────────────────────────────────────────────────
# 7. Threshold tuning
# ─────────────────────────────────────────────────────────────

def tune_threshold(df: pd.DataFrame) -> float:
    y_true = df["label"].values
    y_prob = df["buried_plan_prob"].values

    prec, rec, thresholds = precision_recall_curve(y_true, y_prob)
    f1       = 2 * prec * rec / (prec + rec + 1e-9)
    best_idx = np.argmax(f1[:-1])
    best_thr = float(thresholds[best_idx])

    print(f"\n-- Threshold Tuning -----------------------------------")
    print(f"  Best F1 threshold : {best_thr:.3f}  "
          f"P={prec[best_idx]:.3f}  R={rec[best_idx]:.3f}  F1={f1[best_idx]:.3f}")

    print(f"\n  {'Threshold':>10}  {'Precision':>10}  {'Recall':>8}  {'F1':>8}")
    for t in [0.25, 0.35, 0.45, 0.50, 0.60, 0.70]:
        idx = np.searchsorted(thresholds, t)
        idx = min(idx, len(prec) - 2)
        print(f"  {t:>10.2f}  {prec[idx]:>10.3f}  {rec[idx]:>8.3f}  {f1[idx]:>8.3f}")

    return best_thr


# ─────────────────────────────────────────────────────────────
# 8. Evaluation
# ─────────────────────────────────────────────────────────────

def evaluate(df: pd.DataFrame, threshold: float = 0.5):
    print(f"\n-- Evaluation (threshold={threshold:.2f}) ------------------")
    y_true = df["label"].values
    y_prob = df["buried_plan_prob"].values
    y_pred = (y_prob >= threshold).astype(int)

    print(classification_report(y_true, y_pred,
                                 target_names=["Confirmed/Clear", "Buried Plan"]))
    if y_true.sum() > 0:
        print(f"  ROC-AUC : {roc_auc_score(y_true, y_prob):.4f}")
        print(f"  PR-AUC  : {average_precision_score(y_true, y_prob):.4f}")

    print("\n  Status breakdown of buried plans:")
    buried = df[df["is_buried_plan"] == 1]
    print(buried["plan_status"].value_counts().to_string())

    print("\n  Top 10 contacts with most buried plans:")
    top = (
        df.groupby("contact_id")
        .agg(
            buried_count  = ("is_buried_plan",   "sum"),
            total_plans   = ("label",             "count"),
            mean_prob     = ("buried_plan_prob",  "mean"),
            soonest_plan  = ("days_until_plan",   "min"),
        )
        .assign(buried_rate=lambda d: d["buried_count"] / d["total_plans"])
        .sort_values("buried_count", ascending=False)
        .head(10)
        .reset_index()
    )
    print(top.to_string(index=False))


# ─────────────────────────────────────────────────────────────
# 9. Visualisations
# ─────────────────────────────────────────────────────────────

def plot_results(df: pd.DataFrame, model, threshold: float = 0.5):
    import lightgbm as lgb

    print("\nGenerating plots ...")
    y_true = df["label"].values
    y_prob = df["buried_plan_prob"].values

    STATUS_COLORS = {
        "confirmed": "#27ae60",
        "cancelled": "#95a5a6",
        "pending":   "#f39c12",
        "reminder":  "#e67e22",
        "buried":    "#e74c3c",
        "expired":   "#8e44ad",
    }

    fig = plt.figure(figsize=(20, 12))
    gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.40, wspace=0.35)
    fig.suptitle("Model 4 — Buried Plans Detection (LightGBM + GPU Sentence-BERT)",
                 fontsize=13, fontweight="bold")

    # ── 1. ROC Curve ─────────────────────────────────────────
    ax = fig.add_subplot(gs[0, 0])
    if y_true.sum() > 0:
        fpr, tpr, _ = roc_curve(y_true, y_prob)
        auc = roc_auc_score(y_true, y_prob)
        ax.plot(fpr, tpr, color="#2980b9", lw=2, label=f"AUC = {auc:.3f}")
        ax.fill_between(fpr, tpr, alpha=0.08, color="#2980b9")
    ax.plot([0, 1], [0, 1], "k--", alpha=0.3)
    ax.set_xlabel("False Positive Rate"); ax.set_ylabel("True Positive Rate")
    ax.set_title("ROC Curve"); ax.legend()

    # ── 2. Precision–Recall Curve ─────────────────────────────
    ax = fig.add_subplot(gs[0, 1])
    if y_true.sum() > 0:
        prec, rec, thr = precision_recall_curve(y_true, y_prob)
        ap = average_precision_score(y_true, y_prob)
        ax.plot(rec, prec, color="#27ae60", lw=2, label=f"AP = {ap:.3f}")
        ax.fill_between(rec, prec, alpha=0.08, color="#27ae60")
    ax.set_xlabel("Recall"); ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall Curve"); ax.legend()

    # ── 3. Score distribution by status ──────────────────────
    ax = fig.add_subplot(gs[0, 2])
    for status, color in STATUS_COLORS.items():
        sub = df[df["plan_status"] == status]["buried_plan_prob"]
        if len(sub) > 0:
            ax.hist(sub, bins=25, alpha=0.6, color=color, label=status)
    ax.axvline(threshold, color="black", linestyle="--",
               alpha=0.7, label=f"t={threshold:.2f}")
    ax.set_xlabel("Buried Plan Probability")
    ax.set_ylabel("Count")
    ax.set_title("Score Distribution by Plan Status")
    ax.legend(fontsize=8)

    # ── 4. Feature importance ─────────────────────────────────
    ax = fig.add_subplot(gs[1, 0])
    imp = pd.Series(
        model.feature_importance(importance_type="gain"),
        index=FEATURE_COLS,
    ).nlargest(15).sort_values()
    imp.plot(kind="barh", ax=ax, color="#8e44ad")
    ax.set_title("Top 15 Feature Importances (Gain)")
    ax.set_xlabel("Gain")

    # ── 5. Plan status donut ──────────────────────────────────
    ax = fig.add_subplot(gs[1, 1])
    status_counts = df["plan_status"].value_counts()
    colors_ordered = [STATUS_COLORS.get(s, "#bdc3c7") for s in status_counts.index]
    wedges, texts, autotexts = ax.pie(
        status_counts.values,
        labels=status_counts.index,
        colors=colors_ordered,
        autopct="%1.0f%%",
        startangle=140,
        wedgeprops=dict(width=0.55),
    )
    ax.set_title("Plan Status Distribution")

    # ── 6. Days until plan vs probability ────────────────────
    ax = fig.add_subplot(gs[1, 2])
    clipped = df["days_until_plan"].clip(-60, 120)
    scatter = ax.scatter(
        clipped,
        df["buried_plan_prob"],
        c=df["reply_confirmed"],
        cmap="RdYlGn",
        alpha=0.5, s=20, edgecolors="none",
    )
    plt.colorbar(scatter, ax=ax, label="reply_confirmed")
    ax.axhline(threshold, color="red", linestyle="--", alpha=0.6,
               label=f"threshold={threshold:.2f}")
    ax.axvline(0, color="grey", linestyle=":", alpha=0.5, label="Today")
    ax.set_xlabel("Days Until Plan (clipped)")
    ax.set_ylabel("Buried Plan Probability")
    ax.set_title("Recency vs Probability\n(green=confirmed, red=not)")
    ax.legend(fontsize=8)

    plt.savefig("buried_plans_results.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Plot saved → buried_plans_results.png")


# ─────────────────────────────────────────────────────────────
# 10. MongoDB persistence
# ─────────────────────────────────────────────────────────────

def save_to_mongo(df: pd.DataFrame, model):
    print("\nPersisting to MongoDB …")
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # ── buried_plans collection ───────────────────────────────
    plans_col = db["buried_plans"]
    plan_docs = []
    for _, row in df.iterrows():
        doc = {
            "msg_id":               row["msg_id"],
            "contact_id":           row["contact_id"],
            "timestamp":            str(row["timestamp"]),
            "content":              row["content"],
            "sender":               row.get("sender", ""),
            "plan_status":          row["plan_status"],
            "extracted_date":       row.get("extracted_date"),
            "buried_plan_prob":     float(row["buried_plan_prob"]),
            "is_buried_plan":       bool(row["is_buried_plan"]),
            "days_until_plan":      float(row["days_until_plan"]),
            "days_since_plan_msg":  float(row["days_since_plan_msg"]),
            "reply_confirmed":      bool(row["reply_confirmed"]),
            "has_time_expr":        bool(row["has_time_expr"]),
            "contact_health":       float(row["contact_health"]),
            "scored_at":            now,
            "reminder_sent":        False,
            "resolved":             False,
        }
        plan_docs.append(doc)

    plans_col.delete_many({})
    plans_col.insert_many(plan_docs)
    print(f"  buried_plans        : {len(plan_docs):,} docs written")

    # ── plan_reminders collection — only upcoming unconfirmed ─
    reminders_col = db["plan_reminders"]
    reminder_docs = []
    upcoming = df[
        (df["plan_status"].isin(["reminder", "pending"]))
        & (df["reply_confirmed"] == 0)
        & (df["reply_cancelled"] == 0)
        & (df["days_until_plan"] > -7)
        & (df["days_until_plan"] < 30)
    ]

    for _, row in upcoming.iterrows():
        urgency = (
            "CRITICAL" if 0 <= row["days_until_plan"] <= 1  else
            "HIGH"     if 0 <= row["days_until_plan"] <= 3  else
            "MEDIUM"   if row["days_until_plan"] <= 14       else
            "low"
        )
        reminder_docs.append({
            "msg_id":           row["msg_id"],
            "contact_id":       row["contact_id"],
            "content_snippet":  row["content"][:100],
            "extracted_date":   row.get("extracted_date"),
            "days_until_plan":  float(row["days_until_plan"]),
            "buried_plan_prob": float(row["buried_plan_prob"]),
            "urgency":          urgency,
            "created_at":       now,
            "reminder_sent":    False,
            "resolved":         False,
        })

    reminders_col.delete_many({"resolved": False})
    if reminder_docs:
        reminders_col.insert_many(reminder_docs)
    print(f"  plan_reminders      : {len(reminder_docs)} upcoming plans needing follow-up")

    # ── model_metadata ─────────────────────────────────────────
    meta = {
        "model_name":      "buried_plans_detector",
        "version":         "1.0",
        "trained_at":      now,
        "n_plan_messages": len(df),
        "n_buried":        int(df["is_buried_plan"].sum()),
        "feature_cols":    FEATURE_COLS,
        "thresholds": {
            "reminder_days_before": REMINDER_DAYS_BEFORE,
            "buried_days_after":    BURIED_DAYS_AFTER,
            "confirmation_window":  CONFIRMATION_WINDOW,
        },
        "status_dist": df["plan_status"].value_counts().to_dict(),
        "model_path":  str(MODEL_PATH),
    }
    db["model_metadata"].replace_one(
        {"model_name": "buried_plans_detector"}, meta, upsert=True
    )
    print(f"  model_metadata      : upserted")


def get_upcoming_reminders(urgency: str = None) -> pd.DataFrame:
    """Fetch unresolved upcoming plan reminders from MongoDB."""
    db    = get_db()
    query = {"resolved": False}
    if urgency:
        query["urgency"] = urgency
    docs = list(db["plan_reminders"].find(query, {"_id": 0}))
    return pd.DataFrame(docs) if docs else pd.DataFrame()


def mark_plan_resolved(msg_id: int, resolution: str = "confirmed"):
    """Update a plan's status after you've confirmed / cancelled it."""
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    db["buried_plans"].update_one(
        {"msg_id": msg_id},
        {"$set": {"resolved": True, "resolution": resolution,
                  "resolved_at": now}},
    )
    db["plan_reminders"].update_many(
        {"msg_id": msg_id},
        {"$set": {"resolved": True, "resolved_at": now}},
    )
    print(f"  Plan {msg_id} marked as {resolution}")


# ─────────────────────────────────────────────────────────────
# 11. Export local JSON
# ─────────────────────────────────────────────────────────────

def export_results(df: pd.DataFrame):
    buried = df[df["is_buried_plan"] == 1].copy()
    buried["timestamp"] = buried["timestamp"].astype(str)

    out_cols = [
        "msg_id", "contact_id", "timestamp", "content", "sender",
        "plan_status", "extracted_date", "buried_plan_prob",
        "days_until_plan", "days_since_plan_msg",
        "reply_confirmed", "has_plan_verb", "has_time_expr",
        "contact_health", "contact_ghosted",
    ]
    with open("buried_plans.json", "w") as f:
        json.dump(buried[out_cols].to_dict(orient="records"), f,
                  indent=2, default=str)

    with open("plan_status_all.json", "w") as f:
        df_copy = df.copy()
        df_copy["timestamp"] = df_copy["timestamp"].astype(str)
        json.dump(df_copy[out_cols + ["label"]].to_dict(orient="records"),
                  f, indent=2, default=str)

    print(f"\n  Buried plans   → buried_plans.json       ({len(buried):,} rows)")
    print(f"  All plans      → plan_status_all.json    ({len(df):,} rows)")


# ─────────────────────────────────────────────────────────────
# 12. Real-time inference
# ─────────────────────────────────────────────────────────────

def load_model():
    return joblib.load(MODEL_PATH)


def predict_plan_message(
    content:              str,
    msg_timestamp:        str,
    plan_detected_flag:   bool  = False,
    reply_confirmed:      bool  = False,
    reply_cancelled:      bool  = False,
    reply_gap_hrs:        float = 999.0,
    reply_soft_confirm:   bool  = False,
    thread_silent_after:  bool  = False,
    days_since_plan_msg:  float = 0.0,
    contact_health:       float = 0.5,
    contact_resp_ratio:   float = 0.5,
    contact_ghosted:      bool  = False,
    contact_churn:        float = 0.3,
    contact_days_since:   int   = 10,
    contact_frequency:    float = 0.5,
    contact_sentiment:    float = 0.5,
    importance_score:     float = 0.3,
    sentiment_score:      float = 0.5,
    device: torch.device  = None,
    model                 = None,
    persist_to_mongo:     bool  = False,
) -> dict:
    """
    Score a single message for buried plan probability in real time.
    """
    if model is None:
        model = load_model()
    if device is None:
        device = get_device()

    try:
        ts = pd.Timestamp(msg_timestamp, tz="UTC")
    except Exception:
        ts = pd.Timestamp.now(tz="UTC")

    signals = extract_plan_signals(content, ts)

    # Semantic similarity via GPU encoding
    try:
        from sentence_transformers import SentenceTransformer
        enc          = SentenceTransformer(ENCODER_NAME, device=str(device))
        msg_emb      = enc.encode([content], normalize_embeddings=True)[0]
        confirm_emb  = enc.encode(["yes confirmed sounds good see you there"],
                                   normalize_embeddings=True)[0]
        cancel_emb   = enc.encode(["sorry can't make it have to cancel"],
                                   normalize_embeddings=True)[0]
        sim_confirm  = float(np.dot(msg_emb, confirm_emb))
        sim_cancel   = float(np.dot(msg_emb, cancel_emb))
    except ImportError:
        sim_confirm = float(signals["has_plan_verb"]) * 0.3
        sim_cancel  = 0.0

    row = {
        "plan_detected_flag":   int(plan_detected_flag),
        "has_plan_verb":        signals["has_plan_verb"],
        "has_time_expr":        signals["has_time_expr"],
        "has_confirmation":     signals["has_confirmation"],
        "has_cancellation":     signals["has_cancellation"],
        "has_soft_confirm":     signals["has_soft_confirm"],
        "question_count":       signals["question_count"],
        "exclamation_count":    signals["exclamation_count"],
        "word_count":           signals["word_count"],
        "days_until_plan":      signals["days_until_plan"],
        "days_since_plan_msg":  days_since_plan_msg,
        "is_future_plan":       signals["is_future_plan"],
        "is_past_plan":         signals["is_past_plan"],
        "reply_confirmed":      int(reply_confirmed),
        "reply_cancelled":      int(reply_cancelled),
        "reply_soft_confirm":   int(reply_soft_confirm),
        "reply_gap_hrs":        reply_gap_hrs,
        "thread_silent_after":  int(thread_silent_after),
        "sim_to_confirm_arch":  sim_confirm,
        "sim_to_cancel_arch":   sim_cancel,
        "reply_sim_confirm":    0.0,
        "contact_health":       contact_health,
        "contact_resp_ratio":   contact_resp_ratio,
        "contact_ghosted":      int(contact_ghosted),
        "contact_churn":        contact_churn,
        "contact_days_since":   contact_days_since,
        "contact_frequency":    contact_frequency,
        "contact_sentiment":    contact_sentiment,
        "importance_score":     importance_score,
        "sentiment_score":      sentiment_score,
    }

    X    = np.array([[row[c] for c in FEATURE_COLS]], dtype=np.float32)
    prob = float(model.predict(X)[0])

    status = classify_plan_status(
        plan_msg_ts   = ts,
        extracted_ts  = signals["_extracted_ts"],
        has_confirm   = reply_confirmed,
        has_cancel    = reply_cancelled,
        thread_silent = thread_silent_after,
    )

    urgency = (
        "CRITICAL" if signals["days_until_plan"] <= 1  and prob > 0.5 else
        "HIGH"     if signals["days_until_plan"] <= 3  and prob > 0.4 else
        "MEDIUM"   if signals["days_until_plan"] <= 14 and prob > 0.3 else
        "low"
    )

    result = {
        "content_preview":     content[:80],
        "buried_plan_prob":    round(prob, 4),
        "is_buried_plan":      prob >= 0.5,
        "plan_status":         status,
        "days_until_plan":     round(signals["days_until_plan"], 1),
        "extracted_date":      str(signals["_extracted_ts"]) if signals["_extracted_ts"] else None,
        "urgency":             urgency,
        "signals": {
            "plan_verb":     bool(signals["has_plan_verb"]),
            "time_expr":     bool(signals["has_time_expr"]),
            "confirmed":     reply_confirmed,
            "cancelled":     reply_cancelled,
        },
    }

    if persist_to_mongo:
        try:
            db = get_db()
            db["buried_plans"].replace_one(
                {"content": content[:100]},
                {**result, "scored_at": datetime.now(timezone.utc).isoformat()},
                upsert=True,
            )
        except Exception as e:
            print(f"  MongoDB write skipped: {e}")

    return result


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    print("=" * 62)
    print("  Model 4: Buried Plans Detection")
    print("=" * 62)

    device             = get_device()
    contacts, messages = load_data()
    embeddings         = encode_messages(messages, device)
    df                 = build_plan_features(messages, contacts, embeddings)
    model, df          = train(df, device)
    threshold          = tune_threshold(df)

    df["is_buried_plan"] = (df["buried_plan_prob"] >= threshold).astype(int)

    evaluate(df, threshold)
    plot_results(df, model, threshold)

    # ── MongoDB persistence ────────────────────────────────────
    try:
        save_to_mongo(df, model)
    except Exception as e:
        print(f"\n  MongoDB skipped: {e}")
        print("  (saving locally instead)")

    export_results(df)

    # ── Real-time inference demo ───────────────────────────────
    print("\n── Real-time Inference Demo ─────────────────────────────")
    test_cases = [
        # (content,                                     timestamp,     plan_flag, confirmed, cancelled, gap, soft, silent, days_since, health, resp, ghost, churn, days, freq, sent, imp, sentiment)
        (
            "Let's grab coffee this Saturday at 10am!",
            "2025-02-20T10:00:00+00:00",
            True,  False, False, 999.0, False, True,  12.0, 0.6, 0.5, False, 0.3, 5, 0.6, 0.7, 0.5, 0.7,
        ),
        (
            "Are you still coming to the thing next Friday?",
            "2025-02-18T14:00:00+00:00",
            True,  False, False, 999.0, True,  False, 10.0, 0.7, 0.6, False, 0.2, 3, 0.7, 0.7, 0.6, 0.6,
        ),
        (
            "yeah sounds good see you tomorrow!",
            "2025-02-25T09:00:00+00:00",
            False, True,  False, 2.0,   False, False, 1.0,  0.9, 0.8, False, 0.1, 1, 0.9, 0.9, 0.3, 0.8,
        ),
        (
            "We should do that trip we talked about in January",
            "2025-01-05T11:00:00+00:00",
            True,  False, False, 999.0, False, True,  55.0, 0.4, 0.3, False, 0.6, 55, 0.3, 0.4, 0.4, 0.5,
        ),
        (
            "haha yeah totally",
            "2025-02-26T20:00:00+00:00",
            False, False, False, 999.0, False, False, 0.5,  0.8, 0.7, False, 0.1, 1, 0.8, 0.8, 0.1, 0.8,
        ),
        (
            "I was thinking we could meet next week for dinner?",
            "2025-02-22T18:00:00+00:00",
            True,  False, False, 999.0, False, True,  8.0,  0.5, 0.4, False, 0.4, 8, 0.5, 0.5, 0.5, 0.6,
        ),
    ]

    descriptions = [
        "Coffee plan this Sat — no confirmation",
        "Event next Friday — soft confirm only",
        "Confirmed! Replying 'see you tomorrow'",
        "Old trip idea from January — buried",
        "Casual non-plan message",
        "Dinner next week — no reply yet",
    ]

    print(f"\n  {'Description':<45} {'Prob':>6}  {'Status':<12}  Urgency")
    print("  " + "-" * 82)
    for args, desc in zip(test_cases, descriptions):
        r = predict_plan_message(*args, device=device, model=model)
        flag = "⚠ BURIED" if r["is_buried_plan"] else "  ok"
        print(
            f"  {desc:<45} "
            f"{r['buried_plan_prob']:>6.3f}  "
            f"{r['plan_status']:<12}  "
            f"{r['urgency']:<10}  {flag}"
        )

    # ── Upcoming reminders from MongoDB ───────────────────────
    print("\n── Upcoming Plan Reminders (MongoDB) ────────────────────")
    try:
        reminders = get_upcoming_reminders()
        if reminders.empty:
            print("  No pending reminders found")
        else:
            display_cols = [c for c in [
                "contact_id", "urgency", "days_until_plan",
                "buried_plan_prob", "content_snippet",
            ] if c in reminders.columns]
            print(reminders[display_cols].head(10).to_string(index=False))
    except Exception as e:
        print(f"  Could not fetch reminders: {e}")

    print("\nDone ✓")


if __name__ == "__main__":
    main()