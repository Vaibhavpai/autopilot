"""
Model 1: Delayed Reply Detection
=================================
Uses Isolation Forest (unsupervised anomaly detection) to flag
abnormally long reply gaps between contacts.

Pipeline:
  1. Load messages from contacts.json + messages.json
  2. Compute per-reply gap features
  3. Train Isolation Forest → anomaly score per gap
  4. Persist model + scaler
  5. Expose predict() for real-time scoring
  6. Visualise results

Features engineered per reply event:
  - gap_hours              : raw hours since last message from other party
  - log_gap_hours          : log-normalised gap (handles skew)
  - hour_of_day            : hour reply was sent (night replies = unusual)
  - day_of_week            : weekday vs weekend pattern
  - is_weekend             : binary flag
  - sender_switch          : did sender change? (actual reply vs monologue)
  - contact_median_gap     : contact's personal baseline gap
  - gap_vs_median          : ratio of this gap to personal baseline
  - rolling_avg_gap_7d     : 7-day rolling average gap for context
  - importance_score       : was the message being replied to important?
  - prev_importance_score  : importance of the message that triggered reply

Install deps:
    pip install pandas numpy scikit-learn matplotlib seaborn joblib tqdm
"""

import json
import os
import warnings
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import seaborn as sns
import torch
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

warnings.filterwarnings("ignore")

# ─────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────
DATA_DIR          = Path(".")          # folder containing generated JSON files
MODEL_DIR         = Path("models")
MODEL_DIR.mkdir(exist_ok=True)

MODEL_PATH        = MODEL_DIR / "delay_iso_forest.joblib"
SCALER_PATH       = MODEL_DIR / "delay_scaler.joblib"
THRESHOLD_PATH    = MODEL_DIR / "delay_threshold.json"

CONTAMINATION     = 0.08   # expected fraction of anomalous delays (~8%)
N_ESTIMATORS      = 200
RANDOM_STATE      = 42
ANOMALY_LABEL     = -1     # sklearn Isolation Forest convention
NORMAL_LABEL      = 1

FEATURE_COLS = [
    "log_gap_hours",
    "hour_of_day",
    "day_of_week",
    "is_weekend",
    "sender_switch",
    "gap_vs_median",
    "rolling_avg_gap_7d",
    "importance_score",
    "prev_importance_score",
]


# ─────────────────────────────────────────────────────────────
# 1. Data loading
# ─────────────────────────────────────────────────────────────

def load_data(data_dir: Path = DATA_DIR):
    """
    Load contacts and messages from MongoDB.
    Falls back to reading local JSON files if MONGO_URL is not set.
    """
    mongo_url = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI")

    if mongo_url:
        print("Loading data from MongoDB …")
        from pymongo import MongoClient
        
        client = MongoClient(mongo_url, serverSelectionTimeoutMS=15000)
        db = client[os.getenv("MONGO_DB_NAME", "autopilot")]
        
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
        
        client.close()
        print(f"  Source: MongoDB ({mongo_url[:40]}…)")
    else:
        print("Loading data from local JSON files …")
        contacts_path = data_dir / "contacts.json"
        messages_path = data_dir / "messages.json"

        if not contacts_path.exists() or not messages_path.exists():
            raise FileNotFoundError(
                f"Expected contacts.json and messages.json in '{data_dir}'. "
                "Run generate_synthetic_data.py first."
            )

        with open(contacts_path, encoding="utf-8") as f:
            contacts = pd.DataFrame(json.load(f))

        with open(messages_path, encoding="utf-8") as f:
            messages = pd.DataFrame(json.load(f))

    if messages.empty:
        raise ValueError("No messages found in the database! (messages dataframe is empty)")

    messages["timestamp"] = pd.to_datetime(messages["timestamp"], utc=True, errors="coerce")
    messages.sort_values(["contact_id", "timestamp"], inplace=True)
    messages.reset_index(drop=True, inplace=True)

    print(f"  {len(contacts)} contacts | {len(messages):,} messages")
    return contacts, messages

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

# ─────────────────────────────────────────────────────────────
# 2. Feature engineering
# ─────────────────────────────────────────────────────────────

