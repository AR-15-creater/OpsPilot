import json

from openai import OpenAI

from config import USE_OPENAI
from agent.tools import classify_task, classify_ticket, extract_invoice_data


client = OpenAI()


def analyze_task_with_openai(title: str, description: str):
    if not USE_OPENAI:
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
        return json.loads(response.output_text)

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
            "result": f"Ticket created and assigned to {ticket_data['assigned_team']}"
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
            "result": "Invoice data extracted and saved"
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
        "result": "General business task saved"
    }
