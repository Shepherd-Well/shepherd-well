/**
 * TEMPORARY DEBUG: intercepts every INSERT into cm_checkin_rooms,
 * logs the room names, church_id, and full stack trace.
 * Remove once the insertion source is identified.
 */
export function wrapClientForRoomsDebug<T extends { from: (table: string) => any }>(
  client: T,
  clientLabel: string,
): T {
  const originalFrom = (client.from as Function).bind(client);

  (client as any).from = function (table: string) {
    const qb = originalFrom(table);
    if (table !== "cm_checkin_rooms") return qb;

    const originalInsert = qb.insert.bind(qb);
    qb.insert = function (data: any, ...rest: any[]) {
      const stack = new Error().stack ?? "(no stack)";
      const rows: any[] = Array.isArray(data) ? data : [data];
      console.error(
        [
          "",
          "🚨🚨🚨 [DEBUG] cm_checkin_rooms INSERT DETECTED 🚨🚨🚨",
          `  client  : ${clientLabel}`,
          `  rooms   : ${rows.map((r) => r?.name ?? "(unknown)").join(", ")}`,
          `  churchId: ${rows.map((r) => r?.church_id ?? "(unknown)").join(", ")}`,
          "  stack trace:",
          stack
            .split("\n")
            .slice(1, 20)
            .map((l) => "    " + l.trim())
            .join("\n"),
          "🚨🚨🚨 END DEBUG 🚨🚨🚨",
          "",
        ].join("\n"),
      );
      return originalInsert(data, ...rest);
    };

    return qb;
  };

  return client;
}