def build_reply_events(messages: pd.DataFrame) -> pd.DataFrame:
    """
    A 'reply event' is any message where the sender differs from
    the previous message (i.e. a turn switch occurred).
    We compute the gap from the previous message.
    """
    print("Engineering reply-gap features …")
    records = []

    for cid, grp in tqdm(messages.groupby("contact_id"), desc="Contacts"):
        grp = grp.sort_values("timestamp").reset_index(drop=True)

        for i in range(1, len(grp)):
            curr = grp.iloc[i]
            prev = grp.iloc[i - 1]

            # Only model actual replies (sender switches)
            sender_switch = int(curr["sender"] != prev["sender"])

            gap_secs  = (curr["timestamp"] - prev["timestamp"]).total_seconds()
            gap_hours = max(gap_secs / 3600, 0.01)   # floor at ~1 min

            records.append({
                "contact_id":           cid,
                "msg_id":               curr["id"],
                "timestamp":            curr["timestamp"],
                "sender":               curr["sender"],
                "gap_hours":            gap_hours,
                "hour_of_day":          curr["timestamp"].hour,
                "day_of_week":          curr["timestamp"].dayofweek,
                "is_weekend":           int(curr["timestamp"].dayofweek >= 5),
                "sender_switch":        sender_switch,
                "importance_score":     curr.get("importance_score", 0.0),
                "prev_importance_score": prev.get("importance_score", 0.0),
            })

    events = pd.DataFrame(records)

    # log-transform gap to reduce right-skew
    events["log_gap_hours"] = np.log1p(events["gap_hours"])

    # per-contact baseline: median gap
    contact_median = (
        events.groupby("contact_id")["gap_hours"]
        .median()
        .rename("contact_median_gap")
    )
    events = events.join(contact_median, on="contact_id")
    events["gap_vs_median"] = events["gap_hours"] / (events["contact_median_gap"] + 1e-6)

    # rolling 7-day average gap per contact (time-ordered)
    events = events.sort_values(["contact_id", "timestamp"])
    events["rolling_avg_gap_7d"] = (
        events.groupby("contact_id")["gap_hours"]
        .transform(lambda s: s.rolling(window=7, min_periods=1).mean())
    )

    print(f"  {len(events):,} reply events built")
    return events


# ─────────────────────────────────────────────────────────────
# 3. Model training
# ─────────────────────────────────────────────────────────────

