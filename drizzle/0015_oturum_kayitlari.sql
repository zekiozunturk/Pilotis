CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"log_id" text NOT NULL,
	"user_id" text,
	"path" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"user_id" text,
	"username" text NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"fail_reason" text,
	"login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logout_at" timestamp with time zone,
	"end_reason" text,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"last_path" text,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_log_id_session_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."session_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pv_log_idx" ON "page_views" USING btree ("log_id","at");--> statement-breakpoint
CREATE INDEX "slog_user_idx" ON "session_logs" USING btree ("user_id","login_at");--> statement-breakpoint
CREATE INDEX "slog_login_idx" ON "session_logs" USING btree ("login_at");--> statement-breakpoint
CREATE INDEX "slog_sess_idx" ON "session_logs" USING btree ("session_id");