CREATE TABLE "user_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"companyId" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_company" ON "user_companies" USING btree ("userId","companyId");