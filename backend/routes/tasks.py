from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Task, Ticket, Invoice
from schemas import TaskCreate, TaskResponse
from agent.graph import run_agent_workflow

router = APIRouter(prefix="/tasks", tags=["Tasks"])

@router.post("/", response_model=TaskResponse)
def create_task(task: TaskCreate, db: Session = Depends(get_db)):
    agent_result = run_agent_workflow(task.title, task.description)

    task_type = agent_result["task_type"]
    result = agent_result["result"]

    if task_type == "ticket":
        ticket_data = agent_result["ticket_data"]

        ticket = Ticket(
            subject=task.title,
            description=task.description,
            category=ticket_data["category"],
            priority=ticket_data["priority"],
            assigned_team=ticket_data["assigned_team"]
        )

        db.add(ticket)
        
    elif task_type == "invoice":
        invoice_data = agent_result["invoice_data"]

        invoice = Invoice(
            vendor_name=invoice_data["vendor_name"],
            invoice_number=invoice_data["invoice_number"],
            amount=invoice_data["amount"],
            due_date=invoice_data["due_date"],
            raw_text=task.description
        )

        db.add(invoice)
        

    new_task = Task(
        title=task.title,
        description=task.description,
        task_type=task_type,
        result=result
    )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)

    return new_task

@router.get("/", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.id.desc()).all()


