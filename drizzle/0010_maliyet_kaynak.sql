ALTER TABLE "cost_entries" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "cost_entries" ADD CONSTRAINT "cost_entries_source_ref_unique" UNIQUE("source_ref");