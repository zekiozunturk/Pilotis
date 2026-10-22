CREATE TYPE "public"."accounting_status" AS ENUM('AWAITING_EXPORT', 'EXPORTED', 'REJECTED', 'INVOICED', 'RECONCILED');--> statement-breakpoint
CREATE TYPE "public"."accrual_status" AS ENUM('AWAITING_CALC', 'IN_REVIEW', 'APPROVED', 'DISPUTED', 'CORRECTED');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('AWAITING_DECLARATION', 'AWAITING_BILLING_PARTY', 'OPS_REVIEW', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('TUG', 'PILOT_BOAT', 'MOORING_BOAT', 'SURFACE_CLEANING_VESSEL', 'LAND_VEHICLE', 'EQUIPMENT');--> statement-breakpoint
CREATE TYPE "public"."billing_decision" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."cargo_condition" AS ENUM('LADEN', 'BALLAST', 'EMPTY_NOT_CLEANED', 'GAS_FREE', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."declaration_layer" AS ENUM('CUSTOMER_DECLARED', 'FIELD_VERIFIED', 'APPROVED_FINAL');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('TASK_ACCEPTED', 'TRANSIT_START', 'ARRIVED_SITE', 'DECLARATION_CHECKED', 'PILOT_BOARDED', 'TUG_ALONGSIDE', 'MOORING_START', 'SERVICE_START', 'PAUSE_START', 'PAUSE_END', 'SERVICE_END', 'PILOT_DISEMBARKED', 'INCIDENT', 'CANCEL_OR_INCOMPLETE');--> statement-breakpoint
CREATE TYPE "public"."facility_type" AS ENUM('SHIPYARD', 'QUAY', 'ANCHORAGE', 'PILOT_STATION', 'COASTAL_SAFETY_BASE', 'OPERATOR_BASE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."notify_status" AS ENUM('PREPARING', 'READY', 'AWAITING_SEND', 'SENT', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."op_status" AS ENUM('READY', 'TRANSIT', 'ON_SITE', 'STARTED', 'PAUSED', 'COMPLETED', 'PARTIAL', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."party_kind" AS ENUM('COMPANY', 'PERSON', 'AUTHORITY');--> statement-breakpoint
CREATE TYPE "public"."party_role_type" AS ENUM('MINISTRY_DGM', 'HARBOUR_MASTER', 'COASTAL_SAFETY', 'VTS', 'COAST_GUARD', 'SERVICE_PROVIDER', 'AGENT', 'OWNER', 'OPERATOR_MANAGER', 'CHARTERER', 'MASTER', 'SHIPYARD', 'TERMINAL', 'BILLING_PARTY', 'PAYMENT_GUARANTOR', 'SUBCONTRACTOR', 'INSURER_PI_SURVEYOR', 'EMERGENCY_AUTHORITY');--> statement-breakpoint
CREATE TYPE "public"."planning_status" AS ENUM('AWAITING_RESOURCE', 'TENTATIVE', 'FIRM', 'REPLANNING');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'SUBMITTED', 'INFO_MISSING', 'IN_REVISION', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."rule_label" AS ENUM('REGULATION', 'CONTRACT', 'OPERATING_PRACTICE', 'INTL_GOOD_PRACTICE');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('DRAFT', 'SOURCE_FOUND', 'EXPERT_REVIEW', 'APPROVED', 'IN_FORCE', 'REPEALED');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('PILOTAGE', 'TOWAGE', 'MOORING', 'UNMOORING', 'LINE_HANDLING', 'CHARTER', 'SALVAGE_REVIEW', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."signature_level" AS ENUM('QUALIFIED_E_SIGNATURE', 'DRAWN', 'OTP_ACCOUNT', 'WET_UPLOADED', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."tariff_family_kind" AS ENUM('MINISTRY', 'KEGM', 'CHARTER', 'SALVAGE', 'SPECIAL_CONTRACT');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SYSTEM_ADMIN', 'BUSINESS_MANAGER', 'OPERATIONS_MANAGER', 'PLANNER', 'SHORE_OPS', 'PILOT', 'TUG_MASTER', 'CREW', 'ACCOUNTING', 'TARIFF_OFFICER', 'CUSTOMER', 'BILLING_PARTY', 'AUDITOR');--> statement-breakpoint
CREATE TYPE "public"."verification" AS ENUM('UNVERIFIED', 'SOURCE_FOUND', 'VERIFIED');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"asset_id" text,
	"personnel_id" text,
	"role_on_task" text,
	"from" timestamp with time zone NOT NULL,
	"to" timestamp with time zone NOT NULL,
	"firm" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "billing_approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"billing_party_id" text NOT NULL,
	"tax_verified" boolean DEFAULT false NOT NULL,
	"authorized_person" text,
	"decision" "billing_decision" DEFAULT 'PENDING' NOT NULL,
	"decided_at" timestamp with time zone,
	"approved_doc_version_id" text,
	"note" text,
	CONSTRAINT "billing_approvals_operation_id_unique" UNIQUE("operation_id")
);
--> statement-breakpoint
CREATE TABLE "business_rules" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"label" "rule_label" NOT NULL,
	"status" "rule_status" DEFAULT 'DRAFT' NOT NULL,
	"basis" text,
	"modules" text[] DEFAULT '{}' NOT NULL,
	"source_id" text,
	"supersedes" text,
	"test_refs" text[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calculation_results" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"kind" text NOT NULL,
	"tariff_version_id" text NOT NULL,
	"input_hash" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"breakdown" jsonb NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"currency" text NOT NULL,
	"production_eligible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"personnel_id" text,
	"asset_id" text,
	"name" text NOT NULL,
	"number" text,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"doc_type" text NOT NULL,
	"version" integer NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text,
	"signature" "signature_level" DEFAULT 'NONE' NOT NULL,
	"signed_by" text,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "facility_type" NOT NULL,
	"owner_party_id" text,
	"lat" numeric(9, 6),
	"lon" numeric(9, 6),
	"coord_source" text,
	"verification" "verification" DEFAULT 'UNVERIFIED' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "asset_type" NOT NULL,
	"imo" text,
	"mmsi" text,
	"call_sign" text,
	"bollard_pull_t" numeric(6, 2),
	"loa" numeric(6, 2),
	"engine_power_kw" numeric(8, 1),
	"build_year" integer,
	"photo_url" text,
	"source_url" text,
	"spec_verified" boolean DEFAULT false NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"restrictions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "op_seq" (
	"year" integer PRIMARY KEY NOT NULL,
	"last" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_issues" (
	"code" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"owner" text NOT NULL,
	"document" text NOT NULL,
	"target" text NOT NULL,
	"module" text NOT NULL,
	"closed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_types" (
	"code" text PRIMARY KEY NOT NULL,
	"name_tr" text NOT NULL,
	"name_en" text NOT NULL,
	"scope" text,
	"start_event" text,
	"end_event" text,
	"required_docs" text[] DEFAULT '{}' NOT NULL,
	"service_kinds" "service_kind"[] DEFAULT '{}' NOT NULL,
	"tariff_families" text[] DEFAULT '{}' NOT NULL,
	"unit" text,
	"notifiable" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operations" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"port_call_id" text NOT NULL,
	"type_code" text NOT NULL,
	"from_facility_id" text,
	"to_facility_id" text,
	"requested_at" timestamp with time zone,
	"planned_start" timestamp with time zone,
	"is_authority_task" boolean DEFAULT false NOT NULL,
	"request_status" "request_status" DEFAULT 'DRAFT' NOT NULL,
	"approval_status" "approval_status" DEFAULT 'AWAITING_DECLARATION' NOT NULL,
	"planning_status" "planning_status" DEFAULT 'AWAITING_RESOURCE' NOT NULL,
	"op_status" "op_status" DEFAULT 'READY' NOT NULL,
	"accrual_status" "accrual_status" DEFAULT 'AWAITING_CALC' NOT NULL,
	"accounting_status" "accounting_status" DEFAULT 'AWAITING_EXPORT' NOT NULL,
	"notify_status" "notify_status" DEFAULT 'PREPARING' NOT NULL,
	"requester_party_id" text,
	"billing_party_id" text,
	"guarantor_party_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operations_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "party_kind" NOT NULL,
	"legal_name" text NOT NULL,
	"short_name" text,
	"tax_office" text,
	"tax_number" text,
	"eta_code" text,
	"address" text,
	"city" text,
	"country" text DEFAULT 'TR',
	"phone" text,
	"email" text,
	"website" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parties_tax_number_unique" UNIQUE("tax_number"),
	CONSTRAINT "parties_eta_code_unique" UNIQUE("eta_code")
);
--> statement-breakpoint
CREATE TABLE "party_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"party_id" text NOT NULL,
	"role" "party_role_type" NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "personnel" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"title" text NOT NULL,
	"unit" text,
	"manager_id" text,
	"work_phone" text,
	"work_email" text,
	"photo_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personnel_sensitive" (
	"personnel_id" text PRIMARY KEY NOT NULL,
	"blood_type" text,
	"legal_basis" text,
	"consent_doc_id" text
);
--> statement-breakpoint
CREATE TABLE "port_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"vessel_id" text NOT NULL,
	"agent_party_id" text,
	"last_port" text,
	"next_port" text,
	"is_cabotage" boolean,
	"cargo_condition" "cargo_condition" DEFAULT 'UNKNOWN' NOT NULL,
	"cargo_type" text,
	"dg_class" text,
	"un_number" text,
	"gas_free_cert_at" timestamp with time zone,
	"repair_purpose" text,
	"eta" timestamp with time zone,
	"etd" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "port_calls_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "regulation_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"issuer" text NOT NULL,
	"doc_number" text,
	"official_url" text,
	"archive_hash" text,
	"published_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"checked_by" text,
	"checked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"kind" "service_kind" NOT NULL,
	"allocated_units" integer,
	"billable_units" integer,
	"master_written_request_doc_id" text,
	"status" "op_status" DEFAULT 'READY' NOT NULL,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"version" integer NOT NULL,
	"layer" "declaration_layer" NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_families" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "tariff_family_kind" NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"family_id" text NOT NULL,
	"label" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"status" "rule_status" DEFAULT 'DRAFT' NOT NULL,
	"definition" jsonb NOT NULL,
	"source_rule_codes" text[] DEFAULT '{}' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_id" text NOT NULL,
	"service_kind" "service_kind",
	"asset_id" text,
	"type" "event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"device_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"client_event_id" text,
	"reason_code" text,
	"responsible" text,
	"note" text,
	"supersedes_id" text,
	"created_by_id" text,
	CONSTRAINT "timeline_events_client_event_id_unique" UNIQUE("client_event_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"roles" "user_role"[] DEFAULT '{}' NOT NULL,
	"party_id" text,
	"personnel_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_personnel_id_unique" UNIQUE("personnel_id")
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" text PRIMARY KEY NOT NULL,
	"imo" text,
	"alt_official_id" text,
	"mmsi" text,
	"call_sign" text,
	"name" text NOT NULL,
	"former_names" text[] DEFAULT '{}' NOT NULL,
	"flag" text,
	"port_of_registry" text,
	"vessel_type" text,
	"gt" numeric(12, 2),
	"nt" numeric(12, 2),
	"dwt" numeric(12, 2),
	"loa" numeric(8, 2),
	"beam" numeric(8, 2),
	"draft" numeric(6, 2),
	"propulsion" text,
	"thrusters" text,
	"restrictions" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vessels_imo_unique" UNIQUE("imo")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_approvals" ADD CONSTRAINT "billing_approvals_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_approvals" ADD CONSTRAINT "billing_approvals_billing_party_id_parties_id_fk" FOREIGN KEY ("billing_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_source_id_regulation_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."regulation_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculation_results" ADD CONSTRAINT "calculation_results_tariff_version_id_tariff_versions_id_fk" FOREIGN KEY ("tariff_version_id") REFERENCES "public"."tariff_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_owner_party_id_parties_id_fk" FOREIGN KEY ("owner_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_port_call_id_port_calls_id_fk" FOREIGN KEY ("port_call_id") REFERENCES "public"."port_calls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_type_code_operation_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."operation_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_from_facility_id_facilities_id_fk" FOREIGN KEY ("from_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_to_facility_id_facilities_id_fk" FOREIGN KEY ("to_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_requester_party_id_parties_id_fk" FOREIGN KEY ("requester_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_billing_party_id_parties_id_fk" FOREIGN KEY ("billing_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operations" ADD CONSTRAINT "operations_guarantor_party_id_parties_id_fk" FOREIGN KEY ("guarantor_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_roles" ADD CONSTRAINT "party_roles_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personnel_sensitive" ADD CONSTRAINT "personnel_sensitive_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "port_calls" ADD CONSTRAINT "port_calls_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "port_calls" ADD CONSTRAINT "port_calls_agent_party_id_parties_id_fk" FOREIGN KEY ("agent_party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_lines" ADD CONSTRAINT "service_lines_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_versions" ADD CONSTRAINT "tariff_versions_family_id_tariff_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."tariff_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_operation_id_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_asset_id_fleet_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fleet_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_personnel_id_personnel_id_fk" FOREIGN KEY ("personnel_id") REFERENCES "public"."personnel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_op_type_ver_uq" ON "document_versions" USING btree ("operation_id","doc_type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "party_role_uq" ON "party_roles" USING btree ("party_id","role","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "sr_op_ver_uq" ON "service_requests" USING btree ("operation_id","version");--> statement-breakpoint
CREATE INDEX "te_op_idx" ON "timeline_events" USING btree ("operation_id","occurred_at");