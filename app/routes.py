import base64
import json
import math
from urllib.parse import urlencode
from urllib.request import urlopen

from flask import Blueprint, jsonify, render_template, request
from sqlalchemy import select
from . import db
from .models import InventoryCategory, InventoryItem, VenueTemplate

bp = Blueprint("main", __name__)
SHAPES = {"rectangle", "circle", "line", "label"}
VENUE_TYPES = {"room", "tent"}
USGS_NAIP_URL = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"


def _stamp(value): return value.isoformat() if value else None
def _remote_json(url):
    with urlopen(url, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))
def _remote_bytes(url):
    with urlopen(url, timeout=30) as response:
        return response.read(), response.headers.get_content_type()
def _number_arg(name, minimum, maximum):
    try: value = float(request.args.get(name, ""))
    except (TypeError, ValueError): raise ValueError(f"{name} must be a number")
    if not math.isfinite(value) or value < minimum or value > maximum: raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value
def _usgs_export_size(width_ft, height_ft, preview=False):
    """Keep picker requests small; final requests retain useful ground detail."""
    longest_side = max(width_ft, height_ft)
    target_longest = 760 if preview else min(4096, max(800, math.ceil(longest_side * 2)))
    return max(1, round(target_longest * width_ft / longest_side)), max(1, round(target_longest * height_ft / longest_side))
def category_json(row): return {"id": row.id, "name": row.name}
def item_json(row):
    return {"id": row.id, "name": row.name, "category_id": row.category_id, "category": row.category.name if row.category else None, "quantity": row.quantity, "shape": row.shape, "width_ft": row.width_ft, "height_ft": row.height_ft, "color": row.color, "metadata": row.metadata_json or {}}
def venue_json(row): return {"id": row.id, "name": row.name, "type": row.type, "width_ft": row.width_ft, "height_ft": row.height_ft, "color": row.color, "metadata": row.metadata_json or {}}


@bp.get("/")
def index():
    return render_template("planner.html", planner_context={"mode": "standalone", "document_title": "Untitled planner"})

@bp.get("/healthz")
def health(): return {"status": "ok"}


@bp.get("/api/reference-map/geocode")
def reference_map_geocode():
    address = str(request.args.get("address") or "").strip()
    if len(address) < 5 or len(address) > 240: return jsonify(error="Enter a complete U.S. street address."), 400
    try:
        data = _remote_json(f"{CENSUS_GEOCODER_URL}?{urlencode({'address': address, 'benchmark': 'Public_AR_Current', 'format': 'json'})}")
        matches = data.get("result", {}).get("addressMatches", [])
        if not matches: return jsonify(error="No U.S. address match was found. Enter latitude and longitude instead."), 404
        match = matches[0]; coordinates = match.get("coordinates") or {}
        return jsonify(address=match.get("matchedAddress") or address, lon=float(coordinates["x"]), lat=float(coordinates["y"]))
    except Exception:
        return jsonify(error="The public address service is unavailable right now. Enter latitude and longitude instead."), 502


