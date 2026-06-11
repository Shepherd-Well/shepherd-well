"use client";

import { useState } from "react";

const ACCENT = "#F28C28";

const ALLERGY_OPTIONS = [
  "No Known Allergies",
  "Peanuts",
  "Tree Nuts",
  "Dairy",
  "Eggs",
  "Soy",
  "Wheat / Gluten",
  "Shellfish",
  "Bee Stings",
  "Medication Allergy",
  "Asthma",
  "EpiPen Required",
  "Other",
] as const;

type Room = { id: string; name: string; min_age: number | null; max_age: number | null };

type LookupFamily = {
  id: string;
  parentFirstName: string;
  parentLastName: string;
  parentPhone: string;
  parentEmail: string | null;
  authorizedPickups: string | null;
};

type LookupChild = {
  id: string;
  name: string;
  source: "visitor";
  dateOfBirth: string | null;
  allergies: string | null;
  medicalNotes: string | null;
  specialInstructions: string | null;
};

type AllergyState = {
  allergies: string[];
  allergyOther: string;
  medicalNotes: string;
  specialInstructions: string;
};

type ExistingChildState = {
  id: string;
  name: string;
  source: "visitor";
  selected: boolean;
  roomId: string;
  dateOfBirth: string;
} & AllergyState;

type NewChildForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  roomId: string;
  selected: boolean;
} & AllergyState;

type Step = "phone" | "returning-edit" | "new" | "attendance" | "success";

type Props = {
  sessionToken: string;
  serviceName: string;
  serviceDate: string;
  rooms: Room[];
  churchName: string;
};

type ImmediateLabel = {
  labelType: "child" | "parent";
  childName: string;
  parentName: string;
  parentPhone: string | null;
  roomName: string | null;
  securityCode: string;
  allergies: string | null;
  medicalNotes: string | null;
  specialInstructions: string | null;
  visitNumber: number | null;
  authorizedPickups: string | null;
};

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function parseAllergyState(raw: string | null): Pick<AllergyState, "allergies" | "allergyOther"> {
  if (!raw) return { allergies: [], allergyOther: "" };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { allergies: [], allergyOther: "" };
    let allergyOther = "";
    const allergies = parsed.map((a: string) => {
      if (typeof a === "string" && a.startsWith("Other: ")) {
        allergyOther = a.slice(7);
        return "Other";
      }
      return a;
    });
    return { allergies, allergyOther };
  } catch {
    return { allergies: [], allergyOther: "" };
  }
}

function emptyNewChild(): NewChildForm {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    roomId: "",
    selected: true,
    allergies: [],
    allergyOther: "",
    medicalNotes: "",
    specialInstructions: "",
  };
}

const today = new Date().toISOString().slice(0, 10);

function ageFromDob(dob: string): number | null {
  try {
    const [y, m, d] = dob.split("-").map(Number);
    const now = new Date();
    let age = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
    return age >= 0 ? age : null;
  } catch {
    return null;
  }
}

function autoAssignRoom(dob: string, rooms: Room[]): string {
  const age = ageFromDob(dob);
  if (age === null) return "";
  const candidates = rooms.filter((r) => {
    const minOk = r.min_age === null || age >= r.min_age;
    const maxOk = r.max_age === null || age <= r.max_age;
    return minOk && maxOk;
  });
  if (!candidates.length) return "";
  candidates.sort((a, b) => {
    const rangeA = (a.max_age ?? 999) - (a.min_age ?? 0);
    const rangeB = (b.max_age ?? 999) - (b.min_age ?? 0);
    if (rangeA !== rangeB) return rangeA - rangeB;
    return a.name.localeCompare(b.name);
  });
  return candidates[0].id;
}

