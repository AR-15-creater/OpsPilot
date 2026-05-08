from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Task, Ticket, Invoice
from schemas import TaskCreate, TaskResponse, TaskStatusUpdate
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

    analysis = agent_result["analysis"]

    return {
        "id": new_task.id,
        "title": new_task.title,
        "description": new_task.description,
        "task_type": new_task.task_type,
        "status": new_task.status,
        "result": new_task.result,
        "category": analysis.get("category"),
        "priority": analysis.get("priority"),
        "assigned_team": analysis.get("assigned_team"),
        "confidence": analysis.get("confidence"),
        "reasoning": analysis.get("reasoning"),
        "suggestions": analysis.get("suggestions") or [],
        "reply": analysis.get("reply"),
    }

@router.get("/", response_model=list[TaskResponse])
def get_tasks(db: Session = Depends(get_db)):
    return db.query(Task).order_by(Task.id.desc()).all()

@router.patch("/{task_id}/status", response_model=TaskResponse)
def update_task_status(task_id: int, payload: TaskStatusUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()

    if not task:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = payload.status
    db.commit()
    db.refresh(task)

    return task

