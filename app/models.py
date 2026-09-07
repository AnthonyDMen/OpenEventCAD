from datetime import datetime, timezone
from . import db


def now():
    return datetime.now(timezone.utc)


class Timestamped:
    created_at = db.Column(db.DateTime(timezone=True), default=now, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=now, onupdate=now, nullable=False)


class InventoryCategory(db.Model, Timestamped):
    __tablename__ = "inventory_categories"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)


class InventoryItem(db.Model, Timestamped):
    __tablename__ = "inventory_items"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    category_id = db.Column(db.Integer, db.ForeignKey("inventory_categories.id", ondelete="SET NULL"))
    category = db.relationship("InventoryCategory")
    quantity = db.Column(db.Integer, nullable=True)
    shape = db.Column(db.String(16), nullable=False, default="rectangle")
    width_ft = db.Column(db.Float, nullable=True)
    height_ft = db.Column(db.Float, nullable=True)
    color = db.Column(db.String(16), nullable=False, default="#6173c9")
    metadata_json = db.Column(db.JSON, nullable=False, default=dict)


class VenueTemplate(db.Model, Timestamped):
    __tablename__ = "venue_templates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    type = db.Column(db.String(16), nullable=False, default="room")
    width_ft = db.Column(db.Float, nullable=False)
    height_ft = db.Column(db.Float, nullable=False)
    color = db.Column(db.String(16), nullable=False, default="#64748b")
    metadata_json = db.Column(db.JSON, nullable=False, default=dict)
