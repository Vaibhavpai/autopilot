"""
Model 5: Long Inactivity / Ghosting Detection
==============================================
Detects contacts who have gone unusually silent — either gradually
fading away (slow ghost) or abruptly stopping (hard ghost).

Architecture:
  - Feature engineering: gap statistics, decay curves, streak analysis
  - Isolation Forest    : unsupervised anomaly → inactivity_anomaly_score
  - Random Forest       : supervised ghost probability (uses synthetic labels)
  - DBSCAN clustering   : groups contacts by inactivity pattern type
  - MongoDB             : persists all scores, alerts, model metadata via .env URI

Inactivity pattern types detected:
  1. hard_ghost    : abrupt stop — was active, then nothing for 60+ days
  2. slow_fade     : gradual decline in frequency over weeks/months
  3. one_sided     : only ME sending, contact stopped replying
  4. sporadic      : always been irregular — not truly ghosted
  5. active        : healthy, recent engagement

Signal sources:
  days_since_last_msg       : raw recency
  engagement_decay_rate     : rate of declining message frequency
  response_ratio_trend      : is response ratio going up or down?
  gap_acceleration          : are gaps getting longer over time?
  consecutive_no_reply      : how many of MY messages went unanswered in a row
  last_N_msg_density        : messages in last 7/14/30/90 days
  activity_drop_ratio       : recent activity vs historical average
  mutual_silence_score      : BOTH sides quiet vs just one side

Install deps:
    pip install pandas numpy scikit-learn matplotlib seaborn joblib
                tqdm python-dotenv pymongo
"""

import json
import os
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import numpy as np
import pandas as pd
import seaborn as sns
from dotenv import load_dotenv
from sklearn.cluster import DBSCAN
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import classification_report, roc_auc_score, roc_curve
from sklearn.model_selection import StratifiedKFold, cross_val_score
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

RF_MODEL_PATH  = MODEL_DIR / "inactivity_rf.joblib"
IF_MODEL_PATH  = MODEL_DIR / "inactivity_iso.joblib"
SCALER_PATH    = MODEL_DIR / "inactivity_scaler.joblib"

MONGO_URI      = os.getenv("MONGO_URL") or os.getenv("MONGODB_URI") or os.getenv("MONGO_URI") or os.getenv("MONGODB_URL")
MONGO_DB_NAME  = os.getenv("MONGO_DB_NAME", "autopilot")

# Inactivity thresholds (days)
HARD_GHOST_DAYS   = 60    # silent for 60+ days after being active
SLOW_FADE_DAYS    = 30    # gradual decline over 30+ days
ONE_SIDED_MIN     = 5     # at least 5 consecutive unanswered messages
ACTIVE_WINDOW     = 14    # days — if messaged in last 14d = active

# Feature windows (days)
WINDOWS = [7, 14, 30, 90]

RANDOM_STATE = 42

# Ghost pattern labels
GHOST_PATTERNS = ["hard_ghost", "slow_fade", "one_sided", "sporadic", "active"]


# ─────────────────────────────────────────────────────────────
# 1. MongoDB connection
# ─────────────────────────────────────────────────────────────

def get_mongo_client():
    """Return a connected MongoClient using MONGODB_URI from .env"""
    try:
        from pymongo import MongoClient
        from pymongo.errors import ConnectionFailure

        if not MONGO_URI:
            raise ValueError(
                "MONGODB_URI not found in .env — "
                "add: MONGODB_URI=mongodb+srv://user:pass@cluster/db"
            )

        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")   # verify connection
        print(f"  MongoDB connected → {MONGO_DB_NAME}")
        return client

    except ImportError:
        raise ImportError("pymongo not installed — run: pip install pymongo")
    except Exception as e:
        raise ConnectionError(f"MongoDB connection failed: {e}")


def get_db():
    client = get_mongo_client()
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
        print("Loading data from MongoDB …")
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
        
        print(f"  Source: MongoDB ({MONGO_URI[:40]}…)")
    else:
        print("Loading data from local JSON files …")
        with open(data_dir / "contacts.json", encoding="utf-8") as f:
            contacts = pd.DataFrame(json.load(f))
        with open(data_dir / "messages.json", encoding="utf-8") as f:
            messages = pd.DataFrame(json.load(f))

    if messages.empty:
        raise ValueError("No messages found in the database! (messages dataframe is empty)")

    messages["timestamp"] = pd.to_datetime(
        messages["timestamp"], utc=True, errors="coerce"
    )
    messages.sort_values(["contact_id", "timestamp"], inplace=True)
    messages.reset_index(drop=True, inplace=True)

    print(f"  {len(contacts)} contacts | {len(messages):,} messages")
    return contacts, messages


# ─────────────────────────────────────────────────────────────
# 3. Feature Engineering
# ─────────────────────────────────────────────────────────────