function RoomSelect({
  value,
  onChange,
  rooms,
}: {
  value: string;
  onChange: (v: string) => void;
  rooms: Room[];
}) {
  if (rooms.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 16,
        padding: "12px 14px",
        borderRadius: 12,
        border: "2px solid #e5e7eb",
        backgroundColor: "white",
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      <option value="">Room (optional)</option>
      {rooms.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}


const PRINT_LABEL_STYLE: React.CSSProperties = {
  width: "4in",
  height: "2in",
  boxSizing: "border-box",
  overflow: "hidden",
  padding: "0.12in 0.15in",
  pageBreakAfter: "always",
  breakAfter: "page",
  fontFamily: "Arial, Helvetica, sans-serif",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  backgroundColor: "white",
  color: "#111827",
};

function ImmediateChildLabel({ label }: { label: ImmediateLabel }) {
  return (
    <div style={PRINT_LABEL_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            backgroundColor: "#000",
            color: "#fff",
            padding: "2px 7px",
            borderRadius: 3,
          }}
        >
          Child Label
        </span>

        {label.roomName && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 900,
              border: "1.5px solid #000",
              padding: "2px 8px",
              borderRadius: 3,
              maxWidth: "1.45in",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label.roomName}
          </span>
        )}
      </div>

      <div style={{ fontSize: 27, fontWeight: 900, lineHeight: 1.05, marginTop: 4 }}>
        {label.childName}
      </div>

      <div style={{ fontSize: 11, color: "#333", marginTop: 2 }}>
        Parent: {label.parentName}
        {label.parentPhone ? ` · ${label.parentPhone}` : ""}
      </div>

      {(label.allergies || label.medicalNotes || label.specialInstructions || label.visitNumber) && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
          {label.allergies && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: "#fff",
                backgroundColor: "#dc2626",
                padding: "2px 6px",
                borderRadius: 3,
                display: "inline-block",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              ⚠ ALLERGY: {label.allergies}
            </div>
          )}
          {label.medicalNotes && (
            <div style={{ fontSize: 9.5, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>Medical:</strong> {label.medicalNotes}
            </div>
          )}
          {label.specialInstructions && (
            <div style={{ fontSize: 9.5, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <strong>Instructions:</strong> {label.specialInstructions}
            </div>
          )}
          {typeof label.visitNumber === "number" && (
            <div style={{ fontSize: 9.5, color: "#333" }}>
              <strong>Visit #:</strong> {label.visitNumber}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-end", marginTop: "auto" }}>
        <div>
          <div style={{ fontSize: 9, textAlign: "right", color: "#555", marginBottom: 1 }}>PICKUP CODE</div>
          <div
            style={{
              fontSize: 29,
              fontWeight: 900,
              fontFamily: "monospace",
              letterSpacing: "0.16em",
              lineHeight: 1,
            }}
          >
            {label.securityCode}
          </div>
        </div>
      </div>
    </div>
  );
}

function ImmediateParentLabel({ label }: { label: ImmediateLabel }) {
  return (
    <div style={PRINT_LABEL_STYLE}>
      <div
        style={{
          backgroundColor: "#000",
          color: "#fff",
          fontSize: 11,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          padding: "3px 8px",
          alignSelf: "flex-start",
          borderRadius: 3,
        }}
      >
        Parent Pickup
      </div>

      <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.08, marginTop: 5 }}>
        {label.parentName}
      </div>

      {label.authorizedPickups && (
        <div style={{ fontSize: 10, color: "#111", marginTop: 3 }}>
          <strong>Auth. Pickups:</strong> {label.authorizedPickups}
        </div>
      )}

      <div style={{ fontSize: 12, color: "#333", marginTop: 3, lineHeight: 1.25 }}>
        {label.childName}
      </div>

      <div style={{ marginTop: "auto", borderTop: "1.5px solid #000", paddingTop: 6 }}>
        <div style={{ fontSize: 9, color: "#555", marginBottom: 2 }}>SECURITY CODE — REQUIRED FOR PICKUP</div>
        <div
          style={{
            fontSize: 39,
            fontWeight: 900,
            fontFamily: "monospace",
            letterSpacing: "0.18em",
            lineHeight: 1,
          }}
        >
          {label.securityCode}
        </div>
      </div>
    </div>
  );
}

function ImmediatePrintLabel({ label }: { label: ImmediateLabel }) {
  return label.labelType === "parent" ? (
    <ImmediateParentLabel label={label} />
  ) : (
    <ImmediateChildLabel label={label} />
  );
}

function LabelPreviewCard({ label }: { label: ImmediateLabel }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: "12px 14px",
        backgroundColor: "white",
        textAlign: "left",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            color: label.labelType === "parent" ? "#0369a1" : "#92400e",
          }}
        >
          {label.labelType === "parent" ? "Parent Pickup" : "Child Label"}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 900 }}>{label.securityCode}</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#111827", marginTop: 4 }}>{label.childName}</div>
      {label.roomName && label.labelType === "child" && (
        <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginTop: 2 }}>{label.roomName}</div>
      )}
      {label.allergies && (
        <div
          style={{
            display: "inline-block",
            marginTop: 6,
            backgroundColor: "#dc2626",
            color: "white",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          ⚠ {label.allergies}
        </div>
      )}
      {label.authorizedPickups && label.labelType === "parent" && (
        <div style={{ marginTop: 5, fontSize: 12, color: "#374151" }}>
          <strong>Auth. Pickups:</strong> {label.authorizedPickups}
        </div>
      )}
    </div>
  );
}

