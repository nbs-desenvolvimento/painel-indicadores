CREATE TYPE "public"."accumulationType" AS ENUM('mensal', 'anual');--> statement-breakpoint
ALTER TABLE "indicators" ADD COLUMN "accumulationType" "accumulationType" DEFAULT 'mensal' NOT NULL;