@bp.get("/api/reference-map/usgs-naip")
def reference_map_usgs_naip():
    try:
        lon = _number_arg("lon", -170, -60); lat = _number_arg("lat", 18, 72)
        preview = str(request.args.get("preview") or "").lower() in {"1", "true", "yes"}
        coverage_limit = 8000 if preview else 2000
        width_ft = _number_arg("width_ft", 50, coverage_limit); height_ft = _number_arg("height_ft", 50, coverage_limit)
    except ValueError as exc: return jsonify(error=str(exc)), 400
    lat_radians = math.radians(lat); mercator_factor = max(.05, math.cos(lat_radians))
    center_x = 6378137 * math.radians(lon)
    center_y = 6378137 * math.log(math.tan(math.pi / 4 + lat_radians / 2))
    half_width = width_ft * .3048 / mercator_factor / 2; half_height = height_ft * .3048 / mercator_factor / 2
    image_width, image_height = _usgs_export_size(width_ft, height_ft, preview)
    params = {"bbox": f"{center_x-half_width},{center_y-half_height},{center_x+half_width},{center_y+half_height}", "bboxSR": 3857, "imageSR": 3857, "size": f"{image_width},{image_height}", "format": "jpg", "f": "json"}
    try:
        exported = _remote_json(f"{USGS_NAIP_URL}?{urlencode(params)}")
        href = exported.get("href")
        if not href: return jsonify(error="USGS did not return aerial imagery for that location."), 404
        image_bytes, content_type = _remote_bytes(href)
        extent = exported.get("extent") or {}
        image_width = int(exported.get("width") or image_width); image_height = int(exported.get("height") or image_height)
        extent_width = float(extent.get("xmax", 0)) - float(extent.get("xmin", 0)); extent_height = float(extent.get("ymax", 0)) - float(extent.get("ymin", 0))
        if extent_width <= 0 or extent_height <= 0: return jsonify(error="USGS returned imagery without a usable geographic extent."), 502
        pixels_per_foot = (image_width / (extent_width * mercator_factor / .3048) + image_height / (extent_height * mercator_factor / .3048)) / 2
        return jsonify(image_data_url=f"data:{content_type or 'image/png'};base64,{base64.b64encode(image_bytes).decode('ascii')}", name="USGS NAIP aerial reference", pixels_per_foot=pixels_per_foot, coverage_ft={"width": width_ft, "height": height_ft}, extent=extent, center={"lon": lon, "lat": lat}, attribution="USGS, USDA, The National Map: Orthoimagery", width=image_width, height=image_height, preview=preview)
    except Exception:
        return jsonify(error="USGS aerial imagery is unavailable for that location right now."), 502

def _category_from(data):
    cat_id = data.get("category_id")
    if cat_id is None: return None
    return db.get_or_404(InventoryCategory, cat_id)
def _apply_item(row, data):
    for key in ("name", "color"):
        if key in data: setattr(row, key, str(data[key]).strip())
    if "shape" in data:
        if data["shape"] not in SHAPES: raise ValueError("shape is invalid")
        row.shape = data["shape"]
    for key in ("quantity", "width_ft", "height_ft"):
        if key in data: setattr(row, key, data[key])
    if "metadata" in data:
        if not isinstance(data["metadata"], dict): raise ValueError("metadata must be an object")
        row.metadata_json = data["metadata"]
    if "category_id" in data: row.category = _category_from(data)
    if not row.name: raise ValueError("name is required")
    if row.shape in {"rectangle", "circle", "line"} and (not row.width_ft or row.width_ft <= 0): raise ValueError("positive width_ft is required")

@bp.route("/api/categories", methods=["GET", "POST"])
def categories():
    if request.method == "GET": return jsonify(items=[category_json(x) for x in db.session.scalars(select(InventoryCategory).order_by(InventoryCategory.name)).all()])
    name = str((request.get_json() or {}).get("name") or "").strip()
    if not name: return jsonify(error="name is required"), 400
    row = InventoryCategory(name=name); db.session.add(row); db.session.commit(); return jsonify(category_json(row)), 201

@bp.route("/api/categories/<int:category_id>", methods=["PUT", "DELETE"])
def category(category_id):
    row = db.get_or_404(InventoryCategory, category_id)
    if request.method == "DELETE": db.session.delete(row); db.session.commit(); return "", 204
    name = str((request.get_json() or {}).get("name") or "").strip()
    if not name: return jsonify(error="name is required"), 400
    row.name = name; db.session.commit(); return jsonify(category_json(row))

@bp.route("/api/inventory", methods=["GET", "POST"])
def inventory():
    if request.method == "GET": return jsonify(items=[item_json(x) for x in db.session.scalars(select(InventoryItem).order_by(InventoryItem.name)).all()])
    row = InventoryItem(name="")
    try: _apply_item(row, request.get_json() or {})
    except ValueError as exc: return jsonify(error=str(exc)), 400
    db.session.add(row); db.session.commit(); return jsonify(item_json(row)), 201

