const test = require("node:test");
const assert = require("node:assert/strict");
const loadTypeScript = require("./load-typescript.cjs");

const validation = loadTypeScript("lib/validation.ts");
const formResults = loadTypeScript("lib/form-results.ts");
const { handleFormSubmission } = loadTypeScript("lib/form-route.ts");

function fixture(failDatabase = false) {
  const inserts = [];
  const overrides = {
    "@/lib/validation": validation,
    "@/lib/references": { generatePublicReference: (type) => `XEN-${type}-A7K42P` },
    "@/lib/db": { getDbPool: () => ({ execute: async (sql, values) => {
      if (failDatabase) throw new Error("Test database unavailable");
      inserts.push({ sql, values });
    } }) },
  };
  return { inserts,
    ...loadTypeScript("lib/contact-submissions.ts", overrides),
    ...loadTypeScript("lib/staff-submissions.ts", overrides) };
}

function contactForm() {
  return formData({ name: "A", email: "a@example.com", subject: "Hi", message: "Hi" });
}

function staffForm() {
  return formData({ discordUsername: "Sparky", timezone: "SAST", role: "Other / flexible",
    weeklyAvailability: "Weekends", experience: "Editing", motivation: "Help Xenon",
    firstThirtyDaysGoal: "Grow", reliabilityExample: "On time", reasonMayLeave: "Work",
    unpaidVolunteerAcknowledgement: "on", email: "  ", portfolioUrl: "  ", supportNeeded: "  " });
}

function formData(values) {
  const form = new FormData();
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

function formRequest(body, headers = {}) {
  return new Request("https://xenon.example/api/contact", {
    method: "POST", headers: { Origin: "https://xenon.example", ...headers }, body,
  });
}

test("a fully filled short enquiry saves without the hidden 20-character limit", async () => {
  const { submitContactForm, inserts } = fixture();
  const response = await handleFormSubmission(formRequest(contactForm()), submitContactForm);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, reference: "XEN-CON-A7K42P" });
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].values, ["XEN-CON-A7K42P", "A", null, "a@example.com", "Hi", "Hi"]);
  assert.match(inserts[0].sql, /VALUES \(\?, \?, \?, \?, \?, \?\)/);
});

test("filled short staff answers and blank optional fields save with the acknowledgement", async () => {
  const { submitStaffApplication, inserts } = fixture();
  const response = await handleFormSubmission(formRequest(staffForm()), submitStaffApplication);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, reference: "XEN-APP-A7K42P" });
  assert.equal(inserts[0].values.length, 14);
  assert.equal(inserts[0].values[2], null);
  assert.equal(inserts[0].values[7], null);
  assert.equal(inserts[0].values[12], null);
  assert.equal(inserts[0].values[13], true);
});

test("invalid enquiries return exact field errors and never call MySQL", async () => {
  const { submitContactForm, inserts } = fixture();
  const form = contactForm();
  form.set("email", "not-an-email");
  form.set("message", "   ");
  const response = await handleFormSubmission(formRequest(form), submitContactForm);
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.deepEqual(result.fieldErrors.email, ["Enter a valid email address."]);
  assert.deepEqual(result.fieldErrors.message, ["Message is required."]);
  assert.equal(inserts.length, 0);
});

test("staff applications still require acknowledgement and respect database column lengths", async () => {
  const { submitStaffApplication, inserts } = fixture();
  const form = staffForm();
  form.delete("unpaidVolunteerAcknowledgement");
  form.set("discordUsername", "X".repeat(121));
  const result = await submitStaffApplication(form);
  assert.equal(result.success, false);
  assert.match(result.fieldErrors.unpaidVolunteerAcknowledgement[0], /unpaid volunteer/);
  assert.match(result.fieldErrors.discordUsername[0], /120/);
  assert.equal(inserts.length, 0);
});

test("honeypots return references without database inserts or bot deliveries", async () => {
  const { submitContactForm, submitStaffApplication, inserts } = fixture();
  const form = formData({ website: "spam" });
  assert.equal((await submitContactForm(form)).success, true);
  assert.equal((await submitStaffApplication(form)).success, true);
  assert.equal(inserts.length, 0);
});

test("cross-origin POSTs are rejected without calling submission code", async () => {
  let called = false;
  const response = await handleFormSubmission(formRequest(contactForm(), { Origin: "https://other.example" }), async () => {
    called = true;
    return { success: true, reference: "XEN-CON-A7K42P" };
  });
  assert.equal(response.status, 403);
  assert.equal(called, false);
});

test("same-origin requests behind a forwarded production host are accepted", async () => {
  const request = new Request("http://localhost:3000/api/contact", {
    method: "POST", headers: { Origin: "https://xenon.example", "X-Forwarded-Host": "xenon.example" },
    body: contactForm(),
  });
  const response = await handleFormSubmission(request, fixture().submitContactForm);
  assert.equal(response.status, 200);
});

test("oversized streamed requests are rejected even without Content-Length", async () => {
  const request = formRequest(new Uint8Array(1024 * 1024 + 1), { "Content-Type": "application/x-www-form-urlencoded" });
  const response = await handleFormSubmission(request, async () => {
    assert.fail("Oversized request reached submission code");
  });
  assert.equal(response.status, 413);
});

test("client transport preserves validation errors and handles offline failures without automatic retries", async (t) => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const { submitForm } = loadTypeScript("lib/submit-form.ts", { "@/lib/form-results": formResults });
  let calls = 0;
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/contact");
    assert.equal(options.method, "POST");
    assert.equal(options.body.get("message"), "Hi");
    return Response.json({ success: false, error: "validation", fieldErrors: { email: ["Enter a valid email address."] } }, { status: 400 });
  };
  const invalid = await submitForm("/api/contact", contactForm());
  assert.equal(invalid.fieldErrors.email[0], "Enter a valid email address.");
  global.fetch = async () => { calls++; throw new TypeError("fetch failed"); };
  assert.deepEqual(await submitForm("/api/contact", contactForm()), { success: false, error: "network" });
  assert.equal(calls, 2);
});
