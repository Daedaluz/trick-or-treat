-- Name to look up on the intercom / door phone to be buzzed in.
ALTER TABLE doors ADD COLUMN IF NOT EXISTS intercom_name TEXT NOT NULL DEFAULT '';
