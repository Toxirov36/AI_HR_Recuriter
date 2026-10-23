-- Optional map link (and coordinates read from it) for offline interviews.
ALTER TABLE "Interview" ADD COLUMN "mapUrl" TEXT, ADD COLUMN "mapLat" DOUBLE PRECISION, ADD COLUMN "mapLng" DOUBLE PRECISION;
