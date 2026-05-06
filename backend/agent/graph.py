from langgraph.graph import END, START, StateGraph

from agent.llm import analyze_task_with_openai


def analyze_task_node(state: dict):
    analysis = analyze_task_with_openai(
        state["title"],
        state["description"]
    )

    state["task_type"] = analysis["task_type"]
    state["analysis"] = analysis
    state["result"] = analysis["result"]

    return state


def route_task(state: dict):
    if state["task_type"] == "ticket":
        return "ticket_node"

    if state["task_type"] == "invoice":
        return "invoice_node"

    return "general_node"


def ticket_node(state: dict):
    analysis = state["analysis"]

    state["ticket_data"] = {
        "category": analysis["category"],
        "priority": analysis["priority"],
        "assigned_team": analysis["assigned_team"]
    }

    return state


def invoice_node(state: dict):
    analysis = state["analysis"]

    state["invoice_data"] = {
        "vendor_name": analysis["vendor_name"],
        "invoice_number": analysis["invoice_number"],
        "amount": analysis["amount"],
        "due_date": analysis["due_date"]
    }

    return state


def general_node(state: dict):
    return state


workflow = StateGraph(dict)

workflow.add_node("analyze_task", analyze_task_node)
workflow.add_node("ticket_node", ticket_node)
workflow.add_node("invoice_node", invoice_node)
workflow.add_node("general_node", general_node)

workflow.add_edge(START, "analyze_task")

workflow.add_conditional_edges(
    "analyze_task",
    route_task,
    {
        "ticket_node": "ticket_node",
        "invoice_node": "invoice_node",
        "general_node": "general_node"
    }
)

workflow.add_edge("ticket_node", END)
workflow.add_edge("invoice_node", END)
workflow.add_edge("general_node", END)

agent_graph = workflow.compile()


def run_agent_workflow(title: str, description: str):
    initial_state = {
        "title": title,
        "description": description,
        "task_type": "general",
        "result": "",
        "analysis": None,
        "ticket_data": None,
        "invoice_data": None
    }

    return agent_graph.invoke(initial_state)
