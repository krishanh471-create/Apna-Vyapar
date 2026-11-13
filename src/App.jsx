import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import {
  LayoutDashboard, Users, Package, Receipt, Wallet, Plus, Search, Download, Upload,
  Lock, IndianRupee, CalendarCheck, Menu, Languages, Store, Settings as SettingsIcon,
  LogOut, KeyRound, QrCode, MoreVertical, Ban, PauseCircle, Trash2, RotateCcw, X
} from "lucide-react";
import { all, put, remove, exportProfile, listProfiles, saveProfile, clearProfile } from "./db";
import { derivePinHash, weakPin } from "./security";
import { businessTypes, isAllowed } from "./businessTypes";
import { createPayout } from "./payouts";
import "./styles.css";

const demoPeople = [
  { name: "Aarav Sharma", phone: "9876543210", status: "active", plan: "Monthly", due: "15/11/2026", kind: "member" },
  { name: "Priya Verma", phone: "9123456780", status: "active", plan: "Quarterly", due: "08/11/2026", kind: "member" }
];
const demoProducts = [
  { name: "Rice 5kg", sku: "RICE5", price: 320, costPrice: 280, stock: 18, low: 5, category: "Grocery" },
  { name: "Notebook", sku: "NOTE1", price: 45, costPrice: 25, stock: 32, low: 8, category: "Stationery" }
];
const today = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata" }).format(new Date());
const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const labels = {
  dashboard: ["Dashboard", "डैशबोर्ड"], people: ["Members / Students", "सदस्य / छात्र"], plans: ["Plans", "प्लान"],
  attendance: ["Attendance", "उपस्थिति"], batches: ["Batches", "बैच"], payments: ["Payments", "भुगतान"],
  products: ["Products", "उत्पाद"], sales: ["Billing", "बिलिंग"], customers: ["Customers", "ग्राहक"],
  udhaar: ["Udhaar / Credit", "उधार"], suppliers: ["Suppliers", "सप्लायर"], expenses: ["Expenses", "खर्च"],
  reports: ["Reports", "रिपोर्ट"], settings: ["Settings", "सेटिंग"], school: ["School System", "स्कूल सिस्टम"]
};
const iconMap = {
  dashboard: <LayoutDashboard />, people: <Users />, plans: <Receipt />, attendance: <CalendarCheck />,
  batches: <CalendarCheck />, payments: <IndianRupee />, products: <Package />, sales: <Receipt />,
  customers: <Users />, udhaar: <IndianRupee />, suppliers: <Users />, expenses: <Wallet />,
  reports: <Download />, settings: <SettingsIcon />, school: <Users />
};
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const normalizeEmail = (value) => value.trim().toLowerCase();
const profileType = () => window.localStorage.getItem("apna-vyapar-login-type") || "";
const setProfileType = (type) => window.localStorage.setItem("apna-vyapar-login-type", type);
const hashPin = (pin) => bcrypt.hash(pin, 12);
const matchesPin = async (pin, profile) => profile.pinHash?.startsWith("$2") ? bcrypt.compare(pin, profile.pinHash) : profile.pinSalt && (await derivePinHash(pin, Uint8Array.from(atob(profile.pinSalt), (x) => x.charCodeAt(0)))) === profile.pinHash;

function App() {
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [lang, setLang] = useState("en");
  const [mode, setMode] = useState("loading");
  const [loginError, setLoginError] = useState("");
  const [lockUntil, setLockUntil] = useState(0);
  const [failed, setFailed] = useState(0);
  useEffect(() => {
    (async () => {
      const saved = await listProfiles();
      setProfiles(saved);
      const activeId = window.sessionStorage.getItem("apna-vyapar-active-profile");
      const active = saved.find((item) => item.id === activeId);
      if (active) {
        setProfile(active);
        setSession({ profileId: active.id, role: "owner", timeoutMinutes: active.timeoutMinutes || 15 });
        setProfileType(active.type);
        setMode("app");
      } else setMode(saved.length ? "login" : "setup");
      if (navigator.storage?.persist) navigator.storage.persist();
      if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    })();
  }, []);
  useEffect(() => {
    if (!session) return undefined;
    let timer;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => logout(false), (session.timeoutMinutes || 15) * 60000); };
    ["click", "keydown", "touchstart"].forEach((event) => window.addEventListener(event, reset));
    reset();
    return () => { clearTimeout(timer); ["click", "keydown", "touchstart"].forEach((event) => window.removeEventListener(event, reset)); };
  }, [session]);
  const t = (en, hi) => lang === "hi" ? hi : en;
  const login = async (phone, pin, type) => {
    if (Date.now() < lockUntil) return setLoginError(t("Try again later.", "कुछ देर बाद प्रयास करें।"));
    if (!/^\d{10}$/.test(phone)) return setLoginError(t("Enter your 10-digit mobile number.", "10 अंकों का मोबाइल नंबर डालें।"));
    if (!/^\d{6}$/.test(pin)) return setLoginError(t("Enter your 6-digit PIN.", "6 अंकों का पिन डालें।"));
    const candidates = profiles.filter((item) => item.type === type && item.phone === phone);
    for (const candidate of candidates) {
      if (!candidate.pinHash) {
        setProfile(candidate); setMode("migrate"); return;
      }
      if (await matchesPin(pin, candidate)) {
        setProfileType(type); setLoginError(""); setFailed(0); setProfile(candidate);
        setSession({ profileId: candidate.id, role: "owner", timeoutMinutes: candidate.timeoutMinutes || 15 });
        window.sessionStorage.setItem("apna-vyapar-active-profile", candidate.id);
        setPage("dashboard"); setMode("app"); return;
      }
    }
    const next = failed + 1;
    setFailed(next); setLoginError(t("Galat PIN", "गलत PIN"));
    if (next >= 5) { const delays = [900000, 1800000, 3600000]; setLockUntil(Date.now() + delays[Math.min(next - 5, 2)]); setFailed(0); }
  };
  const logout = (confirmIt = true) => {
    if (confirmIt && !window.confirm(t("Log out of this profile?", "इस प्रोफाइल से लॉग आउट करें?"))) return;
    window.sessionStorage.removeItem("apna-vyapar-active-profile");
    setSession(null); setProfile(null); setMode("login"); setPage("dashboard"); window.history.replaceState({}, "", window.location.pathname);
  };
  if (mode === "loading") return <div className="lock"><Store size={52} /><h1>{t("Loading your data...", "डेटा लोड हो रहा है...")}</h1></div>;
  if (mode === "setup") return <Setup t={t} profiles={profiles} onDone={async (created) => { setProfiles([...profiles, created]); setProfileType(created.type); if (session) { setProfile(created); setSession({ profileId: created.id, role: "owner", timeoutMinutes: created.timeoutMinutes || 15 }); window.sessionStorage.setItem("apna-vyapar-active-profile", created.id); setPage("dashboard"); setMode("app"); } else setMode("login"); }} onBack={() => setMode("login")} showBack />;
  if (mode === "migrate") return <MigrateProfile profile={profile} t={t} onDone={(updated) => { setProfiles(profiles.map((item) => item.id === updated.id ? updated : item)); setMode("login"); }} />;
  if (mode === "login") return <Login profiles={profiles} t={t} onLogin={login} onCreate={() => setMode("setup")} onForgot={() => setMode("forgot")} lockUntil={lockUntil} error={loginError} />;
  if (mode === "forgot") return <ForgotPin profiles={profiles} t={t} onDone={(updated) => { if (updated) setProfiles(profiles.map((item) => item.id === updated.id ? updated : item)); setMode("login"); }} />;
  if (!profile || !session) return <Login profiles={profiles} t={t} onLogin={login} onCreate={() => setMode("setup")} onForgot={() => setMode("forgot")} lockUntil={lockUntil} error={loginError} />;
  const switchProfile = (nextId) => { const next = profiles.find((item) => item.id === nextId); if (!next) return; setProfile(next); setProfileType(next.type); setSession({ profileId: next.id, role: "owner", timeoutMinutes: next.timeoutMinutes || 15 }); window.sessionStorage.setItem("apna-vyapar-active-profile", next.id); setPage("dashboard"); };
  return <AppShell profile={profile} profiles={profiles} session={session} page={page} setPage={(next) => setPage(isAllowed(profile.type, next) ? next : "dashboard")} lang={lang} setLang={setLang} t={t} logout={logout} onSwitchProfile={switchProfile} onCreateProfile={() => setMode("setup")} onLock={() => { window.sessionStorage.removeItem("apna-vyapar-active-profile"); setSession(null); setProfile(null); setMode("login"); }} />;
}

