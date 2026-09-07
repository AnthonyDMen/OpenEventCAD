FROM node:22-alpine AS assets
WORKDIR /src
COPY package.json ./
RUN npm install --omit=dev

FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY app/templates ./app/templates
COPY app/routes.py app/models.py app/__init__.py ./app/
COPY app/static/css ./app/static/css
COPY app/static/js ./app/static/js
COPY app/static/data ./app/static/data
COPY app/static/vendor/bootstrap ./app/static/vendor/bootstrap
COPY app/static/vendor/fontawesome ./app/static/vendor/fontawesome
COPY app/static/vendor/webfonts ./app/static/vendor/webfonts
COPY wsgi.py ./
COPY scripts ./scripts
COPY --from=assets /src/node_modules/konva/konva.min.js ./app/static/vendor/konva.min.js
COPY --from=assets /src/node_modules/pdfjs-dist/build/pdf.min.js ./app/static/vendor/pdfjs/pdf.min.js
COPY --from=assets /src/node_modules/pdfjs-dist/build/pdf.worker.min.js ./app/static/vendor/pdfjs/pdf.worker.min.js
RUN useradd --system --create-home floorplanner && chown -R floorplanner:floorplanner /app
USER floorplanner
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "2", "wsgi:app"]
