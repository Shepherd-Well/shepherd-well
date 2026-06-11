import { adminClient } from "@/lib/api-auth";
import KioskCheckInForm from "./KioskCheckInForm";

type Props = { params: Promise<{ sessionToken: string }> };

export default async function KioskPage({ params }: Props) {
  const { sessionToken } = await params;
  const admin = adminClient();

  const { data: session } = await admin
    .from("cm_checkin_sessions")
    .select("id, church_id, service_name, date, status")
    .eq("id", sessionToken)
    .maybeSingle();

  if (!session || session.status !== "open") {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#1a2e1a" }}
      >
        <div className="text-center text-white p-8">
          <div className="text-6xl mb-4">⛔</div>
          <h1 className="text-3xl font-bold mb-2">Check-In Unavailable</h1>
          <p className="text-lg text-gray-300">
            {!session
              ? "This check-in session was not found."
              : "This check-in session is currently closed."}
          </p>
          <p className="text-sm text-gray-500 mt-4">
            Please see a staff member for assistance.
          </p>
        </div>
      </div>
    );
  }

  const [{ data: rooms }, { data: church }] = await Promise.all([
    admin
      .from("cm_checkin_rooms")
      .select("id, name, min_age, max_age")
      .eq("church_id", session.church_id)
      .eq("is_active", true)
      .order("name"),
    admin
      .from("churches")
      .select("name")
      .eq("id", session.church_id)
      .maybeSingle(),
  ]);

  return (
    <KioskCheckInForm
      sessionToken={sessionToken}
      serviceName={session.service_name}
      serviceDate={session.date}
      rooms={rooms ?? []}
      churchName={church?.name ?? ""}
    />
  );
}
