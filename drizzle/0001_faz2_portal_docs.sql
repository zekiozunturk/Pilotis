CREATE TYPE "public"."cart_status" AS ENUM('OPEN', 'SUBMITTED', 'ABANDONED');--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"cart_id" text NOT NULL,
	"vessel_id" text NOT NULL,
	"type_code" text NOT NULL,
	"from_facility_id" text,
	"to_facility_id" text,
	"planned_start" timestamp with time zone NOT NULL,
	"declaration" jsonb NOT NULL,
	"billing_party_id" text,
	"estimate" jsonb,
	"operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"status" "cart_status" DEFAULT 'OPEN' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"document_version_id" text NOT NULL,
	"party_id" text,
	"approver_name" text NOT NULL,
	"approver_title" text,
	"level" "signature_level" NOT NULL,
	"decision" "billing_decision" NOT NULL,
	"signature_image_key" text,
	"user_agent" text,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "content_type" text DEFAULT 'application/pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "source_snapshot_hash" text;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "origin" text DEFAULT 'GENERATED' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_versions" ADD COLUMN "generated_by" text;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_type_code_operation_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."operation_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_from_facility_id_facilities_id_fk" FOREIGN KEY ("from_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_to_facility_id_facilities_id_fk" FOREIGN KEY ("to_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_billing_party_id_parties_id_fk" FOREIGN KEY ("billing_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approvals" ADD CONSTRAINT "document_approvals_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;