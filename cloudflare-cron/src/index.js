const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function readBinding(binding, name) {
  if (typeof binding === "string") {
    return binding;
  }

  if (binding && typeof binding.get === "function") {
    const value = await binding.get();
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  throw new Error(`Missing or invalid Cloudflare binding: ${name}`);
}

async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}) for ${url}: ${responseText.slice(0, 500)}`,
    );
  }

  return responseText;
}

async function runTicketAutomation(env) {
  const [baseUrlValue, token] = await Promise.all([
    readBinding(env.TICKET_AUTOMATION_APP_BASE_URL, "TICKET_AUTOMATION_APP_BASE_URL"),
    readBinding(env.TICKET_AUTOMATION_CRON_SECRET, "TICKET_AUTOMATION_CRON_SECRET"),
  ]);
  const baseUrl = baseUrlValue.replace(/\/$/, "");

  return postJson(`${baseUrl}/api/tickets/process`, token, { maxTicks: 1 });
}

async function runCalendarScope(env, scope) {
  const [baseUrlValue, token] = await Promise.all([
    readBinding(env.FINANCIAL_REMINDERS_APP_BASE_URL, "FINANCIAL_REMINDERS_APP_BASE_URL"),
    readBinding(env.CRON_SECRET, "CRON_SECRET"),
  ]);
  const baseUrl = baseUrlValue.replace(/\/$/, "");

  return postJson(`${baseUrl}/api/internal/calendar-tick`, token, { maxTicks: 1, scope });
}

async function runMarketingQueue(env) {
  const [baseUrlValue, token] = await Promise.all([
    readBinding(env.MARKETING_APP_BASE_URL, "MARKETING_APP_BASE_URL"),
    readBinding(env.MARKETING_CRON_SECRET, "MARKETING_CRON_SECRET"),
  ]);
  const baseUrl = baseUrlValue.replace(/\/$/, "");

  return postJson(`${baseUrl}/api/marketing/process`, token, { maxTicks: 20 });
}

async function runTask(name, task) {
  try {
    await task();
    console.log(`[cron] ${name}: ok`);
  } catch (error) {
    console.error(`[cron] ${name}: failed`, error);
    throw error;
  }
}

// All times are UTC. Buenos Aires is UTC-3 (09:00 AR = 12:00 UTC).
// Ticket automation remains opt-in until the ticketing product launches.
// Cloudflare invokes this Worker every 10 minutes; not every feature needs
// to hit the Vercel API at that frequency.
export default {
  async scheduled(controller, env, ctx) {
    const scheduledDate = new Date(controller.scheduledTime);
    const minute = scheduledDate.getUTCMinutes();
    const hour = scheduledDate.getUTCHours();

    // Keep existing marketing dispatch cadence while campaigns may be queued.
    const tasks = [runTask("marketing-queue", () => runMarketingQueue(env))];

    // Deliberately disabled by default. Re-enable only when digital tickets launch.
    if (env.ENABLE_TICKET_AUTOMATION === "true") {
      tasks.push(runTask("ticket-automation", () => runTicketAutomation(env)));
    }

    if (minute === 0) {
      // Commercial follow-ups and operational alerts: once per hour.
      tasks.push(
        runTask("commercial", () => runCalendarScope(env, "commercial")),
        runTask("operations", () => runCalendarScope(env, "operations")),
      );

      // Delivery of due financial reminders: every two hours.
      if (hour % 2 === 0) {
        tasks.push(runTask("financial-delivery", () => runCalendarScope(env, "financial-delivery")));
      }

      // Financial reconciliation is expensive: only once per day (08:00 AR).
      if (hour === 11) {
        tasks.push(runTask("financial-sync", () => runCalendarScope(env, "financial-sync")));
      }

      // Daily digest and birthday campaigns once per day (09:00 AR).
      if (hour === 12) {
        tasks.push(runTask("daily", () => runCalendarScope(env, "daily")));
      }
    }

    ctx.waitUntil(Promise.all(tasks));
  },
};
