import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    database_url = os.environ.get("DATABASE_URL")
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=database_url or "sqlite:///floorplanner.db",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)
    # Only the fallback local SQLite database needs Flask's instance folder.
    # Containers and tests pass an explicit database location and keep the
    # repository root free of an empty runtime directory.
    if not database_url and not test_config:
        os.makedirs(app.instance_path, exist_ok=True)
    db.init_app(app)

    from .routes import bp
    app.register_blueprint(bp)
    with app.app_context():
        from . import models  # noqa: F401
        db.create_all()
    return app
