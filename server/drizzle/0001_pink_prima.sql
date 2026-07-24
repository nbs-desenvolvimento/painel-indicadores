CREATE TYPE "public"."direction" AS ENUM('higher_better', 'lower_better');--> statement-breakpoint
ALTER TABLE "indicators" ADD COLUMN "direction" "direction" DEFAULT 'higher_better' NOT NULL;