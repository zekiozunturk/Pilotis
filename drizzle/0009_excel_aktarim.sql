CREATE TABLE "import_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"entity" text NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"storage_key" text NOT NULL,
	"sheet" text,
	"header_row" integer,
	"mapping" jsonb,
	"options" jsonb,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"summary" jsonb,
	"progress" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"approved_by" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_batches_no_unique" UNIQUE("no")
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"profile" text,
	"mapping" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"row_no" integer NOT NULL,
	"action" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"errors" jsonb,
	"warnings" jsonb,
	"applied_at" timestamp with time zone,
	"revert_note" text
);
--> statement-breakpoint
ALTER TABLE "facilities" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "personnel" ADD COLUMN "staff_no" text;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "impmap_uq" ON "import_mappings" USING btree ("entity","name");--> statement-breakpoint
CREATE INDEX "improw_batch_idx" ON "import_rows" USING btree ("batch_id","row_no");--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "personnel" ADD CONSTRAINT "personnel_staff_no_unique" UNIQUE("staff_no");