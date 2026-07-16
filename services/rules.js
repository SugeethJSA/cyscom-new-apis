export async function resolveActiveRule(client, station, ruleId, eventSlug) {
  if (ruleId) {
    const result = await client.query(
      "SELECT * FROM scan_rules WHERE id = $1 AND active = TRUE AND event_slug = $2",
      [ruleId, eventSlug]
    );
    return result.rows[0] ?? null;
  }

  const result = await client.query(
    `SELECT *
       FROM scan_rules
      WHERE station = $1
        AND active = TRUE
        AND event_slug = $2
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at IS NULL OR ends_at >= now())
      ORDER BY starts_at NULLS FIRST, created_at DESC
      LIMIT 1`,
    [station, eventSlug]
  );
  return result.rows[0] ?? null;
}

export function evaluateRule(rule, station) {
  if (!rule) {
    return { allowed: false, reason: "No active rule is available for this station." };
  }

  if (rule.station !== station) {
    return { allowed: false, reason: "The selected station does not match the scan rule." };
  }

  return { allowed: true, reason: "Accepted." };
}
