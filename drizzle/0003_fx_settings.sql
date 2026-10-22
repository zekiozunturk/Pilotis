CREATE TYPE "public"."fx_source" AS ENUM('TCMB', 'MANUAL');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"currency" text NOT NULL,
	"bulletin_date" text NOT NULL,
	"bulletin_no" text,
	"forex_buying" numeric(14, 6),
	"forex_selling" numeric(14, 6),
	"source" "fx_source" NOT NULL,
	"entered_by" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fx_cur_date_src_uq" ON "exchange_rates" USING btree ("currency","bulletin_date","source");