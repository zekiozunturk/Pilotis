CREATE TYPE "public"."shift_category" AS ENUM('WORK', 'STANDBY', 'TRAINING', 'LEAVE');--> statement-breakpoint
CREATE TYPE "public"."shift_status" AS ENUM('PLANNED', 'CONFIRMED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"personnel_id" text NOT NULL,
	"category" "shift_category" NOT NULL,
	"status" "shift_status" DEFAULT 'PLANNED' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"asset_id" text,
	"operation_id" text,
	"note" text,
	"exception" jsonb,
	"created_by" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"number" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"tr" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"definition" text NOT NULL,
	"source" text,
	"confused_with" text,
	"translations" jsonb NOT NULL,
	"status" text DEFAULT 'TASLAK' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "work_profile" text DEFAULT 'STCW_MLC' NOT NULL;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "crew_role" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "home_asset_id" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shift_person_time_idx" ON "shifts" USING btree ("personnel_id","start_at");