import json

from openai import OpenAI

from config import OPENAI_API_KEY, USE_OPENAI
from agent.tools import classify_task, classify_ticket, extract_invoice_data


client = OpenAI(api_key=OPENAI_API_KEY) if USE_OPENAI and OPENAI_API_KEY else None


def normalize_analysis(data: dict):
    suggestions = data.get("suggestions") or []

    if isinstance(suggestions, str):
        suggestions = [suggestions]

    return {
        "task_type": data.get("task_type") or "general",
        "category": data.get("category"),
        "priority": data.get("priority"),
        "assigned_team": data.get("assigned_team"),
        "vendor_name": data.get("vendor_name"),
        "invoice_number": data.get("invoice_number"),
        "amount": data.get("amount"),
        "due_date": data.get("due_date"),
        "confidence": data.get("confidence") or 90,
        "reasoning": data.get("reasoning") or "Matched the request to the most relevant operations workflow.",
        "suggestions": suggestions[:4],
        "reply": data.get("reply") or "I have reviewed this and routed it to the right workflow.",
        "result": data.get("result") or "Business task analyzed",
    }


def analyze_task_with_openai(title: str, description: str):
    if not client:
        print("OPENAI OFF: using rule-based fallback")
        return analyze_task_with_rules(title, description)

    print("OPENAI ON: calling OpenAI API")

    prompt = f"""
You are an AI business operations assistant for OpsPilot.

Analyze the task and return ONLY valid JSON.

Task title:
{title}

Task description:
{description}

Classify the task into exactly one of:
- ticket
- invoice
- general

If task_type is ticket, provide:
category, priority, assigned_team, result

If task_type is invoice, provide:
vendor_name, invoice_number, amount, due_date, result

If task_type is general, provide:
result

Also provide:
- confidence: integer from 0 to 100
- reasoning: one short sentence explaining why you routed it that way
- suggestions: 3 short practical next actions the user/operator can take
- reply: a short professional draft response the operator can send or adapt

Use this exact JSON shape:
{{
  "task_type": "ticket | invoice | general",
  "category": null,
  "priority": null,
  "assigned_team": null,
  "vendor_name": null,
  "invoice_number": null,
  "amount": null,
  "due_date": null,
  "confidence": 95,
  "reasoning": "short routing explanation",
  "suggestions": ["next action 1", "next action 2", "next action 3"],
  "reply": "short response draft",
  "result": "short result message"
}}
"""

    try:
        response = client.responses.create(
            model="gpt-4o-mini",
            input=prompt,
            temperature=0
        )

        print("OPENAI SUCCESS")
        return normalize_analysis(json.loads(response.output_text))

    except Exception as e:
        print("OPENAI FAILED:", e)
        return analyze_task_with_rules(title, description)


def analyze_task_with_rules(title: str, description: str):
    task_type = classify_task(description)

    if task_type == "ticket":
        ticket_data = classify_ticket(description)

        return {
            "task_type": "ticket",
            "category": ticket_data["category"],
            "priority": ticket_data["priority"],
            "assigned_team": ticket_data["assigned_team"],
            "vendor_name": None,
            "invoice_number": None,
            "amount": None,
            "due_date": None,
            "confidence": 88,
            "reasoning": f"The message looks like a support issue and should go to {ticket_data['assigned_team']}.",
            "suggestions": [
                "Check the customer account and recent transaction history.",
                "Confirm whether the issue is repeated or urgent.",
                "Escalate to the assigned team with the original message attached.",
            ],
            "reply": "Thanks for reporting this. We have routed your issue to the right team and will review it as a priority.",
            "result": f"Ticket created and assigned to {ticket_data['assigned_team']}",
        }

    if task_type == "invoice":
        invoice_data = extract_invoice_data(description)

        return {
            "task_type": "invoice",
            "category": None,
            "priority": None,
            "assigned_team": None,
            "vendor_name": invoice_data["vendor_name"],
            "invoice_number": invoice_data["invoice_number"],
            "amount": invoice_data["amount"],
            "due_date": invoice_data["due_date"],
            "confidence": 86,
            "reasoning": "The text contains invoice-like fields such as vendor, amount, invoice number, or due date.",
            "suggestions": [
                "Verify the extracted amount and invoice number.",
                "Check whether the due date needs payment approval.",
                "Attach the original invoice text before forwarding to finance.",
            ],
            "reply": "The invoice details have been extracted. Please review the amount, vendor, and due date before processing.",
            "result": "Invoice data extracted and saved",
        }

    return {
        "task_type": "general",
        "category": None,
        "priority": None,
        "assigned_team": None,
        "vendor_name": None,
        "invoice_number": None,
        "amount": None,
        "due_date": None,
        "confidence": 82,
        "reasoning": "The request does not clearly match a support ticket or invoice, so it was kept as a general operations task.",
        "suggestions": [
            "Add any missing deadline, owner, or business context.",
            "Assign the task to operations for first review.",
            "Convert it to a ticket or invoice if new details appear.",
        ],
        "reply": "This has been saved as a general operations task and can be assigned once more context is available.",
        "result": "General business task saved",
    }
