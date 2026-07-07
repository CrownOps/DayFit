from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.book import Book
from app.models.user import User
from app.schemas.book import BookCreate, BookOut, BookOwner, BookScope, BookStatus, BookUpdate

router = APIRouter(prefix="/api/books", tags=["books"])

# Order used when listing across all statuses: currently reading first, then to-read, then done.
_STATUS_ORDER = {"reading": 0, "want": 1, "done": 2}


def _get_owned(db: Session, book_id: int, user: User) -> Book:
    book = db.get(Book, book_id)
    if book is None or book.user_id != user.id:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _to_out(book: Book, owner_id: int, owner_name: str) -> BookOut:
    out = BookOut.model_validate(book)
    out.owner = BookOwner(id=owner_id, name=owner_name)
    return out


@router.get("", response_model=list[BookOut])
def list_books(
    scope: BookScope = Query("own"),
    status: Optional[BookStatus] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List books with each record's owner.

    scope=own  -> the current user's books.
    scope=team -> every book from members sharing the user's team_id (read-only view).
    """
    query = db.query(Book, User.id, User.name).join(User, Book.user_id == User.id)
    if scope == "team":
        if not user.team_id:
            return []
        query = query.filter(User.team_id == user.team_id)
    else:
        query = query.filter(Book.user_id == user.id)
    if status is not None:
        query = query.filter(Book.status == status)

    rows = query.all()
    rows.sort(key=lambda r: (_STATUS_ORDER.get(r[0].status, 9), -r[0].id))
    return [_to_out(book, uid, uname) for book, uid, uname in rows]


@router.post("", response_model=BookOut)
def create_book(payload: BookCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = Book(user_id=user.id, **payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    return _to_out(book, user.id, user.name)


@router.patch("/{book_id}", response_model=BookOut)
def update_book(
    book_id: int, payload: BookUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    book = _get_owned(db, book_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(book, field, value)
    db.add(book)
    db.commit()
    db.refresh(book)
    return _to_out(book, user.id, user.name)


@router.delete("/{book_id}", status_code=204)
def delete_book(book_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    book = _get_owned(db, book_id, user)
    db.delete(book)
    db.commit()
