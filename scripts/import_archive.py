"""Seed a standalone catalog from the legacy archive's CSV and JSON data."""
import csv
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import create_app, db
from app.models import InventoryCategory, InventoryItem, VenueTemplate


def category(name):
    row = db.session.query(InventoryCategory).filter_by(name=name).first()
    if not row: row = InventoryCategory(name=name); db.session.add(row); db.session.flush()
    return row


def main(source):
    source = Path(source)
    app = create_app()
    with app.app_context():
        inventory_csv = source / "data" / "Inventory.csv"
        if inventory_csv.exists():
            with inventory_csv.open(encoding="utf-8-sig", newline="") as handle:
                for row in list(csv.reader(handle))[1:]:
                    if len(row) < 3 or not row[1].strip(): continue
                    name, category_name = row[1].strip(), row[2].strip() or "Imported"
                    if db.session.query(InventoryItem).filter_by(name=name).first(): continue
                    numeric = next((x for x in reversed(row) if x.strip().replace('.', '', 1).isdigit()), "")
                    db.session.add(InventoryItem(name=name, category=category(category_name), quantity=int(float(numeric)) if numeric else None, shape="rectangle", width_ft=2, height_ft=2, color="#6173c9"))
        catalog_file = source / "static" / "data" / "inventory" / "catalog.json"
        if catalog_file.exists():
            for section in json.loads(catalog_file.read_text()).get("sections", []):
                cat = category(section.get("title") or "Imported")
                for raw in section.get("items", []):
                    name = raw.get("name")
                    if not name or db.session.query(InventoryItem).filter_by(name=name).first(): continue
                    shape = "circle" if raw.get("type") in {"round", "circle"} else "rectangle"
                    width = raw.get("diameter") or raw.get("width") or 2
                    height = raw.get("diameter") or raw.get("length") or raw.get("height") or width
                    db.session.add(InventoryItem(name=name, category=cat, quantity=None, shape=shape, width_ft=width, height_ft=height, color=raw.get("color") or "#6173c9", metadata_json={"aliases": raw.get("aliases", [])}))
        for filename, kind in (("indoor_rooms.json", "room"), ("tents.json", "tent")):
            path = source / "static" / "data" / "venues" / filename
            if path.exists():
                for raw in json.loads(path.read_text()):
                    if raw.get("name") and not db.session.query(VenueTemplate).filter_by(name=raw["name"]).first():
                        db.session.add(VenueTemplate(name=raw["name"], type=kind, width_ft=raw["width"], height_ft=raw["height"], color="#64748b", metadata_json={k:v for k,v in raw.items() if k not in {"name","width","height","type"}}))
        db.session.commit()
        print("Legacy inventory and venue catalog imported.")


if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("Usage: python scripts/import_archive.py /path/to/legacy-archive")
    main(sys.argv[1])
