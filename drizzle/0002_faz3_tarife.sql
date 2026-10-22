CREATE TYPE "public"."ref_case_source" AS ENUM('INDEPENDENT_MANUAL', 'OFFICIAL_EXAMPLE', 'HISTORICAL_JOB');--> statement-breakpoint
ALTER TYPE "public"."service_kind" ADD VALUE 'STANDBY_TUG';--> statement-breakpoint
CREATE TABLE "reference_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"tariff_version_id" text NOT NULL,
	"source" "ref_case_source" NOT NULL,
	"input" jsonb NOT NULL,
	"expected" numeric(14, 2) NOT NULL,
	"working" text NOT NULL,
	"prepared_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "port_calls" ADD COLUMN "is_liner_service" boolean;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "parent_version_id" text;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "prepared_by" text;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "submitted_by" text;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "change_note" text;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "rev" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_cases" ADD CONSTRAINT "reference_cases_tariff_version_id_tariff_versions_id_fk" FOREIGN KEY ("tariff_version_id") REFERENCES "public"."tariff_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ref_case_ver_code_uq" ON "reference_cases" USING btree ("tariff_version_id","code");