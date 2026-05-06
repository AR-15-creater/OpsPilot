import re

def classify_task(description: str):
    text = description.lower()

    print("CLASSIFY TASK INPUT:", text)

    ticket_keywords = [
        "login",
        "payment",
        "failed",
        "error",
        "bug",
        "issue",
        "order",
        "account",
        "money",
        "refund"
    ]

    invoice_keywords = [
        "invoice",
        "bill",
        "vendor",
        "amount",
        "due date",
        "payment due"
    ]

    for keyword in invoice_keywords:
        if keyword in text:
            print("CLASSIFIED AS: invoice")
            return "invoice"

    for keyword in ticket_keywords:
        if keyword in text:
            print("MATCHED TICKET KEYWORD:", keyword)
            print("CLASSIFIED AS: ticket")
            return "ticket"

    print("CLASSIFIED AS: general")
    return "general"


def classify_ticket(description: str):
    text = description.lower()

    if "payment" in text or "refund" in text or "money" in text:
        return {
            "category": "Payment Issue",
            "priority": "high",
            "assigned_team": "Billing Team"
        }

    if "login" in text or "account" in text or "password" in text:
        return {
            "category": "Account Access",
            "priority": "medium",
            "assigned_team": "Support Team"
        }

    if "bug" in text or "error" in text or "website" in text:
        return {
            "category": "Technical Issue",
            "priority": "high",
            "assigned_team": "Engineering Team"
        }

    return {
        "category": "General Support",
        "priority": "low",
        "assigned_team": "Customer Support Team"
    }


def extract_invoice_data(description: str):
    amount_match = re.search(r"(?:amount|rs|₹|inr)\s*[:\-]?\s*(\d+(?:\. \d+)?)", description.lower())
    invoice_match = re.search(r"(?:invoice number|invoice no|inv)\s*[:\-]?\s*([a-zA-Z0-9\-]+)", description, re.IGNORECASE)
    vendor_match = re.search(r"(?:vendor|from)\s*[:\-]?\s*([a-zA-Z ]+)", description, re.IGNORECASE)
    due_match = re.search(r"(?:due date|due)\s*[:\-]?\s*([a-zA-Z0-9 ,\-]+)", description, re.IGNORECASE)

    return {
        "vendor_name": vendor_match.group(1).strip() if vendor_match else "Unknown Vendor",
        "invoice_number": invoice_match.group(1).strip() if invoice_match else None,
        "amount": float(amount_match.group(1)) if amount_match else None,
        "due_date": due_match.group(1).strip() if due_match else None
    }
