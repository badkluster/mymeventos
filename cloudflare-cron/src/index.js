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

async function runFinancialReminders(env) {
  const [baseUrlValue, token] = await Promise.all([
    readBinding(env.FINANCIAL_REMINDERS_APP_BASE_URL, "FINANCIAL_REMINDERS_APP_BASE_URL"),
    readBinding(env.CRON_SECRET, "CRON_SECRET"),
  ]);
  const baseUrl = baseUrlValue.replace(/\/$/, "");

  return postJson(`${baseUrl}/api/internal/calendar-tick`, token, { maxTicks: 1 });
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

export default {
  async scheduled(controller, env, ctx) {
    const scheduledDate = new Date(controller.scheduledTime);
    const minute = scheduledDate.getUTCMinutes();

    const tasks = [
      runTask("ticket-automation", () => runTicketAutomation(env)),
    ];

    // The Worker wakes up every 5 minutes. Financial and marketing jobs only
    // need to run every 10 minutes, so run them on UTC minutes divisible by 10.
    if (minute % 10 === 0) {
      tasks.push(
        runTask("financial-reminders", () => runFinancialReminders(env)),
        runTask("marketing-queue", () => runMarketingQueue(env)),
      );
    }

    ctx.waitUntil(Promise.all(tasks));
  },
};
