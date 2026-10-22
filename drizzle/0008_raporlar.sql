CREATE TABLE "report_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"frequency" text NOT NULL,
	"at" text NOT NULL,
	"weekday" integer,
	"recipients" jsonb NOT NULL,
	"format" text NOT NULL,
	"data_scope" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_result" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"scope" text DEFAULT 'PERSONAL' NOT NULL,
	"owner" text NOT NULL,
	"owner_role" text NOT NULL,
	"definition" jsonb NOT NULL,
	"filters" text,
	"snapshot" jsonb,
	"source_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;