function Setup({ t, profiles, onDone, onBack, showBack }) {
  const [data, setData] = useState({ name: "", ownerName: "", phone: "", email: "", type: "gym", customBusinessType: "", customBusinessTypeText: "", pin: "", pinAgain: "" });
  const [errors, setErrors] = useState({});
  const update = (key, value) => setData((current) => ({ ...current, [key]: value }));
  const create = async () => {
    const next = {};
    if (!data.name.trim()) next.name = t("Business name is required.", "व्यवसाय का नाम जरूरी है।");
    if (data.type === "other" && (!data.customBusinessType || (data.customBusinessType === "custom" && !data.customBusinessTypeText.trim()))) next.customBusinessType = t("Choose or enter your business type.", "बिजनेस टाइप चुनें या लिखें।");
    if (!data.ownerName.trim()) next.ownerName = t("Owner name is required.", "मालिक का नाम जरूरी है।");
    if (!/^\d{10}$/.test(data.phone)) next.phone = t("Enter a 10-digit Indian phone number.", "10 अंकों का भारतीय फोन नंबर डालें।");
    if (data.email.trim() && !validEmail(data.email)) next.email = t("Enter a valid email address.", "मान्य ईमेल डालें।");
    if (weakPin(data.pin)) next.pin = t("Choose a strong 6-digit PIN.", "मजबूत 6 अंकों का PIN चुनें।");
    if (data.pin !== data.pinAgain) next.pinAgain = t("PINs do not match.", "PIN समान नहीं हैं।");
    setErrors(next);
    if (Object.keys(next).length) return;
    const sameType = profiles.filter((item) => item.type === data.type);
    for (const item of sameType) if (item.pinHash && await matchesPin(data.pin, item)) {
      setErrors({ pin: t("This PIN is already used for this business type.", "इस बिजनेस टाइप में यह PIN पहले से है।") }); return;
    }
    const id = crypto.randomUUID();
    const created = { id, name: data.name.trim(), ownerName: data.ownerName.trim(), phone: data.phone, email: normalizeEmail(data.email), type: data.type, customBusinessType: data.customBusinessType === "custom" ? data.customBusinessTypeText.trim() : data.customBusinessType?.trim() || "", pinHash: await hashPin(data.pin), timeoutMinutes: 15, createdAt: Date.now() };
    await saveProfile(created);
    const rows = data.type === "retail" ? demoProducts : demoPeople;
    for (const row of rows) await put(id, data.type === "retail" ? "products" : "people", row);
    onDone(created);
  };
  const formCopy = { gym: ["Create Gym Profile", "Gym Name", "Enter Gym Name"], coaching: ["Create Coaching Centre Profile", "Coaching Centre Name", "Enter Coaching Centre Name"], yoga: ["Create Yoga & Dance Profile", "Yoga & Dance Business Name", "Enter Yoga & Dance Business Name"], retail: ["Create Retail Shop Profile", "Retail Shop Name", "Enter Retail Shop Name"], other: ["Create Business Profile", "Business Name", "Enter Business Name"], school: ["Create School Profile", "School Name", "Enter School Name"] }[data.type];
  return <div className="setup"><div className="setup-card"><div className="brand center"><Store /><b>Apna Vyapar</b></div><h1>{t(formCopy[0], formCopy[0])}</h1><Field placeholder={t(formCopy[2], formCopy[1])} value={data.name} error={errors.name} onChange={(value) => update("name", value)} /><Field placeholder={t(data.type === "school" ? "Principal / Administrator Name" : data.type === "coaching" ? "Owner / Director Name" : data.type === "yoga" ? "Owner / Instructor Name" : "Owner Name", "Owner name")} value={data.ownerName} error={errors.ownerName} onChange={(value) => update("ownerName", value)} /><Field placeholder={t("Mobile Number", "मोबाइल नंबर")} inputMode="tel" value={data.phone} error={errors.phone} onChange={(value) => update("phone", value.replace(/\D/g, "").slice(0, 10))} /><Field placeholder={t("Owner email (optional)", "मालिक का ईमेल (वैकल्पिक)")} type="email" value={data.email} error={errors.email} onChange={(value) => update("email", value)} /><div className="type-grid">{Object.entries(businessTypes).map(([id, item]) => { const Icon = item.icon; return <button type="button" className={data.type === id ? "selected" : ""} onClick={() => update("type", id)} key={id}><Icon /><b>{t(item.en, item.hi)}</b></button>; })}</div>{data.type === "other" && <><select value={data.customBusinessType} onChange={(e) => update("customBusinessType", e.target.value)}><option value="">{t("What is your business type?", "आपके बिजनेस का टाइप क्या है?")}</option><option>Clinic</option><option>Salon</option><option>Professional service</option><option value="custom">{t("Custom", "कस्टम")}</option></select>{data.customBusinessType === "custom" && <Field placeholder={t("Enter business type", "बिजनेस टाइप लिखें")} value={data.customBusinessTypeText} error={errors.customBusinessType} onChange={(value) => update("customBusinessTypeText", value)} />}</>}<Field placeholder={t("6-digit PIN", "6 अंकों का PIN")} inputMode="numeric" type="password" value={data.pin} error={errors.pin} onChange={(value) => update("pin", value.replace(/\D/g, "").slice(0, 6))} /><Field placeholder={t("Repeat PIN", "PIN दोहराएं")} inputMode="numeric" type="password" value={data.pinAgain} error={errors.pinAgain} onChange={(value) => update("pinAgain", value.replace(/\D/g, "").slice(0, 6))} /><button className="primary wide" onClick={create}>{t("Create profile", "प्रोफाइल बनाएं")}</button>{showBack && <button className="link-button back-login" onClick={onBack}>{t("Back to login", "लॉगिन पर वापस जाएं")}</button>}</div></div>;
}

