-- Apartment / floor / door label for buildings with several households.
ALTER TABLE doors ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT '';