export default function KioskCheckInForm({
  sessionToken,
  serviceName,
  serviceDate,
  rooms,
  churchName,
}: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [looking, setLooking] = useState(false);

  // Shared email state (prefilled from lookup for returning, entered fresh for new)
  const [parentEmail, setParentEmail] = useState("");

  // Shared authorized pickups at family level
  const [authorizedPickups, setAuthorizedPickups] = useState("");

  // Returning family state
  const [family, setFamily] = useState<LookupFamily | null>(null);
  const [existingChildren, setExistingChildren] = useState<ExistingChildState[]>([]);
  const [addedChildren, setAddedChildren] = useState<NewChildForm[]>([]);

  // New family state
  const [parentName, setParentName] = useState("");
  const [newFamilyChildren, setNewFamilyChildren] = useState<NewChildForm[]>([
    emptyNewChild(),
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [securityCode, setSecurityCode] = useState<string | null>(null);
  const [printJobsCreated, setPrintJobsCreated] = useState(0);
  const [labels, setLabels] = useState<ImmediateLabel[]>([]);

  // ── Lookup ──────────────────────────────────────────────────────────────

  async function handleLookup() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      setLookupError("Please enter a valid phone number.");
      return;
    }
    setLooking(true);
    setLookupError("");

    const res = await fetch(`/api/kiosk/${sessionToken}/lookup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPhone: digits }),
    });

    const data = await res.json();
    setLooking(false);

    if (!res.ok) {
      setLookupError(data.error ?? "Lookup failed. Please try again.");
      return;
    }

    console.log("[Kiosk] lookup result:", { found: data.found, childrenCount: data.children?.length ?? 0 });

    if (data.found) {
      setFamily(data.family);
      setParentEmail(data.family.parentEmail ?? "");
      setAuthorizedPickups(data.family.authorizedPickups ?? "");
      setExistingChildren(
        (data.children as LookupChild[]).map((c) => {
          const { allergies, allergyOther } = parseAllergyState(c.allergies);
          const dob = c.dateOfBirth ?? "";
          return {
            id: c.id,
            name: c.name,
            source: c.source,
            selected: true,
            roomId: dob ? autoAssignRoom(dob, rooms) : "",
            dateOfBirth: dob,
            allergies,
            allergyOther,
            medicalNotes: c.medicalNotes ?? "",
            specialInstructions: c.specialInstructions ?? "",
          };
        }),
      );
      setAddedChildren([]);
      setStep("attendance");
      console.log("[Kiosk] → step=attendance, existingChildren loaded:", (data.children as LookupChild[]).length);
    } else {
      setParentName("");
      setParentEmail("");
      setAuthorizedPickups("");
      setNewFamilyChildren([emptyNewChild()]);
      setStep("new");
      console.log("[Kiosk] → step=new (no family found)");
    }
  }

  // ── Returning submit ────────────────────────────────────────────────────

  async function handleReturningSubmit() {
    if (!family) return;
    const selected = existingChildren.filter((c) => c.selected);
    const additions = addedChildren.filter(
      (c) => c.firstName.trim() && c.lastName.trim() && c.selected,
    );
    console.log("[Kiosk] handleReturningSubmit: selected=", selected.length, "additions=", additions.length);
    if (selected.length + additions.length === 0) return;

    setSubmitting(true);
    setSubmitError("");

    const children = [
      ...selected.map((c) => ({
        childName: c.name,
        childId: c.id,
        childDateOfBirth: c.dateOfBirth || undefined,
        roomId: c.roomId || undefined,
        isNew: false,
        allergies: c.allergies,
        allergyOther: c.allergyOther,
        medicalNotes: c.medicalNotes,
        specialInstructions: c.specialInstructions,
      })),
      ...additions.map((c) => ({
        childName: `${c.firstName.trim()} ${c.lastName.trim()}`,
        childFirstName: c.firstName.trim(),
        childLastName: c.lastName.trim(),
        childDateOfBirth: c.dateOfBirth || undefined,
        roomId: c.roomId || undefined,
        isNew: true,
        allergies: c.allergies,
        allergyOther: c.allergyOther,
        medicalNotes: c.medicalNotes,
        specialInstructions: c.specialInstructions,
      })),
    ];
    console.log("[Kiosk] payload children count:", children.length, children.map(c => c.childName));

    const res = await fetch(`/api/kiosk/${sessionToken}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: `${family.parentFirstName} ${family.parentLastName}`.trim(),
        parentPhone: family.parentPhone,
        parentEmail: parentEmail.trim() || undefined,
        familyId: family.id,
        isNewFamily: false,
        authorizedPickups: authorizedPickups.trim() || undefined,
        children,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(data.error ?? "Check-in failed. Please try again.");
      return;
    }
    setSecurityCode(data.securityCode);
    setPrintJobsCreated(data.printJobsCreated ?? 0);
    setLabels(data.labels ?? []);
    setStep("success");
  }

  // ── New family submit ───────────────────────────────────────────────────

  async function handleNewFamilySubmit() {
    const validChildren = newFamilyChildren.filter(
      (c) => c.firstName.trim() && c.lastName.trim() && c.selected,
    );
    console.log("[Kiosk] handleNewFamilySubmit: validSelected=", validChildren.length);
    if (
      !parentName.trim() ||
      phone.replace(/\D/g, "").length < 7 ||
      validChildren.length === 0
    ) return;

    setSubmitting(true);
    setSubmitError("");

    const children = validChildren.map((c) => ({
      childName: `${c.firstName.trim()} ${c.lastName.trim()}`,
      childFirstName: c.firstName.trim(),
      childLastName: c.lastName.trim(),
      childDateOfBirth: c.dateOfBirth || undefined,
      roomId: c.roomId || undefined,
      isNew: true,
      allergies: c.allergies,
      allergyOther: c.allergyOther,
      medicalNotes: c.medicalNotes,
      specialInstructions: c.specialInstructions,
    }));

    const res = await fetch(`/api/kiosk/${sessionToken}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentName: parentName.trim(),
        parentPhone: phone.replace(/\D/g, ""),
        parentEmail: parentEmail.trim() || undefined,
        isNewFamily: true,
        authorizedPickups: authorizedPickups.trim() || undefined,
        children,
      }),
    });

    const data = await res.json();
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError(data.error ?? "Check-in failed. Please try again.");
      return;
    }
    setSecurityCode(data.securityCode);
    setPrintJobsCreated(data.printJobsCreated ?? 0);
    setLabels(data.labels ?? []);
    setStep("success");
  }

  function reset() {
    setStep("phone");
    setPhone("");
    setLookupError("");
    setParentEmail("");
    setAuthorizedPickups("");
    setFamily(null);
    setExistingChildren([]);
    setAddedChildren([]);
    setParentName("");
    setNewFamilyChildren([emptyNewChild()]);
    setSubmitError("");
    setSecurityCode(null);
    setPrintJobsCreated(0);
    setLabels([]);
  }

  const serviceSubtitle = `${serviceName} · ${fmtDate(serviceDate)}`;

  function Header({ title, green }: { title: string; green?: boolean }) {
    return (
      <div
        style={{
          backgroundColor: green ? "#16a34a" : ACCENT,
          padding: "24px 32px",
          flexShrink: 0,
        }}
      >
        <p style={{ color: "white", fontWeight: 700, fontSize: 20, margin: 0 }}>
          {title}
        </p>
        <p style={{ color: "white", opacity: 0.75, fontSize: 14, margin: "4px 0 0" }}>
          {serviceSubtitle}
        </p>
      </div>
    );
  }
async function handleAttendanceSubmit() {
  setSubmitError("");

  if (family) {
    return handleReturningSubmit();
  }

  return handleNewFamilySubmit();
}

  // ── SUCCESS ─────────────────────────────────────────────────────────────

if (step === "success") {
  return (
    <>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          #print-area,
          #print-area * {
            visibility: visible;
          }

          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }

          .print-label {
            width: 4in;
            height: 2in;
            border: 2px solid black;
            padding: 12px;
            margin-bottom: 12px;
            page-break-after: always;
            color: black !important;
            background: white !important;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            font-family: Arial, sans-serif;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-[#0f2e17] text-white flex flex-col items-center px-6 py-10">
        <div className="no-print text-center max-w-xl w-full">
          <div className="text-7xl mb-4">✅</div>

          <h1 className="text-5xl font-bold mb-4">
            Checked In!
          </h1>

          <p className="text-green-300 text-xl mb-6">
            Your security code is:
          </p>

          <div className="border-4 border-green-400 rounded-3xl p-8 mb-6">
            <div className="text-8xl font-black tracking-widest">
              {securityCode}
            </div>

            <div className="mt-4 text-green-300 text-xl">
              You will need this code to pick up your child
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="w-full bg-white text-black text-3xl font-bold py-6 rounded-2xl mb-6"
          >
            🖨️ Print Labels
          </button>
        </div>

        <div id="print-area" className="w-full flex flex-col items-center">
          {labels.map((label, idx) => (
            <div
              key={idx}
              className="print-label"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-3xl font-black">
                    {label.childName}
                  </div>

                  {label.labelType === "child" && (
                    <div className="text-xl mt-1">
                      Room: {label.roomName ?? "No room assigned"}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-xs uppercase font-bold">
                    {label.labelType === "parent"
                      ? "Parent Pickup"
                      : "Child Label"}
                  </div>

                  <div className="text-4xl font-black mt-1">
                    {label.securityCode}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-lg">
                  Parent: {label.parentName}
                </div>

                {label.allergies && (
                  <div className="text-red-700 font-bold mt-2">
                    Allergies: {label.allergies}
                  </div>
                )}

                {label.medicalNotes && (
                  <div className="mt-2">
                    Medical: {label.medicalNotes}
                  </div>
                )}

                {label.specialInstructions && (
                  <div className="mt-2">
                    Notes: {label.specialInstructions}
                  </div>
                )}

                {label.authorizedPickups && label.labelType === "parent" && (
                  <div className="mt-2">
                    Auth. Pickups: {label.authorizedPickups}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="no-print max-w-xl w-full mt-8">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-green-400 text-black text-2xl font-bold py-5 rounded-2xl"
          >
            Check In Another Family
          </button>
        </div>
      </div>
    </>
  );
}

  // ── PHONE ────────────────────────────────────────────────────────────────

  if (step === "phone") {
    return (
      <div
        style={{
          minHeight: "100dvh",
          backgroundColor: "#f9fafb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header title="Children's Check-In" />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 32px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 480 }}>
            <h1
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: "#111827",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Welcome!
            </h1>
            <p
              style={{
                fontSize: 20,
                color: "#6b7280",
                textAlign: "center",
                marginBottom: 40,
              }}
            >
              Enter your phone number to check in
            </p>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setLookupError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="(555) 000-0000"
              autoFocus
              style={{
                width: "100%",
                fontSize: 32,
                padding: "20px 24px",
                borderRadius: 20,
                border: "3px solid #e5e7eb",
                textAlign: "center",
                marginBottom: 12,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {lookupError && (
              <p
                style={{
                  color: "#dc2626",
                  textAlign: "center",
                  marginBottom: 12,
                  fontSize: 16,
                }}
              >
                {lookupError}
              </p>
            )}
            <button
              onClick={handleLookup}
              disabled={looking || phone.replace(/\D/g, "").length < 7}
              style={{
                width: "100%",
                padding: "22px",
                borderRadius: 20,
                border: "none",
                backgroundColor: ACCENT,
                color: "white",
                fontSize: 24,
                fontWeight: 800,
                cursor: looking ? "default" : "pointer",
                opacity: looking ? 0.7 : 1,
              }}
            >
              {looking ? "Looking up…" : "Get Started →"}
            </button>

            <p
              style={{
                fontSize: 13,
                color: "#6b7280",
                textAlign: "center",
                marginTop: 20,
                lineHeight: 1.6,
                fontWeight: 700,
              }}
            >
              Your family information is kept private and protected.
              <br />
              Information collected through {churchName || "this ministry"} is never
              sold or shared outside of this ministry.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── RETURNING EDIT (info / add children) ────────────────────────────────

  if (step === "returning-edit") {
    if (!family) { setStep("phone"); return null; }
    return (
      <div
        style={{
          minHeight: "100dvh",
          backgroundColor: "#f9fafb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header title="Edit Family Info" />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "32px",
            maxWidth: 600,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#111827", marginBottom: 4 }}>
            {family.parentFirstName} {family.parentLastName}
          </h2>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              Parent Email for Follow-Up
            </label>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="jane@example.com (optional)"
              style={{ width: "100%", fontSize: 18, padding: "13px 16px", borderRadius: 14, border: "2px solid #e5e7eb", boxSizing: "border-box", outline: "none" }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
              Authorized Pickups (optional)
            </label>
            <input
              type="text"
              value={authorizedPickups}
              onChange={(e) => setAuthorizedPickups(e.target.value)}
              placeholder="e.g. John Smith, Mary Jones"
              style={{ width: "100%", fontSize: 18, padding: "13px 16px", borderRadius: 14, border: "2px solid #e5e7eb", boxSizing: "border-box", outline: "none" }}
            />
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
              Anyone authorized to pick up all children in your family today
            </p>
          </div>

          {existingChildren.length > 0 && (
            <h3 style={{ fontSize: 17, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Children
            </h3>
          )}

          {existingChildren.length === 0 && addedChildren.length === 0 && (
            <div style={{ backgroundColor: "#fef9c3", border: "1px solid #fde047", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 15, color: "#92400e" }}>
              No saved children found — add one below.
            </div>
          )}

          {existingChildren.map((child, i) => (
            <div
              key={child.id}
              style={{ backgroundColor: "white", border: "2px solid #e5e7eb", borderRadius: 16, padding: "16px 20px", marginBottom: 14 }}
            >
              <p style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }}>
                {child.name}
              </p>
              <div style={{ display: "grid", gridTemplateColumns: rooms.length > 0 ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 4 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                    Birthday {child.dateOfBirth ? "" : "(optional)"}
                  </label>
                  <input
                    type="date"
                    value={child.dateOfBirth}
                    max={today}
                    min="2000-01-01"
                    onChange={(e) => {
                      const dob = e.target.value;
                      const autoRoom = dob ? autoAssignRoom(dob, rooms) : "";
                      setExistingChildren((cs) => cs.map((c, j) => j === i ? { ...c, dateOfBirth: dob, roomId: autoRoom || c.roomId } : c));
                    }}
                    style={{ width: "100%", fontSize: 16, padding: "10px 14px", borderRadius: 12, border: "2px solid #e5e7eb", boxSizing: "border-box", outline: "none" }}
                  />
                </div>
                {rooms.length > 0 && (
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 4 }}>
                      Room (optional)
                    </label>
                    <RoomSelect
                      value={child.roomId}
                      onChange={(v) => setExistingChildren((cs) => cs.map((c, j) => j === i ? { ...c, roomId: v } : c))}
                      rooms={rooms}
                    />
                  </div>
                )}
              </div>
              <AllergySection
                state={{ allergies: child.allergies, allergyOther: child.allergyOther, medicalNotes: child.medicalNotes, specialInstructions: child.specialInstructions }}
                onChange={(patch) => setExistingChildren((cs) => cs.map((c, j) => j === i ? { ...c, ...patch } : c))}
              />
            </div>
          ))}

          {addedChildren.map((child, i) => (
            <NewChildCard
              key={i}
              child={child}
              index={existingChildren.length + i}
              rooms={rooms}
              onChange={(updated) => setAddedChildren((cs) => cs.map((c, j) => j === i ? updated : c))}
              onRemove={() => setAddedChildren((cs) => cs.filter((_, j) => j !== i))}
            />
          ))}

          <button
            type="button"
            onClick={() => setAddedChildren((cs) => [...cs, emptyNewChild()])}
            style={{ width: "100%", padding: "16px", borderRadius: 16, border: "2px dashed #e5e7eb", backgroundColor: "white", color: ACCENT, fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}
          >
            + Add Another Child
          </button>

          <button
            onClick={() => setStep("attendance")}
            style={{ width: "100%", padding: "22px", borderRadius: 20, border: "none", backgroundColor: ACCENT, color: "white", fontSize: 22, fontWeight: 800, cursor: "pointer", marginBottom: 12 }}
          >
            Continue →
          </button>
          <button
            onClick={() => { setStep("phone"); setPhone(""); }}
            style={{ width: "100%", padding: "16px", borderRadius: 20, border: "2px solid #e5e7eb", backgroundColor: "white", color: "#6b7280", fontSize: 18, fontWeight: 600, cursor: "pointer" }}
          >
            ← Different Family
          </button>
        </div>
      </div>
    );
  }

  // ── NEW FAMILY ───────────────────────────────────────────────────────────

  if (step === "new") {
    const validCount = newFamilyChildren.filter(
      (c) => c.firstName.trim() && c.lastName.trim(),
    ).length;
    const canSubmit = !!(
      parentName.trim() &&
      phone.replace(/\D/g, "").length >= 7 &&
      validCount > 0
    );

    return (
      <div
        style={{
          minHeight: "100dvh",
          backgroundColor: "#f9fafb",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Header title="New Family Registration" />
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "32px",
            maxWidth: 600,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <h2
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#111827",
              marginBottom: 20,
            }}
          >
            Parent / Guardian Info
          </h2>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 700,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Full Name *
            </label>
            <input
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
              placeholder="Jane Smith"
              autoFocus
              style={{
                width: "100%",
                fontSize: 22,
                padding: "16px 20px",
                borderRadius: 16,
                border: "2px solid #e5e7eb",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 700,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Phone *
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
              style={{
                width: "100%",
                fontSize: 22,
                padding: "16px 20px",
                borderRadius: 16,
                border: "2px solid #e5e7eb",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 700,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Parent Email *
            </label>
            <input
              type="email"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="jane@example.com"
              required
              style={{
                width: "100%",
                fontSize: 22,
                padding: "16px 20px",
                borderRadius: 16,
                border: "2px solid #e5e7eb",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label
              style={{
                display: "block",
                fontSize: 15,
                fontWeight: 700,
                color: "#374151",
                marginBottom: 8,
              }}
            >
              Authorized Pickups (optional)
            </label>
            <input
              type="text"
              value={authorizedPickups}
              onChange={(e) => setAuthorizedPickups(e.target.value)}
              placeholder="e.g. John Smith, Mary Jones"
              style={{
                width: "100%",
                fontSize: 18,
                padding: "14px 18px",
                borderRadius: 16,
                border: "2px solid #e5e7eb",
                boxSizing: "border-box",
                outline: "none",
              }}
            />
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4, marginBottom: 0 }}>
              Anyone authorized to pick up all children in your family today
            </p>
          </div>

          <h3
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#111827",
              marginBottom: 16,
            }}
          >
            Children
          </h3>

          {newFamilyChildren.map((child, i) => (
            <NewChildCard
              key={i}
              child={child}
              index={i}
              rooms={rooms}
              onChange={(updated) =>
                setNewFamilyChildren((cs) =>
                  cs.map((c, j) => (j === i ? updated : c)),
                )
              }
              onRemove={
                newFamilyChildren.length > 1
                  ? () =>
                      setNewFamilyChildren((cs) =>
                        cs.filter((_, j) => j !== i),
                      )
                  : undefined
              }
            />
          ))}

          <button
            type="button"
            onClick={() =>
              setNewFamilyChildren((cs) => [...cs, emptyNewChild()])
            }
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 16,
              border: "2px dashed #e5e7eb",
              backgroundColor: "white",
              color: ACCENT,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 20,
            }}
          >
            + Add Another Child
          </button>

          <p
            style={{
              fontSize: 13,
              color: "#6b7280",
              textAlign: "center",
              marginBottom: 20,
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            Your family information is kept private and protected.
            <br />
            Information collected through {churchName || "this ministry"} is never
            sold or shared outside of this ministry.
          </p>

          {submitError && (
            <p
              style={{
                color: "#dc2626",
                textAlign: "center",
                marginBottom: 12,
                fontSize: 15,
              }}
            >
              {submitError}
            </p>
          )}

          <button
            onClick={() => setStep("attendance")}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "22px",
              borderRadius: 20,
              border: "none",
              backgroundColor: canSubmit ? ACCENT : "#e5e7eb",
              color: canSubmit ? "white" : "#9ca3af",
              fontSize: 22,
              fontWeight: 800,
              cursor: canSubmit ? "pointer" : "default",
              marginBottom: 12,
            }}
          >
            Continue →
          </button>
          <button
            onClick={() => setStep("phone")}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: 20,
              border: "2px solid #e5e7eb",
              backgroundColor: "white",
              color: "#6b7280",
              fontSize: 18,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── ATTENDANCE SELECTION ─────────────────────────────────────────────────

  if (step === "attendance") {
  const isNewFlow = family === null;

  const validNewChildren = isNewFlow
    ? newFamilyChildren.filter((c) => c.firstName.trim() && c.lastName.trim())
    : [];

  const validAddedChildren = !isNewFlow
    ? addedChildren.filter((c) => c.firstName.trim() && c.lastName.trim())
    : [];

  const allDisplayChildren: { name: string; selected: boolean; onToggle: () => void }[] = [
    ...existingChildren.map((child, i) => ({
      name: child.name,
      selected: child.selected,
      onToggle: () =>
        setExistingChildren((cs) =>
          cs.map((c, j) => (j === i ? { ...c, selected: !c.selected } : c)),
        ),
    })),
    ...validAddedChildren.map((child) => {
      const origIdx = addedChildren.indexOf(child);
      return {
        name: `${child.firstName} ${child.lastName}`,
        selected: child.selected,
        onToggle: () =>
          setAddedChildren((cs) =>
            cs.map((c, j) => (j === origIdx ? { ...c, selected: !c.selected } : c)),
          ),
      };
    }),
    ...validNewChildren.map((child) => {
      const origIdx = newFamilyChildren.indexOf(child);
      return {
        name: `${child.firstName} ${child.lastName}`,
        selected: child.selected,
        onToggle: () =>
          setNewFamilyChildren((cs) =>
            cs.map((c, j) => (j === origIdx ? { ...c, selected: !c.selected } : c)),
          ),
      };
    }),
  ];

  const selectedCount = allDisplayChildren.filter((c) => c.selected).length;
  const anySelected = selectedCount > 0;

  const displayParentName = isNewFlow
    ? parentName
    : family ? `${family.parentFirstName} ${family.parentLastName}` : "";

  console.log("[Kiosk] attendance render: total=", allDisplayChildren.length, "selected=", selectedCount);

  return (
    <div
      style={{
        minHeight: "100dvh",
        backgroundColor: "#f0fdf4",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Green header — visually distinct from phone step (orange) */}
      <div
        style={{
          backgroundColor: "#15803d",
          padding: "24px 32px",
          flexShrink: 0,
        }}
      >
        <p style={{ color: "white", fontWeight: 800, fontSize: 22, margin: 0 }}>
          ✅ Who is attending today?
        </p>
        <p style={{ color: "#bbf7d0", opacity: 0.9, fontSize: 14, margin: "4px 0 0" }}>
          {serviceName} · {fmtDate(serviceDate)}
        </p>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 32px",
          maxWidth: 600,
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {displayParentName && (
          <p style={{ fontSize: 22, fontWeight: 800, color: "#14532d", marginBottom: 6 }}>
            {displayParentName}
          </p>
        )}

        <p style={{ fontSize: 18, color: "#374151", marginBottom: 24, lineHeight: 1.4 }}>
          Tap each name to mark as attending or not attending.
        </p>

        {allDisplayChildren.length === 0 && (
          <div
            style={{
              backgroundColor: "#fef9c3",
              border: "1px solid #fde047",
              borderRadius: 12,
              padding: "16px",
              marginBottom: 20,
              fontSize: 15,
              color: "#92400e",
            }}
          >
            No children found. Please go back to add children.
          </div>
        )}

        {allDisplayChildren.map((child, i) => (
          <button
            key={i}
            type="button"
            onClick={child.onToggle}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "stretch",
              marginBottom: 16,
              borderRadius: 20,
              border: `4px solid ${child.selected ? "#15803d" : "#d1d5db"}`,
              backgroundColor: child.selected ? "#dcfce7" : "white",
              cursor: "pointer",
              textAlign: "left",
              boxSizing: "border-box",
              overflow: "hidden",
              padding: 0,
            }}
          >
            {/* Left status stripe */}
            <div
              style={{
                width: 12,
                flexShrink: 0,
                backgroundColor: child.selected ? "#15803d" : "#d1d5db",
              }}
            />

            <div style={{ flex: 1, padding: "22px 20px" }}>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: "#111827",
                  lineHeight: 1.15,
                  marginBottom: 8,
                }}
              >
                {child.name}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    backgroundColor: child.selected ? "#15803d" : "#e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    color: "white",
                    fontWeight: 900,
                    flexShrink: 0,
                  }}
                >
                  {child.selected ? "✓" : "✕"}
                </div>
                <span
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: child.selected ? "#15803d" : "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {child.selected ? "Attending this service" : "Not attending"}
                </span>
              </div>
            </div>
          </button>
        ))}

        {selectedCount > 0 && (
          <p
            style={{
              fontSize: 14,
              color: "#15803d",
              fontWeight: 700,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {selectedCount} child{selectedCount !== 1 ? "ren" : ""} selected for check-in
          </p>
        )}

        {submitError && (
          <p style={{ color: "#dc2626", textAlign: "center", marginBottom: 12, fontSize: 15 }}>
            {submitError}
          </p>
        )}

<button
  onClick={handleAttendanceSubmit}
          disabled={!anySelected || submitting}
          style={{
            width: "100%",
            padding: "24px",
            borderRadius: 20,
            border: "none",
            backgroundColor: anySelected && !submitting ? "#15803d" : "#e5e7eb",
            color: anySelected && !submitting ? "white" : "#9ca3af",
            fontSize: 22,
            fontWeight: 900,
            cursor: anySelected && !submitting ? "pointer" : "default",
            marginBottom: 14,
            letterSpacing: "0.02em",
          }}
        >
          {submitting
            ? "Checking in…"
            : `Check In ${selectedCount > 0 ? selectedCount : ""} Selected Child${selectedCount !== 1 ? "ren" : ""} →`}
        </button>

        <button
          onClick={() => setStep(isNewFlow ? "new" : "returning-edit")}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 20,
            border: "2px solid #d1d5db",
            backgroundColor: "white",
            color: "#6b7280",
            fontSize: 18,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← {isNewFlow ? "Back to Family Info" : "Edit Family Info"}
        </button>
      </div>
    </div>
  );
}

  return null;
}

// ── Allergy / medical section ────────────────────────────────────────────────

function AllergySection({
  state,
  onChange,
}: {
  state: AllergyState;
  onChange: (patch: Partial<AllergyState>) => void;
}) {
  function toggle(label: string) {
    const isSelected = state.allergies.includes(label);
    if (label === "No Known Allergies") {
      onChange({
        allergies: isSelected ? [] : ["No Known Allergies"],
        allergyOther: "",
      });
    } else {
      let next: string[];
      if (isSelected) {
        next = state.allergies.filter((a) => a !== label);
      } else {
        next = [...state.allergies.filter((a) => a !== "No Known Allergies"), label];
      }
      const patch: Partial<AllergyState> = { allergies: next };
      if (isSelected && label === "Other") patch.allergyOther = "";
      onChange(patch);
    }
  }

  return (
    <div
      style={{
        marginTop: 14,
        padding: "14px 16px",
        backgroundColor: "#fafafa",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#374151",
          margin: "0 0 10px",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        Allergies / Medical Concerns
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 7,
          marginBottom: 10,
        }}
      >
        {ALLERGY_OPTIONS.map((opt) => {
          const selected = state.allergies.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: `2px solid ${selected ? ACCENT : "#e5e7eb"}`,
                backgroundColor: selected ? ACCENT + "18" : "white",
                color: selected ? "#78350f" : "#4b5563",
                fontSize: 13,
                fontWeight: selected ? 700 : 500,
                cursor: "pointer",
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                gap: 8,
                lineHeight: 1.3,
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: `2px solid ${selected ? ACCENT : "#d1d5db"}`,
                  backgroundColor: selected ? ACCENT : "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 11,
                  color: "white",
                  fontWeight: 900,
                }}
              >
                {selected ? "✓" : ""}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {state.allergies.includes("Other") && (
        <textarea
          value={state.allergyOther}
          onChange={(e) => onChange({ allergyOther: e.target.value })}
          placeholder="Please describe"
          rows={2}
          style={{
            width: "100%",
            fontSize: 14,
            padding: "10px 12px",
            borderRadius: 10,
            border: "2px solid #e5e7eb",
            boxSizing: "border-box",
            resize: "vertical",
            marginBottom: 10,
            outline: "none",
          }}
        />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Medical Notes (optional)
          </label>
          <textarea
            value={state.medicalNotes}
            onChange={(e) => onChange({ medicalNotes: e.target.value })}
            placeholder="e.g. carries EpiPen, uses inhaler"
            rows={2}
            style={{
              width: "100%",
              fontSize: 13,
              padding: "8px 10px",
              borderRadius: 10,
              border: "2px solid #e5e7eb",
              boxSizing: "border-box",
              resize: "vertical",
              outline: "none",
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Special Instructions (optional)
          </label>
          <textarea
            value={state.specialInstructions}
            onChange={(e) => onChange({ specialInstructions: e.target.value })}
            placeholder="e.g. bathroom reminder every hour"
            rows={2}
            style={{
              width: "100%",
              fontSize: 13,
              padding: "8px 10px",
              borderRadius: 10,
              border: "2px solid #e5e7eb",
              boxSizing: "border-box",
              resize: "vertical",
              outline: "none",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Shared new-child card ────────────────────────────────────────────────────

function NewChildCard({
  child,
  index,
  rooms,
  onChange,
  onRemove,
}: {
  child: NewChildForm;
  index: number;
  rooms: Room[];
  onChange: (c: NewChildForm) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "2px solid #e5e7eb",
        borderRadius: 16,
        padding: "16px 20px",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: "#374151" }}>
          Child {index + 1}
        </span>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              color: "#dc2626",
              fontWeight: 700,
              background: "none",
              border: "none",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <input
          value={child.firstName}
          onChange={(e) => onChange({ ...child, firstName: e.target.value })}
          placeholder="First name *"
          style={{
            fontSize: 18,
            padding: "12px 14px",
            borderRadius: 12,
            border: "2px solid #e5e7eb",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        <input
          value={child.lastName}
          onChange={(e) => onChange({ ...child, lastName: e.target.value })}
          placeholder="Last name *"
          style={{
            fontSize: 18,
            padding: "12px 14px",
            borderRadius: 12,
            border: "2px solid #e5e7eb",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: rooms.length > 0 ? "1fr 1fr" : "1fr",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
              marginBottom: 4,
            }}
          >
            Birthday (optional)
          </label>
          <input
            type="date"
            value={child.dateOfBirth}
            max={today}
            min="2000-01-01"
            onChange={(e) => {
              const dob = e.target.value;
              const autoRoom = dob ? autoAssignRoom(dob, rooms) : "";
              onChange({ ...child, dateOfBirth: dob, roomId: autoRoom || child.roomId });
            }}
            style={{
              width: "100%",
              fontSize: 16,
              padding: "12px 14px",
              borderRadius: 12,
              border: "2px solid #e5e7eb",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>
        {rooms.length > 0 && (
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Room (optional)
            </label>
            <RoomSelect
              value={child.roomId}
              onChange={(v) => onChange({ ...child, roomId: v })}
              rooms={rooms}
            />
          </div>
        )}
      </div>

      <AllergySection
        state={{
          allergies: child.allergies,
          allergyOther: child.allergyOther,
          medicalNotes: child.medicalNotes,
          specialInstructions: child.specialInstructions,
        }}
        onChange={(patch) => onChange({ ...child, ...patch })}
      />
    </div>
  );
}

