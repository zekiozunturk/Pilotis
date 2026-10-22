ALTER TYPE "public"."event_type" ADD VALUE 'WAIT_START';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'WAIT_END';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'RETURN_START';--> statement-breakpoint
ALTER TYPE "public"."event_type" ADD VALUE 'RETURN_END';--> statement-breakpoint
CREATE TABLE "asset_downtime" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"kind" text NOT NULL,
	"from" timestamp with time zone NOT NULL,
	"to" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "asset_meters" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"day" text NOT NULL,
	"engine_hours" numeric(6, 1),
	"fuel_liters" numeric(9, 1),
	"fuel_measured" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"category" text NOT NULL,
	"nature" text NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"operation_id" text,
	"asset_id" text,
	"team_key" text,
	"description" text,
	"allocation_basis" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"import_batch_id" text
);
--> statement-breakpoint
CREATE TABLE "deviations" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"category" text NOT NULL,
	"minutes" integer,
	"note" text,
	"responsibility_note" text,
	"recorded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"operation_id" text,
	"calc_result_id" text,
	"service_kind" text,
	"description" text NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'INVOICE' NOT NULL,
	"party_id" text NOT NULL,
	"issue_date" text NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"tax_amount" numeric(14, 2) NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"corrects_invoice_id" text,
	"disputed_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"dispute_note" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"import_batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "manual_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_line_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"share_pct" numeric(7, 4) NOT NULL,
	"reason" text NOT NULL,
	"approved_by" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participations" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"personnel_id" text,
	"asset_id" text,
	"role_on_task" text,
	"from" timestamp with time zone NOT NULL,
	"to" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'OFFICIAL' NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "payment_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"received_date" text NOT NULL,
	"currency" text DEFAULT 'TRY' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"import_batch_id" text
);
--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "planned_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operations" ADD COLUMN "priority" text DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "actual_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "actual_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "actual_source" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "approved_by_id" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "overtime_reason" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "origin" text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "asset_downtime" ADD CONSTRAINT "asset_downtime_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_meters" ADD CONSTRAINT "asset_meters_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deviations" ADD CONSTRAINT "deviations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_calc_result_id_calculation_results_id_fk" FOREIGN KEY ("calc_result_id") REFERENCES "public"."calculation_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_allocations" ADD CONSTRAINT "manual_allocations_invoice_line_id_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."invoice_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_matches" ADD CONSTRAINT "payment_matches_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meter_asset_day_uq" ON "asset_meters" USING btree ("asset_id","day");--> statement-breakpoint
CREATE INDEX "invline_op_idx" ON "invoice_lines" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "part_op_idx" ON "participations" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "part_person_idx" ON "participations" USING btree ("personnel_id","from");--> statement-breakpoint
CREATE INDEX "part_asset_idx" ON "participations" USING btree ("asset_id","from");