from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    cash_balance = Column(Float, default=10000.0) # Capital inicial virtual

    portfolios = relationship("Portfolio", back_populates="owner")
    orders = relationship("Order", back_populates="owner")

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    asset = Column(String, nullable=False)  # ex: PETR4
    quantity = Column(Integer, default=0)
    average_price = Column(Float, default=0.0)

    owner = relationship("User", back_populates="portfolios")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    asset = Column(String, nullable=False)
    side = Column(String, nullable=False)  # "BUY" ou "SELL"
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    status = Column(String, default="OPEN")  # "OPEN", "EXECUTED", "CANCELLED"
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="orders")