@bp.route("/api/inventory/<int:item_id>", methods=["PUT", "DELETE"])
def inventory_item(item_id):
    row = db.get_or_404(InventoryItem, item_id)
    if request.method == "DELETE": db.session.delete(row); db.session.commit(); return "", 204
    try: _apply_item(row, request.get_json() or {})
    except ValueError as exc: return jsonify(error=str(exc)), 400
    db.session.commit(); return jsonify(item_json(row))


def _apply_venue(row, data):
    for key in ("name", "color"):
        if key in data: setattr(row, key, str(data[key]).strip())
    if "type" in data:
        if data["type"] not in VENUE_TYPES: raise ValueError("type is invalid")
        row.type = data["type"]
    for key in ("width_ft", "height_ft"):
        if key in data: setattr(row, key, data[key])
    if "metadata" in data:
        if not isinstance(data["metadata"], dict): raise ValueError("metadata must be an object")
        row.metadata_json = data["metadata"]
    if not row.name or not row.width_ft or not row.height_ft or row.width_ft <= 0 or row.height_ft <= 0: raise ValueError("name and positive dimensions are required")

@bp.route("/api/venues", methods=["GET", "POST"])
def venues():
    if request.method == "GET": return jsonify(items=[venue_json(x) for x in db.session.scalars(select(VenueTemplate).order_by(VenueTemplate.name)).all()])
    row = VenueTemplate(name="", width_ft=0, height_ft=0)
    try: _apply_venue(row, request.get_json() or {})
    except ValueError as exc: return jsonify(error=str(exc)), 400
    db.session.add(row); db.session.commit(); return jsonify(venue_json(row)), 201

@bp.route("/api/venues/<int:venue_id>", methods=["PUT", "DELETE"])
def venue(venue_id):
    row = db.get_or_404(VenueTemplate, venue_id)
    if request.method == "DELETE": db.session.delete(row); db.session.commit(); return "", 204
    try: _apply_venue(row, request.get_json() or {})
    except ValueError as exc: return jsonify(error=str(exc)), 400
    db.session.commit(); return jsonify(venue_json(row))


@bp.get("/api/catalog/export")
def export_catalog():
    return jsonify(version=1, categories=[category_json(x) for x in db.session.scalars(select(InventoryCategory).order_by(InventoryCategory.name)).all()], inventory=[item_json(x) for x in db.session.scalars(select(InventoryItem).order_by(InventoryItem.name)).all()], venues=[venue_json(x) for x in db.session.scalars(select(VenueTemplate).order_by(VenueTemplate.name)).all()])


@bp.post("/api/catalog/import")
def import_catalog():
    data = request.get_json() or {}
    if not isinstance(data, dict) or not all(isinstance(data.get(k, []), list) for k in ("categories", "inventory", "venues")):
        return jsonify(error="catalog must contain categories, inventory, and venues arrays"), 400
    category_ids = {}
    try:
        for raw in data["categories"]:
            name = str(raw.get("name") or "").strip()
            if not name: raise ValueError("category names are required")
            row = db.session.scalar(select(InventoryCategory).where(InventoryCategory.name == name)) or InventoryCategory(name=name)
            db.session.add(row); db.session.flush(); category_ids[name] = row.id
        for raw in data["inventory"]:
            payload = dict(raw); category = payload.pop("category", None)
            if category and "category_id" not in payload: payload["category_id"] = category_ids.get(category)
            row = db.session.scalar(select(InventoryItem).where(InventoryItem.name == payload.get("name"))) or InventoryItem(name="")
            _apply_item(row, payload); db.session.add(row)
        for raw in data["venues"]:
            row = db.session.scalar(select(VenueTemplate).where(VenueTemplate.name == raw.get("name"))) or VenueTemplate(name="", width_ft=0, height_ft=0)
            _apply_venue(row, raw); db.session.add(row)
        db.session.commit()
    except (ValueError, TypeError) as exc:
        db.session.rollback(); return jsonify(error=str(exc)), 400
    return jsonify(imported=True)
