import pytest
from app import create_app, db
from app import routes


@pytest.fixture()
def client(tmp_path):
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path}/test.db"})
    with app.app_context(): db.drop_all(); db.create_all()
    return app.test_client()


def test_catalog_validation_and_export(client):
    category = client.post("/api/categories", json={"name": "Tables"}).get_json()
    item = client.post("/api/inventory", json={"name": "6 ft table", "category_id": category["id"], "quantity": 20, "shape": "rectangle", "width_ft": 6, "height_ft": 2.5})
    assert item.status_code == 201
    assert client.post("/api/venues", json={"name": "Main tent", "type": "tent", "width_ft": 20, "height_ft": 40}).status_code == 201
    exported = client.get("/api/catalog/export").get_json()
    assert exported["inventory"][0]["category"] == "Tables"


def test_catalog_is_public_and_rejects_invalid_shapes(client):
    response = client.post("/api/inventory", json={"name": "Bad", "shape": "polygon", "width_ft": 1})
    assert response.status_code == 400
    assert response.get_json()["error"] == "shape is invalid"


def test_reference_map_geocode_and_usgs_export(client, monkeypatch):
    requested_urls = []

    def fake_json(url):
        requested_urls.append(url)
        if "geocoder" in url:
            return {"result": {"addressMatches": [{"matchedAddress": "123 MAIN ST, TEST, FL, 33400", "coordinates": {"x": -80.05, "y": 26.69}}]}}
        return {"href": "https://example.test/naip.jpg", "width": 1200, "height": 1200, "extent": {"xmin": 0, "ymin": 0, "xmax": 120, "ymax": 120}}

    monkeypatch.setattr(routes, "_remote_json", fake_json)
    monkeypatch.setattr(routes, "_remote_bytes", lambda url: (b"jpeg-data", "image/jpeg"))
    located = client.get("/api/reference-map/geocode?address=123+Main+St,+Test,+FL").get_json()
    assert located["lon"] == -80.05
    aerial = client.get("/api/reference-map/usgs-naip?lon=-80.05&lat=26.69&width_ft=300&height_ft=300")
    assert aerial.status_code == 200
    data = aerial.get_json()
    assert data["image_data_url"].startswith("data:image/jpeg;base64,")
    assert data["pixels_per_foot"] > 0
    assert data["coverage_ft"] == {"width": 300.0, "height": 300.0}
    preview = client.get("/api/reference-map/usgs-naip?lon=-80.05&lat=26.69&width_ft=3000&height_ft=2500&preview=1")
    assert preview.status_code == 200
    assert preview.get_json()["preview"] is True
    assert any("size=760%2C633" in url for url in requested_urls)


def test_reference_map_validates_inputs(client):
    assert client.get("/api/reference-map/geocode?address=x").status_code == 400
    assert client.get("/api/reference-map/usgs-naip?lon=0&lat=0&width_ft=10&height_ft=10").status_code == 400
