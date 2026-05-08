const API_BASE = "https://opspilot-d359.onrender.com";

const params = new URLSearchParams(window.location.search);
const requestId = params.get("id");

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

async function loadRequest() {
  if (!requestId) {
    setText("#trackTitle", "Request ID missing");
    setText("#trackNote", "Please open this page from the request submission confirmation link.");
    return;
  }

  setText("#trackId", `#${requestId}`);

  try {
    const response = await fetch(`${API_BASE}/tasks/`);
    const tasks = await response.json();
    const task = tasks.find((item) => String(item.id) === String(requestId));

    if (!task) {
      throw new Error("Request not found");
    }

    setText("#trackTitle", task.title);
    setText("#trackStatus", task.status === "completed" ? "New" : task.status);
    setText("#trackType", task.task_type);
    setText("#trackMessage", task.description);
    setText("#trackNote", "Our team can see this request in OpsPilot.");
  } catch (error) {
    setText("#trackTitle", "Unable to load request");
    setText("#trackMessage", error.message);
    setText("#trackNote", "Please try again after a few moments.");
  }
}

loadRequest();
window.setInterval(loadRequest, 15000);
