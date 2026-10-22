ALTER TABLE "fleet_assets" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "fleet_assets" ADD COLUMN "site_name" text;--> statement-breakpoint
ALTER TABLE "fleet_assets" ADD CONSTRAINT "fleet_assets_code_unique" UNIQUE("code");