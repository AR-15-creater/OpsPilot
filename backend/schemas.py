from pydantic import BaseModel, EmailStr

class UserCreate(BaseModel):
    full_name:str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id:int
    full_name:str
    email: EmailStr
    role: str

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskCreate(BaseModel):
    title: str
    description: str

class TaskResponse(BaseModel):
    id: int
    title: str
    description: str
    task_type: str
    status: str
    result: str | None = None
    category: str | None = None
    priority: str | None = None
    assigned_team: str | None = None
    confidence: int | None = None
    reasoning: str | None = None
    suggestions: list[str] = []
    reply: str | None = None

    class Config:
        from_attributes= True

class TicketResponse(BaseModel):
    id: int
    subject: str
    description: str
    category: str
    priority: str
    assigned_team: str
    status: str

    class config:
        from_attributes = True

class InvoiceResponse(BaseModel):
    id: int
    vendor_name: str
    invoice_number: str | None = None
    amount: float | None = None
    due_date : str | None = None
    status: str
    raw_text: str

    class config:
        from_attributes = True