def compute_message_density(grp: pd.DataFrame, ref_ts: pd.Timestamp, window_days: int) -> dict:
    """Count messages and unique active days within a rolling window."""
    cutoff = ref_ts - pd.Timedelta(days=window_days)
    window_msgs = grp[grp["timestamp"] >= cutoff]
    return {
        f"msgs_{window_days}d":         len(window_msgs),
        f"my_msgs_{window_days}d":      (window_msgs["sender"] == "me").sum(),
        f"their_msgs_{window_days}d":   (window_msgs["sender"] == "contact").sum(),
        f"active_days_{window_days}d":  window_msgs["timestamp"].dt.date.nunique(),
    }


def compute_gap_trend(gaps: pd.Series) -> dict:
    """
    Fit a linear trend to the sequence of inter-message gaps.
    Positive slope = gaps are getting LONGER (fading away).
    """
    if len(gaps) < 5:
        return {"gap_slope": 0.0, "gap_acceleration": 0.0, "gap_volatility": 0.0}

    x = np.arange(len(gaps), dtype=float)
    y = gaps.values.astype(float)

    # Linear fit
    coeffs  = np.polyfit(x, y, 1)
    slope   = float(coeffs[0])

    # Acceleration: slope of the slope (quadratic fit)
    if len(gaps) >= 10:
        q_coeffs     = np.polyfit(x, y, 2)
        acceleration = float(q_coeffs[0])
    else:
        acceleration = 0.0

    return {
        "gap_slope":        slope,
        "gap_acceleration": acceleration,
        "gap_volatility":   float(gaps.std()),
    }


