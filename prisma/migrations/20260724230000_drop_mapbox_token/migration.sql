-- Mapbox integration was replaced by OpenStreetMap/Leaflet (no API key
-- needed), so the per-organization Mapbox token field is no longer used.
ALTER TABLE "organizations" DROP COLUMN "mapboxToken";
