ALTER TABLE "fleet_assets" ADD COLUMN "photo_credit" text;--> statement-breakpoint
ALTER TABLE "fleet_assets" ADD COLUMN "photo_illustrative" boolean DEFAULT false NOT NULL;