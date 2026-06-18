import axios from "axios";

export const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e?.msg ? e.msg : JSON.stringify(e))).join(" ");
  return String(detail);
}

export function pdfUrl(path) {
  return `${BACKEND_URL}${path}`;
}

export const LOGO_URL =
  process.env.REACT_APP_LOGO_URL ||
  "https://customer-assets.emergentagent.com/job_ck-mysuru-portal/artifacts/5ft1s8b1_CK%20Logo.png";
