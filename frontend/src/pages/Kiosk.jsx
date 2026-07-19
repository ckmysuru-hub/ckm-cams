import { useEffect, useMemo, useRef, useState } from "react";
import { api, BACKEND_URL, formatApiError } from "@/lib/api";
import { Logo } from "@/components/Brand";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  Loader2,
  LogIn,
  LogOut,
  QrCode,
  Search,
  UserCheck,
  Users,
} from "lucide-react";

const FACE_HASH_SIZE = 16;
const FACE_MATCH_MAX_DISTANCE = 86;
const FACE_AUTO_MATCHES = 2;

const fmtTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

const assetUrl = (url) => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${BACKEND_URL}${url.startsWith("/") ? url : `/${url}`}`;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const cropForFace = async (source) => {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return { sx: 0, sy: 0, sw: 1, sh: 1 };

  if ("FaceDetector" in window) {
    try {
      const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(source);
      const box = faces?.[0]?.boundingBox;
      if (box?.width && box?.height) {
        const pad = Math.max(box.width, box.height) * 0.28;
        const sx = Math.max(0, box.x - pad);
        const sy = Math.max(0, box.y - pad);
        const ex = Math.min(width, box.x + box.width + pad);
        const ey = Math.min(height, box.y + box.height + pad);
        return { sx, sy, sw: ex - sx, sh: ey - sy };
      }
    } catch (_) {
      // Fall through to centered crop when the browser cannot detect this frame.
    }
  }

  const side = Math.min(width, height);
  return { sx: (width - side) / 2, sy: (height - side) / 2, sw: side, sh: side };
};

const visualHash = async (source) => {
  const crop = await cropForFace(source);
  const canvas = document.createElement("canvas");
  canvas.width = FACE_HASH_SIZE;
  canvas.height = FACE_HASH_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, FACE_HASH_SIZE, FACE_HASH_SIZE);
  const data = ctx.getImageData(0, 0, FACE_HASH_SIZE, FACE_HASH_SIZE).data;
  const gray = [];
  for (let i = 0; i < data.length; i += 4) {
    gray.push(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const avg = gray.reduce((sum, value) => sum + value, 0) / gray.length;
  return gray.map((value) => (value >= avg ? 1 : 0));
};

const hashDistance = (a, b) => {
  if (!a?.length || !b?.length || a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) distance += 1;
  }
  return distance;
};

export default function Kiosk() {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("in"); // in | out
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [recent, setRecent] = useState([]);
  const [now, setNow] = useState(new Date());
  const [scanActive, setScanActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [students, setStudents] = useState([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [faceActive, setFaceActive] = useState(false);
  const [faceError, setFaceError] = useState("");
  const [faceStatus, setFaceStatus] = useState("Load profile photos, then start the camera.");
  const [faceHashes, setFaceHashes] = useState([]);
  const [faceLoading, setFaceLoading] = useState(false);
  const [faceMatches, setFaceMatches] = useState([]);
  const inputRef = useRef(null);
  const qrVideoRef = useRef(null);
  const faceVideoRef = useRef(null);
  const qrStreamRef = useRef(null);
  const faceStreamRef = useRef(null);
  const scanBusyRef = useRef(false);
  const faceBusyRef = useRef(false);
  const faceCandidateRef = useRef({ id: null, count: 0 });

  const refreshRecent = () => api.get("/kiosk/recent").then((r) => setRecent(r.data)).catch(() => {});
  const refreshStudents = () => api.get("/kiosk/active-students").then((r) => setStudents(r.data)).catch(() => setStudents([]));

  useEffect(() => {
    inputRef.current?.focus();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    refreshStudents();
  }, []);

  // Recent list is auth-only; safely ignore if anonymous.
  useEffect(() => {
    let ignore = false;
    const tick = () => api.get("/kiosk/recent").then((r) => !ignore && setRecent(r.data)).catch(() => {});
    tick();
    const t = setInterval(tick, 10000);
    return () => {
      ignore = true;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const buildHashes = async () => {
      const withPhotos = students.filter((student) => student.photo_url);
      setFaceHashes([]);
      setFaceMatches([]);
      if (!withPhotos.length) {
        setFaceStatus("No active student profile photos are available for face check-in.");
        return;
      }
      setFaceLoading(true);
      setFaceStatus("Preparing active student profile photos...");
      const prepared = [];
      for (const student of withPhotos) {
        if (cancelled) return;
        try {
          const image = await loadImage(assetUrl(student.photo_url));
          prepared.push({ student, hash: await visualHash(image) });
        } catch (_) {
          // Skip photos the browser cannot load or read.
        }
      }
      if (!cancelled) {
        setFaceHashes(prepared);
        setFaceStatus(
          prepared.length
            ? `${prepared.length} profile photo${prepared.length === 1 ? "" : "s"} ready for face check-in.`
            : "Profile photos could not be prepared in this browser."
        );
        setFaceLoading(false);
      }
    };
    buildHashes();
    return () => {
      cancelled = true;
    };
  }, [students]);

  useEffect(() => {
    if (!scanActive) {
      qrStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      qrStreamRef.current = null;
      return;
    }
    let cancelled = false;
    let detector = null;
    const start = async () => {
      setScanError("");
      if (!("BarcodeDetector" in window)) {
        setScanError("QR camera scan is not supported on this browser. Use the student list or code below.");
        setScanActive(false);
        return;
      }
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        qrStreamRef.current = stream;
        if (qrVideoRef.current) {
          qrVideoRef.current.srcObject = stream;
          await qrVideoRef.current.play();
        }
        const tick = async () => {
          if (cancelled || !qrVideoRef.current || scanBusyRef.current) return;
          try {
            const codes = await detector.detect(qrVideoRef.current);
            const value = codes?.[0]?.rawValue;
            if (value) {
              scanBusyRef.current = true;
              await submitValue(value);
              setScanActive(false);
              scanBusyRef.current = false;
            }
          } catch (_) {
            // Keep scanning.
          }
          if (!cancelled) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } catch {
        setScanError("Camera permission was denied or no camera is available. Use the student list or code below.");
        setScanActive(false);
      }
    };
    start();
    return () => {
      cancelled = true;
      qrStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      qrStreamRef.current = null;
      scanBusyRef.current = false;
    };
  }, [scanActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!faceActive) {
      faceStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      faceStreamRef.current = null;
      faceCandidateRef.current = { id: null, count: 0 };
      return;
    }
    let cancelled = false;
    const start = async () => {
      setFaceError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setFaceError("Camera access is not supported on this browser.");
        setFaceActive(false);
        return;
      }
      if (!faceHashes.length) {
        setFaceError("No active student profile photos are ready for matching.");
        setFaceActive(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        faceStreamRef.current = stream;
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          await faceVideoRef.current.play();
        }
        setFaceStatus("Looking for a matching active student...");
        const tick = async () => {
          if (cancelled || !faceVideoRef.current || faceBusyRef.current || busy) return;
          faceBusyRef.current = true;
          try {
            const liveHash = await visualHash(faceVideoRef.current);
            const ranked = faceHashes
              .map((item) => {
                const distance = hashDistance(liveHash, item.hash);
                const confidence = Math.max(0, Math.round((1 - distance / (FACE_HASH_SIZE * FACE_HASH_SIZE)) * 100));
                return { ...item, distance, confidence };
              })
              .sort((a, b) => a.distance - b.distance)
              .slice(0, 3);
            setFaceMatches(ranked);
            const best = ranked[0];
            if (best && best.distance <= FACE_MATCH_MAX_DISTANCE) {
              const current = faceCandidateRef.current;
              const count = current.id === best.student.id ? current.count + 1 : 1;
              faceCandidateRef.current = { id: best.student.id, count };
              setFaceStatus(`Recognized ${best.student.full_name} (${best.confidence}% match).`);
              if (count >= FACE_AUTO_MATCHES) {
                faceCandidateRef.current = { id: null, count: 0 };
                await submitStudent(best.student);
                setFaceActive(false);
              }
            } else {
              faceCandidateRef.current = { id: null, count: 0 };
              setFaceStatus("No confident match yet. Face the camera with good light.");
            }
          } catch (_) {
            setFaceStatus("Unable to read this camera frame. Adjust position and try again.");
          } finally {
            faceBusyRef.current = false;
          }
          if (!cancelled) window.setTimeout(tick, 900);
        };
        window.setTimeout(tick, 700);
      } catch {
        setFaceError("Camera permission was denied or no camera is available.");
        setFaceActive(false);
      }
    };
    start();
    return () => {
      cancelled = true;
      faceStreamRef.current?.getTracks?.().forEach((track) => track.stop());
      faceStreamRef.current = null;
      faceBusyRef.current = false;
      faceCandidateRef.current = { id: null, count: 0 };
    };
  }, [faceActive, faceHashes, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    const list = q
      ? students.filter((student) =>
          `${student.full_name} ${student.student_code}`.toLowerCase().includes(q)
        )
      : students;
    return list.slice(0, 60);
  }, [students, studentQuery]);

  const submitValue = async (value) => {
    const raw = (value || "").trim();
    const codeNumber = raw.replace(/\D/g, "");
    if (!raw || (!raw.includes("CKM-CHECKIN:") && !raw.includes("CKM-") && !codeNumber)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const path = mode === "in" ? "/kiosk/checkin" : "/kiosk/checkout";
      const payloadCode = raw.includes("CKM-CHECKIN:") || raw.includes("CKM-") ? raw : `CKM-${codeNumber}`;
      const { data } = await api.post(path, { code: payloadCode });
      setFeedback({ ok: true, ...data, mode });
      setCode("");
      setTimeout(() => setFeedback(null), 5000);
      refreshRecent();
      refreshStudents();
    } catch (ex) {
      setFeedback({ ok: false, error: formatApiError(ex.response?.data?.detail) || "Could not process" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const submitStudent = (student) => submitValue(student?.student_code || "");

  const submit = async (e) => {
    e?.preventDefault?.();
    await submitValue(code);
  };

  const pad = (k) => {
    if (k === "back") setCode((c) => c.slice(0, -1));
    else if (k === "clear") setCode("");
    else setCode((c) => (c + k).replace(/\D/g, ""));
  };

  return (
    <div className="min-h-screen flex flex-col" data-testid="kiosk-page" style={{ background: "var(--ck-cream)" }}>
      <header className="px-4 sm:px-8 py-4 sm:py-5 border-b border-[var(--ck-line)] bg-white flex items-center justify-between gap-3">
        <Logo />
        <div className="text-right">
          <div className="ck-display text-xl sm:text-2xl font-semibold leading-none">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-xs text-[var(--ck-muted)] mt-1">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })}</div>
        </div>
      </header>

      <main className="flex-1 grid xl:grid-cols-[1fr_380px]">
        <div className="p-4 sm:p-8 lg:p-10">
          <div className="mx-auto max-w-5xl">
            <div className="text-[11px] uppercase tracking-[0.3em] font-semibold text-[var(--ck-orange)] mb-2 text-center">Self check-in</div>
            <h1 className="ck-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-center mb-8 leading-[1.05]">
              Welcome to the board.
            </h1>

            <div className="flex justify-center gap-2 mb-6">
              <button
                onClick={() => setMode("in")}
                data-testid="kiosk-mode-in"
                className={`px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 transition-all ${
                  mode === "in" ? "bg-[var(--ck-black)] text-white" : "bg-white border border-[var(--ck-line)] text-[var(--ck-muted)]"
                }`}
              >
                <LogIn size={16} /> Check In
              </button>
              <button
                onClick={() => setMode("out")}
                data-testid="kiosk-mode-out"
                className={`px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 transition-all ${
                  mode === "out" ? "bg-[var(--ck-orange)] text-white" : "bg-white border border-[var(--ck-line)] text-[var(--ck-muted)]"
                }`}
              >
                <LogOut size={16} /> Check Out
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <section className="ck-card-elevated p-4" data-testid="kiosk-face-card">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Face check-in</div>
                    <div className="ck-display text-xl font-semibold">Recognize from profile photo</div>
                  </div>
                  <Camera size={22} className="text-[var(--ck-orange)]" />
                </div>
                {faceActive ? (
                  <video ref={faceVideoRef} className="w-full aspect-video rounded-md bg-black object-cover" muted playsInline />
                ) : (
                  <button
                    type="button"
                    onClick={() => setFaceActive(true)}
                    disabled={busy || faceLoading || !faceHashes.length}
                    className="w-full h-12 rounded-md border border-[var(--ck-line)] bg-white flex items-center justify-center gap-2 font-semibold text-sm hover:border-[var(--ck-orange)] disabled:opacity-50"
                  >
                    {faceLoading ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
                    Start face check-in
                  </button>
                )}
                {faceActive && (
                  <button type="button" onClick={() => setFaceActive(false)} className="mt-3 w-full ck-btn-ghost text-sm">
                    Stop face check-in
                  </button>
                )}
                <div className="mt-3 text-xs text-[var(--ck-muted)] flex items-start gap-2">
                  <ImageIcon size={14} className="mt-0.5 shrink-0" />
                  <span>{faceStatus}</span>
                </div>
                {faceMatches.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {faceMatches.map((match) => (
                      <button
                        key={match.student.id}
                        type="button"
                        onClick={() => submitStudent(match.student)}
                        disabled={busy}
                        className="text-left rounded-lg border border-[var(--ck-line)] bg-white p-2 hover:border-[var(--ck-orange)] disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{match.student.full_name}</span>
                          <span className="text-xs text-[var(--ck-muted)]">{match.confidence}%</span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--ck-muted)]">{match.student.student_code}</div>
                      </button>
                    ))}
                  </div>
                )}
                {faceError && <div className="text-xs text-red-700 mt-3">{faceError}</div>}
              </section>

              <section className="ck-card-elevated p-4" data-testid="kiosk-student-list">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">Active students</div>
                    <div className="ck-display text-xl font-semibold">Pick a student</div>
                  </div>
                  <Users size={22} className="text-[var(--ck-orange)]" />
                </div>
                <div className="relative mb-3">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ck-muted)]" />
                  <input
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    placeholder="Search name or code"
                    className="ck-input w-full pl-9 py-3 text-sm"
                    data-testid="kiosk-student-search"
                  />
                </div>
                <div className="max-h-[332px] overflow-y-auto pr-1 space-y-2">
                  {visibleStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => submitStudent(student)}
                      disabled={busy}
                      className="w-full rounded-lg border border-[var(--ck-line)] bg-white p-3 flex items-center gap-3 text-left hover:border-[var(--ck-orange)] disabled:opacity-50"
                      data-testid={`kiosk-student-${student.id}`}
                    >
                      {student.photo_url ? (
                        <img src={assetUrl(student.photo_url)} alt="" className="h-10 w-10 rounded-md object-cover bg-[var(--ck-cream)]" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-[var(--ck-cream)] flex items-center justify-center text-[var(--ck-muted)]">
                          <Users size={16} />
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold truncate">{student.full_name}</span>
                        <span className="block text-[10px] font-mono text-[var(--ck-muted)]">{student.student_code}</span>
                      </span>
                      <span className="ck-pill ck-pill-black">{mode === "in" ? "In" : "Out"}</span>
                    </button>
                  ))}
                  {!visibleStudents.length && (
                    <div className="text-xs text-[var(--ck-muted)] py-8 text-center">No active students match this search.</div>
                  )}
                </div>
              </section>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 mt-4 items-start">
              <section className="ck-card-elevated p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ck-muted)]">QR check-in</div>
                    <div className="ck-display text-xl font-semibold">Scan student ID card</div>
                  </div>
                  <QrCode size={22} className="text-[var(--ck-orange)]" />
                </div>
                {scanActive ? (
                  <video ref={qrVideoRef} className="w-full aspect-video rounded-md bg-black object-cover" muted playsInline />
                ) : (
                  <button type="button" onClick={() => setScanActive(true)} className="w-full h-12 rounded-md border border-[var(--ck-line)] bg-white flex items-center justify-center gap-2 font-semibold text-sm hover:border-[var(--ck-orange)]">
                    <Camera size={16} /> Start QR scan
                  </button>
                )}
                {scanActive && (
                  <button type="button" onClick={() => setScanActive(false)} className="mt-3 w-full ck-btn-ghost text-sm">
                    Stop QR scan
                  </button>
                )}
                {scanError && <div className="text-xs text-red-700 mt-3">{scanError}</div>}
              </section>

              <form onSubmit={submit} className="ck-card-elevated p-4">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--ck-muted)] mb-2 block text-center">
                  Enter student code
                </label>
                <div className="flex rounded-2xl border-2 border-[var(--ck-line)] bg-white overflow-hidden focus-within:border-[var(--ck-black)]">
                  <div className="px-5 py-5 text-2xl font-mono tracking-wider bg-[var(--ck-cream)] border-r border-[var(--ck-line)] text-[var(--ck-muted)]">
                    CKM-
                  </div>
                  <input
                    ref={inputRef}
                    data-testid="kiosk-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="10001"
                    inputMode="numeric"
                    className="min-w-0 flex-1 px-6 py-5 text-2xl text-center font-mono tracking-wider bg-white focus:outline-none"
                    autoComplete="off"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => (
                    <button key={k} type="button" onClick={() => pad(k)} className="py-4 text-xl font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)] active:scale-[.97] transition">
                      {k}
                    </button>
                  ))}
                  <button type="button" onClick={() => pad("clear")} className="py-4 text-sm font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-red-400 hover:text-red-600">
                    Clear
                  </button>
                  <button type="button" onClick={() => pad("0")} className="py-4 text-xl font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)]">0</button>
                  <button type="button" onClick={() => pad("back")} className="py-4 text-sm font-semibold rounded-xl bg-white border border-[var(--ck-line)] hover:border-[var(--ck-black)]">
                    Back
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy || !code.replace(/\D/g, "")}
                  data-testid="kiosk-submit"
                  className="mt-5 w-full py-4 rounded-2xl text-base font-semibold bg-[var(--ck-black)] text-white hover:bg-[var(--ck-orange)] disabled:opacity-50 transition flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : mode === "in" ? <LogIn size={18} /> : <LogOut size={18} />}
                  {busy ? "Processing..." : mode === "in" ? "Check In" : "Check Out"}
                </button>
              </form>
            </div>

            {feedback && (
              <div
                data-testid="kiosk-feedback"
                className={`mt-8 mx-auto w-full max-w-md p-6 rounded-2xl text-center ${
                  feedback.ok ? "bg-white border-2 border-green-200" : "bg-red-50 border-2 border-red-200"
                }`}
              >
                {feedback.ok ? (
                  <>
                    <CheckCircle2 size={36} className="text-green-600 mx-auto mb-2" />
                    <div className="ck-display text-2xl font-semibold">{feedback.student_name}</div>
                    <div className="text-sm text-[var(--ck-muted)] mt-1">
                      {feedback.status === "checked_in" && `Checked in at ${fmtTime(feedback.check_in)}`}
                      {feedback.status === "checked_out" && `Checked out · ${feedback.duration_minutes} min spent`}
                      {feedback.status === "already_in" && `Already checked in at ${fmtTime(feedback.check_in)}`}
                      {feedback.status === "already_done" && "Already done for today"}
                      {feedback.status === "already_out" && "Already checked out"}
                    </div>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={36} className="text-red-600 mx-auto mb-2" />
                    <div className="text-base font-semibold">{feedback.error}</div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="bg-white border-t xl:border-t-0 xl:border-l border-[var(--ck-line)] p-4 sm:p-6 overflow-y-auto" data-testid="kiosk-recent">
          <div className="text-[11px] uppercase tracking-[0.2em] font-semibold text-[var(--ck-orange)] mb-1">Today on the board</div>
          <div className="ck-display text-xl font-semibold mb-4">{recent.length} check-in{recent.length === 1 ? "" : "s"}</div>
          <div className="space-y-2">
            {recent.map((c) => (
              <div key={c.id} className="ck-card p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.student_name}</div>
                  <div className="text-[10px] font-mono text-[var(--ck-muted)]">{c.student_code}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs flex items-center gap-1 text-[var(--ck-muted)]"><Clock size={11} /> {fmtTime(c.check_in)}</div>
                  {c.check_out && <div className="text-[10px] text-green-700">Out · {fmtTime(c.check_out)}</div>}
                </div>
              </div>
            ))}
            {!recent.length && <div className="text-xs text-[var(--ck-muted)] py-8 text-center">No check-ins yet today.</div>}
          </div>
        </aside>
      </main>
    </div>
  );
}
