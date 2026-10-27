CREATE TABLE "asset_positions" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lon" numeric(9, 6) NOT NULL,
	"accuracy_m" integer,
	"speed_kn" numeric(5, 1),
	"heading" integer,
	"source" text DEFAULT 'DEVICE' NOT NULL,
	"user_id" text,
	"personnel_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "home_variant" text;--> statement-breakpoint
ALTER TABLE "asset_positions" ADD CONSTRAINT "asset_positions_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_positions" ADD CONSTRAINT "asset_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_positions" ADD CONSTRAINT "asset_positions_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apos_asset_at_idx" ON "asset_positions" USING btree ("asset_id","at");