function Field({ placeholder, value, onChange, error, ...props }) {
  return <div className="field"><input placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} {...props} />{error && <small className="error field-error">{error}</small>}</div>;
}

function Login({ profiles, t, onLogin, onCreate, onForgot, lockUntil, error }) {
  const [type, setType] = useState(profileType() || "gym");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [show, setShow] = useState(false);
  return <div className="setup"><div className="setup-card login-card"><div className="brand center"><Lock /><b>Apna Vyapar</b></div><h1>{t("Welcome back", "वापसी पर स्वागत है")}</h1><p>{t("Choose your business type", "अपना बिजनेस टाइप चुनें")}</p><div className="type-grid login-types">{Object.entries(businessTypes).map(([id, item]) => { const Icon = item.icon; return <button type="button" className={type === id ? "selected" : ""} onClick={() => { setType(id); setProfileType(id); setPin(""); }} key={id}><Icon /><b>{t(item.en, item.hi)}</b></button>; })}</div><input className="login-phone" inputMode="tel" maxLength="10" placeholder={t("Registered mobile number", "रजिस्टर्ड मोबाइल नंबर")} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} /><div className="pin-dots" aria-label="PIN entry">{[0, 1, 2, 3, 4, 5].map((i) => <span className={pin[i] ? "filled" : ""} key={i}>{pin[i] ? (show ? pin[i] : "•") : "·"}</span>)}</div><input autoFocus className="pin-input" inputMode="numeric" maxLength="6" type={show ? "text" : "password"} value={pin} placeholder={t("Enter your PIN", "अपना PIN डालें")} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} onKeyDown={(e) => e.key === "Enter" && onLogin(phone, pin, type)} /><button className="secondary wide" onClick={() => setShow(!show)}>{show ? t("Hide PIN", "PIN छिपाएं") : t("Show PIN", "PIN दिखाएं")}</button>{lockUntil > Date.now() && <p className="error">{t("Too many attempts. Please wait.", "बहुत प्रयास हुए। कृपया प्रतीक्षा करें।")}</p>}{error && <p className="error">{error}</p>}<button className="primary wide" onClick={() => onLogin(phone, pin, type)}>{t("Login", "लॉगिन")}</button><button className="link-button" onClick={onForgot}>{t("Forgot PIN?", "PIN भूल गए?")}</button><button className="link-button" onClick={onCreate}>{t("Create another profile", "दूसरी प्रोफाइल बनाएं")}</button></div></div>;
}

function MigrateProfile({ profile, t, onDone }) {
  const [pin, setPin] = useState(""); const [again, setAgain] = useState(""); const [email, setEmail] = useState(profile.email || ""); const [error, setError] = useState("");
  const save = async () => { if (!validEmail(email) || weakPin(pin) || pin !== again) return setError(t("Enter a valid email and matching strong PIN.", "मान्य ईमेल और समान मजबूत PIN डालें।")); const updated = { ...profile, email: normalizeEmail(email), pinHash: await hashPin(pin), pinSalt: undefined, needsMigration: false }; await saveProfile(updated); onDone(updated); };
  return <div className="setup"><div className="setup-card"><div className="brand center"><KeyRound /><b>{t("Add owner email", "मालिक का ईमेल जोड़ें")}</b></div><p>{t("Add an email and set a new PIN to continue.", "आगे बढ़ने के लिए ईमेल और नया PIN सेट करें।")}</p><Field type="email" placeholder={t("Owner email", "मालिक का ईमेल")} value={email} onChange={setEmail} /><Field inputMode="numeric" type="password" placeholder={t("New 6-digit PIN", "नया 6 अंकों का PIN")} value={pin} onChange={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))} /><Field inputMode="numeric" type="password" placeholder={t("Repeat PIN", "PIN दोहराएं")} value={again} onChange={(value) => setAgain(value.replace(/\D/g, "").slice(0, 6))} />{error && <p className="error">{error}</p>}<button className="primary wide" onClick={save}>{t("Save and continue", "सेव करके आगे बढ़ें")}</button></div></div>;
}

function EmailPrompt({ profile, t, onDone }) {
  const [email, setEmail] = useState(""); const [error, setError] = useState("");
  const save = async () => { if (!validEmail(email)) return setError(t("Enter a valid email address.", "मान्य ईमेल डालें।")); const updated = { ...profile, email: normalizeEmail(email) }; await saveProfile(updated); onDone(updated); };
  return <div className="setup"><div className="setup-card"><div className="brand center"><KeyRound /><b>{t("Add owner email", "मालिक का ईमेल जोड़ें")}</b></div><p>{t("Add your registered email once so PIN recovery can work.", "PIN रिकवरी के लिए अपना रजिस्टर्ड ईमेल एक बार जोड़ें।")}</p><Field type="email" placeholder={t("Owner email", "मालिक का ईमेल")} value={email} onChange={setEmail} error={error} /><button className="primary wide" onClick={save}>{t("Save email and continue", "ईमेल सेव करके आगे बढ़ें")}</button></div></div>;
}

function ForgotPin({ profiles, t, onDone }) {
  const [type, setType] = useState(profileType() || ""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [pin, setPin] = useState(""); const [again, setAgain] = useState(""); const [message, setMessage] = useState(""); const [verified, setVerified] = useState(false); const [attempts, setAttempts] = useState(0); const [locked, setLocked] = useState(0);
  const verify = () => { if (Date.now() < locked) return setMessage(t("Try again later.", "कुछ देर बाद प्रयास करें।")); const match = profiles.find((item) => item.type === type && item.phone === phone && normalizeEmail(item.email || "") === normalizeEmail(email)); if (!match) { const next = attempts + 1; setAttempts(next); setMessage(t("Details match nahi hui", "विवरण मेल नहीं खाए")); if (next >= 5) setLocked(Date.now() + 900000); return; } setMessage(""); setVerified(true); };
  const reset = async () => { const match = profiles.find((item) => item.type === type && item.phone === phone && normalizeEmail(item.email || "") === normalizeEmail(email)); if (!match || weakPin(pin) || pin !== again) return setMessage(t("Enter matching strong PINs.", "समान मजबूत PIN डालें।")); const updated = { ...match, pinHash: await hashPin(pin), pinSalt: undefined }; await saveProfile(updated); onDone(updated); };
  return <div className="setup"><div className="setup-card"><div className="brand center"><KeyRound /><b>{t("Reset PIN", "PIN रीसेट करें")}</b></div><p>{t("Use the registered owner phone and email.", "रजिस्टर्ड मालिक फोन और ईमेल डालें।")}</p>{!type && <div className="type-grid login-types">{Object.entries(businessTypes).map(([id, item]) => { const Icon = item.icon; return <button type="button" className={type === id ? "selected" : ""} onClick={() => { setType(id); setProfileType(id); }} key={id}><Icon /><b>{t(item.en, item.hi)}</b></button>; })}</div>}{type && !verified && <><Field inputMode="tel" placeholder={t("Owner phone number", "मालिक का फोन नंबर")} value={phone} onChange={(value) => setPhone(value.replace(/\D/g, "").slice(0, 10))} /><Field type="email" placeholder={t("Owner email", "मालिक का ईमेल")} value={email} onChange={setEmail} /><button className="primary wide" onClick={verify}>{t("Verify details", "विवरण जांचें")}</button></>}{verified && <><Field inputMode="numeric" type="password" placeholder={t("New 6-digit PIN", "नया 6 अंकों का PIN")} value={pin} onChange={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))} /><Field inputMode="numeric" type="password" placeholder={t("Repeat PIN", "PIN दोहराएं")} value={again} onChange={(value) => setAgain(value.replace(/\D/g, "").slice(0, 6))} /><button className="primary wide" onClick={reset}>{t("Set new PIN", "नया PIN सेट करें")}</button></>}{message && <p className="error">{message}</p>}<button className="link-button" onClick={() => onDone(null)}>{t("Back to login", "लॉगिन पर वापस")}</button></div></div>;
}

