CREATE TABLE "user_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"areaId" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_area" ON "user_areas" USING btree ("userId","areaId");