def compute_response_ratio_trend(grp: pd.DataFrame) -> float:
    """
    Compare response ratio in first half vs second half of conversation.
    Negative = they're responding less over time (fading).
    """
    n = len(grp)
    if n < 20:
        return 0.0
    first_half  = grp.iloc[:n // 2]
    second_half = grp.iloc[n // 2:]

    def resp_ratio(df):
        my   = (df["sender"] == "me").sum()
        them = (df["sender"] == "contact").sum()
        return them / (my + 1e-6)

    return float(resp_ratio(second_half) - resp_ratio(first_half))


def compute_consecutive_no_reply(grp: pd.DataFrame) -> int:
    """
    Count the maximum consecutive messages sent by ME without any reply from contact.
    High value = one-sided conversation → ghosting signal.
    """
    max_streak = 0
    current    = 0
    for _, row in grp.iterrows():
        if row["sender"] == "me":
            current += 1
        else:
            max_streak = max(max_streak, current)
            current    = 0
    return max(max_streak, current)


def assign_ghost_pattern(row: pd.Series) -> str:
    """
    Rule-based pattern assignment for clustering / labelling.
    Returns one of: hard_ghost, slow_fade, one_sided, sporadic, active
    """
    if row["days_since"] <= ACTIVE_WINDOW:
        return "active"
    if row["days_since"] >= HARD_GHOST_DAYS and row["activity_drop_ratio"] > 0.7:
        return "hard_ghost"
    if row["gap_slope"] > 5 and row["days_since"] >= SLOW_FADE_DAYS:
        return "slow_fade"
    if row["consecutive_no_reply"] >= ONE_SIDED_MIN:
        return "one_sided"
    if row["gap_volatility"] > 50 and row["days_since"] < HARD_GHOST_DAYS:
        return "sporadic"
    return "slow_fade" if row["days_since"] >= SLOW_FADE_DAYS else "active"


def build_inactivity_features(
    messages: pd.DataFrame,
    contacts: pd.DataFrame,
) -> pd.DataFrame:
    print("\nEngineering inactivity features …")

    ref_ts = messages["timestamp"].max()   # simulate "now"
    contact_lookup = contacts.set_index("contact_id")
    records = []

    for cid, grp in tqdm(messages.groupby("contact_id"), desc="Contacts"):
        grp = grp.sort_values("timestamp").reset_index(drop=True)

        # Contact metadata
        c = contact_lookup.loc[cid] if cid in contact_lookup.index else {}
        c_health     = float(c.get("health_score",            0.5))
        c_decay      = float(c.get("engagement_decay_rate",   0.1))
        c_churn      = float(c.get("churn_probability",       0.3))
        c_resp       = float(c.get("response_ratio",          0.5))
        c_ghosted_gt = bool(c.get("is_ghosted",               False))    # ground truth
        c_drift      = bool(c.get("drift_detected",           False))
        c_drift_sev  = c.get("drift_severity",               "none")
        c_sentiment  = float(c.get("sentiment_avg",           0.5))

        # ── Basic recency ─────────────────────────────────────
        last_msg_ts  = grp["timestamp"].max()
        first_msg_ts = grp["timestamp"].min()
        days_since   = float((ref_ts - last_msg_ts).total_seconds() / 86400)
        convo_span   = float((last_msg_ts - first_msg_ts).total_seconds() / 86400)
        total_msgs   = len(grp)
        avg_msgs_day = total_msgs / max(convo_span, 1)

        # ── Message density in rolling windows ───────────────
        density = {}
        for w in WINDOWS:
            density.update(compute_message_density(grp, ref_ts, w))

        # ── Inter-message gap statistics ──────────────────────
        gaps = grp["timestamp"].diff().dt.total_seconds().dropna() / 3600  # hours
        gap_stats = {
            "mean_gap_hrs":    float(gaps.mean()) if len(gaps) else 0,
            "median_gap_hrs":  float(gaps.median()) if len(gaps) else 0,
            "max_gap_hrs":     float(gaps.max()) if len(gaps) else 0,
            "p90_gap_hrs":     float(np.percentile(gaps, 90)) if len(gaps) else 0,
        }

        # ── Gap trend (are gaps getting longer?) ─────────────
        gap_trend = compute_gap_trend(gaps)

        # ── Response ratio trend ──────────────────────────────
        resp_trend = compute_response_ratio_trend(grp)

        # ── One-sided streak ──────────────────────────────────
        consec_no_reply = compute_consecutive_no_reply(grp)

        # ── Activity drop ratio ───────────────────────────────
        # (historical avg messages/day) vs (last 30 days messages/day)
        hist_avg = avg_msgs_day
        recent   = density.get("msgs_30d", 0) / 30.0
        activity_drop = max(0.0, (hist_avg - recent) / (hist_avg + 1e-6))

        # ── Mutual silence score ──────────────────────────────
        # Both quiet = mutual_silence; only contact quiet = one-sided
        my_recent   = density.get("my_msgs_30d",    0)
        their_recent= density.get("their_msgs_30d", 0)
        mutual_sil  = float((my_recent + their_recent) == 0)
        one_sided_f = float(my_recent > 0 and their_recent == 0)

        # ── Last message sender ───────────────────────────────
        last_sender_me = int(grp.iloc[-1]["sender"] == "me")

        # ── Compose feature dict ──────────────────────────────
        feat = {
            "contact_id":              cid,
            # Recency
            "days_since":              days_since,
            "convo_span_days":         convo_span,
            "total_msgs":              total_msgs,
            "avg_msgs_per_day":        avg_msgs_day,
            # Rolling density
            **density,
            # Gap stats
            **gap_stats,
            # Gap trend
            **gap_trend,
            # Response ratio
            "response_ratio_trend":    resp_trend,
            "consecutive_no_reply":    consec_no_reply,
            # Activity
            "activity_drop_ratio":     activity_drop,
            "mutual_silence_score":    mutual_sil,
            "one_sided_flag":          one_sided_f,
            "last_sender_was_me":      last_sender_me,
            # Contact metadata
            "contact_health":          c_health,
            "contact_decay":           c_decay,
            "contact_churn":           c_churn,
            "contact_resp_ratio":      c_resp,
            "contact_drift":           int(c_drift),
            "contact_drift_severe":    int(c_drift_sev in ("moderate", "severe")),
            "contact_sentiment":       c_sentiment,
            # Ground truth (for training only)
            "is_ghosted_gt":           int(c_ghosted_gt),
        }
        records.append(feat)

    df = pd.DataFrame(records)

    # Assign ghost pattern labels
    df["ghost_pattern"] = df.apply(assign_ghost_pattern, axis=1)

    print(f"  Features built for {len(df)} contacts")
    print("\n  Ghost pattern distribution:")
    for pat, cnt in df["ghost_pattern"].value_counts().items():
        print(f"    {pat:<20} {cnt:>4}  ({100*cnt/len(df):.0f}%)")

    return df


# ─────────────────────────────────────────────────────────────
# Feature columns
# ─────────────────────────────────────────────────────────────

FEATURE_COLS = [
    "days_since", "convo_span_days", "total_msgs", "avg_msgs_per_day",
    "msgs_7d",    "my_msgs_7d",    "their_msgs_7d",    "active_days_7d",
    "msgs_14d",   "my_msgs_14d",   "their_msgs_14d",   "active_days_14d",
    "msgs_30d",   "my_msgs_30d",   "their_msgs_30d",   "active_days_30d",
    "msgs_90d",   "my_msgs_90d",   "their_msgs_90d",   "active_days_90d",
    "mean_gap_hrs", "median_gap_hrs", "max_gap_hrs", "p90_gap_hrs",
    "gap_slope", "gap_acceleration", "gap_volatility",
    "response_ratio_trend", "consecutive_no_reply",
    "activity_drop_ratio", "mutual_silence_score", "one_sided_flag",
    "last_sender_was_me",
    "contact_health", "contact_decay", "contact_churn",
    "contact_resp_ratio", "contact_drift", "contact_drift_severe",
    "contact_sentiment",
]


# ─────────────────────────────────────────────────────────────
# 4. Isolation Forest — anomaly scoring
# ─────────────────────────────────────────────────────────────

def train_isolation_forest(df: pd.DataFrame):
    print("\nTraining Isolation Forest (inactivity anomaly) …")

    X = df[FEATURE_COLS].fillna(0).values
    scaler = StandardScaler()
    X_sc   = scaler.fit_transform(X)

    iso = IsolationForest(
        n_estimators=300,
        contamination=0.15,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    iso.fit(X_sc)

    raw_scores = iso.decision_function(X_sc)
    # Normalise: 1 = most anomalous (most inactive/ghosted)
    norm_scores = 1 - (raw_scores - raw_scores.min()) / (
        raw_scores.max() - raw_scores.min() + 1e-9
    )

    df = df.copy()
    df["inactivity_anomaly_score"] = norm_scores
    df["if_prediction"]            = iso.predict(X_sc)   # -1 = anomaly

    joblib.dump(iso,    IF_MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print(f"  IF anomalies: {(df['if_prediction'] == -1).sum()} / {len(df)}")
    return iso, scaler, df


# ─────────────────────────────────────────────────────────────
# 5. Random Forest — supervised ghost probability
# ─────────────────────────────────────────────────────────────

def train_random_forest(df: pd.DataFrame):
    print("\nTraining Random Forest (ghost probability) …")

    X = df[FEATURE_COLS].fillna(0).values
    y = df["is_ghosted_gt"].values

    pos = y.sum()
    print(f"  Ghosted: {pos}/{len(y)}  ({100*pos/len(y):.0f}%)")

    if pos < 5:
        print("  Too few positive samples — skipping RF training")
        df["ghost_probability"] = df["inactivity_anomaly_score"]
        return None, df

    rf = RandomForestClassifier(
        n_estimators=400,
        max_depth=None,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )

    skf      = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
    oof_prob = np.zeros(len(y), dtype=np.float32)

    for fold, (tr, val) in enumerate(skf.split(X, y)):
        rf.fit(X[tr], y[tr])
        oof_prob[val] = rf.predict_proba(X[val])[:, 1]
        auc = roc_auc_score(y[val], oof_prob[val]) if y[val].sum() > 0 else 0
        print(f"  Fold {fold+1}/5  AUC={auc:.4f}")

    print(f"\n  OOF AUC: {roc_auc_score(y, oof_prob):.4f}")

    rf.fit(X, y)
    joblib.dump(rf, RF_MODEL_PATH)
    print(f"  RF model saved → {RF_MODEL_PATH}")

    df = df.copy()
    df["ghost_probability"] = oof_prob
    df["is_predicted_ghost"]= (oof_prob >= 0.5).astype(int)
    return rf, df


# ─────────────────────────────────────────────────────────────
# 6. DBSCAN clustering — inactivity pattern types
# ─────────────────────────────────────────────────────────────

def cluster_inactivity_patterns(df: pd.DataFrame, scaler: StandardScaler) -> pd.DataFrame:
    """
    Cluster contacts by their inactivity fingerprint using DBSCAN.
    Cluster labels help distinguish hard_ghost vs slow_fade vs one_sided.
    """
    print("\nClustering inactivity patterns (DBSCAN) …")

    # Use a subset of most discriminative features for clustering
    cluster_feats = [
        "days_since", "activity_drop_ratio", "gap_slope",
        "consecutive_no_reply", "one_sided_flag",
        "mutual_silence_score", "response_ratio_trend",
        "msgs_30d", "contact_decay",
    ]
    X_c = df[cluster_feats].fillna(0).values
    X_c_sc = StandardScaler().fit_transform(X_c)

    db = DBSCAN(eps=1.2, min_samples=3, n_jobs=-1)
    labels = db.fit_predict(X_c_sc)

    df = df.copy()
    df["cluster_id"] = labels

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise    = (labels == -1).sum()
    print(f"  Clusters found: {n_clusters}  |  Noise points: {n_noise}")

    return df


# ─────────────────────────────────────────────────────────────
# 7. Evaluation
# ─────────────────────────────────────────────────────────────

def evaluate(df: pd.DataFrame):
    print("\n── Evaluation ──────────────────────────────────────────")
    y_true = df["is_ghosted_gt"].values
    y_prob = df.get("ghost_probability", df["inactivity_anomaly_score"]).values
    y_pred = (y_prob >= 0.5).astype(int)

    print(classification_report(y_true, y_pred,
                                 target_names=["Active", "Ghosted"]))

    if y_true.sum() > 0:
        print(f"  ROC-AUC: {roc_auc_score(y_true, y_prob):.4f}")

    print("\n  Ghost pattern breakdown:")
    print(df.groupby("ghost_pattern")[["ghost_probability", "days_since",
                                        "activity_drop_ratio"]].mean().round(3).to_string())

    print("\n  Top 10 most-at-risk contacts:")
    top = df.nlargest(10, "ghost_probability")[
        ["contact_id", "days_since", "ghost_probability",
         "ghost_pattern", "consecutive_no_reply", "activity_drop_ratio"]
    ]
    print(top.to_string(index=False))


# ─────────────────────────────────────────────────────────────
# 8. Visualisations
# ─────────────────────────────────────────────────────────────

def plot_results(df: pd.DataFrame, rf_model):
    print("\nGenerating plots …")

    fig = plt.figure(figsize=(20, 12))
    gs  = gridspec.GridSpec(2, 3, figure=fig, hspace=0.38, wspace=0.35)
    fig.suptitle("Model 5 — Long Inactivity / Ghosting Detection",
                 fontsize=14, fontweight="bold")

    PATTERN_COLORS = {
        "active":     "#27ae60",
        "sporadic":   "#f39c12",
        "slow_fade":  "#e67e22",
        "one_sided":  "#9b59b6",
        "hard_ghost": "#e74c3c",
    }

    # ── 1. Ghost probability distribution ────────────────────
    ax = fig.add_subplot(gs[0, 0])
    for pat, color in PATTERN_COLORS.items():
        subset = df[df["ghost_pattern"] == pat]["ghost_probability"]
        if len(subset):
            ax.hist(subset, bins=15, alpha=0.65, color=color, label=pat)
    ax.set_xlabel("Ghost Probability")
    ax.set_ylabel("Contacts")
    ax.set_title("Ghost Probability by Pattern")
    ax.legend(fontsize=8)

    # ── 2. Days since vs activity drop (scatter) ─────────────
    ax = fig.add_subplot(gs[0, 1])
    for pat, color in PATTERN_COLORS.items():
        s = df[df["ghost_pattern"] == pat]
        ax.scatter(s["days_since"], s["activity_drop_ratio"],
                   c=color, label=pat, alpha=0.75, s=50, edgecolors="white", linewidth=0.4)
    ax.set_xlabel("Days Since Last Message")
    ax.set_ylabel("Activity Drop Ratio")
    ax.set_title("Recency vs Activity Drop")
    ax.legend(fontsize=8)

    # ── 3. ROC curve ─────────────────────────────────────────
    ax = fig.add_subplot(gs[0, 2])
    y_true = df["is_ghosted_gt"].values
    y_prob = df["ghost_probability"].values
    if y_true.sum() > 0:
        fpr, tpr, _ = roc_curve(y_true, y_prob)
        auc = roc_auc_score(y_true, y_prob)
        ax.plot(fpr, tpr, color="#2980b9", lw=2, label=f"RF  AUC={auc:.3f}")

    y_if = df["inactivity_anomaly_score"].values
    if y_true.sum() > 0:
        fpr2, tpr2, _ = roc_curve(y_true, y_if)
        auc2 = roc_auc_score(y_true, y_if)
        ax.plot(fpr2, tpr2, color="#e74c3c", lw=2, linestyle="--",
                label=f"IF  AUC={auc2:.3f}")
    ax.plot([0, 1], [0, 1], "k--", alpha=0.3)
    ax.set_xlabel("FPR"); ax.set_ylabel("TPR")
    ax.set_title("ROC — RF vs Isolation Forest")
    ax.legend()

    # ── 4. Feature importance (RF) ────────────────────────────
    ax = fig.add_subplot(gs[1, 0])
    if rf_model is not None:
        imp = pd.Series(rf_model.feature_importances_, index=FEATURE_COLS).nlargest(15).sort_values()
        imp.plot(kind="barh", ax=ax, color="#8e44ad")
        ax.set_title("Top 15 Features (Random Forest)")
        ax.set_xlabel("Importance")
    else:
        ax.text(0.5, 0.5, "RF not trained\n(insufficient positive samples)",
                ha="center", va="center", transform=ax.transAxes)

    # ── 5. Gap slope distribution by pattern ─────────────────
    ax = fig.add_subplot(gs[1, 1])
    order = list(PATTERN_COLORS.keys())
    palette = list(PATTERN_COLORS.values())
    plot_data = df[df["ghost_pattern"].isin(order)]
    for pat, color in PATTERN_COLORS.items():
        vals = plot_data[plot_data["ghost_pattern"] == pat]["gap_slope"]
        ax.boxplot(vals.clip(-50, 200), positions=[order.index(pat)],
                   widths=0.6, patch_artist=True,
                   boxprops=dict(facecolor=color, alpha=0.7),
                   medianprops=dict(color="black", linewidth=2))
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(order, rotation=25, ha="right")
    ax.set_ylabel("Gap Slope (hrs/message)")
    ax.set_title("Gap Trend by Ghost Pattern")

    # ── 6. DBSCAN clusters ────────────────────────────────────
    ax = fig.add_subplot(gs[1, 2])
    scatter = ax.scatter(
        df["days_since"], df["ghost_probability"],
        c=df["cluster_id"], cmap="tab10",
        s=60, alpha=0.8, edgecolors="white", linewidth=0.3,
    )
    plt.colorbar(scatter, ax=ax, label="Cluster ID")
    ax.set_xlabel("Days Since Last Message")
    ax.set_ylabel("Ghost Probability")
    ax.set_title("DBSCAN Clusters")

    plt.savefig("inactivity_detection_results.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Plot saved → inactivity_detection_results.png")


# ─────────────────────────────────────────────────────────────
# 9. MongoDB persistence
# ─────────────────────────────────────────────────────────────

def _df_to_docs(df: pd.DataFrame) -> list:
    """Convert DataFrame to MongoDB-safe list of dicts."""
    docs = json.loads(df.to_json(orient="records", date_format="iso"))
    return docs


def save_to_mongo(df: pd.DataFrame, rf_model, iso_model):
    """
    Persist scores, alerts, and model metadata to MongoDB.

    Collections written:
      inactivity_scores   — per-contact ghost probability + features
      inactivity_alerts   — contacts flagged as ghosted / at-risk
      model_metadata      — training run info, feature list, thresholds
    """
    print("\nPersisting to MongoDB …")
    db  = get_db()
    now = datetime.now(timezone.utc).isoformat()

    # ── inactivity_scores ─────────────────────────────────────
    scores_col = db["inactivity_scores"]
    score_docs = []
    for _, row in df.iterrows():
        doc = {
            "contact_id":               row["contact_id"],
            "scored_at":                now,
            "days_since":               float(row["days_since"]),
            "ghost_probability":        float(row.get("ghost_probability",
                                              row["inactivity_anomaly_score"])),
            "inactivity_anomaly_score": float(row["inactivity_anomaly_score"]),
            "ghost_pattern":            row["ghost_pattern"],
            "cluster_id":               int(row.get("cluster_id", -1)),
            "activity_drop_ratio":      float(row["activity_drop_ratio"]),
            "consecutive_no_reply":     int(row["consecutive_no_reply"]),
            "gap_slope":                float(row["gap_slope"]),
            "mutual_silence_score":     float(row["mutual_silence_score"]),
            "one_sided_flag":           int(row["one_sided_flag"]),
            "msgs_30d":                 int(row["msgs_30d"]),
            "msgs_7d":                  int(row["msgs_7d"]),
        }
        score_docs.append(doc)

    scores_col.delete_many({})   # replace with latest scores
    scores_col.insert_many(score_docs)
    print(f"  inactivity_scores   : {len(score_docs)} docs upserted")

    # ── inactivity_alerts ─────────────────────────────────────
    alerts_col = db["inactivity_alerts"]
    alert_docs = []

    ghosted    = df[df.get("is_predicted_ghost", df["if_prediction"] == -1) == True]
    at_risk    = df[
        (df["ghost_probability"] >= 0.4) &
        (df["ghost_probability"] <  0.5)
    ]

    for _, row in ghosted.iterrows():
        alert_docs.append({
            "contact_id":        row["contact_id"],
            "alert_type":        "ghosted",
            "ghost_pattern":     row["ghost_pattern"],
            "ghost_probability": float(row.get("ghost_probability", 0.5)),
            "days_since":        float(row["days_since"]),
            "urgency":           "high" if row["days_since"] > HARD_GHOST_DAYS else "medium",
            "created_at":        now,
            "resolved":          False,
        })

    for _, row in at_risk.iterrows():
        alert_docs.append({
            "contact_id":        row["contact_id"],
            "alert_type":        "at_risk",
            "ghost_pattern":     row["ghost_pattern"],
            "ghost_probability": float(row.get("ghost_probability", 0.4)),
            "days_since":        float(row["days_since"]),
            "urgency":           "low",
            "created_at":        now,
            "resolved":          False,
        })

    alerts_col.delete_many({"resolved": False})
    if alert_docs:
        alerts_col.insert_many(alert_docs)
    print(f"  inactivity_alerts   : {len(alert_docs)} alerts written "
          f"({len(ghosted)} ghosted, {len(at_risk)} at-risk)")

    # ── model_metadata ────────────────────────────────────────
    meta_col = db["model_metadata"]
    meta_doc = {
        "model_name":       "inactivity_ghosting_detector",
        "version":          "1.0",
        "trained_at":       now,
        "n_contacts":       len(df),
        "n_ghosted_gt":     int(df["is_ghosted_gt"].sum()),
        "feature_cols":     FEATURE_COLS,
        "thresholds": {
            "hard_ghost_days":  HARD_GHOST_DAYS,
            "slow_fade_days":   SLOW_FADE_DAYS,
            "one_sided_min":    ONE_SIDED_MIN,
            "active_window":    ACTIVE_WINDOW,
            "ghost_prob_alert": 0.5,
            "ghost_prob_risk":  0.4,
        },
        "ghost_pattern_dist": df["ghost_pattern"].value_counts().to_dict(),
        "rf_model_path":    str(RF_MODEL_PATH),
        "if_model_path":    str(IF_MODEL_PATH),
    }
    meta_col.replace_one(
        {"model_name": "inactivity_ghosting_detector"},
        meta_doc,
        upsert=True,
    )
    print(f"  model_metadata      : metadata upserted")


def load_alerts_from_mongo(urgency: str = None) -> pd.DataFrame:
    """
    Read active (unresolved) inactivity alerts from MongoDB.
    Optionally filter by urgency: 'high', 'medium', 'low'
    """
    db    = get_db()
    query = {"resolved": False}
    if urgency:
        query["urgency"] = urgency
    docs = list(db["inactivity_alerts"].find(query, {"_id": 0}))
    return pd.DataFrame(docs) if docs else pd.DataFrame()


def resolve_alert(contact_id: str):
    """Mark alerts for a contact as resolved (after you've reconnected)."""
    db = get_db()
    result = db["inactivity_alerts"].update_many(
        {"contact_id": contact_id, "resolved": False},
        {"$set": {"resolved": True, "resolved_at": datetime.now(timezone.utc).isoformat()}},
    )
    print(f"  Resolved {result.modified_count} alert(s) for contact {contact_id}")


# ─────────────────────────────────────────────────────────────
# 10. Export local JSON (backup)
# ─────────────────────────────────────────────────────────────

def export_results(df: pd.DataFrame):
    out_cols = [
        "contact_id", "days_since", "ghost_probability",
        "inactivity_anomaly_score", "ghost_pattern", "cluster_id",
        "activity_drop_ratio", "consecutive_no_reply",
        "gap_slope", "msgs_30d", "msgs_7d",
        "mutual_silence_score", "one_sided_flag",
        "is_ghosted_gt",
    ]
    records = df[out_cols].to_dict(orient="records")
    with open("inactivity_scores.json", "w") as f:
        json.dump(records, f, indent=2, default=str)

    print(f"\n  Local backup → inactivity_scores.json  ({len(records)} rows)")


# ─────────────────────────────────────────────────────────────
# 11. Real-time inference
# ─────────────────────────────────────────────────────────────

def load_models():
    rf  = joblib.load(RF_MODEL_PATH)  if RF_MODEL_PATH.exists()  else None
    iso = joblib.load(IF_MODEL_PATH)
    scl = joblib.load(SCALER_PATH)
    return rf, iso, scl


def predict_contact_inactivity(
    contact_id:            str,
    days_since:            float,
    msgs_7d:               int,
    msgs_14d:              int,
    msgs_30d:              int,
    msgs_90d:              int,
    mean_gap_hrs:          float,
    gap_slope:             float,
    consecutive_no_reply:  int,
    activity_drop_ratio:   float,
    mutual_silence_score:  float,
    one_sided_flag:        float,
    response_ratio_trend:  float,
    contact_health:        float,
    contact_decay:         float,
    contact_churn:         float,
    rf=None, iso=None, scl=None,
    persist_to_mongo:      bool = False,
) -> dict:
    """
    Score a single contact for inactivity / ghosting in real time.
    Set persist_to_mongo=True to write the score to MongoDB immediately.
    """
    if rf is None or iso is None:
        rf, iso, scl = load_models()

    # Fill in missing features with neutral defaults
    feat_vals = {f: 0.0 for f in FEATURE_COLS}
    feat_vals.update({
        "days_since":             days_since,
        "msgs_7d":                msgs_7d,
        "my_msgs_7d":             msgs_7d // 2,
        "their_msgs_7d":          msgs_7d // 2,
        "active_days_7d":         min(7, msgs_7d),
        "msgs_14d":               msgs_14d,
        "my_msgs_14d":            msgs_14d // 2,
        "their_msgs_14d":         msgs_14d // 2,
        "active_days_14d":        min(14, msgs_14d),
        "msgs_30d":               msgs_30d,
        "my_msgs_30d":            msgs_30d // 2,
        "their_msgs_30d":         msgs_30d // 2,
        "active_days_30d":        min(30, msgs_30d),
        "msgs_90d":               msgs_90d,
        "my_msgs_90d":            msgs_90d // 2,
        "their_msgs_90d":         msgs_90d // 2,
        "active_days_90d":        min(90, msgs_90d),
        "mean_gap_hrs":           mean_gap_hrs,
        "median_gap_hrs":         mean_gap_hrs,
        "max_gap_hrs":            mean_gap_hrs * 3,
        "p90_gap_hrs":            mean_gap_hrs * 2,
        "gap_slope":              gap_slope,
        "gap_acceleration":       0.0,
        "gap_volatility":         mean_gap_hrs * 0.5,
        "response_ratio_trend":   response_ratio_trend,
        "consecutive_no_reply":   consecutive_no_reply,
        "activity_drop_ratio":    activity_drop_ratio,
        "mutual_silence_score":   mutual_silence_score,
        "one_sided_flag":         one_sided_flag,
        "last_sender_was_me":     1 if one_sided_flag else 0,
        "contact_health":         contact_health,
        "contact_decay":          contact_decay,
        "contact_churn":          contact_churn,
        "contact_resp_ratio":     0.5,
        "contact_drift":          0,
        "contact_drift_severe":   0,
        "contact_sentiment":      0.5,
    })

    X    = np.array([[feat_vals[f] for f in FEATURE_COLS]], dtype=np.float32)
    X_sc = scl.transform(X)

    if_score_raw  = iso.decision_function(X_sc)[0]
    if_norm       = float(1 - (if_score_raw + 0.5))   # approx normalise
    ghost_prob    = float(rf.predict_proba(X)[0, 1]) if rf else if_norm

    # Pattern classification
    row_proxy = {
        "days_since":           days_since,
        "activity_drop_ratio":  activity_drop_ratio,
        "gap_slope":            gap_slope,
        "consecutive_no_reply": consecutive_no_reply,
        "one_sided_flag":       one_sided_flag,
        "mutual_silence_score": mutual_silence_score,
        "gap_volatility":       mean_gap_hrs * 0.5,
    }
    pattern = assign_ghost_pattern(pd.Series(row_proxy))

    result = {
        "contact_id":               contact_id,
        "ghost_probability":        round(ghost_prob, 4),
        "inactivity_anomaly_score": round(if_norm, 4),
        "ghost_pattern":            pattern,
        "days_since":               days_since,
        "is_ghosted":               ghost_prob >= 0.5,
        "urgency": (
            "CRITICAL" if days_since > HARD_GHOST_DAYS and ghost_prob > 0.7 else
            "HIGH"     if ghost_prob > 0.6 else
            "MEDIUM"   if ghost_prob > 0.4 else
            "low"
        ),
    }

    if persist_to_mongo:
        try:
            db = get_db()
            db["inactivity_scores"].replace_one(
                {"contact_id": contact_id},
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
    print("=" * 60)
    print("  Model 5: Long Inactivity / Ghosting Detection")
    print("=" * 60)

    # ── Load & feature engineering ────────────────────────────
    contacts, messages = load_data()
    df                 = build_inactivity_features(messages, contacts)

    # ── Train models ──────────────────────────────────────────
    iso, scaler, df    = train_isolation_forest(df)
    rf, df             = train_random_forest(df)

    if "ghost_probability" not in df.columns:
        df["ghost_probability"]  = df["inactivity_anomaly_score"]
        df["is_predicted_ghost"] = (df["inactivity_anomaly_score"] >= 0.6).astype(int)

    # ── Clustering ────────────────────────────────────────────
    df = cluster_inactivity_patterns(df, scaler)

    # ── Evaluate & visualise ──────────────────────────────────
    evaluate(df)
    plot_results(df, rf)

    # ── Persist to MongoDB ────────────────────────────────────
    try:
        save_to_mongo(df, rf, iso)
    except Exception as e:
        print(f"\n  MongoDB skipped: {e}")
        print("  (Saving locally instead)")

    # ── Local export ──────────────────────────────────────────
    export_results(df)

    # ── Real-time inference demo ──────────────────────────────
    print("\n── Real-time Inference Demo ─────────────────────────────")
    test_cases = [
        # (id,            d_since, 7d, 14d, 30d, 90d, gap_hrs, slope, streak, drop, mut_sil, one_side, resp_tr, health, decay, churn)
        ("contact_A",     90,  0,  0,  0,  3,  200.0,  12.0,  8,  0.92, 1.0, 1.0, -0.4, 0.2, 0.5, 0.8),
        ("contact_B",      3, 12, 20, 45, 90,    6.0,  -0.5,  0,  0.05, 0.0, 0.0,  0.2, 0.9, 0.0, 0.1),
        ("contact_C",     45,  2,  3,  8, 30,   80.0,   8.0,  5,  0.70, 0.0, 1.0, -0.3, 0.4, 0.3, 0.6),
        ("contact_D",     20,  5,  9, 18, 55,   30.0,   2.0,  2,  0.35, 0.0, 0.3, -0.1, 0.6, 0.1, 0.3),
    ]
    descriptions = [
        "Hard ghost: 90 days silent, was active",
        "Active: messaged yesterday, healthy",
        "One-sided: only me sending for 45 days",
        "Slow fade: reducing frequency",
    ]

    print(f"\n  {'Description':<42} {'Prob':>6}  {'Pattern':<15}  Urgency")
    print("  " + "-" * 80)
    for args, desc in zip(test_cases, descriptions):
        r = predict_contact_inactivity(*args, rf=rf, iso=iso, scl=scaler)
        print(f"  {desc:<42} {r['ghost_probability']:>6.3f}  "
              f"{r['ghost_pattern']:<15}  {r['urgency']}")

    # ── Show MongoDB alerts ────────────────────────────────────
    print("\n── Active MongoDB Alerts ────────────────────────────────")
    try:
        alerts = load_alerts_from_mongo()
        if alerts.empty:
            print("  No alerts found")
        else:
            print(alerts[["contact_id", "alert_type", "urgency",
                           "ghost_probability", "days_since"]].head(10).to_string(index=False))
    except Exception as e:
        print(f"  Could not fetch alerts: {e}")

    print("\nDone ✓")


if __name__ == "__main__":
    main()