function AppShell({ profile, profiles, session, page, setPage, lang, setLang, t, logout, onSwitchProfile, onCreateProfile, onLock }) {
  const [rows, setRows] = useState({ people: [], products: [], sales: [], expenses: [], payments: [], schoolStudents: [], schoolTeachers: [], schoolStaff: [], schoolTransport: [], schoolHostels: [], schoolClasses: [], schoolTimetable: [], schoolExams: [], schoolFeePayments: [], schoolQrScans: [], payouts: [] }); const [query, setQuery] = useState(""); const [showQr, setShowQr] = useState(false); const [showPaymentList, setShowPaymentList] = useState(false);
  const config = businessTypes[profile.type]; const nav = config.modules; const isRetail = profile.type === "retail";
  useEffect(() => { (async () => { const next = {}; const stores = ["people", "products", "sales", "expenses", "payments", "schoolStudents", "schoolTeachers", "schoolStaff", "schoolTransport", "schoolHostels", "schoolClasses", "schoolTimetable", "schoolExams", "schoolFeePayments", "schoolQrScans", "payouts"]; for (const store of stores) next[store] = await all(profile.id, store); setRows(next); })(); }, [profile.id, page, showQr]);
  const people = rows.people.filter((row) => isRetail ? row.kind === "customer" || !row.kind : row.kind !== "customer");
  const filtered = (isRetail && page === "products" ? rows.products : people).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const save = async (store, row) => { const id = await put(profile.id, store, row); const saved = { ...row, id: row.id || id, profileId: profile.id }; setRows((current) => ({ ...current, [store]: current[store]?.some((item) => item.id === saved.id) ? current[store].map((item) => item.id === saved.id ? saved : item) : [...(current[store] || []), saved] })); return saved; };
  const verifyPin = async () => { const pin = window.prompt(t("Enter your current 6-digit PIN.", "अपना वर्तमान 6 अंकों का PIN डालें।")); return Boolean(pin && /^\d{6}$/.test(pin) && await matchesPin(pin, profile)); };
  const updateProfile = async (changes) => { const updated = { ...profile, ...changes }; await saveProfile(updated); Object.assign(profile, updated); };
  const paidToday = rows.payments.filter((row) => row.status === "paid" && row.dayKey === todayKey()); const collection = paidToday.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const title = page === "people" && profile.type === "coaching" ? t("Students", "छात्र") : t(...(labels[page] || labels.dashboard));
  const recordActions = async (action, selectedRows) => {
    let renamedPayments = rows.payments;
    for (const row of selectedRows) {
      if (action === "delete") {
        await remove(profile.id, "people", row.id);
        for (const store of ["attendance", "sales"]) {
          const related = await all(profile.id, store);
          for (const item of related.filter((entry) => entry.memberId === row.id || entry.memberName === row.name || entry.payerName === row.name)) await remove(profile.id, store, item.id);
        }
        const payments = rows.payments.filter((payment) => payment.payerName === row.name || payment.memberId === row.id);
        for (const payment of payments) {
          const updated = { ...payment, payerName: "Deleted member", memberId: undefined };
          await put(profile.id, "payments", updated);
          renamedPayments = renamedPayments.map((item) => item.id === payment.id ? updated : item);
        }
      } else {
        await save("people", { ...row, status: action, statusDate: today(), statusReason: row.statusReason || "" });
      }
    }
    setRows((current) => ({
      ...current,
      payments: renamedPayments,
      people: action === "delete"
        ? current.people.filter((item) => !selectedRows.some((selectedRow) => selectedRow.id === item.id))
        : current.people.map((item) => selectedRows.some((selectedRow) => selectedRow.id === item.id) ? { ...item, status: action, statusDate: today(), statusReason: selectedRows.find((selectedRow) => selectedRow.id === item.id)?.statusReason || item.statusReason || "" } : item)
    }));
  };
  return <div className="app"><aside className="sidebar"><div className="brand"><Store /><b>Apna Vyapar</b></div><div className="profile-mini"><div className="avatar">{profile.name[0]}</div><span>{profile.name}<small>{config.en}</small></span></div>{profiles.length > 1 && <select className="profile-switcher" aria-label={t("Switch profile", "प्रोफाइल बदलें")} value={profile.id} onChange={(e) => onSwitchProfile(e.target.value)}>{profiles.map((item) => <option value={item.id} key={item.id}>{item.name} · {businessTypes[item.type].en}</option>)}</select>}<nav><button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>{iconMap.dashboard}<span>{t("Dashboard", "डैशबोर्ड")}</span></button>{nav.filter((item) => item !== "dashboard").map((item) => <button className={page === item ? "active" : ""} onClick={() => setPage(item)} key={item}>{iconMap[item]}<span>{item === "people" && profile.type === "coaching" ? t("Students", "छात्र") : t(...(labels[item] || [item, item]))}</span></button>)}<button onClick={onCreateProfile}><Plus /><span>{t("Create another profile", "दूसरी प्रोफाइल बनाएं")}</span></button></nav><button className="lockbtn" onClick={onLock}><Lock size={18} />{t("Lock app", "ऐप लॉक")}</button><button className="logout-btn" onClick={() => logout(true)}><LogOut size={18} />{t("Logout", "लॉगआउट")}</button></aside><main><header><button className="mobile-menu"><Menu /></button><div><h1>{title}</h1><small>{profile.name} · {today()} · {config.en}</small></div><div className="header-actions"><button className="icon-btn" onClick={() => setLang(lang === "en" ? "hi" : "en")}><Languages size={19} />{lang.toUpperCase()}</button><button className="icon-btn logout-header" onClick={() => logout(true)}><LogOut size={18} />{t("Logout", "लॉगआउट")}</button></div></header>{page !== "dashboard" && page !== "sales" && <div className="toolbar"><div className="search"><Search size={18} /><input placeholder={t("Search...", "खोजें...")} value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>}<section className="content">{page === "dashboard" && <Dashboard profile={profile} rows={{ ...rows, people }} retail={isRetail} collection={collection} t={t} onPage={setPage} onQr={() => setShowQr(true)} onCollection={() => setShowPaymentList(true)} />}{page === "school" && <SchoolModule rows={rows} t={t} verifyPin={verifyPin} onSave={save} onRemove={async (store, id) => { await remove(profile.id, store, id); setRows((current) => ({ ...current, [store]: current[store].filter((item) => item.id !== id) })); }} />}{(page === "people" || page === "customers") && <People rows={filtered} t={t} retail={page === "customers"} onSave={(row) => save("people", row)} onAction={recordActions} />}{page === "products" && <Products rows={filtered} t={t} onSave={(row) => save("products", row)} onRemove={async (id) => { await remove(profile.id, "products", id); setRows((current) => ({ ...current, products: current.products.filter((item) => item.id !== id) })); }} />}{page === "sales" && <Sales products={rows.products} t={t} onSave={(row) => save("sales", row)} onQr={() => setShowQr(true)} />}{page === "suppliers" && <SimpleList title={t("Suppliers", "सप्लायर")} rows={[]} t={t} />}{page === "attendance" && <SimpleList title={t("Attendance", "उपस्थिति")} rows={people.filter((row) => row.status === "active")} t={t} />}{page === "payments" && <Payments rows={rows.payments} people={people.filter((row) => row.status === "active")} t={t} onSave={(row) => save("payments", row)} />}{page === "expenses" && <Expenses rows={rows.expenses} t={t} onSave={(row) => save("expenses", row)} />}{page === "reports" && <Reports rows={rows} t={t} />}{page === "settings" && <Settings profile={profile} t={t} verifyPin={verifyPin} onBackup={async () => { const blob = new Blob([JSON.stringify(await exportProfile(profile.id), null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${profile.name}-backup.json`; a.click(); }} onReset={async () => { if (window.confirm(t("Erase this profile's data?", "इस प्रोफाइल का डेटा मिटाएं?"))) { await clearProfile(profile.id); location.reload(); } }} onQr={() => setShowQr(true)} onProfileUpdate={updateProfile} />}</section></main>{showQr && <UpiQr profile={profile} people={people.filter((row) => row.status === "active")} t={t} close={() => setShowQr(false)} onProfileUpdate={updateProfile} onSavePayment={(row) => save("payments", row)} />}{showPaymentList && <PaymentList rows={paidToday} t={t} close={() => setShowPaymentList(false)} />}</div>;
}

function Dashboard({ profile, rows, retail, collection, t, onPage, onQr, onCollection }) {
  const active = rows.people.filter((row) => row.status === "active").length; const due = rows.people.filter((row) => row.status === "Due").length; const low = rows.products.filter((row) => row.stock <= row.low).length;
  const cards = retail ? [["Today's sales", `₹${collection}`, "teal"], ["Bills", rows.sales.length, "blue"], ["Low stock", low, "orange"], ["Udhaar", "₹0", "purple"]] : [["Active members", active, "teal"], ["Today's collection", `₹${collection}`, "blue"], ["Pending dues", due, "orange"], ["Follow-ups", "0", "purple"]];
  return <><div className="welcome"><div><p>{t("Good day,", "नमस्ते,")} {profile.ownerName}</p><h2>{retail ? t("Your shop at a glance", "आपकी दुकान का सारांश") : t("Your business at a glance", "आपके व्यवसाय का सारांश")}</h2></div><button className="secondary" onClick={onQr}><QrCode size={18} />{t("UPI QR", "UPI QR")}</button></div><div className="stats">{cards.map(([name, value, color]) => <button className={`stat ${color}`} key={name} onClick={name === "Today's collection" ? onCollection : undefined}><span>{name}</span><strong>{value}</strong><small>{t("View details", "विवरण देखें")} →</small></button>)}</div><div className="quick"><h3>{t("Quick actions", "त्वरित कार्य")}</h3><div className="quick-grid"><button onClick={() => onPage(retail ? "sales" : "people")}><Plus />{retail ? t("New bill", "नई बिक्री") : t("Add member", "सदस्य जोड़ें")}</button><button onClick={() => onPage(retail ? "products" : "attendance")}><CalendarCheck />{retail ? t("Add product", "उत्पाद जोड़ें") : t("Attendance", "उपस्थिति")}</button><button onClick={onQr}><QrCode />{t("Collect UPI", "UPI भुगतान")}</button><button onClick={() => onPage("expenses")}><Wallet />{t("Add expense", "खर्च जोड़ें")}</button></div></div></>;
}
function SchoolModule({ rows, t, onSave, onRemove }) {
  const definitions = {
    students: { store: "schoolStudents", title: t("Students", "छात्र"), fields: ["name", "className", "section", "rollNumber", "parentName", "parentPhone", "fees"] },
    teachers: { store: "schoolTeachers", title: t("Teachers", "शिक्षक"), fields: ["name", "subject", "phone", "salary", "bankDetails"] },
    staff: { store: "schoolStaff", title: t("Staff", "स्टाफ"), fields: ["name", "position", "phone", "salary", "bankDetails"] },
    transport: { store: "schoolTransport", title: t("Transportation", "परिवहन"), fields: ["vehicle", "route", "driver", "studentIds"] },
    hostels: { store: "schoolHostels", title: t("Hostel", "हॉस्टल"), fields: ["hostel", "room", "bed", "studentId"] },
    classes: { store: "schoolClasses", title: t("Classes / Sections", "कक्षा / सेक्शन"), fields: ["className", "section", "capacity"] },
    timetable: { store: "schoolTimetable", title: t("Timetable", "समय-सारणी"), fields: ["day", "period", "className", "subject", "teacher", "time"] },
    exams: { store: "schoolExams", title: t("Exams", "परीक्षा"), fields: ["examName", "className", "subject", "date"] },
    fees: { store: "schoolFeePayments", title: t("Fees", "फीस"), fields: ["studentId", "amount", "date", "mode"] },
    payouts: { store: "payouts", title: t("Salary / Payouts", "वेतन / भुगतान"), fields: ["recipientName", "recipientType", "amount", "bankOrUpi"] }
  };
  const [tab, setTab] = useState("students"); const [form, setForm] = useState({}); const [editing, setEditing] = useState(null); const [query, setQuery] = useState(""); const [qr, setQr] = useState(null);
  const config = definitions[tab]; const records = (rows[config.store] || []).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
  const [message, setMessage] = useState("");
  const save = async () => {
    if (!config.fields.every((field) => String(form[field] || "").trim())) return setMessage(t("Complete all fields.", "सभी फ़ील्ड भरें।"));
    if (tab === "payouts") {
      if (!await verifyPin()) return setMessage(t("PIN verification failed.", "PIN सत्यापन विफल।"));
      try {
        const result = await createPayout({ ...form, amount: Number(form.amount), requestedAt: new Date().toISOString() });
        await onSave(config.store, { ...form, amount: Number(form.amount), status: result.status || "pending", providerReference: result.id || "" });
        setMessage(t("Payout request submitted.", "भुगतान अनुरोध भेजा गया।"));
      } catch (error) { setMessage(error.message); return; }
    } else await onSave(config.store, { ...form, id: editing || undefined });
    setForm({}); setEditing(null);
  };
  const edit = (row) => { setEditing(row.id); setForm(row); };
  const studentQr = async (student) => setQr({ student, src: await QRCode.toDataURL(`apna-vyapar://student/${student.id}`, { width: 360, margin: 2 }) });
  const scanLog = async (student) => { await onSave("schoolQrScans", { studentId: student.id, studentName: student.name, scannedAt: new Date().toISOString(), purpose: "attendance" }); };
  return <div className="school-module"><div className="school-tabs">{Object.entries(definitions).map(([id, item]) => <button className={tab === id ? "active" : ""} onClick={() => { setTab(id); setForm({}); setEditing(null); setMessage(""); }} key={id}>{item.title}</button>)}</div><div className="card"><div className="table-head"><h3>{config.title}</h3><span>{records.length}</span></div><div className="school-form">{config.fields.map((field) => <input key={field} placeholder={field} value={form[field] || ""} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />)}<button className="primary" onClick={save}>{editing ? t("Update", "अपडेट") : t("Add", "जोड़ें")}</button></div>{message && <p className="error">{message}</p>}<input className="school-search" placeholder={t("Search records", "रिकॉर्ड खोजें")} value={query} onChange={(e) => setQuery(e.target.value)} /><div className="school-records">{records.map((row) => <div className="school-record" key={row.id}><div><b>{row.name || row.studentName || row.recipientName || row.className || row.hostel || row.vehicle || row.examName}</b><small>{config.fields.filter((field) => field !== "name").slice(0, 3).map((field) => `${field}: ${row[field] || "-"}`).join(" · ")}</small></div><div className="row-actions-inline">{tab === "students" && <><button className="secondary" onClick={() => studentQr(row)}><QrCode size={15} />QR</button><button className="secondary" onClick={() => scanLog(row)}>{t("Scan", "स्कैन")}</button></>}<button className="secondary" onClick={() => edit(row)}>{t("Edit", "एडिट")}</button><button className="danger" onClick={() => onRemove(config.store, row.id)}>{t("Delete", "डिलीट")}</button></div></div>)}</div></div>{qr && <div className="modal-backdrop" onClick={() => setQr(null)}><div className="modal" onClick={(e) => e.stopPropagation()}><button className="modal-close" onClick={() => setQr(null)}><X /></button><h2>{qr.student.name} QR</h2><img className="qr-image" src={qr.src} alt="Student QR" /><button className="primary wide" onClick={() => { const link = document.createElement("a"); link.href = qr.src; link.download = `${qr.student.name}-qr.png`; link.click(); }}>{t("Download QR", "QR डाउनलोड")}</button><button className="secondary wide" onClick={() => window.print()}>{t("Print", "प्रिंट")}</button></div></div>}</div>;
}
function People({ rows, t, retail, onSave, onAction }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [open, setOpen] = useState(false); const [filter, setFilter] = useState("all"); const [selected, setSelected] = useState([]); const [menu, setMenu] = useState(null);
  const visible = rows.filter((row) => filter === "all" || row.status === filter);
  const submit = async () => { if (!name.trim() || !phone.trim()) return; await onSave({ name: name.trim(), phone: phone.trim(), status: "active", kind: retail ? "customer" : "member", joinedAt: today(), due: "-" }); setName(""); setPhone(""); setOpen(false); };
  const action = async (type, targets = visible.filter((row) => selected.includes(row.id))) => {
    if (!targets.length) return;
    if (type === "banned") { const banReason = window.prompt(t("Ban reason (required)", "बैन का कारण (जरूरी)")); if (!banReason?.trim()) return; targets = targets.map((row) => ({ ...row, statusReason: banReason.trim() })); }
    if (type === "suspended") { const suspendReason = window.prompt(t("Suspend reason (optional)", "निलंबन का कारण (वैकल्पिक)")); if (suspendReason?.trim()) targets = targets.map((row) => ({ ...row, statusReason: suspendReason.trim() })); }
    if (type === "delete") { const confirmation = window.prompt(t(`Type "${targets[0].name}" to permanently delete. This cannot be undone.`, `"${targets[0].name}" लिखकर स्थायी डिलीट की पुष्टि करें। यह वापस नहीं आएगा।`)); if (confirmation !== targets[0].name) return; }
    await onAction(type, targets); setSelected([]); setMenu(null);
  };
  const menuAction = (row, type) => { setMenu(null); action(type, [row]); };
  return <div className="card table-card"><div className="table-head"><h3>{retail ? t("Customers", "ग्राहक") : t("Members / Students", "सदस्य / छात्र")}</h3><button className="primary" onClick={() => setOpen(!open)}><Plus size={18} />{retail ? t("Add customer", "ग्राहक जोड़ें") : t("Add member", "सदस्य जोड़ें")}</button></div>{open && <div className="inline-form"><input autoFocus placeholder={retail ? t("Customer name", "ग्राहक का नाम") : t("Member name", "सदस्य का नाम")} value={name} onChange={(e) => setName(e.target.value)} /><input inputMode="tel" placeholder={t("Phone number", "फोन नंबर")} value={phone} onChange={(e) => setPhone(e.target.value)} /><button className="primary" onClick={submit}>{t("Save", "सेव करें")}</button></div>}<div className="record-toolbar"><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">{t("All", "सभी")}</option><option value="active">{t("Active", "सक्रिय")}</option><option value="suspended">{t("Suspended", "निलंबित")}</option><option value="banned">{t("Banned", "बैन")}</option></select><button className="secondary" onClick={() => action("suspended")}><PauseCircle size={16} />{t("Suspend selected", "चुनिंदा निलंबित")}</button><button className="danger" onClick={() => action("banned")}><Ban size={16} />{t("Ban selected", "चुनिंदा बैन")}</button><button className="danger" onClick={() => action("delete")}><Trash2 size={16} />{t("Delete selected", "चुनिंदा डिलीट")}</button></div><div className="table-count">{visible.length} {t("records", "रिकॉर्ड")}</div>{visible.length ? <table><thead><tr><th></th><th>{t("Name", "नाम")}</th><th>{t("Phone", "फोन")}</th><th>{t("Status", "स्थिति")}</th><th>{t("Actions", "कार्य")}</th></tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td><input type="checkbox" checked={selected.includes(row.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td><td><b>{row.name}</b></td><td>{row.phone}</td><td><span className={`badge ${row.status === "banned" ? "bad" : row.status === "suspended" ? "warn" : "ok"}`}>{row.status === "banned" ? t("Banned", "बैन") : row.status === "suspended" ? t("Suspended", "निलंबित") : t("Active", "सक्रिय")}</span></td><td className="action-cell"><button className="row-menu" title={t("Actions", "कार्य")} onClick={() => setMenu(menu === row.id ? null : row.id)}><MoreVertical size={18} /></button>{menu === row.id && <div className="row-actions">{row.status !== "active" && <button onClick={() => menuAction(row, "active")}><RotateCcw size={15} />{t("Reactivate / Unban", "फिर सक्रिय करें")}</button>}{row.status === "active" && <button onClick={() => menuAction(row, "suspended")}><PauseCircle size={15} />{t("Suspend", "निलंबित")}</button>}{row.status !== "banned" && <button onClick={() => menuAction(row, "banned")}><Ban size={15} />{t("Ban", "बैन")}</button>}<button className="delete-action" onClick={() => menuAction(row, "delete")}><Trash2 size={15} />{t("Delete permanently", "स्थायी डिलीट")}</button></div>}</td></tr>)}</tbody></table> : <div className="empty"><Users size={36} /><p>{retail ? t("No customers yet.", "अभी कोई ग्राहक नहीं।") : t("No members yet.", "अभी कोई सदस्य नहीं।")}</p></div>}</div>;
}

function Products({ rows, t, onSave, onRemove }) {
  const blank = { name: "", price: "", costPrice: "", stock: "", unit: "piece", category: "", barcode: "" }; const [form, setForm] = useState(blank); const [open, setOpen] = useState(false);
  const save = async () => { if (!form.name.trim() || !Number(form.price)) return; await onSave({ ...form, name: form.name.trim(), price: Number(form.price), costPrice: Number(form.costPrice || 0), stock: Number(form.stock || 0), low: 5 }); setForm(blank); setOpen(false); };
  return <div className="card table-card"><div className="table-head"><h3>{t("Products", "उत्पाद")}</h3><button className="primary" onClick={() => setOpen(!open)}><Plus size={18} />{t("Add product", "उत्पाद जोड़ें")}</button></div>{open && <div className="product-form">{["name", "price", "costPrice", "stock", "unit", "category", "barcode"].map((key) => <input key={key} placeholder={key} inputMode={["price", "costPrice", "stock"].includes(key) ? "decimal" : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}<button className="primary" onClick={save}>{t("Save product", "उत्पाद सेव करें")}</button></div>}<table><thead><tr><th>{t("Product", "उत्पाद")}</th><th>{t("Price", "मूल्य")}</th><th>{t("Stock", "स्टॉक")}</th><th>{t("Actions", "कार्य")}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b><small>{row.category || row.unit}</small></td><td>₹{row.price}</td><td>{row.stock}</td><td><button className="danger" onClick={() => onRemove(row.id)}><Trash2 size={16} /></button></td></tr>)}</tbody></table></div>;
}

function Sales({ products, t, onSave }) { const [items, setItems] = useState([]); const total = items.reduce((sum, item) => sum + item.price * item.qty, 0); return <div className="pos"><div className="card"><h3>{t("New bill", "नई बिक्री")}</h3>{products.filter((product) => product.stock > 0).map((product) => <button className="product-pick" key={product.id} onClick={() => setItems([...items, { ...product, qty: 1 }])}>{product.name} · ₹{product.price}</button>)}</div><div className="card bill"><h3>{t("Current bill", "वर्तमान बिल")}</h3>{items.map((item, index) => <div className="bill-line" key={`${item.id}-${index}`}><span>{item.name} × {item.qty}</span><b>₹{item.price * item.qty}</b></div>)}<div className="total"><b>{t("Total", "कुल")}</b><b>₹{total}</b></div><button className="primary wide" onClick={async () => { if (!total) return; await onSave({ items, total, date: today(), createdAt: Date.now() }); setItems([]); }}>{t("Save bill", "बिल सेव करें")}</button></div></div>; }

function SimpleList({ title, rows, t }) { return <div className="card list-card"><h3>{title}</h3>{rows.map((row) => <div className="check-row" key={row.id}><span>{row.name}<small>{row.phone}</small></span><button className="present">{t("Present", "उपस्थित")}</button></div>)}</div>; }
function Payments({ rows, people, t, onSave }) { const [amount, setAmount] = useState(""); const [payer, setPayer] = useState(""); return <div className="card table-card"><div className="table-head"><h3>{t("Payments", "भुगतान")}</h3><span>{rows.length}</span></div><div className="payment-form"><input inputMode="decimal" placeholder={t("Amount in INR", "राशि रुपये में")} value={amount} onChange={(e) => setAmount(e.target.value)} /><select value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">{t("Select member / payer", "सदस्य / भुगतानकर्ता चुनें")}</option>{people.map((person) => <option value={person.name} key={person.id}>{person.name}</option>)}</select><button className="primary" onClick={async () => { if (!Number(amount)) return; await onSave({ amount: Number(amount), payerName: payer || "UPI customer", mode: "Cash", status: "paid", dayKey: todayKey(), createdAt: new Date().toISOString(), date: today() }); setAmount(""); setPayer(""); }}>{t("Save cash payment", "कैश भुगतान सेव करें")}</button></div><table><thead><tr><th>{t("Date", "दिनांक")}</th><th>{t("Payer", "भुगतानकर्ता")}</th><th>{t("Amount", "राशि")}</th><th>{t("Mode", "माध्यम")}</th><th>{t("Status", "स्थिति")}</th></tr></thead><tbody>{rows.slice().reverse().map((row) => <tr key={row.id}><td>{row.date || today()}</td><td>{row.payerName || "UPI customer"}</td><td>₹{row.amount}</td><td>{row.mode || "UPI"}</td><td><span className={`badge ${row.status === "paid" ? "ok" : "warn"}`}>{row.status}</span></td></tr>)}</tbody></table></div>; }
function PaymentList({ rows, t, close }) { return <div className="modal-backdrop" onClick={close}><div className="modal payment-list-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X /></button><h2>{t("Today's paid payments", "आज के भुगतान")}</h2>{rows.length ? rows.map((row) => <div className="payment-row" key={row.id}><span>{row.payerName}<small>{row.mode} · {row.date}</small></span><b>₹{row.amount}</b></div>) : <p>{t("No paid payments today.", "आज कोई भुगतान नहीं।")}</p>}</div></div>; }
function Expenses({ rows, t, onSave }) { const [name, setName] = useState(""); const [amount, setAmount] = useState(""); return <div className="split"><div className="card form-card"><h3>{t("Add expense", "खर्च जोड़ें")}</h3><input placeholder={t("Expense name", "खर्च का नाम")} value={name} onChange={(e) => setName(e.target.value)} /><input placeholder={t("Amount", "राशि")} value={amount} onChange={(e) => setAmount(e.target.value)} /><button className="primary" onClick={() => { onSave({ name, amount, date: today() }); setName(""); setAmount(""); }}>{t("Save expense", "खर्च सेव करें")}</button></div><div className="card"><h3>{t("Recent expenses", "हाल के खर्च")}</h3>{rows.map((row) => <div className="expense-row" key={row.id}><span>{row.name}<small>{row.date}</small></span><b>₹{row.amount}</b></div>)}</div></div>; }
function Reports({ rows, t }) { const income = rows.sales.reduce((sum, row) => sum + Number(row.total || 0), 0) + rows.payments.filter((row) => row.status === "paid").reduce((sum, row) => sum + Number(row.amount || 0), 0); const expense = rows.expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0); return <div className="stats report-stats"><div className="stat teal"><span>{t("Income", "आय")}</span><strong>₹{income}</strong></div><div className="stat purple"><span>{t("Expenses", "खर्च")}</span><strong>₹{expense}</strong></div><div className="stat blue"><span>{t("Net", "शुद्ध")}</span><strong>₹{income - expense}</strong></div></div>; }
function Settings({ profile, t, verifyPin, onBackup, onReset, onQr, onProfileUpdate }) { const [upi, setUpi] = useState(profile.upiId || ""); const [payee, setPayee] = useState(profile.payeeName || profile.name); const [phone, setPhone] = useState(profile.phone || ""); const [email, setEmail] = useState(profile.email || ""); const [message, setMessage] = useState(""); const save = async () => { if (!/^[\w.-]+@[\w.-]+$/.test(upi)) return setMessage(t("Enter a valid UPI ID like name@bank.", "मान्य UPI ID डालें जैसे name@bank।")); if (upi !== profile.upiId && !await verifyPin()) return setMessage(t("PIN verification failed.", "PIN सत्यापन विफल।")); await onProfileUpdate({ upiId: upi, payeeName: payee }); setMessage(t("Payment details saved.", "भुगतान विवरण सेव हो गए।")); }; const saveContact = async () => { if (!/^\d{10}$/.test(phone) || !validEmail(email)) return setMessage(t("Enter a valid 10-digit phone and email.", "मान्य फोन और ईमेल डालें।")); if (!await verifyPin()) return setMessage(t("PIN verification failed.", "PIN सत्यापन विफल।")); await onProfileUpdate({ phone, email: normalizeEmail(email) }); setMessage(t("Owner contact saved.", "मालिक संपर्क सेव हो गया।")); }; return <div className="settings-grid"><div className="card"><h3>{t("Business profile", "व्यवसाय प्रोफाइल")}</h3><p><b>{profile.name}</b></p><p>{businessTypes[profile.type].en}</p><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /><button className="secondary" onClick={saveContact}>{t("Edit owner contact (PIN)", "मालिक संपर्क बदलें (PIN)")}</button></div><div className="card"><h3>{t("Payment details", "भुगतान विवरण")}</h3><input placeholder="yourname@bank" value={upi} onChange={(e) => setUpi(e.target.value.trim())} /><input placeholder={t("Payee name", "प्राप्तकर्ता का नाम")} value={payee} onChange={(e) => setPayee(e.target.value)} /><button className="primary" onClick={save}>{t("Save UPI ID", "UPI ID सेव करें")}</button>{message && <p className="success-message">{message}</p>}<button className="secondary" onClick={onQr}><QrCode />{t("Show UPI QR", "UPI QR दिखाएं")}</button></div><div className="card"><h3>{t("Backup", "बैकअप")}</h3><button className="secondary" onClick={onBackup}><Download />{t("Export profile backup", "प्रोफाइल बैकअप एक्सपोर्ट")}</button><label className="secondary"><Upload />{t("Restore backup", "बैकअप बहाल करें")}<input type="file" hidden /></label></div><div className="card danger-card"><h3>{t("Danger zone", "खतरा क्षेत्र")}</h3><button className="danger" onClick={onReset}>{t("Reset profile data", "प्रोफाइल डेटा मिटाएं")}</button></div></div>; }
function UpiQr({ profile, people, t, close, onProfileUpdate, onSavePayment }) { const [upi, setUpi] = useState(profile.upiId || ""); const [name, setName] = useState(profile.payeeName || profile.name); const [amount, setAmount] = useState(""); const [payer, setPayer] = useState(""); const [src, setSrc] = useState(""); const [payment, setPayment] = useState(null); useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = previous; }; }, []); const makeQr = async () => { if (!/^[\w.-]+@[\w.-]+$/.test(upi) || !Number(amount)) return alert(t("Save a valid UPI ID and enter an amount.", "मान्य UPI ID और राशि डालें।")); await onProfileUpdate({ upiId: upi, payeeName: name }); const record = { amount: Number(amount), upiId: upi, payerName: payer || "UPI customer", mode: "UPI", status: "pending", dayKey: todayKey(), createdAt: new Date().toISOString(), date: today() }; setPayment(await onSavePayment(record)); setSrc(await QRCode.toDataURL(`upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(profile.name)}`, { width: 360, margin: 2, errorCorrectionLevel: "M" })); }; const markPaid = async () => { if (!payment) return; const updated = { ...payment, status: "paid", paidAt: new Date().toISOString(), dayKey: todayKey() }; await onSavePayment(updated); setPayment(updated); }; return <div className="modal-backdrop" onClick={close}><div className="modal qr-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2><QrCode />{t("Scan to pay", "स्कैन करके भुगतान")}</h2><button className="modal-close" onClick={close}><X /></button></div><div className="modal-body"><input placeholder="yourname@bank" value={upi} onChange={(e) => setUpi(e.target.value.trim())} /><input placeholder={t("Payee name", "प्राप्तकर्ता का नाम")} value={name} onChange={(e) => setName(e.target.value)} /><select value={payer} onChange={(e) => setPayer(e.target.value)}><option value="">{t("Payer / member (optional)", "भुगतानकर्ता / सदस्य (वैकल्पिक)")}</option>{people.map((person) => <option value={person.name} key={person.id}>{person.name}</option>)}</select><div className="amount-buttons">{[50, 100, 200, 500, 1000].map((value) => <button key={value} onClick={() => { setAmount(String(value)); }}>{`₹${value}`}</button>)}</div><input inputMode="decimal" placeholder={t("Custom amount", "कस्टम राशि")} value={amount} onChange={(e) => setAmount(e.target.value)} />{src && <img className="qr-image" src={src} alt="UPI QR" />}{payment && <button className={payment.status === "paid" ? "secondary wide" : "primary wide"} onClick={markPaid}>{payment.status === "paid" ? t("Payment received", "भुगतान प्राप्त") : t("Mark as paid", "भुगतान प्राप्त हुआ")}</button>}<p className="qr-note">{t("Check your UPI app or SMS before marking a payment as received.", "भुगतान प्राप्त होने की पुष्टि अपने UPI ऐप या SMS से करें।")}</p></div><div className="modal-footer"><button className="primary wide" onClick={makeQr}>{t("Generate QR", "QR बनाएं")}</button></div></div></div>; }

export default App;
