// Central API service for Autopilot Social
// All requests go through Vite's proxy → http://localhost:8000

const BASE = '/api';

async function apiFetch(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Contacts ──────────────────────────────────────────────────────────────────
export const getContacts = (filters = {}) => {
    const params = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null))
    ).toString();
    return apiFetch(`/contacts/${params ? `?${params}` : ''}`);
};

export const getContactSummary = () => apiFetch('/contacts/summary');

export const getContact = (contactId) => apiFetch(`/contacts/${contactId}`);

// ── Actions (Alerts / Reminders) ──────────────────────────────────────────────
export const getActions = (filters = {}) => {
    const params = new URLSearchParams(
        Object.fromEntries(Object.entries(filters).filter(([, v]) => v != null))
    ).toString();
    return apiFetch(`/actions/${params ? `?${params}` : ''}`);
};

export const updateActionStatus = (actionId, status) =>
    apiFetch(`/actions/${actionId}/status?status=${status}`, { method: 'PATCH' });

export const deleteAction = (actionId) =>
    apiFetch(`/actions/${actionId}`, { method: 'DELETE' });

// ── Pipeline ──────────────────────────────────────────────────────────────────
export const getPipelineStatus = () => apiFetch('/pipeline/status');

export const getPipelineHistory = () => apiFetch('/pipeline/history');

export const triggerPipeline = (trigger = 'manual') =>
    apiFetch(`/pipeline/run?trigger=${trigger}`, { method: 'POST' });

// ── Ingest ────────────────────────────────────────────────────────────────────
export const ingestSynthetic = (n = 50) =>
    apiFetch(`/ingest/synthetic?n=${n}`, { method: 'POST' });
// ── n8n API ──
export async function testN8nConnection() {
    const res = await fetch(`${BASE_URL}/n8n/test`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
}