def train(events: pd.DataFrame):
    print("\nTraining Isolation Forest …")

    X = events[FEATURE_COLS].fillna(0).values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    iso = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    iso.fit(X_scaled)

    # Raw anomaly scores (lower = more anomalous in sklearn's convention)
    raw_scores = iso.decision_function(X_scaled)   # range roughly [-0.5, 0.5]
    predictions = iso.predict(X_scaled)             # -1 = anomaly, 1 = normal

    # Normalise to [0, 1] where 1 = most anomalous
    anomaly_score_norm = 1 - (raw_scores - raw_scores.min()) / (
        raw_scores.max() - raw_scores.min() + 1e-9
    )

    events = events.copy()
    events["anomaly_score"]  = anomaly_score_norm
    events["is_anomaly"]     = (predictions == ANOMALY_LABEL).astype(int)
    events["raw_if_score"]   = raw_scores

    # Persist
    joblib.dump(iso,    MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    # Save decision threshold (95th percentile of normal scores for inference use)
    normal_scores = raw_scores[predictions == NORMAL_LABEL]
    threshold     = float(np.percentile(normal_scores, 5))   # 5th pct of normals ≈ boundary
    with open(THRESHOLD_PATH, "w") as f:
        json.dump({"decision_threshold": threshold}, f)

    n_anom = events["is_anomaly"].sum()
    print(f"  Anomalies detected : {n_anom:,} / {len(events):,}  "
          f"({100 * n_anom / len(events):.1f}%)")
    print(f"  Model saved        : {MODEL_PATH}")
    print(f"  Scaler saved       : {SCALER_PATH}")

    return iso, scaler, events


# ─────────────────────────────────────────────────────────────
# 4. Inference (real-time scoring)
# ─────────────────────────────────────────────────────────────

def load_model():
    """Load persisted model and scaler from disk."""
    iso    = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    with open(THRESHOLD_PATH) as f:
        threshold = json.load(f)["decision_threshold"]
    return iso, scaler, threshold


def predict_gap(
    gap_hours: float,
    hour_of_day: int,
    day_of_week: int,
    sender_switch: int,
    gap_vs_median: float,
    rolling_avg_gap_7d: float,
    importance_score: float = 0.3,
    prev_importance_score: float = 0.3,
    iso=None,
    scaler=None,
) -> dict:
    """
    Score a single reply-gap event in real time.

    Parameters
    ----------
    gap_hours             : hours elapsed since previous message
    hour_of_day           : 0–23
    day_of_week           : 0 = Monday … 6 = Sunday
    sender_switch         : 1 if sender changed (actual reply), 0 if same sender
    gap_vs_median         : gap_hours / contact's historical median gap
    rolling_avg_gap_7d    : 7-day rolling average gap for this contact
    importance_score      : importance of the current message (0–1)
    prev_importance_score : importance of the message being replied to (0–1)

    Returns
    -------
    dict with keys: anomaly_score (0–1), is_anomaly (bool), raw_if_score
    """
    if iso is None or scaler is None:
        iso, scaler, _ = load_model()

    row = np.array([[
        np.log1p(gap_hours),
        hour_of_day,
        day_of_week,
        int(day_of_week >= 5),   # is_weekend derived
        sender_switch,
        gap_vs_median,
        rolling_avg_gap_7d,
        importance_score,
        prev_importance_score,
    ]])

    X_scaled   = scaler.transform(row)
    raw_score  = iso.decision_function(X_scaled)[0]
    prediction = iso.predict(X_scaled)[0]

    return {
        "gap_hours":     round(gap_hours, 2),
        "raw_if_score":  round(float(raw_score), 4),
        "is_anomaly":    prediction == ANOMALY_LABEL,
        "label":         "DELAYED" if prediction == ANOMALY_LABEL else "normal",
    }


def predict_contact_history(contact_messages: list[dict], iso=None, scaler=None) -> pd.DataFrame:
    """
    Given a list of message dicts for ONE contact (sorted by timestamp),
    compute reply-gap anomaly scores for the entire thread.

    Each dict should have at minimum:
        id, timestamp (ISO string), sender, importance_score
    """
    if iso is None or scaler is None:
        iso, scaler, _ = load_model()

    df = pd.DataFrame(contact_messages)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.sort_values("timestamp").reset_index(drop=True)

    gaps = []
    for i in range(1, len(df)):
        curr, prev = df.iloc[i], df.iloc[i - 1]
        gap_hours  = max((curr["timestamp"] - prev["timestamp"]).total_seconds() / 3600, 0.01)
        gaps.append({
            "msg_id":               curr.get("id"),
            "timestamp":            curr["timestamp"],
            "sender":               curr["sender"],
            "gap_hours":            gap_hours,
            "log_gap_hours":        np.log1p(gap_hours),
            "hour_of_day":          curr["timestamp"].hour,
            "day_of_week":          curr["timestamp"].dayofweek,
            "is_weekend":           int(curr["timestamp"].dayofweek >= 5),
            "sender_switch":        int(curr["sender"] != prev["sender"]),
            "importance_score":     curr.get("importance_score", 0.3),
            "prev_importance_score": prev.get("importance_score", 0.3),
        })

    if not gaps:
        return pd.DataFrame()

    result = pd.DataFrame(gaps)
    median_gap = result["gap_hours"].median()
    result["contact_median_gap"] = median_gap
    result["gap_vs_median"]      = result["gap_hours"] / (median_gap + 1e-6)
    result["rolling_avg_gap_7d"] = result["gap_hours"].rolling(7, min_periods=1).mean()

    X_scaled    = scaler.transform(result[FEATURE_COLS].fillna(0).values)
    raw_scores  = iso.decision_function(X_scaled)
    predictions = iso.predict(X_scaled)

    norm = 1 - (raw_scores - raw_scores.min()) / (raw_scores.max() - raw_scores.min() + 1e-9)
    result["anomaly_score"] = norm
    result["is_anomaly"]    = (predictions == ANOMALY_LABEL).astype(int)
    result["raw_if_score"]  = raw_scores
    return result


# ─────────────────────────────────────────────────────────────
# 5. Evaluation & diagnostics
# ─────────────────────────────────────────────────────────────

def evaluate(events: pd.DataFrame, contacts: pd.DataFrame):
    """
    Compare detected anomalies against ground-truth delay_anomaly_score
    and persona labels baked into synthetic data.
    """
    print("\n-- Evaluation ------------------------------------------")

    # Aggregate per-contact: what fraction of their gaps were flagged?
    contact_stats = (
        events.groupby("contact_id")
        .agg(
            total_gaps      =("is_anomaly", "count"),
            anomalous_gaps  =("is_anomaly", "sum"),
            mean_gap_hours  =("gap_hours", "mean"),
            max_gap_hours   =("gap_hours", "max"),
            mean_anomaly_sc =("anomaly_score", "mean"),
        )
        .reset_index()
    )
    contact_stats["anomaly_rate"] = (
        contact_stats["anomalous_gaps"] / contact_stats["total_gaps"]
    )

    merged = contact_stats.merge(
        contacts[["contact_id", "delay_anomaly_score", "is_ghosted"]],
        on="contact_id", how="left",
    )

    # Pearson correlation: our detected rate vs ground-truth score
    corr = merged["anomaly_rate"].corr(merged["delay_anomaly_score"])
    print(f"  Pearson r (anomaly_rate vs delay_anomaly_score) : {corr:.3f}")

    # Ghosted contacts should have higher anomaly rates
    ghosted_rate = merged.loc[merged["is_ghosted"] == True,  "anomaly_rate"].mean()
    active_rate  = merged.loc[merged["is_ghosted"] == False, "anomaly_rate"].mean()
    print(f"  Mean anomaly rate — ghosted contacts  : {ghosted_rate:.3f}")
    print(f"  Mean anomaly rate — active contacts   : {active_rate:.3f}")

    # Top 10 most delayed contacts
    top10 = (
        merged.nlargest(10, "anomaly_rate")
        [["contact_id", "anomaly_rate", "max_gap_hours", "delay_anomaly_score"]]
    )
    print("\n  Top 10 contacts by anomaly rate:")
    print(top10.to_string(index=False))

    return merged


# ─────────────────────────────────────────────────────────────
# 6. Visualisations
# ─────────────────────────────────────────────────────────────

def plot_results(events: pd.DataFrame, contact_stats: pd.DataFrame):
    print("\nGenerating plots …")
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    fig.suptitle("Model 1 — Delayed Reply Detection (Isolation Forest)", fontsize=14, fontweight="bold")

    # ── Plot 1: Gap distribution (log scale) ─────────────────
    ax = axes[0, 0]
    normal_gaps = events.loc[events["is_anomaly"] == 0, "gap_hours"]
    anomaly_gaps = events.loc[events["is_anomaly"] == 1, "gap_hours"]
    ax.hist(np.log1p(normal_gaps),  bins=60, alpha=0.6, color="#4C72B0", label="Normal")
    ax.hist(np.log1p(anomaly_gaps), bins=60, alpha=0.6, color="#DD3333", label="Anomaly")
    ax.set_xlabel("log(gap_hours + 1)")
    ax.set_ylabel("Count")
    ax.set_title("Reply Gap Distribution")
    ax.legend()

    # ── Plot 2: Anomaly score distribution ───────────────────
    ax = axes[0, 1]
    ax.hist(events["anomaly_score"], bins=60, color="#2ecc71", edgecolor="white")
    ax.axvline(events.loc[events["is_anomaly"] == 1, "anomaly_score"].min(),
               color="red", linestyle="--", label="Anomaly threshold")
    ax.set_xlabel("Normalised Anomaly Score")
    ax.set_ylabel("Count")
    ax.set_title("Anomaly Score Distribution")
    ax.legend()

    # ── Plot 3: Gap by hour of day ────────────────────────────
    ax = axes[0, 2]
    hourly = events.groupby("hour_of_day")["is_anomaly"].mean().reset_index()
    ax.bar(hourly["hour_of_day"], hourly["is_anomaly"], color="#9b59b6")
    ax.set_xlabel("Hour of Day")
    ax.set_ylabel("Anomaly Rate")
    ax.set_title("Anomaly Rate by Hour of Day")

    # ── Plot 4: Anomaly rate vs ground-truth score ────────────
    ax = axes[1, 0]
    ax.scatter(
        contact_stats["delay_anomaly_score"],
        contact_stats["anomaly_rate"],
        alpha=0.7,
        c=contact_stats["is_ghosted"].astype(int),
        cmap="RdYlGn_r",
    )
    ax.set_xlabel("Ground-truth delay_anomaly_score")
    ax.set_ylabel("Detected anomaly_rate")
    ax.set_title("Detected vs Ground-Truth\n(colour = is_ghosted)")
    corr = contact_stats["delay_anomaly_score"].corr(contact_stats["anomaly_rate"])
    ax.text(0.05, 0.92, f"r = {corr:.3f}", transform=ax.transAxes, fontsize=10)

    # ── Plot 5: Top 20 contacts by anomaly rate ───────────────
    ax = axes[1, 1]
    top20 = contact_stats.nlargest(20, "anomaly_rate")
    colors = ["#DD3333" if g else "#4C72B0" for g in top20["is_ghosted"]]
    ax.barh(range(20), top20["anomaly_rate"].values, color=colors)
    ax.set_yticks(range(20))
    ax.set_yticklabels([cid[:8] + "..." for cid in top20["contact_id"]], fontsize=7)
    ax.set_xlabel("Anomaly Rate")
    ax.set_title("Top 20 Contacts by Anomaly Rate\n(red = ghosted)")

    # ── Plot 6: Feature importance via mean anomaly score ─────
    ax = axes[1, 2]
    feat_corrs = {
        col: abs(events[col].corr(events["anomaly_score"]))
        for col in FEATURE_COLS
    }
    sorted_feats = sorted(feat_corrs.items(), key=lambda x: x[1], reverse=True)
    names, vals = zip(*sorted_feats)
    ax.barh(names, vals, color="#1abc9c")
    ax.set_xlabel("|Correlation| with Anomaly Score")
    ax.set_title("Feature Importance Proxy")

    plt.tight_layout()
    out_path = "delay_detection_results.png"
    plt.savefig(out_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Plot saved -> {out_path}")


# ─────────────────────────────────────────────────────────────
# 7. Export results
# ─────────────────────────────────────────────────────────────

def export_results(events: pd.DataFrame, contact_stats: pd.DataFrame):
    """Write flagged events and per-contact summaries to JSON."""
    anomalous = events[events["is_anomaly"] == 1].copy()
    anomalous["timestamp"] = anomalous["timestamp"].astype(str)
    anomalous_out = anomalous[[
        "contact_id", "msg_id", "timestamp", "sender",
        "gap_hours", "anomaly_score", "raw_if_score",
        "importance_score", "prev_importance_score",
    ]].to_dict(orient="records")

    with open("delayed_replies_flagged.json", "w") as f:
        json.dump(anomalous_out, f, indent=2, default=str)

    contact_stats_out = contact_stats.to_dict(orient="records")
    with open("delay_contact_summary.json", "w") as f:
        json.dump(contact_stats_out, f, indent=2, default=str)

    print(f"\n  Flagged events  -> delayed_replies_flagged.json  ({len(anomalous_out):,} rows)")
    print(f"  Contact summary -> delay_contact_summary.json    ({len(contact_stats_out)} rows)")


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Model 1: Delayed Reply Detection - Isolation Forest")
    print("=" * 60)

    device = get_device()
    contacts, messages = load_data()
    events             = build_reply_events(messages)
    iso, scaler, events = train(events)
    contact_stats      = evaluate(events, contacts)
    plot_results(events, contact_stats)
    export_results(events, contact_stats)

    # -- Demo: real-time inference -----------------------------
    print("\n-- Real-time Inference Demo -----------------------------")
    test_cases = [
        # (gap_hours, hour, dow, switch, gap_vs_median, rolling_avg, imp, prev_imp, label)
        (1.5,    14, 1, 1, 0.9,  2.0,  0.3, 0.3,  "normal reply (1.5 hrs)"),
        (96.0,   23, 0, 1, 8.5,  4.0,  0.8, 0.85, "delayed reply to important msg (96 hrs)"),
        (240.0,  2,  6, 1, 22.0, 12.0, 0.2, 0.2,  "very long weekend gap (240 hrs)"),
        (0.5,    9,  2, 1, 0.3,  1.2,  0.4, 0.5,  "quick reply (30 min)"),
        (168.0,  10, 4, 1, 15.0, 20.0, 0.7, 0.9,  "week-long delay on important msg"),
    ]

    print(f"\n  {'Description':<45} {'Gap':>8} {'Score':>8} {'Label'}")
    print("  " + "-" * 75)
    for gap, hour, dow, switch, gvm, rag, imp, pimp, desc in test_cases:
        result = predict_gap(
            gap_hours=gap, hour_of_day=hour, day_of_week=dow,
            sender_switch=switch, gap_vs_median=gvm,
            rolling_avg_gap_7d=rag, importance_score=imp,
            prev_importance_score=pimp, iso=iso, scaler=scaler,
        )
        print(f"  {desc:<45} {gap:>7.1f}h {result['raw_if_score']:>+8.4f}  {result['label']}")

    print("\nDone ✓")


if __name__ == "__main__":
    main()