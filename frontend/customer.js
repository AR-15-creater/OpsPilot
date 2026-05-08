const API_BASE = "https://opspilot-d359.onrender.com";

const form = document.querySelector("#customerForm");
const message = document.querySelector("#customerMessage");
const submitButton = document.querySelector("#customerSubmit");

async function submitRequest(event) {
  event.preventDefault();

  const data = new FormData(form);
  const customerName = String(data.get("customer_name") || "").trim();
  const email = String(data.get("email") || "").trim();
  const requestType = String(data.get("request_type") || "General request");
  const channel = String(data.get("channel") || "Website Form");
  const reference = String(data.get("reference") || "").trim();
  const body = String(data.get("message") || "").trim();

  const titleParts = [requestType, reference].filter(Boolean);
  const title = titleParts.join(" - ").slice(0, 140);
  const description = [
    `Customer: ${customerName}`,
    `Email: ${email}`,
    `Request type: ${requestType}`,
    `Channel: ${channel}`,
    reference ? `Reference: ${reference}` : "",
    "",
    body,
  ].filter(Boolean).join("\n");

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  message.textContent = "Sending request to OpsPilot...";

  try {
    const response = await fetch(`${API_BASE}/tasks/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        description,
      }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.detail || "Request could not be submitted");
    }

    form.reset();
    const trackUrl = `track.html?id=${result.id}`;
    message.innerHTML = `Request #${result.id} submitted. <a href="${trackUrl}">Track your request</a>.`;
  } catch (error) {
    message.textContent = `${error.message}. Please try again in a moment.`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit request";
  }
}

form.addEventListener("submit", submitRequest);
